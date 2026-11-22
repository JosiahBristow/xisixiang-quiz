<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { bank } from '../lib/bank'
import { BADGES } from '../lib/incentives'
import { favoriteCount } from '../stores/favorites'
import { chapterStats, overall, wrongQuestions } from '../stores/progress'
import { stats as inc, unlockedCount } from '../stores/incentives'
import { balancePoints, rewards } from '../stores/rewards'
import { settings } from '../stores/settings'
import { hasSupabase } from '../lib/supabase'

const router = useRouter()

const CIRCUMFERENCE = 2 * Math.PI * 52

const ringOffset = computed(() => CIRCUMFERENCE * (1 - overall.value.percent / 100))

const doneChapters = computed(() => {
  let n = 0
  for (const st of chapterStats.value.values()) if (st.done > 0) n++
  return n
})

function statOf(id: string) {
  return chapterStats.value.get(id) ?? { total: 0, done: 0, correct: 0, accuracy: 0 }
}

function pct(id: string) {
  const st = statOf(id)
  return st.total ? Math.round((st.done / st.total) * 100) : 0
}

function start(scope: string) {
  router.push({ name: 'quiz', params: { scope } })
}

function startTest() {
  router.push({ name: 'test' })
}

function scrollToChapters() {
  document.getElementById('chapters')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <main class="home">
    <div class="wrap">
      <section class="hero card">
        <div class="hero-copy">
          <p class="eyebrow"><span class="rule" />习近平新时代中国特色社会主义思想</p>
          <h1 class="serif">把每一道题<br />都刷成底气。</h1>
          <p class="lede">
            {{ bank.meta.chapterCount }} 个章节 · {{ bank.meta.total }} 道题 · 单选与多选，练习 / 背题随时切换。
          </p>

          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" @click="start('all')">
              刷全部题
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14m0 0-6-6m6 6-6 6" />
              </svg>
            </button>
            <button class="btn btn-ghost btn-lg" @click="scrollToChapters">按章节刷</button>
          </div>

          <div class="hero-modes">
            <span class="hm-label">模式</span>
            <div class="seg">
              <button :class="{ on: settings.mode === 'practice' }" @click="settings.mode = 'practice'">练习模式</button>
              <button :class="{ on: settings.mode === 'recite' }" @click="settings.mode = 'recite'">背题模式</button>
              <button :class="{ on: settings.mode === 'cloze' }" @click="settings.mode = 'cloze'">挖空模式</button>
            </div>
            <span class="hm-hint">
              {{
                settings.mode === 'practice'
                  ? '作答后立即判分'
                  : settings.mode === 'recite'
                    ? '直接查看正确答案'
                    : '先回忆，再逐级揭示选项'
              }}
            </span>
          </div>
        </div>

        <div class="hero-side">
          <div class="ring-wrap">
            <svg viewBox="0 0 120 120" class="ring">
              <circle cx="60" cy="60" r="52" class="ring-track" />
              <circle
                cx="60"
                cy="60"
                r="52"
                class="ring-fill"
                :stroke-dasharray="CIRCUMFERENCE"
                :stroke-dashoffset="ringOffset"
              />
            </svg>
            <div class="ring-center">
              <b class="serif">{{ overall.percent }}<small>%</small></b>
              <span>总进度</span>
            </div>
          </div>
          <div class="stats">
            <div class="stat">
              <b class="serif">{{ overall.done }}</b>
              <span>已刷题目</span>
            </div>
            <div class="stat">
              <b class="serif">{{ overall.done ? overall.accuracy + '%' : '—' }}</b>
              <span>正确率</span>
            </div>
            <div class="stat">
              <b class="serif">{{ wrongQuestions.length }}</b>
              <span>待复习错题</span>
            </div>
          </div>
        </div>
      </section>

      <section class="today card">
        <div class="td-main">
          <div class="td-head">
            <span class="badge badge-accent">{{ inc.level.name }}</span>
            <b class="serif">{{ rewards.admin ? '∞' : balancePoints }}<small>积分</small></b>
          </div>
          <div class="td-stats">
            <div class="td-stat"><b class="serif">{{ inc.todayCount }}</b><span>今日答题</span></div>
            <div class="td-stat"><b class="serif">{{ inc.currentStreak }}</b><span>当前连对</span></div>
            <div class="td-stat"><b class="serif">{{ inc.dayStreak }}</b><span>连续打卡</span></div>
            <div class="td-stat"><b class="serif">{{ unlockedCount }}/{{ BADGES.length }}</b><span>成就</span></div>
          </div>
        </div>
        <router-link to="/me" class="td-link">
          我的成就
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14m0 0-6-6m6 6-6 6" />
          </svg>
        </router-link>
      </section>

      <section class="test-entry card">
        <div class="te-main">
          <span class="te-mark serif">测</span>
          <div class="te-copy">
            <h2>随机测试</h2>
            <p>从 {{ bank.meta.total }} 题中随机抽题，交卷后统一公布答案，错题自动入本。</p>
          </div>
        </div>
        <div class="te-actions">
          <div class="te-counts" role="group" aria-label="抽题数量">
            <button
              v-for="c in [10, 20, 30, 50, 0]"
              :key="c"
              :class="{ on: settings.testCount === c }"
              @click="settings.testCount = c"
            >
              {{ c === 0 ? '全部' : c + '题' }}
            </button>
          </div>
          <button class="btn btn-primary" @click="startTest">
            开始测试
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14m0 0-6-6m6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <button v-if="wrongQuestions.length" class="wrong-banner card" @click="start('wrong')">
        <span class="wb-icon">!</span>
        <span class="wb-text">
          <b>错题本 · {{ wrongQuestions.length }} 道</b>
          <small>答对后自动移出，集中消灭薄弱点</small>
        </span>
        <span class="wb-go">去重刷 →</span>
      </button>

      <button class="fav-banner card" @click="router.push('/favorites')">
        <span class="fb-icon serif">★</span>
        <span class="fb-text">
          <b>收藏夹{{ favoriteCount ? ` · ${favoriteCount} 道` : '' }}</b>
          <small>{{ favoriteCount ? '随时回看，或只刷收藏题' : '刷题时点星标，把好题收进来' }}</small>
        </span>
        <span class="fb-go">查看 →</span>
      </button>

      <section id="chapters" class="chapters">
        <header class="sec-head">
          <div>
            <h2>按章节刷题</h2>
            <p>{{ doneChapters }} / {{ bank.chapters.length }} 章已开始</p>
          </div>
          <div class="sec-toggles">
            <label class="switch-row" title="开启后只刷还没答对的题">
              <input v-model="settings.skipCorrect" type="checkbox" />
              <span class="switch" />
              跳过已答对
            </label>
            <label class="switch-row">
              <input v-model="settings.shuffle" type="checkbox" />
              <span class="switch" />
              随机顺序
            </label>
          </div>
        </header>

        <div class="chapter-grid">
          <button v-for="ch in bank.chapters" :key="ch.id" class="chapter-card card" @click="start(ch.id)">
            <div class="cc-top">
              <span class="cc-index serif">{{ String(ch.order).padStart(2, '0') }}</span>
              <span class="cc-short">{{ ch.short }}</span>
              <span v-if="statOf(ch.id).done === ch.questions.length" class="badge badge-ok cc-done">已刷完</span>
            </div>
            <h3>{{ ch.name }}</h3>
            <div class="cc-meta">
              <span>{{ ch.questions.length }} 题</span>
              <template v-if="statOf(ch.id).done">
                <span>已刷 {{ statOf(ch.id).done }}</span>
                <span>正确率 {{ statOf(ch.id).accuracy }}%</span>
              </template>
              <span v-else>未开始</span>
            </div>
            <div class="track">
              <i :style="{ width: pct(ch.id) + '%' }" />
            </div>
          </button>
        </div>
      </section>

      <footer class="foot">
        <p>题库来源：项目根目录 Word 文档 · 共 {{ bank.meta.total }} 题</p>
        <p>刷题记录保存在本机浏览器{{ hasSupabase ? '，登录后自动同步云端' : '' }}</p>
      </footer>
    </div>
  </main>
</template>

<style scoped>
.home {
  padding: 30px 0 56px;
  flex: 1;
}

/* ---------- Hero ---------- */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.65fr);
  gap: 36px;
  padding: 44px 48px;
  background: var(--surface);
  background: linear-gradient(155deg, var(--surface), color-mix(in srgb, var(--surface) 86%, var(--accent-soft)));
  position: relative;
  overflow: hidden;
  animation: rise 0.5s var(--ease) both;
}

