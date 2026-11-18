-- ============================================================
-- 习思想题库 · 积分商城（0007）
-- 积分兑换主题 / 荣誉徽章
-- 在 Supabase SQL Editor 整段执行，可重复执行
-- ============================================================

-- 1. 商品目录
create table if not exists public.reward_items (
  id text primary key,
  kind text not null check (kind in ('theme', 'badge')),
  name text not null,
  cost int not null check (cost >= 0),
  char text,
  tier text,
  sort int not null default 0,
  active boolean not null default true
);

alter table public.reward_items enable row level security;

drop policy if exists "reward items readable" on public.reward_items;
create policy "reward items readable" on public.reward_items
  for select using (true);

revoke all on public.reward_items from anon, authenticated;
grant select on public.reward_items to anon, authenticated;

insert into public.reward_items (id, kind, name, cost, char, tier, sort, active) values
  ('theme_cinnabar', 'theme', '朱砂', 400, null, null, 1, true),
  ('theme_celadon', 'theme', '青瓷', 400, null, null, 2, true),
  ('theme_nocturne', 'theme', '夜航', 600, null, null, 3, true),
  ('badge_jade', 'badge', '青玉', 300, '玉', 'bronze', 1, true),
  ('badge_gold', 'badge', '流金', 800, '金', 'silver', 2, true),
  ('badge_phoenix', 'badge', '丹凤', 1500, '凤', 'gold', 3, true)
on conflict (id) do update
  set kind = excluded.kind,
      name = excluded.name,
      cost = excluded.cost,
      char = excluded.char,
      tier = excluded.tier,
      sort = excluded.sort,
      active = excluded.active;

-- 2. 购买记录
create table if not exists public.user_rewards (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.reward_items (id) on delete cascade,
  cost int not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index if not exists user_rewards_user_idx on public.user_rewards (user_id);

alter table public.user_rewards enable row level security;

drop policy if exists "user rewards read own" on public.user_rewards;
create policy "user rewards read own" on public.user_rewards
  for select using (auth.uid() = user_id);

revoke all on public.user_rewards from anon, authenticated;
grant select on public.user_rewards to authenticated;

-- 3. 资料表记录佩戴的徽章
alter table public.profiles add column if not exists equipped_badge text;

-- 资料更新收紧到指定列，防止直接伪造 equipped_badge
revoke update on public.profiles from authenticated;
grant update (nickname, avatar_url) on public.profiles to authenticated;
revoke insert on public.profiles from authenticated;
grant insert (id, nickname) on public.profiles to authenticated;

-- 4. 计算用户累计积分（与积分榜同一口径）
create or replace function public.user_point_total(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (a.question_id) a.question_id, a.correct
    from public.attempts a
    where a.user_id = p_uid
    order by a.question_id, a.attempted_at desc, a.id desc
  )
  select (
    coalesce((select count(*) filter (where correct) from latest), 0)::int * 10
    + coalesce((
        select count(distinct (a.attempted_at at time zone 'Asia/Shanghai')::date)
        from public.attempts a where a.user_id = p_uid
      ), 0)::int * 20
    + coalesce((
        select count(*) from public.pk_results r
        where r.user_id = p_uid and r.outcome = 'win'
      ), 0)::int * 80
  )::int;
$$;

revoke all on function public.user_point_total(uuid) from public, anon, authenticated;

-- 5. 兑换
create or replace function public.purchase_reward(p_item text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  v_item public.reward_items;
  v_total int;
  v_spent int;
  v_equipped text;
begin
  if me is null then
    raise exception '请先登录';
  end if;

  select * into v_item from public.reward_items where id = p_item and active;
  if not found then
    raise exception '商品不存在';
  end if;

  -- 同一用户串行兑换，避免并发透支
  perform pg_advisory_xact_lock(hashtext('rewards:' || me::text));

  if exists (select 1 from public.user_rewards where user_id = me and item_id = p_item) then
    select equipped_badge into v_equipped from public.profiles where id = me;
    return jsonb_build_object('ok', true, 'already', true, 'equipped', v_equipped);
  end if;

  v_total := public.user_point_total(me);
  select coalesce(sum(cost), 0)::int into v_spent
    from public.user_rewards where user_id = me;

  if v_total - v_spent < v_item.cost then
    raise exception '积分不足';
  end if;

  insert into public.user_rewards (user_id, item_id, cost)
  values (me, p_item, v_item.cost);

  -- 第一枚购买的徽章自动佩戴
  if v_item.kind = 'badge' then
    update public.profiles
       set equipped_badge = v_item.id
     where id = me and equipped_badge is null;
  end if;

  select equipped_badge into v_equipped from public.profiles where id = me;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'equipped', v_equipped,
    'available', v_total - v_spent - v_item.cost
  );
end;
$$;

revoke all on function public.purchase_reward(text) from public, anon;
grant execute on function public.purchase_reward(text) to authenticated;

-- 6. 佩戴 / 摘下徽章
create or replace function public.equip_reward_badge(p_item text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception '请先登录';
  end if;

  if p_item is not null then
    if not exists (
      select 1
      from public.user_rewards ur
      join public.reward_items ri on ri.id = ur.item_id
      where ur.user_id = me and ur.item_id = p_item and ri.kind = 'badge'
    ) then
      raise exception '尚未拥有该勋章';
    end if;
  end if;

  update public.profiles set equipped_badge = p_item where id = me;
  return p_item;
end;
$$;

revoke all on function public.equip_reward_badge(text) from public, anon;
grant execute on function public.equip_reward_badge(text) to authenticated;

-- 7. 批量取头像与佩戴徽章（排行榜 / 联机）
create or replace function public.lb_social(p_ids uuid[])
returns table (id uuid, avatar_url text, equipped_badge text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.avatar_url, p.equipped_badge
  from public.profiles p
  where p.id = any(p_ids);
$$;

grant execute on function public.lb_social(uuid[]) to anon, authenticated;
