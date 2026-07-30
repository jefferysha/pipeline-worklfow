/**
 * 收件箱选卡逻辑（病灶②的解法核心）——回答"现在哪个 change 在等我决定"。
 * T7 准入修订（v5 决策 B）：判据从「gate 阶段就进」（G17 的 gate === 'review' 泛化）改为
 * 「人现在能拍板」——直接消费 progressModel 的五态判定（同源谓词，口径不与进度视图漂移）：
 *   · state === 'gate'：gate 阶段且证据/产出齐、或 gate 无自动证据（自定义门无产出声明）、
 *     或 automation=paused（跑完停住等放行）→ 进；
 *   · state === 'failed'：automation ∈ {failed, conflict}，人要拍板重试/放弃 → 进；
 *   · state === 'agent'（含缺产出的 gate 卡——判给进度「等 agent 补产出」）/ running /
 *     queued → 不进。
 * currentRoot 语境（D5 项目切换器语义）：非空 → 只看当前项目，与 AFK/workflow 编辑器对齐；
 * 空串 → 全部项目聚合（Task 5 契约，G19③ 由 Task 8 落地到 selectInbox）。
 * 纯函数，供 InboxView / App（导航徽章计数）与真组件测试共用。
 */
import type { ChangeSnapshot, ProjectSnapshot, Snapshot } from '../types'
import { rulesKey, snapshotRulesKey, type WorkflowRules } from '../model/workflowModel'
import { changeProgressState, type ProgressRules } from '../model/progressModel'
import { changeWorkflow } from '../model/changeModel'
import { isProjectNavigable } from '../state/projectSelectionModel'
export { changeWorkflow, decisionKind } from '../model/changeModel'

/** 老内核 cmd_get 口径：字面 'null'（init heredoc）或空串都算未设。 */
function truthy(v: string): boolean {
  return v === 'true'
}

/**
 * 单个 change 是否在等我决定（T7 起 = 人现在能拍板，判据见文件头）。
 * rules 缺失（自定义 workflow 定义拉取失败）→ 阶段判不了门归 agent 不误报（路径字段非空也
 * 不进——交叉场景），该卡的可见性兜底在进度视图（G17 底线：卡不消失）；automation 的
 * paused/failed/conflict 判定不依赖 rules，照常进。archived 一票否决（决议 #5）。
 */
export function isAwaitingDecision(c: ChangeSnapshot, rules: ProgressRules | undefined): boolean {
  if (truthy(c.archived)) return false
  const state = changeProgressState(c, rules)
  return state === 'gate' || state === 'failed'
}

export interface InboxItem {
  root: string
  change: ChangeSnapshot
}

/**
 * 从 snapshot 摘出在等决定的 change。currentRoot 非空 → 只看该项目（逐字保留 G17 原有行为）；
 * currentRoot===''（Task 5 的聚合语境契约，G19③）→ 遍历全部 ok 项目，每条 InboxItem 仍各自
 * 带自己的 root（调用方据此渲染项目名/查各自 rules）。
 * rules 第三参键从 Task 8 起是 rulesKey(root,wf)（不再是裸 wf 名）——同名自定义 workflow 出现
 * 在不同项目下不会互相覆盖（旧键格式下两个项目都叫 release-train 会共享同一个 Map 条目，后写
 * 覆盖先写，误判其中一个项目的门语义）。
 * 稳定排序：先按 updated_at 倒序（最近变化优先），并列时按 name 升序（聚合时不额外按 root 分组
 * ——time-desc 是收件箱"最近发生的事排前面"这条既有设计的自然延伸，多项目共享同一条时间轴）。
 */
export function selectInbox(
  snapshot: Snapshot | null,
  currentRoot: string,
  rulesByKey: ReadonlyMap<string, WorkflowRules>,
): InboxItem[] {
  if (!snapshot) return []
  const items: InboxItem[] = []
  for (const p of snapshot.projects) {
    if (!isProjectNavigable(p)) continue
    if (currentRoot !== '' && p.root !== currentRoot) continue
    for (const c of p.changes) {
      const rules = rulesByKey.get(snapshotRulesKey(p.root, c.workflowPlanFingerprint))
        ?? rulesByKey.get(rulesKey(p.root, changeWorkflow(c)))
        ?? c.workflowRules
      if (isAwaitingDecision(c, rules)) items.push({ root: p.root, change: c })
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

export function projectName(p: ProjectSnapshot): string {
  const parts = p.root.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p.root
}
