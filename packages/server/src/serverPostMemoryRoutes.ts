import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { stateStorageExistsSync, type MemPlatformFilter } from '@tenon/kernel'
import type { PostRouteDeps } from './serverPostRoutes.js'

const RELATED_SEARCH_PATH = '/api/mem/related-sessions/search'
const PLATFORM_VALUES = new Set<MemPlatformFilter>(['all', 'claude', 'codex', 'opencode', 'pi'])
const CHANGE_NAME_RE = /^[a-zA-Z0-9_-]+$/

function invalidRequest(deps: PostRouteDeps, res: ServerResponse): void {
  deps.sendJson(res, 400, {
    ok: false,
    code: 'invalid-request',
    error: 'Related session search request is invalid',
  })
}

function missingTarget(deps: PostRouteDeps, res: ServerResponse): void {
  deps.sendJson(res, 404, {
    ok: false,
    code: 'project-or-change-not-found',
    error: 'Project or Change is unavailable',
  })
}

export async function handlePostMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  deps: PostRouteDeps,
): Promise<void> {
  if (path !== RELATED_SEARCH_PATH) return

  const raw = await deps.readJsonBody(req)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return invalidRequest(deps, res)
  }
  const body = raw as Record<string, unknown>
  const root = typeof body.root === 'string' ? body.root : ''
  const name = typeof body.name === 'string' ? body.name : ''
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const platform = body.platform
  const queryLength = [...query].length
  const tokenCount = query === '' ? 0 : query.split(/\s+/u).length

  if (
    root === ''
    || !CHANGE_NAME_RE.test(name)
    || name.includes('..')
    || queryLength < 2
    || queryLength > 128
    || tokenCount > 8
    || typeof platform !== 'string'
    || !PLATFORM_VALUES.has(platform as MemPlatformFilter)
  ) {
    return invalidRequest(deps, res)
  }

  const rootCheck = deps.workflowRootForRequest(root)
  if (!rootCheck.ok) return missingTarget(deps, res)
  const anchoredRoot = rootCheck.anchor.path
  let changeExists = false
  try {
    changeExists = stateStorageExistsSync(join(anchoredRoot, 'openspec', 'changes', name))
  } catch {
    return missingTarget(deps, res)
  }
  if (!changeExists) {
    return missingTarget(deps, res)
  }

  const result = await deps.relatedSessionSearch({
    root: anchoredRoot,
    query,
    platform: platform as MemPlatformFilter,
  })
  if (!result.ok) {
    if (result.reason === 'busy') {
      return deps.sendJson(res, 429, {
        ok: false,
        code: 'memory-search-busy',
        error: 'Related session search is already running',
      })
    }
    return deps.sendJson(res, 500, {
      ok: false,
      code: 'memory-search-unavailable',
      error: 'Related session search is unavailable',
    })
  }
  return deps.sendJson(res, 200, result.response)
}
