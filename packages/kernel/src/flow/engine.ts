/**
 * FlowEngine —— manifest 驱动的相位转换引擎（types.ts::FlowEngine 契约实现）。
 *
 * 语义源（老仓 workflow-plugin/skills/pipeline/scripts/state-transition.sh::cmd_transition）：
 *   · 合法性 = 查 manifest 转移表（老内核 manifest_transitions | awk 查表；此处 transitions[from]）。
 *   · 成功转换只写三字段：phase / phase_status / updated_at（其余事件体副作用属 CLI 层）。
 *   · phase_status：默认 pending；回退边（verify-fail）→ in_progress；终态自环（archived）→ done。
 *     lite 以「相位序」泛化：目标序 < 当前序 = 回退边；from === to = 终态自环。
 *   · review 相位判定真读 manifest.reviewPhases —— 构造性修复老内核 state-transition.sh
 *     曾硬编码 explore/spec/verify 的欠账（老 manifest.yaml:78-80 自注「仅半接线」）。
 */
import { IllegalTransitionError } from '../types.js'
import type { FieldName, FlowEngine, GuardContext, GuardResult, ManifestData, Phase, PipelineState, TransitionResult } from '../types.js'
import { evaluateGuard } from './guard.js'

/** review-gate 判定面：CLI 据此识别当前 phase 是否需要在其出口消费人工确认 receipt（CONTRACT §2） */
export interface ReviewGate {
  isReviewPhase(phase: Phase): boolean
}

/**
 * 缺省时钟（唯一的 new Date() 落点，CONTRACT §5.6）：ISO8601 UTC 秒级，
 * 对齐老内核 `date -u +%Y-%m-%dT%H:%M:%SZ`（无毫秒）。测试/CLI 经 transition 的 clock 参数注入。
 */
function defaultClock(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function createFlowEngine(manifest: ManifestData): FlowEngine & ReviewGate {
  const phaseIndex = new Map<Phase, number>(manifest.phases.map((p, i) => [p, i]))
  const reviewSet = new Set<Phase>(manifest.reviewPhases)

  function legalTransitions(phase: Phase): readonly Phase[] {
    return manifest.transitions[phase] ?? []
  }

  function transition(state: PipelineState, to: Phase, clock?: () => string): TransitionResult {
    const rawFrom = state.fields.phase
    const from = (typeof rawFrom === 'string' ? rawFrom : '') as Phase
    if (!phaseIndex.has(from) || !legalTransitions(from).includes(to)) {
      throw new IllegalTransitionError(from, to)
    }

    // phase_status：终态自环 → done；回退边 → in_progress；前向 → pending（老内核事件体语义泛化）
    let phaseStatus = 'pending'
    if (from === to) phaseStatus = 'done'
    else if ((phaseIndex.get(to) ?? -1) < (phaseIndex.get(from) ?? -1)) phaseStatus = 'in_progress'

    // 不 mutate 输入：浅拷贝 fields，只改契约允许的三字段；opaqueTail 原样带过
    const fields = { ...state.fields } as Record<FieldName, string | string[]>
    fields.phase = to
    fields.phase_status = phaseStatus
    fields.updated_at = (clock ?? defaultClock)()

    return { from, to, state: { fields, opaqueTail: state.opaqueTail } }
  }

  function guardCheck(state: PipelineState, ctx?: GuardContext): GuardResult {
    return evaluateGuard(state, ctx)
  }

  function isReviewPhase(phase: Phase): boolean {
    return reviewSet.has(phase)
  }

  return { manifest, legalTransitions, transition, guardCheck, isReviewPhase }
}
