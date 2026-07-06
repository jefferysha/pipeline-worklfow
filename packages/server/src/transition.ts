/**
 * transition 域 —— 看板写回端点 POST /api/change/<name>/transition 的转换执行。
 *
 * server 只依赖 kernel（不能 import cli），故本模块自持事件表 + 前置校验 + 副作用，逐条镜像
 * packages/cli/src/commands/transition.ts（BACKLOG #14 盘点表）与 packages/cli/src/events.ts：
 *   · 事件表 = events.ts 逐边；
 *   · 前置校验 = checkEventPreconditions 的 lite 镜像（文件面经注入 fileExists 谓词，缺省降级跳过）；
 *   · 副作用 = applyEventEffects（build_sha 冻结 / verify 结果 / archived）；
 *   · 合法性以 flow 引擎（manifest 单一真相源）为准；全程 store.withLock 闭 TOCTOU。
 * 老仓 dashboard 写回 run_transition 是 subprocess 跑 guard+state.sh；lite 走 kernel 直调（真改盘）。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IllegalTransitionError } from '@pipeline-lite/kernel'
import type { FieldName, FlowEngine, Phase, PipelineState, StateStore } from '@pipeline-lite/kernel'

export interface EventEdge {
  from: Phase
  to: Phase
}

/** 事件 → 转移边表（逐边镜像 cli/src/events.ts）。 */
export const TRANSITION_EVENTS: Record<string, EventEdge> = {
  'open-complete': { from: 'open', to: 'explore' },
  'explore-complete': { from: 'explore', to: 'spec' },
  'spec-complete': { from: 'spec', to: 'build' },
  'build-complete': { from: 'build', to: 'verify' },
  'verify-pass': { from: 'verify', to: 'ship' },
  'verify-fail': { from: 'verify', to: 'build' },
  'ship-complete': { from: 'ship', to: 'archive' },
  archived: { from: 'archive', to: 'archive' },
}

export function eventEdge(event: string): EventEdge | undefined {
  return Object.prototype.hasOwnProperty.call(TRANSITION_EVENTS, event)
    ? TRANSITION_EVENTS[event]
    : undefined
}

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

/** 老内核 cmd_get 口径：字面 'null'（init heredoc）或空串都算未设。 */
function isUnset(v: string): boolean {
  return v === '' || v === 'null'
}

class PreconditionError extends Error {
  constructor(public readonly lines: string[]) {
    super(lines[0] ?? 'transition 前置校验不满足')
  }
}
class NotFoundError extends Error {}
class ConflictError extends Error {}

/** 事件前置校验（cli checkEventPreconditions 的 lite 镜像，文案逐字对齐老仓）。 */
async function checkPreconditions(
  deps: TransitionDeps,
  root: string,
  event: string,
  state: PipelineState,
): Promise<void> {
  const f = (k: FieldName): string => fstr(state, k)
  const fileExists = (p: string): boolean => (deps.fileExists ? deps.fileExists(root, p) : true)

  switch (event) {
    case 'explore-complete': {
      const dd = f('design_doc')
      if (isUnset(dd) || !fileExists(dd)) {
        throw new PreconditionError([`ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=${dd})`])
      }
      break
    }
    case 'spec-complete': {
      const tr = f('track')
      if (tr !== 'pm') {
        const pl = f('plan')
        if (isUnset(pl) || !fileExists(pl)) {
          throw new PreconditionError([`ERROR: ${tr} track spec-complete 要求 plan 字段非空且文件存在 (当前=${pl})`])
        }
      }
      break
    }
    case 'build-complete': {
      const bm = f('build_mode')
      const iso = f('isolation')
      if (isUnset(bm)) throw new PreconditionError(['ERROR: build_mode 必须设置'])
      if (isUnset(iso)) throw new PreconditionError(['ERROR: isolation 必须设置'])
      if (iso !== 'branch' && iso !== 'worktree') {
        throw new PreconditionError([`ERROR: 非法值 '${iso}'，允许: branch worktree`])
      }
      if (f('preset') === 'full' && bm === 'direct' && f('direct_override') !== 'true') {
        throw new PreconditionError(['ERROR: full workflow 使用 build_mode=direct 必须显式设 direct_override=true'])
      }
      break
    }
    case 'verify-pass': {
      const vr = f('verification_report')
      if (isUnset(vr) || !fileExists(vr)) {
        throw new PreconditionError([`ERROR: verify-pass 要求 verification_report 字段非空且文件存在 (当前=${vr})`])
      }
      const bs = f('branch_status')
      if (bs !== 'handled') {
        throw new PreconditionError([`ERROR: verify-pass 要求 branch_status=handled (当前=${bs})`])
      }
      const tr = f('track')
      if (tr !== 'pm') {
        const ar = f('agent_review_result')
        if (ar !== 'pass') throw new PreconditionError([`ERROR: ${tr} track 要求 agent_review_result=pass (当前=${ar})`])
        const cr = f('codex_review_result')
        if (cr !== 'pass') throw new PreconditionError([`ERROR: ${tr} track 要求 codex_review_result=pass (当前=${cr})`])
      }
      const bsha = f('build_sha')
      const head = (await deps.gitHeadSha?.(root))?.trim() ?? ''
      if (bsha !== '' && bsha !== 'null' && head !== '' && bsha !== head) {
        throw new PreconditionError([
          `ERROR: verify-pass 要求 HEAD==build_sha（build 后产物被改未复验）build_sha=${bsha} HEAD=${head}`,
          '  修复：要么把改动并入复验（重跑 build→verify），要么 verify-fail 回退后重新 build-complete 冻结新 SHA',
        ])
      }
      break
    }
    default:
      break
  }
}

/** 事件专属副作用（cli applyEventEffects 镜像）。 */
async function applyEffects(deps: TransitionDeps, root: string, event: string, state: PipelineState): Promise<void> {
  switch (event) {
    case 'build-complete': {
      const sha = (await deps.gitHeadSha?.(root))?.trim() ?? ''
      if (sha) state.fields.build_sha = sha
      break
    }
    case 'verify-pass':
      state.fields.verify_result = 'pass'
      state.fields.verified_at = deps.clock()
      break
    case 'verify-fail':
      state.fields.verify_result = 'fail'
      state.fields.build_sha = 'null'
      break
    case 'archived':
      state.fields.archived = 'true'
      state.fields.archived_at = deps.clock()
      break
    default:
      break
  }
}

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
  try {
    const result = await deps.store.withLock(dir, async () => {
      const state = await deps.store.read(dir)
      const current = fstr(state, 'phase')
      if (current !== edge.from) {
        throw new ConflictError(`event '${event}' 与当前 phase '${current}' 不匹配（期望来自 '${edge.from}'）`)
      }
      await checkPreconditions(deps, root, event, state)
      const r = deps.flow.transition(state, edge.to, deps.clock)
      await applyEffects(deps, root, event, r.state)
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
