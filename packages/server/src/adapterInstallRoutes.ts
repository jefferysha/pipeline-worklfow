import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HostId } from './hostTargetPlanProtocol.js'
import { AdapterInstallManager, isInstallJobId, parseAdapterInstallRequest } from './adapterInstall.js'
import type { WorkflowRootAnchor } from './workflows.js'

export interface AdapterInstallRouteDeps {
  readonly manager: AdapterInstallManager
  readonly workflowRootForRequest: (root: string) =>
    | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
    | { readonly ok: false; readonly code: 403 | 404; readonly error: string }
  readonly sendJson: (res: ServerResponse, code: number, body: unknown) => void
}

function writeSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
}

export async function resolveAdapterInstallPost(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  readJsonBody: (req: IncomingMessage) => Promise<unknown>,
  deps: AdapterInstallRouteDeps,
): Promise<boolean> {
  if (path !== '/api/adapters/install') return false
  const request = parseAdapterInstallRequest(await readJsonBody(req))
  if (request === null) {
    deps.sendJson(res, 400, { ok: false, code: 'ADAPTER_INSTALL_REQUEST_INVALID', error: 'root、hosts 和 confirm/dry_run 组合无效' })
    return true
  }
  const checked = deps.workflowRootForRequest(request.root)
  if (!checked.ok) {
    deps.sendJson(res, checked.code, { ok: false, code: 'ADAPTER_INSTALL_ROOT_INVALID', error: checked.error })
    return true
  }
  const job = deps.manager.start(checked.anchor.path, request.hosts, request.dryRun)
  deps.sendJson(res, 202, {
    schema_version: 'adapter-install/v1',
    job_id: job.job_id,
    root: job.root,
    hosts: job.hosts,
    dry_run: job.dry_run,
    stream: `/api/adapters/install/${job.job_id}/stream?root=${encodeURIComponent(job.root)}`,
  })
  return true
}

export async function resolveAdapterInstallGet(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  deps: AdapterInstallRouteDeps,
): Promise<boolean> {
  const match = /^\/api\/adapters\/install\/([^/]+)(?:\/(stream))?$/.exec(path)
  if (match === null || !isInstallJobId(match[1] ?? '')) return false
  const jobId = match[1] as string
  const job = deps.manager.get(jobId)
  if (job === null) {
    deps.sendJson(res, 404, { ok: false, code: 'ADAPTER_INSTALL_JOB_NOT_FOUND', error: '安装任务不存在或已过期' })
    return true
  }
  const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
  if (root !== '') {
    const checked = deps.workflowRootForRequest(root)
    if (!checked.ok || checked.anchor.path !== job.root) {
      deps.sendJson(res, 403, { ok: false, code: 'ADAPTER_INSTALL_ROOT_INVALID', error: '安装任务不属于当前项目' })
      return true
    }
  }
  if (match[2] !== 'stream') {
    deps.sendJson(res, 200, { schema_version: 'adapter-install/v1', ...job })
    return true
  }
  writeSseHeaders(res)
  let closed = false
  const terminal = new Set(['planned', 'installed', 'failed'])
  const write = (state: unknown): void => {
    if (closed || res.writableEnded) return
    try { res.write(`event: install-state\ndata: ${JSON.stringify({ schema_version: 'adapter-install-event/v1', kind: 'install-state', state })}\n\n`) } catch { closed = true }
  }
  let unsubscribe: (() => void) | null = null
  const closeWhenComplete = (): void => {
    if (closed || res.writableEnded) return
    const current = deps.manager.get(jobId)
    if (current === null || current.states.length === 0
      || !current.hosts.every((host: HostId) => current.states.some((item) => item.host === host && terminal.has(item.phase)))) return
    try {
      res.write(`event: complete\ndata: ${JSON.stringify({ schema_version: 'adapter-install-event/v1', kind: 'complete', job_id: jobId })}\n\n`)
      res.end()
    } catch {
      // The browser may disconnect between the terminal-state check and write.
    }
    closed = true
    unsubscribe?.()
  }
  unsubscribe = deps.manager.subscribe(jobId, (state) => {
    write(state)
    closeWhenComplete()
  })
  // A fast dry-run can finish before the client opens EventSource.  `subscribe`
  // replays the states synchronously, so the callback above runs before the
  // unsubscribe handle is assigned; check once after assignment to close the
  // stream deterministically instead of leaving a completed job hanging.
  closeWhenComplete()
  req.on('close', () => {
    closed = true
    unsubscribe?.()
  })
  if (unsubscribe === null) {
    closed = true
    res.end()
  }
  return true
}
