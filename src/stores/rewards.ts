import { computed, reactive, watch } from 'vue'
import { REWARDS, rewardById } from '../lib/rewards'
import { supabase } from '../lib/supabase'
import { auth } from './auth'
import { badgeCache } from './avatars'
import { points } from './incentives'

export const rewards = reactive({
  owned: [] as string[],
  spent: 0,
  loaded: false,
})

/** 可用积分 = 累计积分 − 已消费 */
export const availablePoints = computed(() => Math.max(0, points.value - rewards.spent))

export function isOwned(itemId: string): boolean {
  return rewards.owned.includes(itemId)
}

export async function loadRewards(): Promise<void> {
  if (!supabase || !auth.user) {
    rewards.owned = []
    rewards.spent = 0
    rewards.loaded = true
    return
  }
  const { data, error } = await supabase.from('user_rewards').select('item_id,cost')
  if (!error && Array.isArray(data)) {
    const rows = data as { item_id: string; cost: number }[]
    rewards.owned = rows.map((r) => r.item_id)
    rewards.spent = rows.reduce((sum, r) => sum + Number(r.cost || 0), 0)
  }
  rewards.loaded = true
}

export async function purchaseReward(itemId: string): Promise<{ ok: boolean; msg?: string }> {
  if (!supabase || !auth.user) return { ok: false, msg: '请先登录' }
  const item = rewardById(itemId)
  if (!item) return { ok: false, msg: '商品不存在' }
  if (isOwned(itemId)) return { ok: true }
  if (availablePoints.value < item.cost) {
    return { ok: false, msg: `积分不足，还差 ${item.cost - availablePoints.value} 分` }
  }

  const { data, error } = await supabase.rpc('purchase_reward', { p_item: itemId })
  if (error) {
    const msg = error.message.includes('积分不足')
      ? '积分不足'
      : error.message.includes('登录')
        ? '请先登录'
        : '兑换失败，请稍后再试'
    return { ok: false, msg }
  }

  await loadRewards()
  const equipped = (data as { equipped?: string | null } | null)?.equipped
  if (equipped !== undefined) {
    auth.equippedBadge = equipped ?? ''
    badgeCache[auth.user.id] = equipped ?? ''
  }
  return { ok: true }
}

export async function equipBadge(itemId: string | null): Promise<boolean> {
  if (!supabase || !auth.user) return false
  if (itemId && !isOwned(itemId)) return false
  const { data, error } = await supabase.rpc('equip_reward_badge', { p_item: itemId })
  if (error) return false
  const value = (data as string | null) ?? ''
  auth.equippedBadge = value
  badgeCache[auth.user.id] = value
  return true
}

/** 商品目录（便于页面分组） */
export { REWARDS }

watch(
  () => auth.user?.id,
  () => {
    void loadRewards()
  },
  { immediate: true },
)
