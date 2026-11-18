import type { Question } from '../types'
import { allQuestions } from './bank'

export interface PkPrefs {
  count: number
  limit: number
}

export interface PkRoom {
  code: string
  host_id: string
  guest_id: string | null
  status: 'waiting' | 'playing' | 'finished' | 'cancelled'
  prefs: PkPrefs
  seed: number
  host_nickname: string
  guest_nickname: string | null
  host_score: number | null
  guest_score: number | null
  winner_id: string | null
}

/** PK 只用单选题，保证点击即交卷的节奏 */
export const pkPool: Question[] = allQuestions.filter((q) => q.type === 'single')

/** 双方用同一种子抽出完全相同的题目顺序 */
export function seededQuestions(seed: number, count: number): Question[] {
  let state = (seed >>> 0) || 1
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const pool = [...pkPool]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(Math.max(count, 1), pool.length))
}

/** 答对 100 分 + 速度分最高 60 分 */
export function pointsFor(correct: boolean, elapsedMs: number, limitMs: number): number {
  if (!correct) return 0
  const remain = Math.max(0, limitMs - Math.max(0, elapsedMs))
  return 100 + Math.round((60 * remain) / Math.max(1, limitMs))
}

export function pickCorrect(question: Question, pick: string | null): boolean {
  return Boolean(pick && question.answer.includes(pick))
}
