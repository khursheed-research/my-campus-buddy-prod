// supabase/functions/chat/index.ts
//
// The real "AI Workspace": answers questions using only the company's own
// uploaded documents and captured notes. Embeds the question, retrieves the
// most relevant real chunks/interactions via the match_* RPCs (which are
// already company-scoped through current_company_id() inside Postgres), and
// asks Gemini to answer using only that retrieved context.

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

async function generateAnswer(question: string, context: string, hasAnyContext: boolean) {
  const prompt = hasAnyContext
    ? `You are an internal knowledge assistant for a company. Answer the question using ONLY the context below, which comes from the company's real uploaded documents and captured notes. If the context doesn't actually answer the question, say plainly that you don't have that information yet in the system — never guess or use outside knowledge.

Context:
${context}

Question: ${question}`
    : `You are an internal knowledge assistant for a company. No relevant documents or notes were found in the system for this question. Tell the user plainly that nothing relevant has been captured yet, and suggest they upload a document or add a note about this topic. Question: ${question}`;

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
  return data.candidates[0].content.parts[0].text as string;
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

    const { message, department } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Scoped to the caller's own JWT: match_document_chunks and
    // match_interactions are SECURITY DEFINER functions that internally
    // filter by current_company_id(), so this client's identity is what
    // keeps results scoped to the caller's own company.
    const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const queryEmbedding = await embed(message);

    const [{ data: docChunks }, { data: interactions }] = department
      ? await Promise.all([
          callerClient.rpc("match_document_chunks_filtered", {
            query_embedding: queryEmbedding,
            match_count: 5,
            filter_department: department,
          }),
          callerClient.rpc("match_interactions_filtered", {
            query_embedding: queryEmbedding,
            match_count: 5,
            filter_department: department,
          }),
        ])
      : await Promise.all([
          callerClient.rpc("match_document_chunks", { query_embedding: queryEmbedding, match_count: 5 }),
          callerClient.rpc("match_interactions", { query_embedding: queryEmbedding, match_count: 5 }),
        ]);

    const sources: { type: string; id: string; snippet: string; similarity: number }[] = [];
    const contextParts: string[] = [];

    (docChunks ?? []).forEach((c: { id: string; content: string; similarity: number }) => {
      if (c.similarity < 0.3) return; // filter out weak/irrelevant matches
      contextParts.push(`[Document excerpt]\n${c.content}`);
      sources.push({ type: "document", id: c.id, snippet: c.content.slice(0, 150), similarity: c.similarity });
    });

    (interactions ?? []).forEach(
      (i: { id: string; summary: string | null; raw_content: string; similarity: number }) => {
        if (i.similarity < 0.3) return;
        contextParts.push(`[Note]\n${i.summary ?? i.raw_content}`);
        sources.push({
          type: "interaction",
          id: i.id,
          snippet: (i.summary ?? i.raw_content).slice(0, 150),
          similarity: i.similarity,
        });
      }
    );

    const context = contextParts.join("\n\n");
    const answer = await generateAnswer(message, context, contextParts.length > 0);

    return new Response(JSON.stringify({ answer, sources }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
