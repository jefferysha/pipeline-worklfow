/**
 * 收件箱选卡逻辑（病灶②的解法核心）——回答"现在哪个 change 在等我决定"。
 * 判据：change 未归档 且 其 phase ∈ review_phases（explore/spec/verify，即三门/复核相位）。
 * 纯函数，供 InboxView 与真组件测试共用。
 */
import type { ChangeSnapshot, ProjectSnapshot, Snapshot } from '../types'
import { REVIEW_PHASES } from '../types'

/** 老内核 cmd_get 口径：字面 'null'（init heredoc）或空串都算未设。 */
function truthy(v: string): boolean {
  return v === 'true'
}

/** 单个 change 是否在等我决定（收件箱判据）。 */
export function isAwaitingDecision(c: ChangeSnapshot): boolean {
  if (truthy(c.archived)) return false
  return (REVIEW_PHASES as readonly string[]).includes(c.phase)
}

export interface InboxItem {
  root: string
  change: ChangeSnapshot
}

/**
 * 从整机 snapshot 摘出所有在等决定的 change（跨全部 Project）。
 * 稳定排序：先按 updated_at 倒序（最近变化优先），并列时按 name 升序——收件箱语义"最新等我的事在上"。
 */
export function selectInbox(snapshot: Snapshot | null): InboxItem[] {
  if (!snapshot) return []
  const items: InboxItem[] = []
  for (const p of snapshot.projects) {
    if (!p.ok) continue
    for (const c of p.changes) {
      if (isAwaitingDecision(c)) items.push({ root: p.root, change: c })
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

/** 该 change 在等哪一类决定（i18n key 后缀；用于卡片副标题）。 */
export function decisionKind(c: ChangeSnapshot): 'explore' | 'spec' | 'verify' | 'other' {
  if (c.phase === 'explore' || c.phase === 'spec' || c.phase === 'verify') return c.phase
  return 'other'
}

export function projectName(p: ProjectSnapshot): string {
  const parts = p.root.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p.root
}
