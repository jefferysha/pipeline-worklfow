/**
 * transition 单一真相源（BACKLOG #25b / GOAL B2 单一真相源原则）——事件 → 转移边表 +
 * 事件前置校验 + 事件专属副作用的纯逻辑，从 cli/server 曾各持一份的逐条镜像上提为唯一真相源
 * （#25 报告点名的重复真相源：packages/cli/src/events.ts + commands/transition.ts 与
 * packages/server/src/transition.ts 逐条对位）。
 *
 * 语义源（老仓 workflow-plugin，严格只读）：
 *   · 事件表 = skills/pipeline/scripts/manifest.py::_DEFAULT_TRANSITIONS（前向 7 边 + verify-fail
 *     回退边 + archive 终态自环）。
 *   · 前置校验 + 副作用 = skills/pipeline/scripts/state-transition.sh cmd_transition case 块
 *     （行号见 packages/cli/src/commands/transition.ts 顶部盘点表；文案逐字对齐老仓）。
 *
 * 设计（同 BACKLOG #12 guard 的做法）：纯函数 + 注入面 TransitionContext。文件存在性 / git HEAD
 * 由调用方绑定项目根后注入；未注入某能力则对应校验/副作用降级跳过（GUARD-RULES §7.2 同款口径）。
 * IO（build-complete 未取到 HEAD 的 WARN、错误行落 stderr、锁/写盘/breadcrumb/历史）留调用方，
 * 本模块只做纯逻辑：校验返回违反行、副作用就地改 state.fields + 返回 IO 信号。
 *
 * 集成接缝：本表只做「事件名 → 目标相位」的命名翻译 + 事件声明 from 相位前置校验；转移「合法性」
 * 仍以 FlowEngine.transition（manifest 单一真相源）为准。kernel 零第三方依赖。
 */
import type { FieldName, Phase, PipelineState } from '../types.js'

export interface EventEdge {
  from: Phase
  to: Phase
}

/** 事件 → 转移边表（逐边对齐老仓 _DEFAULT_TRANSITIONS）。 */
export const TRANSITION_EVENTS = {
  'open-complete': { from: 'open', to: 'explore' },
  'explore-complete': { from: 'explore', to: 'spec' },
  'spec-complete': { from: 'spec', to: 'build' },
  'build-complete': { from: 'build', to: 'verify' },
  'verify-pass': { from: 'verify', to: 'ship' },
  'verify-fail': { from: 'verify', to: 'build' },
  'ship-complete': { from: 'ship', to: 'archive' },
  archived: { from: 'archive', to: 'archive' },
} as const satisfies Record<string, EventEdge>

export type EventName = keyof typeof TRANSITION_EVENTS

export function eventEdge(event: string): EventEdge | undefined {
  return Object.prototype.hasOwnProperty.call(TRANSITION_EVENTS, event)
    ? TRANSITION_EVENTS[event as EventName]
    : undefined
}

/**
 * 事件前置校验 / 副作用的注入面（同 GuardContext 做法，全部可选）。
 * 路径 / cwd 由调用方绑定项目根：
 *   · cli   —— fileExists = guardCtx(name)?.fileExists；gitHeadSha = deps.gitHeadSha。
 *   · server —— fileExists = (p) => deps.fileExists(root, p)；gitHeadSha = () => deps.gitHeadSha(root)。
 * 未注入某能力时依赖它的校验/副作用降级跳过（文件面视为存在；SHA 面跳过）。
 */
export interface TransitionContext {
  /** 文件存在（相对项目根，已绑定）；缺省 = 降级跳过文件面（视为存在），字段面不降级。 */
  fileExists?: (relPath: string) => boolean
  /** `git rev-parse HEAD` stdout（trim 前；已绑定 cwd）；缺省 = 跳过 SHA 面。 */
  gitHeadSha?: () => Promise<string>
}

/** applyTransitionEffects 的 IO 信号：build-complete 未取到 git HEAD → CLI 据此 emit WARN。 */
export interface TransitionEffectResult {
  /** build-complete 事件且 HEAD 取不到（sha 空）→ true，build_sha 未冻结；其它事件恒 false。 */
  buildShaMissing: boolean
}

/** 字段值 → 字符串（列表按逗号连接；缺省空串），对齐 cli render.str / server fstr。 */
function fstr(state: PipelineState, k: FieldName): string {
  const v = state.fields[k]
  return Array.isArray(v) ? v.join(',') : (v ?? '')
}

/** 老内核 cmd_get 口径：字面 'null'（init heredoc）或空串都算未设。 */
function isUnset(v: string): boolean {
  return v === '' || v === 'null'
}

/**
 * 事件前置校验（老仓 state-transition.sh case 块校验体）。满足 → null；不满足 → 违反的
 * stderr 行数组（逐字对齐老仓，首错优先序）。在锁内、任何 mutation 之前由调用方执行。
 */
