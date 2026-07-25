/**
 * compress/handoff —— phase handoff 编排（fs 注入面，pipeline 架构对齐）。
 *
 * 本仓 handoff 传的是 change 目录下的文档 + .pipeline.yaml 字段（design_doc / plan /
 * verification_report 指向的路径 + change 目录内的 proposal.md / design.md / tasks.md 等）。
 * 相位→上游产出文档的映射见 PHASE_DOCS：spec→build 传 design_doc + design.md；build→verify
 * 传 plan + tasks.md；verify→ship 传 verification_report。逐文档确定性压缩 + 聚合压缩率。
 *
 * fs 注入：纯逻辑经 HandoffFs 读磁盘字节（真 fs 缺省 nodeHandoffFs；测试注入 fake）。
 * kernel 零第三方依赖（仅 node:fs / node:path 内建）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { compressDocument, ratioOf, renderHandoffSummary, statsFor } from './compress.js'
import type { CompressStats, CompressedDoc } from './types.js'
import type { DocumentLocale } from '../types.js'

/** 文档读取注入面（缺失 → undefined，静默跳过）。 */
export interface HandoffFs {
  exists(absPath: string): boolean
  readText(absPath: string): string | undefined
}

/** 真 node fs 实现（缺省）。 */
export function nodeHandoffFs(): HandoffFs {
  return {
    exists: (p) => existsSync(p),
    readText: (p) => {
      try {
        return readFileSync(p, 'utf8')
      } catch {
        return undefined
      }
    },
  }
}

export type DocKind = 'field' | 'changefile'

/** 一个候选产出文档：field = 读 .pipeline.yaml 字段值作路径；changefile = change 目录内文件名。 */
export interface HandoffDocSpec {
  label: string
  kind: DocKind
  ref: string
}

/**
 * 相位 → 上游产出文档清单（该相位「产出」并交给下游的文档）。
 * 解析时按 exists + 非空过滤，缺的静默跳过，同物理文件去重（见 buildHandoff）。
 */
const PHASE_DOCS: Readonly<Record<string, readonly HandoffDocSpec[]>> = {
  open: [{ label: 'proposal', kind: 'changefile', ref: 'proposal.md' }],
  explore: [
    { label: 'proposal', kind: 'changefile', ref: 'proposal.md' },
    { label: 'design_doc', kind: 'field', ref: 'design_doc' },
    { label: 'design', kind: 'changefile', ref: 'design.md' },
  ],
  spec: [
    { label: 'design_doc', kind: 'field', ref: 'design_doc' },
    { label: 'design', kind: 'changefile', ref: 'design.md' },
    { label: 'proposal', kind: 'changefile', ref: 'proposal.md' },
    { label: 'tasks', kind: 'changefile', ref: 'tasks.md' },
  ],
  build: [
    { label: 'plan', kind: 'field', ref: 'plan' },
    { label: 'tasks', kind: 'changefile', ref: 'tasks.md' },
    { label: 'design_doc', kind: 'field', ref: 'design_doc' },
    { label: 'design', kind: 'changefile', ref: 'design.md' },
  ],
  verify: [
    { label: 'verification_report', kind: 'field', ref: 'verification_report' },
    { label: 'verification_report', kind: 'changefile', ref: 'verification_report.md' },
    { label: 'tasks', kind: 'changefile', ref: 'tasks.md' },
  ],
  ship: [
    { label: 'verification_report', kind: 'field', ref: 'verification_report' },
    { label: 'design_doc', kind: 'field', ref: 'design_doc' },
  ],
  archive: [
    { label: 'verification_report', kind: 'field', ref: 'verification_report' },
    { label: 'design_doc', kind: 'field', ref: 'design_doc' },
  ],
}

export function phaseHandoffDocs(phase: string): HandoffDocSpec[] {
  return (PHASE_DOCS[phase] ?? []).map((s) => ({ ...s }))
}

