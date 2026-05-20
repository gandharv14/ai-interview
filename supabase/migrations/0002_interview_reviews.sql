alter table public.interviews
  add column if not exists reserved_by_email text,
  add column if not exists reserved_at timestamptz,
  add column if not exists review_decision text check (review_decision in ('pass', 'fail')),
  add column if not exists reviewed_by_email text,
  add column if not exists reviewed_at timestamptz;

create index if not exists interviews_review_reservation_idx
  on public.interviews(review_decision, reserved_at desc);

create index if not exists interviews_review_decision_idx
  on public.interviews(review_decision, reviewed_at desc);
