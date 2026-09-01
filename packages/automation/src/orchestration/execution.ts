import {
  createOrchestrationState,
  resolveCapabilities,
  type BoardSnapshotV1,
  type CapabilityResolutionV1,
  type DevelopmentRequestV1,
  type RepositoryContextSnapshotV1,
  type SkillDescriptorV1,
  type SkillResultEnvelopeV1,
  type WorkGraphV1,
} from '@tenon/kernel'
import {
  apply,
  applicationBlockers,
  dependencyArtifacts,
  executePrepared,
  readyWave,
  validateExecutionBindings,
} from './execution-support.js'
import type {
  CapabilityExecutionOutcome,
  CapabilityExecutionSetupInput,
  CapabilityWorkExecutionInput,
  PreparedRun,
  RunCapabilityOrchestrationInput,
  RunOutcome,
  SkillExecutionBindingV1,
} from './execution-types.js'

function commandFailure(
  code: 'command-rejected' | 'binding-invalid' | 'dependency-result-missing',
  state: BoardSnapshotV1,
  message: string,
  issues?: readonly string[],
): CapabilityExecutionOutcome {
  return { ok: false, code, state, message, ...(issues === undefined ? {} : { issues }) }
}

type SetupResolution =
  | { readonly state: BoardSnapshotV1; readonly resolution: CapabilityResolutionV1 }
  | CapabilityExecutionOutcome

function setupResolution(input: CapabilityExecutionSetupInput): SetupResolution {
  let state = createOrchestrationState(input.request, input.clock())
  if (
    input.request.project_id !== input.context.project_id
    || input.assessment.request_id !== input.request.request_id
    || input.graph.change_id !== input.request.change_id
    || input.graph.task_plan.status !== 'frozen'
  ) return { ok: false, code: 'setup-invalid', state, message: 'request/context/assessment/graph identity or frozen plan is invalid' }

  const recorded = apply(state, input, 'record-assessment', { assessment: input.assessment, context: input.context })
  if (!('state' in recorded)) return { ok: false, code: 'command-rejected', state, message: recorded.message }
  state = recorded.state
  if (input.assessment.status !== 'complete') {
    return {
      state,
      resolution: {
        schema_version: 'capability-resolution/v1',
        resolution_id: input.new_id('resolution'),
        assessment_id: input.assessment.assessment_id,
        status: 'needs-input',
        required_capabilities: input.assessment.capability_requirements,
        selected_skills: [],
        selected_mcps: [],
        unresolved_capabilities: input.assessment.capability_requirements,
        blockers: [],
        decisions: [],
        resolved_at: input.clock(),
      },
    }
  }

  const attached = apply(state, input, 'attach-work-graph', { graph: input.graph })
  if (!('state' in attached)) return { ok: false, code: 'command-rejected', state, message: attached.message }
  state = attached.state
  let resolution: CapabilityResolutionV1
  try {
    resolution = resolveCapabilities({
      request: input.request,
      assessment: input.assessment,
      skills: input.skills,
      mcps: input.mcps,
      resolution_id: input.new_id('resolution'),
      resolved_at: input.clock(),
    })
  } catch (error) {
    return { ok: false, code: 'resolution-failed', state, message: error instanceof Error ? error.message : 'capability resolution failed' }
  }
  let blockers = [...resolution.blockers, ...applicationBlockers(
    resolution,
    input.skills,
    input.mcps,
    input.allowed_permissions ?? [],
  )]
  if (resolution.status === 'resolved' && blockers.length === 0) {
    const validation = validateExecutionBindings(
      input.graph,
      resolution,
      input.bindings,
      input.skills,
      input.mcps,
      input.allowed_permissions ?? [],
    )
    blockers = [...blockers, ...validation.issues]
  }
  const finalResolution: CapabilityResolutionV1 = blockers.length > 0
    ? { ...resolution, status: 'blocked', blockers: Object.freeze([...new Set(blockers)]) }
    : resolution
  const resolved = apply(state, input, 'resolve-capabilities', { resolution: finalResolution })
  if (!('state' in resolved)) return { ok: false, code: 'command-rejected', state, message: resolved.message }
  return { state: resolved.state, resolution: finalResolution }
}

