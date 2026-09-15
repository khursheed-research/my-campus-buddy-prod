"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  type: string;
  department: string;
  summary: string | null;
  raw_content: string;
  sentiment: string | null;
  is_decision: boolean;
  occurred_at: string;
};

const sentimentColor: Record<string, string> = {
  positive: "border-l-green-500",
  neutral: "border-l-zinc-600",
  negative: "border-l-red-500",
};

export default function TimelinePage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [department, setDepartment] = useState("all");

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
        .select("id, type, department, summary, raw_content, sentiment, is_decision, occurred_at")
        .eq("company_id", profile.company_id)
        .order("occurred_at", { ascending: false });

      setRows(data ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const departments = ["all", ...Array.from(new Set(rows.map((r) => r.department)))];
  const filtered = department === "all" ? rows : rows.filter((r) => r.department === department);

  // Group by calendar date
  const groups: Record<string, Row[]> = {};
  filtered.forEach((r) => {
    const day = new Date(r.occurred_at).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    (groups[day] ??= []).push(r);
  });

  return (
    <main className="min-h-screen p-8 max-w-2xl">
      <a href="/dashboard" className="text-sm text-zinc-500 underline">
        ← Back to dashboard
      </a>
      <h1 className="text-2xl font-semibold mt-4 mb-1">Timeline</h1>
      <p className="text-zinc-500 mb-6">Everything captured, in order.</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {departments.map((d) => (
          <button
            key={d}
            onClick={() => setDepartment(d)}
            className={
              "text-xs px-3 py-1 rounded-full border " +
              (department === d
                ? "bg-amber-500 text-black border-amber-500"
                : "border-zinc-700 text-zinc-400")
            }
          >
            {d}
          </button>
        ))}
      </div>

      {Object.keys(groups).length === 0 && (
        <p className="text-zinc-600 text-sm">Nothing captured yet.</p>
      )}

      {Object.entries(groups).map(([day, items]) => (
        <div key={day} className="mb-6">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{day}</p>
          <div className="space-y-2">
            {items.map((r) => (
              <div
                key={r.id}
                className={`border-l-2 pl-3 py-1 ${sentimentColor[r.sentiment ?? "neutral"]}`}
              >
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-0.5">
                  <span className="uppercase">{r.type}</span>
                  <span>·</span>
                  <span>{r.department}</span>
                  {r.is_decision && (
                    <span className="text-amber-500 font-medium">· Decision</span>
                  )}
                  <span>·</span>
                  <span>{new Date(r.occurred_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-sm text-zinc-200">{r.summary ?? r.raw_content}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
