<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Question } from '../types'
import { allQuestions, questionById, sameAnswer, shuffle } from '../lib/bank'
import { recordAttempts } from '../stores/progress'
import { settings } from '../stores/settings'
import { scheduleSync } from '../lib/sync'

type Phase = 'setup' | 'running' | 'result'

const router = useRouter()

const SESSION_KEY = 'qz.test.session.v1'
const letters = ['A', 'B', 'C', 'D', 'E', 'F']
const RING_C = 2 * Math.PI * 68
const choices = [10, 20, 30, 50, 0]

const phase = ref<Phase>('setup')
const chosen = ref(settings.testCount || 20)
const questions = ref<Question[]>([])
const answers = reactive<Record<string, string[]>>({})
const index = ref(0)
const elapsed = ref(0)
const restored = ref(false)
const sheetOpen = ref(false)
const confirmSubmit = ref(false)

let startedAt = 0
let timerHandle: ReturnType<typeof setInterval> | null = null

const total = computed(() => questions.value.length)
const current = computed<Question | undefined>(() => questions.value[index.value])
const multi = computed(() => current.value?.type === 'multi')

const actualCount = computed(() =>
  chosen.value === 0 ? allQuestions.length : Math.min(chosen.value, allQuestions.length),
)

const answeredCount = computed(
  () => questions.value.filter((q) => (answers[q.id]?.length ?? 0) > 0).length,
)
const unansweredCount = computed(() => total.value - answeredCount.value)
const progressPercent = computed(() =>
  total.value ? (answeredCount.value / total.value) * 100 : 0,
)

const stats = computed(() => {
  let correct = 0
  let wrong = 0
  let skipped = 0
  for (const q of questions.value) {
    const picked = answers[q.id] ?? []
    if (!picked.length) skipped++
    else if (sameAnswer(picked, q.answer)) correct++
    else wrong++
  }
  return { correct, wrong, skipped }
})

const accuracy = computed(() =>
  total.value ? Math.round((stats.value.correct / total.value) * 100) : 0,
)

const durationText = computed(() => fmt(elapsed.value))

const resultTitle = computed(() => {
  const a = accuracy.value
  if (a >= 90) return '太稳了，这就是实力。'
  if (a >= 75) return '不错，再巩固一下更稳。'
  if (a >= 60) return '刚过及格线，错题再过一遍。'
  return '别灰心，错题本见。'
})

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(r).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function stopTimer() {
  if (timerHandle) {
    clearInterval(timerHandle)
    timerHandle = null
  }
}

function startTimer() {
  stopTimer()
  startedAt = Date.now() - elapsed.value * 1000
  timerHandle = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startedAt) / 1000)
    if (elapsed.value % 5 === 0) persist()
  }, 1000)
}

function resetAnswers() {
  for (const key of Object.keys(answers)) delete answers[key]
}

function persist() {
  if (phase.value !== 'running' || !total.value) return
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        ids: questions.value.map((q) => q.id),
        answers,
        index: index.value,
        elapsed: elapsed.value,
        chosen: chosen.value,
      }),
    )
  } catch {
    /* 隐私模式等场景忽略 */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

function start() {
  settings.testCount = chosen.value
  const pool = shuffle(allQuestions)
  questions.value = pool.slice(0, actualCount.value)
  resetAnswers()
  index.value = 0
  elapsed.value = 0
  restored.value = false
  sheetOpen.value = false
  confirmSubmit.value = false
  phase.value = 'running'
  persist()
  startTimer()
  window.scrollTo({ top: 0 })
}

function restore() {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(SESSION_KEY)
  } catch {
    return
  }
  if (!raw) return
  try {
    const saved = JSON.parse(raw) as {
      ids?: string[]
      answers?: Record<string, string[]>
      index?: number
      elapsed?: number
      chosen?: number
    }
    const list = (saved.ids ?? [])
      .map((id) => questionById.get(id))
      .filter((q): q is Question => Boolean(q))
    if (!list.length) throw new Error('empty')
    questions.value = list
    resetAnswers()
    Object.assign(answers, saved.answers ?? {})
    index.value = Math.min(Math.max(saved.index ?? 0, 0), list.length - 1)
    elapsed.value = Math.max(saved.elapsed ?? 0, 0)
    chosen.value = typeof saved.chosen === 'number' ? saved.chosen : chosen.value
    phase.value = 'running'
    restored.value = true
    startTimer()
  } catch {
    clearSession()
  }
}

