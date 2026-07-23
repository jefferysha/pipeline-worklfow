import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { DriftReport } from './drift.js'
import {
  applyReconciliationPlan,
  readReconciliationSnapshot,
} from './reconciliation-store.js'
import {
  buildReconciliationPlan,
  encodeReconciliationPlan,
  ReconciliationPlanCodecError,
} from './reconciliation.js'
import type { ReconciliationPlan } from './reconciliation.js'
import type { LoopEntry } from './types.js'

let repoRoot: string

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'reconciliation-store-'))
})

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true })
})

function loop(): LoopEntry {
  return {
    id: 'loop-a',
    name: 'Loop A',
    kind: 'orchestrator',
    goal: 'Keep the declared loop mirror synchronized.',
    cadence: '1h',
    risk: 'low',
    runner: 'codex',
    change_prefix: 'loop-a-',
    phases: ['decide', 'record'],
    human_gates: ['destructive changes'],
    state: 'docs/loops/progress.md',
    design_doc: 'LOOP.md',
    status: 'active',
    budget: { max_runs_per_day: 4, max_in_flight: 1, on_exceed: 'pause' },
    kill_criteria: ['goal reached'],
    autonomy_level: 'L1',
    allowlist: [],
    denylist: [],
    skill_bundle_id: null,
  }
}

function registryText(): string {
  return [
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
    '    status: active',
    '    budget:',
    '      max_runs_per_day: 4',
    '      max_in_flight: 1',
    '      on_exceed: pause',
    '    kill_criteria: [goal reached]',
    '',
  ].join('\n')
}

async function seedRegistry(text = registryText()): Promise<void> {
  await mkdir(join(repoRoot, '.pipeline'), { recursive: true })
  await writeFile(join(repoRoot, '.pipeline', 'loops.yaml'), text, 'utf8')
}

function missingMirrorReport(): DriftReport {
  return {
    version: 1,
    generated_at: '2026-07-19T03:00:00.000Z',
    clean: false,
    checked: ['loop-a'],
    items: [{
      loop: 'loop-a',
      dimension: 'mirror-missing',
      severity: 'warn',
      detail: 'registry loop loop-a is absent from LOOP.md',
      suggestion: 'add its managed mirror',
    }],
  }
}

async function missingMirrorPlan(): Promise<ReconciliationPlan> {
  const snapshot = await readReconciliationSnapshot(repoRoot)
  return buildReconciliationPlan({
    generated_at: '2026-07-19T03:01:02.003Z',
    scope: { kind: 'all' },
    loops: [loop()],
    registry_epoch: snapshot.registry_epoch,
    run_log_epoch: { kind: 'absent' },
    loop_doc_bytes: snapshot.loop_doc_bytes,
    drift_report: missingMirrorReport(),
  })
}

const APPLY_CHILD_SOURCE = `
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { applyReconciliationPlan } from './reconciliation-store.ts'

const [repoRoot, planPath, barrierPath, resultPath] = process.argv.slice(2)
if (!repoRoot || !planPath || !barrierPath || !resultPath) throw new Error('missing child argument')
const encoded = await readFile(planPath)
process.stdout.write('ready\\n')
while (!existsSync(barrierPath)) await sleep(5)
const result = await applyReconciliationPlan(repoRoot, encoded)
await writeFile(resultPath, JSON.stringify(result))
`

async function bundleApplyChild(directory: string): Promise<string> {
  const outfile = join(directory, 'apply-child.mjs')
  await build({
    stdin: {
      contents: APPLY_CHILD_SOURCE,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
  })
  return outfile
}

function spawnApplyChild(
  script: string,
  args: readonly string[],
): { readonly ready: Promise<void>; readonly done: Promise<void>; readonly kill: () => void } {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', () => {
      if (stdout.includes('ready')) resolve()
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (!stdout.includes('ready')) reject(new Error(`child exited before ready: code=${code} signal=${signal}\n${stderr}`))
    })
  })
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`child failed: code=${code} signal=${signal}\n${stderr}`))
    })
  })
  void ready.catch(() => {})
  void done.catch(() => {})
  return { ready, done, kill: () => { child.kill('SIGKILL') } }
}

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)
        timer.unref()
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

