-- ============================================================
-- 习思想题库 · 收藏夹（0010）
-- 在 Supabase SQL Editor 整段执行，可重复执行
-- ============================================================

create table if not exists public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists favorites_user_idx
  on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

drop policy if exists "favorites read own" on public.favorites;
create policy "favorites read own" on public.favorites
  for select using (auth.uid() = user_id);

drop policy if exists "favorites insert own" on public.favorites;
create policy "favorites insert own" on public.favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "favorites delete own" on public.favorites;
create policy "favorites delete own" on public.favorites
  for delete using (auth.uid() = user_id);

revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