.hero::after {
  content: '学';
  position: absolute;
  right: -18px;
  bottom: -58px;
  font-family: var(--font-display);
  font-size: 210px;
  line-height: 1;
  color: var(--accent);
  opacity: 0.045;
  pointer-events: none;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--accent);
}

.rule {
  display: inline-block;
  width: 22px;
  height: 1.5px;
  background: var(--accent-line);
}

h1 {
  margin: 18px 0 14px;
  font-size: clamp(30px, 4.2vw, 44px);
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: 0.02em;
}

.lede {
  max-width: 44ch;
  color: var(--text-2);
  font-size: 14px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.hero-actions svg {
  width: 18px;
  height: 18px;
}

.hero-modes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 26px;
  padding-top: 22px;
  border-top: 1px dashed var(--line);
}

.hm-label {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--muted);
}

.hm-hint {
  font-size: 12.5px;
  color: var(--muted);
}

/* ---------- 环形进度 ---------- */
.hero-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 26px;
}

.ring-wrap {
  position: relative;
  width: 158px;
  height: 158px;
}

.ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-track {
  fill: none;
  stroke: var(--surface-3);
  stroke-width: 8;
}

.ring-fill {
  fill: none;
  stroke: var(--accent);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.8s var(--ease);
}

.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.ring-center b {
  font-size: 38px;
  font-weight: 700;
}

