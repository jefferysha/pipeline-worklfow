/**
 * Default-workflow OpenSpec fallback scaffold.
 *
 * `pipeline init` owns canonical state, while the interactive OpenSpec skill normally creates
 * proposal/design/tasks first. A normal-chat dispatch can be interrupted between those actions;
 * without this fallback a default Change has no truthful task source and cannot pass the open guard.
 * These files are minimal, explicitly pending, and created with `wx`: existing OpenSpec output is
 * never overwritten.
 */
import { lstat, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface DefaultOpenSpecScaffoldResult {
  /** Relative file names created by this invocation; existing regular files are preserved. */
  readonly created: readonly string[]
}

const FILES: Readonly<Record<string, string>> = {
  'proposal.md': `# Proposal\n\n## Intent\n\n> TODO(open): The pipeline entry skill must turn the user's request into a concise problem, goal, scope, and acceptance signal.\n\n## Scope\n\n> TODO(open): Record the first agreed scope and explicitly mark assumptions for explore.\n`,
  'design.md': `# Design\n\n> TODO(open): Capture the initial architecture or interaction hypothesis. Explore will replace this scaffold with evidence and decisions.\n`,
  'tasks.md': `# Tasks\n\n## Open\n\n- [ ] Turn the user request into an agreed proposal, scope, and initial acceptance signal.\n`,
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : null
}

async function existingRegularFile(target: string): Promise<boolean> {
  try {
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`OpenSpec scaffold target is not a regular file: ${target}`)
    }
    return true
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false
    throw error
  }
}

async function writeMissing(target: string, content: string): Promise<boolean> {
  if (await existingRegularFile(target)) return false
  await mkdir(dirname(target), { recursive: true })
  try {
    await writeFile(target, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    return true
  } catch (error) {
    // Another initializer may win after our lstat. Preserve its normal file; reject any other type.
    if (errorCode(error) !== 'EEXIST') throw error
    if (await existingRegularFile(target)) return false
    throw error
  }
}

/**
 * Ensure minimum documents for default/open. This does not replace `openspec new change` or
 * `openspec-propose`: their richer output may run first and remains byte-for-byte intact.
 */
export async function ensureDefaultOpenSpecScaffold(changeDir: string): Promise<DefaultOpenSpecScaffoldResult> {
  const created: string[] = []
  for (const [name, content] of Object.entries(FILES)) {
    if (await writeMissing(join(changeDir, name), content)) created.push(name)
  }
  return { created }
}
