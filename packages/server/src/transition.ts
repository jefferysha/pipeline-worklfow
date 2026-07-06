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
import { join } from 'node:path'
import {
  applyTransitionEffects,
  checkTransitionPreconditions,
  eventEdge,
  IllegalTransitionError,
} from '@pipeline-lite/kernel'
import type { FieldName, FlowEngine, PipelineState, StateStore, TransitionContext } from '@pipeline-lite/kernel'

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

export async function performTransition(
  deps: TransitionDeps,
  root: string,
  name: string,
  event: string,
): Promise<TransitionOutcome> {
  if (!name || !CHANGE_NAME_RE.test(name) || name.includes('..')) {
    return { code: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } }
  }
  const edge = eventEdge(event)
  if (!edge) {
    return { code: 400, body: { ok: false, error: `未知 event: ${event}` } }
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
    const result = await deps.store.withLock(dir, async () => {
      const state = await deps.store.read(dir)
      const current = fstr(state, 'phase')
      if (current !== edge.from) {
        throw new ConflictError(`event '${event}' 与当前 phase '${current}' 不匹配（期望来自 '${edge.from}'）`)
      }
      const violations = await checkTransitionPreconditions(event, state, ctx)
      if (violations) throw new PreconditionError(violations)
      const r = deps.flow.transition(state, edge.to, deps.clock)
      await applyTransitionEffects(event, r.state, deps.clock, ctx)
      await deps.store.write(dir, r.state)
      return r
    })
    return { code: 200, body: { ok: true, name, event, from: result.from, to: result.to } }
  } catch (e) {
    if (e instanceof NotFoundError) return { code: 404, body: { ok: false, error: '找不到该 change' } }
    if (e instanceof PreconditionError) return { code: 409, body: { ok: false, error: e.lines[0], detail: e.lines } }
    if (e instanceof ConflictError) return { code: 409, body: { ok: false, error: e.message } }
    if (e instanceof IllegalTransitionError) return { code: 409, body: { ok: false, error: e.message } }
    return { code: 500, body: { ok: false, error: e instanceof Error ? e.message : String(e) } }
  }
}
