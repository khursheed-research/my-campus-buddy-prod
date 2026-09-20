"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Source = { type: string; id: string; snippet: string; similarity: number };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

const DEPARTMENTS = ["all", "sales", "hr", "operations", "finance", "product", "general"];

export default function ChatPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [department, setDepartment] = useState("all");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.functions.invoke("chat", {
      body: { message: question, department: department === "all" ? null : department },
    });

    if (error) {
      setErrorMsg(error.message ?? "Something went wrong");
      setLoading(false);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: data.answer, sources: data.sources },
    ]);
    setLoading(false);
  }

  return (
    <div className="p-8 max-w-2xl flex flex-col">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="font-display text-2xl mb-1">AI Workspace</h1>
          <p className="text-muted">
            Ask questions. Answers only come from what your company has actually uploaded or noted.
          </p>
        </div>
        <select
          className="rounded bg-panel border border-border px-2 py-1.5 text-xs shrink-0"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d === "all" ? "All departments" : d[0].toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-4 mb-6">
        {messages.length === 0 && (
          <p className="text-muted/70 text-sm">
            Try asking about something you uploaded or noted earlier.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={
                m.role === "user"
                  ? "inline-block rounded-lg bg-brass text-black px-4 py-2 max-w-md text-left"
                  : "inline-block rounded-lg bg-panel border border-border px-4 py-2 max-w-md text-left"
              }
            >
              <p className="text-sm whitespace-pre-wrap">{m.content}</p>
            </div>
            {m.sources && m.sources.length > 0 && (
              <div className="mt-1 space-y-1">
                {m.sources.map((s, j) => (
                  <p key={j} className="text-xs text-muted/70">
                    {s.type === "document" ? "📄" : "📝"} {s.snippet}…
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="text-sm text-muted">Thinking…</p>}
        {errorMsg && <p className="text-sm text-signal-red">{errorMsg}</p>}
      </div>

      <form onSubmit={handleSend} className="flex gap-2 sticky bottom-8">
        <input
          className="flex-1 rounded-md bg-panel border border-border px-3 py-2"
          placeholder="Ask something…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-brass text-black text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
