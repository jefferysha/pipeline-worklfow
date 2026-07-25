#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { applyFileCas } from './spec-migration-cas.mjs'

const exec = promisify(execFile)
const APPLY = process.argv.includes('--apply')
const ROOT = resolve(process.cwd())
const changeIndex = process.argv.indexOf('--change')
const CHANGE = changeIndex === -1
  ? 'trellis-style-documentation-site'
  : process.argv[changeIndex + 1]
if (typeof CHANGE !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(CHANGE)) {
  throw new Error('migration --change 必须是合法 Change 名称')
}
const RECEIPT_PATH = resolve(
  ROOT,
  `openspec/changes/${CHANGE}/migration/spec-application.json`,
)

function digest(content) {
  return createHash('sha256').update(content).digest('hex')
}

function assertString(value, field) {
  if (typeof value !== 'string' || value === '') throw new Error(`migration receipt ${field} 非法`)
  return value
}

function escaped(root, target) {
  const rel = relative(root, target)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

async function assertTrustedPath(root, candidate, expectedKind) {
  const repoRoot = resolve(root)
  const target = resolve(candidate)
  if (escaped(repoRoot, target)) throw new Error(`migration 路径越过项目根: ${candidate}`)
  let cursor = repoRoot
  const rootInfo = await lstat(cursor)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('migration 项目根必须是非 symlink 目录')
  }
  for (const segment of relative(repoRoot, target).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    const info = await lstat(cursor)
    if (info.isSymbolicLink()) throw new Error(`migration 可信路径拒绝 symlink: ${cursor}`)
  }
  const [rootReal, targetReal] = await Promise.all([realpath(repoRoot), realpath(target)])
  if (escaped(rootReal, targetReal)) throw new Error(`migration 真实路径越过项目根: ${candidate}`)
  const targetInfo = await lstat(target)
  if (
    (expectedKind === 'file' && !targetInfo.isFile())
    || (expectedKind === 'directory' && !targetInfo.isDirectory())
  ) {
    throw new Error(`migration 可信路径类型错误: ${candidate}`)
  }
  return target
}

export function validateReceipt(value, expectedChange) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || value.schemaVersion !== 1
    || value.kind !== 'historical-spec-application-migration') {
    throw new Error('migration receipt 形状非法')
  }
  for (const field of [
    'change',
    'capability',
    'baseCommit',
    'mainSpecPath',
    'deltaSpecPath',
    'rawBeforeDigest',
    'normalizedBeforeDigest',
    'observedCurrentDigest',
    'expectedAfterDigest',
    'deltaDigest',
  ]) assertString(value[field], field)
  if (typeof value.baseNormalization !== 'object' || value.baseNormalization === null) {
    throw new Error('migration receipt baseNormalization 非法')
  }
  assertString(value.baseNormalization.fromHeader, 'baseNormalization.fromHeader')
  assertString(value.baseNormalization.purpose, 'baseNormalization.purpose')
  if (value.change !== expectedChange) {
    throw new Error(`migration receipt.change 与 --change 不一致: ${value.change}`)
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.capability)) {
    throw new Error('migration receipt capability 非法')
  }
  const expectedMain = `openspec/specs/${value.capability}/spec.md`
  const expectedDelta = `openspec/changes/${expectedChange}/specs/${value.capability}/spec.md`
  if (value.mainSpecPath !== expectedMain || value.deltaSpecPath !== expectedDelta) {
    throw new Error('migration receipt 规格路径与 Change/capability 不一致')
  }
  return value
}

async function openspecBinary() {
  const bundled = resolve(ROOT, 'node_modules/.bin/openspec')
  try {
    await access(bundled)
    return bundled
  } catch {
    return 'openspec'
  }
}

