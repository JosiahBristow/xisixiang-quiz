import type { ThemeId } from '../types'

export interface RewardItem {
  id: string
  kind: 'theme' | 'badge'
  name: string
  desc: string
  cost: number
  theme?: ThemeId
  char?: string
  tier?: 'bronze' | 'silver' | 'gold'
}

/** 需与 supabase/migrations/0007_rewards.sql 中的商品保持一致 */
export const REWARDS: RewardItem[] = [
  {
    id: 'theme_cinnabar',
    kind: 'theme',
    name: '朱砂',
    desc: '暖白纸感 · 朱砂点题',
    cost: 400,
    theme: 'cinnabar',
  },
  {
    id: 'theme_celadon',
    kind: 'theme',
    name: '青瓷',
    desc: '淡青釉色 · 清透护眼',
    cost: 400,
    theme: 'celadon',
  },
  {
    id: 'theme_nocturne',
    kind: 'theme',
    name: '夜航',
    desc: '深靛夜色 · 紫金微光',
    cost: 600,
    theme: 'nocturne',
  },
  {
    id: 'badge_jade',
    kind: 'badge',
    name: '青玉',
    desc: '玉质温润的荣誉徽章',
    cost: 300,
    char: '玉',
    tier: 'bronze',
  },
  {
    id: 'badge_gold',
    kind: 'badge',
    name: '流金',
    desc: '鎏金光泽的荣誉徽章',
    cost: 800,
    char: '金',
    tier: 'silver',
  },
  {
    id: 'badge_phoenix',
    kind: 'badge',
    name: '丹凤',
    desc: '丹凤朝阳 · 最高荣誉',
    cost: 1500,
    char: '凤',
    tier: 'gold',
  },
]

export const THEME_REWARDS = REWARDS.filter((r) => r.kind === 'theme')
export const BADGE_REWARDS = REWARDS.filter((r) => r.kind === 'badge')

export function rewardById(id: string | null | undefined): RewardItem | undefined {
  if (!id) return undefined
  return REWARDS.find((r) => r.id === id)
}
