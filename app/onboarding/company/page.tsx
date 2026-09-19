"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INDUSTRIES = [
  "Manufacturing",
  "Chemical & Process",
  "Technology",
  "Healthcare",
  "Financial Services",
  "Retail & Consumer",
  "Education",
  "Government & Public Sector",
  "Professional Services",
  "Other",
];

const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "501-2000", "2000+"];

export default function CompanyOnboardingPage() {
  const supabase = createClient();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [foundedYear, setFoundedYear] = useState("");
  const [employeeCount, setEmployeeCount] = useState(EMPLOYEE_RANGES[0]);
  const [website, setWebsite] = useState("");
  const [corporateOffice, setCorporateOffice] = useState("");
  const [manufacturingPlant, setManufacturingPlant] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profile?.company_id) {
        router.push("/dashboard");
        return;
      }

      setUserId(user.id);
      setName((user.user_metadata?.company_name as string | undefined) || "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !name.trim() || !corporateOffice.trim()) return;

    setSubmitting(true);
    setErrorMsg("");

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        name: name.trim(),
        industry,
        founded_year: foundedYear ? parseInt(foundedYear, 10) : null,
        employee_count: employeeCount,
        website: website.trim() || null,
        corporate_office_address: corporateOffice.trim(),
        manufacturing_plant_address: manufacturingPlant.trim() || null,
      })
      .select("id")
      .single();

    if (companyError || !company) {
      setErrorMsg(companyError?.message ?? "Could not create company");
      setSubmitting(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ company_id: company.id, role: "founder", clearance: "executive" })
      .eq("id", userId);

    if (profileError) {
      setErrorMsg(profileError.message);
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen p-8 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-5">
        <div>
          <h1 className="font-display text-2xl mb-1">Set up your company</h1>
          <p className="text-muted text-sm">
            This becomes your organization&apos;s permanent record. You&apos;ll be its founder,
            with full administrative access.
          </p>
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Company name</label>
          <input
            required
            className="w-full rounded bg-panel border border-border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-muted mb-1">Industry</label>
            <select
              className="w-full rounded bg-panel border border-border px-3 py-2"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            >
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Year established</label>
            <input
              type="number"
              min="1800"
              max={new Date().getFullYear()}
              className="w-full rounded bg-panel border border-border px-3 py-2"
              value={foundedYear}
              onChange={(e) => setFoundedYear(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-muted mb-1">Number of employees</label>
            <select
              className="w-full rounded bg-panel border border-border px-3 py-2"
              value={employeeCount}
              onChange={(e) => setEmployeeCount(e.target.value)}
            >
              {EMPLOYEE_RANGES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Website (optional)</label>
            <input
              type="url"
              placeholder="https://"
              className="w-full rounded bg-panel border border-border px-3 py-2"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Corporate office address</label>
          <textarea
            required
            className="w-full rounded bg-panel border border-border px-3 py-2 min-h-[70px]"
            value={corporateOffice}
            onChange={(e) => setCorporateOffice(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">
            Manufacturing plant address (if applicable)
          </label>
          <textarea
            className="w-full rounded bg-panel border border-border px-3 py-2 min-h-[70px]"
            value={manufacturingPlant}
            onChange={(e) => setManufacturingPlant(e.target.value)}
          />
        </div>

        {errorMsg && <p className="text-signal-red text-sm">{errorMsg}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-brass text-ink font-medium py-2.5 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create company & continue"}
        </button>
      </form>
    </main>
  );
}
