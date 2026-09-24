-- 0001_platform.sql — control plane (spec §4.2).
-- Idempotent and append-only: never edit after it has been applied; add 0002+.
-- Deviations from the spec text, each recorded in docs/DECISIONS.md:
--   D12 claims are read through platform.jwt_claims(), which tolerates the empty
--       string a pooled connection leaves behind after a transaction-local set.
--   D13 security definer functions pin search_path.
--   D14 explicit grants on the platform schema; RLS (no policy) on tenants,
--       tenant_domains, heartbeat and schema_migrations so only the service role
--       reads them even though the schema is exposed to the API.
--   D15 platform_admins gets a read-own policy (requirePlatformAdmin).
--   D16 the audit trigger never fails the write it records.

create schema if not exists platform;

create table if not exists platform.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  status text not null default 'draft' check (status in ('draft','live','paused','archived')),
  plan text not null default 'starter',
  features jsonb not null default '{}'::jsonb,
  brand jsonb not null default '{}'::jsonb,
  timezone text not null default 'America/Chicago',
  currency char(3) not null default 'USD',
  env_prefix text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform.tenant_domains (
  host text primary key check (host = lower(host) and position(':' in host) = 0),  -- normalized: lowercase, no port
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  is_primary boolean not null default false,
  verified_at timestamptz,                       -- null = awaiting DNS (its own state, not 'failed')
  last_check_at timestamptz, last_check_error text
);
create unique index if not exists tenant_domains_one_primary on platform.tenant_domains(tenant_id) where is_primary;
create index if not exists tenant_domains_tenant on platform.tenant_domains(tenant_id);

create table if not exists platform.tenant_secrets (   -- factory-only; RLS: no policy -> only service role
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  kind text not null, payload jsonb not null, updated_at timestamptz not null default now(),
  primary key (tenant_id, kind)
);
alter table platform.tenant_secrets enable row level security;

create table if not exists platform.staff_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  role text not null check (role in ('owner','manager','staff')),
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index if not exists staff_memberships_tenant on platform.staff_memberships(tenant_id);
alter table platform.staff_memberships enable row level security;
drop policy if exists staff_read_own on platform.staff_memberships;
create policy staff_read_own on platform.staff_memberships for select using (user_id = auth.uid());

create table if not exists platform.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table platform.platform_admins enable row level security;
drop policy if exists platform_admins_read_own on platform.platform_admins;
create policy platform_admins_read_own on platform.platform_admins for select using (user_id = auth.uid());

create table if not exists platform.audit_log (
  id bigserial primary key,
  tenant_id uuid references platform.tenants(id),
  user_id uuid, table_name text not null, row_id uuid, action text not null check (action in ('insert','update','delete')),
  diff jsonb, at timestamptz not null default now()
);
create index if not exists audit_log_tenant_row on platform.audit_log(tenant_id, table_name, row_id, at desc);
alter table platform.audit_log enable row level security;
drop policy if exists audit_staff_read on platform.audit_log;
create policy audit_staff_read on platform.audit_log for select
  using (tenant_id in (select tenant_id from platform.staff_memberships where user_id = auth.uid()));

create table if not exists platform.heartbeat (id int primary key default 1 check (id = 1), at timestamptz not null);

create table if not exists platform.schema_migrations (filename text primary key, applied_at timestamptz not null default now());

alter table platform.tenants enable row level security;
alter table platform.tenant_domains enable row level security;
alter table platform.heartbeat enable row level security;
alter table platform.schema_migrations enable row level security;

-- Grants (D14). The schema is exposed to the API so staff can read their own
-- membership row through RLS; everything else is service-role only.
grant usage on schema platform to anon, authenticated, service_role;
revoke all on all tables in schema platform from anon, authenticated;
grant select on platform.staff_memberships, platform.platform_admins, platform.audit_log to authenticated;
grant all on all tables in schema platform to service_role;
grant usage, select on all sequences in schema platform to service_role;
alter default privileges in schema platform grant all on tables to service_role;
alter default privileges in schema platform grant usage, select on sequences to service_role;

-- Helper functions used by every tenant-table policy ------------------------------
create or replace function platform.jwt_claims() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function platform.jwt_tenant_id() returns uuid language sql stable as $$
  select nullif(platform.jwt_claims()->>'tenant_id', '')::uuid
$$;
create or replace function platform.is_member(t uuid) returns boolean language sql stable security definer
  set search_path = '' as $$
  select exists (select 1 from platform.staff_memberships m where m.user_id = auth.uid() and m.tenant_id = t)
$$;
create or replace function platform.member_role(t uuid) returns text language sql stable security definer
  set search_path = '' as $$
  select role from platform.staff_memberships m where m.user_id = auth.uid() and m.tenant_id = t
$$;
-- Read access: anon tenant token OR staff membership.
create or replace function platform.can_read(t uuid) returns boolean language sql stable as $$
  select coalesce(platform.jwt_tenant_id() = t, false) or platform.is_member(t)
$$;
create or replace function platform.can_write(t uuid) returns boolean language sql stable as $$
  select platform.is_member(t)
$$;
grant execute on all functions in schema platform to anon, authenticated, service_role;

-- Tenant guard trigger: stamps tenant_id from the anon claim when absent; refuses mismatches;
-- refuses NULL for service role (the admin client must always say which tenant it acts as).
create or replace function platform.tenant_guard() returns trigger language plpgsql as $$
declare claim uuid := platform.jwt_tenant_id();
begin
  if new.tenant_id is null then
    if claim is null then raise exception 'tenant_id required' using errcode = '23502'; end if;
    new.tenant_id := claim;
  end if;
  if tg_op = 'UPDATE' and new.tenant_id <> old.tenant_id then raise exception 'tenant_id is immutable' using errcode = '23514'; end if;
  if claim is not null and new.tenant_id <> claim then raise exception 'tenant mismatch' using errcode = '42501'; end if;
  if platform.jwt_claims()->>'role' = 'authenticated' and not platform.is_member(new.tenant_id) then
    raise exception 'not a member of tenant' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Audit trigger (attached to tenant tables in 0002/0003). Bookkeeping never fails
-- the operation it records (D16): a failed insert is raised as a WARNING (which
-- reaches the server log) and the write proceeds.
create or replace function platform.audit() returns trigger language plpgsql security definer
  set search_path = '' as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  begin
    insert into platform.audit_log(tenant_id, user_id, table_name, row_id, action, diff)
    values (r.tenant_id, auth.uid(), tg_table_name, r.id, lower(tg_op),
            case tg_op when 'DELETE' then to_jsonb(old) else jsonb_strip_nulls(to_jsonb(new) - 'updated_at') end);
  exception when others then
    raise warning 'audit_log insert failed for %.% %: % (%)', tg_table_schema, tg_table_name, r.id, sqlerrm, sqlstate;
  end;
  return r;
end $$;
