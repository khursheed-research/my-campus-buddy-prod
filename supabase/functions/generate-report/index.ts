// supabase/functions/generate-report/index.ts
//
// Pulls the last 6 months of real interactions and documents, aggregates
// real per-person contribution and company-wide trends, and asks Gemini to
// write an actual narrative report for the founder — not a template, a
// real summary grounded in what was captured.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

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

    const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const since = sixMonthsAgo.toISOString();

    const [{ data: interactions }, { data: documents }, { data: profiles }] = await Promise.all([
      callerClient
        .from("interactions")
        .select("created_by, department, is_decision, sentiment, topics, summary, occurred_at")
        .gte("occurred_at", since),
      callerClient.from("documents").select("uploaded_by, file_name, created_at").gte("created_at", since),
      callerClient.from("profiles").select("id, full_name"),
    ]);

    const nameById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "Unnamed"]));

    // Real per-person contribution scoring: notes=1pt, decisions=3pt, uploads=2pt.
    const scores: Record<string, { notes: number; decisions: number; uploads: number }> = {};
    const ensure = (id: string) => (scores[id] ??= { notes: 0, decisions: 0, uploads: 0 });

    (interactions ?? []).forEach((it) => {
      if (!it.created_by) return;
      ensure(it.created_by).notes += 1;
      if (it.is_decision) ensure(it.created_by).decisions += 1;
    });
    (documents ?? []).forEach((d) => {
      if (!d.uploaded_by) return;
      ensure(d.uploaded_by).uploads += 1;
    });

    const leaderboard = Object.entries(scores)
      .map(([id, s]) => ({
        name: nameById[id] ?? "Unknown",
        ...s,
        score: s.notes * 1 + s.decisions * 3 + s.uploads * 2,
      }))
      .sort((a, b) => b.score - a.score);

    const decisions = (interactions ?? []).filter((it) => it.is_decision).slice(0, 20);
    const sentimentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
    (interactions ?? []).forEach((it) => {
      if (it.sentiment) sentimentCounts[it.sentiment] = (sentimentCounts[it.sentiment] ?? 0) + 1;
    });
    const topicCounts: Record<string, number> = {};
    (interactions ?? []).forEach((it) =>
      (it.topics ?? []).forEach((t: string) => (topicCounts[t] = (topicCounts[t] ?? 0) + 1))
    );
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t);

    const stats = {
      totalInteractions: interactions?.length ?? 0,
      totalDocuments: documents?.length ?? 0,
      totalDecisions: decisions.length,
      sentimentCounts,
      topTopics,
      leaderboard,
    };

    let report = "";
    if (stats.totalInteractions === 0 && stats.totalDocuments === 0) {
      report =
        "There isn't enough activity captured yet over the last 6 months to generate a meaningful report. Once the team has logged more notes, decisions, and documents, this report will summarize real trends and contributions.";
    } else {
      const prompt = `You are writing a concise 6-month activity report for a company's founder. Use ONLY the real data below — do not invent names, numbers, or events not present here.

Data:
${JSON.stringify(stats, null, 2)}

Write a professional 3-4 paragraph report covering: overall activity level, who contributed most and how, key decisions made (reference a few specific ones by their summary text), notable recurring topics, and overall team sentiment. Be direct and factual, not generic corporate fluff.`;

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
      report = data.candidates[0].content.parts[0].text;
    }

    return new Response(JSON.stringify({ report, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
