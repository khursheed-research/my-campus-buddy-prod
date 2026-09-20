// supabase/functions/process-document/index.ts
//
// Called by the frontend right after a file finishes uploading. Downloads
// the real file from Storage, extracts real text from it, splits it into
// chunks, embeds each chunk with Gemini, and stores the embeddings — this
// is the actual pattern-learning substrate: semantic search across a
// company's real documents.

import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.11.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const CHUNK_SIZE = 1200; // characters
const CHUNK_OVERLAP = 150;
const EMBED_BATCH_SIZE = 20;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > 0);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
          outputDimensionality: 768,
        })),
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embedding request failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.embeddings.map((e: { values: number[] }) => e.values);
}

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

    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Client scoped to the caller's own JWT: used only to confirm they can
    // actually see this document (RLS enforces company scoping here).
    const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: doc, error: docError } = await callerClient
      .from("documents")
      .select("id, company_id, storage_path, file_name, mime_type, department")
      .eq("id", document_id)
      .single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found or not accessible" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Service-role client for the actual work: downloading the file and
    // writing embeddings, both of which are intentionally outside RLS reach
    // for regular authenticated users.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await adminClient.from("documents").update({ status: "processing" }).eq("id", document_id);
    // Clear any prior chunks first, so a retry or accidental double-invoke
    // can never leave duplicate embeddings behind.
    await adminClient.from("document_chunks").delete().eq("document_id", document_id);

    const { data: fileBlob, error: downloadError } = await adminClient.storage
      .from("documents")
      .download(doc.storage_path);

    if (downloadError || !fileBlob) {
      await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "Could not download file" }), { status: 500, headers: corsHeaders });
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    let text = "";

    if (doc.mime_type === "application/pdf" || doc.file_name.toLowerCase().endsWith(".pdf")) {
      const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
      const result = await extractText(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } else {
      // Plain text, markdown, etc.
      text = new TextDecoder().decode(arrayBuffer);
    }

    if (!text || text.trim().length === 0) {
      await adminClient
        .from("documents")
        .update({ status: "error" })
        .eq("id", document_id);
      return new Response(
        JSON.stringify({ error: "No extractable text found in this file" }),
        { status: 422, headers: corsHeaders }
      );
    }

    const chunks = chunkText(text);
    const rows: {
      document_id: string;
      company_id: string;
      chunk_index: number;
      content: string;
      embedding: number[];
      department: string;
    }[] = [];

    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const embeddings = await embedBatch(batch);
      batch.forEach((content, j) => {
        rows.push({
          document_id: doc.id,
          company_id: doc.company_id,
          chunk_index: i + j,
          content,
          embedding: embeddings[j],
          department: doc.department ?? "general",
        });
      });
    }

    const { error: insertError } = await adminClient.from("document_chunks").insert(rows);

    if (insertError) {
      await adminClient.from("documents").update({ status: "error" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: corsHeaders });
    }

    await adminClient.from("documents").update({ status: "processed" }).eq("id", document_id);

    return new Response(JSON.stringify({ success: true, chunks: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
