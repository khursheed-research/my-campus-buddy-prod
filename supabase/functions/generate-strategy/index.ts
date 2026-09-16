// supabase/functions/generate-strategy/index.ts
//
// Takes a situation the user describes, retrieves relevant real context from
// their company's own documents and past interactions (same retrieval as
// chat), and asks Gemini for a recommendation grounded in that context. If
// there isn't enough real history, it says so honestly rather than
// fabricating company-specific advice.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
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

    const { strategy_id } = await req.json();
    if (!strategy_id) {
      return new Response(JSON.stringify({ error: "strategy_id required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: strategy, error: fetchError } = await callerClient
      .from("strategies")
      .select("id, situation")
      .eq("id", strategy_id)
      .single();

    if (fetchError || !strategy) {
      return new Response(JSON.stringify({ error: "Strategy not found or not accessible" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const queryEmbedding = await embed(strategy.situation);

    const [{ data: docChunks }, { data: interactions }] = await Promise.all([
      callerClient.rpc("match_document_chunks", { query_embedding: queryEmbedding, match_count: 5 }),
      callerClient.rpc("match_interactions", { query_embedding: queryEmbedding, match_count: 5 }),
    ]);

    const contextParts: string[] = [];
    (docChunks ?? []).forEach((c: { content: string; similarity: number }) => {
      if (c.similarity < 0.3) return;
      contextParts.push(`[Document excerpt]\n${c.content}`);
    });
    (interactions ?? []).forEach((i: { summary: string | null; raw_content: string; similarity: number }) => {
      if (i.similarity < 0.3) return;
      contextParts.push(`[Past note/decision]\n${i.summary ?? i.raw_content}`);
    });

    const hasContext = contextParts.length > 0;
    const prompt = hasContext
      ? `You are a strategy advisor for a company. A team member is facing this situation:\n\n"${strategy.situation}"\n\nHere is real, relevant context from the company's own documents and past decisions:\n\n${contextParts.join("\n\n")}\n\nGive a clear, actionable recommendation grounded specifically in this context. Reference the relevant context directly where it applies. If the context only partially applies, say so.`
      : `You are a strategy advisor for a company. A team member is facing this situation:\n\n"${strategy.situation}"\n\nNo relevant company history or documents were found for this situation. Say so plainly first, then offer general best-practice guidance — clearly labeled as general advice, not based on this company's specific history.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) throw new Error(`Generation failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const recommendation = data.candidates[0].content.parts[0].text;

    const { error: updateError } = await callerClient
      .from("strategies")
      .update({ recommendation, status: "generated" })
      .eq("id", strategy_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ recommendation, groundedInRealData: hasContext }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
