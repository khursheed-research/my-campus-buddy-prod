"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TeamMember = {
  profile_id: string;
  department: string | null;
  day_to_day_activity: string | null;
  previous_company: string | null;
  years_experience: number | null;
  full_name: string;
};

export default function ProfilePage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);

  const [department, setDepartment] = useState("");
  const [dayToDay, setDayToDay] = useState("");
  const [previousCompany, setPreviousCompany] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const [team, setTeam] = useState<TeamMember[]>([]);

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
      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);

      const { data: myProfile } = await supabase
        .from("employee_profiles")
        .select("department, day_to_day_activity, previous_company, years_experience, manager_id")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (myProfile) {
        setDepartment(myProfile.department ?? "");
        setDayToDay(myProfile.day_to_day_activity ?? "");
        setPreviousCompany(myProfile.previous_company ?? "");
        setYearsExperience(myProfile.years_experience?.toString() ?? "");

        if (myProfile.manager_id) {
          const { data: manager } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", myProfile.manager_id)
            .single();
          setManagerName(manager?.full_name ?? null);
        }
      }

      // Direct reports: RLS allows seeing employee_profiles where you're the manager.
      const { data: reports } = await supabase
        .from("employee_profiles")
        .select("profile_id, department, day_to_day_activity, previous_company, years_experience, profiles(full_name)")
        .eq("manager_id", user.id);

      setTeam(
        (reports ?? []).map((r) => ({
          profile_id: r.profile_id,
          department: r.department,
          day_to_day_activity: r.day_to_day_activity,
          previous_company: r.previous_company,
          years_experience: r.years_experience,
          // @ts-expect-error - joined relation shape
          full_name: r.profiles?.full_name ?? "Unnamed",
        }))
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !companyId) return;

    setSaving(true);
    setSavedMsg("");

    const { error } = await supabase.from("employee_profiles").upsert(
      {
        profile_id: userId,
        company_id: companyId,
        department: department.trim() || null,
        day_to_day_activity: dayToDay.trim() || null,
        previous_company: previousCompany.trim() || null,
        years_experience: yearsExperience ? parseFloat(yearsExperience) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" }
    );

    setSavedMsg(error ? error.message : "Saved.");
    setSaving(false);
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-2xl mt-4 mb-1">My Profile</h1>
      <p className="text-muted mb-6">
        Visible only to you, your manager, and admin-level roles — not the whole company.
      </p>

      <form onSubmit={handleSave} className="space-y-4 mb-10">
        <div>
          <label className="block text-xs text-muted mb-1">Department</label>
          <input
            className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </div>

        {managerName && (
          <div>
            <label className="block text-xs text-muted mb-1">Reports to</label>
            <p className="text-sm text-paper">{managerName}</p>
          </div>
        )}

        <div>
          <label className="block text-xs text-muted mb-1">Day-to-day activity</label>
          <textarea
            className="w-full rounded bg-panel border border-border px-3 py-2 text-sm min-h-[80px]"
            value={dayToDay}
            onChange={(e) => setDayToDay(e.target.value)}
            placeholder="What does your role actually involve day to day?"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1">Previous company</label>
            <input
              className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
              value={previousCompany}
              onChange={(e) => setPreviousCompany(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Years of experience</label>
            <input
              type="number"
              step="0.5"
              className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
              value={yearsExperience}
              onChange={(e) => setYearsExperience(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-brass text-ink text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {savedMsg && <p className="text-xs text-muted">{savedMsg}</p>}
      </form>

      {team.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
            My Team
          </h2>
          <div className="space-y-3">
            {team.map((m) => (
              <div key={m.profile_id} className="rounded-md border border-border bg-panel px-4 py-3">
                <p className="text-sm text-paper mb-1">{m.full_name}</p>
                <p className="text-xs text-muted">
                  {m.department ?? "No department set"}
                  {m.years_experience ? ` · ${m.years_experience} yrs experience` : ""}
                  {m.previous_company ? ` · previously at ${m.previous_company}` : ""}
                </p>
                {m.day_to_day_activity && (
                  <p className="text-xs text-muted/80 mt-1">{m.day_to_day_activity}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
