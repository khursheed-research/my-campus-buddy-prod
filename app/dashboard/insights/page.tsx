"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Interaction = {
  occurred_at: string;
  department: string;
  sentiment: string | null;
  is_decision: boolean;
  topics: string[];
};

type Lead = { status: string };

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#22c55e",
  neutral: "#71717a",
  negative: "#ef4444",
};

const LEAD_STAGES = ["raw", "called", "meeting_done", "proposal_sent", "closed_won", "closed_lost"];

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted/70 py-8 text-center">{label}</p>;
}

export default function InsightsPage() {
  const supabase = createClient();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);

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

      const [{ data: interactionRows }, { data: leadRows }] = await Promise.all([
        supabase
          .from("interactions")
          .select("occurred_at, department, sentiment, is_decision, topics")
          .eq("company_id", profile.company_id),
        supabase.from("leads").select("status").eq("company_id", profile.company_id),
      ]);

      setInteractions(interactionRows ?? []);
      setLeads(leadRows ?? []);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Activity over the last 14 days
  const days: { date: string; label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      date: dateStr,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    });
  }
  interactions.forEach((it) => {
    const dateStr = it.occurred_at.slice(0, 10);
    const day = days.find((d) => d.date === dateStr);
    if (day) day.count += 1;
  });

  // Sentiment breakdown
  const sentimentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  interactions.forEach((it) => {
    if (it.sentiment) sentimentCounts[it.sentiment] = (sentimentCounts[it.sentiment] ?? 0) + 1;
  });
  const sentimentData = Object.entries(sentimentCounts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  // Decisions per department
  const deptCounts: Record<string, number> = {};
  interactions
    .filter((it) => it.is_decision)
    .forEach((it) => {
      deptCounts[it.department] = (deptCounts[it.department] ?? 0) + 1;
    });
  const deptData = Object.entries(deptCounts).map(([department, decisions]) => ({
    department,
    decisions,
  }));

  // Lead pipeline
  const leadCounts: Record<string, number> = {};
  LEAD_STAGES.forEach((s) => (leadCounts[s] = 0));
  leads.forEach((l) => {
    leadCounts[l.status] = (leadCounts[l.status] ?? 0) + 1;
  });
  const leadData = LEAD_STAGES.map((stage) => ({ stage, count: leadCounts[stage] }));

  // Top topics
  const topicCounts: Record<string, number> = {};
  interactions.forEach((it) => it.topics.forEach((t) => (topicCounts[t] = (topicCounts[t] ?? 0) + 1)));
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (!loaded) return null;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-2xl mt-4 mb-1">Insights & Analytics</h1>
      <p className="text-muted mb-8">
        Real numbers from what your company has actually captured — this fills in as usage grows.
      </p>

      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          Activity — last 14 days
        </h2>
        {interactions.length === 0 ? (
          <EmptyState label="No activity captured yet." />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={days}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#a1a1aa" }} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
              <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          Sentiment breakdown
        </h2>
        {sentimentData.length === 0 ? (
          <EmptyState label="No sentiment data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                {sentimentData.map((entry) => (
                  <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name] ?? "#71717a"} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          Decisions by department
        </h2>
        {deptData.length === 0 ? (
          <EmptyState label="No decisions detected yet." />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={deptData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="department" tick={{ fontSize: 10, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
              <Bar dataKey="decisions" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          Lead pipeline
        </h2>
        {leads.length === 0 ? (
          <EmptyState label="No leads captured yet — lead tracking isn't built into the capture flow yet." />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={leadData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="stage" tick={{ fontSize: 9, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
              <Bar dataKey="count" fill="#71717a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          Top topics
        </h2>
        {topTopics.length === 0 ? (
          <EmptyState label="No topics extracted yet." />
        ) : (
          <div className="flex gap-2 flex-wrap">
            {topTopics.map(([topic, count]) => (
              <span
                key={topic}
                className="text-xs rounded-full border border-border text-paper/90 px-3 py-1"
              >
                {topic} <span className="text-muted">· {count}</span>
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
