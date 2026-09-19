"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-5">
        <div>
          <p className="font-display text-lg text-brass-bright mb-6">My Campus Buddy</p>
          <h1 className="font-display text-2xl">Log in</h1>
        </div>

        <input
          className="w-full rounded-md bg-panel border border-border px-3 py-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-md bg-panel border border-border px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {errorMsg && <p className="text-signal-red text-sm">{errorMsg}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brass text-black font-medium py-2 disabled:opacity-50"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>

        <p className="text-sm text-muted">
          Need an account? <a href="/signup" className="text-brass hover:text-brass-bright">Sign up</a>
        </p>
      </form>
    </main>
  );
}
