import { lstat } from 'node:fs/promises'
import { join } from 'node:path'

async function metadataPart(path: string): Promise<string | null> {
  try {
    const metadata = await lstat(path, { bigint: true })
    const kind = metadata.isDirectory() ? 'directory' : metadata.isFile() ? 'file' : 'other'
    return `${path}:${kind}:${metadata.size}:${metadata.mtimeNs}`
  } catch {
    return null
  }
}

export async function repositoryTopologyFingerprint(root: string): Promise<readonly string[]> {
  const dotGit = join(root, '.git')
  const entry = await metadataPart(dotGit)
  if (entry === null) return []
  const worktrees = await metadataPart(join(dotGit, 'worktrees'))
  return worktrees === null ? [entry] : [entry, worktrees]
}
