// supabase/functions/transcribe-audio/index.ts
//
// Receives raw recorded audio from the browser, uploads it to AssemblyAI,
// and polls until a real transcript is ready. No document/company lookups
// needed here — just confirms the caller is an authenticated user of the
// app before spending AssemblyAI credits on their behalf.

const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const audioBuffer = await req.arrayBuffer();
    if (audioBuffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: "No audio received" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Step 1: upload the raw audio bytes to AssemblyAI's own storage.
    const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: { authorization: ASSEMBLYAI_API_KEY },
      body: audioBuffer,
    });
    if (!uploadRes.ok) {
      const body = await uploadRes.text();
      throw new Error(`Upload failed: ${uploadRes.status} ${body}`);
    }
    const { upload_url } = await uploadRes.json();

    // Step 2: submit the transcription job. speech_models is required by
    // AssemblyAI's current API — there is no default.
    const submitRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { authorization: ASSEMBLYAI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: upload_url,
        speech_models: ["universal-3-pro", "universal-2"],
      }),
    });
    if (!submitRes.ok) {
      const body = await submitRes.text();
      throw new Error(`Submit failed: ${submitRes.status} ${body}`);
    }
    const { id } = await submitRes.json();

    // Step 3: poll until done. Short voice notes typically finish in a few
    // seconds; cap at ~40s so the request doesn't hang indefinitely.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { authorization: ASSEMBLYAI_API_KEY },
      });
      const poll = await pollRes.json();

      if (poll.status === "completed") {
        return new Response(JSON.stringify({ text: poll.text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (poll.status === "error") {
        return new Response(JSON.stringify({ error: poll.error }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    return new Response(JSON.stringify({ error: "Transcription timed out" }), {
      status: 504,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
