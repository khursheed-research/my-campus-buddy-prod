"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Source = { type: string; id: string; snippet: string; similarity: number };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

export default function ChatPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
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
      body: { message: question },
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
    <main className="min-h-screen p-8 max-w-2xl flex flex-col">
      <a href="/dashboard" className="text-sm text-zinc-500 underline">
        ← Back to dashboard
      </a>
      <h1 className="text-2xl font-semibold mt-4 mb-1">AI Workspace</h1>
      <p className="text-zinc-500 mb-6">
        Ask questions. Answers only come from what your company has actually uploaded or noted.
      </p>

      <div className="flex-1 space-y-4 mb-6">
        {messages.length === 0 && (
          <p className="text-zinc-600 text-sm">
            Try asking about something you uploaded or noted earlier.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={
                m.role === "user"
                  ? "inline-block rounded-lg bg-amber-500 text-black px-4 py-2 max-w-md text-left"
                  : "inline-block rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 max-w-md text-left"
              }
            >
              <p className="text-sm whitespace-pre-wrap">{m.content}</p>
            </div>
            {m.sources && m.sources.length > 0 && (
              <div className="mt-1 space-y-1">
                {m.sources.map((s, j) => (
                  <p key={j} className="text-xs text-zinc-600">
                    {s.type === "document" ? "📄" : "📝"} {s.snippet}…
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="text-sm text-zinc-500">Thinking…</p>}
        {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
      </div>

      <form onSubmit={handleSend} className="flex gap-2 sticky bottom-8">
        <input
          className="flex-1 rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2"
          placeholder="Ask something…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-amber-500 text-black text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
