/**
 * channel 进程管理层 —— 真进程端到端集成测试（BACKLOG #27b / GOAL A4 M4，GOAL C9：无伪测试）。
 *
 * 零 mock：真 fork 子进程（node -e / cat）、真 stdin/stdout 桥、真 SIGTERM 信号、真 os.kill 判活判死、
 * 真 events.jsonl live-tail、真 prune 清死 worker。真临时 channel root + 真 nodeProcessFace/nodeChannelFs。
 *
 * ★架构红线自证：进程层全程只碰 channel root + worker 子进程 + OS 信号；cwd 下零 openspec/三门 marker 变化。
 */
import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  createChannelStore,
  echoOnlyAdapters,
  eventsPath,
  nodeChannelFs,
  nodeProcessFace,
  scanLiveWorkers,
  startSupervisor,
  workerFile,
  type ChannelEnv,
  type ChannelStore,
  type SupervisorConfig,
} from '@pipeline-lite/kernel'
import { cmdChannel, type ChannelHost, type LaunchedSupervisor } from './commands/channel.js'
import { realDeps } from './integration-harness.js'

let root: string
let cwd: string
let env: ChannelEnv
let store: ChannelStore
const proc = nodeProcessFace()
const fs = nodeChannelFs()

/** 真跑 cmdChannel（realDeps + 注入 host）。 */
async function ch(host: ChannelHost, sub: string, args: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = []
  const err: string[] = []
  const code = await cmdChannel(realDeps(cwd, out, err), sub, args, host)
  return { code, out, err }
}

async function readEvents(name: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(eventsPath(env, name, 'project'), 'utf8')
  return text.trim().split('\n').filter((l) => l).map((l) => JSON.parse(l) as Record<string, unknown>)
}

async function waitPidDead(pid: number, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline && proc.pidAlive(pid)) await new Promise((r) => setTimeout(r, 20))
}

/**
 * 真 fork 一个 detached「supervisor-像」进程：argv 匹配 ps 正则（channel __supervisor <ch> <wk>），
 * 睡 30s（测试提前 SIGTERM 杀）。返回 pid。node 默认 SIGTERM 即退，供 kill grace 判活判死。
 */
function forkFakeSupervisor(channel: string, worker: string): number {
  const child = nodeSpawn(
    process.execPath,
    ['-e', 'setTimeout(()=>{},30000)', 'channel', '__supervisor', channel, worker, '/cfg'],
    { detached: true, stdio: 'ignore' },
  )
  child.unref()
  return child.pid!
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'chproc-root-'))
  cwd = await mkdtemp(join(tmpdir(), 'chproc-cwd-'))
  env = { root, cwd }
  store = createChannelStore(env, fs, () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(cwd, { recursive: true, force: true })
})

function baseHost(overrides: Partial<ChannelHost> = {}): ChannelHost {
  return { store, env, proc, fs, now: () => Date.now(), ...overrides }
}