function isPicked(key: string): boolean {
  const q = current.value
  return q ? (answers[q.id] ?? []).includes(key) : false
}

function pick(key: string) {
  const q = current.value
  if (!q) return
  const picked = answers[q.id] ?? []
  if (q.type === 'multi') {
    answers[q.id] = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]
  } else {
    answers[q.id] = [key]
  }
  persist()
}

function go(i: number) {
  if (i < 0 || i >= total.value) return
  index.value = i
  persist()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function jump(i: number) {
  go(i)
  sheetOpen.value = false
}

function askSubmit() {
  sheetOpen.value = false
  confirmSubmit.value = true
}

function submit() {
  if (phase.value !== 'running') return
  const entries = questions.value
    .filter((q) => (answers[q.id]?.length ?? 0) > 0)
    .map((q) => ({ question: q, correct: sameAnswer(answers[q.id] ?? [], q.answer) }))
  if (entries.length) {
    recordAttempts(entries)
    scheduleSync()
  }
  stopTimer()
  confirmSubmit.value = false
  sheetOpen.value = false
  phase.value = 'result'
  clearSession()
  window.scrollTo({ top: 0 })
}

function abandon() {
  stopTimer()
  clearSession()
  resetAnswers()
  questions.value = []
  index.value = 0
  elapsed.value = 0
  restored.value = false
  phase.value = 'setup'
}

function goSetup() {
  abandon()
}

function exitRun() {
  persist()
  router.push('/')
}

function goWrong() {
  router.push({ name: 'quiz', params: { scope: 'wrong' } })
}

function statusOf(q: Question): 'correct' | 'wrong' | 'skipped' {
  const picked = answers[q.id] ?? []
  if (!picked.length) return 'skipped'
  return sameAnswer(picked, q.answer) ? 'correct' : 'wrong'
}

function statusLabel(q: Question): string {
  const s = statusOf(q)
  return s === 'correct' ? '正确' : s === 'wrong' ? '错误' : '未作答'
}

function rvOptClass(q: Question, i: number) {
  const key = letters[i]
  const picked = (answers[q.id] ?? []).includes(key)
  const isAnswer = q.answer.includes(key)
  return {
    correct: isAnswer,
    picked,
    wrongPick: picked && !isAnswer,
  }
}

function onKey(e: KeyboardEvent) {
  if (phase.value !== 'running') return
  if (sheetOpen.value || confirmSubmit.value) {
    if (e.key === 'Escape') {
      sheetOpen.value = false
      confirmSubmit.value = false
    }
    return
  }
  const el = e.target as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
  const k = e.key.toLowerCase()
  const byLetter: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 }
  const byDigit: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 }
  const pos = byLetter[k] ?? byDigit[k]
  if (pos !== undefined && current.value && pos < current.value.options.length) {
    e.preventDefault()
    pick(letters[pos])
    return
  }
  if (e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault()
    if (index.value < total.value - 1) go(index.value + 1)
    else askSubmit()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    go(index.value - 1)
  }
}

