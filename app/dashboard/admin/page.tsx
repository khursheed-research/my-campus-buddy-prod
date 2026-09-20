"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Member = {
  id: string;
  full_name: string | null;
  role: string;
  clearance: string;
  manager_id: string | null;
};

const ROLES = ["founder", "cto", "admin", "manager", "member"];
const CLEARANCES = ["executive", "leadership", "manager", "ic"];

function invitableRoles(currentRole: string): string[] {
  if (currentRole === "founder") return ["cto", "admin", "manager", "member"];
  if (currentRole === "cto") return ["admin", "manager", "member"];
  if (currentRole === "manager") return ["member"];
  return [];
}

function AdminPageInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentRole, setCurrentRole] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [googleConnection, setGoogleConnection] = useState<{ google_email: string } | null>(null);
  const [twilioNumber, setTwilioNumber] = useState<{ phone_number: string; department: string } | null>(null);
  const [newTwilioNumber, setNewTwilioNumber] = useState("");
  const [twilioMsg, setTwilioMsg] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteClearance, setInviteClearance] = useState("ic");
  const [inviteMsg, setInviteMsg] = useState("");

  async function loadAll(cid: string) {
    const [{ data: memberRows }, { data: empProfiles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role, clearance").eq("company_id", cid),
      supabase.from("employee_profiles").select("profile_id, manager_id").eq("company_id", cid),
    ]);
    const managerById = Object.fromEntries((empProfiles ?? []).map((e) => [e.profile_id, e.manager_id]));
    setMembers((memberRows ?? []).map((m) => ({ ...m, manager_id: managerById[m.id] ?? null })));

    const { data: conn } = await supabase
      .from("google_connections")
      .select("google_email")
      .eq("company_id", cid)
      .maybeSingle();
    setGoogleConnection(conn);

    const { data: twilio } = await supabase
      .from("twilio_numbers")
      .select("phone_number, department")
      .eq("company_id", cid)
      .maybeSingle();
    setTwilioNumber(twilio);
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, role")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);
      setIsAdmin(["founder", "cto", "admin"].includes(profile.role));
      setCurrentRole(profile.role);
      loadAll(profile.company_id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateMember(id: string, field: "role" | "clearance", value: string) {
    await supabase.from("profiles").update({ [field]: value }).eq("id", id);
    if (companyId) loadAll(companyId);
  }

  async function updateManager(memberId: string, managerId: string) {
    if (!companyId) return;
    await supabase.from("employee_profiles").upsert(
      { profile_id: memberId, company_id: companyId, manager_id: managerId || null, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" }
    );
    loadAll(companyId);
  }

  async function saveTwilioNumber(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !newTwilioNumber.trim()) return;

    const { error } = await supabase.from("twilio_numbers").upsert(
      { company_id: companyId, phone_number: newTwilioNumber.trim() },
      { onConflict: "company_id" }
    );

    setTwilioMsg(error ? error.message : "Saved.");
    if (!error) {
      setNewTwilioNumber("");
      loadAll(companyId);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !inviteEmail.trim()) return;

    const { error } = await supabase.from("company_invites").insert({
      company_id: companyId,
      email: inviteEmail.trim(),
      role: inviteRole,
      clearance: inviteClearance,
    });

    setInviteMsg(error ? error.message : `Invited ${inviteEmail}. They'll join automatically when they sign up with this email.`);
    setInviteEmail("");
  }

  const googleError = searchParams.get("google_error");
  const googleJustConnected = searchParams.get("google_connected");

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-2xl mt-4 mb-1">Admin & Access</h1>
      <p className="text-muted mb-6">
        {isAdmin ? "Manage your team and integrations." : "Your team and connected integrations."}
      </p>

      {/* Google integration */}
      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          Google integration
        </h2>
        {googleJustConnected && (
          <p className="text-signal-green text-sm mb-2">Google connected successfully.</p>
        )}
        {googleError && (
          <p className="text-signal-red text-sm mb-2">Google connection failed: {googleError}</p>
        )}
        <div className="rounded-md border border-border bg-panel px-4 py-3 flex items-center justify-between">
          {googleConnection ? (
            <p className="text-sm text-paper/90">
              Connected as <span className="text-brass">{googleConnection.google_email}</span>
            </p>
          ) : (
            <p className="text-sm text-muted">Not connected</p>
          )}
          {isAdmin && (
            <a
              href="/auth/google/start"
              className="text-sm rounded-md bg-brass text-black font-medium px-3 py-1.5"
            >
              {googleConnection ? "Reconnect" : "Connect Google"}
            </a>
          )}
        </div>
      </section>

      {/* Real phone calling */}
      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
          Call capture (Twilio)
        </h2>
        <div className="rounded-md border border-border bg-panel px-4 py-3 mb-3">
          {twilioNumber ? (
            <p className="text-sm text-paper/90">
              Registered number: <span className="text-brass">{twilioNumber.phone_number}</span>
            </p>
          ) : (
            <p className="text-sm text-muted">No Twilio number registered yet.</p>
          )}
        </div>
        {isAdmin && (
          <form onSubmit={saveTwilioNumber} className="flex gap-2">
            <input
              className="flex-1 rounded-md bg-panel border border-border px-3 py-2 text-sm"
              placeholder="+1XXXXXXXXXX"
              value={newTwilioNumber}
              onChange={(e) => setNewTwilioNumber(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-md bg-brass text-black text-sm font-medium px-4 py-2"
            >
              Save
            </button>
          </form>
        )}
        {twilioMsg && <p className="text-xs text-muted mt-2">{twilioMsg}</p>}
        <p className="text-xs text-muted/70 mt-2">
          Enter your real Twilio number exactly as it appears in your Twilio console (e.g.
          +14155551234), then set that number's &quot;A call comes in&quot; webhook in Twilio to
          this app&apos;s /api/twilio/voice URL.
        </p>
      </section>
      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">Team</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-2.5"
            >
              <span className="text-sm">{m.full_name ?? "Unnamed"}</span>
              {isAdmin ? (
                <div className="flex gap-2">
                  <select
                    className="text-xs rounded bg-panel-raised border border-border px-2 py-1"
                    value={m.role}
                    onChange={(e) => updateMember(m.id, "role", e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <select
                    className="text-xs rounded bg-panel-raised border border-border px-2 py-1"
                    value={m.clearance}
                    onChange={(e) => updateMember(m.id, "clearance", e.target.value)}
                  >
                    {CLEARANCES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    className="text-xs rounded bg-panel-raised border border-border px-2 py-1"
                    value={m.manager_id ?? ""}
                    onChange={(e) => updateManager(m.id, e.target.value)}
                  >
                    <option value="">No manager</option>
                    {members
                      .filter((mm) => mm.id !== m.id)
                      .map((mm) => (
                        <option key={mm.id} value={mm.id}>
                          Reports to: {mm.full_name ?? "Unnamed"}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <span className="text-xs text-muted">
                  {m.role} · {m.clearance}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Invite */}
      {invitableRoles(currentRole).length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted mb-3">
            Invite a teammate
          </h2>
          <form onSubmit={sendInvite} className="space-y-3">
            <input
              type="email"
              required
              className="w-full rounded-md bg-panel border border-border px-3 py-2"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                className="rounded-md bg-panel border border-border px-3 py-2 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {invitableRoles(currentRole).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md bg-panel border border-border px-3 py-2 text-sm"
                value={inviteClearance}
                onChange={(e) => setInviteClearance(e.target.value)}
              >
                {CLEARANCES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md bg-brass text-black text-sm font-medium px-4 py-2"
              >
                Invite
              </button>
            </div>
            {inviteMsg && <p className="text-sm text-muted">{inviteMsg}</p>}
          </form>
        </section>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  );
}
