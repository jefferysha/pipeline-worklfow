import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { markLoopPrepared, markNonLoopPrepared, type ExecutionContext } from './admission/execution-context.js'
import { createAfkSkillInvocationLifecycle } from './skillInvocationAfkLifecycle.js'

const roots: string[] = []
const execution: ExecutionContext = {
  attempt_id: 'attempt-1', reservation_id: 'reservation-1', loop_id: 'loop-1', change: 'demo',
  level: 'supervised', runner: 'codex', admitted_at: '2026-08-04T00:00:00.000Z',
  reservation: { runs: 1, tokens: 1024, token_basis: 'risk-default' },
  workflow_run_id: 'run-1', policy_epoch: 'policy-1', skill_bundle_id: 'bundle-1',
}

describe('AFK SkillInvocation lifecycle fail-closed boundary', () => {
  afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

  it('rejects a governed loop bundle when its canonical StepVisit is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-afk-step-visit-'))
    roots.push(root)
    const prepared = markLoopPrepared(execution, {
      snapshotSha256: 'a'.repeat(64), casRelativePath: '.pipeline/skill-bundles/a',
      resolutionSource: 'default', slots: [],
    })
    const lifecycle = createAfkSkillInvocationLifecycle(() => join(root, 'missing-change'))
    await expect(lifecycle.start(prepared, '2026-08-04T00:00:00.000Z'))
      .rejects.toThrow(/canonical WorkflowRun StepVisit identity is missing/u)
  })

  it('preserves the explicit no-run-id legacy compatibility path', async () => {
    const legacy = markNonLoopPrepared({ ...execution, workflow_run_id: undefined, skill_bundle_id: undefined })
    const lifecycle = createAfkSkillInvocationLifecycle(() => '/not-used')
    await expect(lifecycle.start(legacy, '2026-08-04T00:00:00.000Z')).resolves.toEqual([])
  })
})
