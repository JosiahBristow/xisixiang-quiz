<script setup lang="ts">
import { computed, ref } from 'vue'
import { BADGES, addDays, dayKeyOf, todayKey } from '../lib/incentives'
import type { RewardItem } from '../lib/rewards'
import { BADGE_REWARDS, LAYOUT_REWARDS, THEME_REWARDS } from '../lib/rewards'
import UserAvatar from '../components/UserAvatar.vue'
import RewardBadge from '../components/RewardBadge.vue'
import { attempts } from '../stores/progress'
import { auth } from '../stores/auth'
import { balancePoints, equipBadge, isOwned, purchaseReward, rewards } from '../stores/rewards'
import { setLayout, setTheme, settings } from '../stores/settings'
import { ui } from '../stores/ui'
import { pkStats } from '../stores/pkStats'
import {
  level,
  nextLevel,
  stats,
  unlockedCount,
  unlockedIds,
} from '../stores/incentives'

const isUnlocked = (id: string) => unlockedIds.value.has(id)

const themeItems = THEME_REWARDS
const badgeItems = BADGE_REWARDS
const layoutItems = LAYOUT_REWARDS
const shopMsg = ref('')

function requireLogin(): boolean {
  if (auth.user) return true
  ui.authOpen = true
  return false
}

function themeAction(item: RewardItem): string {
  if (!isOwned(item.id)) return '解锁'
  return settings.theme === item.theme ? '使用中' : '使用'
}

function badgeAction(item: RewardItem): string {
  if (!isOwned(item.id)) return '兑换'
  return auth.equippedBadge === item.id ? '摘下' : '佩戴'
}

function layoutAction(item: RewardItem): string {
  if (!isOwned(item.id)) return '解锁'
  return settings.layout === item.layout ? '使用中' : '使用'
}

async function handleLayout(item: RewardItem) {
  if (!requireLogin()) return
  shopMsg.value = ''
  if (!isOwned(item.id)) {
    if (!rewards.admin && item.cost > balancePoints.value) {
      shopMsg.value = `积分不足，还差 ${item.cost - balancePoints.value} 分`
      return
    }
    if (!window.confirm(`使用 ${item.cost} 积分解锁「${item.name}」？`)) return
    const res = await purchaseReward(item.id)
    if (!res.ok) {
      shopMsg.value = res.msg ?? '兑换失败，请稍后再试'
      return
    }
    shopMsg.value = `已解锁「${item.name}」`
  }
  if (item.layout) setLayout(item.layout)
}

async function handleTheme(item: RewardItem) {
  if (!requireLogin()) return
  shopMsg.value = ''
  if (!isOwned(item.id)) {
    if (!rewards.admin && item.cost > balancePoints.value) {
      shopMsg.value = `积分不足，还差 ${item.cost - balancePoints.value} 分`
      return
    }
    if (!window.confirm(`使用 ${item.cost} 积分解锁「${item.name}」主题？`)) return
    const res = await purchaseReward(item.id)
    if (!res.ok) {
      shopMsg.value = res.msg ?? '兑换失败，请稍后再试'
      return
    }
    shopMsg.value = `已解锁「${item.name}」主题`
  }
  if (item.theme) setTheme(item.theme)
}

async function handleBadge(item: RewardItem) {
  if (!requireLogin()) return
  shopMsg.value = ''
  if (!isOwned(item.id)) {
    if (!rewards.admin && item.cost > balancePoints.value) {
      shopMsg.value = `积分不足，还差 ${item.cost - balancePoints.value} 分`
      return
    }
    if (!window.confirm(`使用 ${item.cost} 积分解锁「${item.name}」徽章？`)) return
    const res = await purchaseReward(item.id)
    if (!res.ok) {
      shopMsg.value = res.msg ?? '兑换失败，请稍后再试'
      return
    }
    shopMsg.value = `已解锁「${item.name}」并自动佩戴`
    return
  }
  await equipBadge(auth.equippedBadge === item.id ? null : item.id)
}