onMounted(() => {
  restore()
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  stopTimer()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <main class="test-page" :class="phase">
    <!-- ① 选择抽题数量 -->
    <div v-if="phase === 'setup'" class="wrap setup-wrap">
      <section class="setup-card card">
        <div class="setup-head">
          <span class="setup-mark serif">测</span>
          <div>
            <p class="eyebrow">随机测试</p>
            <h1 class="serif">抽一套，见真章。</h1>
          </div>
        </div>

        <p class="setup-desc">
          从 {{ allQuestions.length }} 道题中随机抽题。答题过程中答案全部隐藏，交卷后统一公布结果，答错的题自动进入错题本。
        </p>

        <div class="count-block">
          <div class="count-label">
            <b>抽题数量</b>
            <span>共 {{ allQuestions.length }} 道题</span>
          </div>
          <div class="count-chips">
            <button
              v-for="c in choices"
              :key="c"
              class="chip-btn"
              :class="{ on: chosen === c }"
              @click="chosen = c"
            >
              {{ c === 0 ? '全部' : c + ' 题' }}
            </button>
          </div>
        </div>

        <ul class="setup-rules">
          <li>可自由跳题、修改答案，交卷前不显示任何对错</li>
          <li>交卷后逐题公布正确答案与知识点</li>
          <li>答错的题自动加入错题本，未作答不计入</li>
        </ul>

        <button class="btn btn-primary btn-lg setup-start" @click="start">
          开始测试 · {{ actualCount }} 题
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14m0 0-6-6m6 6-6 6" />
          </svg>
        </button>
        <button class="setup-back" @click="router.push('/')">先随便刷刷</button>
      </section>
    </div>

    <!-- ② 答题中 -->
    <template v-else-if="phase === 'running'">
      <div class="run-head">
        <div class="wrap run-head-in">
          <button class="btn btn-soft btn-sm run-exit" @click="exitRun">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
            </svg>
            <span>退出</span>
          </button>
          <div class="run-title">
            <b>随机测试</b>
            <span>{{ index + 1 }} / {{ total }}</span>
          </div>
          <div class="run-timer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
            {{ durationText }}
          </div>
        </div>
        <div class="wrap">
          <div class="track run-track"><i :style="{ width: progressPercent + '%' }" /></div>
        </div>
      </div>

      <div class="wrap run-body">
        <div v-if="restored" class="restore-bar">
          <span>已恢复上次未交卷的测试</span>
          <button @click="abandon">放弃，重新选择</button>
        </div>

        <article v-if="current" :key="current.id" class="q-card card">
          <header class="q-head">
            <div class="q-badges">
              <span class="badge" :class="{ 'badge-accent': multi }">{{ multi ? '多选题' : '单选题' }}</span>
              <span class="badge diff-badge">
                难度
                <span class="dots">
                  <i v-for="n in 3" :key="n" :class="{ on: n <= current.difficulty }" />
                </span>
              </span>
            </div>
            <span class="q-no serif">No.{{ String(index + 1).padStart(2, '0') }}</span>
          </header>

          <h2 class="stem">{{ current.stem }}</h2>

          <div class="options" role="group" aria-label="选项">
            <button
              v-for="(opt, i) in current.options"
              :key="i"
              class="opt"
              :class="{ selected: isPicked(letters[i]) }"
              @click="pick(letters[i])"
            >
              <span class="opt-key">{{ letters[i] }}</span>
              <span class="opt-text">{{ opt }}</span>
            </button>
          </div>

          <p class="run-note">
            {{ multi ? '多选题 · 可选择多项' : '单选题 · 选择后仍可更改' }} · 交卷后统一公布答案
          </p>
        </article>

        <div class="run-dock">
          <button class="btn btn-soft dock-btn" :disabled="index === 0" @click="go(index - 1)">上一题</button>
          <button class="dock-sheet" aria-label="打开答题卡" @click="sheetOpen = true">
            <span class="dock-num serif">{{ index + 1 }}</span>
            <span class="dock-label">答题卡<small>{{ answeredCount }} / {{ total }}</small></span>
          </button>
          <button v-if="index < total - 1" class="btn btn-primary dock-btn" @click="go(index + 1)">下一题</button>
          <button v-else class="btn btn-primary dock-btn" @click="askSubmit">交卷</button>
        </div>
      </div>
    </template>

    <!-- ③ 交卷结果 -->
    <template v-else>
      <div class="wrap result-wrap">
        <section class="final card">
          <div class="final-ring">
            <svg viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="68" class="rr-track" />
              <circle
                cx="80"
                cy="80"
                r="68"
                class="rr-fill"
                :stroke-dasharray="RING_C"
                :stroke-dashoffset="RING_C * (1 - accuracy / 100)"
              />
            </svg>
            <div class="rr-center">
              <b class="serif">{{ accuracy }}<small>%</small></b>
              <span>正确率</span>
            </div>
          </div>

          <h1 class="serif">{{ resultTitle }}</h1>
          <p class="final-sub">
            答对 {{ stats.correct }} / {{ total }} 题 · 错误 {{ stats.wrong }} · 未作答 {{ stats.skipped }} · 用时
            {{ durationText }}
          </p>

          <div class="final-actions">
            <button class="btn btn-primary" @click="goSetup">再测一次</button>
            <button v-if="stats.wrong" class="btn btn-ghost" @click="goWrong">去错题本</button>
            <button class="btn btn-ghost" @click="router.push('/')">回到首页</button>
          </div>

          <p v-if="stats.skipped" class="final-note">
            未作答的 {{ stats.skipped }} 道题不计入错题本，建议下次全部作答。
          </p>
        </section>

        <section class="review card">
          <header class="review-head">
            <h2>逐题回顾</h2>
            <p>点击题目展开查看你的答案、正确答案与知识点</p>
          </header>

          <details v-for="(q, i) in questions" :key="q.id" class="rv" :class="statusOf(q)">
            <summary>
              <span class="rv-no">{{ i + 1 }}</span>
              <span class="rv-stem">{{ q.stem }}</span>
              <span class="rv-tag">{{ statusLabel(q) }}</span>
              <svg class="rv-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div class="rv-body">
              <p class="rv-full">{{ q.stem }}</p>
              <ul class="rv-opts">
                <li v-for="(opt, oi) in q.options" :key="oi" :class="rvOptClass(q, oi)">
                  <span class="rv-key">{{ letters[oi] }}</span>
                  <span class="rv-text">{{ opt }}</span>
                  <span v-if="q.answer.includes(letters[oi])" class="rv-flag">正确答案</span>
                </li>
              </ul>
              <div class="rv-meta">
                <span class="rv-yours" :class="statusOf(q)">
                  你的答案：{{ answers[q.id]?.length ? answers[q.id].join(' ') : '未作答' }}
                </span>
                <span class="rv-ans">正确答案：{{ q.answer.join(' ') }}</span>
              </div>
              <p v-if="q.topic" class="rv-topic">知识点：{{ q.topic }}</p>
            </div>
          </details>
        </section>
      </div>
    </template>

    <!-- 答题卡 -->
    <transition name="fade">
      <div v-if="sheetOpen" class="sheet-mask" @click.self="sheetOpen = false">
        <div class="sheet card">
          <header class="sheet-head">
            <div>
              <b>答题卡</b>
              <span>{{ answeredCount }} / {{ total }} 已作答</span>
            </div>
            <button class="icon-btn" aria-label="关闭" @click="sheetOpen = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div class="sheet-grid">
            <button
              v-for="(q, i) in questions"
              :key="q.id"
              class="sheet-cell"
              :class="{ done: (answers[q.id]?.length ?? 0) > 0, cur: i === index }"
              @click="jump(i)"
            >
              {{ i + 1 }}
            </button>
          </div>
          <footer class="sheet-foot">
            <span class="sheet-tip">未作答 {{ unansweredCount }} 题</span>
            <button class="btn btn-ghost" @click="sheetOpen = false">继续答题</button>
            <button class="btn btn-primary" @click="askSubmit">交卷</button>
          </footer>
        </div>
      </div>
    </transition>

    <!-- 交卷确认 -->
    <transition name="fade">
      <div v-if="confirmSubmit" class="sheet-mask" @click.self="confirmSubmit = false">
        <div class="confirm card">
          <h3>确认交卷？</h3>
          <p>
            已作答 {{ answeredCount }} / {{ total }} 题<template v-if="unansweredCount">，还有
            <b>{{ unansweredCount }}</b> 题未作答</template>。交卷后立即公布答案，不能再修改。
          </p>
          <div class="confirm-actions">
            <button class="btn btn-ghost" @click="confirmSubmit = false">再检查一下</button>
            <button class="btn btn-primary" @click="submit">确认交卷</button>
          </div>
        </div>
      </div>
    </transition>
  </main>
</template>

<style scoped>
.test-page {
  flex: 1;
  padding-bottom: 40px;
}

/* ---------- 设置页 ---------- */
.setup-wrap {
  max-width: 640px;
  padding-top: 34px;
}

.setup-card {
  padding: 36px 38px 30px;
  animation: rise 0.45s var(--ease) both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.setup-head {
  display: flex;
  align-items: center;
  gap: 16px;
}

.setup-mark {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  flex-shrink: 0;
  border-radius: 16px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--accent);
  font-size: 28px;
  font-weight: 700;
}

.eyebrow {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--accent);
}

.setup-head h1 {
  margin-top: 6px;
  font-size: clamp(24px, 3.4vw, 30px);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.setup-desc {
  margin-top: 20px;
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--text-2);
}

.count-block {
  margin-top: 26px;
  padding: 18px;
  border-radius: 14px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.count-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.count-label b {
  font-size: 13.5px;
  font-weight: 600;
}

.count-label span {
  font-size: 11.5px;
  color: var(--muted);
}

.count-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip-btn {
  height: 38px;
  min-width: 62px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--text-2);
  font-size: 13.5px;
  font-weight: 600;
  transition: all 0.16s var(--ease);
}

.chip-btn:hover {
  border-color: var(--accent-line);
  color: var(--accent);
}

.chip-btn.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  box-shadow: 0 8px 18px -10px color-mix(in srgb, var(--accent) 70%, transparent);
}

