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
type FeedItem = {
  id: string;
  summary: string | null;
  raw_content: string;
  created_by: string | null;
  authorName: string;
  occurred_at: string;
  voteCount: number;
  hasVoted: boolean;
};

const medals = ["🥇", "🥈", "🥉"];

export default function ContributionPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [yearlyLeaderboard, setYearlyLeaderboard] = useState<LeaderRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);

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

  async function loadYearlyAndFeed(cid: string, uid: string) {
    const jan1 = new Date(new Date().getFullYear(), 0, 1).toISOString();

    const [{ data: profiles }, { data: interactionsYTD }, { data: documentsYTD }, { data: votesYTD }, { data: papersYTD }, { data: reviewsYTD }, { data: recent }] =
      await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("company_id", cid),
        supabase.from("interactions").select("id, created_by, is_decision").eq("company_id", cid).gte("occurred_at", jan1),
        supabase.from("documents").select("uploaded_by").eq("company_id", cid).gte("created_at", jan1),
        supabase
          .from("contribution_votes")
          .select("interaction_id, interactions!inner(created_by)")
          .eq("company_id", cid)
          .gte("created_at", jan1),
        supabase.from("research_papers").select("author_id").eq("company_id", cid).eq("status", "published").gte("published_at", jan1),
        supabase.from("paper_reviews").select("reviewer_id").eq("company_id", cid).gte("created_at", jan1),
        supabase
          .from("interactions")
          .select("id, summary, raw_content, created_by, occurred_at")
          .eq("company_id", cid)
          .eq("status", "processed")
          .order("occurred_at", { ascending: false })
          .limit(15),
      ]);

    const nameById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "Unnamed"]));

    const scores: Record<string, { notes: number; decisions: number; uploads: number; votes: number; papers: number; reviews: number }> = {};
    const ensure = (id: string) => (scores[id] ??= { notes: 0, decisions: 0, uploads: 0, votes: 0, papers: 0, reviews: 0 });

    (interactionsYTD ?? []).forEach((it) => {
      if (!it.created_by) return;
      ensure(it.created_by).notes += 1;
      if (it.is_decision) ensure(it.created_by).decisions += 1;
    });
    (documentsYTD ?? []).forEach((d) => {
      if (!d.uploaded_by) return;
      ensure(d.uploaded_by).uploads += 1;
    });
    (votesYTD ?? []).forEach((v) => {
      // @ts-expect-error - joined relation shape
      const authorId = v.interactions?.created_by;
      if (authorId) ensure(authorId).votes += 1;
    });
    (papersYTD ?? []).forEach((p) => {
      ensure(p.author_id).papers += 1;
    });
    (reviewsYTD ?? []).forEach((r) => {
      ensure(r.reviewer_id).reviews += 1;
    });

    const leaderboard = Object.entries(scores)
      .map(([id, s]) => ({
        name: nameById[id] ?? "Unknown",
        notes: s.notes,
        decisions: s.decisions,
        uploads: s.uploads,
        score: s.notes * 1 + s.decisions * 3 + s.uploads * 2 + s.votes * 2 + s.papers * 10 + s.reviews * 1,
      }))
      .sort((a, b) => b.score - a.score);
    setYearlyLeaderboard(leaderboard);

    const recentIds = (recent ?? []).map((r) => r.id);
    const { data: allVotesForFeed } = recentIds.length
      ? await supabase.from("contribution_votes").select("interaction_id, voted_by").in("interaction_id", recentIds)
      : { data: [] };

    setFeed(
      (recent ?? []).map((r) => {
        const votesForThis = (allVotesForFeed ?? []).filter((v) => v.interaction_id === r.id);
        return {
          id: r.id,
          summary: r.summary,
          raw_content: r.raw_content,
          created_by: r.created_by,
          authorName: r.created_by ? nameById[r.created_by] ?? "Unknown" : "Unknown",
          occurred_at: r.occurred_at,
          voteCount: votesForThis.length,
          hasVoted: votesForThis.some((v) => v.voted_by === uid),
        };
      })
    );
  }

  async function vote(interactionId: string) {
    await supabase.rpc("cast_vote", { target_interaction_id: interactionId });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (profile?.company_id) loadYearlyAndFeed(profile.company_id, user.id);
  }

  useEffect(() => {
    generateReport();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      if (profile?.company_id) loadYearlyAndFeed(profile.company_id, user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-2xl mt-4 mb-1">Contribution & Rewards</h1>
      <p className="text-muted mb-8">
        Who's contributing, and what actually happened over the last 6 months — both computed
        from real activity, not estimates.
      </p>

      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          This year's score
        </h2>
        {yearlyLeaderboard.length === 0 ? (
          <p className="text-sm text-muted/70">No contributions yet this year.</p>
        ) : (
          <div className="space-y-2">
            {yearlyLeaderboard.map((row, i) => (
              <div
                key={row.name}
                className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 text-center">{medals[i] ?? i + 1}</span>
                  <span className="text-sm">{row.name}</span>
                </div>
                <span className="text-brass font-medium text-sm">{row.score} pts</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted/70 mt-2">
          1 pt/note · 3 pts/decision · 2 pts/upload · 2 pts/vote received · 10 pts/published paper
          · 1 pt/peer review given.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          Recent insights — vote for the best
        </h2>
        {feed.length === 0 ? (
          <p className="text-sm text-muted/70">Nothing captured yet.</p>
        ) : (
          <div className="space-y-2">
            {feed.map((f) => (
              <div key={f.id} className="rounded-md border border-border bg-panel px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-paper/90">{f.summary ?? f.raw_content}</p>
                    <p className="text-xs text-muted mt-1">
                      {f.authorName} · {new Date(f.occurred_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => vote(f.id)}
                    disabled={f.hasVoted || f.created_by === userId}
                    className={
                      "shrink-0 text-xs rounded-full border px-3 py-1 " +
                      (f.hasVoted
                        ? "border-brass text-brass"
                        : f.created_by === userId
                        ? "border-border text-muted/50"
                        : "border-border text-muted hover:border-brass hover:text-brass")
                    }
                  >
                    👍 {f.voteCount}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
