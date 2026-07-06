/**
 * server 测试基座 —— 真 fs / 真 HTTP 客户端工具（GOAL C9：绝不 mock，真起真请求）。
 * 非 *.test.ts（会被 tsc 编入 dist），但仅测试引用；生产 index.ts 不导出。
 */
import { request as httpRequest, get as httpGet, type IncomingHttpHeaders } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFlowEngine, createStateStore, loadManifest } from '@pipeline-lite/kernel'
import type { FlowEngine, StateStore } from '@pipeline-lite/kernel'

/** 新仓根 templates/manifest.yaml（src 下运行时：src → server → packages → 根）。 */
export function repoManifestPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'manifest.yaml')
}

export function testFlow(): FlowEngine {
  return createFlowEngine(loadManifest(repoManifestPath()))
}

export function newStore(): StateStore {
  return createStateStore()
}

export async function makeTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pl-dash-home-'))
}

/** 真建一个临时项目根（含 .git/HEAD 让 base_branch 探测有稳定值）。 */
export async function makeProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pl-dash-proj-'))
}

/** 真 init 一个 change → 落 openspec/changes/<name>/.pipeline.yaml（phase=open）。 */
export async function initChange(
  store: StateStore,
  root: string,
  name: string,
  opts?: { track?: 'chat' | 'pm' | 'frontend' | 'backend'; preset?: string },
): Promise<string> {
  return store.init({
    repoRoot: root,
    name,
    track: opts?.track ?? 'backend',
    preset: opts?.preset ?? 'full',
    clock: () => '2026-07-07T00:00:00Z',
  })
}

export interface HttpResult {
  status: number
  headers: IncomingHttpHeaders
  body: string
  json: <T = unknown>() => T
}

function toResult(status: number, headers: IncomingHttpHeaders, body: string): HttpResult {
  return { status, headers, body, json: <T,>() => JSON.parse(body) as T }
}

export function reqGet(
  port: number,
  path: string,
  host = '127.0.0.1',
  headers?: Record<string, string>,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const r = httpGet({ host, port, path, headers }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve(toResult(res.statusCode ?? 0, res.headers, body)))
    })
    r.on('error', reject)
  })
}

export function reqPost(
  port: number,
  path: string,
  payload: unknown,
  opts?: { host?: string; headers?: Record<string, string>; rawBody?: string },
): Promise<HttpResult> {
  const host = opts?.host ?? '127.0.0.1'
  const body = opts?.rawBody ?? JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body)),
    ...(opts?.headers ?? {}),
  }
  return new Promise((resolve, reject) => {
    const r = httpRequest({ host, port, path, method: 'POST', headers }, (res) => {
      let b = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve(toResult(res.statusCode ?? 0, res.headers, b)))
    })
    r.on('error', reject)
    r.write(body)
    r.end()
  })
}

/** 真开一条 SSE 连接，累积事件；waitFor 轮询直到命中或超时。 */
export interface SSEConn {
  events: Array<{ event: string; data: string }>
  waitFor(pred: (e: { event: string; data: string }) => boolean, timeoutMs?: number): Promise<{ event: string; data: string }>
  close(): void
}

export function openSSE(port: number, path: string, host = '127.0.0.1'): Promise<SSEConn> {
  return new Promise((resolve, reject) => {
    const events: Array<{ event: string; data: string }> = []
    let buf = ''
    const r = httpGet({ host, port, path, headers: { Accept: 'text/event-stream' } }, (res) => {
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        buf += chunk
        let idx: number
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          let ev = 'message'
          const dataLines: string[] = []
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) ev = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
            // ':'-prefixed comments (heartbeat) ignored
          }
          if (dataLines.length) events.push({ event: ev, data: dataLines.join('\n') })
        }
      })
      const conn: SSEConn = {
        events,
        close: () => r.destroy(),
        waitFor: (pred, timeoutMs = 3000) =>
          new Promise((res2, rej2) => {
            const start = Date.now()
            const tick = () => {
              const hit = events.find(pred)
              if (hit) return res2(hit)
              if (Date.now() - start > timeoutMs) return rej2(new Error('SSE waitFor 超时'))
              setTimeout(tick, 15)
            }
            tick()
          }),
      }
      resolve(conn)
    })
    r.on('error', reject)
  })
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
