-- 0002_content.sql — tenant content tables (spec §4.3).
-- Every table carries the §4.2 macro: RLS, four policies, tenant_guard, audit.
-- Anonymous tenant tokens read only published rows; staff read drafts too.
-- Additions to the spec DDL (docs/DECISIONS.md D17): currency format checks and a
-- currency column on modifiers (price deltas are money), focal point and
-- event-range checks, a shape check on specials.schedule, hours_exceptions
-- open/close required when not closed.

create table if not exists locations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  name text not null, address_line1 text, address_line2 text, city text, region text, postal_code text, country char(2) default 'US',
  phone text, email text, lat double precision, lng double precision,
  ordering_mode text not null default 'off' check (ordering_mode in ('off','pickup','curbside','both')),
  reservation_mode text not null default 'off' check (reservation_mode in ('off','request')),
  status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists locations_tenant on locations(tenant_id);

alter table locations enable row level security;
drop policy if exists locations_read on locations;   create policy locations_read   on locations for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists locations_insert on locations; create policy locations_insert on locations for insert with check (platform.can_write(tenant_id));
drop policy if exists locations_update on locations; create policy locations_update on locations for update using (platform.can_write(tenant_id));
drop policy if exists locations_delete on locations; create policy locations_delete on locations for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists locations_guard on locations; create trigger locations_guard before insert or update on locations for each row execute function platform.tenant_guard();
drop trigger if exists locations_audit on locations; create trigger locations_audit after insert or update or delete on locations for each row execute function platform.audit();

create table if not exists hours (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  location_id uuid not null references locations(id) on delete cascade,
  dow smallint not null check (dow between 0 and 6),    -- 0 = Sunday, from lib/enums.js DOW
  service text not null,                                 -- 'lunch' | 'dinner' | 'bar' | 'brunch' (free text, labels in admin)
  opens time not null, closes time not null,             -- local wall clock in tenant timezone; closes may be < opens (past midnight)
  kitchen_closes time, status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists hours_tenant_loc on hours(tenant_id, location_id, dow);

alter table hours enable row level security;
drop policy if exists hours_read on hours;   create policy hours_read   on hours for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists hours_insert on hours; create policy hours_insert on hours for insert with check (platform.can_write(tenant_id));
drop policy if exists hours_update on hours; create policy hours_update on hours for update using (platform.can_write(tenant_id));
drop policy if exists hours_delete on hours; create policy hours_delete on hours for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists hours_guard on hours; create trigger hours_guard before insert or update on hours for each row execute function platform.tenant_guard();
drop trigger if exists hours_audit on hours; create trigger hours_audit after insert or update or delete on hours for each row execute function platform.audit();

create table if not exists hours_exceptions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  location_id uuid not null references locations(id) on delete cascade,
  on_date date not null, closed boolean not null default true, opens time, closes time, note text,
  status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (closed or (opens is not null and closes is not null)));

create index if not exists hours_exceptions_tenant on hours_exceptions(tenant_id, location_id, on_date);

alter table hours_exceptions enable row level security;
drop policy if exists hours_exceptions_read on hours_exceptions;   create policy hours_exceptions_read   on hours_exceptions for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists hours_exceptions_insert on hours_exceptions; create policy hours_exceptions_insert on hours_exceptions for insert with check (platform.can_write(tenant_id));
drop policy if exists hours_exceptions_update on hours_exceptions; create policy hours_exceptions_update on hours_exceptions for update using (platform.can_write(tenant_id));
drop policy if exists hours_exceptions_delete on hours_exceptions; create policy hours_exceptions_delete on hours_exceptions for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists hours_exceptions_guard on hours_exceptions; create trigger hours_exceptions_guard before insert or update on hours_exceptions for each row execute function platform.tenant_guard();
drop trigger if exists hours_exceptions_audit on hours_exceptions; create trigger hours_exceptions_audit after insert or update or delete on hours_exceptions for each row execute function platform.audit();

