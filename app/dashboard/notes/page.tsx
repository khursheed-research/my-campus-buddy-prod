"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InteractionRow = {
  id: string;
  raw_content: string;
  summary: string | null;
  sentiment: string | null;
  next_step: string | null;
  status: string;
  department: string;
  occurred_at: string;
};

const DEPARTMENTS = ["sales", "hr", "operations", "finance", "product", "general"];

const sentimentColor: Record<string, string> = {
  positive: "text-green-400",
  neutral: "text-zinc-400",
  negative: "text-red-400",
};

export default function NotesPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState<InteractionRow[]>([]);
  const [content, setContent] = useState("");
  const [department, setDepartment] = useState("general");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadNotes(cid: string) {
    const { data } = await supabase
      .from("interactions")
      .select("id, raw_content, summary, sentiment, next_step, status, department, occurred_at")
      .eq("company_id", cid)
      .eq("type", "note")
      .order("occurred_at", { ascending: false });
    setNotes(data ?? []);
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        loadNotes(profile.company_id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const stillWorking = notes.some((n) => n.status === "raw" || n.status === "processing");
    if (!stillWorking) return;
    const interval = setInterval(() => loadNotes(companyId), 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, companyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !companyId || !userId) return;

    setSubmitting(true);
    setErrorMsg("");

    const { data: inserted, error: insertError } = await supabase
      .from("interactions")
      .insert({
        company_id: companyId,
        department,
        type: "note",
        source: "manual",
        raw_content: content.trim(),
        created_by: userId,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setErrorMsg(insertError?.message ?? "Could not save note");
      setSubmitting(false);
      return;
    }

    supabase.functions.invoke("process-interaction", {
      body: { interaction_id: inserted.id },
    });

    setContent("");
    setSubmitting(false);
    loadNotes(companyId);
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl">
      <a href="/dashboard" className="text-sm text-zinc-500 underline">
        ← Back to dashboard
      </a>
      <h1 className="text-2xl font-semibold mt-4 mb-1">Notes</h1>
      <p className="text-zinc-500 mb-6">
        Type what happened. It gets read, summarized, and made searchable automatically.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 mb-10">
        <textarea
          className="w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 min-h-[120px]"
          placeholder="What happened? e.g. 'Talked to the vendor about renewal, they want a 10% price increase, need to decide by Friday.'"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
        <div className="flex items-center justify-between gap-3">
          <select
            className="rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-amber-500 text-black text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save note"}
          </button>
        </div>
        {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
      </form>

      <div className="space-y-3">
        {notes.length === 0 && <p className="text-zinc-600 text-sm">No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                {n.department} · {new Date(n.occurred_at).toLocaleString()}
              </span>
              <span className="text-xs uppercase tracking-wide text-amber-500">{n.status}</span>
            </div>
            <p className="text-sm text-zinc-300 mb-2">{n.raw_content}</p>
            {n.summary && (
              <div className="text-sm border-t border-zinc-800 pt-2 mt-2 space-y-1">
                <p>
                  <span className="text-zinc-500">Summary: </span>
                  {n.summary}
                </p>
                {n.sentiment && (
                  <p>
                    <span className="text-zinc-500">Sentiment: </span>
                    <span className={sentimentColor[n.sentiment] ?? ""}>{n.sentiment}</span>
                  </p>
                )}
                {n.next_step && (
                  <p>
                    <span className="text-zinc-500">Next step: </span>
                    {n.next_step}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