export async function checkTransitionPreconditions(
  event: string,
  state: PipelineState,
  ctx?: TransitionContext,
): Promise<string[] | null> {
  const f = (k: FieldName): string => fstr(state, k)
  // 文件面：ctx.fileExists 未注入 → 降级跳过（视为存在），字段面不降级
  const fileExists = (p: string): boolean => (ctx?.fileExists ? ctx.fileExists(p) : true)

  switch (event) {
    case 'explore-complete': {
      const dd = f('design_doc')
      if (isUnset(dd) || !fileExists(dd)) {
        return [`ERROR: explore-complete 要求 design_doc 字段非空且文件存在 (当前=${dd})`]
      }
      break
    }
    case 'spec-complete': {
      // PM Track 可能不需要 plan，frontend/backend 必须（老仓 L132）
      const tr = f('track')
      if (tr !== 'pm') {
        const pl = f('plan')
        if (isUnset(pl) || !fileExists(pl)) {
          return [`ERROR: ${tr} track spec-complete 要求 plan 字段非空且文件存在 (当前=${pl})`]
        }
      }
      break
    }
    case 'build-complete': {
      const bm = f('build_mode')
      const iso = f('isolation')
      if (isUnset(bm)) return ['ERROR: build_mode 必须设置']
      if (isUnset(iso)) return ['ERROR: isolation 必须设置']
      // set 闸之外的纵深防线（老仓 validate_enum；直改 yaml 的脏值在此兜住）
      if (iso !== 'branch' && iso !== 'worktree') {
        return [`ERROR: 非法值 '${iso}'，允许: branch worktree`]
      }
      if (f('preset') === 'full' && bm === 'direct' && f('direct_override') !== 'true') {
        return ['ERROR: full workflow 使用 build_mode=direct 必须显式设 direct_override=true']
      }
      break
    }
    case 'verify-pass': {
      const vr = f('verification_report')
      if (isUnset(vr) || !fileExists(vr)) {
        return [`ERROR: verify-pass 要求 verification_report 字段非空且文件存在 (当前=${vr})`]
      }
      const bs = f('branch_status')
      if (bs !== 'handled') {
        return [`ERROR: verify-pass 要求 branch_status=handled (当前=${bs})`]
      }
      // frontend/backend 还要求 agent + codex 都 pass（老仓 L179-190；pm 豁免）
      const tr = f('track')
      if (tr !== 'pm') {
        const ar = f('agent_review_result')
        if (ar !== 'pass') return [`ERROR: ${tr} track 要求 agent_review_result=pass (当前=${ar})`]
        const cr = f('codex_review_result')
        if (cr !== 'pass') return [`ERROR: ${tr} track 要求 codex_review_result=pass (当前=${cr})`]
      }
      // barrier 校验：verify 审的必须是 build 冻结的那个 SHA（防 build 后偷改未复验）。
      // 仅当 build_sha 非空非 null 且 HEAD 可取时校验；否则退化跳过（ADR 0005）。
      const bsha = f('build_sha')
      const head = (await ctx?.gitHeadSha?.())?.trim() ?? ''
      if (bsha !== '' && bsha !== 'null' && head !== '' && bsha !== head) {
        return [
          `ERROR: verify-pass 要求 HEAD==build_sha（build 后产物被改未复验）build_sha=${bsha} HEAD=${head}`,
          '  修复：要么把改动并入复验（重跑 build→verify），要么 verify-fail 回退后重新 build-complete 冻结新 SHA',
        ]
      }
      break
    }
    default:
      break // 无专属校验的事件（open-complete/ship-complete/自定义相位事件）通行
  }
  return null
}

/**
 * 事件专属副作用（老仓 state-transition.sh case 块 mutation 体）。就地改 state.fields
 * （逐字对齐老仓），返回 IO 信号。锁内、前置校验通过后、写盘前由调用方应用。
 */
export async function applyTransitionEffects(
  event: string,
  state: PipelineState,
  clock: () => string,
  ctx?: TransitionContext,
): Promise<TransitionEffectResult> {
  switch (event) {
    case 'build-complete': {
      const sha = (await ctx?.gitHeadSha?.())?.trim() ?? ''
      if (sha) {
        state.fields.build_sha = sha
        return { buildShaMissing: false }
      }
      // HEAD 取不到（非 git 仓）：build_sha 留原值，交调用方决定是否 WARN
      return { buildShaMissing: true }
    }
    case 'verify-pass':
      state.fields.verify_result = 'pass'
      state.fields.verified_at = clock()
      return { buildShaMissing: false }
    case 'verify-fail':
      state.fields.verify_result = 'fail'
      state.fields.build_sha = 'null'
      return { buildShaMissing: false }
    case 'archived':
      state.fields.archived = 'true'
      state.fields.archived_at = clock()
      return { buildShaMissing: false }
    default:
      return { buildShaMissing: false }
  }
}