create table if not exists media (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  storage_path text not null,                            -- '<tenant_id>/<uuid>.webp' original
  variants jsonb not null default '{}'::jsonb,           -- { "thumb": path, "card": path, "hero": path } written by storage.js
  alt text not null default '', width int, height int,
  focal_x real not null default .5 check (focal_x between 0 and 1), focal_y real not null default .5 check (focal_y between 0 and 1),
  kind text not null default 'dish' check (kind in ('dish','hero','exterior','logo','favicon','og','other')),
  status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists media_tenant on media(tenant_id, kind);

alter table media enable row level security;
drop policy if exists media_read on media;   create policy media_read   on media for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists media_insert on media; create policy media_insert on media for insert with check (platform.can_write(tenant_id));
drop policy if exists media_update on media; create policy media_update on media for update using (platform.can_write(tenant_id));
drop policy if exists media_delete on media; create policy media_delete on media for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists media_guard on media; create trigger media_guard before insert or update on media for each row execute function platform.tenant_guard();
drop trigger if exists media_audit on media; create trigger media_audit after insert or update or delete on media for each row execute function platform.audit();

create table if not exists menus (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  slug text not null check (slug ~ '^[a-z0-9-]+$'), name text not null, hours_label text,                 -- 'From 4:00 PM'
  kind text not null check (kind in ('food','drinks','wine','brunch','dessert','kids','other')),
  layout text not null default 'cards' check (layout in ('cards','table')),  -- wine renders as table
  sort int not null default 0, status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, slug));

create index if not exists menus_tenant_sort on menus(tenant_id, sort);

alter table menus enable row level security;
drop policy if exists menus_read on menus;   create policy menus_read   on menus for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists menus_insert on menus; create policy menus_insert on menus for insert with check (platform.can_write(tenant_id));
drop policy if exists menus_update on menus; create policy menus_update on menus for update using (platform.can_write(tenant_id));
drop policy if exists menus_delete on menus; create policy menus_delete on menus for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists menus_guard on menus; create trigger menus_guard before insert or update on menus for each row execute function platform.tenant_guard();
drop trigger if exists menus_audit on menus; create trigger menus_audit after insert or update or delete on menus for each row execute function platform.audit();

create table if not exists menu_sections (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  menu_id uuid not null references menus(id) on delete cascade,
  name text not null, note text, sort int not null default 0,
  status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists menu_sections_tenant_sort on menu_sections(tenant_id, menu_id, sort);

alter table menu_sections enable row level security;
drop policy if exists menu_sections_read on menu_sections;   create policy menu_sections_read   on menu_sections for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists menu_sections_insert on menu_sections; create policy menu_sections_insert on menu_sections for insert with check (platform.can_write(tenant_id));
drop policy if exists menu_sections_update on menu_sections; create policy menu_sections_update on menu_sections for update using (platform.can_write(tenant_id));
drop policy if exists menu_sections_delete on menu_sections; create policy menu_sections_delete on menu_sections for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists menu_sections_guard on menu_sections; create trigger menu_sections_guard before insert or update on menu_sections for each row execute function platform.tenant_guard();
drop trigger if exists menu_sections_audit on menu_sections; create trigger menu_sections_audit after insert or update or delete on menu_sections for each row execute function platform.audit();

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  section_id uuid not null references menu_sections(id) on delete cascade,
  name text not null, description text,
  price_cents integer check (price_cents is null or price_cents >= 0),  -- null = 'Bar price' / see servings
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  price_label text,                                      -- when price_cents is null: 'Bar price', 'Market price'
  image_id uuid references media(id) on delete set null,
  dietary_tags text[] not null default '{}' check (dietary_tags <@ array['vegetarian','vegan','gluten_free','dairy_free','contains_nuts','shellfish','spicy']::text[]),
  attributes jsonb not null default '{}'::jsonb,         -- wine: { grape, region }
  availability text not null default 'available' check (availability in ('available','sold_out','hidden')),
  is_orderable boolean not null default true,
  import_key text,                                       -- 'dinner/d-app/Baked Oysters' — idempotent import upsert key
  sort int not null default 0, status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, import_key));

