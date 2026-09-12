# My Campus Buddy — Production App (HANDOFF)

This is the **real, production-grade** application — separate from:
- the marketing site + simulated `/demo` (repo: `khursheed-research/my-campus-buddy`)

This repo has real auth, real account creation, real data upload, and (as it's built out) real
AI pattern-learning and real integrations. No mock data, no simulated buttons.

## Where things live
- **Supabase project**: `my-campus-buddy-prod`, ref `mttgxqemfqswdxdjrsal`, region ap-south-1,
  org "Corporate Intelligence". Fully separate free-tier project from the demo's Supabase
  project — its own DB, auth, storage, quota.
- **Vercel / GitHub**: not yet created — see "Your Part" below.

## Stack
- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase: Auth, Postgres (+ pgvector), Storage, Realtime, pg_cron
- AssemblyAI: speech-to-text for real voice capture
- Twilio: real outbound/inbound calling
- Google OAuth: Gmail + Calendar integration
- Gemini API: AI extraction + embeddings (same as the demo)

## What's built so far
- `middleware.ts` — protects all routes except `/login`, `/signup`, `/auth/*`; redirects
  logged-in users away from auth pages.
- `app/(auth)/signup` — real signup form (name, company, email, password) → Supabase Auth,
  triggers a real verification email.
- `app/(auth)/login` — real login form.
- `app/auth/callback` — exchanges the email verification code for a session.
- `app/auth/signout` — logs out.
- `app/dashboard` — first real authenticated page. On first login, provisions a `companies` row
  from the signup's company name and links the user's `profiles` row to it as `admin` /
  `executive` clearance (matches the /blueprint doc's role model).
- `supabase/migrations/0001_init_auth_and_tenancy.sql` — `companies` + `profiles` tables, RLS
  scoped by `company_id`, auto-profile-creation trigger on signup. Already applied to the live
  Supabase project.

## Not built yet (next up)
1. Real file/document upload → Supabase Storage, tagged by `company_id`.
2. Embeddings pipeline (pgvector + Gemini) for pattern-learning / semantic search.
3. Google OAuth connection flow (Gmail + Calendar).
4. AssemblyAI voice capture wiring.
5. Twilio calling — **deferred until there's a real paying customer** (Twilio's 30-day trial
   genuinely expires; post-trial billing is usage-based/pay-as-you-go with no forced
   subscription, but Anwar chose to hold off rather than add a card with no revenue yet). When
   revisited: phone number provisioning, webhook-based call recording + transcription per the
   `/blueprint` doc's recommended "post-call webhook" approach, not live streaming.
6. Additional schema from `/blueprint`: `leads`, `interactions`, `strategies`, `outcomes`, `tags`.

## Your Part
- Create the GitHub repo (or give Claude a PAT to create/push to one) — suggested name
  `my-campus-buddy-prod` to match the Supabase project.
- Create a new Vercel project pointed at that repo (separate from the existing `my-campus-buddy`
  Vercel project).
- Supply remaining credentials as environment variables (never commit `.env.local`):
  Twilio Auth Token + phone number, Google OAuth Client Secret.