.ring-center b small {
  font-size: 16px;
  font-weight: 500;
  margin-left: 2px;
  color: var(--text-2);
}

.ring-center span {
  margin-top: 8px;
  font-size: 11.5px;
  letter-spacing: 0.14em;
  color: var(--muted);
}

.stats {
  display: flex;
  width: 100%;
  border-top: 1px solid var(--line);
  padding-top: 18px;
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.stat + .stat {
  border-left: 1px solid var(--line);
}

.stat b {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}

.stat span {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.05em;
  white-space: nowrap;
}

/* ---------- 今日战报 ---------- */
.today {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 16px;
  padding: 13px 20px;
  animation: rise 0.5s 0.03s var(--ease) both;
}

.td-main {
  display: flex;
  align-items: center;
  gap: 24px;
  min-width: 0;
  flex: 1;
}

.td-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-shrink: 0;
}

.td-head b {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

.td-head b small {
  margin-left: 3px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--muted);
}

.td-stats {
  display: flex;
  flex: 1;
  gap: 28px;
}

.td-stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.td-stat b {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.td-stat span {
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
}

.td-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  transition: opacity 0.15s;
}

.td-link:hover {
  opacity: 0.75;
}

.td-link svg {
  width: 14px;
  height: 14px;
}

/* ---------- 随机测试入口 ---------- */
.test-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 16px;
  padding: 16px 20px;
  animation: rise 0.5s 0.04s var(--ease) both;
}

.te-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.te-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 12px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--accent);
  font-size: 20px;
  font-weight: 700;
}

.te-copy h2 {
  font-family: var(--font-display);
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.te-copy p {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}

.te-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.te-counts {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.te-counts button {
  height: 28px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
  transition: background-color 0.15s, color 0.15s;
}

.te-counts button:hover {
  color: var(--text);
  background: var(--surface-3);
}

.te-counts button.on {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

/* ---------- 错题本横幅 ---------- */
.wrong-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  margin-top: 16px;
  padding: 15px 20px;
  text-align: left;
  animation: rise 0.5s 0.08s var(--ease) both;
}

.wrong-banner:hover {
  border-color: var(--bad-line);
}

.wb-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--bad-soft);
  color: var(--bad);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}

.wb-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.4;
}

.wb-text b {
  font-size: 14px;
}

.wb-text small {
  font-size: 12px;
  color: var(--text-2);
}

.wb-go {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--bad);
}

/* ---------- 收藏夹横幅 ---------- */
.fav-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  margin-top: 10px;
  padding: 15px 20px;
  text-align: left;
  animation: rise 0.5s 0.06s var(--ease) both;
}

.fav-banner:hover {
  border-color: var(--gold);
}

.fb-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--gold) 14%, var(--surface));
  color: var(--gold);
  font-size: 16px;
}

.fb-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.4;
}

.fb-text b {
  font-size: 14px;
}

.fb-text small {
  font-size: 12px;
  color: var(--text-2);
}

.fb-go {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--gold);
}

/* ---------- 章节 ---------- */
.chapters {
  margin-top: 42px;
  scroll-margin-top: 84px;
}

.sec-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px 16px;
  margin-bottom: 16px;
}

.sec-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  justify-content: flex-end;
}

.sec-head h2 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.sec-head p {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--muted);
}

.switch-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}

.switch-row input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch {
  position: relative;
  width: 36px;
  height: 21px;
  border-radius: 999px;
  background: var(--surface-3);
  border: 1px solid var(--line-strong);
  transition: background-color 0.18s;
}