create index if not exists menu_items_tenant_section_sort on menu_items(tenant_id, section_id, sort);

alter table menu_items enable row level security;
drop policy if exists menu_items_read on menu_items;   create policy menu_items_read   on menu_items for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists menu_items_insert on menu_items; create policy menu_items_insert on menu_items for insert with check (platform.can_write(tenant_id));
drop policy if exists menu_items_update on menu_items; create policy menu_items_update on menu_items for update using (platform.can_write(tenant_id));
drop policy if exists menu_items_delete on menu_items; create policy menu_items_delete on menu_items for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists menu_items_guard on menu_items; create trigger menu_items_guard before insert or update on menu_items for each row execute function platform.tenant_guard();
drop trigger if exists menu_items_audit on menu_items; create trigger menu_items_audit after insert or update or delete on menu_items for each row execute function platform.audit();

create table if not exists item_servings (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  item_id uuid not null references menu_items(id) on delete cascade,
  label text not null, price_cents integer not null check (price_cents >= 0), currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  sort int not null default 0, status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists item_servings_tenant_sort on item_servings(tenant_id, item_id, sort);

alter table item_servings enable row level security;
drop policy if exists item_servings_read on item_servings;   create policy item_servings_read   on item_servings for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists item_servings_insert on item_servings; create policy item_servings_insert on item_servings for insert with check (platform.can_write(tenant_id));
drop policy if exists item_servings_update on item_servings; create policy item_servings_update on item_servings for update using (platform.can_write(tenant_id));
drop policy if exists item_servings_delete on item_servings; create policy item_servings_delete on item_servings for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists item_servings_guard on item_servings; create trigger item_servings_guard before insert or update on item_servings for each row execute function platform.tenant_guard();
drop trigger if exists item_servings_audit on item_servings; create trigger item_servings_audit after insert or update or delete on item_servings for each row execute function platform.audit();

create table if not exists modifier_groups (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  item_id uuid not null references menu_items(id) on delete cascade,
  name text not null, selection text not null check (selection in ('one','many')),
  required boolean not null default false, min_select int not null default 0 check (min_select >= 0), max_select int check (max_select is null or max_select >= min_select),
  sort int not null default 0, status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists modifier_groups_tenant_sort on modifier_groups(tenant_id, item_id, sort);

alter table modifier_groups enable row level security;
drop policy if exists modifier_groups_read on modifier_groups;   create policy modifier_groups_read   on modifier_groups for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists modifier_groups_insert on modifier_groups; create policy modifier_groups_insert on modifier_groups for insert with check (platform.can_write(tenant_id));
drop policy if exists modifier_groups_update on modifier_groups; create policy modifier_groups_update on modifier_groups for update using (platform.can_write(tenant_id));
drop policy if exists modifier_groups_delete on modifier_groups; create policy modifier_groups_delete on modifier_groups for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists modifier_groups_guard on modifier_groups; create trigger modifier_groups_guard before insert or update on modifier_groups for each row execute function platform.tenant_guard();
drop trigger if exists modifier_groups_audit on modifier_groups; create trigger modifier_groups_audit after insert or update or delete on modifier_groups for each row execute function platform.audit();

create table if not exists modifiers (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  group_id uuid not null references modifier_groups(id) on delete cascade,
  label text not null, price_delta_cents integer not null default 0, currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'), market_price boolean not null default false,
  sort int not null default 0, status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists modifiers_tenant_sort on modifiers(tenant_id, group_id, sort);

alter table modifiers enable row level security;
drop policy if exists modifiers_read on modifiers;   create policy modifiers_read   on modifiers for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists modifiers_insert on modifiers; create policy modifiers_insert on modifiers for insert with check (platform.can_write(tenant_id));
drop policy if exists modifiers_update on modifiers; create policy modifiers_update on modifiers for update using (platform.can_write(tenant_id));
drop policy if exists modifiers_delete on modifiers; create policy modifiers_delete on modifiers for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists modifiers_guard on modifiers; create trigger modifiers_guard before insert or update on modifiers for each row execute function platform.tenant_guard();
drop trigger if exists modifiers_audit on modifiers; create trigger modifiers_audit after insert or update or delete on modifiers for each row execute function platform.audit();

create table if not exists specials (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  title text not null, body text, kind text not null check (kind in ('drink','food','happy_hour','other')),
  price_cents integer check (price_cents is null or price_cents >= 0), currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  image_id uuid references media(id) on delete set null,
  schedule jsonb not null check (jsonb_typeof(schedule) = 'object' and schedule->>'type' in ('weekly','range','always')),  -- see spec §8 activeSpecials
  sort int not null default 0, status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists specials_tenant_sort on specials(tenant_id, sort);

alter table specials enable row level security;
drop policy if exists specials_read on specials;   create policy specials_read   on specials for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists specials_insert on specials; create policy specials_insert on specials for insert with check (platform.can_write(tenant_id));
drop policy if exists specials_update on specials; create policy specials_update on specials for update using (platform.can_write(tenant_id));
drop policy if exists specials_delete on specials; create policy specials_delete on specials for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists specials_guard on specials; create trigger specials_guard before insert or update on specials for each row execute function platform.tenant_guard();
drop trigger if exists specials_audit on specials; create trigger specials_audit after insert or update or delete on specials for each row execute function platform.audit();

create table if not exists events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references platform.tenants(id),
  title text not null, body text, kind text not null check (kind in ('live_music','trivia','tasting','private','holiday','other')),
  starts_at timestamptz not null, ends_at timestamptz check (ends_at is null or ends_at >= starts_at), image_id uuid references media(id) on delete set null,
  ticket_url text, price_label text,
  status text not null default 'draft' check (status in ('draft','published','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists events_tenant_starts on events(tenant_id, starts_at);

alter table events enable row level security;
drop policy if exists events_read on events;   create policy events_read   on events for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists events_insert on events; create policy events_insert on events for insert with check (platform.can_write(tenant_id));
drop policy if exists events_update on events; create policy events_update on events for update using (platform.can_write(tenant_id));
drop policy if exists events_delete on events; create policy events_delete on events for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists events_guard on events; create trigger events_guard before insert or update on events for each row execute function platform.tenant_guard();
drop trigger if exists events_audit on events; create trigger events_audit after insert or update or delete on events for each row execute function platform.audit();

create table if not exists site_content (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null unique references platform.tenants(id),   -- one row per tenant
  hero_headline text, hero_sub text, hero_image_id uuid references media(id) on delete set null,
  about_title text, about_body text, announcement text, announcement_until timestamptz,
  social jsonb not null default '{}'::jsonb, section_order text[],
  featured_media uuid[] not null default '{}',           -- the prototype's PLATES strip
  status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

alter table site_content enable row level security;
drop policy if exists site_content_read on site_content;   create policy site_content_read   on site_content for select using (platform.can_read(tenant_id) and (platform.is_member(tenant_id) or status = 'published'));
drop policy if exists site_content_insert on site_content; create policy site_content_insert on site_content for insert with check (platform.can_write(tenant_id));
drop policy if exists site_content_update on site_content; create policy site_content_update on site_content for update using (platform.can_write(tenant_id));
drop policy if exists site_content_delete on site_content; create policy site_content_delete on site_content for delete using (platform.member_role(tenant_id) in ('owner','manager'));
drop trigger if exists site_content_guard on site_content; create trigger site_content_guard before insert or update on site_content for each row execute function platform.tenant_guard();
drop trigger if exists site_content_audit on site_content; create trigger site_content_audit after insert or update or delete on site_content for each row execute function platform.audit();
