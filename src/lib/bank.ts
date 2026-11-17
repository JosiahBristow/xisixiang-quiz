import raw from '../data/questions.json'
import type { Bank, Chapter, Question } from '../types'

export const bank = raw as unknown as Bank

export const allQuestions: Question[] = bank.chapters.flatMap((c) => c.questions)
export const questionById = new Map(allQuestions.map((q) => [q.id, q]))
export const chapterById = new Map<string, Chapter>(bank.chapters.map((c) => [c.id, c]))

export const chapterOfQuestion = new Map<string, Chapter>()
for (const ch of bank.chapters) {
  for (const q of ch.questions) chapterOfQuestion.set(q.id, ch)
}

export function questionChapterId(questionId: string): string {
  return chapterOfQuestion.get(questionId)?.id ?? questionId.split('-')[0].replace(/^q/, 'ch')
}

/** Fisher–Yates 洗牌，返回新数组 */
export function shuffle<T>(list: T[]): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function sameAnswer(picked: string[], answer: string[]): boolean {
  if (picked.length !== answer.length) return false
  const set = new Set(answer)
  return picked.every((k) => set.has(k))
}
