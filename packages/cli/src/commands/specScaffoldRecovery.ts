import { lstat, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { atomicLinkPublish } from '@pipeline-lite/kernel'
import { ordinaryPathKey } from './specScaffoldTree.js'

export type TransactionState = 'preparing' | 'prepared' | 'original-moved' | 'promoted'

export interface TransactionReceipt {
  readonly version: 1
  readonly pid: number
  readonly state: TransactionState
  readonly stageName: string
  readonly backupName: string
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

function contained(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function existingOrdinaryFile(target: string): Promise<boolean> {
  try {
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`spec scaffold 事务描述必须是非 symlink 普通文件: ${target}`)
    }
    return true
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false
    throw error
  }
}

async function existingOrdinaryDirectory(target: string): Promise<boolean> {
  try {
    const info = await lstat(target)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`spec scaffold 事务目标必须是非 symlink 目录: ${target}`)
    }
    return true
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false
    throw error
  }
}

export function transactionReceipt(
  specDirectory: string,
  suffix: string,
  state: TransactionState = 'preparing',
): TransactionReceipt {
  const targetName = basename(specDirectory)
  return {
    version: 1,
    pid: process.pid,
    state,
    stageName: `${targetName}.pipeline-stage-${suffix}`,
    backupName: `${targetName}.pipeline-backup-${suffix}`,
  }
}

function parseTransactionReceipt(raw: string, specDirectory: string): TransactionReceipt {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('spec scaffold 事务描述不是合法 JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('spec scaffold 事务描述必须是对象')
  }
  const record = value as Record<string, unknown>
  const allowedStates = new Set<TransactionState>([
    'preparing', 'prepared', 'original-moved', 'promoted',
  ])
  const prefix = basename(specDirectory)
  if (Object.keys(record).some((key) =>
    !['version', 'pid', 'state', 'stageName', 'backupName'].includes(key))
    || record.version !== 1
    || typeof record.pid !== 'number'
    || !Number.isSafeInteger(record.pid)
    || record.pid < 1
    || typeof record.state !== 'string'
    || !allowedStates.has(record.state as TransactionState)
    || typeof record.stageName !== 'string'
    || typeof record.backupName !== 'string'
    || !record.stageName.startsWith(`${prefix}.pipeline-stage-`)
    || !record.backupName.startsWith(`${prefix}.pipeline-backup-`)
    || basename(record.stageName) !== record.stageName
    || basename(record.backupName) !== record.backupName) {
    throw new Error('spec scaffold 事务描述形状非法')
  }
  return {
    version: 1,
    pid: record.pid,
    state: record.state as TransactionState,
    stageName: record.stageName,
    backupName: record.backupName,
  }
}

export function receiptContent(receipt: TransactionReceipt): string {
  return `${JSON.stringify(receipt)}\n`
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) !== 'ESRCH'
  }
}

export function receiptPaths(
  specDirectory: string,
  receipt: TransactionReceipt,
  anchor = dirname(specDirectory),
): { readonly stage: string; readonly backup: string } {
  const stage = resolve(anchor, receipt.stageName)
  const backup = resolve(anchor, receipt.backupName)
  if (!contained(anchor, stage) || !contained(anchor, backup)) {
    throw new Error('spec scaffold 事务描述越过事务锚点')
  }
  return { stage, backup }
}

async function recoverClaimedTransaction(
  specDirectory: string,
  recoveryFile: string,
  anchor: string,
): Promise<void> {
  await existingOrdinaryFile(recoveryFile)
  const receipt = parseTransactionReceipt(await readFile(recoveryFile, 'utf8'), specDirectory)
  const { stage, backup } = receiptPaths(specDirectory, receipt, anchor)
  const [targetExists, stageExists, backupExists] = await Promise.all([
    existingOrdinaryDirectory(specDirectory),
    existingOrdinaryDirectory(stage),
    existingOrdinaryDirectory(backup),
  ])

  if (targetExists && receipt.state === 'original-moved' && (stageExists || backupExists)) {
    throw new Error(
      `spec scaffold 原目录移走后正式路径被其他写入占用；保留事务证据并拒绝覆盖: ${specDirectory}`,
    )
  }
  if (targetExists) {
    if (stageExists) await rm(stage, { recursive: true, force: true })
    if (backupExists) await rm(backup, { recursive: true, force: true })
    return
  }
  if (stageExists && backupExists) {
    await rename(stage, specDirectory)
    await rm(backup, { recursive: true, force: true })
    return
  }
  if (backupExists) {
    await rename(backup, specDirectory)
    if (stageExists) await rm(stage, { recursive: true, force: true })
    return
  }
  if (stageExists && receipt.state !== 'preparing') {
    await rename(stage, specDirectory)
    return
  }
  if (stageExists) await rm(stage, { recursive: true, force: true })
}

async function recoverStaleTransaction(
  specDirectory: string,
  lockFile: string,
  recoveryFile: string,
  anchor: string,
): Promise<'recovered' | 'retry'> {
  if (await existingOrdinaryFile(recoveryFile)) {
    throw new Error(`spec scaffold 事务正在恢复，拒绝并发写入: ${specDirectory}`)
  }
  if (!await existingOrdinaryFile(lockFile)) return 'retry'
  const receipt = parseTransactionReceipt(await readFile(lockFile, 'utf8'), specDirectory)
  if (processIsAlive(receipt.pid)) {
    throw new Error(`spec scaffold 事务 owner pid=${receipt.pid} 仍在运行，拒绝并发写入`)
  }
  try {
    await rename(lockFile, recoveryFile)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return 'retry'
    throw error
  }
  let recovered = false
  try {
    await recoverClaimedTransaction(specDirectory, recoveryFile, anchor)
    recovered = true
  } finally {
    if (recovered) await rm(recoveryFile, { force: true })
    else await rename(recoveryFile, lockFile).catch(() => {})
  }
  return 'recovered'
}

export async function acquireTransaction(
  specDirectory: string,
  receipt: TransactionReceipt,
  anchor: string,
): Promise<{ readonly lockFile: string; readonly recoveryFile: string }> {
  const lockFile = resolve(
    anchor,
    `.pipeline-spec-transaction-${ordinaryPathKey(specDirectory)}.json`,
  )
  const recoveryFile = `${lockFile}.recovering`
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await existingOrdinaryFile(recoveryFile)) {
      throw new Error(`spec scaffold 事务正在恢复，拒绝并发写入: ${specDirectory}`)
    }
    try {
      await atomicLinkPublish(
        anchor,
        '.pipeline-spec-transaction.tmp',
        lockFile,
        receiptContent(receipt),
      )
      return { lockFile, recoveryFile }
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
      await recoverStaleTransaction(specDirectory, lockFile, recoveryFile, anchor)
    }
  }
  throw new Error(`spec scaffold 事务锁竞争未收敛: ${specDirectory}`)
}