.setup-rules {
  margin: 22px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setup-rules li {
  position: relative;
  padding-left: 18px;
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.6;
}

.setup-rules li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-line);
}

.setup-start {
  width: 100%;
  margin-top: 26px;
}

.setup-start svg {
  width: 18px;
  height: 18px;
}

.setup-back {
  display: block;
  margin: 14px auto 0;
  font-size: 12.5px;
  color: var(--muted);
}

.setup-back:hover {
  color: var(--text-2);
}

/* ---------- 答题中 ---------- */
.run-head {
  position: sticky;
  top: 64px;
  z-index: 30;
  padding: 12px 0 10px;
  background: var(--bg);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.run-head-in {
  display: flex;
  align-items: center;
  gap: 12px;
}

.run-exit {
  flex-shrink: 0;
}

.run-exit svg {
  width: 15px;
  height: 15px;
}

.run-title {
  display: flex;
  align-items: baseline;
  gap: 9px;
  flex: 1;
  min-width: 0;
}

.run-title b {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.run-title span {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.run-timer {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
}

.run-timer svg {
  width: 15px;
  height: 15px;
}

.run-track {
  margin-top: 10px;
  height: 3px;
  border: 0;
  background: var(--surface-3);
}

.run-body {
  padding-top: 24px;
  max-width: 820px;
  padding-bottom: 12px;
}

.restore-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 9px 14px;
  border-radius: 10px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  font-size: 12px;
  color: var(--accent);
}

.restore-bar button {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.q-card {
  padding: 32px 38px 26px;
  animation: rise 0.3s var(--ease) both;
}

.q-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}

.q-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.diff-badge .dots {
  display: inline-flex;
  gap: 2.5px;
  margin-left: 2px;
}

.diff-badge .dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--line-strong);
}

