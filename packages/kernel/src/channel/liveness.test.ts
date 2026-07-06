/**
 * liveness —— OS-liveness 四重判定 + SIGTERM cleanup + spawn 预算 + prune 助手单测。
 * 用内存 ChannelFs + 可控 ProcessFace 精确验证四重判定语义与信号副作用；
 * 真 fork/真 SIGTERM 判活判死在 channel-process.integration.test.ts。
 */
import { describe, expect, test } from 'vitest'
import { createChannelStore } from './store.js'
import { channelDir, eventsPath, workerFile, type ChannelEnv } from './paths.js'
import type { ChannelDirent, ChannelFs } from './fs.js'
import type { ProcessFace } from './process.js'
import {
  cleanupExpiredIdleWorkers,
  enforceSpawnBudget,
  hasLiveWorker,
  scanLiveWorkers,
  toOverflowFacts,
  type LivenessDeps,
} from './liveness.js'

function memFs(): ChannelFs {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  const addAncestors = (p: string): void => {
    let cur = p
    while (cur.includes('/') && cur.length > 1) {
      cur = cur.slice(0, cur.lastIndexOf('/'))
      if (cur) dirs.add(cur)
    }
  }
  return {
    pid: 4242,
    exists: (p) => files.has(p) || dirs.has(p),
    readText: (p) => files.get(p),
    writeText: (p, d) => { files.set(p, d); addAncestors(p) },
    appendText: (p, d) => { files.set(p, (files.get(p) ?? '') + d); addAncestors(p) },
    mkdirp: (p) => { dirs.add(p); addAncestors(p) },
    listDir: (p) => {
      const prefix = p.endsWith('/') ? p : `${p}/`
      const out = new Map<string, ChannelDirent>()
      const consider = (full: string, leafIsFile: boolean): void => {
        if (!full.startsWith(prefix)) return
        const rest = full.slice(prefix.length)
        const seg = rest.split('/')[0]!
        const isDir = rest.includes('/') || !leafIsFile
        const prev = out.get(seg)
        if (prev === undefined || (isDir && !prev.isDirectory)) out.set(seg, { name: seg, isFile: !isDir, isDirectory: isDir })
      }
      for (const f of files.keys()) consider(f, true)
      for (const d of dirs) consider(d, false)
      return [...out.values()]
    },
    rename: (s, d) => { const v = files.get(s); if (v !== undefined) { files.set(d, v); files.delete(s); addAncestors(d) } },
    remove: (p) => { files.delete(p); dirs.delete(p) },
    mtimeMs: () => undefined,
    createExclusive: (p, c) => { if (files.has(p)) return false; files.set(p, c); addAncestors(p); return true },
    pidAlive: () => false,
  }
}

interface FakeProcOpts {
  alive?: Set<number>
  verified?: boolean | ((pid: number, ch: string, wk: string) => boolean)
  killReturns?: boolean
  killed?: [number, string][]
}

function fakeProc(o: FakeProcOpts = {}): ProcessFace {
  const alive = o.alive ?? new Set<number>()
  return {
    selfPid: 999,
    spawn: () => { throw new Error('no spawn in fake') },
    spawnDetached: () => undefined,
    pidAlive: (pid) => alive.has(pid),
    kill: (pid, sig = 'SIGTERM') => { o.killed?.push([pid, sig]); if (o.killReturns === false) return false; alive.delete(pid); return true },
    isSupervisorProcess: (pid, ch, wk) => (typeof o.verified === 'function' ? o.verified(pid, ch, wk) : (o.verified ?? true)),
  }
}

const CLOCK = '2026-07-07T00:00:00Z'

function setup() {
  const fs = memFs()
  const env: ChannelEnv = { root: '/mem/root', cwd: '/proj/x' }
  const store = createChannelStore(env, fs, () => CLOCK)
  return { fs, env, store }
}

