import { statSync } from 'node:fs'
import { join } from 'node:path'

/** Shared project-root-relative file capability for transition execution and predictive snapshots. */
export function projectFileExists(root: string, repoRelativePath: string): boolean {
  try {
    return statSync(join(root, repoRelativePath)).isFile()
  } catch {
    return false
  }
}
