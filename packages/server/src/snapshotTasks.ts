import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function readTasksMarkdown(changeDir: string): Promise<string | undefined> {
  const target = join(changeDir, 'tasks.md')
  try {
    const info = await lstat(target)
    // A Dashboard read must never follow a task-file symlink outside the Change.
    if (!info.isFile() || info.isSymbolicLink()) return undefined
    return await readFile(target, 'utf8')
  } catch {
    return undefined
  }
}
