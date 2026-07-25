/**
 * compress/compress —— 确定性文档压缩核心（纯逻辑，零依赖，可 oracle）。
 *
 * 算法（单遍扫描，确定性规则，零 LLM）：
 *   1. front-matter 顶块 → keyFields，正文从闭合 --- 之后开始。
 *   2. 逐行分类（互斥优先级）：代码围栏体丢弃 > 标题入骨架 > checkbox（开/闭）> 约束 > 决策 >
 *      TODO 关键词 > 其余（叙述正文 / 分隔线 / 空行 = 样板）丢弃。约束先于决策——RFC2119
 *      规范词（MUST/SHALL）是更强信号，「MUST NOT drop any decision」这类行归约束而非决策。
 *   3. 各桶去重保序（同一决策/约束只留首次）。
 *   4. 渲染结构化摘要（空段省略）；压缩率 = 1 - 摘要字符 / 原字符（字符是确定 token 代理）。
 *
 * 保真承诺：关键决策 / 约束 / 待办 / 结构骨架不丢；叙述正文 / 代码示例 / 重复样板去除。
 */
import { isConstraint, isDecision, isDoneTodo, isHeading, openTodoText, parseFrontMatter, stripLeadMarkers } from './markdown.js'
import type { CompressOptions, CompressStats, CompressedDoc } from './types.js'
import type { DocumentLocale } from '../types.js'

/** 压缩率：1 - 压缩/原（4 位小数）。原 ≤ 0 → 0。短文档膨胀可为负（诚实）。 */
export function ratioOf(originalChars: number, compressedChars: number): number {
  if (originalChars <= 0) return 0
  return Math.round((1 - compressedChars / originalChars) * 10000) / 10000
}

/** 去重保序（按 trim 后文本；空串剔除）。 */
function dedup(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const key = raw.trim()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push(raw)
  }
  return out
}

/**
 * 压缩单文档：文本 → 结构化摘要 + 压缩率统计。纯函数，无副作用、无 fs。
 */
export function compressDocument(text: string, opts: CompressOptions = {}): CompressedDoc {
  const maxDepth = opts.maxHeadingDepth ?? 6
  const rawLines = text.split('\n')
  const fm = parseFrontMatter(rawLines)

  let title: string | null = null
  const headings: string[] = []
  const decisions: string[] = []
  const constraints: string[] = []
  const openTodos: string[] = []
  let doneTodoCount = 0

  let inCode = false
  for (let i = fm.bodyStart; i < rawLines.length; i++) {
    const line = rawLines[i] ?? ''
    if (/^\s*(?:```|~~~)/.test(line)) {
      inCode = !inCode // 围栏分隔符本身丢弃
      continue
    }
    if (inCode) continue // 代码体 = 样板/示例，丢弃

    const h = isHeading(line)
    if (h) {
      if (h.level === 1 && title === null) title = h.text
      if (h.level <= maxDepth) headings.push('#'.repeat(h.level) + ' ' + h.text)
      continue
    }
    if (isDoneTodo(line)) {
      doneTodoCount += 1
      continue
    }
    const todo = openTodoText(line)
    if (todo !== null) {
      openTodos.push(todo)
      continue
    }
    if (isConstraint(line)) {
      constraints.push(stripLeadMarkers(line))
      continue
    }
    if (isDecision(line)) {
      decisions.push(stripLeadMarkers(line))
      continue
    }
    // 叙述正文 / 分隔线 / 空行 = 样板噪声，丢弃（压缩率来源）
  }

  const doc: CompressedDoc = {
    title,
    headings: dedup(headings),
    decisions: dedup(decisions),
    constraints: dedup(constraints),
    openTodos: dedup(openTodos),
    doneTodoCount,
    keyFields: fm.keyFields,
    stats: emptyStats(),
  }
  doc.stats = statsFor(
    text,
    rawLines.length,
    renderHandoffSummary(doc, undefined, opts.documentLocale ?? 'zh-CN'),
    doc,
  )
  return doc
}

function emptyStats(): CompressStats {
  return {
    originalChars: 0,
    originalLines: 0,
    compressedChars: 0,
    compressedLines: 0,
    keptLines: 0,
    droppedLines: 0,
    ratio: 0,
  }
}

/** 从原文 + 渲染摘要计算压缩率统计。 */
export function statsFor(
  originalText: string,
  originalLines: number,
  rendered: string,
  doc: CompressedDoc,
): CompressStats {
  const originalChars = originalText.length
  const compressedChars = rendered.length
  const compressedLines = rendered === '' ? 0 : rendered.split('\n').length
  const keptLines =
    doc.headings.length + doc.decisions.length + doc.constraints.length + doc.openTodos.length + doc.keyFields.length
  return {
    originalChars,
    originalLines,
    compressedChars,
    compressedLines,
    keptLines,
    droppedLines: Math.max(0, originalLines - keptLines),
    ratio: ratioOf(originalChars, compressedChars),
  }
}

/**
 * 渲染下游 handoff 摘要（结构化 markdown，空段省略）。label 覆写标题（缺省用 doc.title）。
 * 顺序：标题 → 结构骨架 → 决策 → 约束 → 开 todo → key fields。
 */
export function renderHandoffSummary(
  doc: CompressedDoc,
  label?: string,
  locale: DocumentLocale = 'zh-CN',
): string {
  const text = locale === 'zh-CN'
    ? {
        handoff: '交接摘要',
        summary: '摘要',
        structure: '结构',
        decisions: '决策',
        constraints: '约束',
        todos: '待办',
        fields: '关键字段',
      }
    : {
        handoff: 'Handoff',
        summary: 'summary',
        structure: 'Structure',
        decisions: 'Decisions',
        constraints: 'Constraints',
        todos: 'Open TODOs',
        fields: 'Key Fields',
      }
  const out: string[] = []
  out.push(`# ${text.handoff}: ${label ?? doc.title ?? text.summary}`)
  if (doc.headings.length > 0) {
    out.push('', `## ${text.structure}`)
    for (const h of doc.headings) out.push(`- ${h}`)
  }
  if (doc.decisions.length > 0) {
    out.push('', `## ${text.decisions} (${doc.decisions.length})`)
    for (const d of doc.decisions) out.push(`- ${d}`)
  }
  if (doc.constraints.length > 0) {
    out.push('', `## ${text.constraints} (${doc.constraints.length})`)
    for (const c of doc.constraints) out.push(`- ${c}`)
  }
  if (doc.openTodos.length > 0) {
    out.push('', `## ${text.todos} (${doc.openTodos.length})`)
    for (const t of doc.openTodos) out.push(`- [ ] ${t}`)
  }
  if (doc.keyFields.length > 0) {
    out.push('', `## ${text.fields}`)
    for (const k of doc.keyFields) out.push(`- ${k.key}: ${k.value}`)
  }
  return out.join('\n')
}
