-- Negative control for guard 5: a fully compliant tenant table.
create table if not exists widgets (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  kind text not null check (kind in ('a','b')),
  price_cents integer check (price_cents >= 0), currency char(3) not null default 'USD',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists widgets_tenant on widgets(tenant_id);
alter table widgets enable row level security;
drop policy if exists widgets_read on widgets;   create policy widgets_read   on widgets for select using (platform.can_read(tenant_id));
drop policy if exists widgets_insert on widgets; create policy widgets_insert on widgets for insert with check (platform.can_write(tenant_id));
drop policy if exists widgets_update on widgets; create policy widgets_update on widgets for update using (platform.can_write(tenant_id));
drop policy if exists widgets_delete on widgets; create policy widgets_delete on widgets for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists widgets_guard on widgets; create trigger widgets_guard before insert or update on widgets for each row execute function platform.tenant_guard();
drop trigger if exists widgets_audit on widgets; create trigger widgets_audit after insert or update or delete on widgets for each row execute function platform.audit();
