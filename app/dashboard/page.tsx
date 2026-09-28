import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, company_id, role, clearance")
    .eq("id", user.id)
    .single();

  // First login after signup: no company yet. Check for a pending invite
  // matching this user's own verified email first — if someone invited
  // them, they join that company instead of getting a brand new one.
  if (profile && !profile.company_id) {
    const { data: invite } = await supabase
      .from("company_invites")
      .select("id, company_id, role, clearance")
      .is("accepted_at", null)
      .ilike("email", user.email ?? "")
      .maybeSingle();

    if (invite) {
      await supabase
        .from("profiles")
        .update({ company_id: invite.company_id, role: invite.role, clearance: invite.clearance })
        .eq("id", user.id);
      await supabase
        .from("company_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      profile = {
        ...profile,
        company_id: invite.company_id,
        role: invite.role,
        clearance: invite.clearance,
      };
    } else {
      // No invite matched — this person is starting a brand-new company and
      // becomes its founder. Collect the real company profile first.
      redirect("/onboarding/company");
    }
  }

  const companyId = profile!.company_id;
  const jan1 = new Date(new Date().getFullYear(), 0, 1).toISOString();

  const [
    { data: myEmpProfile },
    { count: docCount },
    { count: noteCount },
    { count: decisionCount },
    { count: memberCount },
    { count: myNotesYTD },
    { count: myDecisionsYTD },
    { count: myUploadsYTD },
    { data: myVotesYTD },
  ] = await Promise.all([
    supabase
      .from("employee_profiles")
      .select("job_title, department, manager_id")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("type", "note"),
    supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_decision", true),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("created_by", user.id)
      .gte("occurred_at", jan1),
    supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("created_by", user.id)
      .eq("is_decision", true)
      .gte("occurred_at", jan1),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("uploaded_by", user.id)
      .gte("created_at", jan1),
    supabase
      .from("contribution_votes")
      .select("id, interactions!inner(created_by)")
      .eq("company_id", companyId)
      .gte("created_at", jan1),
  ]);

  const myDepartment = myEmpProfile?.department || null;

  const [
    { data: managerProfile },
    { data: directReportsRaw },
    { data: teammatesRaw },
    { data: deptInteractions },
  ] = await Promise.all([
    myEmpProfile?.manager_id
      ? supabase.from("profiles").select("full_name").eq("id", myEmpProfile.manager_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("employee_profiles")
      .select("profile_id, job_title, profiles(full_name)")
      .eq("company_id", companyId)
      .eq("manager_id", user.id),
    myDepartment
      ? supabase
          .from("employee_profiles")
          .select("profile_id, job_title, profiles(full_name)")
          .eq("company_id", companyId)
          .eq("department", myDepartment)
          .neq("profile_id", user.id)
      : Promise.resolve({ data: [] }),
    myDepartment
      ? supabase
          .from("interactions")
          .select("id, summary, raw_content, sentiment, is_decision, topics, occurred_at")
          .eq("company_id", companyId)
          .eq("department", myDepartment)
          .order("occurred_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] }),
  ]);

  type NamedRow = { profile_id: string; job_title: string | null; profiles: { full_name: string } | null };
  const directReports = (directReportsRaw ?? []) as unknown as NamedRow[];
  const teammates = (teammatesRaw ?? []) as unknown as NamedRow[];

  const deptTopicCounts: Record<string, number> = {};
  (deptInteractions ?? []).forEach((it) =>
    (it.topics ?? []).forEach((t: string) => (deptTopicCounts[t] = (deptTopicCounts[t] ?? 0) + 1))
  );
  const deptTopTopics = Object.entries(deptTopicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t);

  const myVotesReceived = (myVotesYTD ?? []).filter(
    // @ts-expect-error - joined relation shape
    (v) => v.interactions?.created_by === user.id
  ).length;

  const myScore =
    (myNotesYTD ?? 0) * 1 + (myDecisionsYTD ?? 0) * 3 + (myUploadsYTD ?? 0) * 2 + myVotesReceived * 2;

  const stats = [
    { label: "Documents", value: docCount ?? 0 },
    { label: "Notes captured", value: noteCount ?? 0 },
    { label: "Decisions detected", value: decisionCount ?? 0 },
    { label: "Team members", value: memberCount ?? 0 },
  ];

  const hasAnyActivity = (docCount ?? 0) > 0 || (noteCount ?? 0) > 0;
  const fullName = profile?.full_name || user.email || "";
  const initials = fullName
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="p-8 max-w-6xl">
      {/* Identity banner */}
      <div className="flex items-center justify-between rounded border border-border bg-panel px-6 py-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brass text-ink text-lg font-medium flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="font-display text-2xl leading-tight">{fullName}</h1>
            <p className="text-sm text-muted mt-0.5">
              {myEmpProfile?.job_title || <span className="italic">Job title not set</span>}
              {myDepartment ? ` · ${myDepartment[0].toUpperCase() + myDepartment.slice(1)}` : ""}
              {managerProfile?.full_name ? ` · Reports to ${managerProfile.full_name}` : ""}
            </p>
          </div>
        </div>
        <a href="/dashboard/profile" className="text-xs text-brass hover:text-brass-bright shrink-0">
          Edit profile →
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          <a
            href="/dashboard/contribution"
            className="block rounded border border-brass/40 bg-panel px-6 py-5 hover:border-brass transition-colors"
          >
            <p className="text-xs uppercase tracking-wide text-muted mb-2">Your contribution this year</p>
            <div className="flex items-end gap-6">
              <p className="font-display text-4xl text-brass-bright">{myScore} pts</p>
              <div className="flex gap-4 text-xs text-muted pb-1">
                <span>{myNotesYTD ?? 0} notes</span>
                <span>{myDecisionsYTD ?? 0} decisions</span>
                <span>{myUploadsYTD ?? 0} uploads</span>
                <span>{myVotesReceived} votes received</span>
              </div>
            </div>
            <p className="text-xs text-brass mt-2">View full leaderboard & vote on insights →</p>
          </a>

          <div className="rounded border border-border bg-panel px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                {myDepartment ? `${myDepartment[0].toUpperCase() + myDepartment.slice(1)} — recent activity` : "Recent activity"}
              </h2>
              <a href="/dashboard/timeline" className="text-xs text-brass hover:text-brass-bright">
                View timeline →
              </a>
            </div>

            {!myDepartment && (
              <p className="text-sm text-muted/70">
                Set your department on your <a href="/dashboard/profile" className="text-brass">profile</a> to
                see activity specific to your team.
              </p>
            )}
            {myDepartment && (deptInteractions ?? []).length === 0 && (
              <p className="text-sm text-muted/70">Nothing captured in this department yet.</p>
            )}
            <div className="space-y-2">
              {(deptInteractions ?? []).map((it) => (
                <div key={it.id} className="text-sm border-l-2 border-border pl-3 py-0.5">
                  <p className="text-paper/90">{it.summary ?? it.raw_content}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {new Date(it.occurred_at).toLocaleDateString()}
                    {it.is_decision ? " · Decision" : ""}
                  </p>
                </div>
              ))}
            </div>

            {deptTopTopics.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-4 pt-3 border-t border-border">
                <span className="text-xs text-muted mr-1">Trending in your department:</span>
                {deptTopTopics.map((t) => (
                  <span key={t} className="text-xs rounded-full border border-border text-muted px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded border border-border bg-panel px-6 py-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-4">Company overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-display text-brass-bright">{s.value}</p>
                  <p className="text-xs text-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {!hasAnyActivity && (
            <div className="rounded border border-border bg-panel px-6 py-5">
              <h2 className="text-sm font-medium text-paper mb-3">Get started</h2>
              <ul className="space-y-2 text-sm text-muted">
                <li>
                  → Upload a document under{" "}
                  <a href="/dashboard/upload" className="text-brass hover:text-brass-bright">
                    Documents
                  </a>
                </li>
                <li>
                  → Capture your first note (typed or spoken) under{" "}
                  <a href="/dashboard/notes" className="text-brass hover:text-brass-bright">
                    Notes
                  </a>
                </li>
                <li>
                  → Ask a question grounded in what you&apos;ve captured in{" "}
                  <a href="/dashboard/chat" className="text-brass hover:text-brass-bright">
                    AI Workspace
                  </a>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Side panel: reporting line */}
        <div className="space-y-6">
          <div className="rounded border border-border bg-panel px-5 py-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">Reporting line</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted">Manager</p>
                <p className="text-paper">{managerProfile?.full_name ?? "Not set"}</p>
              </div>
              {directReports.length > 0 && (
                <div>
                  <p className="text-xs text-muted mb-1">Direct reports ({directReports.length})</p>
                  <div className="space-y-1">
                    {directReports.map((r) => (
                      <p key={r.profile_id} className="text-paper/90">
                        {r.profiles?.full_name ?? "Unnamed"}
                        {r.job_title ? ` — ${r.job_title}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {myDepartment && (
            <div className="rounded border border-border bg-panel px-5 py-5">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
                {myDepartment[0].toUpperCase() + myDepartment.slice(1)} team
              </h2>
              {teammates.length === 0 ? (
                <p className="text-sm text-muted/70">No one else listed in this department yet.</p>
              ) : (
                <div className="space-y-1.5 text-sm">
                  {teammates.map((t) => (
                    <p key={t.profile_id} className="text-paper/90">
                      {t.profiles?.full_name ?? "Unnamed"}
                      {t.job_title ? <span className="text-muted"> — {t.job_title}</span> : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
