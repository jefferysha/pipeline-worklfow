/**
 * 收件箱选卡逻辑（病灶②的解法核心）——回答"现在哪个 change 在等我决定"。
 * G17 泛化（spec §2.3）：判据从写死的 REVIEW_PHASES 改为「该 change 所属 workflow 的
 * 当前 step gate === 'review'」——自定义 workflow 的复核门从此也进收件箱；default 的
 * 行为逐字不变（DEFAULT_RULES.gateByStep 就是 REVIEW_PHASES 的投影）。
 * currentRoot 语境（D5 项目切换器语义）：只看当前项目，与 AFK/workflow 编辑器对齐。
 * 纯函数，供 InboxView / App（导航徽章计数）与真组件测试共用。
 */
import type { ChangeSnapshot, ProjectSnapshot, Snapshot } from '../types'
import type { WorkflowRules } from '../model/workflowModel'

/** 老内核 cmd_get 口径：字面 'null'（init heredoc）或空串都算未设。 */
function truthy(v: string): boolean {
  return v === 'true'
}

/** 该 change 声明的 workflow 名（未设/空 → 'default'）。 */
export function changeWorkflow(c: ChangeSnapshot): string {
  const wf = c.fields['workflow']
  return typeof wf === 'string' && wf ? wf : 'default'
}

/**
 * 单个 change 是否在等我决定。rules 缺失（自定义 workflow 定义拉取失败）→ false：
 * 收件箱不误报，该卡的可见性兜底在看板错误分组（G17 底线：卡不消失）。
 */
export function isAwaitingDecision(c: ChangeSnapshot, rules: WorkflowRules | undefined): boolean {
  if (truthy(c.archived)) return false
  if (!rules) return false
  return rules.gateByStep[c.phase] === 'review'
}

export interface InboxItem {
  root: string
  change: ChangeSnapshot
}

/**
 * 从 snapshot 摘出 currentRoot 项目里所有在等决定的 change。
 * 稳定排序：先按 updated_at 倒序（最近变化优先），并列时按 name 升序。
 */
export function selectInbox(
  snapshot: Snapshot | null,
  currentRoot: string,
  rulesByWf: ReadonlyMap<string, WorkflowRules>,
): InboxItem[] {
  if (!snapshot) return []
  const items: InboxItem[] = []
  for (const p of snapshot.projects) {
    if (!p.ok || p.root !== currentRoot) continue
    for (const c of p.changes) {
      if (isAwaitingDecision(c, rulesByWf.get(changeWorkflow(c)))) items.push({ root: p.root, change: c })
    }
  }
  items.sort((a, b) => {
    const ua = a.change.updated_at
    const ub = b.change.updated_at
    if (ua !== ub) return ua < ub ? 1 : -1
    return a.change.name < b.change.name ? -1 : a.change.name > b.change.name ? 1 : 0
  })
  return items
}

/** 该 change 在等哪一类决定（i18n key 后缀）：default 三相位保留细分文案，其余（含自定义 step）一律 other。 */
export function decisionKind(c: ChangeSnapshot): 'explore' | 'spec' | 'verify' | 'other' {
  if (changeWorkflow(c) !== 'default') return 'other'
  if (c.phase === 'explore' || c.phase === 'spec' || c.phase === 'verify') return c.phase
  return 'other'
}

export function projectName(p: ProjectSnapshot): string {
  const parts = p.root.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p.root
}
