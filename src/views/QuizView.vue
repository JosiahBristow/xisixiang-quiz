<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Question } from '../types'
import { allQuestions, chapterById, sameAnswer, shuffle } from '../lib/bank'
import { recordAttempt, wrongQuestions } from '../stores/progress'
import { settings } from '../stores/settings'
import { scheduleSync } from '../lib/sync'

const route = useRoute()
const router = useRouter()

const scope = computed(() => String(route.params.scope ?? 'all'))
const letters = ['A', 'B', 'C', 'D', 'E', 'F']
const RING_C = 2 * Math.PI * 68

const questions = ref<Question[]>([])
const index = ref(0)
const selected = ref<string[]>([])
const judged = ref(false)
const finished = ref(false)
const mode = ref(settings.mode)
const session = ref<Record<string, boolean>>({})
const viewState = ref<Record<number, { selected: string[]; judged: boolean }>>({})
const startedAt = ref(Date.now())
const elapsedMs = ref(0)

const total = computed(() => questions.value.length)
const current = computed<Question | undefined>(() => questions.value[index.value])
const multi = computed(() => current.value?.type === 'multi')
const answeredCount = computed(() => Object.keys(session.value).length)
const correctCount = computed(() => Object.values(session.value).filter(Boolean).length)
const wrongCount = computed(() => answeredCount.value - correctCount.value)
const accuracy = computed(() =>
  answeredCount.value ? Math.round((correctCount.value / answeredCount.value) * 100) : 0,
)

const title = computed(() => {
  if (scope.value === 'all') return '全部题目'
  if (scope.value === 'wrong') return '错题本'
  return chapterById.get(scope.value)?.title ?? '刷题'
})

const progressPercent = computed(() =>
  total.value ? Math.min(100, ((index.value + 1) / total.value) * 100) : 0,
)

const isRight = computed(
  () => Boolean(current.value && judged.value && sameAnswer(selected.value, current.value.answer)),
)

const feedbackTone = computed(() => {
  if (mode.value === 'recite') return 'neutral'
  return isRight.value ? 'ok' : 'bad'
})

