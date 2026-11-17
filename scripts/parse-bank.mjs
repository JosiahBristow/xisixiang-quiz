#!/usr/bin/env node
/**
 * 把项目根目录下「习思想题库更新版/」里的 .docx 题库解析成前端可直接使用的 JSON。
 *
 * docx 结构（w:document.xml 里的段落）：
 *   [多选题][难度2][认知目标# xxx]      ← 题型 / 难度 / 知识点（可选）
 *   题干文字……（AB）                    ← 答案标在题干末尾括号内
 *   A. 选项一
 *   B. 选项二
 *   C. 选项三
 *   D. 选项四
 *   (空行)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const BANK_DIR = join(ROOT, '习思想题库更新版')
const OUT_FILE = join(ROOT, 'src', 'data', 'questions.json')

const CN_DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

/** 「十七」→ 17，「二十」→ 20，「导论」→ 0 */
function cnNumber(s) {
  if (!s) return null
  if (s === '十') return 10
  if (s.length === 1) return CN_DIGITS[s] ?? null
  if (s[0] === '十') return 10 + (CN_DIGITS[s[1]] ?? 0)
  if (s[1] === '十') return (CN_DIGITS[s[0]] ?? 0) * 10 + (CN_DIGITS[s[2]] ?? 0)
  return null
}

/** 从文件名得到章节标题和排序序号 */
function chapterFromFilename(file) {
  const base = file.replace(/\.docx$/i, '').replace(/题库(更新版)?$/, '').trim()
  if (/导论|绪论/.test(base)) {
    return { title: base, order: 0, short: '导论' }
  }
  const m = base.match(/^第(.+?)章\s*(.*)$/)
  if (m) {
    const n = cnNumber(m[1])
    const name = m[2].trim()
    return {
      title: name ? `第${m[1]}章 ${name}` : `第${m[1]}章`,
      order: n ?? 999,
      short: `第${m[1]}章`,
      name,
    }
  }
  return { title: base, order: 998, short: base }
}

/** 抽取 docx 里的段落纯文本 */
function readParagraphs(file) {
  const buf = readFileSync(file)
  const zip = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === 'word/document.xml' })
  const xml = strFromU8(zip['word/document.xml'])
  const paragraphs = []
  const paraRe = /<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g
  const matches = xml.match(paraRe) ?? []
  for (const p of matches) {
    let text = ''
    const textRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
    let t
    while ((t = textRe.exec(p))) {
      text += t[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
    }
    // 处理段内换行 / 制表
    text = text.replace(/<w:br\/>/g, '')
    paragraphs.push(text.trim())
  }
  return paragraphs
}

const ANSWER_RE = /[（(]\s*([A-Z]{1,8})\s*[）)]\s*$/
const OPTION_RE = /^([A-Z])[.、．]\s*(.+)$/
const TAG_RE = /\[([^\]]+)\]/g

function parseQuestionBlock(lines, meta, anomalies, where) {
  const stemLines = []
  const optionLines = []
  for (const line of lines) {
    if (OPTION_RE.test(line)) optionLines.push(line)
    else if (!optionLines.length) stemLines.push(line)
    else anomalies.push(`${where}：选项后出现非选项行「${line.slice(0, 24)}…」`)
  }

  let stem = stemLines.join('')
  const answerMatch = stem.match(ANSWER_RE)
  if (!answerMatch) {
    anomalies.push(`${where}：题干末尾找不到答案括号`)
    return null
  }
  const answer = [...answerMatch[1]]
  stem = stem.replace(ANSWER_RE, '').trim()
  // 个别题目答案括号嵌在题干中间（"打好（ABC）的攻坚战"），替换成填空线
  stem = stem.replace(/[（(]\s*[A-Z]{1,8}\s*[）)]/g, '______').trim()

  const options = optionLines.map((line) => {
    const m = line.match(OPTION_RE)
    const text = m[2].trim()
    return text
  }).filter(Boolean)

  const keys = optionLines.map((line) => line.match(OPTION_RE)[1])
  for (const a of answer) {
    if (!keys.includes(a)) anomalies.push(`${where}：答案 ${a} 不在选项 ${keys.join('')} 中`)
  }
  if (options.length < 2) anomalies.push(`${where}：选项少于 2 个（${options.length}）`)
  if (!meta.type) anomalies.push(`${where}：缺少题型标签`)
  if (meta.type === '单选题' && answer.length !== 1) {
    anomalies.push(`${where}：单选题却有 ${answer.length} 个答案`)
  }
  if (meta.type === '多选题' && answer.length < 2) {
    anomalies.push(`${where}：多选题却只有 ${answer.length} 个答案`)
  }

  return {
    type: meta.type === '多选题' ? 'multi' : 'single',
    difficulty: meta.difficulty || 1,
    topic: meta.topic || '',
    stem,
    options,
    answer,
  }
}

