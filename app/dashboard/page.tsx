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

  const [{ count: docCount }, { count: noteCount }, { count: decisionCount }, { count: memberCount }] =
    await Promise.all([
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
    ]);

  const stats = [
    { label: "Documents", value: docCount ?? 0 },
    { label: "Notes captured", value: noteCount ?? 0 },
    { label: "Decisions detected", value: decisionCount ?? 0 },
    { label: "Team members", value: memberCount ?? 0 },
  ];

  const hasAnyActivity = (docCount ?? 0) > 0 || (noteCount ?? 0) > 0;

  return (
    <div className="p-8 max-w-4xl">
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
