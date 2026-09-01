import {
  applyBoardCommand,
  type ApplyCommandResult,
  type BoardCommandV1,
  type BoardSnapshotV1,
  type CapabilityResolutionV1,
  type SkillArtifactRefV1,
  type SkillDescriptorV1,
  type SkillResultEnvelopeV1,
  type WorkGraphV1,
} from '@tenon/kernel'
import { normalizeExecutionObservation, normalizeValidationDecision, resultFor } from './execution-boundary.js'
import type {
  BindingValidation,
  CapabilityExecutionHost,
  CapabilityWorkExecutionInput,
  PreparedRun,
  RunOutcome,
  SkillExecutionBindingV1,
  SkillExecutionObservationV1,
  SkillValidationDecisionV1,
} from './execution-types.js'

export function command(
  state: BoardSnapshotV1,
  host: CapabilityExecutionHost,
  type: BoardCommandV1['type'],
  payload: Record<string, unknown> = {},
): BoardCommandV1 {
  return {
    schema_version: 'board-command/v1',
    command_id: host.new_id('command'),
    change_id: state.change_id,
    expected_revision: state.revision,
    actor: host.actor,
    issued_at: host.clock(),
    type,
    ...payload,
  } as BoardCommandV1
}

export function apply(
  state: BoardSnapshotV1,
  host: CapabilityExecutionHost,
  type: BoardCommandV1['type'],
  payload: Record<string, unknown> = {},
): { readonly state: BoardSnapshotV1 } | { readonly message: string } {
  const result: ApplyCommandResult = applyBoardCommand(state, command(state, host, type, payload))
  return result.ok ? { state: result.state } : { message: result.message }
}

function selectedSkill(
  resolution: CapabilityResolutionV1,
  binding: SkillExecutionBindingV1,
): CapabilityResolutionV1['selected_skills'][number] | undefined {
  return resolution.selected_skills.find((skill) => skill.id === binding.skill_id && skill.version === binding.skill_version)
}

function descriptorFor<T extends { readonly id: string }>(descriptors: readonly T[], id: string): T | undefined {
  return descriptors.find((descriptor) => descriptor.id === id)
}

function resourceKeys(
  item: WorkGraphV1['task_plan']['work_items'][number],
  skill: SkillDescriptorV1,
): readonly { readonly key: string; readonly write: boolean }[] {
  return [
    ...item.resource_claims.map((claim) => ({ key: `${claim.kind}:${claim.key}`, write: claim.access === 'write' })),
    ...skill.resource_claims.map((claim) => ({ key: `${claim.kind}:${claim.key}`, write: claim.access === 'write' })),
  ]
}

export function parallelConflict(
  ids: readonly string[],
  graph: WorkGraphV1,
  bindings: ReadonlyMap<string, SkillExecutionBindingV1>,
  skills: readonly SkillDescriptorV1[],
): boolean {
  const claims = new Map<string, { readonly write: boolean; readonly item: string }>()
  for (const id of ids) {
    const item = graph.task_plan.work_items.find((candidate) => candidate.id === id)
    const binding = bindings.get(id)
    const skill = binding === undefined ? undefined : descriptorFor(skills, binding.skill_id)
    if (item === undefined || skill === undefined) return true
    for (const claim of resourceKeys(item, skill)) {
      const prior = claims.get(claim.key)
      if (prior !== undefined && (prior.write || claim.write) && prior.item !== id) return true
      claims.set(claim.key, { write: claim.write, item: id })
    }
  }
  return false
}

function safeId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value)
}

