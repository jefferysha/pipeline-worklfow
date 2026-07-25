import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { SpecMigrationGuardStatus } from '../workflow/ir.js'

function digest(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function escaped(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

async function trustedOrdinaryFile(
  repoRoot: string,
  candidate: string,
  optional = false,
): Promise<Buffer | undefined> {
  const root = resolve(repoRoot)
  const target = resolve(candidate)
  if (escaped(root, target)) throw new Error('路径越过项目根')
  let cursor = root
  const segments = relative(root, target).split(sep).filter(Boolean)
  for (const [index, segment] of segments.entries()) {
    cursor = resolve(cursor, segment)
    let info
    try {
      info = await lstat(cursor)
    } catch (error) {
      if (optional && errorCode(error) === 'ENOENT') return undefined
      throw error
    }
    if (info.isSymbolicLink()) throw new Error(`可信路径拒绝 symlink: ${relative(root, cursor)}`)
    if (index < segments.length - 1 && !info.isDirectory()) {
      throw new Error(`可信路径父级不是目录: ${relative(root, cursor)}`)
    }
    if (index === segments.length - 1 && !info.isFile()) {
      throw new Error(`迁移证据不是普通文件: ${relative(root, cursor)}`)
    }
  }
  const [rootReal, targetReal] = await Promise.all([realpath(root), realpath(target)])
  if (escaped(rootReal, targetReal)) throw new Error('迁移证据真实路径越过项目根')
  return readFile(target)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 形状非法`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${label} 非法`)
  return value
}

function parseJson(raw: Buffer, label: string): Record<string, unknown> {
  try {
    return record(JSON.parse(raw.toString('utf8')) as unknown, label)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} 不是合法 JSON`)
    throw error
  }
}

export async function evaluateSpecMigrationEvidence(
  repoRoot: string,
  changeDir: string,
  changeName: string,
): Promise<SpecMigrationGuardStatus> {
  try {
    const root = resolve(repoRoot)
    const expectedChangeDir = resolve(root, 'openspec', 'changes', changeName)
    if (resolve(changeDir) !== expectedChangeDir || escaped(root, expectedChangeDir)) {
      return { kind: 'invalid', reason: 'change-directory-mismatch' }
    }
    const migrationDir = resolve(expectedChangeDir, 'migration')
    const receiptPath = resolve(migrationDir, 'spec-application.json')
    const receiptRaw = await trustedOrdinaryFile(root, receiptPath, true)
    if (!receiptRaw) return { kind: 'not-required' }

    const receipt = parseJson(receiptRaw, 'migration receipt')
    if (
      receipt.schemaVersion !== 1
      || receipt.kind !== 'historical-spec-application-migration'
      || text(receipt.change, 'receipt.change') !== changeName
    ) {
      return { kind: 'invalid', reason: 'receipt-identity-mismatch' }
    }
    const capability = text(receipt.capability, 'receipt.capability')
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(capability)) {
      return { kind: 'invalid', reason: 'receipt-capability-invalid' }
    }
    const expectedMainPath = `openspec/specs/${capability}/spec.md`
    const expectedDeltaPath = `openspec/changes/${changeName}/specs/${capability}/spec.md`
    if (
      text(receipt.mainSpecPath, 'receipt.mainSpecPath') !== expectedMainPath
      || text(receipt.deltaSpecPath, 'receipt.deltaSpecPath') !== expectedDeltaPath
    ) {
      return { kind: 'invalid', reason: 'receipt-path-mismatch' }
    }
    const expectedDigest = text(receipt.expectedAfterDigest, 'receipt.expectedAfterDigest')
    const deltaDigest = text(receipt.deltaDigest, 'receipt.deltaDigest')
    const deltaRaw = await trustedOrdinaryFile(root, resolve(root, expectedDeltaPath))
    if (!deltaRaw || digest(deltaRaw) !== deltaDigest) {
      return { kind: 'invalid', reason: 'delta-digest-mismatch' }
    }

    const resultRaw = await trustedOrdinaryFile(
      root,
      resolve(migrationDir, 'spec-application-result.json'),
      true,
    )
    if (!resultRaw) return { kind: 'invalid', reason: 'application-result-missing' }
    const result = parseJson(resultRaw, 'migration result')
    if (
      result.schemaVersion !== 1
      || result.kind !== 'spec-migration-application'
      || result.change !== changeName
      || result.capability !== capability
      || result.receiptDigest !== digest(receiptRaw)
      || result.targetPath !== expectedMainPath
      || (result.effect !== 'changed' && result.effect !== 'no-op')
      || result.expectedAfterDigest !== expectedDigest
      || result.afterDigest !== expectedDigest
    ) {
      return { kind: 'invalid', reason: 'application-result-mismatch' }
    }
    const mainRaw = await trustedOrdinaryFile(root, resolve(root, expectedMainPath))
    if (!mainRaw || digest(mainRaw) !== expectedDigest) {
      return { kind: 'invalid', reason: 'main-spec-digest-mismatch' }
    }
    return { kind: 'applied' }
  } catch (error) {
    return {
      kind: 'invalid',
      reason: error instanceof Error ? error.message : 'migration-evidence-read-failed',
    }
  }
}
