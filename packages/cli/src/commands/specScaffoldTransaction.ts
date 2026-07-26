import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import {
  atomicReplaceFile,
  ensureTrustedProjectDirectory,
} from '@tenon/kernel'
import {
  copyOrdinaryTree,
  ordinaryDirectoryIdentity,
  ordinaryTreeDigest,
  syncUnmanagedOrdinaryTree,
} from './specScaffoldTree.js'
import {
  acquireTransaction,
  receiptContent,
  receiptPaths,
  transactionReceipt,
  type TransactionReceipt,
} from './specScaffoldRecovery.js'

interface TransactionFile {
  readonly relativePath: string
  readonly content: string
}

export interface SpecScaffoldTransactionOptions {
  readonly repoRoot: string
  readonly specDirectory: string
  readonly files: readonly TransactionFile[]
  /** Test-only fault boundary; production callers omit it. */
  readonly beforeCommit?: () => void | Promise<void>
  /** Test-only fault boundary after the old envelope has moved. */
  readonly afterOriginalMove?: () => void | Promise<void>
}

function contained(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function existingOrdinaryDirectory(target: string): Promise<boolean> {
  try {
    const info = await lstat(target)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`spec scaffold 事务目标必须是非 symlink 目录: ${target}`)
    }
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * Publish an overwrite scaffold as a recoverable directory transaction.
 *
 * The complete top-level project envelope is prepared and validated beside the destination.
 * Commit moves the old envelope to a private backup, promotes the candidate, and rolls the backup
 * back if promotion fails. A durable repository-root transaction receipt serializes writers and
 * makes crash recovery deterministic; unrelated existing files inside the envelope are preserved.
 */
export async function publishSpecScaffoldTransaction(
  options: SpecScaffoldTransactionOptions,
): Promise<void> {
  const repoRoot = resolve(options.repoRoot)
  const specDirectory = resolve(options.specDirectory)
  if (!contained(repoRoot, specDirectory)) {
    throw new Error(`spec scaffold 事务路径越过项目根: ${options.specDirectory}`)
  }
  const specRelative = relative(repoRoot, specDirectory)
  const topLevelName = specRelative.split(sep).filter(Boolean)[0]
  if (!topLevelName) {
    throw new Error('spec scaffold 事务目标不能是项目根')
  }
  await ensureTrustedProjectDirectory(repoRoot, repoRoot)
  const targetParent = dirname(specDirectory)
  await ensureTrustedProjectDirectory(repoRoot, targetParent)
  const parentIdentity = await ordinaryDirectoryIdentity(targetParent)

  const suffix = `${process.pid}-${randomUUID()}`
  let receipt = transactionReceipt(specDirectory, suffix)
  const { stage, backup } = receiptPaths(specDirectory, receipt, repoRoot)
  const { lockFile } = await acquireTransaction(specDirectory, receipt, repoRoot)
  let movedOriginal = false
  let promoted = false
  let recoveryRequired = false
  let retainBackup = false
  try {
    const exists = await existingOrdinaryDirectory(specDirectory)
    let initialDigest: string | undefined
    let initialIdentity: string | undefined
    if (exists) {
      initialIdentity = await ordinaryDirectoryIdentity(specDirectory)
      initialDigest = await ordinaryTreeDigest(specDirectory)
      await copyOrdinaryTree(specDirectory, stage)
      if (await ordinaryTreeDigest(stage) !== initialDigest) {
        throw new Error('spec scaffold 复制期间检测到并发漂移，拒绝发布不一致快照')
      }
    } else {
      await mkdir(stage)
    }
    const candidateSpecDirectory = stage
    await ensureTrustedProjectDirectory(stage, candidateSpecDirectory)

    const managedPaths = new Set<string>()
    for (const file of options.files) {
      const target = resolve(candidateSpecDirectory, file.relativePath)
      if (!contained(candidateSpecDirectory, target)) {
        throw new Error(`spec scaffold 事务文件越过暂存根: ${file.relativePath}`)
      }
      await ensureTrustedProjectDirectory(candidateSpecDirectory, dirname(target))
      try {
        const info = await lstat(target)
        if (!info.isFile() || info.isSymbolicLink()) {
          throw new Error(`spec scaffold overwrite 目标必须是普通文件: ${file.relativePath}`)
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      managedPaths.add(relative(candidateSpecDirectory, target))
      await writeFile(target, file.content, 'utf8')
    }

    await options.beforeCommit?.()
    receipt = { ...receipt, state: 'prepared' }
    await atomicReplaceFile(lockFile, receiptContent(receipt))
    await ensureTrustedProjectDirectory(repoRoot, targetParent)
    if (await ordinaryDirectoryIdentity(targetParent) !== parentIdentity) {
      throw new Error('spec scaffold 提交前检测到目标父目录身份漂移')
    }
    try {
      if (exists) {
        await rename(specDirectory, backup)
        movedOriginal = true
        receipt = { ...receipt, state: 'original-moved' }
        await atomicReplaceFile(lockFile, receiptContent(receipt))
        const [backupIdentity, backupDigest] = await Promise.all([
          ordinaryDirectoryIdentity(backup),
          ordinaryTreeDigest(backup),
        ])
        if (backupIdentity !== initialIdentity || backupDigest !== initialDigest) {
          throw new Error('spec scaffold 提交前检测到目标目录并发漂移，已拒绝覆盖并回滚')
        }
        if (await ordinaryDirectoryIdentity(targetParent) !== parentIdentity) {
          throw new Error('spec scaffold 提交前检测到目标父目录身份漂移')
        }
        await options.afterOriginalMove?.()
        const postMoveDigest = await ordinaryTreeDigest(backup)
        if (postMoveDigest !== initialDigest) {
          await syncUnmanagedOrdinaryTree(backup, stage, managedPaths)
          if (await ordinaryTreeDigest(backup) !== postMoveDigest) {
            throw new Error('spec scaffold 同步未受管文件时检测到继续漂移，已拒绝发布并回滚')
          }
          // Keep the original inode tree as recoverable evidence. An already-open descriptor may
          // legally write it again after the last observable check; deleting it would silently
          // discard that write even though the managed scaffold files committed successfully.
          retainBackup = true
        }
      }
      await rename(stage, specDirectory)
      promoted = true
      receipt = { ...receipt, state: 'promoted' }
      // The target rename is the commit point. If only this post-commit diagnostic update fails,
      // the visible complete target still wins and normal cleanup finishes the transaction.
      await atomicReplaceFile(lockFile, receiptContent(receipt)).catch(() => {})
    } catch (error) {
      if (movedOriginal && !promoted) {
        try {
          if (await existingOrdinaryDirectory(specDirectory)) {
            recoveryRequired = true
            throw new Error(
              `spec scaffold 回滚时正式路径已被其他写入占用；事务证据已保留: ${specDirectory}`,
            )
          }
          await rename(backup, specDirectory)
          movedOriginal = false
        } catch (rollbackError) {
          recoveryRequired = true
          throw new AggregateError(
            [error, rollbackError],
            'spec scaffold 提交与回滚均失败；事务证据已保留供确定性恢复',
          )
        }
      }
      throw error
    }
    if (movedOriginal && !retainBackup) await rm(backup, { recursive: true, force: true })
  } finally {
    if (!promoted && !recoveryRequired) {
      await rm(stage, { recursive: true, force: true }).catch(() => {})
    }
    if (!recoveryRequired) await rm(lockFile, { force: true }).catch(() => {})
  }
}
