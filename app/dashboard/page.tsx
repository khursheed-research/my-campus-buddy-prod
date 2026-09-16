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
      const companyName =
        (user.user_metadata?.company_name as string | undefined) || "My Organization";

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({ name: companyName })
        .select("id")
        .single();

      if (companyError) {
        return (
          <main className="min-h-screen p-8">
            <p className="text-red-400">
              Couldn&apos;t finish setting up your account: {companyError.message}
            </p>
            <p className="text-zinc-500 mt-2">
              Please refresh this page. If this keeps happening, contact support.
            </p>
          </main>
        );
      }

      if (company) {
        await supabase
          .from("profiles")
          .update({ company_id: company.id, role: "admin", clearance: "executive" })
          .eq("id", user.id);

        profile = { ...profile, company_id: company.id, role: "admin", clearance: "executive" };
      }
    }
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold mb-1">
        Welcome, {profile?.full_name || user.email}
      </h1>
      <p className="text-zinc-500 mb-8">
        Role: {profile?.role} · Clearance: {profile?.clearance}
      </p>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 max-w-2xl">
        <p className="text-zinc-400 mb-4">
          This is the real application shell — account creation, login, and
          multi-tenant company setup are live. Real file upload is live too.
        </p>
        <a
          href="/dashboard/upload"
          className="inline-block rounded-md bg-amber-500 text-black text-sm font-medium px-4 py-2 mr-3"
        >
          Upload documents →
        </a>
        <a
          href="/dashboard/notes"
          className="inline-block rounded-md border border-amber-500 text-amber-500 text-sm font-medium px-4 py-2 mr-3"
        >
          Notes →
        </a>
        <a
          href="/dashboard/chat"
          className="inline-block rounded-md border border-zinc-600 text-zinc-300 text-sm font-medium px-4 py-2 mr-3"
        >
          AI Workspace →
        </a>
        <a
          href="/dashboard/timeline"
          className="inline-block rounded-md border border-zinc-600 text-zinc-300 text-sm font-medium px-4 py-2 mr-3"
        >
          Timeline →
        </a>
        <a
          href="/dashboard/decisions"
          className="inline-block rounded-md border border-zinc-600 text-zinc-300 text-sm font-medium px-4 py-2 mr-3"
        >
          Decision Memory →
        </a>
        <a
          href="/dashboard/graph"
          className="inline-block rounded-md border border-zinc-600 text-zinc-300 text-sm font-medium px-4 py-2 mr-3"
        >
          Knowledge Graph →
        </a>
        <a
          href="/dashboard/admin"
          className="inline-block rounded-md border border-zinc-600 text-zinc-300 text-sm font-medium px-4 py-2 mr-3"
        >
          Admin & Access →
        </a>
        <a
          href="/dashboard/insights"
          className="inline-block rounded-md border border-zinc-600 text-zinc-300 text-sm font-medium px-4 py-2 mr-3"
        >
          Insights →
        </a>
        <a
          href="/dashboard/contribution"
          className="inline-block rounded-md border border-zinc-600 text-zinc-300 text-sm font-medium px-4 py-2 mr-3"
        >
          Contribution & Rewards →
        </a>
        <a
          href="/dashboard/strategy"
          className="inline-block rounded-md border border-zinc-600 text-zinc-300 text-sm font-medium px-4 py-2"
        >
          Strategy Advisor →
        </a>
      </div>

      <form action="/auth/signout" method="post" className="mt-8">
        <button className="text-sm text-zinc-500 underline">Log out</button>
      </form>
    </main>
  );
}
