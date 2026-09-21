// supabase/functions/publish-paper/index.ts
//
// Called when an admin-level user approves a submitted paper. Embeds the
// paper's real content (title + abstract + findings + conclusion) so it
// becomes searchable knowledge alongside documents and notes, then flips
// its status to published via the narrow publish_paper() function (which
// itself re-checks admin status server-side).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: corsHeaders });
    }

    const { paper_id } = await req.json();
    if (!paper_id) {
      return new Response(JSON.stringify({ error: "paper_id required" }), { status: 400, headers: corsHeaders });
    }

    const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: paper, error: fetchError } = await callerClient
      .from("research_papers")
      .select("id, title, abstract, findings, conclusion, status")
      .eq("id", paper_id)
      .single();

    if (fetchError || !paper) {
      return new Response(JSON.stringify({ error: "Paper not found or not accessible" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (paper.status !== "submitted") {
      return new Response(JSON.stringify({ error: "Only submitted papers can be published" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const text = [paper.title, paper.abstract, paper.findings, paper.conclusion]
      .filter(Boolean)
      .join("\n\n");
    const embedding = await embed(text);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await adminClient.from("research_papers").update({ embedding }).eq("id", paper_id);

    const { error: publishError } = await callerClient.rpc("publish_paper", { paper_id });
    if (publishError) {
      return new Response(JSON.stringify({ error: publishError.message }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
