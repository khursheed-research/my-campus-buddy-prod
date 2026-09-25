"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CompanyContextValue = {
  userId: string | null;
  companyId: string | null;
  role: string | null;
  loading: boolean;
};

const CompanyContext = createContext<CompanyContextValue>({
  userId: null,
  companyId: null,
  role: null,
  loading: true,
});

export function useCompany() {
  return useContext(CompanyContext);
}

// Fetched once when the dashboard layout first mounts, then reused across
// every client-side navigation within /dashboard — Next.js keeps this
// provider alive across route changes in the same layout, so pages no
// longer each pay their own auth + profile round-trip on every navigation.
// Uses getSession() (reads the already-verified local session, no network
// call) rather than getUser() (a fresh server round-trip) — safe here
// because middleware has already verified auth server-side before this
// client code ever runs.
export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [value, setValue] = useState<CompanyContextValue>({
    userId: null,
    companyId: null,
    role: null,
    loading: true,
  });

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setValue({ userId: null, companyId: null, role: null, loading: false });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, role")
        .eq("id", session.user.id)
        .single();

      setValue({
        userId: session.user.id,
        companyId: profile?.company_id ?? null,
        role: profile?.role ?? null,
        loading: false,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
