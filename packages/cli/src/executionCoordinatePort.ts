import { createHash } from 'node:crypto'
import {
  compileWorkflow,
  loadWorkflow,
  resolveStep,
  resolveWorkflowName,
  type FieldName,
  type PipelineState,
  type StateStore,
  type StepIR,
} from '@tenon/kernel'
import type {
  CapturedExecutionCoordinate,
  ExecutionContext,
  ExecutionCoordinatePort,
} from '@tenon/automation'
import { changeDir } from './paths.js'

function scalarField(state: PipelineState, field: FieldName): string {
  const value = state.fields[field]
  return Array.isArray(value) ? value.join(',') : (value ?? '')
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Missing custom workflow files mean no declared skills; malformed definitions still fail loudly. */
function emptyDeclaredStep(stepId: string): StepIR {
  return {
    id: stepId,
    label: '',
    gate: null,
    skills: [],
    inputs: [],
    outputs: [],
    guards: [],
    artifacts: [],
    transitions: [],
  }
}

interface CoordinateSnapshot {
  readonly resolution: CapturedExecutionCoordinate['resolution']
  readonly workflow: string
  readonly track: string
  readonly workflowRunId?: string
  readonly digestInput: string
}

/** Shared coordinate read keeps capture and TOCTOU recheck on one canonical digest contract. */
async function readCoordinateSnapshot(
  store: StateStore,
  repoRoot: string,
  dir: string,
): Promise<CoordinateSnapshot> {
  const state = await store.read(dir)
  const workflowName = resolveWorkflowName(state)
  const stepId = scalarField(state, 'phase')
  const track = scalarField(state, 'track')
  const automation = scalarField(state, 'automation')
  const runId = state.runMetadata?.runId ?? ''
  if (workflowName === 'default') {
    return {
      resolution: { kind: 'default', stepId },
      workflow: workflowName,
      track,
      workflowRunId: runId || undefined,
      digestInput: JSON.stringify({ workflowName, stepId, track, automation, runId }),
    }
  }
  const definition = loadWorkflow(repoRoot, workflowName)
  if (definition === null) {
    return {
      resolution: { kind: 'custom', step: emptyDeclaredStep(stepId) },
      workflow: workflowName,
      track,
      workflowRunId: runId || undefined,
      digestInput: JSON.stringify({ workflowName, stepId, track, automation, runId, def: null }),
    }
  }
  const step = resolveStep(compileWorkflow(definition), stepId)
  if (step === null) {
    throw new Error(
      `custom workflow '${workflowName}' 未声明 step '${stepId}'（workflow 文件存在但 step 不在图里，数据完整性问题）`,
    )
  }
  return {
    resolution: { kind: 'custom', step },
    workflow: workflowName,
    track,
    workflowRunId: runId || undefined,
    digestInput: JSON.stringify({ workflowName, stepId, track, automation, runId, def: definition }),
  }
}

export interface ExecutionCoordinatePortDeps {
  readonly store: StateStore
  readonly repoRoot: string
}

/**
 * Captures the immutable workflow coordinate under the Change lock, then exposes
 * a separate digest read for the admission TOCTOU check.
 */
export function createExecutionCoordinatePort(
  deps: ExecutionCoordinatePortDeps,
): ExecutionCoordinatePort {
  const { store, repoRoot } = deps
  return {
    async capture(ctx: ExecutionContext): Promise<CapturedExecutionCoordinate> {
      const dir = changeDir(repoRoot, ctx.change)
      return store.withLock(dir, async () => {
        const snapshot = await readCoordinateSnapshot(store, repoRoot, dir)
        return {
          resolution: snapshot.resolution,
          workflow: snapshot.workflow,
          track: snapshot.track,
          workflowRunId: snapshot.workflowRunId,
          inputsDigest: sha256Hex(snapshot.digestInput),
        }
      })
    },
    async readCurrentInputsDigest(ctx: ExecutionContext): Promise<string> {
      const dir = changeDir(repoRoot, ctx.change)
      const snapshot = await readCoordinateSnapshot(store, repoRoot, dir)
      return sha256Hex(snapshot.digestInput)
    },
  }
}
