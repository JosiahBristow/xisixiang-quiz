-- ============================================================
-- 习思想题库 · 联机 PK 迁移（0002）
-- 在 Supabase SQL Editor 整段执行，可重复执行
-- ============================================================

-- ---------- 1. 房间 ----------
create table if not exists public.pk_rooms (
  code text primary key,
  host_id uuid not null references auth.users (id) on delete cascade,
  guest_id uuid references auth.users (id) on delete set null,
  prefs jsonb not null default '{"count":10,"limit":15}'::jsonb,
  status text not null default 'waiting', -- waiting | playing | finished | cancelled
  seed bigint not null,
  host_score int,
  guest_score int,
  winner_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists pk_rooms_host_idx on public.pk_rooms (host_id, created_at desc);
create index if not exists pk_rooms_guest_idx on public.pk_rooms (guest_id, created_at desc);

alter table public.pk_rooms enable row level security;

drop policy if exists "pk rooms read participants" on public.pk_rooms;
create policy "pk rooms read participants" on public.pk_rooms
  for select using (auth.uid() = host_id or auth.uid() = guest_id);

revoke all on public.pk_rooms from anon;
grant select on public.pk_rooms to authenticated;

-- ---------- 2. 匹配队列 ----------
create table if not exists public.pk_queue (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null,
  enqueued_at timestamptz not null default now()
);

alter table public.pk_queue enable row level security;
revoke all on public.pk_queue from anon, authenticated;

-- ---------- 3. 对局战绩 ----------
create table if not exists public.pk_results (
  id bigint generated always as identity primary key,
  room_code text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  opponent_id uuid references auth.users (id) on delete set null,
  score int not null,
  opponent_score int not null,
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  played_at timestamptz not null default now(),
  unique (room_code, user_id)
);

create index if not exists pk_results_user_time_idx
  on public.pk_results (user_id, played_at desc);

alter table public.pk_results enable row level security;

drop policy if exists "pk results read own" on public.pk_results;
create policy "pk results read own" on public.pk_results
  for select using (auth.uid() = user_id);

revoke all on public.pk_results from anon;
grant select on public.pk_results to authenticated;

-- ---------- 4. 内部工具函数 ----------
create or replace function public.pk_normalize_prefs(p_prefs jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'count', least(greatest(coalesce((p_prefs ->> 'count')::int, 10), 5), 30),
    'limit', least(greatest(coalesce((p_prefs ->> 'limit')::int, 15), 5), 60)
  );
$$;

create or replace function public.pk_random_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..4 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.pk_room_payload(p_room public.pk_rooms)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'code', p_room.code,
    'host_id', p_room.host_id,
    'guest_id', p_room.guest_id,
    'status', p_room.status,
    'prefs', p_room.prefs,
    'seed', p_room.seed,
    'host_nickname', (select nickname from public.profiles where id = p_room.host_id),
    'guest_nickname', (select nickname from public.profiles where id = p_room.guest_id),
    'host_score', p_room.host_score,
    'guest_score', p_room.guest_score,
    'winner_id', p_room.winner_id
  );
$$;

