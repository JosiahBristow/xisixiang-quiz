import type { Question } from '../types'

/** 32 位无符号随机种子 */
export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0
}

/** FNV-1a：把题目 id 混入会话种子，保证同一会话内可复现 */
export function seedFor(questionId: string, sessionSeed: number): number {
  let hash = 2166136261
  for (let i = 0; i < questionId.length; i++) {
    hash ^= questionId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash ^ Math.imul(sessionSeed, 2654435761)) >>> 0
}

/** mulberry32：轻量确定性伪随机数 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 返回选项顺序打乱后的题目副本。
 * options 与 answer 一起重映射，原始 questions.json 不会被修改。
 * 同样的 seed + questionId 会得到同样的顺序，便于刷新后恢复。
 */
export function shuffledQuestion(question: Question, seed: number): Question {
  const total = question.options.length
  if (total < 2) return question

  const rand = mulberry32(seed)
  const order = Array.from({ length: total }, (_, i) => i)
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const options = order.map((i) => question.options[i])
  const remapped = question.answer
    .map((letter) => {
      const original = letter.charCodeAt(0) - 65
      const next = order.indexOf(original)
      return next >= 0 ? String.fromCharCode(65 + next) : ''
    })
    .filter(Boolean)
    .sort()

  return { ...question, options, answer: remapped }
}
