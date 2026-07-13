/**
 * transition 域 —— 看板写回端点 POST /api/change/<name>/transition 的转换执行。
 *
 * 事件表 + 前置校验 + 副作用是 **kernel 单一真相源**（BACKLOG #25b / GOAL B2 单一真相源原则）——
 * 上提到 @pipeline-lite/kernel（flow/transition-table.ts），cli 与 server 共消费、不再各持镜像
 * （#25 报告点名的 cli/server 重复真相源已消除）。本模块是 kernel 单源的 server 接线壳：
 *   · 事件表 / eventEdge —— re-export kernel（server/index.ts 对外沿用同名）；
 *   · 前置校验 / 副作用 —— 把 TransitionDeps 的 fs/git 原语绑成 TransitionContext 注入 kernel 纯逻辑，
 *     再映射成看板写回端点的 HTTP code + JSON body；全程 store.withLock 闭 TOCTOU。
 * 老仓 dashboard 写回 run_transition 是 subprocess 跑 guard+state.sh；lite 走 kernel 直调（真改盘）。
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  applyStepTransition,
  applyTransitionEffects,
  checkTransitionPreconditions,
  eventEdge,
  HISTORY_FILE,
  IllegalTransitionError,
  loadWorkflow,
  planStepTransition,
  resolveWorkflowName,
} from '@pipeline-lite/kernel'
import type { FieldName, FlowEngine, HistoryEntry, HistoryWriter, PipelineState, StateStore, TransitionContext } from '@pipeline-lite/kernel'

// 事件 → 转移边表：re-export kernel 单一真相源（server/index.ts 对外沿用同名）。
export { TRANSITION_EVENTS, eventEdge } from '@pipeline-lite/kernel'
export type { EventEdge } from '@pipeline-lite/kernel'

export interface TransitionDeps {
  store: StateStore
  flow: FlowEngine
  clock: () => string
  /** 相对项目根的文件存在谓词（事件前置校验用；缺省 = 降级跳过文件面，同 lite/GUARD-RULES §7.2）。 */
  fileExists?: (root: string, relPath: string) => boolean
  /** `git rev-parse HEAD`（build-complete 冻结 SHA + verify-pass barrier；缺省跳过 SHA 面）。 */
  gitHeadSha?: (cwd: string) => Promise<string>
  /**
   * .pipeline-history.jsonl 记账（G20 / v5-T1）：转换成功后追加一行，形状对齐 CLI 侧
   * cli/commands/transition.ts 的既有口径——kind='transition' + raw=触发它的 event 名
   * （「transition-kind 的 raw = event」不变式）。best-effort：写失败仅 WARN 走 stderr，
   * 绝不影响主写已成功的 200（同 server.ts POST /api/changes 的 kind=init 记账语义）。
   * guard/前置校验拒绝的转换在 withLock 内即抛错，天然零记账。缺省 = 不记账（测试可不注入）。
   */
  history?: HistoryWriter
}

export interface TransitionOutcome {
  code: number
  body: Record<string, unknown>
}

const CHANGE_NAME_RE = /^[a-zA-Z0-9_-]+$/

function fstr(state: PipelineState, k: FieldName): string {
  const v = state.fields[k]
  return Array.isArray(v) ? v.join(',') : (v ?? '')
}

class PreconditionError extends Error {
  constructor(public readonly lines: string[]) {
    super(lines[0] ?? 'transition 前置校验不满足')
  }
}
class NotFoundError extends Error {}
class ConflictError extends Error {}
class UnknownEventError extends Error {}

