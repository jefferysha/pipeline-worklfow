import { createHash } from 'node:crypto'
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdLoopSync, REAL_LOOP_SYNC_RUNTIME } from './loop-sync.js'

let repoRoot: string

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'pipeline-loop-sync-'))
})

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true })
})

async function seedPausedLoop(root = repoRoot): Promise<void> {
  await mkdir(join(root, '.pipeline'), { recursive: true })
  await writeFile(join(root, '.pipeline', 'loops.yaml'), [
    'version: 1',
    'loops:',
    '  - id: loop-a',
    '    name: Loop A',
    '    kind: orchestrator',
    '    goal: Keep the declared loop mirror synchronized.',
    '    cadence: 1h',
    '    risk: low',
    '    runner: codex',
    '    change_prefix: loop-a-',
    '    phases: [decide, record]',
    '    human_gates: [destructive changes]',
    '    state: docs/loops/progress.md',
    '    design_doc: LOOP.md',
    '    status: paused',
    '    budget:',
    '      max_runs_per_day: 4',
    '      max_in_flight: 1',
    '      on_exceed: pause',
    '    kill_criteria: [goal reached]',
    '',
  ].join('\n'), 'utf8')
  await writeFile(join(root, 'LOOP.md'), '# Human notes\n\nKeep this text.\n', 'utf8')
}

