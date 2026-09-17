import { NextResponse } from "next/server";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY!;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
  const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: ASSEMBLYAI_API_KEY },
    body: audioBuffer,
  });
  if (!uploadRes.ok) throw new Error(`AssemblyAI upload failed: ${uploadRes.status}`);
  const { upload_url } = await uploadRes.json();

  const submitRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { authorization: ASSEMBLYAI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, speech_models: ["universal-3-pro", "universal-2"] }),
  });
  if (!submitRes.ok) throw new Error(`AssemblyAI submit failed: ${submitRes.status}`);
  const { id } = await submitRes.json();

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: ASSEMBLYAI_API_KEY },
    });
    const poll = await pollRes.json();
    if (poll.status === "completed") return poll.text;
    if (poll.status === "error") throw new Error(`AssemblyAI error: ${poll.error}`);
  }
  throw new Error("Transcription timed out");
}

async function extractStructured(text: string) {
  const prompt = `You are analyzing a transcribed phone call for a company's internal knowledge system. Extract:
- summary: 1-2 plain sentences capturing what happened or was decided
- sentiment: exactly one of "positive", "neutral", "negative"
- next_step: a short actionable next step if implied, otherwise null
- is_decision: true if an actual decision was made/committed to, otherwise false
- topics: up to 5 short lowercase topic/entity strings mentioned

Call transcript:
"""
${text}
"""`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
              next_step: { type: "string", nullable: true },
              is_decision: { type: "boolean" },
              topics: { type: "array", items: { type: "string" }, maxItems: 5 },
            },
            required: ["summary", "sentiment", "is_decision", "topics"],
          },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini extraction failed: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini embedding failed: ${res.status}`);
  const data = await res.json();
  return data.embedding.values;
}

export async function POST(request: Request) {
  const authToken = TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = request.url;
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => (params[key] = value.toString()));

  if (authToken) {
    const valid = twilio.validateRequest(authToken, signature, url, params);
    if (!valid) {
      return new NextResponse("Invalid signature", { status: 403 });
    }
  }

  // Only act on the final, ready-to-fetch recording.
  if (params.RecordingStatus !== "completed") {
    return new NextResponse("ok");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Idempotency: Twilio may retry this webhook. Never process the same
  // recording twice.
  const { data: existing } = await admin
    .from("interactions")
    .select("id")
    .eq("external_call_sid", params.CallSid)
    .maybeSingle();
  if (existing) {
    return new NextResponse("already processed");
  }

  // Figure out which company this call belongs to via the number that was
  // dialed (the "To" number is the real Twilio number registered to a
  // company in twilio_numbers).
  const { data: numberRow } = await admin
    .from("twilio_numbers")
    .select("company_id, department")
    .eq("phone_number", params.To)
    .maybeSingle();

  if (!numberRow) {
    // Unregistered number — nothing we can attribute this call to yet.
    return new NextResponse("no matching company for this number");
  }

  try {
    const recordingRes = await fetch(`${params.RecordingUrl}.mp3`, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
      },
    });
    if (!recordingRes.ok) throw new Error(`Could not fetch recording: ${recordingRes.status}`);
    const audioBuffer = await recordingRes.arrayBuffer();

    const transcript = await transcribeAudio(audioBuffer);
    if (!transcript || !transcript.trim()) {
      return new NextResponse("no speech detected");
    }

    const [extracted, embedding] = await Promise.all([extractStructured(transcript), embed(transcript)]);

    await admin.from("interactions").insert({
      company_id: numberRow.company_id,
      department: numberRow.department,
      type: "call",
      source: "call_recording",
      raw_content: transcript,
      summary: extracted.summary,
      sentiment: extracted.sentiment,
      next_step: extracted.next_step ?? null,
      extracted_json: extracted,
      embedding,
      is_decision: extracted.is_decision ?? false,
      topics: extracted.topics ?? [],
      status: "processed",
      external_call_sid: params.CallSid,
      recording_url: params.RecordingUrl,
    });

    return new NextResponse("ok");
  } catch (err) {
    console.error("Call processing failed:", err);
    return new NextResponse("processing failed", { status: 500 });
  }
}
