import { createClient } from "@/lib/supabase/server";

export default async function TopBar() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let companyName = "";
  let fullName = "";
  let role = "";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role, company_id, companies(name)")
      .eq("id", user.id)
      .single();

    fullName = profile?.full_name ?? "";
    role = profile?.role ?? "";
    // @ts-expect-error - joined relation shape
    companyName = profile?.companies?.name ?? "";
  }

  const initials = fullName
    ? fullName
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-ink">
      <span className="text-sm text-muted">{companyName}</span>
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-brass text-ink text-xs font-medium flex items-center justify-center">
          {initials}
        </div>
        <span className="text-sm text-paper">{fullName}</span>
        {role && (
          <span className="text-[11px] uppercase tracking-wide text-brass border border-brass/40 rounded px-2 py-0.5">
            {role}
          </span>
        )}
        <form action="/auth/signout" method="post">
          <button className="text-xs text-muted hover:text-paper underline">Log out</button>
        </form>
      </div>
    </header>
  );
}
