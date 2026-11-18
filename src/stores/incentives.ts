import { computed, reactive, watch } from 'vue'
import type { BadgeDef } from '../lib/incentives'
import { BADGES, computeBadgeIds, computeIncentiveStats } from '../lib/incentives'
import { attempts, chapterStats } from './progress'
import { pkStats } from './pkStats'

export const stats = computed(() => computeIncentiveStats(attempts, pkStats.wins))

export const currentStreak = computed(() => stats.value.currentStreak)
export const points = computed(() => stats.value.points)
export const level = computed(() => stats.value.level)
export const nextLevel = computed(() => stats.value.nextLevel)

export const unlockedIds = computed(() => computeBadgeIds(stats.value, chapterStats.value.values()))
export const unlockedBadges = computed(() => BADGES.filter((b) => unlockedIds.value.has(b.id)))
export const unlockedCount = computed(() => unlockedBadges.value.length)

/** 全局成就解锁提示队列 */
export const unlockToast = reactive<{ queue: BadgeDef[]; current: BadgeDef | null }>({
  queue: [],
  current: null,
})

let toastTimer: ReturnType<typeof setTimeout> | null = null

function showNextToast() {
  if (unlockToast.current || !unlockToast.queue.length) return
  unlockToast.current = unlockToast.queue.shift() ?? null
  toastTimer = setTimeout(() => {
    unlockToast.current = null
    toastTimer = null
    showNextToast()
  }, 3200)
}

let primed = false
let baseline = new Set<string>()

watch(
  [unlockedIds, () => pkStats.loaded],
  ([ids, loaded]) => {
    // 等 PK 战绩（徽章条件之一）加载完再做基线，避免刷新页面时把旧成就当新解锁
    if (!loaded) return
    if (!primed) {
      primed = true
      baseline = new Set(ids)
      return
    }
    const fresh = [...ids].filter((id) => !baseline.has(id))
    baseline = new Set(ids)
    for (const id of fresh) {
      const def = BADGES.find((b) => b.id === id)
      if (def) unlockToast.queue.push(def)
    }
    showNextToast()
  },
  { immediate: true },
)
