import { createHash } from 'node:crypto'
import { open, lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { atomicReplaceFile } from './atomic-publish.js'
import {
  decodeReviewAttemptBudgetState,
  ReviewAttemptBudgetError,
  type ReviewAttemptBudgetState,
  type ReviewAttemptIdentity,
} from './review-attempt-budget-model.js'

const STATE_FILE = 'review-attempt-budget.json'
const REPORT_DIR = 'review-attempt-reports'
const MAX_STATE_BYTES = 1024 * 1024
const MAX_REPORT_BYTES = 4 * 1024 * 1024

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

function statePath(changeDir: string): string {
  return join(changeDir, '.pipeline-run', STATE_FILE)
}

export async function readReviewAttemptState(changeDir: string): Promise<ReviewAttemptBudgetState | null> {
  const target = statePath(changeDir)
  let info
  try {
    info = await lstat(target)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null
    throw error
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_STATE_BYTES) {
    throw new ReviewAttemptBudgetError('Review attempt budget state 必须是受限普通文件', 'review-budget-corrupt')
  }
  try {
    return decodeReviewAttemptBudgetState(JSON.parse(await readFile(target, 'utf8')))
  } catch (error) {
    if (error instanceof ReviewAttemptBudgetError) throw error
    throw new ReviewAttemptBudgetError(`Review attempt budget state 无法解析: ${String(error)}`, 'review-budget-corrupt')
  }
}

export async function writeReviewAttemptState(
  changeDir: string,
  state: ReviewAttemptBudgetState,
): Promise<void> {
  const target = statePath(changeDir)
  await mkdir(dirname(target), { recursive: true, mode: 0o700 })
  await atomicReplaceFile(target, `${JSON.stringify(state, null, 2)}\n`)
}

export async function readContainedReviewReport(projectRoot: string, requestedPath: string): Promise<Buffer> {
  const requested = resolve(projectRoot, requestedPath)
  const lexical = relative(resolve(projectRoot), requested)
  if (lexical === '..' || lexical.startsWith(`..${sep}`) || lexical === '') {
    throw new ReviewAttemptBudgetError('Review report 必须是项目内普通文件', 'review-report-invalid')
  }
  let info
  try {
    info = await lstat(requested)
  } catch {
    throw new ReviewAttemptBudgetError(`Review report 不存在: ${requestedPath}`, 'review-report-invalid')
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_REPORT_BYTES) {
    throw new ReviewAttemptBudgetError('Review report 必须是受限、非 symlink 普通文件', 'review-report-invalid')
  }
  const [physicalRoot, physicalTarget] = await Promise.all([realpath(projectRoot), realpath(requested)])
  const physical = relative(physicalRoot, physicalTarget)
  if (physical === '..' || physical.startsWith(`..${sep}`)) {
    throw new ReviewAttemptBudgetError('Review report realpath 越出项目根', 'review-report-invalid')
  }
  const bytes = await readFile(requested)
  if (bytes.length !== info.size) {
    throw new ReviewAttemptBudgetError('Review report 在读取期间发生变化', 'review-report-invalid')
  }
  return bytes
}

export async function publishImmutableReviewReport(
  identity: ReviewAttemptIdentity,
  fileStem: string,
  bytes: Buffer,
): Promise<{ path: string; digest: string }> {
  const directory = join(identity.changeDir, '.pipeline-run', REPORT_DIR)
  const target = join(directory, `${fileStem}.report`)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  try {
    const handle = await open(target, 'wx', 0o600)
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
    const existing = await readFile(target)
    if (!existing.equals(bytes)) {
      throw new ReviewAttemptBudgetError('Review immutable report identity collision', 'review-report-invalid')
    }
  }
  return {
    path: relative(identity.projectRoot, target).split(sep).join('/'),
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  }
}
