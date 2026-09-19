"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LeaderRow = { name: string; notes: number; decisions: number; uploads: number; score: number };
type Stats = {
  totalInteractions: number;
  totalDocuments: number;
  totalDecisions: number;
  sentimentCounts: Record<string, number>;
  topTopics: string[];
  leaderboard: LeaderRow[];
};

const medals = ["🥇", "🥈", "🥉"];

export default function ContributionPage() {
  const supabase = createClient();
  const [report, setReport] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function generateReport() {
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await supabase.functions.invoke("generate-report", { body: {} });
    setLoading(false);
    if (error) {
      setErrorMsg(error.message ?? "Could not generate report");
      return;
    }
    setReport(data.report);
    setStats(data.stats);
  }

  useEffect(() => {
    generateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mt-4 mb-1">Contribution & Rewards</h1>
      <p className="text-muted mb-8">
        Who's contributing, and what actually happened over the last 6 months — both computed
        from real activity, not estimates.
      </p>

      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          Leaderboard
        </h2>
        {!stats || stats.leaderboard.length === 0 ? (
          <p className="text-sm text-muted/70">No contributions captured yet.</p>
        ) : (
          <div className="space-y-2">
            {stats.leaderboard.map((row, i) => (
              <div
                key={row.name}
                className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 text-center">{medals[i] ?? i + 1}</span>
                  <span className="text-sm">{row.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>{row.notes} notes</span>
                  <span>{row.decisions} decisions</span>
                  <span>{row.uploads} uploads</span>
                  <span className="text-brass font-medium">{row.score} pts</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted/70 mt-2">
          Scoring: 1 pt per note, 3 pts per decision, 2 pts per document uploaded.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Six-month report
          </h2>
          <button
            onClick={generateReport}
            disabled={loading}
            className="text-xs rounded-md border border-border text-paper/90 px-3 py-1 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Regenerate"}
          </button>
        </div>
        {errorMsg && <p className="text-sm text-signal-red">{errorMsg}</p>}
        {report && (
          <div className="rounded-md border border-border bg-panel px-4 py-4">
            <p className="text-sm text-paper/90 whitespace-pre-wrap leading-relaxed">{report}</p>
          </div>
        )}
      </section>
    </div>
  );
}
