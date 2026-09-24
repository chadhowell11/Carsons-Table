-- Positive control for guard 5: a tenant table missing RLS, policies, triggers,
-- index, with a float price and a naive timestamp.
create table if not exists widgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(8,2),
  starts timestamp,
  total_cents integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
