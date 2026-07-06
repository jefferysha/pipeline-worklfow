/**
 * daemon.test —— 真 socket e2e（GOAL C9）：单进程绑**多端口**，各自上游、共享 trace_store。
 *   ① 真起 2 个 reverse 绑定 + 各自 fake upstream → 各端口真转发 + 各自真捕获。
 *   ② claude 8766 生命线端口隔离：daemon 拒绑 8766（保护 claude 独立进程）。
 *   ③ 部分失败回滚：一个绑定失败 → 已起的全数关闭，绝不泄漏端口。
 *   ④ stop() 真关全部。零 mock。
 * 老仓真相源：tap_daemon.py start_daemon / stop_daemon（DEFAULT_PORTS 从 8767 起，8766 留给 claude）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { CLAUDE_LIFELINE_PORT, startDaemon, type DaemonHandles } from './daemon.js'
import { createTraceStore } from './trace-store.js'
import { resetCaptureCache, setCaptureEnabled, tapStatus } from './security.js'
import { httpReq, rmDir, startFakeUpstream, tempTapDir, type FakeUpstream } from './test-support.js'
import type { CaptureProxyHandle } from './capture-proxy.js'

const daemons: DaemonHandles[] = []
const ups: FakeUpstream[] = []
const dirs: string[] = []
afterEach(async () => {
  while (daemons.length) await daemons.pop()!.stop()
  while (ups.length) await ups.pop()!.close()
  resetCaptureCache()
  while (dirs.length) await rmDir(dirs.pop()!)
})
async function store(): Promise<{ store: ReturnType<typeof createTraceStore>; dir: string }> {
  const dir = await tempTapDir(); dirs.push(dir); return { store: createTraceStore({ dir }), dir }
}

describe('daemon 多端口 —— 单进程绑多端口，各自转发 + 共享捕获', () => {
  it('2 个 reverse 绑定 → 两端口都真转发到各自 upstream + 各自真落记录', async () => {
    const s = await store()
    const upA = await startFakeUpstream(); ups.push(upA)
    const upB = await startFakeUpstream(); ups.push(upB)
    setCaptureEnabled(true, { dir: s.dir })
    const d = await startDaemon({
      store: s.store,
      bindings: [
        { name: 'clientA', mode: 'reverse', port: 0, target: upA.url },
        { name: 'clientB', mode: 'reverse', port: 0, target: upB.url },
      ],
    })
    daemons.push(d)

    const portA = (d.handles.clientA as CaptureProxyHandle).port
    const portB = (d.handles.clientB as CaptureProxyHandle).port
    expect(portA).toBeGreaterThan(0)
    expect(portB).toBeGreaterThan(0)
    expect(portA).not.toBe(portB) // 真多端口

    await httpReq({ port: portA, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"c":"A"}' })
    await httpReq({ port: portB, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"c":"B"}' })

    expect(upA.requests.length).toBe(1)
    expect(upB.requests.length).toBe(1)
    const all = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(all.length).toBe(2) // 共享 trace_store 两条

    // doctor 明示：正在拦截 2 端口
    const st = tapStatus({ dir: s.dir })
    expect(st.intercepting).toBe(true)
    expect(st.interceptCount).toBe(2)
  })
})

describe('claude 8766 生命线隔离 —— daemon 拒绑 8766', () => {
  it('绑定含 8766 → 抛错（不碰 claude 生命线端口）', async () => {
    const s = await store()
    await expect(startDaemon({
      store: s.store,
      bindings: [{ name: 'bad', mode: 'reverse', port: CLAUDE_LIFELINE_PORT, target: 'http://127.0.0.1:1' }],
    })).rejects.toThrow(/8766|生命线|lifeline/i)
    expect(CLAUDE_LIFELINE_PORT).toBe(8766)
  })
})

describe('部分失败回滚 —— 不泄漏端口', () => {
  it('第二个绑定用 8766 非法 → 第一个已起的也被回滚关闭（tapStatus 归零）', async () => {
    const s = await store()
    const upA = await startFakeUpstream(); ups.push(upA)
    await expect(startDaemon({
      store: s.store,
      bindings: [
        { name: 'ok', mode: 'reverse', port: 0, target: upA.url },
        { name: 'bad', mode: 'reverse', port: CLAUDE_LIFELINE_PORT, target: 'http://127.0.0.1:1' },
      ],
    })).rejects.toThrow()
    // 回滚后无残留 intercept
    expect(tapStatus({ dir: s.dir }).interceptCount).toBe(0)
  })
})

describe('stop() —— 真关全部端口', () => {
  it('stop 后端口不再监听（连接被拒）', async () => {
    const s = await store()
    const upA = await startFakeUpstream(); ups.push(upA)
    const d = await startDaemon({ store: s.store, bindings: [{ name: 'a', mode: 'reverse', port: 0, target: upA.url }] })
    const port = (d.handles.a as CaptureProxyHandle).port
    await d.stop()
    await expect(httpReq({ port, path: '/v1/messages', method: 'GET' })).rejects.toThrow()
  })
})
