create extension if not exists pgcrypto;

create table if not exists public.interview_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  role_title text not null,
  level text not null,
  job_description text not null default '',
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'revoked')),
  created_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references public.interview_invites(id),
  candidate_name text not null,
  candidate_email text,
  role_title text not null,
  level text not null,
  job_description text not null default '',
  status text not null default 'ready' check (status in ('ready', 'in_progress', 'completed', 'failed')),
  resume_path text,
  resume_filename text,
  recording_path text,
  parsed_resume jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_events (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  source text not null check (source in ('candidate', 'agent', 'system')),
  type text not null,
  text text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_summaries (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references public.interviews(id) on delete cascade,
  model text not null,
  evidence jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  follow_up_questions jsonb not null default '[]'::jsonb,
  transcript_path text,
  created_at timestamptz not null default now()
);

create index if not exists interview_invites_token_hash_idx on public.interview_invites(token_hash);
create index if not exists interviews_status_created_at_idx on public.interviews(status, created_at desc);
create index if not exists interview_events_interview_created_at_idx on public.interview_events(interview_id, created_at);

insert into storage.buckets (id, name, public)
values
  ('resumes', 'resumes', false),
  ('interview-recordings', 'interview-recordings', false)
on conflict (id) do nothing;
