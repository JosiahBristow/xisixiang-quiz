import { computed, reactive } from 'vue'
import type { Attempt, ChapterStat, Question } from '../types'
import { bank, chapterOfQuestion, questionChapterId } from '../lib/bank'
import { readJSON, uid, writeJSON } from '../lib/storage'

const KEY = 'qz.attempts.v1'

function load(): Attempt[] {
  const raw = readJSON<Attempt[]>(KEY, [])
  if (!Array.isArray(raw)) return []
  return raw.filter((a) => a && typeof a.id === 'string' && typeof a.questionId === 'string')
}

export const attempts = reactive<Attempt[]>(load())

function persist(): void {
  writeJSON(KEY, attempts)
}

export function recordAttempt(question: Question, correct: boolean): void {
  attempts.push({
    id: uid(),
    questionId: question.id,
    chapter: questionChapterId(question.id),
    correct,
    at: new Date().toISOString(),
    synced: false,
  })
  persist()
  window.dispatchEvent(new Event('qz:attempts-changed'))
}

/** 批量记录（整卷交卷时用），只写一次 localStorage */
export function recordAttempts(entries: { question: Question; correct: boolean }[]): void {
  if (!entries.length) return
  const base = Date.now()
  entries.forEach((entry, i) => {
    attempts.push({
      id: uid(),
      questionId: entry.question.id,
      chapter: questionChapterId(entry.question.id),
      correct: entry.correct,
      at: new Date(base + i).toISOString(),
      synced: false,
    })
  })
  persist()
  window.dispatchEvent(new Event('qz:attempts-changed'))
}

/** 每题最近一次作答 */
export const latestByQuestion = computed(() => {
  const map = new Map<string, Attempt>()
  for (const a of attempts) {
    const prev = map.get(a.questionId)
    if (!prev || Date.parse(a.at) >= Date.parse(prev.at)) map.set(a.questionId, a)
  }
  return map
})

export const overall = computed(() => {
  const latest = latestByQuestion.value
  let done = 0
  let correct = 0
  for (const a of latest.values()) {
    done++
    if (a.correct) correct++
  }
  return {
    total: bank.meta.total,
    done,
    correct,
    accuracy: done ? Math.round((correct / done) * 100) : 0,
    percent: bank.meta.total ? Math.round((done / bank.meta.total) * 100) : 0,
  }
})

export const chapterStats = computed(() => {
  const latest = latestByQuestion.value
  const map = new Map<string, ChapterStat>()
  for (const ch of bank.chapters) {
    let done = 0
    let correct = 0
    for (const q of ch.questions) {
      const a = latest.get(q.id)
      if (a) {
        done++
        if (a.correct) correct++
      }
    }
    map.set(ch.id, {
      total: ch.questions.length,
      done,
      correct,
      accuracy: done ? Math.round((correct / done) * 100) : 0,
    })
  }
  return map
})

/** 错题本：最近一次作答仍是错的题 */
export const wrongQuestions = computed<Question[]>(() => {
  const latest = latestByQuestion.value
  const list: Question[] = []
  for (const ch of bank.chapters) {
    for (const q of ch.questions) {
      const a = latest.get(q.id)
      if (a && !a.correct) list.push(q)
    }
  }
  return list
})

/** 云端拉取回来的记录与本地合并（按 uuid 去重） */
export function mergeRemoteAttempts(rows: Attempt[]): number {
  const known = new Set(attempts.map((a) => a.id))
  let added = 0
  for (const row of rows) {
    if (!row?.id || known.has(row.id)) continue
    known.add(row.id)
    attempts.push({ ...row, synced: true })
    added++
  }
  if (added) {
    persist()
    window.dispatchEvent(new Event('qz:attempts-changed'))
  }
  return added
}

export function markAttemptsSynced(ids: string[]): void {
  const set = new Set(ids)
  let changed = false
  for (const a of attempts) {
    if (!a.synced && set.has(a.id)) {
      a.synced = true
      changed = true
    }
  }
  if (changed) persist()
}

export function pendingAttempts(): Attempt[] {
  return attempts.filter((a) => !a.synced)
}

export function resetLocalProgress(): void {
  attempts.splice(0, attempts.length)
  persist()
  window.dispatchEvent(new Event('qz:attempts-changed'))
}

/** 便于调试与图表：某题最近一次是否答对 */
export function lastAnswerOf(questionId: string): Attempt | undefined {
  return latestByQuestion.value.get(questionId)
}

export function chapterTitle(questionId: string): string {
  return chapterOfQuestion.get(questionId)?.short ?? ''
}