.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s var(--ease);
}

.switch-row input:checked + .switch {
  background: var(--accent);
  border-color: var(--accent);
}

.switch-row input:checked + .switch::after {
  transform: translateX(15px);
}

.switch-row input:focus-visible + .switch {
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(242px, 1fr));
  gap: 14px;
}

.chapter-card {
  display: flex;
  flex-direction: column;
  padding: 18px 18px 16px;
  text-align: left;
  transition: transform 0.22s var(--ease), border-color 0.22s, box-shadow 0.22s;
  animation: rise 0.45s var(--ease) both;
}

.chapter-card:hover {
  transform: translateY(-3px);
  border-color: var(--accent-line);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04), 0 20px 40px -22px color-mix(in srgb, var(--accent) 30%, transparent);
}

.cc-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cc-index {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: color-mix(in srgb, var(--accent) 70%, var(--muted));
  opacity: 0.75;
}

.cc-short {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.cc-done {
  margin-left: auto;
  align-self: center;
  height: 21px;
  font-size: 11px;
}

.chapter-card h3 {
  margin: 10px 0 8px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 45px;
}

.cc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 11.5px;
  color: var(--muted);
  margin-bottom: 10px;
}

.cc-meta span + span::before {
  content: '·';
  margin-right: 10px;
  opacity: 0.5;
}

.chapter-card .track {
  margin-top: auto;
  height: 4px;
}

/* ---------- 页脚 ---------- */
.foot {
  margin-top: 54px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  text-align: center;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.9;
}

/* ---------- 响应式 ---------- */
@media (max-width: 860px) {
  .hero {
    grid-template-columns: 1fr;
    gap: 28px;
    padding: 30px 26px;
  }

  .hero-side {
    flex-direction: row;
    justify-content: flex-start;
    gap: 20px;
  }

  .ring-wrap {
    width: 118px;
    height: 118px;
    flex-shrink: 0;
  }

  .ring-center b {
    font-size: 28px;
  }

  .ring-center b small {
    font-size: 13px;
  }

  .ring-center span {
    margin-top: 5px;
    font-size: 10px;
  }

  .stats {
    border-top: 0;
    padding-top: 0;
    border-left: 1px solid var(--line);
    padding-left: 8px;
  }

  .stat b {
    font-size: 19px;
  }

  .stat span {
    font-size: 10px;
  }
}

@media (max-width: 640px) {
  .home {
    padding: 18px 0 40px;
  }

  .hero {
    padding: 24px 20px;
    border-radius: 16px;
  }

  h1 {
    margin: 14px 0 12px;
  }

  .lede {
    font-size: 13px;
  }

  .hero-actions {
    margin-top: 20px;
    gap: 10px;
  }

  .btn-lg {
    height: 46px;
    padding: 0 20px;
    font-size: 15px;
  }

  .hero-modes {
    margin-top: 20px;
    padding-top: 18px;
  }

  .hm-hint {
    display: none;
  }

  .hero-side {
    flex-direction: column;
    align-items: stretch;
  }

  .ring-wrap {
    align-self: center;
  }

  .stats {
    border-left: 0;
    border-top: 1px solid var(--line);
    padding-left: 0;
    padding-top: 14px;
  }

  .wrong-banner {
    padding: 13px 15px;
  }

  .wb-text small {
    display: none;
  }

  .today {
    flex-wrap: wrap;
    gap: 10px;
    padding: 13px 15px;
  }

  .td-main {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .td-stats {
    width: 100%;
    justify-content: space-between;
    gap: 10px;
  }

  .td-link {
    margin-left: auto;
  }

  .test-entry {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 15px;
  }

  .te-actions {
    justify-content: space-between;
    gap: 8px;
  }

  .te-counts {
    flex: 1;
    justify-content: space-between;
  }

  .te-counts button {
    flex: 1;
    padding: 0 4px;
    font-size: 11.5px;
  }

  .te-actions .btn {
    flex-shrink: 0;
    height: 40px;
    padding: 0 14px;
    font-size: 13.5px;
  }

  .chapters {
    margin-top: 30px;
  }

  .sec-head {
    align-items: center;
  }

  .sec-head h2 {
    font-size: 19px;
  }

  .chapter-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }

  .chapter-card {
    padding: 15px;
  }

  .chapter-card h3 {
    min-height: 42px;
    font-size: 14px;
  }
}
</style>
