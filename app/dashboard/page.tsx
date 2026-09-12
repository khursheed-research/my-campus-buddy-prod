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

  // First login after signup: no company yet. Create one from the signup
  // metadata and link this profile to it.
  if (profile && !profile.company_id) {
    const companyName =
      (user.user_metadata?.company_name as string | undefined) || "My Organization";

    const { data: company } = await supabase
      .from("companies")
      .insert({ name: companyName })
      .select("id")
      .single();

    if (company) {
      await supabase
        .from("profiles")
        .update({ company_id: company.id, role: "admin", clearance: "executive" })
        .eq("id", user.id);

      profile = { ...profile, company_id: company.id, role: "admin", clearance: "executive" };
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
          className="inline-block rounded-md bg-amber-500 text-black text-sm font-medium px-4 py-2"
        >
          Upload documents →
        </a>
      </div>

      <form action="/auth/signout" method="post" className="mt-8">
        <button className="text-sm text-zinc-500 underline">Log out</button>
      </form>
    </main>
  );
}