async function buildExpected(receipt) {
  const { stdout: rawBefore } = await exec(
    'git',
    ['show', `${receipt.baseCommit}:${receipt.mainSpecPath}`],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  )
  if (digest(rawBefore) !== receipt.rawBeforeDigest) {
    throw new Error('migration base commit 主规格摘要漂移')
  }
  const from = receipt.baseNormalization.fromHeader
  const matches = rawBefore.split('\n').filter((line) => line === from).length
  if (matches !== 1) throw new Error(`migration base header 命中数应为 1，实际 ${matches}`)
  const normalized = rawBefore.replace(
    from,
    `## Purpose\n\n${receipt.baseNormalization.purpose}\n\n## Requirements`,
  )
  if (digest(normalized) !== receipt.normalizedBeforeDigest) {
    throw new Error('migration 规范化前置规格摘要漂移')
  }

  const deltaPath = await assertTrustedPath(ROOT, resolve(ROOT, receipt.deltaSpecPath), 'file')
  const delta = await readFile(deltaPath)
  if (digest(delta) !== receipt.deltaDigest) throw new Error('migration delta 摘要漂移')

  const sandbox = await mkdtemp(join(tmpdir(), 'pipeline-spec-migration-'))
  try {
    const target = resolve(sandbox, receipt.mainSpecPath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, normalized, 'utf8')
    const changeSource = await assertTrustedPath(
      ROOT,
      resolve(ROOT, 'openspec/changes', receipt.change),
      'directory',
    )
    const changeTarget = resolve(sandbox, 'openspec/changes', receipt.change)
    await mkdir(dirname(changeTarget), { recursive: true })
    await cp(changeSource, changeTarget, { recursive: true })
    const { stdout, stderr } = await exec(
      await openspecBinary(),
      ['archive', receipt.change, '--yes'],
      { cwd: sandbox, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    )
    const expected = await readFile(target)
    const expectedDigest = digest(expected)
    if (expectedDigest !== receipt.expectedAfterDigest) {
      throw new Error(
        `migration 官方 OpenSpec 重建摘要与 expectedAfterDigest 不一致: actual=${expectedDigest}`,
      )
    }
    const operationLine = `${stdout}\n${stderr}`
    for (const [name, symbol] of [['added', '+'], ['modified', '~'], ['removed', '-']]) {
      const count = receipt.expectedOperations?.[name]
      if (!Number.isSafeInteger(count) || !operationLine.includes(`${symbol} ${count}`)) {
        throw new Error(`migration OpenSpec ${name} 操作计数不匹配`)
      }
    }
    return expected
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}

async function main() {
  const receiptRaw = await readFile(
    await assertTrustedPath(ROOT, RECEIPT_PATH, 'file'),
  )
  const receipt = validateReceipt(JSON.parse(receiptRaw.toString('utf8')), CHANGE)
  const receiptDigest = digest(receiptRaw)
  const currentPath = await assertTrustedPath(
    ROOT,
    resolve(ROOT, receipt.mainSpecPath),
    'file',
  )
  const currentBefore = await readFile(currentPath)
  const beforeDigest = digest(currentBefore)
  if (beforeDigest !== receipt.observedCurrentDigest && beforeDigest !== receipt.expectedAfterDigest) {
    throw new Error(`migration 当前主规格不在 CAS 闭集: ${beforeDigest}`)
  }

  const expected = await buildExpected(receipt)
  let effect = 'verified-pending'
  let afterDigest = beforeDigest
  let recoveryPath
  if (APPLY) {
    const result = await applyFileCas({
      repoRoot: ROOT,
      targetPath: currentPath,
      recoveryDirectory: resolve(ROOT, `openspec/changes/${CHANGE}/migration/recovery`),
      observedDigest: receipt.observedCurrentDigest,
      expectedBytes: expected,
      expectedDigest: receipt.expectedAfterDigest,
    })
    effect = result.effect
    afterDigest = result.afterDigest
    if (result.recoveryPath) recoveryPath = result.recoveryPath
  } else if (beforeDigest === receipt.expectedAfterDigest) {
    effect = 'no-op'
  }

  if (APPLY && afterDigest !== receipt.expectedAfterDigest) {
    throw new Error('migration apply 后摘要不匹配')
  }
  const output = {
    schemaVersion: 1,
    kind: 'spec-migration-application',
    change: receipt.change,
    capability: receipt.capability,
    receiptDigest,
    effect,
    targetPath: receipt.mainSpecPath,
    beforeDigest,
    expectedAfterDigest: receipt.expectedAfterDigest,
    afterDigest,
    ...(recoveryPath ? { recoveryPath } : {}),
  }
  process.stdout.write(`${JSON.stringify(output)}\n`)
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await main()
}