function main() {
  if (!existsSync(BANK_DIR)) {
    console.error(`✗ 找不到题库目录：${BANK_DIR}`)
    process.exit(1)
  }

  const files = readdirSync(BANK_DIR)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .sort((a, b) => chapterFromFilename(a).order - chapterFromFilename(b).order)

  const anomalies = []
  const chapters = []
  let total = 0

  for (const file of files) {
    const ch = chapterFromFilename(file)
    const paragraphs = readParagraphs(join(BANK_DIR, file))
    const questions = []
    let block = null
    let seq = 0

    const flush = () => {
      if (!block) return
      seq += 1
      const where = `${ch.short} 第${seq}题`
      const q = parseQuestionBlock(block.lines, block.meta, anomalies, where)
      if (q) {
        questions.push({ id: `q${ch.order}-${String(seq).padStart(3, '0')}`, ...q })
      }
      block = null
    }

    for (const line of paragraphs) {
      if (!line) {
        flush()
        continue
      }
      TAG_RE.lastIndex = 0
      const tags = [...line.matchAll(TAG_RE)].map((m) => m[1].trim())
      const isTagLine = tags.length > 0 && !OPTION_RE.test(line) && tags.some((t) => /^(单选题|多选题|判断题|填空题)$/.test(t))
      if (isTagLine) {
        flush()
        const meta = { type: null, difficulty: 1, topic: '' }
        for (const tag of tags) {
          if (/^(单选题|多选题|判断题|填空题)$/.test(tag)) meta.type = tag
          else if (tag.startsWith('难度')) meta.difficulty = Number(tag.replace('难度', '')) || 1
          else if (tag.startsWith('认知目标')) meta.topic = tag.replace(/^认知目标\s*#?\s*/, '').trim()
        }
        block = { meta, lines: [] }
        continue
      }
      // 题干、选项、或标签之前的内容
      if (!block) block = { meta: { type: null, difficulty: 1, topic: '' }, lines: [] }
      block.lines.push(line)
    }
    flush()

    if (!questions.length) anomalies.push(`${file}：没有解析出任何题目`)
    total += questions.length
    chapters.push({
      id: `ch${ch.order}`,
      order: ch.order,
      title: ch.title,
      short: ch.short,
      name: ch.name || ch.title,
      questions,
    })
    console.log(`  ${ch.short.padEnd(4, ' ')} ${String(questions.length).padStart(3, ' ')} 题  ${ch.title}`)
  }

  chapters.sort((a, b) => a.order - b.order)
  const out = {
    meta: {
      title: '习近平新时代中国特色社会主义思想 · 题库',
      total,
      chapterCount: chapters.length,
    },
    chapters,
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true })
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + '\n')

  console.log('\n──────────────────────────────')
  console.log(`✓ 共 ${chapters.length} 章，${total} 题（单选 ${chapters.flatMap((c) => c.questions).filter((q) => q.type === 'single').length} / 多选 ${chapters.flatMap((c) => c.questions).filter((q) => q.type === 'multi').length}）`)
  console.log(`✓ 已写入 src/data/questions.json（${(existsSync(OUT_FILE) ? readFileSync(OUT_FILE).length / 1024 : 0).toFixed(1)} KB）`)
  if (anomalies.length) {
    console.log(`\n⚠ ${anomalies.length} 处需要人工留意：`)
    for (const a of anomalies) console.log(`  · ${a}`)
  } else {
    console.log('✓ 校验通过，无异常')
  }
}

main()
