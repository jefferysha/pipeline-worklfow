/**
 * cmdAfk('cancel') —— `tenon afk cancel <name>` 是 server POST /api/afk/:name/cancel
 * （packages/server/src/afk.ts::cancelAfkRun）的 CLI 终端等价：前置校验（change 存在 →
 * automation==running → worktree/sandbox 非空）→ 先落取消标记文件（worktree 根，复用 automation
 * 单一常量 CANCEL_MARKER_FILE）→ 再 docker kill 容器。docker 不可用/非 running 走诚实门降级。
 *
 * 打桩口径：vi.mock 只动 automation 的 docker 面——dockerAvailable/nodeExec 由 hoisted 可变引用
 * 控制（dockerOk 开关 + calls 录 argv），其余（CANCEL_MARKER_FILE 常量、createAutomation）全走真实现。
 * 取消标记真落到临时 worktree 目录（真 fs.writeFile，不 fake），断言文件真存在。
 */
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDeps, mockState } from '../test-support.js'
import { cmdAfk } from './afk.js'

/** hoisted 可变引用：docker 探针开关 + docker argv 录（vi.mock 工厂被 hoist，必须走 vi.hoisted）。 */
const h = vi.hoisted(() => ({ dockerOk: true, calls: [] as string[][] }))

vi.mock('@tenon/automation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tenon/automation')>()
  const fakeExec: typeof actual.nodeExec = async (file, args) => {
    h.calls.push([file, ...args])
    return { stdout: '', stderr: '', exitCode: 0 }
  }
  return {
    ...actual, // CANCEL_MARKER_FILE / createAutomation 走真实现，绝不另拼常量
    dockerAvailable: async () => h.dockerOk,
    nodeExec: fakeExec,
  }
})

const MARKER = '.cancel-requested' // = automation CANCEL_MARKER_FILE 字面量（worktree.ts 单一真相源）

async function fileExists(p: string): Promise<boolean> {
  return access(p).then(() => true, () => false)
}

describe("cmdAfk('cancel') —— 对齐 server cancelAfkRun 的 CLI 终端等价", () => {
  let cwd: string
  let worktree: string
  beforeEach(async () => {
    h.calls.length = 0
    h.dockerOk = true
    cwd = await mkdtemp(join(tmpdir(), 'afk-cancel-'))
    // 真 worktree 目录（取消标记真落盘的落点）
    worktree = join(cwd, '.sandcastle', 'worktrees', 'wt')
    await mkdir(worktree, { recursive: true })
  })
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  const runningDeps = () =>
    makeDeps({
      cwd,
      states: {
        c: mockState({
          automation: 'running',
          automation_worktree: worktree,
          automation_sandbox: 'sandcastle-abc',
        }),
      },
    })

  it('成功路径：running + worktree/sandbox 齐全 + docker 可用 → 落取消标记 + docker kill 容器', async () => {
    const d = runningDeps()
    expect(await cmdAfk(d, 'cancel', 'c', {})).toBe(0)

    // 取消标记真落到 worktree 根
    expect(await fileExists(join(worktree, MARKER))).toBe(true)
    // docker kill 真被调（fake exec 录到）
    const kill = h.calls.find((c) => c[0] === 'docker' && c[1] === 'kill')
    expect(kill).toEqual(['docker', 'kill', 'sandcastle-abc'])
    // 顺序：标记先于 kill —— 断言 kill 确实发生在标记已落之后由 cmdAfk 内部顺序保证；此处证据是二者都发生
    expect(d.errLines.join('\n')).toContain('已取消')
  })

  it('成功路径 JSON：--json 出 {cancelled:true,killed:true}', async () => {
    const d = runningDeps()
    expect(await cmdAfk(d, 'cancel', 'c', { json: true })).toBe(0)
    expect(JSON.parse(d.outLines.join(''))).toEqual({ change: 'c', cancelled: true, killed: true })
  })

  it('docker 缺失降级（诚实门）：标记仍落，但不伪装已 kill，exit 0 + 明示 stderr', async () => {
    h.dockerOk = false
    const d = runningDeps()
    expect(await cmdAfk(d, 'cancel', 'c', {})).toBe(0)

    // 标记仍落（取消意图已记录）
    expect(await fileExists(join(worktree, MARKER))).toBe(true)
    // 未调 docker kill（诚实门：docker 不可用不伪装）
    expect(h.calls.find((c) => c[0] === 'docker' && c[1] === 'kill')).toBeUndefined()
    expect(d.errLines.join('\n')).toContain('未检测到 docker daemon')
  })

  it('docker 缺失 JSON：killed:false + reason=docker-unavailable', async () => {
    h.dockerOk = false
    const d = runningDeps()
    expect(await cmdAfk(d, 'cancel', 'c', { json: true })).toBe(0)
    expect(JSON.parse(d.outLines.join(''))).toEqual({
      change: 'c',
      cancelled: true,
      killed: false,
      reason: 'docker-unavailable',
    })
  })

  it('非 running（queued）→ exit 3 无任何动作（不落标记、不 kill）', async () => {
    const d = makeDeps({ cwd, states: { c: mockState({ automation: 'queued' }) } })
    expect(await cmdAfk(d, 'cancel', 'c', {})).toBe(3)
    expect(await fileExists(join(worktree, MARKER))).toBe(false)
    expect(h.calls.length).toBe(0)
    expect(d.errLines.join('\n')).toContain('不是 running')
  })

  it('running 但缺 worktree/sandbox 字段 → exit 1 无任何动作', async () => {
    const d = makeDeps({ cwd, states: { c: mockState({ automation: 'running' }) } })
    expect(await cmdAfk(d, 'cancel', 'c', {})).toBe(1)
    expect(h.calls.length).toBe(0)
    expect(d.errLines.join('\n')).toContain('无法定位沙箱容器')
  })

  it('change 不存在（store.get throw ENOENT）→ exit 1 诚实门', async () => {
    const d = makeDeps({ cwd, states: { other: mockState({ automation: 'running' }) } })
    expect(await cmdAfk(d, 'cancel', 'c', {})).toBe(1)
    expect(d.errLines.join('\n')).toContain("找不到 change 'c'")
  })

  it('非法 change 名 → exit 1', async () => {
    const d = runningDeps()
    expect(await cmdAfk(d, 'cancel', 'bad/name', {})).toBe(1)
    expect(d.errLines.join('\n')).toContain('cancel 需合法 change 名')
  })
})