export function validateExecutionBindings(
  graph: WorkGraphV1,
  resolution: CapabilityResolutionV1,
  bindings: readonly SkillExecutionBindingV1[],
  skills: readonly SkillDescriptorV1[],
  mcps: readonly import('@tenon/kernel').McpDescriptorV1[],
  allowedPermissions: readonly string[],
): BindingValidation {
  const issues: string[] = []
  const workItems = graph.task_plan.work_items
  const itemById = new Map(workItems.map((item) => [item.id, item]))
  const bindingByItem = new Map<string, SkillExecutionBindingV1>()
  const groupByItem = new Map<string, WorkGraphV1['execution_groups'][number]>()
  for (const group of graph.execution_groups) {
    for (const id of group.work_item_ids) {
      if (groupByItem.has(id)) issues.push(`work item ${id} appears in multiple execution groups`)
      groupByItem.set(id, group)
    }
  }
  for (const item of workItems) if (!groupByItem.has(item.id)) issues.push(`work item ${item.id} has no execution group`)
  for (const binding of bindings) {
    if (!safeId(binding.work_item_id) || !safeId(binding.skill_id) || !safeId(binding.skill_version)) {
      issues.push('binding contains an invalid identity')
      continue
    }
    if (bindingByItem.has(binding.work_item_id)) issues.push(`work item ${binding.work_item_id} has duplicate bindings`)
    bindingByItem.set(binding.work_item_id, binding)
    const item = itemById.get(binding.work_item_id)
    const group = groupByItem.get(binding.work_item_id)
    const selected = selectedSkill(resolution, binding)
    const descriptor = descriptorFor(skills, binding.skill_id)
    if (item === undefined) issues.push(`binding references unknown work item ${binding.work_item_id}`)
    if (group === undefined) issues.push(`binding has no group for work item ${binding.work_item_id}`)
    if (group !== undefined && group.mode !== binding.mode) issues.push(`binding mode does not match group for ${binding.work_item_id}`)
    if (selected === undefined) issues.push(`skill ${binding.skill_id}@${binding.skill_version} is not in resolution`)
    if (descriptor === undefined) issues.push(`skill descriptor ${binding.skill_id} is missing`)
    if (binding.mode === 'parallel' && descriptor !== undefined && !descriptor.supports_parallel) {
      issues.push(`skill ${binding.skill_id} does not support parallel execution`)
    }
    if (selected?.source === 'user' && selected.mode !== binding.mode) {
      issues.push(`user-selected skill ${binding.skill_id} mode changed from ${selected.mode}`)
    }
    if (descriptor !== undefined) for (const permission of descriptor.permissions) {
      if (!allowedPermissions.includes(permission)) issues.push(`permission ${permission} is not allowed for ${binding.skill_id}`)
    }
    for (const mcpId of binding.mcp_ids) {
      const mcp = descriptorFor(mcps, mcpId)
      if (mcp === undefined) issues.push(`MCP descriptor ${mcpId} is missing`)
      else for (const permission of mcp.permissions) {
        if (!allowedPermissions.includes(permission)) issues.push(`permission ${permission} is not allowed for ${mcpId}`)
      }
      if (!resolution.selected_mcps.some((selectedMcp) => selectedMcp.id === mcpId)) {
        issues.push(`MCP ${mcpId} is not selected in resolution`)
      }
    }
  }
  for (const item of workItems) if (!bindingByItem.has(item.id)) issues.push(`work item ${item.id} has no Skill binding`)
  for (const selected of resolution.selected_skills) {
    if (!bindings.some((binding) => binding.skill_id === selected.id && binding.skill_version === selected.version)) {
      issues.push(`selected skill ${selected.id}@${selected.version} is not bound to a work item`)
    }
  }
  for (const selected of resolution.selected_mcps.filter((mcp) => mcp.required)) {
    if (!bindings.some((binding) => binding.mcp_ids.includes(selected.id))) issues.push(`required MCP ${selected.id} is not bound to a work item`)
  }
  for (const binding of bindings) {
    const selected = selectedSkill(resolution, binding)
    const item = itemById.get(binding.work_item_id)
    if (selected === undefined || item === undefined) continue
    for (const dependency of selected.depends_on) {
      const dependencyItems = workItems.filter((candidate) => bindings.some((entry) => entry.work_item_id === candidate.id && entry.skill_id === dependency))
      if (dependencyItems.length === 0 || !dependencyItems.some((candidate) => item.depends_on.includes(candidate.id))) {
        issues.push(`skill dependency ${dependency} is not represented before ${binding.work_item_id}`)
      }
    }
  }
  return { ok: issues.length === 0, issues: Object.freeze([...new Set(issues)]) }
}

export function applicationBlockers(
  resolution: CapabilityResolutionV1,
  skills: readonly SkillDescriptorV1[],
  mcps: readonly import('@tenon/kernel').McpDescriptorV1[],
  allowedPermissions: readonly string[],
): readonly string[] {
  const issues: string[] = []
  for (const selected of resolution.selected_skills) {
    const descriptor = descriptorFor(skills, selected.id)
    if (descriptor === undefined) continue
    for (const permission of descriptor.permissions) if (!allowedPermissions.includes(permission)) {
      issues.push(`permission ${permission} is not allowed for ${selected.id}`)
    }
  }
  for (const selected of resolution.selected_mcps) {
    const descriptor = descriptorFor(mcps, selected.id)
    if (descriptor === undefined) continue
    for (const permission of descriptor.permissions) if (!allowedPermissions.includes(permission)) {
      issues.push(`permission ${permission} is not allowed for ${selected.id}`)
    }
  }
  return Object.freeze([...new Set(issues)])
}