/** 造一个 running worker：spawned 事件 + <worker>.pid 文件。 */
function makeRunningWorker(fs: ChannelFs, env: ChannelEnv, store: ReturnType<typeof createChannelStore>, channel: string, worker: string, supPid: number, extra?: { workerPid?: number; idleSince?: string; ts?: string }): void {
  store.append(channel, { kind: 'spawned', by: 'main', as: worker, provider: 'echo', ...(extra?.ts ? { ts: extra.ts } : {}) })
  fs.writeText(workerFile(env, channel, worker, 'pid', 'project'), String(supPid))
  if (extra?.workerPid) fs.writeText(workerFile(env, channel, worker, 'worker-pid', 'project'), String(extra.workerPid))
}

describe('scanLiveWorkers 四重判定', () => {
  test('①非terminal ②pid文件 ③pidAlive ④ps验证 全过 → 计入活', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111, { workerPid: 222 })
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111]), verified: true }) }
    const live = scanLiveWorkers(deps)
    expect(live).toHaveLength(1)
    expect(live[0]).toMatchObject({ channel: 'ch', workerId: 'w1', supervisorPid: 111, supervisorVerified: true, workerPid: 222 })
  })

  test('判定③ pid 死 → 剔除', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111)
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set() }) } // 无活 pid
    expect(scanLiveWorkers(deps)).toHaveLength(0)
  })

  test('判定② 无 pid 文件 → 剔除', () => {
    const { fs, env, store } = setup()
    store.append('ch', { kind: 'spawned', by: 'main', as: 'w1', provider: 'echo' }) // 只有事件、无 pid 文件
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111]) }) }
    expect(scanLiveWorkers(deps)).toHaveLength(0)
  })

  test('判定① terminal（killed）→ 剔除', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111)
    store.append('ch', { kind: 'killed', by: 'supervisor:w1', worker: 'w1', reason: 'explicit-kill', signal: 'SIGTERM' })
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111]) }) }
    expect(scanLiveWorkers(deps)).toHaveLength(0)
  })

  test('判定④ ps 不验证 → 仍计入但 supervisorVerified=false（供 overflow 标注）', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111)
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111]), verified: false }) }
    const live = scanLiveWorkers(deps)
    expect(live).toHaveLength(1)
    expect(live[0]!.supervisorVerified).toBe(false)
  })

  test('reservation 占位：spawn 事件未落盘也不漏算（pid 活）', () => {
    const { fs, env, store } = setup()
    store.ensureDir('ch', 'project')
    fs.writeText(workerFile(env, 'ch', 'resv', 'reservation', 'project'), 'resv\n')
    fs.writeText(workerFile(env, 'ch', 'resv', 'pid', 'project'), '333')
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([333]), verified: true }) }
    const live = scanLiveWorkers(deps)
    expect(live).toHaveLength(1)
    expect(live[0]).toMatchObject({ workerId: 'resv', state: { lifecycle: 'starting', activity: 'idle' } })
  })
})

describe('cleanupExpiredIdleWorkers 写 shutdown-reason + SIGTERM（不写 killed）', () => {
  test('过期 idle → 写侧车 + SIGTERM supervisor', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111, { ts: '2026-07-07T00:00:00Z' })
    // worker idle since 00:00:00；now 远超 idleTimeout
    const nowMs = Date.parse('2026-07-07T01:00:00Z')
    const killed: [number, string][] = []
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111]), verified: true, killed }) }
    const live = scanLiveWorkers(deps)
    const res = cleanupExpiredIdleWorkers(deps, live, 60_000, nowMs)
    expect(res.killed).toHaveLength(1)
    expect(killed).toEqual([[111, 'SIGTERM']])
    // 写了 shutdown-reason 侧车
    expect(fs.readText(workerFile(env, 'ch', 'w1', 'shutdown-reason', 'project'))).toBe('idle-timeout\n')
    // ★绝不写 killed 事件（唯一来源是 supervisor 漏斗）
    const evText = fs.readText(eventsPath(env, 'ch', 'project')) ?? ''
    expect(evText).not.toContain('"kind":"killed"')
  })

  test('SIGTERM 失败 → 回滚侧车 + 记 failed（防下次误判 idle）', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111, { ts: '2026-07-07T00:00:00Z' })
    const nowMs = Date.parse('2026-07-07T01:00:00Z')
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111]), verified: true, killReturns: false }) }
    const live = scanLiveWorkers(deps)
    const res = cleanupExpiredIdleWorkers(deps, live, 60_000, nowMs)
    expect(res.killed).toHaveLength(0)
    expect(res.failed).toHaveLength(1)
    expect(fs.readText(workerFile(env, 'ch', 'w1', 'shutdown-reason', 'project'))).toBeUndefined()
  })

  test('mid-turn（activity!=idle）永不杀', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111, { ts: '2026-07-07T00:00:00Z' })
    store.append('ch', { kind: 'turn_started', by: 'w1', worker: 'w1', turnId: 'msg:2', inputSeq: 2 }) // → mid-turn，清 idleSince
    const nowMs = Date.parse('2026-07-07T01:00:00Z')
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111]), verified: true }) }
    const res = cleanupExpiredIdleWorkers(deps, scanLiveWorkers(deps), 60_000, nowMs)
    expect(res.killed).toHaveLength(0)
  })

  test('idleTimeoutMs<=0 → 禁用（no-op）', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111, { ts: '2026-07-07T00:00:00Z' })
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111]), verified: true }) }
    expect(cleanupExpiredIdleWorkers(deps, scanLiveWorkers(deps), 0, Date.now()).killed).toHaveLength(0)
  })
})