.diff-badge .dots i.on {
  background: var(--gold);
}

.q-no {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.stem {
  font-size: 17px;
  font-weight: 500;
  line-height: 1.9;
  letter-spacing: 0.01em;
  margin-bottom: 24px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.opt {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  padding: 13px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  text-align: left;
  transition: border-color 0.16s, background-color 0.16s, transform 0.16s var(--ease);
}

.opt:hover {
  border-color: var(--accent-line);
  background: color-mix(in srgb, var(--accent-soft) 32%, var(--surface));
}

.opt:active {
  transform: scale(0.995);
}

.opt-key {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid var(--line-strong);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 700;
  transition: background-color 0.16s, color 0.16s, border-color 0.16s;
}

.opt-text {
  flex: 1;
  font-size: 14.5px;
  line-height: 1.7;
  padding-top: 2px;
  word-break: break-word;
}

.opt.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.opt.selected .opt-key {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.run-note {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed var(--line);
  font-size: 11.5px;
  color: var(--muted);
  text-align: center;
}

/* ---------- 底部操作条 ---------- */
.run-dock {
  position: sticky;
  bottom: 12px;
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--shadow);
}

.dock-btn {
  flex: 1;
  height: 46px;
}

.dock-sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 76px;
  height: 46px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  transition: border-color 0.15s;
}

.dock-sheet:hover {
  border-color: var(--accent-line);
}

.dock-num {
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
}

.dock-label {
  font-size: 9.5px;
  line-height: 1.2;
  color: var(--muted);
  white-space: nowrap;
}

.dock-label small {
  display: block;
  font-size: 9.5px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

/* ---------- 答题卡 & 确认框 ---------- */
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 8, 6, 0.45);
  backdrop-filter: blur(4px);
}

