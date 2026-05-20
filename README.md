# Resume-Custom Voice Interview App

A standalone Next.js app for invite-based software engineering interviews powered by OpenAI Realtime voice sessions. Candidates upload a resume first; the app extracts structured context, creates a customized interviewer prompt, records the interview, and stores the resume, transcript events, recording, and reviewer summary.

## Security: rotate every secret before first run

If you cloned this repo with a tracked `.env` (older revisions had one), rotate every value below before using the app. The committed file has been removed; if it ever existed on the remote, treat all of these as compromised:

- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_ANON_KEY` if you reuse it elsewhere)
- `AUTH0_CLIENT_SECRET`
- `AUTH0_SECRET` (rotate to invalidate existing sessions)
- `INVITE_SIGNING_SECRET` (rotates all outstanding invite tokens and candidate session cookies)
- Any database password that appeared in `.env`

Then put fresh values into `.env.local` (gitignored), never `.env`.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Add a fresh `OPENAI_API_KEY`.
3. Create a Supabase project.
4. Run `supabase/migrations/0001_interview_agent.sql` in the Supabase SQL Editor.
5. Confirm the private Storage buckets `resumes` and `interview-recordings` exist.
6. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. `SUPABASE_SERVICE_ROLE_KEY` must be the `service_role` JWT from Supabase Dashboard -> Project Settings -> API -> Project API keys -> `service_role` (decode the JWT payload to confirm `"role":"service_role"`). It is server-only and never returned to the browser. Setting it to the anon key causes uploads to fail with "new row violates row-level security policy".
7. Set a strong random `INVITE_SIGNING_SECRET` (used for both invite tokens and candidate session cookies).
8. Add your existing Auth0 Regular Web Application values: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and a 32-byte hex `AUTH0_SECRET`.
9. Set `AUTH0_ADMIN_EMAILS` to a comma-separated list of admin emails (case-insensitive). In production, an unset or empty value blocks all admin access. In dev/test, an unset value falls back to "any signed-in user is an admin" with a console warning.
10. Set `APP_BASE_URL` and `NEXT_PUBLIC_APP_URL` to your app URL.
11. In Auth0, allow `http://localhost:3000/auth/callback` as a callback URL and `http://localhost:3000` as a logout URL for local development.
12. Run `npm install` and `npm run dev`.

Without Supabase env vars, local development and tests use `.local-data/store.json` plus local upload files. Production requires Supabase.

### Optional environment variables

- `OPENAI_TEXT_MODEL` (default `gpt-5.5`)
- `OPENAI_REALTIME_MODEL` (default `gpt-realtime-2`)
- `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-transcribe-diarize`; the recording route auto-uses `diarized_json` for any model whose name contains `diarize`)
- `OPENAI_REALTIME_TRANSCRIBE_MODEL` (input transcription used inside the realtime session; default `gpt-realtime-whisper`)
- `INTERVIEW_AGENT_STORE_FILE` (local JSON store for dev/test fallback)
- `NEXT_PUBLIC_MOCK_REALTIME=1` (skip real WebRTC, run a deterministic mock interview; used by e2e)

## Scripts

```bash
npm run dev
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

`npm run lint` also runs `scripts/check-no-secrets.sh`, which fails the build if a tracked `.env` reappears.

## Deployment

The repo is set up for Vercel. Make sure your local Vercel CLI is current:

```bash
npm i -g vercel@latest
```

Then provision the env (use `vercel env pull .env.local` afterwards to mirror what Vercel has):

```bash
vercel link
vercel env add OPENAI_API_KEY
vercel env add OPENAI_TEXT_MODEL
vercel env add OPENAI_REALTIME_MODEL
vercel env add OPENAI_TRANSCRIBE_MODEL
vercel env add OPENAI_REALTIME_TRANSCRIBE_MODEL
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add INVITE_SIGNING_SECRET
vercel env add AUTH0_DOMAIN
vercel env add AUTH0_CLIENT_ID
vercel env add AUTH0_CLIENT_SECRET
vercel env add AUTH0_SECRET
vercel env add AUTH0_ADMIN_EMAILS
vercel env add APP_BASE_URL
vercel env add NEXT_PUBLIC_APP_URL
vercel deploy -y
```