export interface HandoffInput {
  name: string
  phase: string
  /** 项目根：field 相对路径相对此解析 */
  cwd: string
  /** change 目录相对路径（如 openspec/changes/<name>），changefile 相对此解析 */
  changeDirRel: string
  /** .pipeline.yaml 字段（读 design_doc / plan / verification_report 值） */
  fields: Record<string, string | string[]>
  /** Change 固定的文档语言；旧 Change 缺省中文。 */
  documentLocale?: DocumentLocale
  /** 覆写候选文档清单（缺省 phaseHandoffDocs(phase)） */
  specs?: HandoffDocSpec[]
}

export interface HandoffDocResult {
  label: string
  /** 展示用相对路径（field 用字段值；changefile 用 changeDirRel/ref） */
  path: string
  doc: CompressedDoc
  /** 渲染的结构化摘要（下游消费的压缩产物） */
  summary: string
}

export interface HandoffResult {
  name: string
  phase: string
  documentLocale: DocumentLocale
  docs: HandoffDocResult[]
  /** 跨文档聚合压缩率 */
  aggregate: CompressStats
}

function scalar(v: string | string[] | undefined): string {
  if (v === undefined) return ''
  return Array.isArray(v) ? v.join(',') : v
}

/** 老内核空值语义：空串或 "null" 哨兵都算未设。 */
function isUnset(v: string): boolean {
  return v === '' || v === 'null'
}

interface Resolved {
  abs: string
  display: string
}

function resolveSpec(spec: HandoffDocSpec, input: HandoffInput): Resolved | null {
  if (spec.kind === 'field') {
    const val = scalar(input.fields[spec.ref]).trim()
    if (isUnset(val)) return null
    return { abs: isAbsolute(val) ? val : join(input.cwd, val), display: val }
  }
  return {
    abs: join(input.cwd, input.changeDirRel, spec.ref),
    display: `${input.changeDirRel}/${spec.ref}`,
  }
}

/** 空聚合（无文档）。 */
function emptyAggregate(): CompressStats {
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

/**
 * 编排 handoff 压缩：解析相位产出文档 → 逐个压缩 → 聚合压缩率。
 * 缺失 / 空白 / 重复物理文件的候选被跳过。
 */
export function buildHandoff(input: HandoffInput, fs: HandoffFs): HandoffResult {
  const specs = input.specs ?? phaseHandoffDocs(input.phase)
  const documentLocale = input.documentLocale ?? 'zh-CN'
  const docs: HandoffDocResult[] = []
  const seen = new Set<string>()

  for (const spec of specs) {
    const r = resolveSpec(spec, input)
    if (r === null || seen.has(r.abs)) continue
    seen.add(r.abs)
    const text = fs.readText(r.abs)
    if (text === undefined || text.trim() === '') continue
    const doc = compressDocument(text, { documentLocale })
    const summary = renderHandoffSummary(doc, `${input.name}/${spec.label}`, documentLocale)
    // 摘要带 label（比 doc 内部无 label 渲染略长）→ 用带 label 的摘要重算压缩字符，压缩率不失真
    doc.stats = statsFor(text, doc.stats.originalLines, summary, doc)
    docs.push({ label: spec.label, path: r.display, doc, summary })
  }

  if (docs.length === 0) {
    return { name: input.name, phase: input.phase, documentLocale, docs, aggregate: emptyAggregate() }
  }

  const sum = (pick: (s: CompressStats) => number): number => docs.reduce((a, d) => a + pick(d.doc.stats), 0)
  const originalChars = sum((s) => s.originalChars)
  const compressedChars = sum((s) => s.compressedChars)
  const aggregate: CompressStats = {
    originalChars,
    compressedChars,
    originalLines: sum((s) => s.originalLines),
    compressedLines: sum((s) => s.compressedLines),
    keptLines: sum((s) => s.keptLines),
    droppedLines: sum((s) => s.droppedLines),
    ratio: ratioOf(originalChars, compressedChars),
  }
  return { name: input.name, phase: input.phase, documentLocale, docs, aggregate }
}
