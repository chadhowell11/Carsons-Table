-- 0004_storage.sql — media bucket and storage.objects policies (spec §4.5).
-- Object path: <tenant_id>/<media.id>.webp (+ -thumb/-card/-hero variants).
-- Public read; writes only by staff of the tenant named by the first path segment.
-- platform.path_tenant() returns null for a malformed path instead of raising
-- (DECISIONS D18), so a bad name is refused by policy, not by a cast error.

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;

create or replace function platform.path_tenant(name text) returns uuid language sql immutable as $$
  select case when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(name, '/', 1)::uuid end
$$;
grant execute on function platform.path_tenant(text) to anon, authenticated, service_role;

drop policy if exists media_objects_read on storage.objects;
create policy media_objects_read on storage.objects for select using (bucket_id = 'media');
drop policy if exists media_objects_insert on storage.objects;
create policy media_objects_insert on storage.objects for insert
  with check (bucket_id = 'media' and platform.is_member(platform.path_tenant(name)));
drop policy if exists media_objects_update on storage.objects;
create policy media_objects_update on storage.objects for update
  using (bucket_id = 'media' and platform.is_member(platform.path_tenant(name)));
drop policy if exists media_objects_delete on storage.objects;
create policy media_objects_delete on storage.objects for delete
  using (bucket_id = 'media' and platform.is_member(platform.path_tenant(name)));
