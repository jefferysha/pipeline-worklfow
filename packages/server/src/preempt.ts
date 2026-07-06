/**
 * B4 全局 server 版本抢占 —— 修老仓欠账 #3（多项目多版本共存时新版本无法接管）。
 *
 * 老仓 bind_server 语义：8765 被占 → /api/health 回显 scope==global 则**无条件复用**既有实例，
 * 与占位者的版本无关 → 旧版本 server 长踞、新版本永远接管不了（架构欠账 #3）。
 *
 * 本仓修法：启动探测既有 /api/health（含 version，见 HealthInfo）：
 *   · 无既有 server        → bind（直接监听）
 *   · 既有版本 ≥ 我        → reuse（让位，不降级抢占——避免旧实例被新装但更旧的包顶掉）
 *   · 既有版本 < 我        → preempt：读 pidfile 拿旧 pid → SIGTERM 优雅停 → 等端口空出 → 由调用方 bind
 * 决策纯函数 decidePreemption 可单测；探测/抢占走真 HTTP + 真信号。
 */
import { get as httpGet } from 'node:http'
import { readFileSync } from 'node:fs'
import type { HealthInfo, Pidfile, PreemptDecision } from './types.js'

/** 语义化数值比较（逐段 int，非字典序）：a>b → +1，a<b → -1，相等 → 0。 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10))
  const pb = b.split('.').map((x) => parseInt(x, 10))
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = Number.isFinite(pa[i]) ? (pa[i] as number) : 0
    const y = Number.isFinite(pb[i]) ? (pb[i] as number) : 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
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
          const j = JSON.parse(body) as HealthInfo
          finish(j && typeof j.version === 'string' ? j : null)
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

export function decidePreemption(existing: HealthInfo | null, myVersion: string): PreemptDecision {
  if (!existing) return 'bind'
  return compareVersions(myVersion, existing.version) > 0 ? 'preempt' : 'reuse'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
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
  opts?: { waitMs?: number },
): Promise<boolean> {
  const pf = readPidfile(pidfilePath)
  if (!pf) return false
  try {
    process.kill(pf.pid, 'SIGTERM')
  } catch {
    // ESRCH：旧进程已不在 → 继续等端口空出即可
  }
  const deadline = Date.now() + (opts?.waitMs ?? 3000)
  while (Date.now() < deadline) {
    const alive = await probeHealth(port, host, 150)
    if (!alive) return true
    await sleep(50)
  }
  return false
}
