<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { LeaderboardRow } from '../types'
import { bank, chapterById } from '../lib/bank'
import { hasSupabase, supabase } from '../lib/supabase'
import { sync } from '../lib/sync'
import { auth } from '../stores/auth'
import { ui } from '../stores/ui'

type TabId = 'total' | 'chapter' | 'week'

const tabs: { id: TabId; label: string; hint: string }[] = [
  { id: 'total', label: '总榜', hint: '按已刷题目数排名，同数量看正确率' },
  { id: 'chapter', label: '章节榜', hint: '该章刷过一半以上才能入榜，按正确率排名' },
  { id: 'week', label: '周榜', hint: '每周一 0 点（北京时间）重新开始，统计本周答题数' },
]

const tab = ref<TabId>('total')
const chapterId = ref('ch1')
const rows = ref<LeaderboardRow[]>([])
const loading = ref(false)
const error = ref('')
const loadedOnce = ref(false)

const hint = computed(() => tabs.find((t) => t.id === tab.value)?.hint ?? '')
const myRow = computed(() => rows.value.find((r) => r.is_me))
const currentChapter = computed(() => chapterById.get(chapterId.value))

async function load() {
  if (!supabase) return
  loading.value = true
  error.value = ''
  try {
    let response
    if (tab.value === 'total') {
      response = await supabase.rpc('lb_total', { p_limit: 50 })
    } else if (tab.value === 'week') {
      response = await supabase.rpc('lb_weekly', { p_limit: 50 })
    } else {
      const minDone = Math.max(1, Math.ceil((currentChapter.value?.questions.length ?? 1) / 2))
      response = await supabase.rpc('lb_chapter', {
        p_chapter: chapterId.value,
        p_min_done: minDone,
        p_limit: 50,
      })
    }
    if (response.error) throw response.error
    rows.value = ((response.data ?? []) as Record<string, unknown>[]).map((r) => ({
      rank: Number(r.rank),
      user_id: String(r.user_id),
      nickname: String(r.nickname ?? '匿名同学'),
      done: Number(r.done),
      correct: Number(r.correct),
      accuracy: Number(r.accuracy),
      is_me: Boolean(r.is_me),
    }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    error.value = /could not find the function|does not exist/i.test(msg)
      ? '排行榜数据表还没建好：请先在 Supabase SQL Editor 执行 supabase/migrations/0001_init.sql'
      : '排行榜加载失败，请稍后重试。'
    rows.value = []
  } finally {
    loading.value = false
    loadedOnce.value = true
  }
}

watch([tab, chapterId], load)

// 登录状态或云同步完成时刷新，我的名次立即生效
watch([() => auth.user?.id, () => sync.lastAt], () => {
  if (hasSupabase) void load()
})

onMounted(load)
</script>

<template>
  <main class="lb">
    <div class="wrap lb-wrap">
      <header class="lb-head">
        <div>
          <p class="eyebrow"><span class="rule" />排行榜</p>
          <h1 class="serif">学霸榜</h1>
          <p class="sub">{{ hint }}</p>
        </div>
        <button class="icon-btn refresh" :class="{ spin: loading }" title="刷新" @click="load">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
          </svg>
        </button>
      </header>

      <div v-if="!hasSupabase" class="card setup">
        <h3>排行榜尚未启用</h3>
        <p>配置好了 Supabase 环境变量后，这里会显示大家的成绩排名。</p>
      </div>

      <template v-else>
        <div class="lb-toolbar">
          <div class="tabs seg">
            <button v-for="t in tabs" :key="t.id" :class="{ on: tab === t.id }" @click="tab = t.id">
              {{ t.label }}
            </button>
          </div>
          <select v-if="tab === 'chapter'" v-model="chapterId" class="input lb-select">
            <option v-for="ch in bank.chapters" :key="ch.id" :value="ch.id">
              {{ ch.short }} · {{ ch.name }}
            </option>
          </select>
        </div>

        <section class="board card">
          <div class="board-head">
            <span class="col-rank">名次</span>
            <span class="col-user">同学</span>
            <span class="col-done">{{ tab === 'week' ? '本周答题' : '已刷题数' }}</span>
            <span class="col-acc">正确率</span>
          </div>

          <div v-if="loading && !loadedOnce" class="sk-rows">
            <div v-for="n in 6" :key="n" class="sk-row">
              <span class="sk" style="width: 28px; height: 28px; border-radius: 50%" />
              <span class="sk" style="width: 38%; height: 14px" />
              <span class="sk" style="width: 40px; height: 14px" />
              <span class="sk" style="width: 46px; height: 20px; border-radius: 7px" />
            </div>
          </div>

          <div v-else-if="error" class="board-msg">
            <p>{{ error }}</p>
            <button class="btn btn-soft btn-sm" @click="load">重新加载</button>
          </div>

          <div v-else-if="!rows.length" class="board-msg">
            <div class="empty-mark serif">榜</div>
            <p>还没有人上榜，刷几道题就能拿下第一名。</p>
          </div>

          <ul v-else class="rows">
            <li v-for="row in rows" :key="row.user_id" class="row" :class="{ me: row.is_me }">
              <span class="rank" :class="row.rank <= 3 ? 'r' + row.rank : ''">{{ row.rank }}</span>
              <span class="user">
                <span class="av">{{ row.nickname.slice(0, 1) }}</span>
                <b>{{ row.nickname }}</b>
                <span v-if="row.is_me" class="me-tag">我</span>
              </span>
              <span class="done">{{ row.done }}</span>
              <span class="acc" :class="row.accuracy >= 80 ? 'good' : row.accuracy >= 60 ? 'mid' : 'low'">
                {{ row.accuracy }}%
              </span>
            </li>
          </ul>
        </section>

        <section class="my card" :class="{ empty: !myRow }">
          <template v-if="auth.user && myRow">
            <span class="my-label">我的名次</span>
            <b class="my-rank serif">第 {{ myRow.rank }} 名</b>
            <span class="my-detail">{{ myRow.done }} 题 · 正确率 {{ myRow.accuracy }}%</span>
          </template>
          <template v-else-if="auth.user">
            <span class="my-label">我的名次</span>
            <b class="my-rank serif">暂无记录</b>
            <span class="my-detail">刷几道题就来排榜了</span>
          </template>
          <template v-else>
            <span class="my-label">未登录</span>
            <b class="my-rank serif">登录后参与排名</b>
            <span class="my-detail">成绩和学习进度都会自动同步</span>
            <button class="btn btn-primary btn-sm" @click="ui.authOpen = true">登录 / 注册</button>
          </template>
        </section>

        <ul class="rules">
          <li><b>总榜</b> · 按已刷题目数排序，数量相同看正确率</li>
          <li><b>章节榜</b> · 该章刷过一半以上题目才能入榜，按正确率排序</li>
          <li><b>周榜</b> · 每周一 0 点（北京时间）重新统计</li>
          <li>排名基于登录账号的作答记录，未登录时只在本机保存进度</li>
        </ul>
      </template>
    </div>
  </main>
</template>

<style scoped>
.lb {
  flex: 1;
  padding: 34px 0 60px;
}

.lb-wrap {
  max-width: 760px;
}

.lb-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--accent);
}

