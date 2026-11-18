-- ============================================================
-- 习思想题库 · 积分榜（0004）
-- 积分与成就全部由作答记录推导，不新增表
-- 在 Supabase SQL Editor 整段执行，可重复执行
-- ============================================================

create or replace function public.lb_points(p_limit int default 50)
returns table (
  rank bigint,
  user_id uuid,
  nickname text,
  points int,
  correct int,
  days int,
  wins int,
  max_streak int,
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
  correct_agg as (
    select l.user_id, count(*)::int as correct
    from latest l
    where l.correct
    group by l.user_id
  ),
  day_agg as (
    select
      a.user_id,
      count(distinct (a.attempted_at at time zone 'Asia/Shanghai')::date)::int as days
    from public.attempts a
    group by a.user_id
  ),
  win_agg as (
    select r.user_id, count(*)::int as wins
    from public.pk_results r
    where r.outcome = 'win'
    group by r.user_id
  ),
  -- 最长连对：用「答错次数」做分组编号，统计每组连续答对的数量
  ordered as (
    select
      a.user_id,
      a.correct,
      sum(case when a.correct then 0 else 1 end) over (
        partition by a.user_id
        order by a.attempted_at, a.id
      ) as grp
    from public.attempts a
  ),
  runs as (
    select o.user_id, o.grp, count(*)::int as run
    from ordered o
    where o.correct
    group by o.user_id, o.grp
  ),
  streak_agg as (
    select s.user_id, max(s.run)::int as max_streak
    from runs s
    group by s.user_id
  ),
  agg as (
    select
      p.id as user_id,
      p.nickname,
      coalesce(c.correct, 0) * 10 + coalesce(w.wins, 0) * 80 + coalesce(d.days, 0) * 20 as points,
      coalesce(c.correct, 0) as correct,
      coalesce(d.days, 0) as days,
      coalesce(w.wins, 0) as wins,
      coalesce(st.max_streak, 0) as max_streak
    from public.profiles p
    left join correct_agg c on c.user_id = p.id
    left join day_agg d on d.user_id = p.id
    left join win_agg w on w.user_id = p.id
    left join streak_agg st on st.user_id = p.id
  ),
  ranked as (
    select rank() over (order by a.points desc, a.correct desc, a.user_id) as rank, a.*
    from agg a
    where a.points > 0
  )
  select
    r.rank,
    r.user_id,
    r.nickname,
    r.points::int,
    r.correct::int,
    r.days::int,
    r.wins::int,
    r.max_streak::int,
    r.user_id = auth.uid() as is_me
  from ranked r
  where r.rank <= greatest(p_limit, 1) or r.user_id = auth.uid()
  order by r.rank;
$$;

grant execute on function public.lb_points(int) to anon, authenticated;