export function initializeCapabilityExecution(input: CapabilityExecutionSetupInput): CapabilityExecutionOutcome {
  const setup = setupResolution(input)
  if (!('state' in setup) || !('resolution' in setup)) return setup
  if (setup.resolution.status !== 'resolved') return { ok: true, state: setup.state }
  const started = apply(setup.state, input, 'start')
  if (!('state' in started)) return { ok: false, code: 'command-rejected', state: setup.state, message: started.message }
  return { ok: true, state: started.state }
}

function terminal(state: BoardSnapshotV1): boolean {
  return ['verifying', 'completed', 'blocked', 'failed', 'cancelled'].includes(state.status)
}

function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function prepareRuns(
  state: BoardSnapshotV1,
  wave: readonly string[],
  graph: WorkGraphV1,
  bindings: ReadonlyMap<string, SkillExecutionBindingV1>,
  results: ReadonlyMap<string, SkillResultEnvelopeV1>,
  input: CapabilityWorkExecutionInput,
): { readonly ok: true; readonly state: BoardSnapshotV1; readonly prepared: readonly PreparedRun[] } | CapabilityExecutionOutcome {
  let next = state
  const prepared: PreparedRun[] = []
  for (const workItemId of wave) {
    const binding = bindings.get(workItemId)
    if (binding === undefined) return commandFailure('binding-invalid', next, `missing binding for ${workItemId}`)
    const inputArtifacts = dependencyArtifacts(workItemId, graph, next, results)
    if (!inputArtifacts.ok) return commandFailure('dependency-result-missing', next, inputArtifacts.issue)
    const claimed = apply(next, input, 'claim-work-item', { work_item_id: workItemId, worker_id: input.worker_id })
    if (!('state' in claimed)) return commandFailure('command-rejected', next, claimed.message)
    next = claimed.state
    const runId = input.new_id('run')
    const begun = apply(next, input, 'begin-skill-run', {
      work_item_id: workItemId,
      run_id: runId,
      skill_id: binding.skill_id,
      skill_version: binding.skill_version,
      now: input.clock(),
    })
    if (!('state' in begun)) return commandFailure('command-rejected', next, begun.message)
    next = begun.state
    prepared.push({
      binding,
      run_id: runId,
      result_id: input.new_id('result'),
      input_artifacts: inputArtifacts.artifacts,
    })
  }
  return { ok: true, state: next, prepared }
}

interface SettledRuns {
  readonly state: BoardSnapshotV1
  readonly outcomes: readonly RunOutcome[]
}

async function settleRuns(
  state: BoardSnapshotV1,
  prepared: readonly PreparedRun[],
  input: CapabilityWorkExecutionInput,
): Promise<{ readonly ok: true; readonly value: SettledRuns } | CapabilityExecutionOutcome> {
  const settled = await Promise.allSettled(prepared.map((entry) => executePrepared(entry, input)))
  const outcomes: RunOutcome[] = []
  for (const [index, entry] of settled.entries()) {
    const preparedRun = prepared[index]
    if (preparedRun === undefined) return commandFailure('command-rejected', state, 'executor outcome lost its prepared run identity')
    outcomes.push(entry.status === 'fulfilled'
      ? entry.value
      : {
          prepared: preparedRun,
          result: {
            schema_version: 'skill-result/v1',
            result_id: preparedRun.result_id,
            run_id: preparedRun.run_id,
            status: 'failed',
            contract_status: 'invalid',
            artifacts: [],
            diagnostics: ['executor-failed'],
            produced_at: input.clock(),
          },
          blocking: true,
        })
  }
  // Progressing outcomes are applied first. A blocking sibling is applied last so a successful
  // sibling cannot overwrite the aggregate board's blocked/failed status.
  outcomes.sort((left, right) => Number(left.blocking) - Number(right.blocking))
  let next = state
  for (const outcome of outcomes) {
    const completed = apply(next, input, 'complete-skill-run', { run_id: outcome.prepared.run_id, result: outcome.result })
    if (!('state' in completed)) return commandFailure('command-rejected', next, completed.message)
    next = completed.state
    if (outcome.report !== undefined && outcome.result.contract_status === 'validated') {
      const validated = apply(next, input, 'record-validation', { report: outcome.report })
      if (!('state' in validated)) return commandFailure('command-rejected', next, validated.message)
      next = validated.state
    }
  }
  return { ok: true, value: { state: next, outcomes } }
}

