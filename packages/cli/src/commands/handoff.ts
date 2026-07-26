/**
 * handoff 子命令 —— 上下文压缩（BACKLOG #30 / GOAL B13·D11：对标 Tenon runtime CONTEXT-COMPRESSION）。
 *
 * `tenon handoff <name> [--phase p] [--json]`：对指定 change 的当前相位产出文档
 * （design_doc / plan / verification_report 指向的路径 + change 目录内 proposal/design/tasks.md）
 * 做**确定性**结构化压缩，输出下游 handoff 摘要 + 压缩率。零 LLM（纯规则，可测可 oracle）。
 * stdout：压缩摘要（下游消费的产物）+ 压缩率行；--json 结构化信封。exit：非法名/状态缺失=1，否则 0。
 *
 * 触发面：handoff 只在用户显式敲 `tenon handoff` 时跑——相位转换不自动产出 handoff
 * 摘要（transition.ts 的进相位副作用里没有 buildHandoff 调用）。注意 transition 仍会写
 * `.breadcrumb`，但那只是一行 `pipeline:<name> phase=<to>` 的相位标记，与 handoff 摘要无关。
 */
import {
  buildHandoff,
  compileContextBundle,
  compressDocument,
  isDocumentContractPhase,
  nodeHandoffFs,
  readDocumentLedger,
  readsRequiredForPhase,
  renderHandoffSummary,
  type ContextBundleInputV1,
  type ContextBundleMode,
  type DocumentKind,
  type HandoffFs,
  type HandoffResult,
} from '@tenon/kernel'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { PipelineState } from '@tenon/kernel'
import type { DocumentLocale } from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { resolveChangeDocumentLocale } from '../documentLocale.js'
import { changeDir, isValidChangeName } from '../paths.js'

export type { HandoffFs } from '@tenon/kernel'

export interface HandoffOpts {
  json?: boolean
  /** 覆写要压缩的相位产出（缺省 = change 当前 phase） */
  phase?: string
  /** Opt-in Context Bundle v1; legacy handoff remains the default. */
  bundle?: boolean
  /** Exact consumer phase/role for bundle policy selection. */
  target?: string
  budgetBytes?: number
}

export type HandoffLocaleResolver = (changeDirPath: string) => Promise<DocumentLocale>

function scalarField(v: string | string[] | undefined): string {
  if (v === undefined) return ''
  return Array.isArray(v) ? v.join(',') : v
}

/** --json 结构化信封（下游可编程消费；对 Tenon runtime 纯文本压缩的超越点：结构化 + 逐文档量化）。 */
function renderJson(result: HandoffResult): string {
  return JSON.stringify({
    change: result.name,
    phase: result.phase,
    aggregate: result.aggregate,
    docs: result.docs.map((d) => ({
      label: d.label,
      path: d.path,
      stats: d.doc.stats,
      title: d.doc.title,
      headings: d.doc.headings,
      decisions: d.doc.decisions,
      constraints: d.doc.constraints,
      openTodos: d.doc.openTodos,
      doneTodoCount: d.doc.doneTodoCount,
      keyFields: d.doc.keyFields,
      summary: d.summary,
    })),
  })
}

function pct(ratio: number): number {
  return Math.round(ratio * 100)
}

/** 人读输出：header + 压缩率 + 逐文档摘要（下游可直接读的压缩产物）。 */
function renderText(deps: CliDeps, result: HandoffResult): void {
  const chinese = result.documentLocale === 'zh-CN'
  deps.io.out(chinese
    ? `# 交接摘要: ${result.name}（阶段 ${result.phase}）`
    : `# Handoff: ${result.name} (phase ${result.phase})`)
  if (result.docs.length === 0) {
    deps.io.out(chinese ? '# 当前阶段没有可交接文档。' : '# No handoff documents found for this phase.')
    deps.io.err(`[HANDOFF] ${result.name} @ ${result.phase}: 无可压缩产出文档（相位无 upstream doc 或文件缺失/空）`)
    return
  }
  const agg = result.aggregate
  deps.io.out(chinese
    ? `# 压缩率: ${pct(agg.ratio)}%（${agg.originalChars} → ${agg.compressedChars} 字符，${result.docs.length} 份文档）`
    : `# Compression: ${pct(agg.ratio)}% (${agg.originalChars} → ${agg.compressedChars} chars, ${result.docs.length} doc(s))`)
  for (const d of result.docs) {
    deps.io.out('')
    deps.io.out(chinese
      ? `## ${d.path} — ${pct(d.doc.stats.ratio)}%（${d.doc.stats.originalChars} → ${d.doc.stats.compressedChars} 字符）`
      : `## ${d.path} — ${pct(d.doc.stats.ratio)}% (${d.doc.stats.originalChars} → ${d.doc.stats.compressedChars} chars)`)
    for (const line of d.summary.split('\n')) deps.io.out(line)
  }
}

const DEFAULT_BUNDLE_BUDGET = 120_000

