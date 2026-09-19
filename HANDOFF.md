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
9. **Contribution & Rewards** — DONE. `/dashboard/contribution`: real leaderboard (1pt/note,
   3pt/decision, 2pt/upload — transparent scoring shown on the page) computed from real
   `interactions`/`documents` rows, plus an AI-generated 6-month narrative report via the new
   `generate-report` Edge Function. The function aggregates real stats server-side and instructs
   Gemini to use ONLY that real data — never invent names/numbers — and explicitly says so
   honestly when there isn't enough activity yet rather than generating filler.
10. **Strategy Advisor** — DONE. `/dashboard/strategy`: describe a situation, get a
    recommendation via the new `generate-strategy` Edge Function — same retrieval pattern as
    chat (embeds the situation, pulls relevant real document/interaction context via
    `match_document_chunks`/`match_interactions`), explicitly told to say so plainly and fall
    back to clearly-labeled general advice when no real company history matches, rather than
    inventing company-specific claims.
11. **Telephony (Twilio)** — CODE COMPLETE, awaiting Anwar's Twilio credentials to go live
    (per his choice: build now, keep on free trial for now, upgrade later when there's revenue).
    - `app/api/twilio/voice` — TwiML webhook: answers inbound calls, records them, validates
      Twilio's request signature.
    - `app/api/twilio/recording-status` — the real substance: on a completed recording, fetches
      the audio (Twilio Basic Auth), transcribes via AssemblyAI, extracts
      summary/sentiment/next_step/is_decision/topics via Gemini (same schema as
      `process-interaction`), embeds it, and inserts a real `interactions` row
      (type=`call`, source=`call_recording`) — which means calls automatically show up in
      Timeline, Decision Memory, Knowledge Graph, Insights, and Strategy Advisor with zero
      extra work, since they share the same table. Idempotent by `external_call_sid` (Twilio
      may retry webhooks). Signature-validated.
    - New `twilio_numbers` table maps a real Twilio phone number → company + default
      department, so a webhook knows which tenant a call belongs to. Registered via
      `/dashboard/admin`'s new "Call capture (Twilio)" section (admin-only).
    - **Important runtime distinction discovered/applied here**: these are Next.js Route
      Handlers (Vercel), not Supabase Edge Functions — so unlike every other secret in this
      project, their env vars must be **Vercel env vars**, not Supabase secrets. This means
      `GEMINI_API_KEY` and `ASSEMBLYAI_API_KEY` now need to exist in **both** places (Supabase
      secrets for the Edge Functions, Vercel env vars for these webhook routes) — intentional
      duplication, not a mistake.
    - **New Vercel env vars needed** (Claude has the actual values from earlier legitimate
      retrieval during this project's own debugging — ask Claude for them in chat rather than
      storing them here; real secrets never belong in a committed repo file, even
      documentation):
      - `SUPABASE_SERVICE_ROLE_KEY` (same value used by Supabase itself — ask Claude)
      - `GEMINI_API_KEY` (same value already working in Supabase secrets — ask Claude)
      - `ASSEMBLYAI_API_KEY` (same value already in Supabase secrets — ask Claude)
      - `TWILIO_ACCOUNT_SID` (the one Anwar provided earlier in chat)
    - **Still genuinely missing, only Anwar can provide**: `TWILIO_AUTH_TOKEN` (never given),
      and a real Twilio phone number (trial account hasn't gotten one yet — he chose to defer
      this step). Both needed before this phase can actually go live.
    - **Once he has both**: (1) add all env vars above to Vercel, (2) register the number in
      `/dashboard/admin`, (3) in Twilio Console, set that number's "A call comes in" webhook
      (HTTP POST) to `https://my-campus-buddy-prod.vercel.app/api/twilio/voice`.
    - **Scope note**: inbound call recording capture only — no outbound click-to-call in this
      version (not in the original blueprint's stated approach either, which specifically
      recommended post-call webhook capture over live streaming).

## Your Part
- Create the GitHub repo (or give Claude a PAT to create/push to one) — suggested name
  `my-campus-buddy-prod` to match the Supabase project.
- Create a new Vercel project pointed at that repo (separate from the existing `my-campus-buddy`
  Vercel project).
- Supply remaining credentials as environment variables (never commit `.env.local`):
  Twilio Auth Token + phone number, Google OAuth Client Secret.

## Visual redesign + org hierarchy overhaul (post-roadmap)
After all 11 phases, Anwar flagged the app looked unprofessional ("like a kid's sketch") and
requested a proper visual identity plus a much more structured account-creation flow. Both done:

**Design system** (grounded in the product's own "institutional memory / legacy" positioning,
not a generic SaaS look): Ink `#0b0e14` background, Panel `#12161f`, Paper `#e9e6dd` text,
Brass `#b8934a` as the single sparing accent. Fraunces (serif) for headings, Public Sans for
body — both self-hosted via `@fontsource` packages (not `next/font/google`), specifically so
the build never depends on reaching Google's font CDN at build time. Tokens defined as CSS
variables in `globals.css`, exposed to Tailwind via `tailwind.config.ts`.

**App shell**: `app/dashboard/layout.tsx` + `components/Sidebar.tsx` + `components/TopBar.tsx`
now wrap every dashboard page with persistent grouped navigation (Overview / Capture /
Intelligence / Company) and a top bar showing company name, user name, and role — replacing
the old pattern of every page hand-rolling its own "← Back to dashboard" link and a flat row of
button-links on the home page. This was the single biggest fix for the "looks broken" feedback.
Dashboard home (`/dashboard`) is now a real overview with live stat counts (documents, notes,
decisions, team size) and a getting-started checklist for empty accounts, not a link farm.

**Org hierarchy + account creation** (real structural change, not just cosmetic): expanded
`profiles.role` and `company_invites.role` to `founder | cto | admin | manager | member`.
- `founder`: the first person at a brand-new company (not matched by any pending invite).
  Redirected through a new **`/onboarding/company`** wizard collecting industry, year
  established, employee count, website, corporate office address, and manufacturing plant
  address (optional) — this is the real company profile, not just a name.
- Invite permissions are enforced server-side via a new `can_invite_role()` SECURITY DEFINER
  function used directly in `company_invites`' RLS insert policy (not just hidden in the UI):
  founder → cto/admin/manager/member, cto → admin/manager/member, manager → member only.
  Admin does not invite anyone in this model — matches Anwar's description where admin's role
  is access/settings management, not recruiting.
- `is_admin()` (used by the existing Google-connection/Twilio-number/profile-update policies)
  now means founder OR cto OR admin, since all three sit above manager/member.
- `/dashboard/admin`'s invite form now only shows roles the current user is actually allowed to
  invite, computed client-side from the same hierarchy the RLS enforces server-side.
- Anwar's own existing account was updated from `admin` to `founder` to match (he's the actual
  founder of his test company; this role didn't exist yet when his account was first created).

**Scope note**: this pass covered the account-creation flow and the shell/navigation
consistently everywhere; a page-by-page micro-polish pass (spacing, empty states, mobile
responsiveness) was not the focus and could be a worthwhile follow-up later.
