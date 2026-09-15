import { NextResponse } from "next/server";

// Builds the Google consent URL server-side so the Client ID never needs to
// be exposed as a NEXT_PUBLIC env var. Real OAuth, real scopes, real
// offline access (refresh token) for Gmail + Calendar.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
