import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { evaluateSpecMigrationEvidence } from './spec-migration-evidence.js'

function digest(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

describe('主规格迁移机器证据', () => {
  let root: string
  const change = 'docs-change'
  let changeDir: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pipeline-migration-evidence-'))
    changeDir = join(root, 'openspec', 'changes', change)
    await mkdir(join(changeDir, 'migration'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('没有 migration receipt 时明确判为不需要，而不是伪造应用结果', async () => {
    await expect(evaluateSpecMigrationEvidence(root, changeDir, change)).resolves.toEqual({
      kind: 'not-required',
    })
  })

  it('receipt、result、delta 和当前主规格全部身份/摘要绑定时通过', async () => {
    const capability = 'docs-experience'
    const main = 'expected main\n'
    const delta = 'delta\n'
    const mainPath = `openspec/specs/${capability}/spec.md`
    const deltaPath = `openspec/changes/${change}/specs/${capability}/spec.md`
    await mkdir(join(root, 'openspec', 'specs', capability), { recursive: true })
    await mkdir(join(changeDir, 'specs', capability), { recursive: true })
    await writeFile(join(root, mainPath), main)
    await writeFile(join(root, deltaPath), delta)
    const receipt = `${JSON.stringify({
      schemaVersion: 1,
      kind: 'historical-spec-application-migration',
      change,
      capability,
      mainSpecPath: mainPath,
      deltaSpecPath: deltaPath,
      expectedAfterDigest: digest(main),
      deltaDigest: digest(delta),
    }, null, 2)}\n`
    await writeFile(join(changeDir, 'migration', 'spec-application.json'), receipt)
    await writeFile(join(changeDir, 'migration', 'spec-application-result.json'), `${JSON.stringify({
      schemaVersion: 1,
      kind: 'spec-migration-application',
      change,
      capability,
      receiptDigest: digest(receipt),
      effect: 'changed',
      targetPath: mainPath,
      expectedAfterDigest: digest(main),
      afterDigest: digest(main),
    }, null, 2)}\n`)

    await expect(evaluateSpecMigrationEvidence(root, changeDir, change)).resolves.toEqual({
      kind: 'applied',
    })
  })

  it('result 未绑定当前 receipt 时失败关闭', async () => {
    const capability = 'docs-experience'
    const mainPath = `openspec/specs/${capability}/spec.md`
    const deltaPath = `openspec/changes/${change}/specs/${capability}/spec.md`
    await mkdir(join(root, 'openspec', 'specs', capability), { recursive: true })
    await mkdir(join(changeDir, 'specs', capability), { recursive: true })
    await writeFile(join(root, mainPath), 'main\n')
    await writeFile(join(root, deltaPath), 'delta\n')
    await writeFile(join(changeDir, 'migration', 'spec-application.json'), `${JSON.stringify({
      schemaVersion: 1,
      kind: 'historical-spec-application-migration',
      change,
      capability,
      mainSpecPath: mainPath,
      deltaSpecPath: deltaPath,
      expectedAfterDigest: digest('main\n'),
      deltaDigest: digest('delta\n'),
    })}\n`)
    await writeFile(join(changeDir, 'migration', 'spec-application-result.json'), `${JSON.stringify({
      schemaVersion: 1,
      kind: 'spec-migration-application',
      change,
      capability,
      receiptDigest: 'forged',
      effect: 'no-op',
      targetPath: mainPath,
      expectedAfterDigest: digest('main\n'),
      afterDigest: digest('main\n'),
    })}\n`)

    await expect(evaluateSpecMigrationEvidence(root, changeDir, change)).resolves.toEqual({
      kind: 'invalid',
      reason: 'application-result-mismatch',
    })
  })
})