describe('enforceSpawnBudget scan→cleanup→重扫→判额', () => {
  test('maxLiveWorkers<=0 → 禁用预算恒 allowed', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111)
    makeRunningWorker(fs, env, store, 'ch', 'w2', 222)
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111, 222]), verified: true }) }
    expect(enforceSpawnBudget(deps, { idleTimeoutMs: 0, maxLiveWorkers: 0 }, Date.now()).allowed).toBe(true)
  })

  test('活数 >= 上限 → reject（allowed=false，绝不自动杀非 idle）', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111)
    makeRunningWorker(fs, env, store, 'ch', 'w2', 222)
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111, 222]), verified: true }) }
    const res = enforceSpawnBudget(deps, { idleTimeoutMs: 0, maxLiveWorkers: 2 }, Date.now())
    expect(res.allowed).toBe(false)
    expect(res.remaining).toHaveLength(2)
  })

  test('过期 idle 被 cleanup 腾位 → 重扫剔已杀 → allowed', () => {
    const { fs, env, store } = setup()
    // w1 过期 idle（会被杀），w2 活
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111, { ts: '2026-07-07T00:00:00Z' })
    makeRunningWorker(fs, env, store, 'ch', 'w2', 222, { ts: '2026-07-07T00:59:59Z' })
    const nowMs = Date.parse('2026-07-07T01:00:00Z')
    const alive = new Set([111, 222])
    // kill 从 alive 删除 pid → 重扫时 w1 判死被剔
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive, verified: true }) }
    const res = enforceSpawnBudget(deps, { idleTimeoutMs: 60_000, maxLiveWorkers: 2 }, nowMs)
    expect(res.cleaned).toHaveLength(1)
    expect(res.remaining).toHaveLength(1) // 只剩 w2
    expect(res.allowed).toBe(true)
  })
})

describe('hasLiveWorker + toOverflowFacts', () => {
  test('hasLiveWorker：任一 *.pid 活 → true', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111)
    const dir = channelDir(env, 'ch', 'project')
    expect(hasLiveWorker(fs, fakeProc({ alive: new Set([111]) }), dir)).toBe(true)
    expect(hasLiveWorker(fs, fakeProc({ alive: new Set() }), dir)).toBe(false)
  })

  test('toOverflowFacts 携 provider/lifecycle/verified 供 formatBudgetOverflowError', () => {
    const { fs, env, store } = setup()
    makeRunningWorker(fs, env, store, 'ch', 'w1', 111)
    const deps: LivenessDeps = { env, fs, proc: fakeProc({ alive: new Set([111]), verified: false }) }
    const facts = toOverflowFacts(scanLiveWorkers(deps))
    expect(facts[0]).toMatchObject({ channel: 'ch', workerId: 'w1', provider: 'echo', lifecycle: 'running', supervisorPid: 111, supervisorVerified: false })
  })
})
