import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { stateStorageExistsSync } from '@tenon/kernel'

export interface GetSessionRouteDeps {
  readonly sendJson: (res: ServerResponse, code: number, body: unknown) => void
  readonly isRegisteredRoot: (root: string) => boolean
  readonly resolveSessionLink: (root: string, name: string) => Promise<Record<string, unknown>>
}

function isChangeName(name: string): boolean {
  return name !== '' && /^[a-zA-Z0-9_-]+$/.test(name) && !name.includes('..')
}

async function handleSessionLink(
  req: IncomingMessage,
  res: ServerResponse,
  deps: GetSessionRouteDeps,
): Promise<void> {
  const search = new URL(req.url ?? '/', 'http://localhost').searchParams
  const name = search.get('name') ?? ''
  if (!isChangeName(name)) {
    return deps.sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
  }
  const root = search.get('root') ?? ''
  if (root === '') return deps.sendJson(res, 400, { ok: false, error: '缺少 root 参数' })
  if (!deps.isRegisteredRoot(root)) {
    return deps.sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
  }
  if (!stateStorageExistsSync(join(root, 'openspec', 'changes', name))) {
    return deps.sendJson(res, 400, { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' })
  }
  return deps.sendJson(res, 200, await deps.resolveSessionLink(root, name))
}

async function handleSessionLinks(
  req: IncomingMessage,
  res: ServerResponse,
  deps: GetSessionRouteDeps,
): Promise<void> {
  const search = new URL(req.url ?? '/', 'http://localhost').searchParams
  const roots = search.getAll('root')
  const names = search.getAll('name')
  if (roots.length !== names.length) {
    return deps.sendJson(res, 400, { ok: false, error: 'root/name 参数数量不匹配' })
  }
  if (roots.length > 50) {
    return deps.sendJson(res, 400, { ok: false, error: 'items 过多（上限 50）' })
  }
  const links: Record<string, unknown> = {}
  await Promise.all(
    roots.map(async (root, index) => {
      const name = names[index] ?? ''
      const key = `${name}@${root}`
      const valid =
        isChangeName(name)
        && root !== ''
        && deps.isRegisteredRoot(root)
        && stateStorageExistsSync(join(root, 'openspec', 'changes', name))
      links[key] = valid
        ? await deps.resolveSessionLink(root, name)
        : { found: false, reason: 'invalid' }
    }),
  )
  return deps.sendJson(res, 200, { links })
}

/**
 * Owns the read-only change-to-terminal-session endpoint family. The caller retains the shared
 * GET host guard; this handler preserves the single-route validation order and batch fail-soft
 * contract before delegating the actual lookup to the server-owned resolver.
 */
export async function handleGetSessionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  deps: GetSessionRouteDeps,
): Promise<boolean> {
  if (path === '/api/mem/session-link') {
    await handleSessionLink(req, res, deps)
    return true
  }
  if (path === '/api/mem/session-links') {
    await handleSessionLinks(req, res, deps)
    return true
  }
  return false
}
