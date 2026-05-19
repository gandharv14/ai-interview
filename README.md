# Resume-Custom Voice Interview App

A standalone Next.js app for invite-based software engineering interviews powered by OpenAI Realtime voice sessions. Candidates upload a resume first; the app extracts structured context, creates a customized interviewer prompt, records the interview, and stores the resume, transcript events, recording, and reviewer summary.

## Setup

Rotate any OpenAI API key that was shared in chat before using this app.

1. Copy `.env.example` to `.env.local`.
2. Add a fresh `OPENAI_API_KEY`.
3. Create a Supabase project.
4. Run `supabase/migrations/0001_interview_agent.sql` in the Supabase SQL Editor.
5. Confirm the private Storage buckets `resumes` and `interview-recordings` exist.
6. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
7. Set strong values for `INVITE_SIGNING_SECRET`, `ADMIN_PASSPHRASE`, and `ADMIN_SESSION_SECRET`.
8. Run `npm install` and `npm run dev`.

Without Supabase env vars, local development and tests use `.local-data/store.json` plus local upload files. Production requires Supabase.

## Scripts

```bash
npm run dev
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

## Deployment

Deploy preview builds with Vercel:

```bash
vercel link
vercel env add OPENAI_API_KEY
vercel env add OPENAI_TEXT_MODEL
vercel env add OPENAI_REALTIME_MODEL
vercel env add OPENAI_TRANSCRIBE_MODEL
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add INVITE_SIGNING_SECRET
vercel env add ADMIN_PASSPHRASE
vercel env add ADMIN_SESSION_SECRET
vercel env add NEXT_PUBLIC_APP_URL
vercel deploy -y
```
