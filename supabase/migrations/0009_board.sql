-- ============================================================
-- 习思想题库 · 留言板（0009）
-- 在 Supabase SQL Editor 整段执行，可重复执行
-- 管理员：josiah_bristow@outlook.com
-- ============================================================

-- 1. 管理员判定（邮箱白名单）
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and lower(email) = lower('josiah_bristow@outlook.com')
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- 2. 留言表
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  avatar_url text,
  content text not null check (char_length(content) between 1 and 300),
  topic text not null default '讨论' check (topic in ('讨论', '吐槽', '求助', '建议')),
  reply_to uuid references public.messages (id) on delete cascade,
  pinned boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_created_idx on public.messages (created_at desc);
create index if not exists messages_reply_idx on public.messages (reply_to);
create index if not exists messages_pinned_idx on public.messages (pinned, created_at desc);
create index if not exists messages_user_idx on public.messages (user_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists "messages readable" on public.messages;
create policy "messages readable" on public.messages
  for select using ((not hidden) or public.is_admin());

drop policy if exists "messages delete own or admin" on public.messages;
create policy "messages delete own or admin" on public.messages
  for delete using (auth.uid() = user_id or public.is_admin());

drop policy if exists "messages admin update" on public.messages;
create policy "messages admin update" on public.messages
  for update using (public.is_admin()) with check (public.is_admin());

revoke all on public.messages from anon, authenticated;
grant select on public.messages to anon, authenticated;
grant update, delete on public.messages to authenticated;

-- 3. 点赞表（只通过 RPC 读写）
create table if not exists public.message_likes (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_likes_message_idx on public.message_likes (message_id);

alter table public.message_likes enable row level security;
revoke all on public.message_likes from anon, authenticated;

-- 4. 发帖（服务端校验长度、话题、30 秒频率）
create or replace function public.post_message(
  p_content text,
  p_topic text default '讨论',
  p_reply_to uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  v_content text;
  v_topic text;
  v_nickname text;
  v_avatar text;
  v_parent public.messages;
  v_root uuid;
  v_last timestamptz;
  v_row public.messages;
begin
  if me is null then
    raise exception '请先登录';
  end if;

  v_content := btrim(coalesce(p_content, ''));
  if char_length(v_content) < 1 then
    raise exception '留言内容不能为空';
  end if;
  if char_length(v_content) > 300 then
    raise exception '留言最多 300 字';
  end if;

  v_topic := coalesce(nullif(btrim(p_topic), ''), '讨论');
  if v_topic not in ('讨论', '吐槽', '求助', '建议') then
    raise exception '话题不合法';
  end if;

  select max(created_at) into v_last
    from public.messages where user_id = me;
  if v_last is not null and v_last > now() - interval '30 seconds' then
    raise exception '发言太频繁，请 30 秒后再试';
  end if;

  if p_reply_to is not null then
    select * into v_parent from public.messages where id = p_reply_to;
    if not found or v_parent.hidden then
      raise exception '原留言不存在';
    end if;
    -- 只保留一层：回复“回复”时挂到主楼下
    v_root := coalesce(v_parent.reply_to, v_parent.id);
  end if;

  select nickname, avatar_url into v_nickname, v_avatar
    from public.profiles where id = me;
  if v_nickname is null then
    v_nickname := split_part(coalesce(auth.email(), '同学'), '@', 1);
  end if;

  insert into public.messages (user_id, nickname, avatar_url, content, topic, reply_to)
  values (me, v_nickname, v_avatar, v_content, v_topic, v_root)
  returning * into v_row;

  return to_jsonb(v_row) || jsonb_build_object('like_count', 0, 'liked', false);
end;
$$;

revoke all on function public.post_message(text, text, uuid) from public, anon;
grant execute on function public.post_message(text, text, uuid) to authenticated;

-- 5. 点赞 / 取消点赞
create or replace function public.toggle_message_like(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  v_liked boolean;
  v_count int;
begin
  if me is null then
    raise exception '请先登录';
  end if;

  if not exists (
    select 1 from public.messages
    where id = p_message_id and ((not hidden) or public.is_admin())
  ) then
    raise exception '留言不存在';
  end if;

  if exists (
    select 1 from public.message_likes
    where message_id = p_message_id and user_id = me
  ) then
    delete from public.message_likes
    where message_id = p_message_id and user_id = me;
    v_liked := false;
  else
    insert into public.message_likes (message_id, user_id)
    values (p_message_id, me);
    v_liked := true;
  end if;

  select count(*)::int into v_count
    from public.message_likes where message_id = p_message_id;

  return jsonb_build_object('liked', v_liked, 'count', v_count);
end;
$$;

revoke all on function public.toggle_message_like(uuid) from public, anon;
grant execute on function public.toggle_message_like(uuid) to authenticated;

-- 6. 留言流（含点赞数、我是否点过、管理员可见隐藏内容）
create or replace function public.lb_messages(p_limit int default 300)
returns table (
  id uuid,
  user_id uuid,
  nickname text,
  avatar_url text,
  content text,
  topic text,
  reply_to uuid,
  pinned boolean,
  hidden boolean,
  created_at timestamptz,
  like_count int,
  liked boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    m.id,
    m.user_id,
    m.nickname,
    m.avatar_url,
    m.content,
    m.topic,
    m.reply_to,
    m.pinned,
    m.hidden,
    m.created_at,
    (select count(*)::int from public.message_likes l where l.message_id = m.id) as like_count,
    exists (
      select 1 from public.message_likes l
      where l.message_id = m.id and l.user_id = auth.uid()
    ) as liked
  from public.messages m
  where (not m.hidden) or public.is_admin()
  order by m.created_at asc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.lb_messages(int) to anon, authenticated;
