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
  neutral: "border-l-border",
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
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-2xl mt-4 mb-1">Timeline</h1>
      <p className="text-muted mb-6">Everything captured, in order.</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {departments.map((d) => (
          <button
            key={d}
            onClick={() => setDepartment(d)}
            className={
              "text-xs px-3 py-1 rounded-full border " +
              (department === d
                ? "bg-brass text-black border-brass"
                : "border-border text-muted")
            }
          >
            {d}
          </button>
        ))}
      </div>

      {Object.keys(groups).length === 0 && (
        <p className="text-muted/70 text-sm">Nothing captured yet.</p>
      )}

      {Object.entries(groups).map(([day, items]) => (
        <div key={day} className="mb-6">
          <p className="text-xs uppercase tracking-wide text-muted mb-2">{day}</p>
          <div className="space-y-2">
            {items.map((r) => (
              <div
                key={r.id}
                className={`border-l-2 pl-3 py-1 ${sentimentColor[r.sentiment ?? "neutral"]}`}
              >
                <div className="flex items-center gap-2 text-xs text-muted mb-0.5">
                  <span className="uppercase">{r.type}</span>
                  <span>·</span>
                  <span>{r.department}</span>
                  {r.is_decision && (
                    <span className="text-brass font-medium">· Decision</span>
                  )}
                  <span>·</span>
                  <span>{new Date(r.occurred_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-sm text-paper">{r.summary ?? r.raw_content}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
