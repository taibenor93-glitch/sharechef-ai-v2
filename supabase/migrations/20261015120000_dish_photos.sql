-- 2026-10-15: optional photo of the finished dish, saved with the recipe.
-- Additive only: deletes nothing, changes no existing rows.

-- Path of the dish photo inside the dish-photos bucket ('<user_id>/<recipe_id>.jpg').
alter table public.recipes
  add column if not exists photo_path text;

-- Private bucket. The app reads photos through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dish-photos', 'dish-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- Owner only: a user can touch files in their own '<user_id>/' folder and nothing else.
drop policy if exists "dish_photos_select_own" on storage.objects;
create policy "dish_photos_select_own"
on storage.objects for select
using (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "dish_photos_insert_own" on storage.objects;
create policy "dish_photos_insert_own"
on storage.objects for insert
with check (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "dish_photos_update_own" on storage.objects;
create policy "dish_photos_update_own"
on storage.objects for update
using (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "dish_photos_delete_own" on storage.objects;
create policy "dish_photos_delete_own"
on storage.objects for delete
using (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text);