const week = computed(() => {
  const counts = new Map<string, number>()
  for (const a of attempts) {
    const key = dayKeyOf(a.at)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const today = todayKey()
  const days = []
  for (let i = 6; i >= 0; i--) {
    const key = addDays(today, -i)
    days.push({ key, label: key.slice(5), count: counts.get(key) ?? 0 })
  }
  const max = Math.max(1, ...days.map((d) => d.count))
  return days.map((d) => ({
    ...d,
    height: d.count ? Math.max(8, Math.round((d.count / max) * 100)) : 3,
  }))
})

const statTiles = computed(() => [
  { label: '已刷题目', value: stats.value.done },
  { label: '答对题目', value: stats.value.correct },
  { label: '正确率', value: `${stats.value.accuracy}%` },
  { label: '当前连对', value: stats.value.currentStreak },
  { label: '最长连对', value: stats.value.maxStreak },
  { label: '连续打卡', value: `${stats.value.dayStreak} 天` },
  { label: 'PK 胜场', value: pkStats.wins },
])
</script>

<template>
  <main class="me">
    <div class="wrap me-wrap">
      <section class="me-head card">
        <UserAvatar :src="auth.avatarUrl" :name="auth.nickname || '我'" :size="64" />
        <div class="me-id">
          <div class="me-name-row">
            <h1 class="serif">{{ auth.user ? auth.nickname : '游客' }}</h1>
            <span class="badge badge-accent">{{ level.name }}</span>
            <RewardBadge v-if="auth.equippedBadge" :item-id="auth.equippedBadge" :size="20" />
          </div>
          <p class="me-sub">
            积分 {{ rewards.admin ? '∞' : balancePoints }} · 累计获得 {{ stats.points }} · 已答对 {{ stats.correct }} 题 · 解锁
            {{ unlockedCount }}/{{ BADGES.length }} 成就
          </p>
          <div class="level-track"><i :style="{ width: stats.levelPercent + '%' }" /></div>
          <small class="level-hint">
            {{ nextLevel ? `距离「${nextLevel.name}」还差 ${nextLevel.min - stats.points} 分（按累计获得）` : '已达到最高等级' }}
          </small>
        </div>
        <div class="me-actions">
          <button v-if="!auth.user" class="btn btn-primary btn-sm" @click="ui.authOpen = true">登录后上榜</button>
          <router-link v-else to="/leaderboard" class="btn btn-ghost btn-sm">积分榜</router-link>
        </div>
      </section>

      <section class="stat-grid">
        <div v-for="tile in statTiles" :key="tile.label" class="stat-tile card">
          <b class="serif">{{ tile.value }}</b>
          <span>{{ tile.label }}</span>
        </div>
      </section>

      <p v-if="!auth.user" class="guest-note">
        当前是本机数据。登录后会自动同步云端记录，积分也会参与排行榜。
      </p>

      <section class="card badges">
        <header class="sec-head">
          <div>
            <h2 class="serif">成就徽章</h2>
            <p>答对、连对、打卡、PK 都能解锁</p>
          </div>
          <span class="badge">{{ unlockedCount }} / {{ BADGES.length }}</span>
        </header>

        <div class="badge-grid">
          <div
            v-for="b in BADGES"
            :key="b.id"
            class="badge-cell"
            :class="[b.tier, { locked: !isUnlocked(b.id) }]"
          >
            <span class="bc-medal serif">{{ b.char }}</span>
            <div class="bc-text">
              <b>{{ b.name }}</b>
              <small>{{ b.desc }}</small>
            </div>
            <span v-if="isUnlocked(b.id)" class="bc-check" aria-label="已解锁">✓</span>
            <span v-else class="bc-lock">未解锁</span>
          </div>
        </div>
      </section>

      <section class="card shop">
        <header class="sec-head">
          <div>
            <h2 class="serif">积分商城</h2>
            <p>消费会从积分余额中扣除，并同步影响积分榜排名</p>
          </div>
          <span class="badge badge-accent">{{ rewards.admin ? '∞' : balancePoints }} 积分</span>
        </header>

        <p v-if="shopMsg" class="shop-msg">{{ shopMsg }}</p>

        <div class="shop-group">
          <h3>主题皮肤</h3>
          <div class="shop-grid">
            <div v-for="item in themeItems" :key="item.id" class="shop-item">
              <div class="si-main">
                <b>{{ item.name }}</b>
                <small>{{ item.desc }}</small>
              </div>
              <span v-if="!isOwned(item.id)" class="si-price">{{ item.cost }} 积分</span>
              <button
                class="btn btn-sm"
                :class="isOwned(item.id) ? 'btn-ghost' : 'btn-primary'"
                @click="handleTheme(item)"
              >
                {{ themeAction(item) }}
              </button>
            </div>
          </div>
        </div>

        <div class="shop-group">
          <h3>界面布局</h3>
          <div class="shop-grid">
            <div v-for="item in layoutItems" :key="item.id" class="shop-item">
              <span class="si-layout" :class="item.layout" />
              <div class="si-main">
                <b>{{ item.name }}</b>
                <small>{{ item.desc }}</small>
              </div>
              <span v-if="!isOwned(item.id)" class="si-price">{{ item.cost }} 积分</span>
              <button
                class="btn btn-sm"
                :class="
                  !isOwned(item.id)
                    ? 'btn-primary'
                    : settings.layout === item.layout
                      ? 'btn-soft'
                      : 'btn-ghost'
                "
                @click="handleLayout(item)"
              >
                {{ layoutAction(item) }}
              </button>
            </div>
          </div>
        </div>

        <div class="shop-group">
          <h3>荣誉徽章</h3>
          <div class="shop-grid">
            <div v-for="item in badgeItems" :key="item.id" class="shop-item">
              <RewardBadge :item-id="item.id" :size="30" />
              <div class="si-main">
                <b>{{ item.name }}</b>
                <small>{{ item.desc }}</small>
              </div>
              <span v-if="!isOwned(item.id)" class="si-price">{{ item.cost }} 积分</span>
              <button
                class="btn btn-sm"
                :class="
                  !isOwned(item.id)
                    ? 'btn-primary'
                    : auth.equippedBadge === item.id
                      ? 'btn-soft'
                      : 'btn-ghost'
                "
                @click="handleBadge(item)"
              >
                {{ badgeAction(item) }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="card week">
        <header class="sec-head">
          <div>
            <h2 class="serif">最近 7 天</h2>
            <p>每天答题数量</p>
          </div>
          <span class="badge">今日 {{ stats.todayCount }} 题</span>
        </header>

        <div class="bars">
          <div v-for="d in week" :key="d.key" class="bar" :class="{ today: d.key === todayKey() }">
            <span class="bar-count">{{ d.count || '' }}</span>
            <i :style="{ height: d.height + '%' }" />
            <small>{{ d.label }}</small>
          </div>
        </div>
      </section>

      <p class="rules-note">
        积分规则：答对一题 +10（每题只计一次）· PK 获胜 +80 · 活跃一天 +20；商城消费从余额扣除。
      </p>
    </div>
  </main>
</template>

<style scoped>
.me {
  flex: 1;
  padding: 30px 0 60px;
}

.me-wrap {
  max-width: 820px;
}

/* ---------- 头部 ---------- */
.me-head {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 26px 30px;
  animation: rise 0.45s var(--ease) both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.me-avatar {
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--accent-soft);
  border: 1.5px solid var(--accent-line);
  color: var(--accent);
  font-size: 30px;
  font-weight: 700;
}

.me-id {
  flex: 1;
  min-width: 0;
}

.me-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.me-name-row h1 {
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.me-sub {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--text-2);
}

.level-track {
  height: 6px;
  margin-top: 12px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  overflow: hidden;
}

.level-track i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--gold));
  transition: width 0.5s var(--ease);
}