.sheet {
  width: min(560px, 100%);
  max-height: min(84vh, 720px);
  display: flex;
  flex-direction: column;
  padding: 20px;
  animation: rise 0.22s var(--ease) both;
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.sheet-head b {
  display: block;
  font-size: 16px;
}

.sheet-head span {
  font-size: 12px;
  color: var(--muted);
}

.sheet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
  gap: 8px;
  padding: 16px 2px;
  overflow-y: auto;
}

.sheet-cell {
  height: 40px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: background-color 0.14s, border-color 0.14s, color 0.14s;
}

.sheet-cell:hover {
  border-color: var(--accent-line);
}

.sheet-cell.done {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent);
}

.sheet-cell.cur {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
  color: var(--text);
}

.sheet-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.sheet-tip {
  flex: 1;
  font-size: 11.5px;
  color: var(--muted);
}

.confirm {
  width: min(400px, 100%);
  padding: 26px;
  animation: rise 0.22s var(--ease) both;
}

.confirm h3 {
  font-size: 18px;
  font-weight: 700;
}

.confirm p {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-2);
}

.confirm p b {
  color: var(--accent);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

/* ---------- 结果 ---------- */
.result-wrap {
  max-width: 820px;
  padding-top: 30px;
}

.final {
  padding: 40px 40px 30px;
  text-align: center;
  animation: rise 0.4s var(--ease) both;
}

.final-ring {
  position: relative;
  width: 172px;
  height: 172px;
  margin: 0 auto 20px;
}

.final-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.rr-track {
  fill: none;
  stroke: var(--surface-3);
  stroke-width: 10;
}

.rr-fill {
  fill: none;
  stroke: var(--accent);
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.9s var(--ease);
}

.rr-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.rr-center b {
  font-size: 44px;
  font-weight: 700;
}

.rr-center b small {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-2);
  margin-left: 2px;
}

.rr-center span {
  margin-top: 8px;
  font-size: 11.5px;
  letter-spacing: 0.14em;
  color: var(--muted);
}

.final h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.final-sub {
  margin-top: 10px;
  font-size: 13.5px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.final-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 26px;
}

.final-note {
  margin-top: 18px;
  font-size: 11.5px;
  color: var(--muted);
}

/* ---------- 逐题回顾 ---------- */
.review {
  margin-top: 16px;
  padding: 22px 26px 12px;
}

.review-head {
  margin-bottom: 12px;
}

.review-head h2 {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 700;
}

.review-head p {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--muted);
}

.rv {
  border-top: 1px solid var(--line);
}

.rv summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 2px;
  cursor: pointer;
  list-style: none;
}

.rv summary::-webkit-details-marker {
  display: none;
}

.rv-no {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.rv.correct .rv-no {
  background: var(--ok-soft);
  color: var(--ok);
}

.rv.wrong .rv-no {
  background: var(--bad-soft);
  color: var(--bad);
}

.rv-stem {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rv-tag {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
}

.rv.correct .rv-tag {
  color: var(--ok);
}

.rv.wrong .rv-tag {
  color: var(--bad);
}

.rv.skipped .rv-tag {
  color: var(--muted);
}

.rv-chev {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: var(--muted);
  transition: transform 0.2s var(--ease);
}

.rv[open] .rv-chev {
  transform: rotate(180deg);
}

.rv-body {
  padding: 4px 2px 18px 34px;
}

.rv-full {
  font-size: 14px;
  line-height: 1.85;
  margin-bottom: 12px;
}

.rv-opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rv-opts li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 13px;
  line-height: 1.65;
}

.rv-key {
  flex-shrink: 0;
  width: 18px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--muted);
}

