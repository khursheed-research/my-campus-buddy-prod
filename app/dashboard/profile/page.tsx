"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TeamMember = {
  profile_id: string;
  job_title: string | null;
  department: string | null;
  day_to_day_activity: string | null;
  previous_company: string | null;
  years_experience: number | null;
  full_name: string;
};

const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract", "intern"];

export default function ProfilePage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [employmentType, setEmploymentType] = useState("full-time");
  const [workLocation, setWorkLocation] = useState("");
  const [dayToDay, setDayToDay] = useState("");
  const [previousCompany, setPreviousCompany] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [education, setEducation] = useState("");
  const [skills, setSkills] = useState("");
  const [certifications, setCertifications] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const [linkedinText, setLinkedinText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [showLinkedinImport, setShowLinkedinImport] = useState(false);
  const [importMode, setImportMode] = useState<"pdf" | "paste">("pdf");
  const [importError, setImportError] = useState("");

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
        .select(
          "employee_id, job_title, department, date_of_joining, employment_type, work_location, day_to_day_activity, previous_company, years_experience, education, skills, certifications, manager_id"
        )
        .eq("profile_id", user.id)
        .maybeSingle();

      if (myProfile) {
        setEmployeeId(myProfile.employee_id ?? "");
        setJobTitle(myProfile.job_title ?? "");
        setDepartment(myProfile.department ?? "");
        setDateOfJoining(myProfile.date_of_joining ?? "");
        setEmploymentType(myProfile.employment_type ?? "full-time");
        setWorkLocation(myProfile.work_location ?? "");
        setDayToDay(myProfile.day_to_day_activity ?? "");
        setPreviousCompany(myProfile.previous_company ?? "");
        setYearsExperience(myProfile.years_experience?.toString() ?? "");
        setEducation(myProfile.education ?? "");
        setSkills((myProfile.skills ?? []).join(", "));
        setCertifications((myProfile.certifications ?? []).join(", "));

        if (myProfile.manager_id) {
          const { data: manager } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", myProfile.manager_id)
            .single();
          setManagerName(manager?.full_name ?? null);
        }
      }

      const { data: reports } = await supabase
        .from("employee_profiles")
        .select(
          "profile_id, job_title, department, day_to_day_activity, previous_company, years_experience, profiles(full_name)"
        )
        .eq("manager_id", user.id);

      setTeam(
        (reports ?? []).map((r) => ({
          profile_id: r.profile_id,
          job_title: r.job_title,
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

  function applyExtracted(data: {
    job_title?: string;
    previous_company?: string;
    years_experience?: number;
    education?: string;
    skills?: string[];
    certifications?: string[];
  }) {
    if (data.job_title) setJobTitle(data.job_title);
    if (data.previous_company) setPreviousCompany(data.previous_company);
    if (data.years_experience) setYearsExperience(String(data.years_experience));
    if (data.education) setEducation(data.education);
    if (data.skills?.length) setSkills(data.skills.join(", "));
    if (data.certifications?.length) setCertifications(data.certifications.join(", "));
    setShowLinkedinImport(false);
    setLinkedinText("");
  }

  async function parseLinkedin() {
    if (!linkedinText.trim()) return;
    setParsing(true);
    setImportError("");

    const { data, error } = await supabase.functions.invoke("parse-profile-text", {
      body: { text: linkedinText.trim() },
    });

    setParsing(false);
    if (error || data?.error) {
      setImportError(error?.message ?? data?.error ?? "Could not read that text");
      return;
    }
    applyExtracted(data);
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setImportError("");

    const { data, error } = await supabase.functions.invoke("parse-profile-pdf", { body: file });

    setParsing(false);
    e.target.value = "";
    if (error || data?.error) {
      setImportError(error?.message ?? data?.error ?? "Could not read that PDF");
      return;
    }
    applyExtracted(data);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !companyId) return;

    setSaving(true);
    setSavedMsg("");

    const { error } = await supabase.from("employee_profiles").upsert(
      {
        profile_id: userId,
        company_id: companyId,
        employee_id: employeeId.trim() || null,
        job_title: jobTitle.trim() || null,
        department: department.trim() || null,
        date_of_joining: dateOfJoining || null,
        employment_type: employmentType || null,
        work_location: workLocation.trim() || null,
        day_to_day_activity: dayToDay.trim() || null,
        previous_company: previousCompany.trim() || null,
        years_experience: yearsExperience ? parseFloat(yearsExperience) : null,
        education: education.trim() || null,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        certifications: certifications.split(",").map((c) => c.trim()).filter(Boolean),
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

      <div className="mb-6">
        {!showLinkedinImport ? (
          <button
            onClick={() => setShowLinkedinImport(true)}
            className="text-xs rounded border border-brass/50 text-brass px-3 py-1.5 hover:border-brass"
          >
            Import from LinkedIn
          </button>
        ) : (
          <div className="rounded border border-border bg-panel p-4">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setImportMode("pdf")}
                className={
                  "text-xs px-3 py-1 rounded-full border " +
                  (importMode === "pdf" ? "bg-brass text-ink border-brass" : "border-border text-muted")
                }
              >
                Upload PDF (recommended)
              </button>
              <button
                onClick={() => setImportMode("paste")}
                className={
                  "text-xs px-3 py-1 rounded-full border " +
                  (importMode === "paste" ? "bg-brass text-ink border-brass" : "border-border text-muted")
                }
              >
                Paste text instead
              </button>
            </div>

            {importMode === "pdf" ? (
              <>
                <p className="text-xs text-muted mb-3 leading-relaxed">
                  On LinkedIn, go to your own profile → click <span className="text-paper">More</span>{" "}
                  (three dots, sometimes labeled <span className="text-paper">Resources</span>) below
                  your name → select <span className="text-paper">Save to PDF</span>. LinkedIn
                  downloads a resume-formatted PDF of your profile. Upload that file here — we&apos;ll
                  read it and fill in the fields below for you to review before saving.
                </p>
                <label className="block rounded border border-dashed border-border p-4 text-center cursor-pointer hover:border-brass">
                  <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={parsing} />
                  <span className="text-xs text-muted">
                    {parsing ? "Reading…" : "Click to choose your LinkedIn PDF"}
                  </span>
                </label>
              </>
            ) : (
              <>
                <p className="text-xs text-muted mb-2">
                  Copy your About + Experience sections from LinkedIn and paste them here.
                </p>
                <textarea
                  className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm min-h-[100px] mb-2"
                  placeholder="Paste your LinkedIn About + Experience text here…"
                  value={linkedinText}
                  onChange={(e) => setLinkedinText(e.target.value)}
                />
                <button
                  onClick={parseLinkedin}
                  disabled={parsing || !linkedinText.trim()}
                  className="text-xs rounded bg-brass text-ink px-3 py-1.5 disabled:opacity-50"
                >
                  {parsing ? "Reading…" : "Extract fields"}
                </button>
              </>
            )}

            {importError && <p className="text-xs text-signal-red mt-2">{importError}</p>}

            <button
              onClick={() => {
                setShowLinkedinImport(false);
                setImportError("");
              }}
              className="text-xs text-muted hover:text-paper px-2 mt-2 block"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4 mb-10">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1">Employee ID</label>
            <input
              className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Job title</label>
            <input
              className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Senior Sales Executive"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1">Department</label>
            <input
              className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Work location</label>
            <input
              className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
              value={workLocation}
              onChange={(e) => setWorkLocation(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1">Date of joining</label>
            <input
              type="date"
              className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
              value={dateOfJoining}
              onChange={(e) => setDateOfJoining(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Employment type</label>
            <select
              className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
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

        <div>
          <label className="block text-xs text-muted mb-1">Education</label>
          <input
            className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            placeholder="e.g. B.Tech Chemical Engineering, IIT Delhi"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Skills (comma-separated)</label>
          <input
            className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Certifications (comma-separated)</label>
          <input
            className="w-full rounded bg-panel border border-border px-3 py-2 text-sm"
            value={certifications}
            onChange={(e) => setCertifications(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-brass text-ink text-sm font-medium py-2 px-4 disabled:opacity-50"
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
                <p className="text-sm text-paper mb-1">
                  {m.full_name} {m.job_title ? `— ${m.job_title}` : ""}
                </p>
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
