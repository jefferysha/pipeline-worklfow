import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compileAutomationPolicySnapshot,
  compileEffectiveWorkflowPlan,
  createTransitionRecordStore,
  createWorkflowActionAuthoritySnapshot,
  createWorkflowRunRepository,
  ensureWorkflowActionAuthorityRecord,
  serializeWorkflow,
  workflowActionAuthorityRecordPath,
  workflowPlanSnapshot,
  type LoopEntry,
  type StateStore,
  type WorkflowDef,
} from '@tenon/kernel'
import { readChangeSnapshot } from './changeSnapshot.js'
import { buildSnapshot } from './snapshot.js'
import { initChange, makeProject, newStore } from './test-support.js'

const WORKFLOW = {
  name: 'snapshot-authority',
  interaction: { version: 'v1', mode: 'afk' },
  steps: [{
    id: 'run', label: 'Run', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [],
  }],
} satisfies WorkflowDef

const POLICY = compileAutomationPolicySnapshot({
  id: 'loop-snapshot', name: 'Snapshot loop', kind: 'executor', goal: 'Project authority',
  cadence: 'manual', risk: 'low', runner: 'codex', change_prefix: 'snapshot-', phases: [],
  human_gates: [], state: 'legacy', design_doc: 'design.md', status: 'active',
  budget: { max_runs_per_day: 1, max_in_flight: 1, on_exceed: 'skip-run' },
  kill_criteria: [], autonomy_level: 'L1', allowlist: ['**'], denylist: [],
  skill_bundle_id: 'backend',
} satisfies LoopEntry, { capturedAt: '2026-08-08T00:00:00Z' })

const PLAN = compileEffectiveWorkflowPlan(WORKFLOW.name, WORKFLOW)

async function installWorkflow(root: string): Promise<void> {
  const directory = join(root, '.pipeline', 'workflows')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, `${WORKFLOW.name}.yaml`), serializeWorkflow(WORKFLOW), 'utf8')
}

async function seedRun(
  store: StateStore,
  root: string,
  name: string,
  authority: 'bound' | 'missing' | 'mismatched' | 'corrupt',
): Promise<void> {
  const changeDir = await initChange(store, root, name, {
    initialWorkflow: {
      workflow: WORKFLOW.name,
      phase: 'run',
      workflowPlanFingerprint: PLAN.workflowFingerprint,
      workflowPlanSnapshot: workflowPlanSnapshot(PLAN),
    },
  })
  const repository = createWorkflowRunRepository({
    store,
    recordStore: createTransitionRecordStore(),
    clock: () => '2026-08-08T00:00:00Z',
  })
  const attemptId = `${name}-attempt`
  const iterationId = `iteration-${attemptId}`
  const run = await repository.bindAutomationPolicy(changeDir, POLICY, {
    loopId: POLICY.loop_id,
    iterationId,
  })
  if (authority === 'missing') return
  if (authority === 'corrupt') {
    await writeFile(workflowActionAuthorityRecordPath(changeDir, iterationId), '{broken', 'utf8')
    return
  }
  const grant = { status: 'valid', grants: ['enter-afk'] } as const
  const snapshot = createWorkflowActionAuthoritySnapshot({
    action: 'enter-afk',
    workflowRunId: authority === 'mismatched' ? `${run.id}-other` : run.id,
    workflowId: PLAN.id,
    workflowFingerprint: PLAN.workflowFingerprint,
    loopId: POLICY.loop_id,
    iterationId,
    attemptId,
    reservationId: `${name}-reservation`,
    skillBundleId: POLICY.skill_bundle_id,
    trackId: 'backend',
    trackRegistryRevision: '0123456789abcdef',
    layers: { platform: grant, skill: grant, project: grant, workflow: grant, run: grant },
    provenance: {
      platform: { kind: 'platform-policy', identity: 'tenon', revision: 'v1' },
      skill: { kind: 'skill-contract', identity: POLICY.skill_bundle_id, revision: PLAN.workflowFingerprint },
      project: { kind: 'track-registry', identity: 'backend', revision: '0123456789abcdef' },
      workflow: { kind: 'workflow-plan', identity: PLAN.id, revision: PLAN.workflowFingerprint },
      run: {
        kind: 'workflow-run',
        identity: authority === 'mismatched' ? `${run.id}-other` : run.id,
        revision: iterationId,
      },
    },
  })
  if (authority === 'bound') await repository.bindWorkflowActionAuthority(changeDir, snapshot)
  else await ensureWorkflowActionAuthorityRecord(changeDir, snapshot)
}

function expectAvailable(effective: unknown): void {
  expect(effective).toMatchObject({ status: 'available', grants: ['enter-afk'] })
  expect(effective).toMatchObject({
    denials: expect.arrayContaining([expect.objectContaining({ action: 'write-filesystem' })]),
  })
}

const UNAVAILABLE = { status: 'unavailable', reason: 'authority-input-unavailable' }

describe('snapshot production authority projection', () => {
  it('binds the current immutable authority in aggregate and bounded paths and fails closed otherwise', async () => {
    const store = newStore()
    const root = await makeProject()
    await installWorkflow(root)
    await seedRun(store, root, 'bound', 'bound')
    await seedRun(store, root, 'missing', 'missing')
    await seedRun(store, root, 'mismatched', 'mismatched')
    await seedRun(store, root, 'corrupt', 'corrupt')

    const aggregate = await buildSnapshot({
      registry: () => [root], store, version: '1', clock: () => '2026-08-08T00:00:00Z',
    })
    const byName = new Map(aggregate.projects[0]?.changes.map((change) => [change.name, change]))
    expectAvailable(byName.get('bound')?.workflowRules.policy.effective)
    expect(byName.get('missing')?.workflowRules.policy.effective).toEqual(UNAVAILABLE)
    expect(byName.get('mismatched')?.workflowRules.policy.effective).toEqual(UNAVAILABLE)
    expect(byName.get('corrupt')?.workflowRules.policy.effective).toEqual(UNAVAILABLE)

    const bound = await readChangeSnapshot(
      { registry: () => [root], store, version: '1', clock: () => '2026-08-08T00:00:00Z' },
      root,
      'bound',
    )
    expectAvailable(bound?.workflowRules.policy.effective)
    await expect(readChangeSnapshot(
      { registry: () => [root], store, version: '1', clock: () => '2026-08-08T00:00:00Z' },
      root,
      'missing',
    )).resolves.toMatchObject({ workflowRules: { policy: { effective: UNAVAILABLE } } })
    await expect(readChangeSnapshot(
      { registry: () => [root], store, version: '1', clock: () => '2026-08-08T00:00:00Z' },
      root,
      'mismatched',
    )).resolves.toMatchObject({ workflowRules: { policy: { effective: UNAVAILABLE } } })
    await expect(readChangeSnapshot(
      { registry: () => [root], store, version: '1', clock: () => '2026-08-08T00:00:00Z' },
      root,
      'corrupt',
    )).resolves.toMatchObject({ workflowRules: { policy: { effective: UNAVAILABLE } } })
  })
})
