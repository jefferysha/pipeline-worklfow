import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'

export interface LedgerContextBundleSourceAnchor {
  readonly rootRealpath: string
  readonly sourceRealpath: string
  readonly device: number
  readonly inode: number
  readonly size: number
}

function insideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

export async function anchorLedgerContextBundleSource(
  root: string,
  absolute: string,
  displayPath = 'source',
): Promise<LedgerContextBundleSourceAnchor> {
  const [rootRealpath, info] = await Promise.all([realpath(root), lstat(absolute)])
  if (info.isSymbolicLink()) throw new Error(`source is symlink: ${displayPath}`)
  if (!info.isFile()) throw new Error(`source is not a regular file: ${displayPath}`)
  const sourceRealpath = await realpath(absolute)
  if (!insideRoot(rootRealpath, sourceRealpath)) {
    throw new Error(`source realpath escapes root: ${displayPath}`)
  }
  return {
    rootRealpath,
    sourceRealpath,
    device: info.dev,
    inode: info.ino,
    size: info.size,
  }
}

export function sameLedgerContextBundleSourceAnchor(
  left: LedgerContextBundleSourceAnchor,
  right: LedgerContextBundleSourceAnchor,
): boolean {
  return left.rootRealpath === right.rootRealpath
    && left.sourceRealpath === right.sourceRealpath
    && left.device === right.device
    && left.inode === right.inode
}