const DOCUMENT_REASONS: Readonly<Record<DocumentKind, string>> = {
  proposal: '定义目标、范围、非目标与验收信号',
  'openspec-design': '冻结 OpenSpec 设计决策、风险和边界',
  tasks: '提供当前七阶段可执行任务和完成状态',
  'superpower-design': '提供深层架构规则、不变量与方案取舍',
  adr: '提供已接受的长期架构决策',
  'delta-spec': '提供能力级新增、修改和删除需求',
  'superpower-plan': '提供逐文件实施顺序、测试和回滚策略',
  plan: '提供当前 Build 执行计划入口',
  'verification-report': '提供冻结基线上的验证结果和失败分类',
  'applied-spec': '证明 delta spec 已应用到主规格',
}

function materializationMode(kind: DocumentKind): Exclude<ContextBundleMode, 'reference'> {
  return kind === 'proposal' || kind === 'tasks' || kind === 'delta-spec' ? 'full' : 'summary'
}

function sourceDigest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

async function compileBundle(
  deps: CliDeps,
  name: string,
  from: string,
  target: string | undefined,
  budgetBytes: number | undefined,
  fs: HandoffFs,
): Promise<ReturnType<typeof compileContextBundle>> {
  if (target === undefined || !isDocumentContractPhase(target)) {
    throw new Error(`Context Bundle --target 必须是 canonical phase: ${target ?? '(missing)'}`)
  }
  const dir = changeDir(deps.cwd, name)
  const ledger = await readDocumentLedger(dir)
  if (ledger === undefined) throw new Error('Context Bundle missing document ledger; run tenon document init')

  const bundleInputs: ContextBundleInputV1[] = []
  const materializedPaths = new Set<string>()
  for (const kind of readsRequiredForPhase(target)) {
    const records = ledger.records
      .filter((record) => record.kind === kind)
      .sort((left, right) => left.path.localeCompare(right.path, 'en'))
    if (records.length === 0) {
      throw new Error(
        `Context Bundle missing document '${kind}'; run tenon document record ${name} ${kind} <path> --producer <skill>`,
      )
    }
    for (const record of records) {
      const text = fs.readText(join(deps.cwd, record.path))
      if (text === undefined) {
        throw new Error(`Context Bundle missing document '${kind}': ${record.path}; restore or re-record it`)
      }
      const actual = sourceDigest(text)
      if (actual !== record.sha256) {
        throw new Error(
          `Context Bundle stale document '${kind}': ${record.path}; run tenon document record ${name} ${kind} ${record.path} --producer <skill>, then tenon document read ${name} all`,
        )
      }

      const duplicatePath = materializedPaths.has(record.path)
      const mode: ContextBundleMode = duplicatePath ? 'reference' : materializationMode(kind)
      if (!duplicatePath) materializedPaths.add(record.path)
      const content = mode === 'reference'
        ? undefined
        : mode === 'full'
          ? text
          : renderHandoffSummary(compressDocument(text), `${name}/${kind}`)
      bundleInputs.push({
        kind,
        path: record.path,
        digest: `sha256:${record.sha256}`,
        reason: DOCUMENT_REASONS[kind],
        mode,
        ...(content === undefined ? {} : { content }),
      })
    }
  }
  return compileContextBundle({
    change: name,
    from,
    to: target,
    tier: 'strong',
    maxBytes: budgetBytes ?? DEFAULT_BUNDLE_BUDGET,
    inputs: bundleInputs,
  })
}

/**
 * handoff 命令（纯函数 + deps 注入，风格同 task.ts）。
 * fs 缺省真 fs（nodeHandoffFs，integration 走真路径）；mock 层注入 fake HandoffFs 快速回归。
 */
export async function cmdHandoff(
  deps: CliDeps,
  name: string | undefined,
  opts: HandoffOpts,
  fs: HandoffFs = nodeHandoffFs(),
  localeResolver: HandoffLocaleResolver = resolveChangeDocumentLocale,
): Promise<number> {
  if (name === undefined || name === '' || !isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name ?? ''}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  const dir = changeDir(deps.cwd, name)
  let state: PipelineState
  try {
    state = await deps.store.read(dir)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }

  const phase = opts.phase ?? scalarField(state.fields.phase)
  if (opts.bundle) {
    try {
      const bundle = await compileBundle(deps, name, phase, opts.target, opts.budgetBytes, fs)
      deps.io.out(opts.json ? JSON.stringify(bundle) : JSON.stringify(bundle, null, 2))
      return 0
    } catch (error) {
      deps.io.err(`ERROR: ${errMsg(error)}`)
      return 1
    }
  }
  let documentLocale: 'zh-CN' | 'en'
  try {
    documentLocale = await localeResolver(dir)
  } catch (error) {
    deps.io.err(`ERROR: ${errMsg(error)}`)
    return 1
  }
  const result = buildHandoff(
    {
      name,
      phase,
      cwd: deps.cwd,
      changeDirRel: `openspec/changes/${name}`,
      fields: state.fields,
      documentLocale,
    },
    fs,
  )

  if (opts.json) {
    deps.io.out(renderJson(result))
    return 0
  }
  renderText(deps, result)
  return 0
}
