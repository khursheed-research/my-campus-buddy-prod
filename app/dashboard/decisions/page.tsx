"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  summary: string | null;
  raw_content: string;
  next_step: string | null;
  topics: string[];
  department: string;
  occurred_at: string;
};

export default function DecisionsPage() {
  const supabase = createClient();
  const [decisions, setDecisions] = useState<Row[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;

      const { data } = await supabase
        .from("interactions")
        .select("id, summary, raw_content, next_step, topics, department, occurred_at")
        .eq("company_id", profile.company_id)
        .eq("is_decision", true)
        .order("occurred_at", { ascending: false });

      setDecisions(data ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = decisions.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (d.summary ?? "").toLowerCase().includes(q) ||
      d.raw_content.toLowerCase().includes(q) ||
      d.topics.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mt-4 mb-1">Decision Memory</h1>
      <p className="text-muted mb-6">
        Every real decision automatically detected from your notes, in one searchable place.
      </p>

      <input
        className="w-full rounded-md bg-panel border border-border px-3 py-2 mb-6"
        placeholder="Search decisions…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 && (
        <p className="text-muted/70 text-sm">
          {decisions.length === 0
            ? "No decisions captured yet — they're detected automatically from your notes."
            : "No decisions match that search."}
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((d) => (
          <div key={d.id} className="rounded-md border border-brass/30 bg-panel px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-muted">
                {d.department} · {new Date(d.occurred_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-paper mb-2">{d.summary ?? d.raw_content}</p>
            {d.next_step && (
              <p className="text-sm text-muted">
                <span className="text-muted/70">Next step: </span>
                {d.next_step}
              </p>
            )}
            {d.topics.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {d.topics.map((t) => (
                  <span
                    key={t}
                    className="text-xs rounded-full border border-border text-muted px-2 py-0.5"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