// ═══════════════════════ 1. 真 fork worker 子进程 + 三循环桥接（kernel startSupervisor）═══════════════════════
describe('真 fork worker 子进程 + 真 tail + 三循环桥接（echo adapter → 真 cat）', () => {
  test('startSupervisor 真起 cat worker：send → inbox-watcher live-tail → stdin → 回显 → stdout-pump → done', async () => {
    await store.append('bridge', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const config: SupervisorConfig = { provider: 'echo', inboxPolicy: 'explicitOnly' }
    const handle = await startSupervisor('bridge', 'w1', config, {
      store,
      proc,
      fs,
      env,
      resolveAdapter: echoOnlyAdapters,
      pollMs: 15,
    })
    expect(handle.spawned).toBe(true)
    expect(typeof handle.workerPid).toBe('number')
    expect(proc.pidAlive(handle.workerPid!)).toBe(true) // 真 worker 子进程活

    // 真 append 一条定向 message → inbox watcher 真 tail 到 → 喂真 cat stdin → 回显 → done 事件
    store.append('bridge', { kind: 'message', by: 'main', to: 'w1', text: 'hello-worker' })

    // 真轮询 events.jsonl 等 done 落盘（真事件流）
    const deadline = Date.now() + 8000
    let sawDone = false
    while (Date.now() < deadline) {
      const evs = await readEvents('bridge')
      if (evs.some((e) => e.kind === 'done' && e.by === 'w1')) { sawDone = true; break }
      await new Promise((r) => setTimeout(r, 25))
    }
    expect(sawDone).toBe(true)

    const evs = await readEvents('bridge')
    const kinds = evs.map((e) => e.kind)
    // spawned（真 fork 落地）→ turn_started（inbox watcher 起 turn）→ done（回显）→ turn_finished
    expect(kinds).toContain('spawned')
    expect(kinds).toContain('turn_started')
    expect(kinds).toContain('done')
    expect(kinds).toContain('turn_finished')
    const echoed = evs.find((e) => e.kind === 'done' && e.by === 'w1')!
    expect(echoed.text).toBe('hello-worker') // 真回显文本

    // 真优雅收尾：SIGTERM kill ladder 杀真 cat 子进程
    const wpid = handle.workerPid!
    await handle.shutdown('SIGTERM', 'explicit-kill')
    await handle.done
    await waitPidDead(wpid)
    expect(proc.pidAlive(wpid)).toBe(false) // 真 worker 子进程被真杀

    // killed 事件由 supervisor 漏斗写；pid 文件被 cleanup 删
    const after = await readEvents('bridge')
    expect(after.some((e) => e.kind === 'killed' && e.by === 'supervisor:w1')).toBe(true)
    expect(existsSync(workerFile(env, 'bridge', 'w1', 'pid', 'project'))).toBe(false)
  }, 20000)
})

// ═══════════════════════ 2. CLI spawn：真预算执行 + reservation + 真 fork ═══════════════════════
describe('CLI spawn：真 enforceSpawnBudget + reservation + 真 fork（overflow reject not guess）', () => {
  /** 注入 launcher：真 fork「supervisor-像」进程 + 写 pid + append spawned（复刻真 supervisor 步骤 2/12）。 */
  const forkingLauncher = (): ChannelHost['launchSupervisor'] => async (channel, worker) => {
    const pid = forkFakeSupervisor(channel, worker)
    fs.writeText(workerFile(env, channel, worker, 'pid', 'project'), String(pid))
    store.append(channel, { kind: 'spawned', by: 'main', as: worker, provider: 'echo' })
    const launched: LaunchedSupervisor = { pid }
    return launched
  }

  test('spawn 真 fork + 写 reservation + 打印 pid；第二个超预算 → overflow exit 2 + 列活跃', async () => {
    await store.append('c', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const host = baseHost({ launchSupervisor: forkingLauncher() })

    const r1 = await ch(host, 'spawn', ['c', '--as', 'w1', '--provider', 'echo', '--max-live-workers', '1'])
    expect(r1.code).toBe(0)
    const pid1 = Number.parseInt(r1.out[0]!.trim(), 10)
    expect(proc.pidAlive(pid1)).toBe(true) // 真 fork 落地
    // reservation 真写盘
    expect(existsSync(workerFile(env, 'c', 'w1', 'reservation', 'project'))).toBe(true)

    // 第二个 spawn（max=1，已一个活）→ overflow，绝不自动杀，exit 2
    const r2 = await ch(host, 'spawn', ['c', '--as', 'w2', '--provider', 'echo', '--max-live-workers', '1'])
    expect(r2.code).toBe(2)
    expect(r2.err.join('\n')).toContain('budget exhausted')
    expect(r2.err.join('\n')).toContain("worker='w1'")

    proc.kill(pid1, 'SIGKILL')
    await waitPidDead(pid1)
  }, 20000)
})

// ═══════════════════════ 3. CLI kill：真 SIGTERM supervisor + grace + cleanup ═══════════════════════
describe('CLI kill：真 SIGTERM 杀真进程 + 真判死 + cleanup 删短暂件', () => {
  test('kill --as → 真 SIGTERM 真 supervisor 进程，判死后 cleanup pid 文件', async () => {
    await store.append('k', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const pid = forkFakeSupervisor('k', 'w1')
    fs.writeText(workerFile(env, 'k', 'w1', 'pid', 'project'), String(pid))
    fs.writeText(workerFile(env, 'k', 'w1', 'worker-pid', 'project'), String(pid))
    store.append('k', { kind: 'spawned', by: 'main', as: 'w1', provider: 'echo' })
    expect(proc.pidAlive(pid)).toBe(true)

    const r = await ch(baseHost(), 'kill', ['k', '--as', 'w1'])
    expect(r.code).toBe(0)
    await waitPidDead(pid)
    expect(proc.pidAlive(pid)).toBe(false) // 真进程被真 SIGTERM 杀死
    // cleanup 删短暂件
    expect(existsSync(workerFile(env, 'k', 'w1', 'pid', 'project'))).toBe(false)
    expect(existsSync(workerFile(env, 'k', 'w1', 'worker-pid', 'project'))).toBe(false)
  }, 20000)

  test('kill supervisor 已死 → append error(supervisor lost) + cleanup + exit 0', async () => {
    await store.append('k2', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const pid = forkFakeSupervisor('k2', 'w1')
    proc.kill(pid, 'SIGKILL')
    await waitPidDead(pid)
    fs.writeText(workerFile(env, 'k2', 'w1', 'pid', 'project'), String(pid)) // 死 pid 文件
    const r = await ch(baseHost(), 'kill', ['k2', '--as', 'w1'])
    expect(r.code).toBe(0)
    const evs = await readEvents('k2')
    expect(evs.some((e) => e.kind === 'error' && e.by === 'cli:kill')).toBe(true)
  }, 20000)

  test('kill 无 pid 文件 → exit 2', async () => {
    await store.append('k3', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const r = await ch(baseHost(), 'kill', ['k3', '--as', 'ghost'])
    expect(r.code).toBe(2)
  })
})

// ═══════════════════════ 4. CLI prune：真判活跳过 + 真删死 worker channel ═══════════════════════
describe('CLI prune：跳 hasLiveWorker（真判活）+ 真删死 worker channel', () => {
  test('活 worker channel 被跳过；死 worker channel --all --yes 真删', async () => {
    // 活 worker channel
    await store.append('live', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const livePid = forkFakeSupervisor('live', 'w1')
    fs.writeText(workerFile(env, 'live', 'w1', 'pid', 'project'), String(livePid))
    // 死 worker channel
    await store.append('dead', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const deadPid = forkFakeSupervisor('dead', 'w1')
    proc.kill(deadPid, 'SIGKILL')
    await waitPidDead(deadPid)
    fs.writeText(workerFile(env, 'dead', 'w1', 'pid', 'project'), String(deadPid))

    // dry-run 先看：只列 dead（live 被跳）
    const dry = await ch(baseHost(), 'prune', ['--all', '--dry-run'])
    expect(dry.code).toBe(0)
    expect(dry.out.join('\n')).toContain('dead')
    expect(dry.out.join('\n')).not.toContain('would remove: live')

    // 真删（--yes）
    const r = await ch(baseHost(), 'prune', ['--all', '--yes'])
    expect(r.code).toBe(0)
    expect(existsSync(join(root, store.channelDir('dead').slice(root.length + 1).split('/')[0]!, 'dead'))).toBe(false)
    // live channel 仍在（有活 worker）
    expect(existsSync(store.channelDir('live'))).toBe(true)

    proc.kill(livePid, 'SIGKILL')
    await waitPidDead(livePid)
  }, 20000)

  test('prune 无 --yes → 拒删 exit 2', async () => {
    await store.append('dead2', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const r = await ch(baseHost(), 'prune', ['--all'])
    expect(r.code).toBe(2)
  })

  test('prune selector 互斥 → exit 2', async () => {
    const r = await ch(baseHost(), 'prune', ['--all', '--empty'])
    expect(r.code).toBe(2)
  })
})

// ═══════════════════════ 5. CLI run：ephemeral 端到端（真 echo 桥接）═══════════════════════
describe('CLI run：ephemeral create→spawn→send→wait done→rm（真 echo 桥）', () => {
  test('run --provider echo --message → 真回显 done → rm channel + stdout body', async () => {
    // 注入 in-proc supervisor launcher（真 cat 子进程桥接）
    const launcher: ChannelHost['launchSupervisor'] = async (channel, worker, config, scope) => {
      const h = await startSupervisor(channel, worker, config, {
        store, proc, fs, env, resolveAdapter: echoOnlyAdapters, scope, pollMs: 15,
      })
      return { pid: h.workerPid, shutdown: h.shutdown, done: h.done }
    }
    const r = await ch(baseHost({ launchSupervisor: launcher }), 'run', [
      '--name', 'runx', '--as', 'main', '--provider', 'echo', '--message', 'ping-run', '--timeout', '10s',
    ])
    expect(r.code).toBe(0)
    expect(r.out.join('\n')).toContain('ping-run') // 真回显 body 出 stdout
    // ephemeral channel 成功后被 rm
    expect(existsSync(store.channelDir('runx'))).toBe(false)
  }, 25000)
})

// ═══════════════════════ 6. OS-liveness 四重判定 over 真 fork 进程（真 ps 验证）═══════════════════════
describe('scanLiveWorkers 四重判定 over 真 fork 进程（真 os.kill + 真 ps）', () => {
  test('真起匹配 cmdline 进程 → 四重全过判活；真 SIGTERM 杀后 → 判死消失', async () => {
    await store.append('scan', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const pid = forkFakeSupervisor('scan', 'w1')
    fs.writeText(workerFile(env, 'scan', 'w1', 'pid', 'project'), String(pid))
    store.append('scan', { kind: 'spawned', by: 'main', as: 'w1', provider: 'echo' })

    const live1 = scanLiveWorkers({ env, fs, proc })
    expect(live1).toHaveLength(1)
    expect(live1[0]).toMatchObject({ channel: 'scan', workerId: 'w1', supervisorPid: pid })
    expect(live1[0]!.supervisorVerified).toBe(true) // 真 ps cmdline 匹配

    proc.kill(pid, 'SIGTERM')
    await waitPidDead(pid)
    const live2 = scanLiveWorkers({ env, fs, proc }) // 真判死（os.kill(pid,0) ESRCH）
    expect(live2).toHaveLength(0)
  }, 20000)
})

// ═══════════════════════ 7. 架构红线：进程层跑完 cwd 零 openspec/门 marker 变化 ═══════════════════════
describe('★架构红线 —— channel 进程层绝不触 barrier / 三门 / openspec', () => {
  test('spawn/kill/prune 全流程后：cwd 下零 openspec、三门 marker mtime 不变', async () => {
    // 预置一个三门 marker（模拟 barrier 侧状态）
    const marker = join(cwd, '.pipeline-pending-review')
    await writeFile(marker, 'review\nguidance\nchange-x\n', 'utf8')
    const before = statSync(marker).mtimeMs
    await mkdir(join(cwd, 'openspec', 'changes', 'change-x'), { recursive: true })

    await store.append('rl', { kind: 'create', by: 'main', action: 'create', task: 't', type: 'chat' })
    const pid = forkFakeSupervisor('rl', 'w1')
    fs.writeText(workerFile(env, 'rl', 'w1', 'pid', 'project'), String(pid))
    store.append('rl', { kind: 'spawned', by: 'main', as: 'w1', provider: 'echo' })
    await ch(baseHost(), 'kill', ['rl', '--as', 'w1'])
    await waitPidDead(pid)
    await ch(baseHost(), 'prune', ['--empty', '--dry-run'])

    // 三门 marker 未被进程层触碰（mtime 不变）；无新 openspec/门 marker
    expect(existsSync(marker)).toBe(true)
    expect(statSync(marker).mtimeMs).toBe(before)
    for (const m of ['.pipeline-pending-confirm', '.pipeline-pending-interaction']) {
      expect(existsSync(join(cwd, m))).toBe(false)
    }
    // channel 事件里绝无 build_sha 字段
    for (const e of await readEvents('rl')) expect(e).not.toHaveProperty('build_sha')
  }, 20000)
})
