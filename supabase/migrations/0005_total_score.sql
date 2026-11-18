-- ============================================================
-- 习思想题库 · 总榜改为综合分（0005）
-- 综合分 = 答对题数 × 10
--        + 正确率 × 3
--        + 最长连对 × 5
--        + 活跃天数 × 10
--        + PK 胜场 × 25
-- 在 Supabase SQL Editor 整段执行，可重复执行
-- ============================================================

-- 返回列有变化，需先删除旧函数
drop function if exists public.lb_total(int);

create or replace function public.lb_total(p_limit int default 50)
returns table (
  rank bigint,
  user_id uuid,
  nickname text,
  score int,
  correct int,
  done int,
  accuracy numeric,
  max_streak int,
  days int,
  wins int,
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
  base as (
    select
      l.user_id,
      count(*)::int as done,
      count(*) filter (where l.correct)::int as correct,
      round(100.0 * count(*) filter (where l.correct) / count(*), 1) as accuracy
    from latest l
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
  scored as (
    select
      p.id as user_id,
      p.nickname,
      coalesce(b.done, 0) as done,
      coalesce(b.correct, 0) as correct,
      coalesce(b.accuracy, 0) as accuracy,
      coalesce(d.days, 0) as days,
      coalesce(w.wins, 0) as wins,
      coalesce(st.max_streak, 0) as max_streak,
      (
        coalesce(b.correct, 0) * 10
        + round(coalesce(b.accuracy, 0) * 3)
        + coalesce(st.max_streak, 0) * 5
        + coalesce(d.days, 0) * 10
        + coalesce(w.wins, 0) * 25
      )::int as score
    from public.profiles p
    left join base b on b.user_id = p.id
    left join day_agg d on d.user_id = p.id
    left join win_agg w on w.user_id = p.id
    left join streak_agg st on st.user_id = p.id
  ),
  ranked as (
    select
      rank() over (order by s.score desc, s.correct desc, s.accuracy desc, s.user_id) as rank,
      s.*
    from scored s
    where s.done > 0
  )
  select
    r.rank,
    r.user_id,
    r.nickname,
    r.score::int,
    r.correct::int,
    r.done::int,
    r.accuracy,
    r.max_streak::int,
    r.days::int,
    r.wins::int,
    r.user_id = auth.uid() as is_me
  from ranked r
  where r.rank <= greatest(p_limit, 1) or r.user_id = auth.uid()
  order by r.rank;
$$;

grant execute on function public.lb_total(int) to anon, authenticated;
