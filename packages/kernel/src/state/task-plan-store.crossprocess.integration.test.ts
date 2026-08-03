/**
 * Real two-process CAS acceptance. esbuild bundles the production TaskPlan store source into one
 * temporary child entry; both independent Node processes stop at the same barrier, then contend on
 * the same expected current revision. The lock/CAS winner exits 0 and the stable conflict exits 3.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readTaskPlanForChange } from './task-plan-store.js'

const CHILD_SOURCE = `
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { publishTaskPlanRevision, TaskPlanRevisionConflictError } from './task-plan-store.ts'

const [changeDir, revisionId, barrierPath, mode = 'contend'] = process.argv.slice(2)
const revision = {
  schema_version: 'task-plan/v1', plan_id: 'plan-1', revision_id: revisionId,
  revision_number: 2, status: 'frozen', created_at: '2026-08-04T00:00:00.000Z',
  requirements: [{ id: 'req-1', title: 'CAS' }],
  acceptance_criteria: [{ id: 'acc-1', title: 'One winner' }],
  groups: [{ id: 'group-1', title: 'Build', parent_id: null, work_item_ids: ['item-1'] }],
  work_items: [{ id: 'item-1', title: revisionId, group_id: 'group-1',
    requirement_refs: ['req-1'], acceptance_refs: ['acc-1'], depends_on: [],
    resource_claims: [], expected_outputs: [], validators: [] }],
}
process.stdout.write('ready\\n')
while (!existsSync(barrierPath)) await sleep(5)
try {
  await publishTaskPlanRevision(changeDir, revision, {
    expected_current_revision_id: 'revision-1',
    ...(mode === 'crash' ? { __test_after_immutable_publish: () => process.exit(17) } : {}),
  })
  process.exit(0)
} catch (error) {
  if (error instanceof TaskPlanRevisionConflictError) process.exit(3)
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
}
`

function initialRevision() {
  return {
    schema_version: 'task-plan/v1' as const,
    plan_id: 'plan-1',
    revision_id: 'revision-1',
    revision_number: 1,
    status: 'frozen' as const,
    created_at: '2026-08-04T00:00:00.000Z',
    requirements: [{ id: 'req-1', title: 'CAS' }],
    acceptance_criteria: [{ id: 'acc-1', title: 'One winner' }],
    groups: [{ id: 'group-1', title: 'Build', parent_id: null, work_item_ids: ['item-1'] }],
    work_items: [{
      id: 'item-1', title: 'Initial', group_id: 'group-1',
      requirement_refs: ['req-1'], acceptance_refs: ['acc-1'], depends_on: [],
      resource_claims: [], expected_outputs: [], validators: [],
    }],
  }
}

function runChild(
  script: string,
  changeDir: string,
  revisionId: string,
  barrierPath: string,
  mode = 'contend',
): { readonly ready: Promise<void>; readonly exit: Promise<number> } {
  const child = spawn(process.execPath, [script, changeDir, revisionId, barrierPath, mode], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', () => { if (stdout.includes('ready')) resolve() })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (!stdout.includes('ready')) reject(new Error(
        `TaskPlan contender exited before ready: code=${code} signal=${signal}\n${stderr}`,
      ))
    })
  })
  const exit = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? -1))
  })
  void ready.catch(() => {})
  return { ready, exit }
}

describe('TaskPlan store cross-process CAS', () => {
  let scriptDir: string
  let script: string

  beforeAll(async () => {
    scriptDir = await mkdtemp(join(tmpdir(), 'task-plan-cas-script-'))
    script = join(scriptDir, 'task-plan-contender.mjs')
    await build({
      stdin: {
        contents: CHILD_SOURCE,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      outfile: script,
    })
  })

  afterAll(async () => {
    await rm(scriptDir, { recursive: true, force: true })
  })

  it('allows exactly one independent contender and gives the loser a stable CAS conflict', async () => {
    const root = await mkdtemp(join(tmpdir(), 'task-plan-cas-change-'))
    try {
      const { publishTaskPlanRevision } = await import('./task-plan-store.js')
      await publishTaskPlanRevision(root, initialRevision(), { expected_current_revision_id: null })
      const barrier = join(scriptDir, `barrier-${Date.now()}`)
      const alpha = runChild(script, root, 'revision-alpha', barrier)
      const beta = runChild(script, root, 'revision-beta', barrier)
      await Promise.all([alpha.ready, beta.ready])
      await writeFile(barrier, 'go\n', 'utf8')

      expect((await Promise.all([alpha.exit, beta.exit])).sort()).toEqual([0, 3])
      const current = JSON.parse(await readFile(join(root, '.pipeline-task-plan', 'current.json'), 'utf8')) as {
        revision_id: string
      }
      expect(['revision-alpha', 'revision-beta']).toContain(current.revision_id)
      await expect(readTaskPlanForChange(root)).resolves.toMatchObject({
        source: 'canonical', revision_number: 2, revision_id: current.revision_id,
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('recovers a dead-process lock and byte-identical orphan after a real immutable/current crash', async () => {
    const root = await mkdtemp(join(tmpdir(), 'task-plan-crash-change-'))
    try {
      const { publishTaskPlanRevision } = await import('./task-plan-store.js')
      await publishTaskPlanRevision(root, initialRevision(), { expected_current_revision_id: null })
      const barrier = join(scriptDir, `crash-barrier-${Date.now()}`)
      const crashing = runChild(script, root, 'revision-crash', barrier, 'crash')
      await crashing.ready
      await writeFile(barrier, 'go\n', 'utf8')
      expect(await crashing.exit).toBe(17)
      await expect(readTaskPlanForChange(root)).resolves.toMatchObject({ revision_id: 'revision-1' })
      expect(await readFile(join(root, '.pipeline.lock', 'owner'), 'utf8')).toMatch(/^\d+\./u)

      const recovery = runChild(script, root, 'revision-crash', barrier, 'recover')
      await recovery.ready
      expect(await recovery.exit).toBe(0)
      await expect(readTaskPlanForChange(root)).resolves.toMatchObject({ revision_id: 'revision-crash' })
      expect((await readdir(join(root, '.pipeline-task-plan', 'revisions'))).length).toBe(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
