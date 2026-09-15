// supabase/functions/process-interaction/index.ts
//
// Called right after a note/interaction is captured. Uses Gemini to extract
// a summary, sentiment, and suggested next step, and embeds the raw content
// so it becomes searchable alongside uploaded documents (via
// match_interactions). Same auth pattern as process-document: the caller's
// own JWT confirms they can see this interaction, then a service-role
// client does the actual writes.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function extractStructured(text: string) {
  const prompt = `You are analyzing a short work note from a company's internal knowledge system. Extract:
- summary: 1-2 plain sentences capturing what happened or was decided
- sentiment: exactly one of "positive", "neutral", "negative"
- next_step: a short actionable next step if one is implied, otherwise null
- is_decision: true if this note describes an actual decision being made or committed to (not just a discussion or observation), otherwise false
- topics: an array of up to 5 short topic/entity strings mentioned (people, companies, products, subjects) — lowercase, 1-3 words each

Note:
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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini generation failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  const jsonText = data.candidates[0].content.parts[0].text;
  return JSON.parse(jsonText);
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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embedding failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

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

    const { interaction_id } = await req.json();
    if (!interaction_id) {
      return new Response(JSON.stringify({ error: "interaction_id required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: interaction, error: fetchError } = await callerClient
      .from("interactions")
      .select("id, raw_content")
      .eq("id", interaction_id)
      .single();

    if (fetchError || !interaction || !interaction.raw_content) {
      return new Response(JSON.stringify({ error: "Interaction not found or not accessible" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await adminClient.from("interactions").update({ status: "processing" }).eq("id", interaction_id);

    const [extracted, embedding] = await Promise.all([
      extractStructured(interaction.raw_content),
      embed(interaction.raw_content),
    ]);

    const { error: updateError } = await adminClient
      .from("interactions")
      .update({
        summary: extracted.summary,
        sentiment: extracted.sentiment,
        next_step: extracted.next_step ?? null,
        extracted_json: extracted,
        embedding,
        is_decision: extracted.is_decision ?? false,
        topics: extracted.topics ?? [],
        status: "processed",
      })
      .eq("id", interaction_id);

    if (updateError) {
      await adminClient.from("interactions").update({ status: "error" }).eq("id", interaction_id);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
