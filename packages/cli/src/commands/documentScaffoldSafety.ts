import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { ensureTrustedProjectDirectory } from '@pipeline-lite/kernel'

export function ordinaryDocumentFile(info: Awaited<ReturnType<typeof lstat>>): boolean {
  return info.isFile() && !info.isSymbolicLink()
}

function validCapability(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value) && !value.includes('..')
}

export function requiredDeltaCapability(requestedCapability?: string): string {
  if (requestedCapability !== undefined) {
    if (!validCapability(requestedCapability)) {
      throw new Error(`capability 非法: '${requestedCapability}'`)
    }
    return requestedCapability
  }
  throw new Error('delta-spec scaffold 必须传 --capability <name>')
}

export async function assertSafeChangeRoot(repoRoot: string, changeRoot: string): Promise<void> {
  const root = resolve(repoRoot)
  const lexical = relative(root, resolve(changeRoot))
  if (lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical)) {
    throw new Error(`Change 根越过项目根: ${changeRoot}`)
  }
  const rootInfo = await lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(`项目根必须是非 symlink 目录: ${root}`)
  }
  let cursor = root
  for (const segment of lexical.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    const info = await lstat(cursor)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Change 根路径必须是非 symlink 目录: ${cursor}`)
    }
  }
  const [rootReal, changeReal] = await Promise.all([realpath(root), realpath(changeRoot)])
  const escaped = relative(rootReal, changeReal)
  if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
    throw new Error(`Change 根真实路径越过项目根: ${changeRoot}`)
  }
}

export async function ensureSafeDocumentParent(repoRoot: string, target: string): Promise<string> {
  return ensureTrustedProjectDirectory(repoRoot, dirname(target))
}
