-- 2026-10-16: keep the per-serving nutrition estimate with each saved recipe.
-- The recipe generator has returned it since Aug 23, but saving dropped it.
-- Additive only: deletes nothing, changes no existing rows (old recipes stay null).

alter table public.recipes
  add column if not exists nutrition text;