-- ---------- 5. 建房 / 加入 ----------
create or replace function public.pk_create_room(p_prefs jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  v_prefs jsonb;
  v_code text;
  v_room public.pk_rooms;
begin
  if me is null then
    raise exception '请先登录';
  end if;
  v_prefs := pk_normalize_prefs(p_prefs);

  loop
    v_code := pk_random_code();
    begin
      insert into public.pk_rooms (code, host_id, prefs, seed, status)
      values (v_code, me, v_prefs, floor(random() * 2000000000)::bigint, 'waiting')
      returning * into v_room;
      exit;
    exception when unique_violation then
      -- 撞码，重来
    end;
  end loop;

  -- 顺手关掉自己之前没开始的旧房间
  update public.pk_rooms
     set status = 'cancelled'
   where host_id = me and code <> v_code and status = 'waiting'
     and created_at > now() - interval '2 hours';

  return pk_room_payload(v_room);
end;
$$;

create or replace function public.pk_join_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  v_room public.pk_rooms;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if me is null then
    raise exception '请先登录';
  end if;

  select * into v_room from public.pk_rooms where code = v_code for update;
  if not found then
    raise exception '房间不存在';
  end if;
  if v_room.status = 'cancelled' then
    raise exception '房间已取消';
  end if;
  if v_room.status = 'finished' then
    raise exception '本局已结束';
  end if;
  if v_room.host_id = me then
    return pk_room_payload(v_room);
  end if;
  if v_room.status <> 'waiting' then
    raise exception '房间已开始';
  end if;
  if v_room.guest_id is not null and v_room.guest_id <> me then
    raise exception '房间已满';
  end if;

  update public.pk_rooms set guest_id = me where code = v_room.code
  returning * into v_room;

  return pk_room_payload(v_room);
end;
$$;

create or replace function public.pk_get_room(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  v_room public.pk_rooms;
begin
  if me is null then
    raise exception '请先登录';
  end if;
  select * into v_room from public.pk_rooms where code = upper(trim(coalesce(p_code, '')));
  if not found then
    raise exception '房间不存在';
  end if;
  if v_room.host_id <> me and coalesce(v_room.guest_id, '00000000-0000-0000-0000-000000000000'::uuid) <> me then
    raise exception '你不在这个房间里';
  end if;
  return pk_room_payload(v_room);
end;
$$;

-- ---------- 6. 快速匹配 ----------
create or replace function public.pk_enqueue(p_prefs jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  opp public.pk_queue;
  v_prefs jsonb;
  v_code text;
  v_room public.pk_rooms;
begin
  if me is null then
    raise exception '请先登录';
  end if;
  v_prefs := pk_normalize_prefs(p_prefs);

  delete from public.pk_queue where enqueued_at < now() - interval '2 minutes';

  select * into opp
    from public.pk_queue
   where user_id <> me and enqueued_at > now() - interval '2 minutes'
   order by enqueued_at
   limit 1
   for update skip locked;

  if found then
    delete from public.pk_queue where user_id in (me, opp.user_id);

    loop
      v_code := pk_random_code();
      begin
        insert into public.pk_rooms (code, host_id, guest_id, prefs, seed, status)
        values (v_code, opp.user_id, me, opp.prefs, floor(random() * 2000000000)::bigint, 'waiting')
        returning * into v_room;
        exit;
      exception when unique_violation then
        -- 撞码，重来
      end;
    end loop;

    return jsonb_build_object('matched', true, 'room', pk_room_payload(v_room));
  end if;

  insert into public.pk_queue (user_id, prefs, enqueued_at)
  values (me, v_prefs, now())
  on conflict (user_id) do update
    set prefs = excluded.prefs, enqueued_at = excluded.enqueued_at;

  return jsonb_build_object('matched', false);
end;
$$;

create or replace function public.pk_cancel()
returns void
language sql
security definer
set search_path = public, auth
as $$
  delete from public.pk_queue where user_id = auth.uid();
  update public.pk_rooms
     set status = 'cancelled'
   where host_id = auth.uid() and status = 'waiting'
     and created_at > now() - interval '5 minutes';
$$;

create or replace function public.pk_start_room(p_code text)
returns void
language sql
security definer
set search_path = public, auth
as $$
  update public.pk_rooms
     set status = 'playing', started_at = now()
   where code = upper(trim(p_code))
     and host_id = auth.uid()
     and status = 'waiting';
$$;

create or replace function public.pk_my_room()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  v_room public.pk_rooms;
begin
  if me is null then return null; end if;
  select * into v_room
    from public.pk_rooms
   where (host_id = me or guest_id = me)
     and status = 'waiting'
     and created_at > now() - interval '5 minutes'
   order by created_at desc
   limit 1;
  if not found then return null; end if;
  return pk_room_payload(v_room);
end;
$$;

-- 主动离开房间：客人让出座位，房主取消房间
create or replace function public.pk_leave_room(p_code text)
returns void
language sql
security definer
set search_path = public, auth
as $$
  update public.pk_rooms
     set guest_id = null
   where code = upper(trim(p_code)) and guest_id = auth.uid() and status = 'waiting';

  update public.pk_rooms
     set status = 'cancelled'
   where code = upper(trim(p_code)) and host_id = auth.uid() and status = 'waiting';
$$;

-- ---------- 7. 结算 ----------
create or replace function public.pk_finish(
  p_code text,
  p_my_score int,
  p_opp_score int,
  p_walkover boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  v_room public.pk_rooms;
  v_host_score int;
  v_guest_score int;
  v_winner uuid;
  v_my_outcome text;
begin
  if me is null then
    raise exception '请先登录';
  end if;

  select * into v_room from public.pk_rooms where code = upper(trim(p_code)) for update;
  if not found then
    raise exception '房间不存在';
  end if;
  if me <> v_room.host_id and me <> coalesce(v_room.guest_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    raise exception '你不在这个房间里';
  end if;

  if v_room.status = 'finished' then
    return jsonb_build_object(
      'host_score', v_room.host_score,
      'guest_score', v_room.guest_score,
      'winner_id', v_room.winner_id
    );
  end if;

  v_host_score := least(greatest(coalesce(case when me = v_room.host_id then p_my_score else p_opp_score end, 0), 0), 100000);
  v_guest_score := least(greatest(coalesce(case when me = v_room.guest_id then p_my_score else p_opp_score end, 0), 0), 100000);

  if p_walkover then
    v_winner := me;
  elsif v_host_score > v_guest_score then
    v_winner := v_room.host_id;
  elsif v_guest_score > v_host_score then
    v_winner := v_room.guest_id;
  else
    v_winner := null;
  end if;

  v_my_outcome := case
    when v_winner is null then 'draw'
    when v_winner = me then 'win'
    else 'loss'
  end;

  update public.pk_rooms
     set status = 'finished',
         host_score = v_host_score,
         guest_score = v_guest_score,
         winner_id = v_winner,
         finished_at = now()
   where code = v_room.code;

  -- 无论谁先发起结算，都写入双方各一条战绩
  insert into public.pk_results (room_code, user_id, opponent_id, score, opponent_score, outcome)
  values (
    v_room.code,
    v_room.host_id,
    v_room.guest_id,
    v_host_score,
    v_guest_score,
    case when v_winner is null then 'draw' when v_winner = v_room.host_id then 'win' else 'loss' end
  )
  on conflict (room_code, user_id) do nothing;

  if v_room.guest_id is not null then
    insert into public.pk_results (room_code, user_id, opponent_id, score, opponent_score, outcome)
    values (
      v_room.code,
      v_room.guest_id,
      v_room.host_id,
      v_guest_score,
      v_host_score,
      case when v_winner is null then 'draw' when v_winner = v_room.guest_id then 'win' else 'loss' end
    )
    on conflict (room_code, user_id) do nothing;
  end if;

  return jsonb_build_object(
    'host_score', v_host_score,
    'guest_score', v_guest_score,
    'winner_id', v_winner,
    'my_outcome', v_my_outcome
  );
end;
$$;

-- ---------- 8. PK 榜 ----------
create or replace function public.lb_pk(p_limit int default 50)
returns table (
  rank bigint,
  user_id uuid,
  nickname text,
  games int,
  wins int,
  draws int,
  winrate numeric,
  streak int,
  is_me boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with agg as (
    select
      r.user_id,
      count(*)::int as games,
      count(*) filter (where r.outcome = 'win')::int as wins,
      count(*) filter (where r.outcome = 'draw')::int as draws,
      round(100.0 * count(*) filter (where r.outcome = 'win') / count(*), 1) as winrate
    from public.pk_results r
    group by r.user_id
  ),
  latest as (
    select
      r.user_id, r.outcome,
      row_number() over (partition by r.user_id order by r.played_at desc, r.id desc) as rn
    from public.pk_results r
  ),
  streaks as (
    select
      l.user_id,
      case
        when min(case when l.outcome <> 'win' then l.rn end) is null then max(l.rn)
        else min(case when l.outcome <> 'win' then l.rn end) - 1
      end::int as streak
    from latest l
    group by l.user_id
  ),
  ranked as (
    select
      rank() over (order by a.wins desc, a.winrate desc, a.games desc, a.user_id) as rank,
      a.user_id, a.games, a.wins, a.draws, a.winrate, s.streak
    from agg a
    join streaks s on s.user_id = a.user_id
  )
  select
    r.rank,
    r.user_id,
    p.nickname,
    r.games,
    r.wins,
    r.draws,
    r.winrate,
    r.streak,
    r.user_id = auth.uid() as is_me
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.rank <= greatest(p_limit, 1) or r.user_id = auth.uid()
  order by r.rank;
$$;

-- ---------- 9. 授权 ----------
grant execute on function public.pk_create_room(jsonb) to authenticated;
grant execute on function public.pk_join_room(text) to authenticated;
grant execute on function public.pk_get_room(text) to authenticated;
grant execute on function public.pk_enqueue(jsonb) to authenticated;
grant execute on function public.pk_cancel() to authenticated;
grant execute on function public.pk_my_room() to authenticated;
grant execute on function public.pk_start_room(text) to authenticated;
grant execute on function public.pk_leave_room(text) to authenticated;
grant execute on function public.pk_finish(text, int, int, boolean) to authenticated;
grant execute on function public.lb_pk(int) to anon, authenticated;
