import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compileAutomationPolicySnapshot, type LoopEntry } from '@pipeline-lite/kernel'
import { makeDeps } from '../test-support.js'
import { cmdInternalConstraintGate } from './internalConstraintGate.js'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

const policy = compileAutomationPolicySnapshot({
  id: 'lp', name: 'Loop', kind: 'continuous', goal: 'Constrain autonomous writes', cadence: 'manual', risk: 'low',
  runner: 'codex', change_prefix: 'x', phases: [], human_gates: [], state: 'iteration', design_doc: 'GOAL.md',
  status: 'active', budget: { max_runs_per_day: 2, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: [],
  autonomy_level: 'L3', allowlist: ['src/**'], denylist: ['src/secrets/**'], skill_bundle_id: '_all',
} satisfies LoopEntry, { capturedAt: '2026-07-19T00:00:00.000Z' })

async function run(paths: string[], policyText = JSON.stringify(policy)): Promise<{ code: number; errors: string[] }> {
  const root = await mkdtemp(join(tmpdir(), 'constraint-gate-'))
  roots.push(root)
  const pathsFile = join(root, 'paths.z')
  await writeFile(pathsFile, Buffer.from(`${paths.join('\0')}\0`))
  const deps = makeDeps()
  deps.env = (name) => name === 'PIPELINE_AUTOMATION_POLICY_B64'
    ? Buffer.from(policyText).toString('base64url')
    : undefined
  return { code: await cmdInternalConstraintGate(deps, 'write', pathsFile), errors: deps.errLines }
}

describe('internal-constraint-gate (H5 write authorization)', () => {
  it('所有路径命中 allowlist 且不命中 denylist → exit 0', async () => {
    expect((await run(['src/a.ts', 'src/lib/b.ts'])).code).toBe(0)
  })

  it('allowlist 外或 denylist 命中 → exit 2，并列出拒绝原因', async () => {
    const outside = await run(['docs/no.md'])
    expect(outside.code).toBe(2)
    expect(outside.errors.join('\n')).toContain('path-outside-allowlist')
    const denied = await run(['src/secrets/key.txt'])
    expect(denied.code).toBe(2)
    expect(denied.errors.join('\n')).toContain('path-denied')
  })

  it('policy env 损坏 → exit 1 fail-closed', async () => {
    expect((await run(['src/a.ts'], '{bad json')).code).toBe(1)
  })

  it('Git 路径字节不是 canonical UTF-8 → exit 1，不能借替换字符绕 denylist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'constraint-gate-invalid-path-'))
    roots.push(root)
    const pathsFile = join(root, 'paths.z')
    await writeFile(pathsFile, Buffer.from([0xff, 0x00]))
    const deps = makeDeps()
    deps.env = () => Buffer.from(JSON.stringify(policy)).toString('base64url')
    expect(await cmdInternalConstraintGate(deps, 'write', pathsFile)).toBe(1)
  })
})
