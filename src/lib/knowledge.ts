import type { Chapter, Question } from '../types'
import { bank } from './bank'

export interface KnowledgeTopic {
  name: string
  questions: Question[]
}

export interface KnowledgeChapter {
  id: string
  order: number
  title: string
  name: string
  short: string
  topics: KnowledgeTopic[]
}

const FALLBACK_TOPIC = '综合知识点'

function build(): KnowledgeChapter[] {
  return bank.chapters.map((chapter: Chapter) => {
    const byTopic = new Map<string, KnowledgeTopic>()
    for (const q of chapter.questions) {
      const name = q.topic?.trim() || FALLBACK_TOPIC
      let topic = byTopic.get(name)
      if (!topic) {
        topic = { name, questions: [] }
        byTopic.set(name, topic)
      }
      topic.questions.push(q)
    }
    return {
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      name: chapter.name,
      short: chapter.short,
      topics: [...byTopic.values()],
    }
  })
}

/** 18 章 → 133 个知识点，按题库原始顺序聚合，构建一次即可 */
export const knowledgeChapters: KnowledgeChapter[] = build()

export const knowledgeTopicCount = knowledgeChapters.reduce(
  (sum, chapter) => sum + chapter.topics.length,
  0,
)

export const knowledgeQuestionCount = knowledgeChapters.reduce(
  (sum, chapter) => sum + chapter.topics.reduce((n, topic) => n + topic.questions.length, 0),
  0,
)
