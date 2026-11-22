import { bank, allQuestions, chapterOfQuestion } from './bank'

export type SearchHitKind = 'chapter' | 'question'

export interface SearchHit {
  kind: SearchHitKind
  id: string
  title: string
  subtitle: string
  chapterId: string
  score: number
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

function scoreText(text: string, query: string): number {
  if (!text) return 0
  const t = normalize(text)
  if (t === query) return 100
  if (t.startsWith(query)) return 82
  if (t.includes(query)) return 62
  return 0
}

function clip(text: string, length = 56): string {
  const t = text.trim()
  return t.length > length ? `${t.slice(0, length)}…` : t
}

/** 在本地题库中搜索章节与题目，返回按相关度排序的轻量结果 */
export function searchAll(keyword: string, limit = 8): SearchHit[] {
  const query = normalize(keyword.trim())
  if (!query) return []

  const chapterHits: SearchHit[] = []
  for (const ch of bank.chapters) {
    const score = Math.max(
      scoreText(ch.title, query),
      scoreText(ch.name, query),
      scoreText(ch.short, query),
    )
    if (score <= 0) continue
    chapterHits.push({
      kind: 'chapter',
      id: ch.id,
      title: ch.title,
      subtitle: `${ch.questions.length} 道题 · 章节`,
      chapterId: ch.id,
      score: score + 12,
    })
  }

  const questionHits: SearchHit[] = []
  for (const q of allQuestions) {
    const stemScore = scoreText(q.stem, query)
    const topicScore = scoreText(q.topic, query) * 0.8
    let optionScore = 0
    for (const option of q.options) {
      optionScore = Math.max(optionScore, scoreText(option, query) * 0.45)
    }
    const score = Math.max(stemScore, topicScore, optionScore)
    if (score <= 0) continue
    const chapter = chapterOfQuestion.get(q.id)
    const chapterId = chapter?.id ?? ''
    questionHits.push({
      kind: 'question',
      id: q.id,
      title: clip(q.stem),
      subtitle: `${chapter?.short ?? '题目'} · ${q.type === 'multi' ? '多选' : '单选'}`,
      chapterId,
      score,
    })
  }

  questionHits.sort((a, b) => b.score - a.score)
  chapterHits.sort((a, b) => b.score - a.score)

  return [...chapterHits.slice(0, 3), ...questionHits.slice(0, Math.max(0, limit - 3))].slice(0, limit)
}