const durationText = computed(() => {
  const s = Math.max(0, Math.round(elapsedMs.value / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

function build() {
  let list: Question[] = []
  if (scope.value === 'all') list = [...allQuestions]
  else if (scope.value === 'wrong') list = [...wrongQuestions.value]
  else {
    const ch = chapterById.get(scope.value)
    list = ch ? [...ch.questions] : []
  }
  if (settings.shuffle) list = shuffle(list)
  questions.value = list
  index.value = 0
  selected.value = []
  judged.value = false
  finished.value = false
  session.value = {}
  viewState.value = {}
  startedAt.value = Date.now()
  elapsedMs.value = 0
}

function optionState(key: string): 'idle' | 'selected' | 'correct' | 'wrong' | 'muted' {
  const q = current.value
  if (!q) return 'idle'
  const picked = selected.value.includes(key)
  const isAnswer = q.answer.includes(key)
  if (mode.value === 'recite') return isAnswer ? 'correct' : 'muted'
  if (!judged.value) return picked ? 'selected' : 'idle'
  if (isAnswer) return 'correct'
  if (picked) return 'wrong'
  return 'muted'
}

function pick(key: string) {
  if (!current.value || finished.value || judged.value || mode.value === 'recite') return
  if (multi.value) {
    selected.value = selected.value.includes(key)
      ? selected.value.filter((k) => k !== key)
      : [...selected.value, key]
  } else {
    selected.value = [key]
    judge()
  }
}

function judge() {
  const q = current.value
  if (!q || judged.value || !selected.value.length) return
  judged.value = true
  const ok = sameAnswer(selected.value, q.answer)
  session.value = { ...session.value, [q.id]: ok }
  viewState.value[index.value] = { selected: [...selected.value], judged: true }
  recordAttempt(q, ok)
  scheduleSync()
}

function goto(i: number) {
  if (i < 0 || i >= total.value) return
  index.value = i
  const st = viewState.value[i]
  selected.value = st ? [...st.selected] : []
  judged.value = st ? st.judged : false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function next() {
  if (index.value >= total.value - 1) {
    finish()
    return
  }
  goto(index.value + 1)
}

function prev() {
  goto(index.value - 1)
}

function finish() {
  elapsedMs.value = Date.now() - startedAt.value
  finished.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function restart() {
  build()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goWrong() {
  if (scope.value === 'wrong') restart()
  else router.push({ name: 'quiz', params: { scope: 'wrong' } })
}

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
  if (finished.value) return

  const k = e.key.toLowerCase()
  const byLetter: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 }
  const byDigit: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 }
  const pos = byLetter[k] ?? byDigit[k]
  if (pos !== undefined && current.value && pos < current.value.options.length) {
    e.preventDefault()
    pick(letters[pos])
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (!judged.value && multi.value && mode.value === 'practice') judge()
    else if (judged.value || mode.value === 'recite') next()
    return
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    next()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prev()
  }
}

onMounted(() => {
  build()
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="quiz">
    <div class="quiz-head">
      <div class="wrap qh-inner">
        <button class="btn btn-soft btn-sm qh-back" @click="router.push('/')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
          </svg>
          <span class="qh-back-text">题库</span>
        </button>
        <div class="qh-title">
          <b>{{ title }}</b>
          <span v-if="!finished">{{ Math.min(index + 1, total) }} / {{ total }}</span>
          <span v-else>本组完成</span>
        </div>
        <div class="seg qh-mode">
          <button :class="{ on: mode === 'practice' }" @click="mode = 'practice'">练习</button>
          <button :class="{ on: mode === 'recite' }" @click="mode = 'recite'">背题</button>
        </div>
      </div>
      <div class="wrap">
        <div class="track qh-track"><i :style="{ width: progressPercent + '%' }" /></div>
      </div>
    </div>

    <div class="wrap quiz-body">
      <template v-if="finished">
        <section class="result card">
          <template v-if="mode === 'practice' && answeredCount">
            <div class="result-ring">
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
            <h2 class="serif">
              {{ accuracy >= 90 ? '稳得住，继续保持。' : accuracy >= 70 ? '不错，再刷一轮更稳。' : '差一点，错题再过一遍。' }}
            </h2>
            <p class="result-sub">
              答对 {{ correctCount }} / {{ answeredCount }} 题
              <template v-if="wrongCount"> · 错 {{ wrongCount }} 题</template>
              · 用时 {{ durationText }}
            </p>
          </template>

          <template v-else>
            <div class="result-mark serif">阅</div>
            <h2 class="serif">本组已浏览完</h2>
            <p class="result-sub">
              背题模式不记录分数。共 {{ total }} 题，切换到「练习」可以检验掌握程度。
            </p>
          </template>

          <div class="result-actions">
            <button class="btn btn-primary" @click="restart">再来一组</button>
            <button class="btn btn-ghost" @click="router.push('/')">回到题库</button>
            <button v-if="wrongCount" class="btn btn-ghost" @click="goWrong">去错题本</button>
          </div>
        </section>
      </template>

      <template v-else-if="current">
        <article :key="current.id" class="q-card card">
          <header class="q-head">
            <div class="q-badges">
              <span class="badge" :class="{ 'badge-accent': multi }">{{ multi ? '多选题' : '单选题' }}</span>
              <span class="badge diff-badge">
                难度
                <span class="dots">
                  <i v-for="n in 3" :key="n" :class="{ on: n <= current.difficulty }" />
                </span>
              </span>
              <span v-if="current.topic" class="badge q-topic">{{ current.topic }}</span>
            </div>
            <span class="q-no serif">No.{{ String(index + 1).padStart(2, '0') }}</span>
          </header>

          <h2 class="stem">{{ current.stem }}</h2>

          <div class="options" role="group" aria-label="选项">
            <button
              v-for="(opt, i) in current.options"
              :key="i"
              class="opt"
              :class="optionState(letters[i])"
              :disabled="mode === 'recite' || judged"
              @click="pick(letters[i])"
            >
              <span class="opt-key">{{ letters[i] }}</span>
              <span class="opt-text">{{ opt }}</span>
              <svg
                v-if="optionState(letters[i]) === 'correct'"
                class="opt-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <svg
                v-else-if="optionState(letters[i]) === 'wrong'"
                class="opt-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div v-if="multi && !judged && mode === 'practice'" class="q-confirm">
            <button class="btn btn-primary btn-block" :disabled="!selected.length" @click="judge">
              确认答案{{ selected.length ? `（已选 ${selected.length} 项）` : '' }}
            </button>
          </div>

          <div v-if="judged || mode === 'recite'" class="q-feedback" :class="feedbackTone">
            <div class="fb-line">
              <b>{{ mode === 'recite' ? '参考答案' : isRight ? '回答正确' : '回答错误' }}</b>
              <span>正确答案：{{ current.answer.join(' ') }}</span>
            </div>
            <p v-if="current.topic" class="fb-topic">知识点：{{ current.topic }}</p>
          </div>

          <footer class="q-actions">
            <button class="btn btn-ghost" :disabled="index === 0" @click="prev">上一题</button>
            <p v-if="mode === 'practice' && !judged && !multi" class="hint">点击选项即判分</p>
            <p v-else-if="mode === 'recite'" class="hint">
              <span class="kbd">←</span> <span class="kbd">→</span> 浏览题目
            </p>
            <p v-else class="hint" />
            <button class="btn btn-primary" @click="next">
              {{ index === total - 1 ? '完成本组' : '下一题' }}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14m0 0-6-6m6 6-6 6" />
              </svg>
            </button>
          </footer>
        </article>

        <p class="kbd-hint">
          快捷键：<span class="kbd">A</span>–<span class="kbd">D</span> 选择 · <span class="kbd">Enter</span> 确认 / 下一题
        </p>
      </template>

      <section v-else class="empty card">
        <div class="empty-mark serif">{{ scope === 'wrong' ? '空' : '?' }}</div>
        <h2>{{ scope === 'wrong' ? '错题本是空的' : '没有找到题目' }}</h2>
        <p>{{ scope === 'wrong' ? '继续保持！答错的题会自动收集到这里。' : '题库数据可能未生成，请运行 npm run parse 后刷新。' }}</p>
        <button class="btn btn-primary" @click="router.push('/')">回到题库</button>
      </section>
    </div>
  </main>
</template>

<style scoped>
.quiz {
  flex: 1;
  padding-bottom: 60px;
}

/* ---------- 顶部条 ---------- */
.quiz-head {
  position: sticky;
  top: 64px;
  z-index: 30;
  padding: 12px 0 10px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.qh-inner {
  display: flex;
  align-items: center;
  gap: 14px;
}

.qh-back {
  flex-shrink: 0;
}

.qh-back svg {
  width: 15px;
  height: 15px;
}

.qh-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.qh-title b {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qh-title span {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.qh-track {
  margin-top: 10px;
  height: 3px;
  border: 0;
  background: var(--surface-3);
}

.quiz-body {
  padding-top: 26px;
  max-width: 820px;
}

/* ---------- 题目卡片 ---------- */
.q-card {
  padding: 32px 38px 26px;
  animation: qin 0.32s var(--ease) both;
}

@keyframes qin {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
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

.q-topic {
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
  line-height: 24px;
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

/* ---------- 选项 ---------- */
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
  transition: border-color 0.16s, background-color 0.16s, transform 0.16s var(--ease), opacity 0.16s;
}

.opt:disabled {
  cursor: default;
}

.opt:hover:not(:disabled) {
  border-color: var(--accent-line);
  background: color-mix(in srgb, var(--accent-soft) 32%, var(--surface));
}

.opt:active:not(:disabled) {
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

.opt-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 4px;
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

.opt.correct {
  border-color: var(--ok-line);
  background: var(--ok-soft);
}

.opt.correct .opt-key {
  background: var(--ok);
  border-color: var(--ok);
  color: #fff;
}

.opt.correct .opt-icon {
  color: var(--ok);
}

.opt.wrong {
  border-color: var(--bad-line);
  background: var(--bad-soft);
}

.opt.wrong .opt-key {
  background: var(--bad);
  border-color: var(--bad);
  color: #fff;
}

.opt.wrong .opt-icon {
  color: var(--bad);
}

.opt.muted {
  opacity: 0.55;
}

.q-confirm {
  margin-top: 18px;
}

/* ---------- 判分反馈 ---------- */
.q-feedback {
  margin-top: 22px;
  padding: 13px 16px;
  border-radius: 11px;
  border-left: 3px solid transparent;
  animation: qin 0.25s var(--ease) both;
}

.q-feedback.ok {
  border-left-color: var(--ok);
  background: var(--ok-soft);
  color: var(--ok);
}

.q-feedback.bad {
  border-left-color: var(--bad);
  background: var(--bad-soft);
  color: var(--bad);
}

.q-feedback.neutral {
  border-left-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.fb-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 14px;
}

.fb-line b {
  font-size: 14px;
  font-weight: 700;
}

.fb-line span {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.fb-topic {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.78;
  line-height: 1.6;
}

/* ---------- 操作区 ---------- */
.q-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px dashed var(--line);
}

.q-actions .hint {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}

.q-actions .btn:last-child svg {
  width: 16px;
  height: 16px;
}

.kbd-hint {
  margin-top: 18px;
  text-align: center;
  font-size: 11.5px;
  color: var(--muted);
}

.kbd-hint .kbd {
  vertical-align: middle;
  margin: 0 2px;
}

/* ---------- 结果页 ---------- */
.result {
  padding: 44px 40px 36px;
  text-align: center;
  animation: qin 0.4s var(--ease) both;
}

.result-ring {
  position: relative;
  width: 172px;
  height: 172px;
  margin: 0 auto 22px;
}

.result-ring svg {
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

.result h2 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.result-sub {
  margin-top: 10px;
  font-size: 13.5px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.result-mark {
  display: grid;
  place-items: center;
  width: 84px;
  height: 84px;
  margin: 0 auto 22px;
  border-radius: 50%;
  border: 1.5px solid var(--accent-line);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 34px;
  font-weight: 700;
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 28px;
}

/* ---------- 空状态 ---------- */
.empty {
  padding: 56px 30px;
  text-align: center;
}

.empty-mark {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin: 0 auto 18px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: 30px;
  color: var(--muted);
}

.empty h2 {
  font-size: 19px;
}

.empty p {
  margin: 8px auto 22px;
  max-width: 380px;
  font-size: 13.5px;
  color: var(--text-2);
}

/* ---------- 响应式 ---------- */
@media (max-width: 640px) {
  .quiz-head {
    top: 58px;
    padding: 9px 0 8px;
  }

  .qh-inner {
    gap: 8px;
  }

  .qh-back {
    width: 34px;
    padding: 0;
  }

  .qh-back-text {
    display: none;
  }

  .qh-back svg {
    width: 17px;
    height: 17px;
  }

  .qh-title {
    gap: 7px;
  }

  .qh-title b {
    font-size: 13.5px;
  }

  .qh-mode button {
    height: 28px;
    padding: 0 11px;
    font-size: 12px;
  }

  .quiz-body {
    padding-top: 16px;
  }

  .q-card {
    padding: 20px 16px 18px;
    border-radius: 16px;
  }

  .q-head {
    margin-bottom: 14px;
  }

  .q-topic {
    display: none;
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

  .q-actions {
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
    padding-top: 16px;
  }

  .q-actions .hint {
    display: none;
  }

  .q-actions .btn {
    flex: 1;
    height: 42px;
    padding: 0 12px;
  }

  .kbd-hint {
    display: none;
  }

  .result {
    padding: 32px 20px 28px;
  }

  .result-ring {
    width: 146px;
    height: 146px;
  }

  .rr-center b {
    font-size: 38px;
  }

  .result h2 {
    font-size: 20px;
  }

  .result-actions .btn {
    flex: 1;
    min-width: 120px;
  }
}
</style>
