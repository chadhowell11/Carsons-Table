-- 0003_requests.sql — created now, no UI (spec §4.4), so Phase 2 starts on a
-- settled schema. Staff-only reads: an anonymous tenant token can see none of
-- these rows. Public insert policies are deliberately absent; Phase 2 adds them
-- together with rate limiting. In Phase 1 these tables exist and are empty.

create table if not exists reservation_requests (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  location_id uuid not null references locations(id) on delete cascade,
  party_size int not null check (party_size between 1 and 100),
  requested_at timestamptz not null,
  name text not null, phone text, email text, notes text,
  status text not null default 'new' check (status in ('new','confirmed','declined','no_show')),
  staff_note text,
  source text not null default 'web' check (source in ('web','phone','walk_in','staff')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (phone is not null or email is not null));

create index if not exists reservation_requests_tenant on reservation_requests(tenant_id, requested_at);

alter table reservation_requests enable row level security;
drop policy if exists reservation_requests_read on reservation_requests;   create policy reservation_requests_read   on reservation_requests for select using (platform.is_member(tenant_id));
drop policy if exists reservation_requests_insert on reservation_requests; create policy reservation_requests_insert on reservation_requests for insert with check (platform.can_write(tenant_id));
drop policy if exists reservation_requests_update on reservation_requests; create policy reservation_requests_update on reservation_requests for update using (platform.can_write(tenant_id));
drop policy if exists reservation_requests_delete on reservation_requests; create policy reservation_requests_delete on reservation_requests for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists reservation_requests_guard on reservation_requests; create trigger reservation_requests_guard before insert or update on reservation_requests for each row execute function platform.tenant_guard();
drop trigger if exists reservation_requests_audit on reservation_requests; create trigger reservation_requests_audit after insert or update or delete on reservation_requests for each row execute function platform.audit();

create table if not exists orders (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  location_id uuid not null references locations(id) on delete cascade,
  mode text not null check (mode in ('pickup','curbside')),
  status text not null default 'new' check (status in ('new','accepted','ready','completed','cancelled')),
  customer_name text not null, customer_phone text, customer_email text, vehicle_note text,
  requested_time timestamptz,                            -- null = as soon as possible
  subtotal_cents integer not null check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_state text not null default 'none' check (payment_state in ('none','link_sent','paid')),
  square_order_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists orders_tenant_status on orders(tenant_id, status, created_at);

alter table orders enable row level security;
drop policy if exists orders_read on orders;   create policy orders_read   on orders for select using (platform.is_member(tenant_id));
drop policy if exists orders_insert on orders; create policy orders_insert on orders for insert with check (platform.can_write(tenant_id));
drop policy if exists orders_update on orders; create policy orders_update on orders for update using (platform.can_write(tenant_id));
drop policy if exists orders_delete on orders; create policy orders_delete on orders for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists orders_guard on orders; create trigger orders_guard before insert or update on orders for each row execute function platform.tenant_guard();
drop trigger if exists orders_audit on orders; create trigger orders_audit after insert or update or delete on orders for each row execute function platform.audit();

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid references menu_items(id) on delete set null,   -- provenance only; never joined for display
  name text not null,                                    -- snapshot at order time
  unit_price_cents integer not null check (unit_price_cents >= 0),
  qty integer not null check (qty > 0),
  modifiers jsonb not null default '[]'::jsonb,          -- snapshot: [{ group, label, price_delta_cents, market_price }]
  line_total_cents integer not null check (line_total_cents >= 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists order_items_tenant_order on order_items(tenant_id, order_id);

alter table order_items enable row level security;
drop policy if exists order_items_read on order_items;   create policy order_items_read   on order_items for select using (platform.is_member(tenant_id));
drop policy if exists order_items_insert on order_items; create policy order_items_insert on order_items for insert with check (platform.can_write(tenant_id));
drop policy if exists order_items_update on order_items; create policy order_items_update on order_items for update using (platform.can_write(tenant_id));
drop policy if exists order_items_delete on order_items; create policy order_items_delete on order_items for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists order_items_guard on order_items; create trigger order_items_guard before insert or update on order_items for each row execute function platform.tenant_guard();
drop trigger if exists order_items_audit on order_items; create trigger order_items_audit after insert or update or delete on order_items for each row execute function platform.audit();

create table if not exists notifications_outbox (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  channel text not null check (channel in ('email','sms')),
  to_address text not null, template text not null, data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sent','failed','suppressed')),
  attempts integer not null default 0 check (attempts >= 0), last_error text,
  send_after timestamptz not null default now(), sent_at timestamptz,
  related_table text, related_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists notifications_outbox_tenant_pending on notifications_outbox(tenant_id, status, send_after);

alter table notifications_outbox enable row level security;
drop policy if exists notifications_outbox_read on notifications_outbox;   create policy notifications_outbox_read   on notifications_outbox for select using (platform.is_member(tenant_id));
drop policy if exists notifications_outbox_insert on notifications_outbox; create policy notifications_outbox_insert on notifications_outbox for insert with check (platform.can_write(tenant_id));
drop policy if exists notifications_outbox_update on notifications_outbox; create policy notifications_outbox_update on notifications_outbox for update using (platform.can_write(tenant_id));
drop policy if exists notifications_outbox_delete on notifications_outbox; create policy notifications_outbox_delete on notifications_outbox for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists notifications_outbox_guard on notifications_outbox; create trigger notifications_outbox_guard before insert or update on notifications_outbox for each row execute function platform.tenant_guard();
drop trigger if exists notifications_outbox_audit on notifications_outbox; create trigger notifications_outbox_audit after insert or update or delete on notifications_outbox for each row execute function platform.audit();
