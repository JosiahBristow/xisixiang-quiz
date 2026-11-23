<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Chapter, Question } from '../types'
import { chapterOfQuestion, questionById } from '../lib/bank'
import { randomSeed, seedFor, shuffledQuestion } from '../lib/optionShuffle'
import { clearFavorites, favorites, toggleFavorite } from '../stores/favorites'
import { settings } from '../stores/settings'

const router = useRouter()
const letters = ['A', 'B', 'C', 'D', 'E', 'F']
// 3B：每次打开收藏夹都换一组顺序
const optionSeed = randomSeed()

const items = computed(() => {
  return favorites.value
    .map((entry) => {
      const original = questionById.get(entry.id)
      if (!original) return null
      const q = settings.shuffleOptions
        ? shuffledQuestion(original, seedFor(original.id, optionSeed))
        : original
      return { q, chapter: chapterOfQuestion.get(q.id) as Chapter | undefined, at: entry.at }
    })
    .filter((item): item is { q: Question; chapter: Chapter | undefined; at: string } => Boolean(item))
})

const count = computed(() => items.value.length)

function remove(id: string) {
  toggleFavorite(id)
}

function clearAll() {
  if (!count.value) return
  if (!window.confirm(`确定清空全部 ${count.value} 道收藏题吗？`)) return
  clearFavorites()
}

function practice() {
  if (!count.value) return
  router.push({ name: 'quiz', params: { scope: 'fav' } })
}
</script>

<template>
  <main class="fav">
    <div class="wrap fav-wrap">
      <header class="fav-head">
        <div>
          <p class="eyebrow"><span class="rule" />收藏夹</p>
          <div class="fh-row">
            <h1 class="serif">把好题留下来。</h1>
            <span class="badge badge-accent">{{ count }} 道</span>
          </div>
          <p class="sub">刷题时点题目右上角的星标收藏，随时回看或只刷收藏题。</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary btn-sm" :disabled="!count" @click="practice">刷收藏题</button>
          <button v-if="count" class="btn btn-ghost btn-sm" @click="clearAll">清空</button>
        </div>
      </header>

      <div v-if="!count" class="card fav-empty">
        <div class="empty-star serif">★</div>
        <h2>还没有收藏题目</h2>
        <p>在练习、背题或随机测试里，点击题目右上角的星标就能收藏。收藏会保存在本机，登录后自动同步云端。</p>
        <button class="btn btn-primary" @click="router.push('/')">去题库刷题</button>
      </div>

      <article v-for="item in items" :key="item.q.id" class="card fav-card">
        <header class="fc-head">
          <div class="fc-badges">
            <span class="badge">{{ item.chapter?.short || '题库' }}</span>
            <span class="badge" :class="{ 'badge-accent': item.q.type === 'multi' }">
              {{ item.q.type === 'multi' ? '多选题' : '单选题' }}
            </span>
            <span class="badge diff-badge">
              难度
              <span class="dots">
                <i v-for="n in 3" :key="n" :class="{ on: n <= item.q.difficulty }" />
              </span>
            </span>
          </div>
          <button class="fav-star on" title="取消收藏" @click="remove(item.q.id)">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
              <path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.5l6.3-.8L12 3Z" />
            </svg>
          </button>
        </header>

        <h2 class="fc-stem">{{ item.q.stem }}</h2>

        <div class="fc-options">
          <div
            v-for="(opt, i) in item.q.options"
            :key="i"
            class="fc-opt"
            :class="{ correct: item.q.answer.includes(letters[i]) }"
          >
            <span class="fc-key">{{ letters[i] }}</span>
            <span class="fc-text">{{ opt }}</span>
          </div>
        </div>

        <footer class="fc-foot">
          <span class="fc-answer">正确答案 {{ item.q.answer.join(' ') }}</span>
          <span v-if="item.q.topic" class="fc-topic">{{ item.q.topic }}</span>
        </footer>
      </article>

      <p v-if="settings.shuffleOptions && count" class="fav-note">
        已开启「打乱选项」：每次打开收藏夹，选项顺序都会重新排列。
      </p>
      <p v-if="count" class="fav-note">
        收藏题不受「跳过已答对」影响，点击星标可随时移除。
      </p>
    </div>
  </main>
</template>

<style scoped>
.fav {
  flex: 1;
  padding: 30px 0 60px;
}

.fav-wrap {
  max-width: 820px;
}

.fav-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 20px;
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

.fh-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0 4px;
}

.fh-row h1 {
  font-size: clamp(26px, 4vw, 34px);
  font-weight: 700;
  letter-spacing: 0.03em;
}

.sub {
  font-size: 12.5px;
  color: var(--text-2);
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-top: 6px;
}

/* ---------- 空状态 ---------- */
.fav-empty {
  padding: 52px 26px;
  text-align: center;
}

.empty-star {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  margin: 0 auto 16px;
  border-radius: 50%;
  border: 1.5px solid var(--accent-line);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 34px;
}

.fav-empty h2 {
  font-size: 19px;
}

.fav-empty p {
  max-width: 420px;
  margin: 8px auto 22px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-2);
}

/* ---------- 收藏卡 ---------- */
.fav-card {
  padding: 18px 20px 16px;
  margin-bottom: 10px;
}

.fc-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.fc-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
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

.fav-star {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  margin-left: auto;
  border-radius: 8px;
  color: var(--muted);
  transition: color 0.15s, background-color 0.15s;
}

.fav-star:hover {
  background: var(--surface-2);
}

.fav-star.on {
  color: var(--gold);
}

.fav-star svg {
  width: 19px;
  height: 19px;
}

.fc-stem {
  margin: 12px 0 12px;
  font-size: 15.5px;
  font-weight: 500;
  line-height: 1.8;
}

.fc-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fc-opt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 11px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 13px;
  line-height: 1.65;
}

.fc-key {
  width: 18px;
  flex-shrink: 0;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--muted);
}

.fc-text {
  flex: 1;
}

.fc-opt.correct {
  border-color: var(--ok-line);
  background: var(--ok-soft);
}

.fc-opt.correct .fc-key {
  color: var(--ok);
}

.fc-opt.correct .fc-text {
  color: var(--ok);
}

.fc-foot {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
  font-size: 11.5px;
}

.fc-answer {
  font-weight: 700;
  color: var(--ok);
  letter-spacing: 0.04em;
}

.fc-topic {
  color: var(--muted);
  line-height: 1.5;
}

.fav-note {
  margin-top: 16px;
  text-align: center;
  font-size: 11px;
  color: var(--muted);
}

@media (max-width: 640px) {
  .fav {
    padding: 20px 0 44px;
  }

  .head-actions {
    width: 100%;
  }

  .head-actions .btn {
    flex: 1;
  }

  .fav-card {
    padding: 15px 14px 13px;
  }

  .fc-stem {
    font-size: 14.5px;
    line-height: 1.75;
  }

  .fc-opt {
    font-size: 13px;
    padding: 7px 9px;
  }
}
</style>
