-- 0005_email.sql — suppression list for lib/email.js (spec §9). Platform-wide:
-- an address that bounced for one restaurant bounces for all. Service role only.

create table if not exists platform.email_suppressions (
  email text primary key check (email = lower(email)),
  reason text not null check (reason in ('bounce','complaint','unsubscribe','manual')),
  note text,
  created_at timestamptz not null default now()
);
alter table platform.email_suppressions enable row level security;
grant all on platform.email_suppressions to service_role;
