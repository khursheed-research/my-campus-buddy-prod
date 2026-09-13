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
- `app/dashboard/upload` — real file upload → Supabase Storage (private, RLS-scoped per
  company). On upload, calls the `process-document` Edge Function to kick off real text
  extraction + embedding in the background; the page polls and shows live status
  (uploaded → processing → processed/error).
- `supabase/functions/process-document` — downloads the real uploaded file, extracts real text
  (PDF via `unpdf`, plain text/markdown via direct decode), splits it into ~1200-character
  overlapping chunks, embeds each chunk with Gemini's `text-embedding-004` (768 dimensions),
  and stores them in `document_chunks`. Uses the service-role key for the actual writes
  (outside RLS reach for regular users by design), but first checks the caller's own JWT can
  see the document at all (enforces company scoping before doing any real work).
- `supabase/migrations/0003_document_chunks_and_embeddings.sql` — `document_chunks` table
  (pgvector `vector(768)` column, HNSW cosine index), RLS scoped by `company_id`, and a
  `match_document_chunks(query_embedding, match_count)` RPC for real semantic search — scoped
  to the caller's own company inside the function itself, not just via RLS on the table.
  `GEMINI_API_KEY` is a **Supabase Edge Function secret**, not a Vercel env var — the frontend
  never touches it directly, same pattern as the demo project.

## Master roadmap (phases)
1. **Foundation** — DONE. Auth, multi-tenancy, file upload, embeddings/semantic search.
2. **Core data model** — leads, interactions, strategies, outcomes, tags tables per the
   `/blueprint` schema, company+department scoped.
3. **Data Capture: manual notes** — real version of the demo's "Type a Note," text-only for
   now, feeds the same extraction/embedding pipeline as documents.
4. **AI Workspace (grounded chat)** — real chat UI querying `match_document_chunks` +
   interactions.
5. **Decision Memory, Timeline, Knowledge Graph** — UI views over the interactions data.
6. **Real voice capture (AssemblyAI)** — wire up the already-provided key; voice becomes
   primary input per the product's voice-first principle.
7. **Admin & Access + Google integration** — user directory, clearance tiers, Gmail/Calendar
   OAuth flow using already-staged credentials.
8. **Insights & Analytics** — real dashboards, deferred until there's enough real usage data.
9. **Contribution & Rewards** — contribution scoring + six-month report to founder.
10. **Strategy Advisor** — AI recommendations from accumulated data.
11. **Telephony (Twilio)** — deferred until a paying customer exists.

Not yet built: everything from Phase 2 onward.

## Your Part
- Create the GitHub repo (or give Claude a PAT to create/push to one) — suggested name
  `my-campus-buddy-prod` to match the Supabase project.
- Create a new Vercel project pointed at that repo (separate from the existing `my-campus-buddy`
  Vercel project).
- Supply remaining credentials as environment variables (never commit `.env.local`):
  Twilio Auth Token + phone number, Google OAuth Client Secret.
