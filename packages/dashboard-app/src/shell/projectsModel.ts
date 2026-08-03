import { changeWorkflowName, selectProgress } from '../model/progressModel'
import { DEFAULT_RULES, isBuiltinWorkflowName, type WorkflowRules } from '../model/workflowModel'
import { isProjectNavigable } from '../state/projectSelectionModel'
import type { ChangeSnapshot, Snapshot } from '../types'

export type CellState = 'done' | 'current' | 'todo'

export interface PhaseCell {
  phase: string
  label: string
  count: number
  state: CellState
}

export interface ProjectRow {
  root: string
  basename: string
  ok: boolean
  wip: number
  need: number
  running: number
  cells: PhaseCell[]
}

function basenameOf(root: string): string {
  return root.split('/').filter(Boolean).pop() ?? root
}

function phaseLabel(t: (key: string) => string, rules: WorkflowRules, phase: string): string {
  const custom = rules.executionModel === 'phase-manifest' ? undefined : rules.labelByStep?.[phase]
  if (custom) return custom
  const resolved = t(`phases.${phase}`)
  return resolved === `phases.${phase}` ? phase : resolved
}

function dominantRules(
  changes: readonly ChangeSnapshot[],
  _root: string,
  _rulesByKey: ReadonlyMap<string, WorkflowRules>,
): WorkflowRules {
  const byPlan = new Map<string, { count: number; workflow: string }>()
  for (const change of changes) {
    if (change.archived === 'true') continue
    const fingerprint = change.workflowPlanFingerprint
    const current = byPlan.get(fingerprint)
    byPlan.set(fingerprint, { count: (current?.count ?? 0) + 1, workflow: changeWorkflowName(change) })
  }
  let best = ''
  let bestWorkflow = 'default'
  let bestCount = 0
  for (const [fingerprint, candidate] of byPlan) {
    if (candidate.count > bestCount
      || (candidate.count === bestCount && !isBuiltinWorkflowName(bestWorkflow)
        && (isBuiltinWorkflowName(candidate.workflow) || candidate.workflow < bestWorkflow))) {
      best = fingerprint
      bestWorkflow = candidate.workflow
      bestCount = candidate.count
    }
  }
  const selected = changes.find((change) => change.workflowPlanFingerprint === best)
  return selected?.workflowRules ?? DEFAULT_RULES
}

function buildCells(
  changes: readonly ChangeSnapshot[],
  rules: WorkflowRules,
  t: (key: string) => string,
): PhaseCell[] {
  const steps = (rules.steps ?? []).filter((step) => step !== 'archive')
  const byPhase = new Map<string, number>()
  for (const change of changes) {
    if (change.archived === 'true') continue
    byPhase.set(change.phase, (byPhase.get(change.phase) ?? 0) + 1)
  }
  let frontier = -1
  steps.forEach((step, index) => {
    if ((byPhase.get(step) ?? 0) > 0) frontier = index
  })
  return steps.map((step, index) => {
    const count = byPhase.get(step) ?? 0
    const state: CellState = count > 0 ? 'current' : index < frontier ? 'done' : 'todo'
    return { phase: step, label: phaseLabel(t, rules, step), count, state }
  })
}

export function compareProjectRows(left: ProjectRow, right: ProjectRow): number {
  if (left.need !== right.need) return right.need - left.need
  if (left.running !== right.running) return right.running - left.running
  if (left.wip !== right.wip) return right.wip - left.wip
  return left.basename < right.basename ? -1 : left.basename > right.basename ? 1 : 0
}

export function buildProjectRows(
  snapshot: Snapshot | null,
  rulesByKey: ReadonlyMap<string, WorkflowRules>,
  t: (key: string) => string,
): ProjectRow[] {
  if (!snapshot) return []
  return snapshot.projects.map((project) => {
    if (!isProjectNavigable(project)) {
      return { root: project.root, basename: basenameOf(project.root), ok: false, wip: 0, need: 0, running: 0, cells: [] }
    }
    const progress = selectProgress(snapshot, project.root, rulesByKey)
    const rules = dominantRules(project.changes, project.root, rulesByKey)
    return {
      root: project.root,
      basename: basenameOf(project.root),
      ok: true,
      wip: progress.total,
      need: progress.counts.gate + progress.counts.failed,
      running: progress.counts.running,
      cells: buildCells(project.changes, rules, t),
    }
  })
}