describe('readReconciliationSnapshot', () => {
  test('hashes exact registry and LOOP.md bytes while keeping absent distinct from an empty file', async () => {
    const registryBytes = Buffer.from([0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e, 0x3a, 0x20, 0x31, 0x0d, 0x0a])
    await mkdir(join(repoRoot, '.pipeline'), { recursive: true })
    await writeFile(join(repoRoot, '.pipeline', 'loops.yaml'), registryBytes)

    const absentDoc = await readReconciliationSnapshot(repoRoot)
    expect(absentDoc.registry_epoch).toEqual({
      kind: 'sha256',
      value: createHash('sha256').update(registryBytes).digest('hex'),
    })
    expect(absentDoc.registry_bytes).toEqual(new Uint8Array(registryBytes))
    expect(absentDoc.loop_doc_epoch).toEqual({ kind: 'absent' })
    expect(absentDoc.loop_doc_bytes).toBeNull()

    await writeFile(join(repoRoot, 'LOOP.md'), new Uint8Array())
    const emptyDoc = await readReconciliationSnapshot(repoRoot)
    expect(emptyDoc.loop_doc_epoch).toEqual({
      kind: 'sha256',
      value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    })
    expect(emptyDoc.loop_doc_bytes).toEqual(new Uint8Array())
  })

  test('rejects a symlink instead of following it', async () => {
    await mkdir(join(repoRoot, '.pipeline'), { recursive: true })
    await writeFile(join(repoRoot, 'registry-real.yaml'), 'version: 1\nloops: []\n')
    await symlink(join(repoRoot, 'registry-real.yaml'), join(repoRoot, '.pipeline', 'loops.yaml'))

    await expect(readReconciliationSnapshot(repoRoot)).rejects.toMatchObject({
      _tag: 'ReconciliationResourceError',
      resource: 'registry',
      reason: 'symlink',
    })
  })

  test('rejects a directory instead of treating it as document bytes', async () => {
    await mkdir(join(repoRoot, 'LOOP.md'))

    await expect(readReconciliationSnapshot(repoRoot)).rejects.toMatchObject({
      _tag: 'ReconciliationResourceError',
      resource: 'loop_doc',
      reason: 'not-regular-file',
    })
  })

  test('propagates EACCES as a resource failure instead of absent', async () => {
    const loopDocPath = join(repoRoot, 'LOOP.md')
    await writeFile(loopDocPath, '# private\n')
    await chmod(loopDocPath, 0o000)
    try {
      await expect(readReconciliationSnapshot(repoRoot)).rejects.toMatchObject({
        _tag: 'ReconciliationResourceError',
        resource: 'loop_doc',
        code: 'EACCES',
      })
    } finally {
      await chmod(loopDocPath, 0o600)
    }
  })
})