export function readyWave(
  state: BoardSnapshotV1,
  graph: WorkGraphV1,
  bindings: ReadonlyMap<string, SkillExecutionBindingV1>,
  skills: readonly SkillDescriptorV1[],
): readonly string[] {
  const ready = graph.task_plan.work_items
    .filter((item) => {
      const runtime = state.work_items.find((candidate) => candidate.work_item_id === item.id)
      return runtime?.status === 'ready' || runtime?.status === 'queued'
    })
    .map((item) => item.id)
  const first = ready[0]
  if (first === undefined) return []
  const group = graph.execution_groups.find((candidate) => candidate.work_item_ids.includes(first))
  if (group === undefined || group.mode === 'serial') return [first]
  const candidates = group.work_item_ids.filter((id) => ready.includes(id))
  if (candidates.length < 2 || parallelConflict(candidates, graph, bindings, skills)) return [first]
  return candidates
}

export function dependencyArtifacts(
  itemId: string,
  graph: WorkGraphV1,
  state: BoardSnapshotV1,
  results: ReadonlyMap<string, SkillResultEnvelopeV1>,
): { readonly ok: true; readonly artifacts: readonly SkillArtifactRefV1[] } | { readonly ok: false; readonly issue: string } {
  const item = graph.task_plan.work_items.find((candidate) => candidate.id === itemId)
  if (item === undefined) return { ok: false, issue: 'work-item-missing' }
  const artifacts: SkillArtifactRefV1[] = []
  for (const dependency of item.depends_on) {
    const result = results.get(dependency)
    if (result === undefined || result.status !== 'completed') {
      const runtime = state.work_items.find((candidate) => candidate.work_item_id === dependency)
      if (runtime?.status === 'completed') return { ok: false, issue: `dependency-result-missing:${dependency}` }
      return { ok: false, issue: `dependency-not-completed:${dependency}` }
    }
    artifacts.push({ kind: 'artifact', ref: `skill-result:${result.result_id}`, label: `result of ${dependency}` })
    artifacts.push(...result.artifacts)
  }
  return { ok: true, artifacts: Object.freeze(artifacts) }
}

export async function executePrepared(
  prepared: PreparedRun,
  input: CapabilityWorkExecutionInput,
): Promise<RunOutcome> {
  let observation: SkillExecutionObservationV1 | undefined
  let decision: SkillValidationDecisionV1 = { contract_status: 'unknown', diagnostics: ['validator-not-configured'] }
  let errorIssue: string | undefined
  try {
    const rawObservation = await input.executor.execute({
      run_id: prepared.run_id,
      work_item_id: prepared.binding.work_item_id,
      skill_id: prepared.binding.skill_id,
      skill_version: prepared.binding.skill_version,
      mcp_ids: prepared.binding.mcp_ids,
      input_artifacts: prepared.input_artifacts,
      signal: input.signal ?? new AbortController().signal,
    })
    const normalized = normalizeExecutionObservation(rawObservation, input.max_output_bytes)
    if (!normalized.ok) errorIssue = normalized.issue
    else {
      observation = normalized.observation
      if (input.validator !== undefined) {
        try {
          const rawDecision = await input.validator.validate({ binding: prepared.binding, observation })
          const normalizedDecision = normalizeValidationDecision(rawDecision, prepared.binding.work_item_id)
          if (!normalizedDecision.ok) errorIssue = normalizedDecision.issue
          else decision = normalizedDecision.decision
        } catch {
          errorIssue = 'validator-failed'
        }
      }
    }
  } catch {
    errorIssue = input.signal?.aborted === true ? 'execution-aborted' : 'executor-failed'
  }
  const result = resultFor(prepared, observation, decision, input, errorIssue)
  const blocking = result.status !== 'completed'
    || result.contract_status !== 'validated'
    || decision.report === undefined
    || !(decision.report.status === 'pass' && decision.report.checks.every((check) => check.status === 'pass'))
  return { prepared, result, ...(decision.report === undefined ? {} : { report: decision.report }), blocking }
}