describe('cmdLoopSync', () => {
  test('dry-run builds a typed plan from a strict snapshot and performs zero writes', async () => {
    await seedPausedLoop()
    const registryPath = join(repoRoot, '.pipeline', 'loops.yaml')
    const loopDocPath = join(repoRoot, 'LOOP.md')
    const registryBefore = await readFile(registryPath)
    const loopDocBefore = await readFile(loopDocPath)
    const deps = makeDeps({ cwd: repoRoot })

    const code = await cmdLoopSync(deps, ['loop-a', '--dry-run', '--json'])

    expect(code).toBe(0)
    expect(deps.errLines).toEqual([])
    expect(deps.outLines).toHaveLength(1)
    const output = JSON.parse(deps.outLines[0]!)
    expect(output).toMatchObject({
      schema_version: 1,
      command: 'loop-sync',
      ok: true,
      mode: 'dry-run',
      status: 'planned',
      scope: { kind: 'loop', loop_id: 'loop-a' },
      summary: { operations: 1, unsupported: 0, not_applicable: 0 },
      unsupported: [],
      not_applicable: [],
      plan: {
        kind: 'loop-reconciliation-plan',
        schema_version: 1,
        scope: { kind: 'loop', loop_id: 'loop-a' },
        operations: [{
          kind: 'ensure-managed-loop-section',
          target: 'LOOP.md',
          loop_id: 'loop-a',
        }],
        blockers: [],
      },
    })
    expect(output.plan.plan_id).toMatch(/^[a-f0-9]{64}$/)
    expect(await readFile(registryPath)).toEqual(registryBefore)
    expect(await readFile(loopDocPath)).toEqual(loopDocBefore)
    await expect(access(join(repoRoot, '.pipeline', 'loops', 'governance')))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('apply publishes the planned LOOP.md post-image through the reconciliation store', async () => {
    await seedPausedLoop()
    const deps = makeDeps({ cwd: repoRoot })

    const code = await cmdLoopSync(deps, ['loop-a', '--apply', '--json'])

    expect(code).toBe(0)
    expect(deps.errLines).toEqual([])
    expect(deps.outLines).toHaveLength(1)
    const output = JSON.parse(deps.outLines[0]!)
    expect(output).toMatchObject({
      schema_version: 1,
      command: 'loop-sync',
      ok: true,
      mode: 'apply',
      status: 'applied',
      scope: { kind: 'loop', loop_id: 'loop-a' },
      summary: { operations: 1, unsupported: 0, not_applicable: 0 },
      result: { status: 'applied', warnings: [] },
    })
    expect(output.result.plan_id).toBe(output.plan.plan_id)
    const written = await readFile(join(repoRoot, 'LOOP.md'), 'utf8')
    expect(written).toContain('# Human notes\n\nKeep this text.\n')
    expect(written.match(/PIPELINE:LOOP-MIRROR-V1:START loop-a/g)).toHaveLength(1)
    expect(written.match(/PIPELINE:LOOP-MIRROR-V1:END loop-a/g)).toHaveLength(1)
    expect((await readdir(repoRoot)).filter((name) => name.includes('.LOOP.md.tmp.'))).toEqual([])
  })

  test('apply reports a nonzero dual-CAS conflict without partially publishing the plan', async () => {
    await seedPausedLoop()
    const loopDocPath = join(repoRoot, 'LOOP.md')
    const concurrent = '# Concurrent human edit\n\nDo not overwrite me.\n'
    const deps = makeDeps({ cwd: repoRoot })

    const code = await cmdLoopSync(deps, ['loop-a', '--apply', '--json'], {
      ...REAL_LOOP_SYNC_RUNTIME,
      applyPlan: async (root, encodedPlan) => {
        await writeFile(loopDocPath, concurrent, 'utf8')
        return REAL_LOOP_SYNC_RUNTIME.applyPlan(root, encodedPlan)
      },
    })

    expect(code).not.toBe(0)
    expect(deps.errLines).toEqual([])
    const output = JSON.parse(deps.outLines[0]!)
    expect(output).toMatchObject({
      schema_version: 1,
      command: 'loop-sync',
      ok: false,
      mode: 'apply',
      status: 'conflict',
      result: {
        status: 'conflict',
        reason: 'stale-precondition',
        conflicts: [{ resource: 'loop_doc' }],
      },
    })
    expect(await readFile(loopDocPath, 'utf8')).toBe(concurrent)
    expect((await readFile(loopDocPath, 'utf8'))).not.toContain('PIPELINE:LOOP-MIRROR-V1')
    expect((await readdir(repoRoot)).filter((name) => name.includes('.LOOP.md.tmp.'))).toEqual([])
  })

  test('matching explicit registry and workflow SHA preconditions are consumed and reported', async () => {
    await seedPausedLoop()
    const registrySha = createHash('sha256')
      .update(await readFile(join(repoRoot, '.pipeline', 'loops.yaml'))).digest('hex')
    const workflowSha = createHash('sha256')
      .update(await readFile(join(repoRoot, 'LOOP.md'))).digest('hex')
    const deps = makeDeps({ cwd: repoRoot })

    const code = await cmdLoopSync(deps, [
      'loop-a', '--dry-run', '--json',
      '--expected-registry-sha', registrySha,
      '--expected-workflow-sha', workflowSha,
    ])

    expect(code).toBe(0)
    expect(deps.errLines).toEqual([])
    expect(JSON.parse(deps.outLines[0]!)).toMatchObject({
      ok: true,
      expected: { registry_sha: registrySha, workflow_sha: workflowSha },
    })
  })

  test('an explicit SHA mismatch is a nonzero zero-write conflict', async () => {
    await seedPausedLoop()
    const registryPath = join(repoRoot, '.pipeline', 'loops.yaml')
    const loopDocPath = join(repoRoot, 'LOOP.md')
    const registryBefore = await readFile(registryPath)
    const loopDocBefore = await readFile(loopDocPath)
    const deps = makeDeps({ cwd: repoRoot })

    const code = await cmdLoopSync(deps, [
      'loop-a', '--dry-run', '--json', '--expected-registry-sha', '0'.repeat(64),
    ])

    expect(code).not.toBe(0)
    expect(deps.errLines).toEqual([])
    expect(JSON.parse(deps.outLines[0]!)).toMatchObject({
      schema_version: 1,
      command: 'loop-sync',
      ok: false,
      mode: 'dry-run',
      status: 'conflict',
      reason: 'expected-sha-mismatch',
      conflicts: [{
        resource: 'registry',
        flag: '--expected-registry-sha',
        expected_sha: '0'.repeat(64),
      }],
    })
    expect(await readFile(registryPath)).toEqual(registryBefore)
    expect(await readFile(loopDocPath)).toEqual(loopDocBefore)
    await expect(access(join(repoRoot, '.pipeline', 'loops', 'governance')))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('unsupported and not-applicable drift are exposed as explicit stable dispositions', async () => {
    await seedPausedLoop()
    const registryPath = join(repoRoot, '.pipeline', 'loops.yaml')
    const registry = (await readFile(registryPath, 'utf8')).replace('status: paused', 'status: active')
    await writeFile(registryPath, registry, 'utf8')
    await mkdir(join(repoRoot, '.superpowers', 'loops'), { recursive: true })
    await writeFile(join(repoRoot, '.superpowers', 'loops', 'progress.md'),
      '| 2026-07-05T20:00 | loop-a | run | 0 | change=other-change |\n', 'utf8')
    const loopDocBefore = await readFile(join(repoRoot, 'LOOP.md'))
    const deps = makeDeps({ cwd: repoRoot })

    const code = await cmdLoopSync(deps, ['loop-a', '--dry-run', '--json'])

    expect(code).not.toBe(0)
    const output = JSON.parse(deps.outLines[0]!)
    expect(output.ok).toBe(false)
    expect(output.summary).toEqual({ operations: 1, unsupported: 1, not_applicable: 1 })
    expect(output.unsupported).toEqual([expect.objectContaining({
      disposition: 'unsupported',
      loop_id: 'loop-a',
      dimension: 'change-prefix',
      reason: 'ambiguous-authority',
    })])
    expect(output.not_applicable).toEqual([expect.objectContaining({
      disposition: 'not-applicable',
      loop_id: 'loop-a',
      dimension: 'cadence-idle',
      reason: 'runtime-remediation-required',
    })])
    expect(output.plan.blockers).toHaveLength(2)
    expect(await readFile(join(repoRoot, 'LOOP.md'))).toEqual(loopDocBefore)
  })

  test('symlink, EACCES, and malformed YAML sources fail loud with a stable JSON error envelope', async () => {
    const symlinkRoot = join(repoRoot, 'symlink-case')
    await mkdir(join(symlinkRoot, '.pipeline'), { recursive: true })
    await writeFile(join(symlinkRoot, 'actual-loops.yaml'), 'version: 1\nloops: []\n', 'utf8')
    await symlink(join(symlinkRoot, 'actual-loops.yaml'), join(symlinkRoot, '.pipeline', 'loops.yaml'))
    await writeFile(join(symlinkRoot, 'LOOP.md'), '# LOOP\n', 'utf8')

    const eaccesRoot = join(repoRoot, 'eacces-case')
    await mkdir(eaccesRoot)
    await seedPausedLoop(eaccesRoot)
    const privateDoc = join(eaccesRoot, 'LOOP.md')
    await chmod(privateDoc, 0o000)

    const yamlRoot = join(repoRoot, 'yaml-case')
    await mkdir(join(yamlRoot, '.pipeline'), { recursive: true })
    await writeFile(join(yamlRoot, '.pipeline', 'loops.yaml'), 'version: [\n', 'utf8')
    await writeFile(join(yamlRoot, 'LOOP.md'), '# LOOP\n', 'utf8')

    try {
      for (const [root, message] of [
        [symlinkRoot, /symlink/i],
        [eaccesRoot, /EACCES/],
        [yamlRoot, /YAML|loops/i],
      ] as const) {
        const deps = makeDeps({ cwd: root })
        const code = await cmdLoopSync(deps, ['loop-a', '--dry-run', '--json'])
        expect(code, root).not.toBe(0)
        expect(deps.errLines, root).toEqual([])
        expect(deps.outLines, root).toHaveLength(1)
        expect(JSON.parse(deps.outLines[0]!)).toMatchObject({
          schema_version: 1,
          command: 'loop-sync',
          ok: false,
          mode: 'dry-run',
          status: 'error',
          scope: { kind: 'loop', loop_id: 'loop-a' },
          error: { code: 'source-error', message: expect.stringMatching(message) },
        })
      }
    } finally {
      await chmod(privateDoc, 0o600)
    }
  })

  test('the observation-only run log is also read strictly and never follows a symlink', async () => {
    await seedPausedLoop()
    await mkdir(join(repoRoot, '.superpowers', 'loops'), { recursive: true })
    const actual = join(repoRoot, 'actual-progress.md')
    await writeFile(actual, '| 2026-07-06T00:00 | loop-a | run | 0 | change=loop-a-one |\n', 'utf8')
    await symlink(actual, join(repoRoot, '.superpowers', 'loops', 'progress.md'))
    const loopDocBefore = await readFile(join(repoRoot, 'LOOP.md'))
    const deps = makeDeps({ cwd: repoRoot })

    const code = await cmdLoopSync(deps, ['loop-a', '--dry-run', '--json'])

    expect(code).not.toBe(0)
    expect(deps.errLines).toEqual([])
    expect(JSON.parse(deps.outLines[0]!)).toMatchObject({
      ok: false,
      status: 'error',
      error: { code: 'source-error', message: expect.stringMatching(/run.log.*symlink/i) },
    })
    expect(await readFile(join(repoRoot, 'LOOP.md'))).toEqual(loopDocBefore)
  })

  test('--auto-fix is rejected explicitly instead of becoming a no-op compatibility flag', async () => {
    await seedPausedLoop()
    const loopDocBefore = await readFile(join(repoRoot, 'LOOP.md'))
    const deps = makeDeps({ cwd: repoRoot })

    const code = await cmdLoopSync(deps, ['loop-a', '--auto-fix', '--json'])

    expect(code).not.toBe(0)
    expect(deps.errLines).toEqual([])
    expect(JSON.parse(deps.outLines[0]!)).toMatchObject({
      schema_version: 1,
      command: 'loop-sync',
      ok: false,
      status: 'error',
      error: {
        code: 'unsupported-auto-fix',
        message: expect.stringMatching(/不支持.*--auto-fix.*--dry-run.*--apply/),
      },
    })
    expect(await readFile(join(repoRoot, 'LOOP.md'))).toEqual(loopDocBefore)
  })
})
