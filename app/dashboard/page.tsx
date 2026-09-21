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
    { count: docCount },
    { count: noteCount },
    { count: decisionCount },
    { count: memberCount },
    { count: myNotesYTD },
    { count: myDecisionsYTD },
    { count: myUploadsYTD },
    { data: myVotesYTD },
  ] = await Promise.all([
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

  return (
    <div className="p-8 max-w-4xl">
      <a
        href="/dashboard/contribution"
        className="block rounded border border-brass/40 bg-panel px-6 py-5 mb-8 hover:border-brass transition-colors"
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

      <h1 className="font-display text-3xl mb-1">Welcome, {profile?.full_name || user.email}</h1>
      <p className="text-muted mb-8">Here&apos;s where things stand right now.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map((s) => (
          <div key={s.label} className="rounded border border-border bg-panel px-5 py-4">
            <p className="text-3xl font-display text-brass-bright">{s.value}</p>
            <p className="text-sm text-muted mt-1">{s.label}</p>
          </div>
        ))}
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
  );
}
