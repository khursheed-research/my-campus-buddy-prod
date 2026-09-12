"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, company_name: companyName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">Check your email</h1>
          <p className="text-zinc-400">
            We sent a verification link to {email}. Click it to activate your account.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSignup} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Create your account</h1>

        <input
          className="w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <input
          className="w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2"
          placeholder="Company / organization name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
        />
        <input
          className="w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2"
          placeholder="Work email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2"
          placeholder="Password"
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {status === "error" && (
          <p className="text-red-400 text-sm">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-md bg-amber-500 text-black font-medium py-2 disabled:opacity-50"
        >
          {status === "sending" ? "Creating account…" : "Create account"}
        </button>

        <p className="text-sm text-zinc-500">
          Already have an account? <a href="/login" className="text-amber-500">Log in</a>
        </p>
      </form>
    </main>
  );
}
