<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Question } from '../types'
import {
  knowledgeChapters,
  knowledgeQuestionCount,
  knowledgeTopicCount,
  type KnowledgeChapter,
  type KnowledgeTopic,
} from '../lib/knowledge'
import { chapterStats, latestByQuestion, overall, wrongQuestions } from '../stores/progress'
import { favorites } from '../stores/favorites'

type FilterId = 'all' | 'todo' | 'wrong' | 'fav'

const router = useRouter()
const letters = ['A', 'B', 'C', 'D', 'E', 'F']

const query = ref('')
const filter = ref<FilterId>('all')
const closedChapters = ref<string[]>([])
const openTopics = ref<string[]>([])
const openQuestions = ref<string[]>([])

const needle = computed(() => query.value.trim().toLowerCase())

const wrongIds = computed(() => new Set(wrongQuestions.value.map((q) => q.id)))
const favoriteIds = computed(() => new Set(favorites.value.map((f) => f.id)))

const allQuestions = computed(() =>
  knowledgeChapters.flatMap((chapter) => chapter.topics.flatMap((topic) => topic.questions)),
)

const todoCount = computed(
  () => allQuestions.value.filter((q) => latestByQuestion.value.get(q.id)?.correct !== true).length,
)

const filterOptions = computed(() => [
  { id: 'all' as const, label: '全部', count: knowledgeQuestionCount },
  { id: 'todo' as const, label: '未做对', count: todoCount.value },
  { id: 'wrong' as const, label: '做错', count: wrongQuestions.value.length },
  { id: 'fav' as const, label: '收藏', count: favorites.value.length },
])

function matchesFilter(q: Question): boolean {
  if (filter.value === 'all') return true
  if (filter.value === 'todo') return latestByQuestion.value.get(q.id)?.correct !== true
  if (filter.value === 'wrong') return wrongIds.value.has(q.id)
  return favoriteIds.value.has(q.id)
}

function topicKey(chapter: KnowledgeChapter, topic: KnowledgeTopic): string {
  return `${chapter.id}:${topic.name}`
}

const filteredChapters = computed(() => {
  const keyword = needle.value
  return knowledgeChapters
    .map((chapter) => {
      const topics = chapter.topics
        .filter((topic) => !keyword || topic.name.toLowerCase().includes(keyword))
        .map((topic) => ({
          ...topic,
          questions: topic.questions.filter(matchesFilter),
        }))
        .filter((topic) => topic.questions.length > 0)
      return { ...chapter, topics }
    })
    .filter((chapter) => chapter.topics.length > 0)
})

const filteredTopicCount = computed(() =>
  filteredChapters.value.reduce((sum, chapter) => sum + chapter.topics.length, 0),
)
const filteredQuestionCount = computed(() =>
  filteredChapters.value.reduce(
    (sum, chapter) => sum + chapter.topics.reduce((n, topic) => n + topic.questions.length, 0),
    0,
  ),
)

function chapterQuestionCount(chapter: KnowledgeChapter): number {
  return chapter.topics.reduce((sum, topic) => sum + topic.questions.length, 0)
}

function chapterDone(chapter: KnowledgeChapter): string {
  const stat = chapterStats.value.get(chapter.id)
  return stat ? `${stat.done}/${stat.total}` : `0/${chapterQuestionCount(chapter)}`
}

function isChapterOpen(id: string): boolean {
  return !closedChapters.value.includes(id)
}

function isTopicOpen(key: string): boolean {
  return openTopics.value.includes(key)
}

function isQuestionOpen(id: string): boolean {
  return openQuestions.value.includes(id)
}

