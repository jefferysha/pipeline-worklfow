import { posix } from 'node:path'
import {
  compileConstraintPolicy,
  explainConstraintPaths,
  type LoopEntry,
} from '@tenon/kernel'

const REQUEST_KEYS = new Set(['root', 'loop_id', 'paths'])
const MAX_PATHS = 100
const MAX_PATH_BYTES = 1024
const MAX_TOTAL_PATH_BYTES = 32768

export class LoopScopePreviewInputError extends Error {
  override readonly name = 'LoopScopePreviewInputError'
}

export class LoopScopePreviewRootUntrustedError extends Error {
  override readonly name = 'LoopScopePreviewRootUntrustedError'

  constructor(
    readonly stage: 'before-read' | 'after-read',
    readonly cause: unknown,
  ) {
    super(`Loop scope root trust failed ${stage}`)
  }
}

export interface LoopScopePreviewRequest {
  readonly root: string
  readonly loopId: string
  readonly paths: readonly string[]
}

function invalid(message: string): never {
  throw new LoopScopePreviewInputError(message)
}

export function readWithLoopScopeRootTrust<T>(
  assertTrusted: () => void,
  read: () => T,
): T {
  try {
    assertTrusted()
  } catch (error) {
    throw new LoopScopePreviewRootUntrustedError('before-read', error)
  }
  const result = read()
  try {
    assertTrusted()
  } catch (error) {
    throw new LoopScopePreviewRootUntrustedError('after-read', error)
  }
  return result
}

function isCanonicalRelativePath(path: string): boolean {
  if (path === ''
    || path.includes('\0')
    || path.includes('\\')
    || path.startsWith('/')
    || path.endsWith('/')
    || /^[A-Za-z]:/.test(path)) return false
  const segments = path.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false
  return posix.normalize(path) === path
}

export function parseLoopScopePreviewRequest(input: unknown): LoopScopePreviewRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) invalid('请求体须为 JSON 对象')
  const body = input as Record<string, unknown>
  for (const key of Object.keys(body)) if (!REQUEST_KEYS.has(key)) invalid(`未知字段 '${key}'`)
  if (typeof body.root !== 'string' || body.root === '') invalid('root 必须是非空字符串')
  if (typeof body.loop_id !== 'string' || body.loop_id.trim() === '') invalid('loop_id 必须是非空字符串')
  if (!Array.isArray(body.paths) || body.paths.length === 0 || body.paths.length > MAX_PATHS) {
    invalid(`paths 必须包含 1-${MAX_PATHS} 条路径`)
  }

  let totalBytes = 0
  const paths: string[] = []
  const seen = new Set<string>()
  for (const value of body.paths) {
    if (typeof value !== 'string' || !isCanonicalRelativePath(value)) invalid('paths 只接受 canonical 项目相对路径')
    const bytes = Buffer.byteLength(value, 'utf8')
    if (bytes > MAX_PATH_BYTES) invalid(`单条路径不得超过 ${MAX_PATH_BYTES} UTF-8 bytes`)
    totalBytes += bytes
    if (totalBytes > MAX_TOTAL_PATH_BYTES) invalid(`路径总计不得超过 ${MAX_TOTAL_PATH_BYTES} UTF-8 bytes`)
    if (!seen.has(value)) {
      seen.add(value)
      paths.push(value)
    }
  }
  return { root: body.root, loopId: body.loop_id.trim(), paths }
}

export interface LoopScopePreviewResponse {
  readonly ok: true
  readonly schema_version: 1
  readonly loop_id: string
  readonly loop_status: 'active' | 'paused' | 'retired'
  readonly autonomy_level: 'L1' | 'L2' | 'L3'
  readonly enforced_for_unattended_merge: boolean
  readonly summary: { readonly total: number; readonly allowed: number; readonly blocked: number }
  readonly items: readonly LoopScopePreviewItem[]
}

export interface LoopScopePreviewItem {
  readonly path: string
  readonly verdict: 'allowed' | 'blocked'
  readonly reason: 'allowlist' | 'path-denied' | 'path-outside-allowlist'
  readonly matched_pattern: string | null
}

export function buildLoopScopePreviewResponse(
  loop: LoopEntry,
  paths: readonly string[],
  matches: (path: string, pattern: string) => boolean,
): LoopScopePreviewResponse {
  const items: LoopScopePreviewItem[] = explainConstraintPaths(
    compileConstraintPolicy(loop),
    'merge',
    paths,
    matches,
  ).map((item) => ({
    path: item.path,
    verdict: item.verdict,
    reason: item.reason,
    matched_pattern: item.matched_pattern,
  }))
  const allowed = items.filter((item) => item.verdict === 'allowed').length
  return {
    ok: true,
    schema_version: 1,
    loop_id: loop.id,
    loop_status: loop.status,
    autonomy_level: loop.autonomy_level,
    enforced_for_unattended_merge: loop.status === 'active' && loop.autonomy_level === 'L3',
    summary: { total: items.length, allowed, blocked: items.length - allowed },
    items,
  }
}
