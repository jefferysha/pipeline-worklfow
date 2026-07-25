/**
 * B4 全局 server 版本抢占 —— 修老仓欠账 #3（多项目多版本共存时新版本无法接管）。
 *
 * 老仓 bind_server 语义：默认 dashboard 端口被占 → /api/health 回显 scope==global 则**无条件复用**既有实例，
 * 与占位者的版本无关 → 旧版本 server 长踞、新版本永远接管不了（架构欠账 #3）。
 *
 * 本仓修法：启动探测既有 /api/health（含 version，见 HealthInfo）：
 *   · 无既有 server        → bind（直接监听）
 *   · 状态域不同/未知       → preempt（禁止串用另一 registry/secrets 域）
 *   · 同状态域且既有版本 ≥ 我 → reuse（让位，不降级抢占）
 *   · 同状态域且既有版本 < 我 → preempt：验证 listener PID 后优雅接管
 * 决策纯函数 decidePreemption 可单测；探测/抢占走真 HTTP + 真信号。
 */
import { execFile } from 'node:child_process'
import { get as httpGet } from 'node:http'
import { readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import type { HealthInfo, Pidfile, PreemptDecision } from './types.js'

/** 语义化数值比较（逐段 int，非字典序）：a>b → +1，a<b → -1，相等 → 0。 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10))
  const pb = b.split('.').map((x) => parseInt(x, 10))
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const candidateA = pa[i]
    const candidateB = pb[i]
    const x = typeof candidateA === 'number' && Number.isFinite(candidateA) ? candidateA : 0
    const y = typeof candidateB === 'number' && Number.isFinite(candidateB) ? candidateB : 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

function decodeHealthInfo(value: unknown): HealthInfo | null {
  if (typeof value !== 'object' || value === null) return null
  const version = Reflect.get(value, 'version')
  const scope = Reflect.get(value, 'scope')
  const ok = Reflect.get(value, 'ok')
  if (typeof version !== 'string' || scope !== 'global' || typeof ok !== 'boolean') return null
  const releaseId = Reflect.get(value, 'releaseId')
  const stateScopeId = Reflect.get(value, 'stateScopeId')
  const pid = Reflect.get(value, 'pid')
  return {
    ok,
    scope,
    version,
    ...(typeof releaseId === 'string' ? { releaseId } : {}),
    ...(typeof stateScopeId === 'string' ? { stateScopeId } : {}),
    ...(typeof pid === 'number' ? { pid } : {}),
  }
}

export function readPidfile(pidfilePath: string): Pidfile | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(pidfilePath, 'utf8'))
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>
      if (typeof o.pid === 'number' && typeof o.port === 'number' && typeof o.version === 'string') {
        return { pid: o.pid, port: o.port, version: o.version, started: typeof o.started === 'number' ? o.started : undefined }
      }
    }
    return null
  } catch {
    return null
  }
}

/** 真 HTTP 探测 127.0.0.1:port/api/health；不可达/超时/非 JSON → null。 */
export function probeHealth(port: number, host = '127.0.0.1', timeoutMs = 500): Promise<HealthInfo | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: HealthInfo | null): void => {
      if (done) return
      done = true
      resolve(v)
    }
    const req = httpGet({ host, port, path: '/api/health', timeout: timeoutMs }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try {
          finish(decodeHealthInfo(JSON.parse(body) as unknown))
        } catch {
          finish(null)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy()
      finish(null)
    })
    req.on('error', () => finish(null))
  })
}

export function decidePreemption(
  existing: HealthInfo | null,
  myVersion: string,
  myReleaseId: string | undefined,
  myStateScopeId: string,
): PreemptDecision {
  if (!existing) return 'bind'
  // Code identity cannot prove registry/secrets identity. A legacy response without the field is
  // intentionally taken over once; a mismatched field must never be reused, even if its code is
  // newer, because it serves a different machine-state domain.
  if (existing.stateScopeId !== myStateScopeId) return 'preempt'
  const versionOrder = compareVersions(myVersion, existing.version)
  if (versionOrder !== 0) return versionOrder > 0 ? 'preempt' : 'reuse'
  // A semantic plugin version can legitimately contain a new runtime payload. The selected
  // release is authoritative even at equal semver (including an explicit runtime rollback). A
  // legacy server without releaseId cannot prove it is the selected payload, so the first managed
  // release takes it over rather than allowing a stale process to survive forever.
  if (myReleaseId !== undefined) return myReleaseId === existing.releaseId ? 'reuse' : 'preempt'
  return 'reuse'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Parse the PID-only output of `lsof -t`; invalid lines are never candidates for a signal. */
export function parseListenerPids(stdout: string): number[] {
  return [...new Set(stdout.split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0))]
}

/**
 * Resolve the local process which actually owns a TCP listener.  We deliberately
 * fail closed when lsof is unavailable: a pidfile can be stale/reused, and an
 * unauthenticated health response alone must never authorize signalling an
 * arbitrary process.  macOS and the supported Unix development environments
 * ship lsof; unsupported hosts receive a clear failed takeover instead.
 */
function listenerPids(port: number): Promise<number[] | null> {
  return new Promise((resolve) => {
    execFile('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }, (error, stdout) => {
      if (error === null) {
        resolve(parseListenerPids(String(stdout ?? '')))
        return
      }
      const code: unknown = (error as { code?: unknown }).code
      // lsof uses exit 1 for a successful query that simply found no listeners.
      if (code === 1) { resolve([]); return }
      resolve(null)
    })
  })
}

/** TCP-level free-port probe; unlike /api/health it distinguishes an old/non-dashboard listener from a free port. */
export function probePortOpen(port: number, host = '127.0.0.1', timeoutMs = 250): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (open: boolean): void => {
      if (done) return
      done = true
      resolve(open)
    }
    const socket = createConnection({ host, port })
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => { socket.destroy(); finish(true) })
    socket.once('timeout', () => { socket.destroy(); finish(true) })
    socket.once('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code
      // Only a refused connection proves the port is free.  Other failures are
      // treated as occupied/unknown so takeover never claims success too early.
      finish(code !== 'ECONNREFUSED')
    })
  })
}

/**
 * 抢占既有实例：读 pidfile → SIGTERM 旧 pid（优雅停，落 finally 清 pidfile/关 socket）→
 * 轮询直到端口空出（health 不可达）。空出 → true；超时仍被占 → false。
 * 无 pidfile → false（拿不到 pid，交调用方降级）。
 */
export async function preemptOldServer(
  pidfilePath: string,
  port: number,
  host = '127.0.0.1',
  opts?: { waitMs?: number; legacyPid?: number },
): Promise<boolean> {
  const pf = readPidfile(pidfilePath)
  const expected = new Set<number>()
  if (pf !== null && pf.port === port) expected.add(pf.pid)
  const legacyPid = opts?.legacyPid
  if (typeof legacyPid === 'number' && Number.isSafeInteger(legacyPid) && legacyPid > 0) expected.add(legacyPid)

  const listeners = await listenerPids(port)
  if (listeners === null) return false
  if (listeners.length === 0) return !(await probePortOpen(port, host))
  const target = listeners.find((pid) => expected.has(pid))
  if (target === undefined) return false
  try {
    process.kill(target, 'SIGTERM')
  } catch {
    // ESRCH：旧进程已不在 → 继续等端口空出即可
  }
  const deadline = Date.now() + (opts?.waitMs ?? 3000)
  while (Date.now() < deadline) {
    if (!(await probePortOpen(port, host, 150))) return true
    await sleep(50)
  }
  return false
}