.rv-text {
  flex: 1;
}

.rv-opts li.correct {
  border-color: var(--ok-line);
  background: var(--ok-soft);
}

.rv-opts li.correct .rv-key {
  color: var(--ok);
}

.rv-opts li.wrongPick {
  border-color: var(--bad-line);
  background: var(--bad-soft);
}

.rv-opts li.wrongPick .rv-key {
  color: var(--bad);
}

.rv-flag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  color: var(--ok);
  opacity: 0.8;
}

.rv-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-top: 12px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rv-yours {
  font-weight: 600;
}

.rv-yours.correct {
  color: var(--ok);
}

.rv-yours.wrong {
  color: var(--bad);
}

.rv-yours.skipped {
  color: var(--muted);
}

.rv-ans {
  color: var(--text-2);
}

.rv-topic {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.6;
}

/* ---------- 响应式 ---------- */
@media (max-width: 640px) {
  .setup-wrap {
    padding-top: 18px;
  }

  .setup-card {
    padding: 24px 18px 22px;
  }

  .setup-mark {
    width: 48px;
    height: 48px;
    font-size: 23px;
    border-radius: 13px;
  }

  .setup-head h1 {
    font-size: 22px;
  }

  .setup-desc {
    margin-top: 16px;
    font-size: 13px;
  }

  .count-block {
    margin-top: 20px;
    padding: 14px;
  }

  .chip-btn {
    height: 36px;
    min-width: 56px;
    padding: 0 13px;
    font-size: 13px;
  }

  .run-head {
    top: 58px;
    padding: 9px 0 8px;
  }

  .run-exit {
    width: 34px;
    padding: 0;
  }

  .run-exit span {
    display: none;
  }

  .run-body {
    padding-top: 16px;
  }

  .q-card {
    padding: 20px 16px 18px;
    border-radius: 16px;
  }

  .q-head {
    margin-bottom: 14px;
  }

  .q-no {
    font-size: 13px;
  }

  .stem {
    font-size: 15.5px;
    line-height: 1.85;
    margin-bottom: 18px;
  }

  .options {
    gap: 8px;
  }

  .opt {
    padding: 11px 12px;
    gap: 10px;
    border-radius: 11px;
  }

  .opt-key {
    width: 25px;
    height: 25px;
    border-radius: 7px;
    font-size: 12.5px;
  }

  .opt-text {
    font-size: 14px;
    padding-top: 1px;
  }

  .run-note {
    margin-top: 16px;
    padding-top: 13px;
  }

  .run-dock {
    bottom: 8px;
    gap: 8px;
    padding: 8px;
  }

  .dock-btn {
    height: 44px;
    padding: 0 10px;
  }

  .dock-sheet {
    min-width: 66px;
    height: 44px;
    padding: 0 9px;
  }

  .sheet-mask {
    align-items: flex-end;
    padding: 12px;
  }

  .sheet {
    max-height: 84vh;
    padding: 16px;
    border-radius: 20px;
  }

  .sheet-grid {
    grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
    gap: 7px;
    padding: 14px 0;
  }

  .sheet-cell {
    height: 38px;
    font-size: 12px;
  }

  .sheet-foot {
    flex-wrap: wrap;
  }

  .sheet-tip {
    width: 100%;
    flex: none;
    order: -1;
    margin-bottom: 2px;
  }

  .confirm {
    padding: 22px 18px;
  }

  .result-wrap {
    padding-top: 18px;
  }

  .final {
    padding: 30px 18px 24px;
  }

  .final-ring {
    width: 146px;
    height: 146px;
  }

  .rr-center b {
    font-size: 38px;
  }

  .final h1 {
    font-size: 20px;
  }

  .review {
    padding: 18px 16px 8px;
  }

  .rv-stem {
    font-size: 12.5px;
  }

  .rv-body {
    padding-left: 0;
  }

  .rv-meta {
    gap: 4px 12px;
  }
}
</style>
