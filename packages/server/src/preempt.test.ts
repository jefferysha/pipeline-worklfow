/**
 * preempt.test —— B4 版本抢占：语义比较 + 裁决 + 真 HTTP health 探测 + 真 SIGTERM 抢占。
 * 抢占用例真 spawn 子进程、真写 pidfile、真发信号、真断言子进程退出（非 mock）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  compareVersions, decidePreemption, preemptOldServer, probeHealth, readPidfile,
} from './preempt.js'
import { createDashboardServer } from './server.js'
import type { DashboardServer } from './types.js'
import { makeTempHome, testFlow } from './test-support.js'

const servers: DashboardServer[] = []
const children: ChildProcess[] = []
afterEach(async () => {
  while (servers.length) await servers.pop()!.close()
  for (const c of children.splice(0)) { try { c.kill('SIGKILL') } catch { /* already gone */ } }
})

describe('compareVersions —— 语义化数值比较', () => {
  it('主次修订逐段数值比较', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBeGreaterThan(0)
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0)
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0) // 非字典序
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0)
  })
})

describe('decidePreemption —— bind / reuse / preempt', () => {
  it('无既有 server → bind', () => {
    expect(decidePreemption(null, '0.1.0')).toBe('bind')
  })
  it('既有同版本 → reuse', () => {
    expect(decidePreemption({ ok: true, scope: 'global', version: '0.1.0' }, '0.1.0')).toBe('reuse')
  })
  it('既有旧版本、我更新 → preempt', () => {
    expect(decidePreemption({ ok: true, scope: 'global', version: '0.1.0' }, '0.2.0')).toBe('preempt')
  })
  it('既有更新版本 → reuse（让位，不降级抢占）', () => {
    expect(decidePreemption({ ok: true, scope: 'global', version: '0.3.0' }, '0.2.0')).toBe('reuse')
  })
})

describe('probeHealth —— 真 HTTP 探测既有 server', () => {
  it('活着 → 回 health（含 version）；关掉 → null', async () => {
    const srv = createDashboardServer({ version: '5.5.5', token: 't', registry: () => [], flow: testFlow() })
    servers.push(srv)
    const { port } = await srv.listen(0, '127.0.0.1')
    const alive = await probeHealth(port, '127.0.0.1', 500)
    expect(alive?.version).toBe('5.5.5')
    expect(alive?.scope).toBe('global')
    await srv.close()
    servers.pop()
    const dead = await probeHealth(port, '127.0.0.1', 300)
    expect(dead).toBeNull()
  })
})

describe('readPidfile', () => {
  it('缺文件 → null', () => {
    expect(readPidfile('/no/such/pidfile')).toBeNull()
  })
})

describe('preemptOldServer —— 真读 pidfile + 真 SIGTERM 干掉旧进程', () => {
  it('kill 旧 pid → 子进程真退出、端口空出 → 返回 true', async () => {
    const home = await makeTempHome()
    const pidfile = join(home, '.pipeline-dashboard.server')
    // 真起一个长活子进程冒充「旧版本 server 进程」
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1 << 30)'], { stdio: 'ignore' })
    children.push(child)
    await new Promise((r) => setTimeout(r, 100)) // 等 spawn 起来
    expect(child.pid).toBeGreaterThan(0)

    // 选一个没人监听的端口号（抢占后「端口空出」判定立刻通过）
    const freePort = 47653
    await writeFile(pidfile, JSON.stringify({ pid: child.pid, port: freePort, version: '0.1.0' }), 'utf8')

    let exitSignal: NodeJS.Signals | null = null
    const exited = new Promise<void>((resolve) =>
      child.on('exit', (_code, signal) => { exitSignal = signal; resolve() }))
    const ok = await preemptOldServer(pidfile, freePort, '127.0.0.1', { waitMs: 3000 })
    expect(ok).toBe(true)
    await exited // 若没真被 kill，这里会挂到测试超时
    expect(exitSignal).toBe('SIGTERM') // 真被我们的 SIGTERM 终结
  })
})
