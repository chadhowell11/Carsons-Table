-- Dev/CI only. Recreates the parts of a hosted Supabase project that our
-- migrations and clients depend on, so the platform can be exercised against a
-- plain Postgres: the API roles, default grants, the auth schema (GoTrue fills
-- it) and a minimal storage schema (the dev gateway's storage shim uses it).
-- Hosted Supabase already has all of this; never run it there.
-- Idempotent.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'dev-authenticator'; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Minimal storage schema, shaped like Supabase's (bucket id, object name, owner).
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null unique, public boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text not null, owner uuid,
  metadata jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (bucket_id, name));
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
drop policy if exists buckets_read on storage.buckets;
create policy buckets_read on storage.buckets for select using (true);