.rule {
  display: inline-block;
  width: 20px;
  height: 1.5px;
  background: var(--accent-line);
}

.lb-head h1 {
  margin: 10px 0 6px;
  font-size: clamp(26px, 4vw, 34px);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.sub {
  font-size: 13px;
  color: var(--text-2);
}

.refresh {
  margin-top: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  flex-shrink: 0;
}

.refresh.spin svg {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.lb-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.lb-select {
  height: 38px;
  flex: 1;
  min-width: 190px;
  max-width: 330px;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
}

/* ---------- 榜单 ---------- */
.board {
  overflow: hidden;
}

.board-head,
.row {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 110px 92px;
  align-items: center;
  gap: 8px;
}

.board-head {
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.col-done,
.col-acc {
  text-align: right;
}

.rows .row {
  padding: 12px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  transition: background-color 0.14s;
}

.rows .row:last-child {
  border-bottom: 0;
}

.rows .row:hover {
  background: var(--surface-2);
}

.rows .row.me {
  background: color-mix(in srgb, var(--accent-soft) 55%, transparent);
}

.rank {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border-radius: 50%;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.rank.r1 {
  background: linear-gradient(150deg, #ecd28a, #c9a13b);
  color: #2c2005;
  box-shadow: 0 4px 10px -4px rgba(180, 140, 40, 0.6);
}

.rank.r2 {
  background: linear-gradient(150deg, #dfe4ea, #aab3bd);
  color: #1e252c;
}

.rank.r3 {
  background: linear-gradient(150deg, #e3b48b, #bd8254);
  color: #2b1607;
}

.user {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.av {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
}

.user b {
  font-size: 13.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.me-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 10px;
  font-weight: 700;
}

.done {
  text-align: right;
  font-size: 13.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.acc {
  justify-self: end;
  min-width: 58px;
  padding: 3px 8px;
  border-radius: 7px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.acc.good {
  background: var(--ok-soft);
  color: var(--ok);
}

.acc.mid {
  background: var(--surface-2);
  color: var(--text-2);
}

.acc.low {
  background: var(--bad-soft);
  color: var(--bad);
}

.sk-rows {
  padding: 8px 20px;
}

.sk-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
}

.board-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 46px 24px;
  text-align: center;
  font-size: 13.5px;
  color: var(--text-2);
  line-height: 1.7;
}

.empty-mark {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 26px;
}

/* ---------- 我的名次 ---------- */
.my {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 14px;
  padding: 15px 20px;
}

.my-label {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.my-rank {
  font-size: 19px;
  font-weight: 700;
  color: var(--accent);
}

.my-detail {
  font-size: 12.5px;
  color: var(--text-2);
}

.my .btn {
  margin-left: auto;
}

.setup {
  padding: 40px 24px;
  text-align: center;
}

.setup h3 {
  font-size: 17px;
  margin-bottom: 6px;
}

.setup p {
  font-size: 13px;
  color: var(--text-2);
}

/* ---------- 规则 ---------- */
.rules {
  margin-top: 20px;
  padding: 0 4px;
  font-size: 11.5px;
  line-height: 2;
  color: var(--muted);
}

.rules b {
  color: var(--text-2);
  font-weight: 600;
}

@media (max-width: 640px) {
  .lb {
    padding: 22px 0 44px;
  }

  .board-head,
  .row {
    grid-template-columns: 42px minmax(0, 1fr) 64px 66px;
    gap: 6px;
  }

  .board-head {
    padding: 10px 14px;
    font-size: 10.5px;
  }

  .rows .row {
    padding: 11px 14px;
  }

  .rank {
    width: 26px;
    height: 26px;
    font-size: 11.5px;
  }

  .user b {
    font-size: 13px;
  }

  .done {
    font-size: 12.5px;
  }

  .acc {
    min-width: 52px;
    font-size: 11.5px;
    padding: 2px 6px;
  }

  .my {
    gap: 6px 12px;
    padding: 13px 15px;
  }

  .my-rank {
    font-size: 17px;
  }

  .my-detail {
    width: 100%;
    order: 3;
  }

  .my .btn {
    margin-left: auto;
  }

  .lb-select {
    max-width: none;
    width: 100%;
  }
}
</style>
