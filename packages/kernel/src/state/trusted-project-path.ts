import { lstat, mkdir, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

function escaped(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

async function ordinaryDirectory(target: string): Promise<void> {
  const info = await lstat(target)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`可信路径必须是非 symlink 目录: ${target}`)
  }
}

/**
 * Create a directory chain inside a trusted project root without following a pre-existing symlink.
 *
 * Each component is created separately and immediately re-validated. The final realpath check
 * catches lexical aliases before callers publish files. Callers must still use atomic no-replace
 * publication for the final file because a path check alone is not a multi-file transaction.
 */
export async function ensureTrustedProjectDirectory(
  repoRoot: string,
  targetDirectory: string,
): Promise<string> {
  const root = resolve(repoRoot)
  const target = resolve(targetDirectory)
  if (escaped(root, target)) {
    throw new Error(`可信路径越过项目根: ${targetDirectory}`)
  }

  await ordinaryDirectory(root)
  let cursor = root
  const segments = relative(root, target).split(sep).filter(Boolean)
  for (const segment of segments) {
    cursor = resolve(cursor, segment)
    try {
      await ordinaryDirectory(cursor)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      try {
        await mkdir(cursor)
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError
      }
      await ordinaryDirectory(cursor)
    }
  }

  const [rootReal, targetReal] = await Promise.all([realpath(root), realpath(target)])
  if (escaped(rootReal, targetReal)) {
    throw new Error(`可信路径真实位置越过项目根: ${targetDirectory}`)
  }
  return target
}
