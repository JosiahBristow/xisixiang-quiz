export interface Question {
  id: string
  type: 'single' | 'multi'
  difficulty: number
  topic: string
  stem: string
  options: string[]
  answer: string[]
}

export interface Chapter {
  id: string
  order: number
  title: string
  short: string
  name: string
  questions: Question[]
}

export interface Bank {
  meta: {
    title: string
    generatedAt: string
    total: number
    chapterCount: number
  }
  chapters: Chapter[]
}

export interface Attempt {
  /** 客户端生成的 uuid，也作为云端去重主键 */
  id: string
  questionId: string
  chapter: string
  correct: boolean
  /** ISO 时间 */
  at: string
  synced?: boolean
}

export type ThemeId = 'auto' | 'paper' | 'night' | 'bamboo' | 'ink'
export type QuizMode = 'practice' | 'recite'

export interface Settings {
  theme: ThemeId
  mode: QuizMode
  shuffle: boolean
}

export interface ChapterStat {
  total: number
  done: number
  correct: number
  accuracy: number
}

export interface LeaderboardRow {
  rank: number
  user_id: string
  nickname: string
  done: number
  correct: number
  accuracy: number
  is_me: boolean
}
