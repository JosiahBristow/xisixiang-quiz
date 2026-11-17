-- ============================================================
-- 习思想题库 · Supabase 初始化脚本
-- 在 Supabase 控制台 → SQL Editor 中整段粘贴执行即可（可重复执行）
-- ============================================================

-- ---------- 1. 用户资料 ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

-- ---------- 2. 作答记录 ----------
create table if not exists public.attempts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text not null,
  chapter text not null,
  correct boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists attempts_user_time_idx
  on public.attempts (user_id, attempted_at desc);
create index if not exists attempts_user_question_idx
  on public.attempts (user_id, question_id, attempted_at desc);
create index if not exists attempts_chapter_idx
  on public.attempts (chapter);

alter table public.attempts enable row level security;

drop policy if exists "attempts read own" on public.attempts;
create policy "attempts read own" on public.attempts
  for select using (auth.uid() = user_id);

drop policy if exists "attempts insert own" on public.attempts;
create policy "attempts insert own" on public.attempts
  for insert with check (auth.uid() = user_id);

drop policy if exists "attempts delete own" on public.attempts;
create policy "attempts delete own" on public.attempts
  for delete using (auth.uid() = user_id);

revoke all on public.attempts from anon;
grant select, insert, delete on public.attempts to authenticated;

-- ---------- 3. 注册时自动建档 ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  candidate text;
  n int := 0;
begin
  base_name := split_part(coalesce(nullif(new.email, ''), '同学'), '@', 1);
  if length(base_name) = 0 then
    base_name := '同学';
  end if;
  base_name := left(base_name, 12);

  candidate := base_name;
  while exists (select 1 from public.profiles p where p.nickname = candidate) loop
    n := n + 1;
    candidate := base_name || n::text;
  end loop;

  insert into public.profiles (id, nickname)
  values (new.id, candidate)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 4. 昵称更新时间 ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 5. 排行榜函数
--    均以 security definer 聚合，前端只能拿到汇总结果，读不到别人的作答明细
-- ============================================================

-- 总榜：按去重后的已刷题数排序，同数量看正确率
create or replace function public.lb_total(p_limit int default 50)
returns table (
  rank bigint,
  user_id uuid,
  nickname text,
  done int,
  correct int,
  accuracy numeric,
  is_me boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with latest as (
    select distinct on (a.user_id, a.question_id)
      a.user_id, a.question_id, a.correct
    from public.attempts a
    order by a.user_id, a.question_id, a.attempted_at desc, a.id desc
  ),
  agg as (
    select
      l.user_id,
      count(*)::int as done,
      count(*) filter (where l.correct)::int as correct,
      round(100.0 * count(*) filter (where l.correct) / count(*), 1) as accuracy
    from latest l
    group by l.user_id
  ),
  ranked as (
    select
      rank() over (order by agg.done desc, agg.accuracy desc, agg.user_id) as rank,
      agg.user_id, agg.done, agg.correct, agg.accuracy
    from agg
  )
  select
    r.rank,
    r.user_id,
    p.nickname,
    r.done,
    r.correct,
    r.accuracy,
    r.user_id = auth.uid() as is_me
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.rank <= greatest(p_limit, 1) or r.user_id = auth.uid()
  order by r.rank;
$$;

-- 章节榜：该章刷够 p_min_done 题才入榜，按正确率排序
create or replace function public.lb_chapter(
  p_chapter text,
  p_min_done int default 1,
  p_limit int default 50
)
returns table (
  rank bigint,
  user_id uuid,
  nickname text,
  done int,
  correct int,
  accuracy numeric,
  is_me boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with latest as (
    select distinct on (a.user_id, a.question_id)
      a.user_id, a.question_id, a.correct
    from public.attempts a
    where a.chapter = p_chapter
    order by a.user_id, a.question_id, a.attempted_at desc, a.id desc
  ),
  agg as (
    select
      l.user_id,
      count(*)::int as done,
      count(*) filter (where l.correct)::int as correct,
      round(100.0 * count(*) filter (where l.correct) / count(*), 1) as accuracy
    from latest l
    group by l.user_id
  ),
  eligible as (
    select * from agg where done >= greatest(p_min_done, 1)
  ),
  ranked as (
    select
      rank() over (order by e.accuracy desc, e.done desc, e.user_id) as rank,
      e.user_id, e.done, e.correct, e.accuracy
    from eligible e
  )
  select
    r.rank,
    r.user_id,
    p.nickname,
    r.done,
    r.correct,
    r.accuracy,
    r.user_id = auth.uid() as is_me
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.rank <= greatest(p_limit, 1) or r.user_id = auth.uid()
  order by r.rank;
$$;

-- 周榜：本周一 0 点（北京时间）以来，按本周作答的去重题数排序
create or replace function public.lb_weekly(p_limit int default 50)
returns table (
  rank bigint,
  user_id uuid,
  nickname text,
  done int,
  correct int,
  accuracy numeric,
  is_me boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with week_attempts as (
    select a.*
    from public.attempts a
    where a.attempted_at >= (
      date_trunc('week', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'
    )
  ),
  latest as (
    select distinct on (a.user_id, a.question_id)
      a.user_id, a.question_id, a.correct
    from week_attempts a
    order by a.user_id, a.question_id, a.attempted_at desc, a.id desc
  ),
  agg as (
    select
      l.user_id,
      count(*)::int as done,
      count(*) filter (where l.correct)::int as correct,
      round(100.0 * count(*) filter (where l.correct) / count(*), 1) as accuracy
    from latest l
    group by l.user_id
  ),
  ranked as (
    select
      rank() over (order by agg.done desc, agg.accuracy desc, agg.user_id) as rank,
      agg.user_id, agg.done, agg.correct, agg.accuracy
    from agg
  )
  select
    r.rank,
    r.user_id,
    p.nickname,
    r.done,
    r.correct,
    r.accuracy,
    r.user_id = auth.uid() as is_me
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.rank <= greatest(p_limit, 1) or r.user_id = auth.uid()
  order by r.rank;
$$;

grant execute on function public.lb_total(int) to anon, authenticated;
grant execute on function public.lb_chapter(text, int, int) to anon, authenticated;
grant execute on function public.lb_weekly(int) to anon, authenticated;
