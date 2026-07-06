/**
 * compress/markdown —— markdown 行级分类原语（纯逻辑，确定性，零依赖）。
 * 判定 heading / decision / constraint / todo（开·闭）+ front-matter 抽取 + 去前缀。
 * 规则驱动、大小写/中英双语标记，可 oracle（同输入同输出）。
 */
import type { KeyField } from './types.js'

export interface Heading {
  level: number
  text: string
}

/** `#`..`######` + 至少一个空格 + 非空文本；否则 null（超 6 级 / 无空格 / 缩进都不算）。 */
export function isHeading(line: string): Heading | null {
  const m = /^(#{1,6}) +(\S.*?) *$/.exec(line)
  if (!m) return null
  return { level: (m[1] ?? '').length, text: (m[2] ?? '').trim() }
}

/** 决策标记（EN + ZH）。recall 优先：宁多留一条决策，不漏关键取舍。 */
const DECISION_RE: readonly RegExp[] = [
  /\bdecision\b/i,
  /\bdecided\b/i,
  /\bwe (?:will|chose|decided|adopt|use|opt for|are going with)\b/i,
  /\bchosen\b/i,
  /\bconclusion\b/i,
  /\brationale\b/i,
  /\btrade[- ]?off/i,
  /决策|决定|结论|选定|采用|取舍|因此采/,
]

export function isDecision(line: string): boolean {
  return DECISION_RE.some((re) => re.test(line))
}

/** 约束标记：RFC2119 大写（避免误伤小写日常 "must"）+ 显式约束词 + ZH 强约束。 */
const CONSTRAINT_RE: readonly RegExp[] = [
  /\bMUST(?:\s+NOT)?\b/,
  /\bSHALL(?:\s+NOT)?\b/,
  /\bREQUIRED\b/,
  /\bconstraint\b/i,
  /\bforbidden\b/i,
  /必须|禁止|不允许|不得|约束|强制|严禁/,
]

export function isConstraint(line: string): boolean {
  return CONSTRAINT_RE.some((re) => re.test(line))
}

const OPEN_CHECKBOX = /^\s*[-*+]\s+\[ \]\s+(.*\S)\s*$/
const DONE_CHECKBOX = /^\s*[-*+]\s+\[[xX]\]\s+/
const TODO_KEYWORD = /\bTODO\b|\bFIXME\b|待办|待做|待完成/

/** 已完成 checkbox（`- [x]` / `- [X]`）。 */
export function isDoneTodo(line: string): boolean {
  return DONE_CHECKBOX.test(line)
}

/**
 * 未完成 todo 文本：开 checkbox → 勾选文本；含 TODO/FIXME/待办 关键词（非已完成）→ 去前缀整行。
 * 非 todo → null。
 */
export function openTodoText(line: string): string | null {
  const m = OPEN_CHECKBOX.exec(line)
  if (m) return (m[1] ?? '').trim()
  if (!DONE_CHECKBOX.test(line) && TODO_KEYWORD.test(line)) return stripLeadMarkers(line)
  return null
}

/** 去 markdown 列表/引用前缀（`- ` / `* ` / `+ ` / `> `，可嵌套）+ trim。 */
export function stripLeadMarkers(line: string): string {
  let s = line.trim()
  for (;;) {
    const next = s.replace(/^(?:>\s*|[-*+]\s+)/, '')
    if (next === s) break
    s = next.trim()
  }
  return s
}

export interface FrontMatter {
  keyFields: KeyField[]
  /** 正文起始行下标（闭合 --- 之后；无 front-matter → 0） */
  bodyStart: number
}

/**
 * YAML front-matter 顶块：首行 `---` + 后续 `---` 闭合之间的 `key: value`。
 * 未以 --- 开头或未闭合 → 无 front-matter（bodyStart 0），避免把正文分隔线误当 front-matter。
 */
export function parseFrontMatter(lines: readonly string[]): FrontMatter {
  if (lines[0] !== '---') return { keyFields: [], bodyStart: 0 }
  let close = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      close = i
      break
    }
  }
  if (close === -1) return { keyFields: [], bodyStart: 0 }
  const keyFields: KeyField[] = []
  for (let i = 1; i < close; i++) {
    const m = /^([A-Za-z_][\w -]*):\s*(.*)$/.exec(lines[i] ?? '')
    if (m) keyFields.push({ key: (m[1] ?? '').trim(), value: (m[2] ?? '').trim() })
  }
  return { keyFields, bodyStart: close + 1 }
}
