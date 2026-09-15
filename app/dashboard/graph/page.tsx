"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Interaction = {
  id: string;
  summary: string | null;
  raw_content: string;
  topics: string[];
  occurred_at: string;
};

export default function GraphPage() {
  const supabase = createClient();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

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
        .select("id, summary, raw_content, topics, occurred_at")
        .eq("company_id", profile.company_id)
        .not("topics", "eq", "{}");

      setInteractions(data ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { nodes, edges } = useMemo(() => {
    const freq: Record<string, number> = {};
    const pairWeight: Record<string, number> = {};

    interactions.forEach((it) => {
      it.topics.forEach((t) => {
        freq[t] = (freq[t] ?? 0) + 1;
      });
      for (let i = 0; i < it.topics.length; i++) {
        for (let j = i + 1; j < it.topics.length; j++) {
          const key = [it.topics[i], it.topics[j]].sort().join("|||");
          pairWeight[key] = (pairWeight[key] ?? 0) + 1;
        }
      }
    });

    const topicList = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
    const maxFreq = Math.max(1, ...Object.values(freq));
    const center = 200;
    const radius = 160;

    const nodes = topicList.map((topic, i) => {
      const angle = (i / topicList.length) * 2 * Math.PI;
      return {
        topic,
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
        size: 6 + (freq[topic] / maxFreq) * 16,
        freq: freq[topic],
      };
    });

    const nodeByTopic = Object.fromEntries(nodes.map((n) => [n.topic, n]));
    const edges = Object.entries(pairWeight).map(([key, weight]) => {
      const [a, b] = key.split("|||");
      return { a: nodeByTopic[a], b: nodeByTopic[b], weight };
    });

    return { nodes, edges };
  }, [interactions]);

  const relatedInteractions = selectedTopic
    ? interactions.filter((it) => it.topics.includes(selectedTopic))
    : [];

  return (
    <main className="min-h-screen p-8 max-w-2xl">
      <a href="/dashboard" className="text-sm text-zinc-500 underline">
        ← Back to dashboard
      </a>
      <h1 className="text-2xl font-semibold mt-4 mb-1">Knowledge Graph</h1>
      <p className="text-zinc-500 mb-6">
        How topics from your real notes connect. Bigger dots come up more often; click one to see why.
      </p>

      {nodes.length === 0 ? (
        <p className="text-zinc-600 text-sm">
          Not enough captured notes yet to build a graph — add a few notes first.
        </p>
      ) : (
        <svg viewBox="0 0 400 400" className="w-full max-w-md mx-auto mb-6">
          {edges.map((e, i) => (
            <line
              key={i}
              x1={e.a.x}
              y1={e.a.y}
              x2={e.b.x}
              y2={e.b.y}
              stroke="#52525b"
              strokeWidth={Math.min(4, e.weight)}
              opacity={0.4}
            />
          ))}
          {nodes.map((n) => (
            <g
              key={n.topic}
              onClick={() => setSelectedTopic(n.topic === selectedTopic ? null : n.topic)}
              className="cursor-pointer"
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={n.size}
                fill={n.topic === selectedTopic ? "#f59e0b" : "#3f3f46"}
                stroke="#f59e0b"
                strokeWidth={n.topic === selectedTopic ? 2 : 0}
              />
              <text
                x={n.x}
                y={n.y - n.size - 4}
                fontSize="9"
                fill="#a1a1aa"
                textAnchor="middle"
              >
                {n.topic}
              </text>
            </g>
          ))}
        </svg>
      )}

      {selectedTopic && (
        <div>
          <h2 className="text-sm font-medium mb-2">
            Interactions mentioning &ldquo;{selectedTopic}&rdquo;
          </h2>
          <div className="space-y-2">
            {relatedInteractions.map((it) => (
              <div key={it.id} className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                <p className="text-xs text-zinc-500 mb-1">
                  {new Date(it.occurred_at).toLocaleDateString()}
                </p>
                <p className="text-sm text-zinc-300">{it.summary ?? it.raw_content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
