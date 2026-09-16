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
2. **Core data model** — DONE. `leads`, `interactions`, `strategies`, `outcomes`, `tags` +
   `tag_assignments` tables, all company-scoped RLS, indexed for Timeline/Insights queries.
3. **Data Capture: manual notes** — DONE. `/dashboard/notes`: type a note, tagged by
   department, auto-extracted (summary/sentiment/next_step via `gemini-3.5-flash-lite`) and
   embedded (`gemini-embedding-001`) via the `process-interaction` Edge Function. Searchable
   through `match_interactions` RPC (same pattern as `match_document_chunks`).
4. **AI Workspace (grounded chat)** — DONE. `/dashboard/chat`: embeds the question
   (`gemini-embedding-001`), retrieves top matches from `match_document_chunks` +
   `match_interactions`, answers with `gemini-3.5-flash` using ONLY that retrieved context —
   explicitly told to say "I don't have that information" rather than guess. Shows source
   snippets under each answer. No chat history persistence yet (kept simple for this phase —
   ephemeral per browser session).
5. **Decision Memory, Timeline, Knowledge Graph** — DONE.
   - `/dashboard/timeline`: chronological feed of all captured interactions, department filter,
     colored by sentiment, decisions flagged.
   - `/dashboard/decisions`: real decisions only (auto-detected by extraction, not manually
     flagged — see `is_decision` below), with text search across summary/content/topics.
   - `/dashboard/graph`: topic co-occurrence graph built from real captured data — nodes are
     topics (sized by frequency), edges are topics that appeared together in the same note.
     Plain SVG, no extra graph library. Click a node to see the real interactions behind it.
   - Extraction (`process-interaction`) extended to also detect `is_decision` (boolean) and
     `topics` (up to 5 short strings) automatically — no extra input required from whoever
     writes the note, consistent with the product's low-friction capture philosophy.
6. **Real voice capture (AssemblyAI)** — DONE. Mic button on `/dashboard/notes` records
   audio, uploads to AssemblyAI via the new `transcribe-audio` Edge Function
   (upload → submit with required `speech_models` param → poll until complete), and drops the
   real transcript into the note text for review before saving. Important: the AssemblyAI key
   must be a **Supabase Edge Function secret**, not a Vercel env var — Vercel env vars are only
   visible to the Next.js frontend, not to Supabase's Edge Functions, which run on entirely
   separate infrastructure. (This was originally set up wrong — corrected during this phase.)
7. **Admin & Access + Google integration** — DONE (backend + UI complete; ONE manual step
   remains for Anwar — see below).
   - `/dashboard/admin`: team directory (admins can change role/clearance for anyone in the
     company), invite-by-email (creates a `company_invites` row; when that email signs up,
     `/dashboard`'s provisioning logic attaches them to the existing company instead of
     creating a new one — real invite flow, not just a UI mockup), and Google connection
     status/button.
   - Real Google OAuth: `/auth/google/start` builds the consent URL server-side (keeps the
     Client ID out of the browser bundle), `/auth/google/callback` exchanges the code for real
     access+refresh tokens, fetches the connected account's email, and stores everything in a
     new `google_connections` table (one per company, admin-managed via RLS).
   - **Scope note**: this phase connects the account and stores real tokens — it does NOT yet
     pull actual emails/events into `interactions`. That's a natural follow-on, not yet
     scheduled as its own phase.
   - **Anwar's one remaining step**: add the exact redirect URI
     `https://my-campus-buddy-prod.vercel.app/auth/google/callback` to the OAuth Client's
     "Authorized redirect URIs" list in Google Cloud Console (Credentials → the OAuth Client →
     Edit). Without this, Google will reject the callback with a redirect_uri_mismatch error.
     This is a config change only he can make (Claude can't edit his Google Cloud Console).
8. **Insights & Analytics** — DONE. `/dashboard/insights` with real Recharts-powered
   dashboards: 14-day activity trend, sentiment breakdown (pie), decisions by department (bar),
   lead pipeline funnel (bar — will show all zeros until lead capture UI exists, honestly
   labeled rather than faked), and top topics. Every chart reads real data and shows an honest
   empty-state message rather than a populated-looking placeholder when there's nothing yet.
9. **Contribution & Rewards** — NOT STARTED.
10. **Strategy Advisor** — NOT STARTED.
11. **Telephony (Twilio)** — DEFERRED until a paying customer exists.

## Your Part
- Create the GitHub repo (or give Claude a PAT to create/push to one) — suggested name
  `my-campus-buddy-prod` to match the Supabase project.
- Create a new Vercel project pointed at that repo (separate from the existing `my-campus-buddy`
  Vercel project).
- Supply remaining credentials as environment variables (never commit `.env.local`):
  Twilio Auth Token + phone number, Google OAuth Client Secret.