.level-hint {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  color: var(--muted);
}

.me-actions {
  flex-shrink: 0;
}

/* ---------- 统计 ---------- */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.stat-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 14px 6px 12px;
  text-align: center;
}

.stat-tile b {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.stat-tile span {
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
}

.guest-note {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--accent);
  font-size: 12px;
  text-align: center;
}

/* ---------- 区块 ---------- */
section.card.badges,
section.card.shop,
section.card.week {
  margin-top: 16px;
  padding: 22px 26px 24px;
}

.sec-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}

.sec-head h2 {
  font-size: 19px;
  font-weight: 700;
}

.sec-head p {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--muted);
}

/* ---------- 徽章 ---------- */
.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
  gap: 10px;
}

.badge-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 13px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  transition: border-color 0.18s, background-color 0.18s, transform 0.18s var(--ease);
}

.badge-cell:not(.locked):hover {
  transform: translateY(-2px);
  border-color: var(--accent-line);
}

.bc-medal {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 20px;
  font-weight: 700;
  border: 1.5px solid transparent;
}

.badge-cell.bronze .bc-medal {
  background: #f0e2d3;
  border-color: #d9b58f;
  color: #8a5a2b;
}

.badge-cell.silver .bc-medal {
  background: #e9edf1;
  border-color: #bcc7d1;
  color: #55636f;
}