describe('applyReconciliationPlan', () => {
  test('publishes one pure post-image and leaves no temporary file', async () => {
    await seedRegistry()
    await writeFile(join(repoRoot, 'LOOP.md'), '# Human notes\n\nKeep this text.\n', 'utf8')
    const plan = await missingMirrorPlan()

    const result = await applyReconciliationPlan(repoRoot, encodeReconciliationPlan(plan))

    expect(result).toEqual({
      status: 'applied',
      plan_id: plan.plan_id,
      loop_doc_epoch: plan.expected_loop_doc_epoch,
      warnings: [],
    })
    const written = await readFile(join(repoRoot, 'LOOP.md'), 'utf8')
    expect(written).toContain('# Human notes\n\nKeep this text.\n')
    expect(written.match(/PIPELINE:LOOP-MIRROR-V1:START loop-a/g)).toHaveLength(1)
    expect(written.match(/PIPELINE:LOOP-MIRROR-V1:END loop-a/g)).toHaveLength(1)
    expect((await readdir(repoRoot)).filter((name) => name.includes('.LOOP.md.tmp.'))).toEqual([])
  })

  test('returns a typed zero-write conflict when the registry epoch is stale', async () => {
    await seedRegistry()
    const loopDocPath = join(repoRoot, 'LOOP.md')
    await writeFile(loopDocPath, '# Original LOOP.md\n', 'utf8')
    const plan = await missingMirrorPlan()
    await writeFile(join(repoRoot, '.pipeline', 'loops.yaml'), `${registryText()}# concurrent edit\n`, 'utf8')
    const fresh = await readReconciliationSnapshot(repoRoot)
    const before = await readFile(loopDocPath)

    const result = await applyReconciliationPlan(repoRoot, encodeReconciliationPlan(plan))

    expect(result).toEqual({
      status: 'conflict',
      reason: 'stale-precondition',
      plan_id: plan.plan_id,
      conflicts: [{
        resource: 'registry',
        expected: plan.preconditions.registry_epoch,
        actual: fresh.registry_epoch,
      }],
    })
    expect(await readFile(loopDocPath)).toEqual(before)
    expect((await readdir(repoRoot)).filter((name) => name.includes('.LOOP.md.tmp.'))).toEqual([])
  })

  test('returns a typed zero-write conflict when the LOOP.md epoch is stale', async () => {
    await seedRegistry()
    const loopDocPath = join(repoRoot, 'LOOP.md')
    await writeFile(loopDocPath, '# Original LOOP.md\n', 'utf8')
    const plan = await missingMirrorPlan()
    const concurrent = Buffer.from('# Concurrent LOOP.md edit\n', 'utf8')
    await writeFile(loopDocPath, concurrent)
    const fresh = await readReconciliationSnapshot(repoRoot)

    const result = await applyReconciliationPlan(repoRoot, encodeReconciliationPlan(plan))

    expect(result).toEqual({
      status: 'conflict',
      reason: 'stale-precondition',
      plan_id: plan.plan_id,
      conflicts: [{
        resource: 'loop_doc',
        expected: plan.preconditions.loop_doc_epoch,
        actual: fresh.loop_doc_epoch,
      }],
    })
    expect(await readFile(loopDocPath)).toEqual(concurrent)
    expect((await readdir(repoRoot)).filter((name) => name.includes('.LOOP.md.tmp.'))).toEqual([])
  })

  test('rejects a tampered plan_id before acquiring the governance lock', async () => {
    await seedRegistry()
    const plan = await missingMirrorPlan()
    const tampered = JSON.parse(encodeReconciliationPlan(plan)) as Record<string, unknown>
    tampered.plan_id = '0'.repeat(64)

    await expect(applyReconciliationPlan(repoRoot, JSON.stringify(tampered)))
      .rejects.toBeInstanceOf(ReconciliationPlanCodecError)
    await expect(access(join(repoRoot, '.pipeline', 'loops', 'governance')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(repoRoot)).filter((name) => name.includes('.LOOP.md.tmp.'))).toEqual([])
  })

  test('fails loud on invalid registry bytes without touching LOOP.md', async () => {
    await mkdir(join(repoRoot, '.pipeline'), { recursive: true })
    await writeFile(join(repoRoot, '.pipeline', 'loops.yaml'), new Uint8Array([0xff, 0xfe, 0xfd]))
    const loopDocPath = join(repoRoot, 'LOOP.md')
    await writeFile(loopDocPath, '# Original LOOP.md\n', 'utf8')
    const plan = await missingMirrorPlan()
    const before = await readFile(loopDocPath)

    await expect(applyReconciliationPlan(repoRoot, encodeReconciliationPlan(plan)))
      .rejects.toMatchObject({
        _tag: 'ReconciliationSourceError',
        source: 'registry',
      })
    expect(await readFile(loopDocPath)).toEqual(before)
    expect((await readdir(repoRoot)).filter((name) => name.includes('.LOOP.md.tmp.'))).toEqual([])
  })

  test('fails loud on corrupt managed sections without touching LOOP.md', async () => {
    await seedRegistry()
    const loopDocPath = join(repoRoot, 'LOOP.md')
    const corrupt = Buffer.from('<!-- PIPELINE:LOOP-MIRROR-V1:START loop-a -->\n', 'utf8')
    await writeFile(loopDocPath, corrupt)
    const plan = await missingMirrorPlan()

    await expect(applyReconciliationPlan(repoRoot, encodeReconciliationPlan(plan)))
      .rejects.toMatchObject({
        _tag: 'ReconciliationSourceError',
        source: 'loop_doc',
      })
    expect(await readFile(loopDocPath)).toEqual(corrupt)
    expect((await readdir(repoRoot)).filter((name) => name.includes('.LOOP.md.tmp.'))).toEqual([])
  })

  test('two real processes applying the same plan produce exactly one apply and no duplicate section or temp', async () => {
    await seedRegistry()
    await writeFile(join(repoRoot, 'LOOP.md'), '# Concurrent apply\n', 'utf8')
    const plan = await missingMirrorPlan()
    const childDir = await mkdtemp(join(tmpdir(), 'reconciliation-apply-child-'))
    const planPath = join(childDir, 'plan.json')
    const barrierPath = join(childDir, 'go')
    const resultAPath = join(childDir, 'result-a.json')
    const resultBPath = join(childDir, 'result-b.json')
    await writeFile(planPath, encodeReconciliationPlan(plan), 'utf8')
    const script = await bundleApplyChild(childDir)
    const childA = spawnApplyChild(script, [repoRoot, planPath, barrierPath, resultAPath])
    const childB = spawnApplyChild(script, [repoRoot, planPath, barrierPath, resultBPath])
    try {
      await within(Promise.all([childA.ready, childB.ready]), 10_000)
      await writeFile(barrierPath, 'go\n', 'utf8')
      await within(Promise.all([childA.done, childB.done]), 10_000)

      const results = await Promise.all([
        readFile(resultAPath, 'utf8').then((raw) => JSON.parse(raw) as { status: string }),
        readFile(resultBPath, 'utf8').then((raw) => JSON.parse(raw) as { status: string }),
      ])
      expect(results.filter((result) => result.status === 'applied')).toHaveLength(1)
      expect(results.filter((result) => result.status === 'noop' || result.status === 'conflict')).toHaveLength(1)

      const written = await readFile(join(repoRoot, 'LOOP.md'), 'utf8')
      expect(written.match(/PIPELINE:LOOP-MIRROR-V1:START loop-a/g)).toHaveLength(1)
      expect(written.match(/PIPELINE:LOOP-MIRROR-V1:END loop-a/g)).toHaveLength(1)
      expect((await readdir(repoRoot)).filter((name) => name.includes('.LOOP.md.tmp.'))).toEqual([])
    } finally {
      childA.kill()
      childB.kill()
      await rm(childDir, { recursive: true, force: true })
    }
  }, 20_000)

  test('reports a post-commit directory fsync failure as an applied warning', async () => {
    await seedRegistry()
    await writeFile(join(repoRoot, 'LOOP.md'), '# Commit point\n', 'utf8')
    const plan = await missingMirrorPlan()
    let result: Awaited<ReturnType<typeof applyReconciliationPlan>>

    await chmod(repoRoot, 0o300)
    try {
      result = await applyReconciliationPlan(repoRoot, encodeReconciliationPlan(plan))
    } finally {
      await chmod(repoRoot, 0o700)
    }

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.warnings).toEqual([
      expect.objectContaining({ stage: 'directory-fsync' }),
    ])
    expect(await readFile(join(repoRoot, 'LOOP.md'), 'utf8')).toContain(
      '<!-- PIPELINE:LOOP-MIRROR-V1:START loop-a -->',
    )
  })
})
