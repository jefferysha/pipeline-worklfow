/**
 * gateEvidence（评审 P0-1 核心）—— 真机评审证实 snapshot 每帧送 38 个字段前端只渲染 6 个，
 * verify 门放行要看的 verify_result/agent_review_result/codex_review_result/verification_report/
 * build_sha 全在 ChangeSnapshot.fields 里从未被渲染。本函数把"当前阶段该出示哪些证据"收敛成
 * 纯函数（零 IO 零 React）——Task 7（详情卡+行内 chips）直接消费这份契约，自己不判断是否该渲染
 * （archived/非 gate 阶段由调用方自行决定要不要调用/展示，见 inbox.ts isAwaitingDecision）。
 */
import type { ChangeSnapshot } from '../types'
import { DEFAULT_RULES, type StepOutputRules, type WorkflowRules } from '../model/workflowModel'

export interface EvidenceChip {
  key: string // 字段名，mono 展示
  value: string // 原值
  tone: 'pass' | 'fail' | 'pending' | 'neutral'
  copyable?: boolean // 路径/sha 类
  /** 终审修复批（契约修正）：路径型字段未设时的占位标记——true 时 value 恒为 ''，展示文案不再
   *  由本纯函数层焊死中文「未产出」，改由消费方（InboxView 证据 chip / ChangeDetailCard
   *  FieldBox）按这个标记走 i18n t('evidence.unset') 渲染，服务两种语言的 UI。 */
  unset?: boolean
}

/**
 * verify 门三轨状态字段（顺序即 chip 出现顺序）。评审修复轮导出：ChangeDetailCard 的 whyText
 * 未过项判据直接消费这份白名单（key ∈ 三轨字段 且 tone !== 'pass'），不再借用 chip.copyable
 * 缺省当"是不是三轨字段"的替身信号——那个替身信号在 verification_report/build_sha 未设时
 * 同样会落在 unsetPlaceholder()（无 copyable、tone pending），会被误判成"未过项"混进三轨
 * 列表（如「build_sha 未过」的假警报，评审 Important-1），而这两个字段根本不属于三轨判定，
 * 产物没产出不等于验证没过。
 */
export const VERIFY_STATUS_FIELDS = ['verify_result', 'agent_review_result', 'codex_review_result'] as const

/** 自定义 workflow / 阶段不在映射表时兜底展示的路径型字段（顺序即 chip 出现顺序）。 */
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

/** 路径型字段未设时的统一占位：key=字段名（不剔除、不替换 key），value=''+unset:true，tone
 *  pending（终审修复批：不再把中文「未产出」焊死在这里，消费方按 unset 走 i18n）。 */
function unsetPlaceholder(key: string): EvidenceChip {
  return { key, value: '', tone: 'pending', unset: true }
}

/**
 * 产物正门（评审 Important-1 + Minor-3 同根修复导出）——返回全部非空路径型字段
 * （design_doc/plan/verification_report/pr_url）的 chip，统一 neutral + copyable。
 * gateEvidence 的"自定义 workflow / rules 缺失 / 阶段不在映射表"兜底分支就是本函数本身
 * （内部共享实现，不是各自维护一份"遍历 PATH_FIELDS 挑非空"的重复逻辑）。ChangeDetailCard
 * 的「产物」区改从这里直接拿候选集，不再靠"传 gateEvidence(c, undefined) 强制走兜底分支"
 * 这种隐式技巧反推同一份结果——那个技巧的副作用是连带把 whyText 的"未过项"判据也带偏了
 * （见 VERIFY_STATUS_FIELDS 的文档注释）。
 */
export function artifactChips(c: ChangeSnapshot): EvidenceChip[] {
  const chips: EvidenceChip[] = []
  for (const key of PATH_FIELDS) {
    const chip = pathChip(c, key)
    if (chip) chips.push(chip)
  }
  return chips
}

/**
 * 按 change 当前 gate 阶段返回应展示的证据 chips。
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
    // phase ∈ {explore, spec}：design_doc/plan 齐查，空的一个不剔除而是替换成 unset pending 条目
    // （展示文案交给消费方 i18n，本层不再写死中文）。
    return ['design_doc', 'plan'].map((key) => pathChip(c, key) ?? unsetPlaceholder(key))
  }

  // 自定义 workflow / rules 缺失 / 阶段不在映射表：兜底就是「产物正门」本身——见 artifactChips。
  return artifactChips(c)
}

/** 一个阶段（step）的产物清单：喂 T8 详情垂直时间线的阶段节点。 */
export interface StageArtifacts {
  step: string
  chips: EvidenceChip[]
}

/**
 * default 工作流的阶段产物映射（T7 决策 B）：调研 design_doc / 规格 plan / 实现 branch+build_sha /
 * 验证四证据（三轨判定 + verification_report——build_sha 归实现阶段，不重复列）。
 * open/ship/archive 无产物声明 → 空清单。字段名全部在 kernel types.ts KNOWN_FIELDS 之内。
 */
const DEFAULT_STAGE_OUTPUTS: Record<string, readonly string[]> = {
  explore: ['design_doc'],
  spec: ['plan'],
  build: ['branch', 'build_sha'],
  verify: [...VERIFY_STATUS_FIELDS, 'verification_report'],
}

/** 单个产物字段 → chip：三轨判定字段如实映射 tone（同 gateEvidence verify 分支口径），
 *  其余按路径型处理——实值 neutral+copyable，未设走 unsetPlaceholder（pending+unset，
 *  展示文案由消费方按 unset 走 i18n，本层不写死中文）。 */
function stageChip(c: ChangeSnapshot, key: string): EvidenceChip {
  if ((VERIFY_STATUS_FIELDS as readonly string[]).includes(key)) {
    const value = fieldStr(c, key)
    return { key, value, tone: statusTone(value) }
  }
  return pathChip(c, key) ?? unsetPlaceholder(key)
}

/**
 * stageArtifacts（T7）—— 每阶段产物清单：按 rules.steps 顺序逐阶段给出 outputs 的实值 chip
 * 与未产出占位。default 走 DEFAULT_STAGE_OUTPUTS 映射（引用相等分支，同 gateEvidence 判据）；
 * 自定义 rules 消费 rulesFromDef 携带的 outputsByStep（T6 时代的裸 rules 无产出声明 → 每步
 * 空清单，不伪造产物）；rules 缺失（定义拉取失败）→ []，消费方回落 artifactChips 产物正门
 * （G17 底线：时间线留白但卡不消失）。
 */
export function stageArtifacts(rules: (WorkflowRules & StepOutputRules) | undefined, c: ChangeSnapshot): StageArtifacts[] {
  if (!rules) return []
  const outputsByStep = rules === DEFAULT_RULES ? DEFAULT_STAGE_OUTPUTS : rules.outputsByStep
  return rules.steps.map((step) => ({
    step,
    chips: (outputsByStep?.[step] ?? []).map((key) => stageChip(c, key)),
  }))
}
