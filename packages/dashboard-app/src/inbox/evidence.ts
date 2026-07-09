/**
 * gateEvidence（评审 P0-1 核心）—— 真机评审证实 snapshot 每帧送 38 个字段前端只渲染 6 个，
 * verify 门放行要看的 verify_result/agent_review_result/codex_review_result/verification_report/
 * build_sha 全在 ChangeSnapshot.fields 里从未被渲染。本函数把"当前相位该出示哪些证据"收敛成
 * 纯函数（零 IO 零 React）——Task 7（详情卡+行内 chips）直接消费这份契约，自己不判断是否该渲染
 * （archived/非 gate 相位由调用方自行决定要不要调用/展示，见 inbox.ts isAwaitingDecision）。
 */
import type { ChangeSnapshot } from '../types'
import { DEFAULT_RULES, type WorkflowRules } from '../model/workflowModel'

export interface EvidenceChip {
  key: string // 字段名，mono 展示
  value: string // 原值
  tone: 'pass' | 'fail' | 'pending' | 'neutral'
  copyable?: boolean // 路径/sha 类
}

/** verify 门三轨状态字段（顺序即 chip 出现顺序）。 */
const VERIFY_STATUS_FIELDS = ['verify_result', 'agent_review_result', 'codex_review_result'] as const

/** 自定义 workflow / 相位不在映射表时兜底展示的路径型字段（顺序即 chip 出现顺序）。 */
const PATH_FIELDS = ['design_doc', 'plan', 'verification_report', 'pr_url'] as const

/** 老内核 cmd_get 口径：字面 'null'（init heredoc）或空串都算未设（同 packages/kernel/src/flow/transition-table.ts 的 isUnset）。 */
function isUnset(v: string): boolean {
  return v === '' || v === 'null'
}

/** fields 值可能是 string[]（其它字段类型），非字符串一律当未设处理——本文件只关心字符串型证据字段。 */
function fieldStr(c: ChangeSnapshot, key: string): string {
  const v = c.fields[key]
  return typeof v === 'string' ? v : ''
}

function statusTone(v: string): 'pass' | 'fail' | 'pending' {
  if (v === 'pass') return 'pass'
  if (v === 'fail') return 'fail'
  return 'pending' // 空/'null'/'pending'/其它未识别值一律 pending（gate 语义：非 pass 即未过）
}

/** 非空则产出 neutral+copyable 的路径型 chip；空/'null' 返回 null（调用方决定剔除还是替换占位）。 */
function pathChip(c: ChangeSnapshot, key: string): EvidenceChip | null {
  const value = fieldStr(c, key)
  if (isUnset(value)) return null
  return { key, value, tone: 'neutral', copyable: true }
}

/** 路径型字段未设时的统一占位：key=字段名（不剔除、不替换 key），value='未产出'，tone pending。 */
function unsetPlaceholder(key: string): EvidenceChip {
  return { key, value: '未产出', tone: 'pending' }
}

/**
 * 按 change 当前 gate 相位返回应展示的证据 chips。
 * 分支判据（评审收紧后）：rules === DEFAULT_RULES（严格引用相等）且 phase ∈ {verify, explore,
 * spec} 映射表内 → 按 phase 走对应的表驱动规则；其余情况（自定义 rules / rules 未提供
 * / phase 不在表内）一律走"自定义 workflow"兜底分支（只出非空路径字段，空的剔除）——
 * rules===undefined 不再被误判为"非自定义"从而误入表驱动分支。
 */
export function gateEvidence(c: ChangeSnapshot, rules: WorkflowRules | undefined): EvidenceChip[] {
  const inMappingTable = c.phase === 'verify' || c.phase === 'explore' || c.phase === 'spec'

  if (rules === DEFAULT_RULES && inMappingTable) {
    if (c.phase === 'verify') {
      const chips: EvidenceChip[] = VERIFY_STATUS_FIELDS.map((key) => {
        const value = fieldStr(c, key)
        return { key, value, tone: statusTone(value) }
      })
      chips.push(pathChip(c, 'verification_report') ?? unsetPlaceholder('verification_report'))
      chips.push(pathChip(c, 'build_sha') ?? unsetPlaceholder('build_sha'))
      return chips
    }
    // phase ∈ {explore, spec}：design_doc/plan 齐查，空的一个不剔除而是替换成"未产出" pending 条目。
    return ['design_doc', 'plan'].map((key) => pathChip(c, key) ?? unsetPlaceholder(key))
  }

  // 自定义 workflow / rules 缺失 / 相位不在映射表：全部路径型字段里非空的才出 chip，空的直接剔除。
  const chips: EvidenceChip[] = []
  for (const key of PATH_FIELDS) {
    const chip = pathChip(c, key)
    if (chip) chips.push(chip)
  }
  return chips
}
