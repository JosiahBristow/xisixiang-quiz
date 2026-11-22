-- ============================================================
-- 习思想题库 · 界面布局商品（0011）
-- 在 Supabase SQL Editor 整段执行，可重复执行
-- ============================================================

alter table public.reward_items drop constraint if exists reward_items_kind_check;
alter table public.reward_items
  add constraint reward_items_kind_check check (kind in ('theme', 'badge', 'layout'));

insert into public.reward_items (id, kind, name, cost, char, tier, sort, active) values
  ('layout_bilibili', 'layout', 'B站布局', 800, null, null, 4, true),
  ('layout_douyin', 'layout', '抖音布局', 1000, null, null, 5, true)
on conflict (id) do update
  set kind = excluded.kind,
      name = excluded.name,
      cost = excluded.cost,
      sort = excluded.sort,
      active = excluded.active;
