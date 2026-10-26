-- 2026-10-26: shareable recipe links. When a user shares a saved recipe, the
-- app stores a snapshot here and shares https://<server>/r/<id>. That page shows
-- the dish, the recipe and the App Store button, and its preview card (photo,
-- title, ShareChef logo) is what Threads, Messages and WhatsApp show.
-- Additive only: deletes nothing, changes no existing rows.

create table if not exists public.public_recipe_shares (
  id text primary key check (id ~ '^[A-Za-z0-9]{16,32}$'), -- random, unguessable
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid references public.recipes (id) on delete cascade, -- deleting the recipe ends its links
  title text not null check (char_length(title) <= 200),
  description text check (char_length(description) <= 1000),
  ingredients jsonb not null default '[]',
  steps jsonb not null default '[]',
  nutrition text check (char_length(nutrition) <= 300),
  image_path text, -- '<user_id>/<id>.jpg' in the share-cards bucket
  created_at timestamptz not null default now()
);

-- The public page is served by the server with the service key, so nobody
-- reads this table directly. Owners can create, see and remove their own.
alter table public.public_recipe_shares enable row level security;

drop policy if exists "public_recipe_shares_select_own" on public.public_recipe_shares;
create policy "public_recipe_shares_select_own"
on public.public_recipe_shares for select
using (user_id = auth.uid());

drop policy if exists "public_recipe_shares_insert_own" on public.public_recipe_shares;
create policy "public_recipe_shares_insert_own"
on public.public_recipe_shares for insert
with check (user_id = auth.uid());

drop policy if exists "public_recipe_shares_delete_own" on public.public_recipe_shares;
create policy "public_recipe_shares_delete_own"
on public.public_recipe_shares for delete
using (user_id = auth.uid());

-- Preview images are public on purpose: they are what a shared link shows.
-- Paths carry the random share id, so they cannot be listed or guessed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-cards', 'share-cards', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "share_cards_insert_own" on storage.objects;
create policy "share_cards_insert_own"
on storage.objects for insert
with check (bucket_id = 'share-cards' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "share_cards_delete_own" on storage.objects;
create policy "share_cards_delete_own"
on storage.objects for delete
using (bucket_id = 'share-cards' and (storage.foldername(name))[1] = auth.uid()::text);
