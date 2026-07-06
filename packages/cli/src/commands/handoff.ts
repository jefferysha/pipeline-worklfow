/**
 * handoff 子命令 —— 上下文压缩（BACKLOG #30 / GOAL B13·D11：对标 Comet CONTEXT-COMPRESSION）。
 *
 * `pipeline handoff <name> [--phase p] [--json]`：对指定 change 的当前相位产出文档
 * （design_doc / plan / verification_report 指向的路径 + change 目录内 proposal/design/tasks.md）
 * 做**确定性**结构化压缩，输出下游 handoff 摘要 + 压缩率。零 LLM（纯规则，可测可 oracle）。
 * stdout：压缩摘要（下游消费的产物）+ 压缩率行；--json 结构化信封。exit：非法名/状态缺失=1，否则 0。
 *
 * 接线备注（收编前的临时桥，同 loops.ts / task.ts 先例）：kernel 根 barrel 尚未 re-export
 * compress/（barrel 归主会话），故此处用相对桥直取 kernel compress 源
 * （../../../kernel/src/compress/index.js，tsc -b/vitest/esbuild 三路已验证的模式）。
 * 主会话收编时：① kernel src/index.ts 追加 `export * from './compress/index.js'`；
 * ② 本文件相对桥换 '@pipeline-lite/kernel'；③ program.ts 注册 `handoff` 命令；
 * ④ （可选）transition.ts 进相位副作用里调 buildHandoff 落 .breadcrumb/摘要（见报告接线清单）。
 */
import {
  buildHandoff,
  nodeHandoffFs,
  type HandoffFs,
  type HandoffResult,
} from '@pipeline-lite/kernel'
import type { PipelineState } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'

export type { HandoffFs } from '@pipeline-lite/kernel'

export interface HandoffOpts {
  json?: boolean
  /** 覆写要压缩的相位产出（缺省 = change 当前 phase） */
  phase?: string
}

function scalarField(v: string | string[] | undefined): string {
  if (v === undefined) return ''
  return Array.isArray(v) ? v.join(',') : v
}

/** --json 结构化信封（下游可编程消费；对 Comet 纯文本压缩的超越点：结构化 + 逐文档量化）。 */
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
  deps.io.out(`# Handoff: ${result.name} (phase ${result.phase})`)
  if (result.docs.length === 0) {
    deps.io.out('# No handoff documents found for this phase.')
    deps.io.err(`[HANDOFF] ${result.name} @ ${result.phase}: 无可压缩产出文档（相位无 upstream doc 或文件缺失/空）`)
    return
  }
  const agg = result.aggregate
  deps.io.out(
    `# Compression: ${pct(agg.ratio)}% (${agg.originalChars} → ${agg.compressedChars} chars, ${result.docs.length} doc(s))`,
  )
  for (const d of result.docs) {
    deps.io.out('')
    deps.io.out(`## ${d.path} — ${pct(d.doc.stats.ratio)}% (${d.doc.stats.originalChars} → ${d.doc.stats.compressedChars} chars)`)
    for (const line of d.summary.split('\n')) deps.io.out(line)
  }
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
  const result = buildHandoff(
    {
      name,
      phase,
      cwd: deps.cwd,
      changeDirRel: `openspec/changes/${name}`,
      fields: state.fields,
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
