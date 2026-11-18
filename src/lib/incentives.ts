import type { Attempt, ChapterStat } from '../types'
import { bank } from './bank'

export interface BadgeDef {
  id: string
  name: string
  desc: string
  char: string
  tier: 'bronze' | 'silver' | 'gold'
}

export interface LevelDef {
  min: number
  name: string
}

export const LEVELS: LevelDef[] = [
  { min: 0, name: '童生' },
  { min: 200, name: '秀才' },
  { min: 600, name: '举人' },
  { min: 1200, name: '贡士' },
  { min: 2000, name: '进士' },
  { min: 3200, name: '翰林' },
  { min: 5000, name: '大学士' },
]

export const BADGES: BadgeDef[] = [
  { id: 'first', name: '初出茅庐', desc: '完成第一道题', char: '初', tier: 'bronze' },
  { id: 'streak5', name: '五连击', desc: '连续答对 5 题', char: '连', tier: 'bronze' },
  { id: 'streak10', name: '十连击', desc: '连续答对 10 题', char: '十', tier: 'silver' },
  { id: 'streak20', name: '二十连击', desc: '连续答对 20 题', char: '廿', tier: 'gold' },
  { id: 'correct100', name: '百题斩', desc: '累计答对 100 题', char: '百', tier: 'silver' },
  { id: 'correctHalf', name: '半壁江山', desc: '答对过半题目', char: '半', tier: 'gold' },
  { id: 'allQuestions', name: '题库通关', desc: '答对全部题目', char: '全', tier: 'gold' },
  { id: 'sharp', name: '神射手', desc: '单章刷满 20 题且正确率 ≥ 90%', char: '准', tier: 'silver' },
  { id: 'sevenDays', name: '七日不辍', desc: '连续 7 天有答题', char: '勤', tier: 'silver' },
  { id: 'fullWeek', name: '全勤一周', desc: '一周 7 天都在刷题', char: '周', tier: 'gold' },
  { id: 'pk5', name: '沙场宿将', desc: '联机 PK 获胜 5 场', char: '将', tier: 'bronze' },
  { id: 'pk20', name: '常胜将军', desc: '联机 PK 获胜 20 场', char: '胜', tier: 'gold' },
]

export const HALF_TOTAL = Math.ceil(bank.meta.total / 2)

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })

export function dayKeyOf(iso: string): string {
  return dayFormatter.format(new Date(iso))
}

export function todayKey(): string {
  return dayFormatter.format(new Date())
}

/** 以 YYYY-MM-DD 为单位做加减 */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  const offset = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}

export interface IncentiveStats {
  done: number
  correct: number
  accuracy: number
  points: number
  currentStreak: number
  maxStreak: number
  todayCount: number
  todayCorrect: number
  activeDays: number
  dayStreak: number
  maxDayStreak: number
  fullWeek: boolean
  pkWins: number
  level: LevelDef
  nextLevel: LevelDef | null
  levelPercent: number
}

export function computeIncentiveStats(attempts: Attempt[], pkWins: number): IncentiveStats {
  const latest = new Map<string, Attempt>()
  for (const a of attempts) {
    const prev = latest.get(a.questionId)
    if (!prev || Date.parse(a.at) >= Date.parse(prev.at)) latest.set(a.questionId, a)
  }

  const done = latest.size
  const correct = [...latest.values()].filter((a) => a.correct).length
  const accuracy = done ? Math.round((correct / done) * 100) : 0

  const sorted = [...attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  let run = 0
  let maxStreak = 0
  for (const a of sorted) {
    if (a.correct) {
      run++
      if (run > maxStreak) maxStreak = run
    } else {
      run = 0
    }
  }

  const daySet = new Set(sorted.map((a) => dayKeyOf(a.at)))
  const days = [...daySet].sort()
  let maxDayStreak = 0
  let dayRun = 0
  let prevDay = ''
  for (const d of days) {
    dayRun = prevDay && addDays(prevDay, 1) === d ? dayRun + 1 : 1
    if (dayRun > maxDayStreak) maxDayStreak = dayRun
    prevDay = d
  }

  const today = todayKey()
  let cursor = daySet.has(today) ? today : daySet.has(addDays(today, -1)) ? addDays(today, -1) : ''
  let dayStreak = 0
  while (cursor && daySet.has(cursor)) {
    dayStreak++
    cursor = addDays(cursor, -1)
  }

  let todayCount = 0
  let todayCorrect = 0
  for (const a of sorted) {
    if (dayKeyOf(a.at) === today) {
      todayCount++
      if (a.correct) todayCorrect++
    }
  }

  const weekDays = new Map<string, Set<string>>()
  for (const d of days) {
    const monday = mondayOf(d)
    const set = weekDays.get(monday) ?? new Set<string>()
    set.add(d)
    weekDays.set(monday, set)
  }
  const fullWeek = [...weekDays.values()].some((set) => set.size >= 7)

  const points = correct * 10 + pkWins * 80 + days.length * 20

  let level = LEVELS[0]
  let nextLevel: LevelDef | null = null
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].min) {
      level = LEVELS[i]
      nextLevel = LEVELS[i + 1] ?? null
    }
  }
  const levelPercent = nextLevel
    ? Math.min(100, Math.round(((points - level.min) / (nextLevel.min - level.min)) * 100))
    : 100

  return {
    done,
    correct,
    accuracy,
    points,
    currentStreak: run,
    maxStreak,
    todayCount,
    todayCorrect,
    activeDays: days.length,
    dayStreak,
    maxDayStreak,
    fullWeek,
    pkWins,
    level,
    nextLevel,
    levelPercent,
  }
}

export function computeBadgeIds(stats: IncentiveStats, chapters: Iterable<ChapterStat>): Set<string> {
  const ids = new Set<string>()
  if (stats.done >= 1) ids.add('first')
  if (stats.maxStreak >= 5) ids.add('streak5')
  if (stats.maxStreak >= 10) ids.add('streak10')
  if (stats.maxStreak >= 20) ids.add('streak20')
  if (stats.correct >= 100) ids.add('correct100')
  if (stats.correct >= HALF_TOTAL) ids.add('correctHalf')
  if (stats.correct >= bank.meta.total) ids.add('allQuestions')
  for (const ch of chapters) {
    if (ch.done >= 20 && ch.accuracy >= 90) {
      ids.add('sharp')
      break
    }
  }
  if (stats.maxDayStreak >= 7) ids.add('sevenDays')
  if (stats.fullWeek) ids.add('fullWeek')
  if (stats.pkWins >= 5) ids.add('pk5')
  if (stats.pkWins >= 20) ids.add('pk20')
  return ids
}
