-- ============================================================
-- 习思想题库 · 管理员无限积分（0012）
-- 管理员购买商品时跳过余额校验，购买记录按 0 积分入库
-- 在 Supabase SQL Editor 整段执行，可重复执行
-- ============================================================

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
  v_is_admin boolean;
begin
  if me is null then
    raise exception '请先登录';
  end if;

  select * into v_item from public.reward_items where id = p_item and active;
  if not found then
    raise exception '商品不存在';
  end if;

  v_is_admin := public.is_admin();

  -- 同一用户串行兑换，避免并发透支
  perform pg_advisory_xact_lock(hashtext('rewards:' || me::text));

  if exists (select 1 from public.user_rewards where user_id = me and item_id = p_item) then
    select equipped_badge into v_equipped from public.profiles where id = me;
    return jsonb_build_object('ok', true, 'already', true, 'equipped', v_equipped);
  end if;

  v_total := public.user_point_total(me);
  select coalesce(sum(cost), 0)::int into v_spent
    from public.user_rewards where user_id = me;

  if not v_is_admin and v_total - v_spent < v_item.cost then
    raise exception '积分不足';
  end if;

  insert into public.user_rewards (user_id, item_id, cost)
  values (me, p_item, case when v_is_admin then 0 else v_item.cost end);

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
    'available', case
      when v_is_admin then null
      else v_total - v_spent - v_item.cost
    end
  );
end;
$$;

revoke all on function public.purchase_reward(text) from public, anon;
grant execute on function public.purchase_reward(text) to authenticated;
