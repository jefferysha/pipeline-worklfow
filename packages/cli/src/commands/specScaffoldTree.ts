import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

export async function copyOrdinaryTree(source: string, target: string): Promise<void> {
  await mkdir(target)
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = resolve(source, entry.name)
    const targetPath = resolve(target, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`spec scaffold 事务拒绝复制 symlink: ${sourcePath}`)
    }
    if (entry.isDirectory()) {
      await copyOrdinaryTree(sourcePath, targetPath)
    } else if (entry.isFile()) {
      await copyFile(sourcePath, targetPath)
    } else {
      throw new Error(`spec scaffold 事务只允许普通文件和目录: ${sourcePath}`)
    }
  }
}

/** Re-copy only files outside the scaffold's exact managed file set into an existing stage tree. */
export async function syncUnmanagedOrdinaryTree(
  source: string,
  target: string,
  managedPaths: ReadonlySet<string>,
): Promise<void> {
  const walk = async (sourceDirectory: string, targetDirectory: string): Promise<void> => {
    for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
      const sourcePath = resolve(sourceDirectory, entry.name)
      const targetPath = resolve(targetDirectory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`spec scaffold 事务拒绝同步 symlink: ${sourcePath}`)
      }
      if (entry.isDirectory()) {
        await mkdir(targetPath, { recursive: true })
        await walk(sourcePath, targetPath)
      } else if (entry.isFile()) {
        const relativePath = relative(source, sourcePath)
        if (!managedPaths.has(relativePath)) await copyFile(sourcePath, targetPath)
      } else {
        throw new Error(`spec scaffold 事务只允许普通文件和目录: ${sourcePath}`)
      }
    }
  }
  await walk(source, target)
}

export async function ordinaryTreeDigest(root: string): Promise<string> {
  const hash = createHash('sha256')
  const walk = async (directory: string, prefix: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const pathname = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`spec scaffold 事务拒绝摘要 symlink: ${pathname}`)
      }
      if (entry.isDirectory()) {
        hash.update(`D\0${relativePath}\0`)
        await walk(pathname, relativePath)
      } else if (entry.isFile()) {
        const content = await readFile(pathname)
        hash.update(`F\0${relativePath}\0${content.byteLength}\0`)
        hash.update(content)
        hash.update('\0')
      } else {
        throw new Error(`spec scaffold 事务只允许普通文件和目录: ${pathname}`)
      }
    }
  }
  await walk(root, '')
  return hash.digest('hex')
}

export async function ordinaryDirectoryIdentity(target: string): Promise<string> {
  const info = await lstat(target)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`spec scaffold 事务目标必须是非 symlink 目录: ${target}`)
  }
  return `${info.dev}:${info.ino}`
}

export function ordinaryPathKey(target: string): string {
  return createHash('sha256').update(target).digest('hex').slice(0, 16)
}
