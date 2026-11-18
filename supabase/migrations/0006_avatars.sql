-- ============================================================
-- 习思想题库 · 头像上传（0006）
-- 在 Supabase SQL Editor 整段执行，可重复执行
-- ============================================================

-- 1. 资料表增加头像地址
alter table public.profiles add column if not exists avatar_url text;

-- 2. 公开头像桶（客户端已把图片压缩到 256×256，限制 2MB 兜底）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. 存储访问策略：所有人可读，只有本人能改自己的目录
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars insert own" on storage.objects;
create policy "avatars insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. 批量取头像（排行榜 / 联机房间用，匿名可调用）
create or replace function public.lb_avatars(p_ids uuid[])
returns table (id uuid, avatar_url text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.avatar_url
  from public.profiles p
  where p.id = any(p_ids);
$$;

grant execute on function public.lb_avatars(uuid[]) to anon, authenticated;