.badge-cell.gold .bc-medal {
  background: #f6ebcf;
  border-color: #dcc07a;
  color: #8a6a1a;
}

[data-theme='night'] .badge-cell.bronze .bc-medal,
[data-theme='ink'] .badge-cell.bronze .bc-medal {
  background: #2c2218;
  border-color: #54402a;
  color: #d9a771;
}

[data-theme='night'] .badge-cell.silver .bc-medal,
[data-theme='ink'] .badge-cell.silver .bc-medal {
  background: #222a32;
  border-color: #3c4a57;
  color: #b6c5d2;
}

[data-theme='night'] .badge-cell.gold .bc-medal,
[data-theme='ink'] .badge-cell.gold .bc-medal {
  background: #2b2416;
  border-color: #564622;
  color: #e3c079;
}

.bc-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.bc-text b {
  font-size: 13.5px;
  font-weight: 600;
}

.bc-text small {
  font-size: 10.5px;
  color: var(--muted);
  line-height: 1.45;
}

.bc-check {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--ok);
  font-size: 13px;
  font-weight: 700;
}

.bc-lock {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 1px 5px;
  white-space: nowrap;
}

.badge-cell.locked {
  opacity: 0.55;
  background: var(--surface);
  border-style: dashed;
}

.badge-cell.locked .bc-medal {
  background: var(--surface-2);
  border-color: var(--line-strong);
  color: var(--muted);
}

/* ---------- 积分商城 ---------- */
.shop-msg {
  margin: -4px 0 12px;
  padding: 8px 12px;
  border-radius: 9px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--accent);
  font-size: 12px;
}

.shop-group + .shop-group {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed var(--line);
}

.shop-group h3 {
  margin-bottom: 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 8px;
}

.shop-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--surface-2);
}

.si-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.35;
}

.si-main b {
  font-size: 13px;
  font-weight: 600;
}

.si-main small {
  font-size: 10.5px;
  color: var(--muted);
}

.si-price {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--gold);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.si-layout {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 9px;
  border: 1px solid var(--line);
}

.si-layout.bilibili {
  background: linear-gradient(135deg, #fb7299, #00aeec);
}

.si-layout.douyin {
  background: linear-gradient(135deg, #25f4ee, #fe2c55);
}

.shop-item .btn {
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 11.5px;
  flex-shrink: 0;
}

/* ---------- 近七天 ---------- */
.bars {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 132px;
  padding-top: 12px;
}

.bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: 100%;
  min-width: 0;
}

.bar i {
  width: min(34px, 100%);
  border-radius: 6px 6px 3px 3px;
  background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--gold)));
  opacity: 0.85;
  transition: height 0.4s var(--ease);
}

.bar.today i {
  opacity: 1;
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.bar-count {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  min-height: 14px;
}

.bar small {
  font-size: 10px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.rules-note {
  margin-top: 16px;
  text-align: center;
  font-size: 11.5px;
  color: var(--muted);
}

/* ---------- 响应式 ---------- */
@media (max-width: 860px) {
  .stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .me {
    padding: 18px 0 44px;
  }

  .me-head {
    padding: 18px 16px;
    gap: 13px;
    flex-wrap: wrap;
  }

  .me-avatar {
    width: 54px;
    height: 54px;
    font-size: 23px;
  }

  .me-name-row h1 {
    font-size: 20px;
  }

  .me-sub {
    font-size: 11.5px;
  }

  .me-actions {
    width: 100%;
  }

  .me-actions .btn {
    width: 100%;
  }

  .stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .stat-tile {
    padding: 11px 4px 10px;
  }

  .stat-tile b {
    font-size: 17px;
  }

  .stat-tile span {
    font-size: 9.5px;
  }

  section.card.badges,
  section.card.shop,
  section.card.week {
    padding: 18px 14px 20px;
  }

  .shop-grid {
    grid-template-columns: 1fr;
  }

  .badge-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .badge-cell {
    padding: 10px 12px;
  }

  .bc-medal {
    width: 38px;
    height: 38px;
    font-size: 17px;
  }

  .bars {
    gap: 5px;
    height: 118px;
  }

  .bar-count {
    font-size: 9.5px;
  }

  .bar small {
    font-size: 9px;
  }
}
</style>