export async function executeCapabilityWorkItems(input: CapabilityWorkExecutionInput): Promise<CapabilityExecutionOutcome> {
  let state = input.state
  const graph = state.graph
  const resolution = state.resolution
  if (graph === undefined || resolution === undefined) return { ok: false, code: 'setup-invalid', state, message: 'board state has no graph or capability resolution' }
  const validation = validateExecutionBindings(
    graph,
    resolution,
    input.bindings,
    input.skills,
    input.mcps,
    input.allowed_permissions ?? [],
  )
  if (!validation.ok) return { ok: false, code: 'binding-invalid', state, message: 'Skill execution bindings are invalid', issues: validation.issues }
  const bindings = new Map(input.bindings.map((binding) => [binding.work_item_id, binding]))
  const results = new Map<string, SkillResultEnvelopeV1>(
    (input.prior_results ?? []).map((entry) => [entry.work_item_id, entry.result]),
  )
  const maxRounds = graph.task_plan.work_items.length * 3 + 2
  for (let round = 0; round < maxRounds; round += 1) {
    if (signalAborted(input.signal)) {
      const cancelled = apply(state, input, 'cancel', { reason: 'execution-aborted' })
      if ('state' in cancelled) state = cancelled.state
      return { ok: true, state }
    }
    if (terminal(state)) return { ok: true, state }
    const wave = readyWave(state, graph, bindings, input.skills)
    if (wave.length === 0) return { ok: false, code: 'execution-stalled', state, message: `no executable ready Work Item while board is ${state.status}` }
    const prepared = prepareRuns(state, wave, graph, bindings, results, input)
    if (!('prepared' in prepared)) return prepared
    const settled = await settleRuns(prepared.state, prepared.prepared, input)
    if (!('value' in settled)) return settled
    state = settled.value.state
    for (const outcome of settled.value.outcomes) {
      results.set(outcome.prepared.binding.work_item_id, outcome.result)
    }
    if (signalAborted(input.signal)) {
      const cancelled = apply(state, input, 'cancel', { reason: 'execution-aborted' })
      if ('state' in cancelled) state = cancelled.state
      return { ok: true, state }
    }
    if (state.status === 'blocked' || state.status === 'failed' || state.status === 'cancelled') return { ok: true, state }
  }
  return { ok: false, code: 'execution-stalled', state, message: 'execution exceeded its bounded round budget' }
}

export async function runCapabilityOrchestration(
  input: RunCapabilityOrchestrationInput,
): Promise<CapabilityExecutionOutcome> {
  const setup = initializeCapabilityExecution(input)
  if (!setup.ok || setup.state.status !== 'executing') return setup
  return executeCapabilityWorkItems({
    state: setup.state,
    bindings: input.bindings,
    skills: input.skills,
    mcps: input.mcps,
    executor: input.executor,
    validator: input.validator,
    prior_results: input.prior_results,
    max_output_bytes: input.max_output_bytes,
    allowed_permissions: input.allowed_permissions,
    clock: input.clock,
    new_id: input.new_id,
    actor: input.actor,
    worker_id: input.worker_id,
    signal: input.signal,
  })
}

export type {
  CapabilityExecutionHost,
  CapabilityExecutionSetupInput,
  CapabilityWorkExecutionInput,
  RunCapabilityOrchestrationInput,
  SkillExecutionBindingV1,
  SkillExecutionObservationV1,
  SkillExecutorPort,
  SkillResultValidatorPort,
  SkillValidationDecisionV1,
  CapabilityExecutionOutcome,
} from './execution-types.js'
export { DEFAULT_SKILL_OUTPUT_MAX_BYTES } from './execution-types.js'
