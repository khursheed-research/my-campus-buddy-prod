import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${origin}/dashboard/admin?google_error=${oauthError}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/dashboard/admin?google_error=missing_code`);
  }

  const redirectUri = `${origin}/auth/google/callback`;

  // Exchange the real authorization code for real access/refresh tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/dashboard/admin?google_error=token_exchange_failed`);
  }

  const tokens = await tokenRes.json();

  // Fetch the connected Google account's email for display purposes.
  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userinfo = userinfoRes.ok ? await userinfoRes.json() : {};

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) {
    return NextResponse.redirect(`${origin}/dashboard/admin?google_error=no_company`);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: upsertError } = await supabase.from("google_connections").upsert(
    {
      company_id: profile.company_id,
      connected_by: user.id,
      google_email: userinfo.email ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: expiresAt,
      scopes: tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );

  if (upsertError) {
    return NextResponse.redirect(
      `${origin}/dashboard/admin?google_error=${encodeURIComponent(upsertError.message)}`
    );
  }

  return NextResponse.redirect(`${origin}/dashboard/admin?google_connected=1`);
}
