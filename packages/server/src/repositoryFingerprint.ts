import { lstat } from 'node:fs/promises'
import { join, sep } from 'node:path'

type MetadataPart = {
  readonly value: string
  readonly directory: boolean
}

type MetadataMode = 'volatile' | 'stable' | 'stable-directory'

async function metadataPart(
  path: string,
  mode: MetadataMode = 'volatile',
  lookupPath = path,
): Promise<MetadataPart | null> {
  try {
    const metadata = await lstat(lookupPath, { bigint: true })
    const kind = metadata.isDirectory() ? 'directory' : metadata.isFile() ? 'file' : 'other'
    const stableIdentity = mode === 'stable' || (mode === 'stable-directory' && metadata.isDirectory())
    return {
      value: stableIdentity
        ? `${path}:${kind}:${metadata.dev}:${metadata.ino}`
        : `${path}:${kind}:${metadata.size}:${metadata.mtimeNs}`,
      directory: metadata.isDirectory(),
    }
  } catch {
    return null
  }
}

export async function repositoryTopologyFingerprint(root: string): Promise<readonly string[]> {
  // On Linux an anchored project root is exposed as `/proc/self/fd/<n>`, whose leaf is a symlink.
  // Traversing `/.` keeps the lookup bound to the opened directory while retaining the stable root
  // label in the fingerprint. Without this, Linux classified the fd path as `other` and returned
  // before observing a newly created `.git` directory, so the Dashboard missed repository regrouping.
  const rootEntry = await metadataPart(root, 'stable', `${root}${sep}.`)
  if (rootEntry === null) return []
  if (!rootEntry.directory) return [rootEntry.value]

  const dotGit = join(root, '.git')
  const entry = await metadataPart(dotGit, 'stable-directory')
  if (entry === null) return [rootEntry.value]
  if (!entry.directory) return [rootEntry.value, entry.value]

  const worktrees = await metadataPart(join(dotGit, 'worktrees'))
  return worktrees === null
    ? [rootEntry.value, entry.value]
    : [rootEntry.value, entry.value, worktrees.value]
}
