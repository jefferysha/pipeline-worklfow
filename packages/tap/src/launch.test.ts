/**
 * launch.test —— daemon 启动器编排真 e2e（BACKLOG #34-wire）：detectTarget 解析真实上游 +
 * reverseEnvMap/forwardEnvMap 按 runtime 组装注入 env + 真绑定端口回读，零 mock。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { planBindings, launchTap, FORWARD_BINDING_NAME, type LaunchResult } from './launch.js'
import { createTraceStore } from './trace-store.js'
import { resetCaptureCache, setCaptureEnabled } from './security.js'
import { httpReq, rmDir, startFakeUpstream, tempTapDir, type FakeUpstream } from './test-support.js'

const dirs: string[] = []
const ups: FakeUpstream[] = []
const results: LaunchResult[] = []
afterEach(async () => {
  while (results.length) await results.pop()!.daemon.stop()
  while (ups.length) await ups.pop()!.close()
  resetCaptureCache()
  while (dirs.length) { const d = dirs.pop()!; rmSync(d, { recursive: true, force: true }) }
})

function tmpHome(): string {
  const d = mkdtempSync(join(tmpdir(), 'pl-launch-home-'))
  dirs.push(d)
  return d
}

describe('planBindings —— 纯编排（detectTarget + recordedPaths + stripPrefix，无 socket）', () => {
  it('reverse client → 单绑定，target 走注入 env 覆盖（hermetic，不打真网）', () => {
    const { bindings, targets } = planBindings(['claude'], { env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' }, home: tmpHome() })
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({ name: 'claude', mode: 'reverse', target: 'http://127.0.0.1:9' })
    expect(bindings[0]!.recordedPaths).toEqual(['/v1/messages'])
    expect(targets.claude).toBe('http://127.0.0.1:9')
  })

  it('forward client（gemini）→ 一个共享 __forward__ 绑定，不各自开端口', () => {
    const { bindings } = planBindings(['gemini', 'pi'])
    const forwardBindings = bindings.filter((b) => b.mode === 'forward')
    expect(forwardBindings).toHaveLength(1)
    expect(forwardBindings[0]!.name).toBe(FORWARD_BINDING_NAME)
  })

  it('混合 reverse+forward：reverse 各自绑定 + forward 共享一个', () => {
    const { bindings } = planBindings(['claude', 'gemini'], { env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' }, home: tmpHome() })
    expect(bindings.filter((b) => b.mode === 'reverse')).toHaveLength(1)
    expect(bindings.filter((b) => b.mode === 'forward')).toHaveLength(1)
  })

  it('未知 client → 抛错（不静默忽略）', () => {
    expect(() => planBindings(['not-a-real-client'])).toThrow(/未知 client/)
  })
})

describe('launchTap —— 真绑定 + 真回读端口 + 真 env 组装', () => {
  it('reverse-only：真起 daemon，env 含真实绑定端口（非占位 0）', async () => {
    const up = await startFakeUpstream(); ups.push(up)
    const dir = await tempTapDir(); dirs.push(dir)
    const store = createTraceStore({ dir })
    const result = await launchTap({
      clients: ['claude'], store,
      detect: { env: { ANTHROPIC_BASE_URL: up.url }, home: tmpHome() },
    })
    results.push(result)

    expect(result.clients).toHaveLength(1)
    const claude = result.clients[0]!
    expect(claude.mode).toBe('reverse')
    expect(claude.port).toBeGreaterThan(0)
    expect(claude.env.ANTHROPIC_BASE_URL).toBe(`http://127.0.0.1:${claude.port}`)
    expect(claude.env.ANTHROPIC_BEDROCK_BASE_URL).toBe(`http://127.0.0.1:${claude.port}`) // extraBaseUrlEnvs 同步

    // 真验证：经这个 env 指向的端口打请求，真转发到 up
    setCaptureEnabled(true, { dir })
    const res = await httpReq({ port: claude.port, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"x":1}' })
    expect(res.status).toBe(200)
    expect(up.requests.length).toBe(1)
  })

  it('forward client 缺 opts.ca → 拒绝（避免注入无意义/危险的 CA 信任 env）', async () => {
    const dir = await tempTapDir(); dirs.push(dir)
    const store = createTraceStore({ dir })
    await expect(launchTap({ clients: ['gemini'], store })).rejects.toThrow(/ca/i)
  })

  it('forward client + opts.ca → env 含真 CA 证书路径 + 真代理端口', async () => {
    const dir = await tempTapDir(); dirs.push(dir)
    const store = createTraceStore({ dir })
    const caDir = mkdtempSync(join(tmpdir(), 'pl-launch-ca-')); dirs.push(caDir)
    const result = await launchTap({ clients: ['gemini'], store, ca: { dir: caDir } })
    results.push(result)

    const gemini = result.clients[0]!
    expect(gemini.mode).toBe('forward')
    expect(gemini.env.HTTPS_PROXY).toBe(`http://127.0.0.1:${gemini.port}`)
    expect(gemini.env.NODE_EXTRA_CA_CERTS).toBe(join(caDir, 'ca.pem'))
    mkdirSync(caDir, { recursive: true })
    expect(() => writeFileSync(join(caDir, '.probe'), '')).not.toThrow() // caDir 真实存在可写（ensureCa 真落盘过）
  })
})
