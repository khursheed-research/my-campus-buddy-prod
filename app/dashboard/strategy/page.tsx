"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StrategyRow = {
  id: string;
  situation: string;
  recommendation: string | null;
  status: string;
  created_at: string;
};

export default function StrategyPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [situation, setSituation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadStrategies(cid: string) {
    const { data } = await supabase
      .from("strategies")
      .select("id, situation, recommendation, status, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });
    setStrategies(data ?? []);
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        loadStrategies(profile.company_id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const stillWorking = strategies.some((s) => s.status === "pending");
    if (!stillWorking) return;
    const interval = setInterval(() => loadStrategies(companyId), 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategies, companyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!situation.trim() || !companyId || !userId) return;

    setSubmitting(true);
    setErrorMsg("");

    const { data: inserted, error: insertError } = await supabase
      .from("strategies")
      .insert({ company_id: companyId, situation: situation.trim(), created_by: userId })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setErrorMsg(insertError?.message ?? "Could not save situation");
      setSubmitting(false);
      return;
    }

    supabase.functions.invoke("generate-strategy", { body: { strategy_id: inserted.id } });

    setSituation("");
    setSubmitting(false);
    loadStrategies(companyId);
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mt-4 mb-1">Strategy Advisor</h1>
      <p className="text-muted mb-6">
        Describe a decision you're facing. Recommendations are grounded in your company's own
        documents and past decisions — and say so plainly when there isn't enough history yet.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 mb-10">
        <textarea
          className="w-full rounded-md bg-panel border border-border px-3 py-2 min-h-[100px]"
          placeholder="e.g. 'A vendor wants a 10% price increase on renewal. Should we accept or push back?'"
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brass text-black text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Get recommendation"}
        </button>
        {errorMsg && <p className="text-signal-red text-sm">{errorMsg}</p>}
      </form>

      <div className="space-y-4">
        {strategies.length === 0 && (
          <p className="text-muted/70 text-sm">No situations logged yet.</p>
        )}
        {strategies.map((s) => (
          <div key={s.id} className="rounded-md border border-border bg-panel px-4 py-3">
            <p className="text-sm text-paper mb-2">{s.situation}</p>
            {s.status === "pending" && (
              <p className="text-xs text-muted">Thinking…</p>
            )}
            {s.recommendation && (
              <div className="text-sm border-t border-border pt-2 mt-2 whitespace-pre-wrap text-paper/90">
                {s.recommendation}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
