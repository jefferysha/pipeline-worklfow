/**
 * tap 命令 —— 真实 e2e（GOAL C9，#34-wire：daemon 启动器此前零 CLI 可达性）。零 mock：真
 * launchTap（真绑端口 + 真 detectTarget + 真 reverseEnvMap/forwardEnvMap）+ 真 spawn 子进程验证
 * 注入的 env 真被子进程看到 + 真上游收到请求。TENON_TAP_DIR 重定向到临时目录，不碰用户真 ~/.pipeline-tap。
 *
 * `-- <command>` 透传场景用真子进程跑已构建的 dist bundle（同 tools/test-bundle.sh 手法）而非
 * in-process harness：commander 的 `parseAsync(args, {from:'user'})`（harness 用的模式）在特定
 * 前置 token 组合下会吞掉裸 `--`，是该测试模式自身的怪癖——真实用户走 main.ts 默认
 * `parseAsync(process.argv)` 路径不受影响（已手工验证：`node dist/tenon.mjs tap start claude
 * -- node -e ...` 正确透传）。真子进程调用忠实复现生产路径，顺带比 in-process 更贴近真实使用。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshHarness, rm as rmHarness, REPO_ROOT, type Harness } from './integration-harness.js'

const BUNDLE = join(REPO_ROOT, 'packages', 'cli', 'dist', 'tenon.mjs')

/** 真子进程跑已构建 bundle（main.ts 默认 parseAsync(process.argv) 路径，忠实复现生产调用）。 */
function runBundle(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(process.execPath, [BUNDLE, ...args], { env: { ...process.env, ...env } })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString('utf8') })
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString('utf8') })
    child.on('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

interface FakeUpstream { port: number; requests: { url: string }[]; close(): Promise<void> }

/** 真起一个 http 上游（供 tap CLI e2e 验证真转发，避免跨包引用 tap 的私有 test-support）。 */
async function startFakeUpstream(): Promise<FakeUpstream> {
  const requests: { url: string }[] = []
  const server: Server = createServer((req: IncomingMessage, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      requests.push({ url: req.url ?? '/' })
      const payload = Buffer.from(JSON.stringify({ ok: true }), 'utf8')
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': payload.length })
      res.end(payload)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return { port, requests, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

async function signalDaemonAtFirstOutput(opts: {
  args: string[]
  env: Record<string, string>
  stream: 'stdout' | 'stderr'
  pattern: RegExp
}): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [BUNDLE, ...opts.args], { env: { ...process.env, ...opts.env } })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (c: Buffer) => { stdout += c.toString('utf8') })
  child.stderr?.on('data', (c: Buffer) => { stderr += c.toString('utf8') })
  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  const readiness = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等首条 ${opts.stream} readiness 超时: stdout=${stdout}; stderr=${stderr}`)), 5000)
    const check = (): void => {
      const output = opts.stream === 'stdout' ? stdout : stderr
      if (opts.pattern.test(output)) {
        clearTimeout(timer)
        resolve()
      }
    }
    child[opts.stream]?.on('data', check)
    check()
  })
  try {
    await readiness
    if (!child.kill('SIGINT')) throw new Error('SIGINT 未发送：子进程已提前退出')
    const outcome = await exitPromise
    return { ...outcome, stdout, stderr }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
}

describe('tap 真 e2e —— daemon 启动器 CLI 可达性（#34-wire）', () => {
  let h: Harness
  let tapDir: string
  let prevTapDir: string | undefined
  let prevAnthropicBaseUrl: string | undefined
  let upstream: FakeUpstream

  beforeEach(async () => {
    h = await freshHarness()
    tapDir = await mkdtemp(join(tmpdir(), 'tap-cli-e2e-'))
    prevTapDir = process.env.TENON_TAP_DIR
    process.env.TENON_TAP_DIR = tapDir // 不碰用户真 ~/.pipeline-tap
    upstream = await startFakeUpstream()
    prevAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${upstream.port}` // hermetic：detectTarget 不打真网
  })
  afterEach(async () => {
    await upstream.close()
    if (prevTapDir === undefined) delete process.env.TENON_TAP_DIR
    else process.env.TENON_TAP_DIR = prevTapDir
    if (prevAnthropicBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL
    else process.env.ANTHROPIC_BASE_URL = prevAnthropicBaseUrl
    await rm(tapDir, { recursive: true, force: true })
    await rmHarness(h.cwd, { recursive: true, force: true })
  })

  it('reverse client + -- 命令：真绑端口 + 真 env 注入被子进程看到 + 真转发到上游', async () => {
    const outFile = join(h.cwd, 'child-out.json')
    const script = `require('fs').writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({url: process.env.ANTHROPIC_BASE_URL}))`
    const { code, stdout } = await runBundle(
      ['tap', 'start', 'claude', '--json', '--', process.execPath, '-e', script],
      { TENON_TAP_DIR: tapDir, ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstream.port}` },
    )
    expect(code).toBe(0)

    // JSON 输出真含绑定端口信息
    const printed = JSON.parse(stdout) as { clients: { client: string; mode: string; port: number; target: string }[] }
    expect(printed.clients).toHaveLength(1)
    expect(printed.clients[0]!.mode).toBe('reverse')
    expect(printed.clients[0]!.port).toBeGreaterThan(0)

    // 子进程真收到 env（不是我们瞎猜的值，是绑定后回读的真端口）
    const childSaw = JSON.parse(await readFile(outFile, 'utf8')) as { url: string }
    expect(childSaw.url).toBe(`http://127.0.0.1:${printed.clients[0]!.port}`)
  }, 20_000)

  it('daemon 起来后真的会转发请求到上游（不只是打印了 env，端口真的活着直到子进程退出前）', async () => {
    const diagFile = join(h.cwd, 'diag.json')
    const script = `
      const http = require('http')
      const fs = require('fs')
      const u = new URL(process.env.ANTHROPIC_BASE_URL)
      const req = http.request({ host: u.hostname, port: Number(u.port), path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 2 } }, (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => { fs.writeFileSync(${JSON.stringify(diagFile)}, JSON.stringify({ status: res.statusCode, body })); process.exit(0) })
      })
      req.on('error', (e) => { fs.writeFileSync(${JSON.stringify(diagFile)}, JSON.stringify({ error: String(e) })); process.exit(0) })
      req.end('{}')
    `
    const { code } = await runBundle(
      ['tap', 'start', 'claude', '--', process.execPath, '-e', script],
      { TENON_TAP_DIR: tapDir, ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstream.port}` },
    )
    expect(code).toBe(0)
    const diag = JSON.parse(await readFile(diagFile, 'utf8')) as { status?: number; body?: string; error?: string }
    expect(diag).toEqual({ status: 200, body: expect.any(String) })
    expect(upstream.requests.length).toBe(1)
    expect(upstream.requests[0]!.url).toBe('/v1/messages')
  }, 20_000)

  it.skipIf(process.platform === 'win32')('daemon 模式（无 -- 命令）：真打印可 source 的 export 行，SIGINT 后真关 daemon 干净退出', async () => {
    const child = spawn(process.execPath, [
      BUNDLE, 'tap', 'start', 'claude',
    ], { env: { ...process.env, TENON_TAP_DIR: tapDir, ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstream.port}` } })
    let stdout = ''
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString('utf8') })

    // 等到真打印出 export 行（daemon 真绑好端口才会打印，不是猜时间）
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('等 export 行超时: ' + stdout)), 5000)
      const check = (): void => { if (stdout.includes('export ANTHROPIC_BASE_URL=')) { clearTimeout(timer); resolve() } }
      child.stdout?.on('data', check)
      check()
    })
    expect(stdout).toMatch(/^export ANTHROPIC_BASE_URL="http:\/\/127\.0\.0\.1:\d+"$/m)

    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on('exit', (code, signal) => resolve({ code, signal }))
    })
    child.kill('SIGINT')
    const { code, signal } = await exitPromise
    expect({ code, signal }).toEqual({ code: 0, signal: null }) // 真收到 SIGINT → 真关 daemon → 干净退出，不是被信号杀死
  }, 15_000)

  it.skipIf(process.platform === 'win32')('首条 stderr/JSON readiness 出现时立刻 SIGINT，也必须先关 daemon 再以 code 0 退出', async () => {
    const env = { TENON_TAP_DIR: tapDir, ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstream.port}` }
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const stderrOutcome = await signalDaemonAtFirstOutput({
        args: ['tap', 'start', 'claude'],
        env,
        stream: 'stderr',
        pattern: /\[tap\] claude/,
      })
      expect(stderrOutcome).toMatchObject({ code: 0, signal: null })

      const jsonOutcome = await signalDaemonAtFirstOutput({
        args: ['tap', 'start', 'claude', '--json'],
        env,
        stream: 'stdout',
        pattern: /^\{"clients":/,
      })
      expect(jsonOutcome).toMatchObject({ code: 0, signal: null })
    }
  }, 20_000)

  it('未知 client → exit 1，不绑任何端口', async () => {
    expect(await h.run(['tap', 'start', 'not-a-real-client'])).toBe(1)
  })

  it('forward client 缺 --ca → exit 1（拒绝而非静默盲隧道）', async () => {
    expect(await h.run(['tap', 'start', 'gemini'])).toBe(1)
    expect(h.err.join('\n')).toMatch(/ca/i)
  })

  it('未知子命令 exit 1', async () => {
    expect(await h.run(['tap', 'bogus'])).toBe(1)
  })

  it('无 client 参数 → exit 1', async () => {
    expect(await h.run(['tap', 'start'])).toBe(1)
  })
})