function toggleChapter(id: string) {
  const next = new Set(closedChapters.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  closedChapters.value = [...next]
}

function toggleTopic(key: string) {
  const next = new Set(openTopics.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openTopics.value = [...next]
}

function toggleQuestion(id: string) {
  const next = new Set(openQuestions.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openQuestions.value = [...next]
}

watch(needle, (value) => {
  if (!value) {
    openTopics.value = []
    return
  }
  closedChapters.value = []
  openTopics.value = knowledgeChapters.flatMap((chapter) =>
    chapter.topics
      .filter((topic) => topic.name.toLowerCase().includes(value))
      .map((topic) => topicKey(chapter, topic)),
  )
})

function clearQuery() {
  query.value = ''
}

function questionState(q: Question): 'new' | 'correct' | 'wrong' {
  const latest = latestByQuestion.value.get(q.id)
  if (!latest) return 'new'
  return latest.correct ? 'correct' : 'wrong'
}

function highlightParts(text: string): { text: string; hit: boolean }[] {
  const keyword = needle.value
  if (!keyword) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const index = lower.indexOf(keyword)
  if (index < 0) return [{ text, hit: false }]
  return [
    { text: text.slice(0, index), hit: false },
    { text: text.slice(index, index + keyword.length), hit: true },
    { text: text.slice(index + keyword.length), hit: false },
  ].filter((part) => part.text)
}

function goQuiz(chapter: KnowledgeChapter, q: Question) {
  router.push({ name: 'quiz', params: { scope: chapter.id }, query: { q: q.id } })
}
</script>

<template>
  <main class="knowledge">
    <div class="wrap kn-wrap">
      <header class="kn-head">
        <p class="eyebrow"><span class="rule" />知识点汇总</p>
        <h1 class="serif">把书读薄。</h1>
        <p class="sub">
          按章节聚合全部知识点，点击题目展开答案。共 {{ knowledgeTopicCount }} 个知识点、{{
            knowledgeQuestionCount
          }}
          道题。
        </p>
        <div class="kn-stats">
          <div class="kn-stat"><b class="serif">{{ knowledgeChapters.length }}</b><span>章</span></div>
          <div class="kn-stat"><b class="serif">{{ knowledgeTopicCount }}</b><span>知识点</span></div>
          <div class="kn-stat"><b class="serif">{{ knowledgeQuestionCount }}</b><span>题目</span></div>
          <div class="kn-stat"><b class="serif">{{ overall.done }}</b><span>已刷题</span></div>
        </div>
      </header>

      <div class="kn-toolbar">
        <label class="kn-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" />
          </svg>
          <input v-model="query" type="search" placeholder="搜索知识点…" aria-label="搜索知识点" />
          <button v-if="query" type="button" class="kn-clear" aria-label="清空搜索" @click="clearQuery">
            ×
          </button>
        </label>

        <div class="seg kn-filter" role="group" aria-label="题目筛选">
          <button
            v-for="option in filterOptions"
            :key="option.id"
            :class="{ on: filter === option.id }"
            @click="filter = option.id"
          >
            {{ option.label }}<small>{{ option.count }}</small>
          </button>
        </div>
      </div>

      <p class="kn-result">
        共 {{ filteredTopicCount }} 个知识点 · {{ filteredQuestionCount }} 道题
        <span v-if="needle">（关键词「{{ query.trim() }}」）</span>
      </p>

      <div v-if="!filteredChapters.length" class="kn-empty card">
        <div class="kn-empty-mark serif">空</div>
        <h2>没有匹配的知识点</h2>
        <p>换个关键词，或把筛选切回「全部」试试。</p>
      </div>

      <section v-for="chapter in filteredChapters" :key="chapter.id" class="kn-chapter card">
        <button
          class="kn-ch-head"
          :aria-expanded="isChapterOpen(chapter.id)"
          @click="toggleChapter(chapter.id)"
        >
          <span class="kn-ch-no serif">{{ String(chapter.order).padStart(2, '0') }}</span>
          <span class="kn-ch-main">
            <b>{{ chapter.title }}</b>
            <small>{{ chapter.topics.length }} 个知识点 · {{ chapterQuestionCount(chapter) }} 题</small>
          </span>
          <span class="kn-ch-progress">已刷 {{ chapterDone(chapter) }}</span>
          <svg
            class="kn-chev"
            :class="{ open: isChapterOpen(chapter.id) }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <div v-if="isChapterOpen(chapter.id)" class="kn-ch-body">
          <section
            v-for="topic in chapter.topics"
            :key="topicKey(chapter, topic)"
            class="kn-topic"
          >
            <button
              class="kn-topic-head"
              :aria-expanded="isTopicOpen(topicKey(chapter, topic))"
              @click="toggleTopic(topicKey(chapter, topic))"
            >
              <span class="kn-dot" />
              <span class="kn-topic-name">
                <template v-for="(part, pi) in highlightParts(topic.name)" :key="pi">
                  <mark v-if="part.hit">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
              <span class="kn-topic-count">{{ topic.questions.length }} 题</span>
              <svg
                class="kn-chev small"
                :class="{ open: isTopicOpen(topicKey(chapter, topic)) }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <div v-if="isTopicOpen(topicKey(chapter, topic))" class="kn-topic-body">
              <article
                v-for="q in topic.questions"
                :key="q.id"
                class="kn-q"
                :class="{ open: isQuestionOpen(q.id) }"
              >
                <button
                  class="kn-q-head"
                  :aria-expanded="isQuestionOpen(q.id)"
                  @click="toggleQuestion(q.id)"
                >
                  <span class="kn-q-badges">
                    <span class="badge" :class="{ 'badge-accent': q.type === 'multi' }">
                      {{ q.type === 'multi' ? '多选' : '单选' }}
                    </span>
                    <span class="badge">难度 {{ q.difficulty }}</span>
                    <span v-if="questionState(q) === 'correct'" class="badge badge-ok">已答对</span>
                    <span v-else-if="questionState(q) === 'wrong'" class="badge badge-bad">曾答错</span>
                  </span>
                  <span class="kn-q-stem">{{ q.stem }}</span>
                  <svg
                    class="kn-chev small"
                    :class="{ open: isQuestionOpen(q.id) }"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                <div v-if="isQuestionOpen(q.id)" class="kn-q-body">
                  <ul class="kn-opts">
                    <li
                      v-for="(option, i) in q.options"
                      :key="i"
                      :class="{ correct: q.answer.includes(letters[i]) }"
                    >
                      <span class="kn-opt-key">{{ letters[i] }}</span>
                      <span class="kn-opt-text">{{ option }}</span>
                    </li>
                  </ul>
                  <p class="kn-answer">正确答案：{{ q.answer.join(' ') }}</p>
                  <button class="btn btn-primary btn-sm kn-go" @click="goQuiz(chapter, q)">
                    去刷这题
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.knowledge {
  flex: 1;
  padding: 34px 0 64px;
}

.kn-wrap {
  max-width: 900px;
}

.kn-head {
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

.kn-head h1 {
  margin: 10px 0 8px;
  font-size: clamp(27px, 4vw, 36px);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.sub {
  max-width: 60ch;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
}

.kn-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.kn-stat {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 8px 13px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.kn-stat b {
  font-size: 20px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.kn-stat span {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.kn-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 10px;
}

.kn-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 260px;
  height: 42px;
  padding: 0 12px;
  border-radius: 11px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.kn-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.kn-search svg {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  color: var(--muted);
}

.kn-search input {
  width: 100%;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 13.5px;
}

.kn-search input::placeholder {
  color: var(--muted);
}

.kn-search input::-webkit-search-cancel-button {
  display: none;
}

.kn-clear {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 14px;
  line-height: 1;
}

.kn-filter {
  flex-shrink: 0;
}

.kn-filter button small {
  margin-left: 3px;
  font-size: 10px;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.kn-result {
  margin: 0 0 14px;
  font-size: 11.5px;
  color: var(--muted);
}

.kn-chapter {
  overflow: hidden;
  margin-bottom: 12px;
}

.kn-ch-head {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 15px 18px;
  text-align: left;
}

.kn-ch-no {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--accent);
  font-size: 16px;
  font-weight: 700;
}

.kn-ch-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  line-height: 1.45;
}

.kn-ch-main b {
  font-size: 14.5px;
  font-weight: 600;
}

.kn-ch-main small {
  font-size: 11.5px;
  color: var(--muted);
}

.kn-ch-progress {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.kn-chev {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--muted);
  transition: transform 0.18s var(--ease);
}

.kn-chev.open {
  transform: rotate(180deg);
}

.kn-chev.small {
  width: 15px;
  height: 15px;
}

.kn-ch-body {
  border-top: 1px solid var(--line);
}

.kn-topic + .kn-topic {
  border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.kn-topic-head {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 12px 18px;
  text-align: left;
  transition: background-color 0.14s;
}

.kn-topic-head:hover {
  background: color-mix(in srgb, var(--surface-2) 60%, transparent);
}

.kn-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.75;
}

.kn-topic-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.55;
  word-break: break-word;
}

.kn-topic-name mark {
  padding: 0 1px;
  border-radius: 3px;
  background: var(--accent-soft);
  color: var(--accent);
}

.kn-topic-count {
  flex-shrink: 0;
  font-size: 10.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.kn-topic-body {
  padding: 0 18px 6px;
}

.kn-q {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  margin-bottom: 8px;
  overflow: hidden;
}

.kn-q.open {
  border-color: var(--accent-line);
}

.kn-q-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 11px 12px;
  text-align: left;
}

.kn-q-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex-shrink: 0;
  width: 112px;
}

.kn-q-badges .badge {
  height: 20px;
  padding: 0 6px;
  border-radius: 5px;
  font-size: 10px;
}

.kn-q-stem {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kn-q.open .kn-q-stem {
  display: block;
  overflow: visible;
  -webkit-line-clamp: unset;
}

.kn-q-body {
  padding: 0 12px 13px 134px;
}

.kn-opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
}

.kn-opts li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 12.5px;
  line-height: 1.55;
}

.kn-opts li.correct {
  border-color: var(--ok-line);
  background: var(--ok-soft);
  color: var(--ok);
}

.kn-opt-key {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 5px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  font-size: 10.5px;
  font-weight: 700;
}

.kn-opts li.correct .kn-opt-key {
  border-color: var(--ok);
  background: var(--ok);
  color: #fff;
}

.kn-opt-text {
  min-width: 0;
  word-break: break-word;
}

.kn-answer {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.03em;
}

.kn-go {
  border-radius: 8px;
}

.kn-empty {
  padding: 50px 24px;
  text-align: center;
}

.kn-empty-mark {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 14px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--muted);
  font-size: 26px;
}

.kn-empty h2 {
  font-size: 17px;
}

.kn-empty p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-2);
}

@media (max-width: 640px) {
  .knowledge {
    padding: 20px 0 44px;
  }

  .kn-head h1 {
    font-size: 26px;
  }

  .kn-toolbar {
    gap: 8px;
  }

  .kn-search {
    flex-basis: 100%;
    height: 40px;
  }

  .kn-filter {
    width: 100%;
    overflow-x: auto;
    justify-content: flex-start;
  }

  .kn-ch-head {
    gap: 9px;
    padding: 13px 13px;
  }

  .kn-ch-no {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 14px;
  }

  .kn-ch-main b {
    font-size: 13px;
  }

  .kn-ch-progress {
    display: none;
  }

  .kn-topic-head {
    padding: 11px 13px;
  }

  .kn-topic-body {
    padding: 0 10px 4px;
  }

  .kn-q-head {
    flex-wrap: wrap;
    padding: 10px;
  }

  .kn-q-badges {
    width: auto;
  }

  .kn-q-stem {
    flex-basis: 100%;
    order: 2;
  }

  .kn-q-head .kn-chev {
    margin-left: auto;
  }

  .kn-q-body {
    padding: 0 10px 12px;
  }
}
</style>