export async function performTransition(
  deps: TransitionDeps,
  root: string,
  name: string,
  event: string,
): Promise<TransitionOutcome> {
  if (!name || !CHANGE_NAME_RE.test(name) || name.includes('..')) {
    return { code: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } }
  }
  const dir = join(root, 'openspec', 'changes', name)
  if (!existsSync(join(dir, '.pipeline.yaml'))) {
    return { code: 404, body: { ok: false, error: '找不到该 change（无 .pipeline.yaml）' } }
  }
  // kernel 单源注入面：把 server 的 (root,path)/(cwd) 签名绑成已锚定项目根的 TransitionContext。
  const ctx: TransitionContext = {
    fileExists: deps.fileExists ? (p: string): boolean => deps.fileExists!(root, p) : undefined,
    gitHeadSha: deps.gitHeadSha ? (): Promise<string> => deps.gitHeadSha!(root) : undefined,
  }
  try {
    const result = await deps.store.withLock(dir, async (): Promise<{ from: string; to: string }> => {
      const state = await deps.store.read(dir)
      // 双轨分岔（对齐 cli/commands/transition.ts 的同名逻辑；'' 历史遗留兜 'default'——习语
      // 单源在 kernel resolveWorkflowName）：default 走 kernel 固定事件表原链路一行不改；非
      // default 的「解析 step/找边/评 guard」编排在 kernel planStepTransition 单源（G17 端到端
      // 补全——UI 分组看板发出的自定义 event 此前会被下面的固定事件表挡成 400），本文件只做
      // kind→HTTP 错误分类映射（消息逐字保持）。响应形状两轨一致（D4：端点形状零改动）。
      const workflowName = resolveWorkflowName(state)
      if (workflowName !== 'default') {
        const wf = loadWorkflow(root, workflowName)
        if (!wf) throw new ConflictError(`workflow '${workflowName}' 未找到（期望 .pipeline/workflows/${workflowName}.yaml）`)
        const plan = planStepTransition(wf, state, event, { changeDirAbs: dir })
        if (!plan.ok) {
          if (plan.kind === 'step-not-in-graph') throw new ConflictError(`step '${plan.stepId}' 不在 workflow '${workflowName}' 里`)
          if (plan.kind === 'event-unsupported') {
            const available = plan.available.join(', ') || '(无)'
            throw new ConflictError(`step '${plan.stepId}' 不支持 event '${event}'；该 step 支持：${available}`)
          }
          throw new PreconditionError([`step '${plan.stepId}' guard 未通过`, ...plan.failures])
        }
        await deps.store.write(dir, applyStepTransition(state, plan.to, deps.clock))
        return { from: plan.from, to: plan.to }
      }

      const edge = eventEdge(event)
      if (!edge) throw new UnknownEventError(`未知 event: ${event}`)
      const current = fstr(state, 'phase')
      if (current !== edge.from) {
        throw new ConflictError(`event '${event}' 与当前 phase '${current}' 不匹配（期望来自 '${edge.from}'）`)
      }
      const violations = await checkTransitionPreconditions(event, state, ctx)
      if (violations) throw new PreconditionError(violations)
      const r = deps.flow.transition(state, edge.to, deps.clock)
      await applyTransitionEffects(event, r.state, deps.clock, ctx)
      await deps.store.write(dir, r.state)
      return { from: r.from, to: r.to }
    })
    // history 记账在锁外（只有成功转换才走到这里；被拒的在上面抛错短路）——两条 workflow
    // 分岔（default / 自定义）共用这一处，保证两轨记录形状一致。
    if (deps.history) {
      try {
        await deps.history.append(dir, {
          ts: deps.clock(),
          kind: 'transition',
          from: result.from,
          to: result.to,
          raw: event, // 老仓 transitions_history.event 对位（与 cli/commands/transition.ts、legacy.ts 导入映射同口径）
        })
      } catch (e) {
        process.stderr.write(`WARN: history 写入失败: ${e instanceof Error ? e.message : String(e)}\n`)
      }
    }
    return { code: 200, body: { ok: true, name, event, from: result.from, to: result.to } }
  } catch (e) {
    if (e instanceof UnknownEventError) return { code: 400, body: { ok: false, error: e.message } }
    if (e instanceof NotFoundError) return { code: 404, body: { ok: false, error: '找不到该 change' } }
    if (e instanceof PreconditionError) return { code: 409, body: { ok: false, error: e.lines[0], detail: e.lines } }
    if (e instanceof ConflictError) return { code: 409, body: { ok: false, error: e.message } }
    if (e instanceof IllegalTransitionError) return { code: 409, body: { ok: false, error: e.message } }
    return { code: 500, body: { ok: false, error: e instanceof Error ? e.message : String(e) } }
  }
}

/**
 * 读 changeDir/.pipeline-history.jsonl → 按 ts 升序的 HistoryEntry 数组（G21 / v5-T1，
 * GET /api/change/:name/history 数据源，供详情卡阶段时间线消费）。
 * 只读 JSONL 侧文件——legacy opaqueTail 里的 transitions_history 不合并读（决议登记 #10：
 * 老 change 时间线由前端显示「早期记录不可用」）。宽容读：文件缺失 → []；损坏行（非 JSON /
 * 非对象 / 缺 ts）逐行跳过不 500——读端点面对历史文件的任何局部污染都应尽量交付可用部分。
 */
export async function readChangeHistory(changeDir: string): Promise<HistoryEntry[]> {
  let text: string
  try {
    text = await readFile(join(changeDir, HISTORY_FILE), 'utf8')
  } catch {
    return [] // 文件不存在（还没任何记账）→ 空时间线，不是错误
  }
  const entries: HistoryEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { ts?: unknown }).ts === 'string') {
        entries.push(parsed as HistoryEntry)
      }
    } catch {
      /* 损坏行跳过（宽容读） */
    }
  }
  // ISO-8601 字符串序 = 时间序；Array#sort 稳定，同 ts 记录保持写入相对顺序。
  entries.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
  return entries
}
