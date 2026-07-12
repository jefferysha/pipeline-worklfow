/**
 * channel 子命令 —— 快速回归单测（in-memory ChannelFs：真 store 事件-sourcing 逻辑、无磁盘）。
 * C9 真实证据链在 channel.integration.test.ts（真临时 fs）；本文件是 mock 层快速回归。
 * 断言的是 cmdChannel 驱动真 createChannelStore 的真实副作用（真 append 真投影），非 mock 返回。
 */
import { describe, expect, test } from 'vitest'
import {
  createChannelStore,
  workerFile,
  type ChannelDirent,
  type ChannelEnv,
  type ChannelFs,
  type ProcessFace,
} from '@pipeline-lite/kernel'
import type { CliDeps } from '../deps.js'
import { cmdChannel, type ChannelHost } from './channel.js'

/** 内存 ChannelFs（真 store 逻辑，无磁盘）——listDir 从文件路径前缀 + 显式 dir 派生。 */
function makeMemFs(): ChannelFs {
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
    writeText: (p, d) => {
      files.set(p, d)
      addAncestors(p)
    },
    appendText: (p, d) => {
      files.set(p, (files.get(p) ?? '') + d)
      addAncestors(p)
    },
    mkdirp: (p) => {
      dirs.add(p)
      addAncestors(p)
    },
    listDir: (p) => {
      const prefix = p.endsWith('/') ? p : `${p}/`
      const out = new Map<string, ChannelDirent>()
      const consider = (full: string, leafIsFile: boolean): void => {
        if (!full.startsWith(prefix)) return
        const rest = full.slice(prefix.length)
        const seg = rest.split('/')[0]!
        const isDir = rest.includes('/') || !leafIsFile
        const prev = out.get(seg)
        if (prev === undefined || (isDir && !prev.isDirectory)) {
          out.set(seg, { name: seg, isFile: !isDir, isDirectory: isDir })
        }
      }
      for (const f of files.keys()) consider(f, true)
      for (const d of dirs) consider(d, false)
      return [...out.values()]
    },
    rename: (s, d) => {
      const v = files.get(s)
      if (v !== undefined) {
        files.set(d, v)
        files.delete(s)
        addAncestors(d)
      }
    },
    remove: (p) => {
      files.delete(p)
      dirs.delete(p)
    },
    mtimeMs: () => undefined,
    createExclusive: (p, c) => {
      if (files.has(p)) return false
      files.set(p, c)
      addAncestors(p)
      return true
    },
    pidAlive: () => false,
  }
}

function makeHost(): ChannelHost {
  const env: ChannelEnv = { root: '/mem/root', cwd: '/proj/x' }
  return { store: createChannelStore(env, makeMemFs(), () => '2026-07-07T00:00:00Z'), env }
}

interface Ctx {
  deps: CliDeps
  host: ChannelHost
  out: string[]
  err: string[]
  run: (sub: string, args: string[]) => Promise<number>
}

function ctx(): Ctx {
  const out: string[] = []
  const err: string[] = []
  const host = makeHost()
  // 红线守卫：store/flow 用 throwing proxy——cmdChannel 若触碰即测试失败（证明不触 barrier）。
  const forbidden = new Proxy(
    {},
    { get: () => { throw new Error('channel 触碰了 barrier 侧 deps（store/flow）——违反正交红线') } },
  )
  const deps = {
    store: forbidden,
    flow: forbidden,
    cwd: '/proj/x',
    io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) },
    clock: () => '2026-07-07T00:00:00Z',
    listChanges: async () => [],
  } as unknown as CliDeps
  return {
    deps,
    host,
    out,
    err,
    // 每次跑清空 out/err（与 integration-harness.run 同款），断言只看本次输出。
    run: (sub, args) => {
      out.length = 0
      err.length = 0
      return cmdChannel(deps, sub, args, host)
    },
  }
}

describe('create / send / messages 事件面', () => {
  test('create 落 create 事件，send 追加 message（seq 递增）', async () => {
    const c = ctx()
    expect(await c.run('create', ['chatty', '--task', 'demo', '--type', 'chat'])).toBe(0)
    const created = JSON.parse(c.out[0]!)
    expect(created).toMatchObject({ seq: 1, kind: 'create', by: 'main', type: 'chat' })

    expect(await c.run('send', ['chatty', 'hello', '--as', 'alice'])).toBe(0)
    const msg = JSON.parse(c.out[0]!)
    expect(msg).toMatchObject({ seq: 2, kind: 'message', by: 'alice', text: 'hello' })
  })

  test('send 缺 --as → exit 2', async () => {
    const c = ctx()
    expect(await c.run('send', ['chatty', 'hi'])).toBe(2)
    expect(c.err.join('\n')).toContain('需 --as')
  })

  test('messages --last 取尾 + --kind 过滤', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    await c.run('send', ['ch', 'm1', '--as', 'a'])
    await c.run('send', ['ch', 'm2', '--as', 'b'])
    await c.run('messages', ['ch', '--kind', 'message', '--last', '1'])
    expect(c.out).toHaveLength(1)
    expect(JSON.parse(c.out[0]!)).toMatchObject({ kind: 'message', by: 'b', text: 'm2' })
  })
})

describe('send 三态校验（append message 永不丢 + undeliverable）', () => {
  test('requireRunningWorker 定向到未知 worker → message + undeliverable', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    expect(await c.run('send', ['ch', 'go', '--as', 'main', '--to', 'ghost', '--delivery-mode', 'requireRunningWorker'])).toBe(0)
    expect(c.out).toHaveLength(2)
    expect(JSON.parse(c.out[0]!)).toMatchObject({ kind: 'message', to: 'ghost' })
    expect(JSON.parse(c.out[1]!)).toMatchObject({ kind: 'undeliverable', targetWorker: 'ghost', reason: 'worker-unknown' })
  })

  test('appendOnly（默认）→ 仅 message，无 undeliverable（保 pre-spawn backlog）', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    await c.run('send', ['ch', 'go', '--as', 'main', '--to', 'ghost'])
    expect(c.out).toHaveLength(1)
    expect(JSON.parse(c.out[0]!).kind).toBe('message')
  })
})

describe('wait 事件面（快照扫描）', () => {
  test('匹配 → 出首个事件 exit 0', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    await c.run('send', ['ch', 'ping', '--as', 'main', '--to', 'me'])
    expect(await c.run('wait', ['ch', '--as', 'me', '--since', '1'])).toBe(0)
    expect(JSON.parse(c.out[0]!)).toMatchObject({ kind: 'message', to: 'me' })
  })

  test('无匹配 → exit 124', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    expect(await c.run('wait', ['ch', '--as', 'me', '--since', '99'])).toBe(124)
    expect(c.err.join('\n')).toContain('timeout')
  })

  test('--all 必须配 --from', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    expect(await c.run('wait', ['ch', '--as', 'me', '--all'])).toBe(2)
  })
})

describe('数值 flag 校验（--since/--last 坏值 fail-loud exit 2，不静默返回全部——对齐 mem）', () => {
  test('wait --since abc → exit 2（旧行为：NaN 让过滤器静默失效）', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    expect(await c.run('wait', ['ch', '--as', 'me', '--since', 'abc'])).toBe(2)
    expect(c.err.join('\n')).toContain('--since')
  })

  test('messages --since abc → exit 2', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    expect(await c.run('messages', ['ch', '--since', 'abc'])).toBe(2)
    expect(c.err.join('\n')).toContain('--since')
  })

  test('messages --last abc → exit 2（旧行为：NaN 让 --last 静默失效、返回全部）', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    await c.run('send', ['ch', 'm1', '--as', 'a'])
    expect(await c.run('messages', ['ch', '--last', 'abc'])).toBe(2)
    expect(c.err.join('\n')).toContain('--last')
  })

  test('合法 --since / --last 仍正常（不误伤）', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    await c.run('send', ['ch', 'm1', '--as', 'a'])
    await c.run('send', ['ch', 'm2', '--as', 'b'])
    expect(await c.run('messages', ['ch', '--kind', 'message', '--last', '1'])).toBe(0)
    expect(c.out).toHaveLength(1)
    expect(await c.run('wait', ['ch', '--as', 'me', '--since', '99'])).toBe(124)
  })
})

describe('registry 投影', () => {
  test('spawned + 定向 message → pendingMessageCount', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't'])
    await c.host.store.append('ch', { kind: 'spawned', by: 'sup', as: 'w1' })
    await c.run('send', ['ch', 'go', '--as', 'main', '--to', 'w1'])
    await c.run('registry', ['ch'])
    const reg = JSON.parse(c.out[0]!)
    expect(reg.workers[0]).toMatchObject({ id: 'w1', pendingMessageCount: 1 })
  })
})

describe('forum thread（forum 校验 + rename 防 merge）', () => {
  test('chat channel 拒 thread 操作', async () => {
    const c = ctx()
    await c.run('create', ['ch', '--task', 't', '--type', 'chat'])
    expect(await c.run('thread', ['post', 'ch', '--as', 'x', '--action', 'opened', '--thread', 'T1'])).toBe(2)
    expect(c.err.join('\n')).toContain('不是 forum')
  })

  test('forum channel：opened + comment + forum list', async () => {
    const c = ctx()
    await c.run('create', ['f', '--task', 't', '--type', 'forum'])
    await c.run('thread', ['post', 'f', '--as', 'x', '--action', 'opened', '--thread', 'T1', '--title', 'Bug'])
    await c.run('thread', ['post', 'f', '--as', 'x', '--action', 'comment', '--thread', 'T1'])
    await c.run('forum', ['list', 'f'])
    expect(c.out.join('\n')).toContain('[open] T1 — Bug')
    expect(c.out.join('\n')).toContain('1 comments')
  })

  test('rename 目标已存在 → 拒 silently merge', async () => {
    const c = ctx()
    await c.run('create', ['f', '--task', 't', '--type', 'forum'])
    await c.run('thread', ['post', 'f', '--as', 'x', '--action', 'opened', '--thread', 'A'])
    await c.run('thread', ['post', 'f', '--as', 'x', '--action', 'opened', '--thread', 'B'])
    expect(await c.run('thread', ['rename', 'f', '--as', 'x', '--thread', 'A', '--new-thread', 'B'])).toBe(2)
    expect(c.err.join('\n')).toContain('silently merge')
  })
})

describe('list / dir / usage / 留后续', () => {
  test('list 汇总创建过的 channel', async () => {
    const c = ctx()
    await c.run('create', ['c1', '--task', 'first', '--type', 'chat'])
    await c.run('create', ['c2', '--task', 'second', '--type', 'forum'])
    await c.run('list', ['--json'])
    const parsed = JSON.parse(c.out[0]!)
    expect(parsed.channels.map((r: { name: string }) => r.name).sort()).toEqual(['c1', 'c2'])
  })

  test('dir 打印 channel 目录（在 channel root 下，不含 openspec）', async () => {
    const c = ctx()
    await c.run('dir', ['c1'])
    expect(c.out[0]).toContain('/mem/root')
    expect(c.out[0]).not.toContain('openspec')
  })

  test('usage', async () => {
    const c = ctx()
    expect(await c.run('', [])).toBe(0)
    expect(c.out.join('\n')).toContain('event-sourced worker 总线')
  })

  test('未知子命令 exit 2', async () => {
    const c = ctx()
    expect(await c.run('bogus', [])).toBe(2)
  })
})

// ── 进程层 mock 快速回归（真 fork/真信号/真 liveness 在 channel-process.integration.test.ts）──
interface ProcCtx {
  run: (sub: string, args: string[]) => Promise<number>
  out: string[]
  err: string[]
  host: ChannelHost
  fs: ChannelFs
  env: ChannelEnv
  killed: [number, string][]
  rmDirs: string[]
  alive: Set<number>
}

function procCtx(): ProcCtx {
  const out: string[] = []
  const err: string[] = []
  const fs = makeMemFs()
  const env: ChannelEnv = { root: '/mem/root', cwd: '/proj/x' }
  const store = createChannelStore(env, fs, () => '2026-07-07T00:00:00Z')
  const alive = new Set<number>()
  const killed: [number, string][] = []
  const rmDirs: string[] = []
  const proc: ProcessFace = {
    selfPid: 777,
    spawn: () => { throw new Error('no spawn in mock') },
    spawnDetached: () => 1000,
    pidAlive: (pid) => alive.has(pid),
    kill: (pid, sig = 'SIGTERM') => { killed.push([pid, sig]); alive.delete(pid); return true },
    isSupervisorProcess: () => true,
  }
  const host: ChannelHost = {
    store,
    env,
    fs,
    proc,
    now: () => Date.parse('2026-07-07T00:00:00Z'),
    sleep: async () => {},
    envVar: () => undefined,
    rmrf: (p) => rmDirs.push(p),
    // 注入 launcher：真复刻 supervisor 步骤 2/12（写 pid + append spawned），标 pid 活。
    launchSupervisor: async (ch, wk) => {
      const pid = 2000 + alive.size
      alive.add(pid)
      fs.writeText(workerFile(env, ch, wk, 'pid', 'project'), String(pid))
      store.append(ch, { kind: 'spawned', by: 'main', as: wk, provider: 'echo' })
      return { pid }
    },
  }
  const forbidden = new Proxy({}, { get: () => { throw new Error('channel 触碰了 barrier 侧 deps') } })
  const deps = {
    store: forbidden,
    flow: forbidden,
    cwd: '/proj/x',
    io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) },
    clock: () => '2026-07-07T00:00:00Z',
    listChanges: async () => [],
  } as unknown as CliDeps
  return {
    out, err, host, fs, env, killed, rmDirs, alive,
    run: (sub, args) => { out.length = 0; err.length = 0; return cmdChannel(deps, sub, args, host) },
  }
}

describe('spawn 预算执行 + reservation（mock 进程面）', () => {
  test('spawn --provider echo → fork + 打印 pid + 写 reservation', async () => {
    const c = procCtx()
    await c.run('create', ['c', '--task', 't'])
    expect(await c.run('spawn', ['c', '--as', 'w1', '--provider', 'echo'])).toBe(0)
    expect(c.out[0]).toBe('2000')
    expect(c.fs.readText(workerFile(c.env, 'c', 'w1', 'reservation', 'project'))).toBe('w1\n')
  })

  test('max-live-workers=1 第二个 → overflow reject exit 2（列活跃 + 三提示）', async () => {
    const c = procCtx()
    await c.run('create', ['c', '--task', 't'])
    expect(await c.run('spawn', ['c', '--as', 'w1', '--provider', 'echo', '--max-live-workers', '1'])).toBe(0)
    expect(await c.run('spawn', ['c', '--as', 'w2', '--provider', 'echo', '--max-live-workers', '1'])).toBe(2)
    expect(c.err.join('\n')).toContain('budget exhausted')
    expect(c.err.join('\n')).toContain("worker='w1'")
    expect(c.err.join('\n')).toContain('Free a slot')
  })

  test('spawn 缺 --as → exit 2；缺 provider/config → exit 2', async () => {
    const c = procCtx()
    expect(await c.run('spawn', ['c'])).toBe(2)
    expect(await c.run('spawn', ['c', '--as', 'w1'])).toBe(2)
  })
})

describe('kill（mock 进程面）', () => {
  test('kill 活 supervisor → SIGTERM + cleanup pid 文件', async () => {
    const c = procCtx()
    await c.run('create', ['c', '--task', 't'])
    await c.run('spawn', ['c', '--as', 'w1', '--provider', 'echo'])
    // spawn 后 pid 活；kill 发 SIGTERM，poll 见死（fake kill 删 alive）后 cleanup
    expect(await c.run('kill', ['c', '--as', 'w1'])).toBe(0)
    expect(c.killed.some(([, sig]) => sig === 'SIGTERM')).toBe(true)
    expect(c.fs.readText(workerFile(c.env, 'c', 'w1', 'pid', 'project'))).toBeUndefined()
  })

  test('kill 无 pid 文件 → exit 2', async () => {
    const c = procCtx()
    await c.run('create', ['c', '--task', 't'])
    expect(await c.run('kill', ['c', '--as', 'ghost'])).toBe(2)
  })

  test('kill supervisor 已死 → error(cli:kill) + exit 0', async () => {
    const c = procCtx()
    await c.run('create', ['c', '--task', 't'])
    c.fs.writeText(workerFile(c.env, 'c', 'w1', 'pid', 'project'), '9999') // 不在 alive → 死
    expect(await c.run('kill', ['c', '--as', 'w1'])).toBe(0)
    const evs = c.host.store.read('c')
    expect(evs.some((e) => e.kind === 'error' && e.by === 'cli:kill')).toBe(true)
  })
})

describe('prune（mock 进程面）', () => {
  test('selector 缺失/互斥 → exit 2', async () => {
    const c = procCtx()
    expect(await c.run('prune', [])).toBe(2)
    expect(await c.run('prune', ['--all', '--empty'])).toBe(2)
  })

  test('--all --dry-run 列死 worker channel，跳活 worker channel', async () => {
    const c = procCtx()
    await c.run('create', ['dead', '--task', 't'])
    await c.run('create', ['live', '--task', 't'])
    await c.run('spawn', ['live', '--as', 'w1', '--provider', 'echo']) // live 有活 worker
    const r = await c.run('prune', ['--all', '--dry-run'])
    expect(r).toBe(0)
    expect(c.out.join('\n')).toContain('would remove: dead')
    expect(c.out.join('\n')).not.toContain('would remove: live')
  })

  test('--all 无 --yes → 拒删 exit 2；--yes → rmrf 记录', async () => {
    const c = procCtx()
    await c.run('create', ['dead', '--task', 't'])
    expect(await c.run('prune', ['--all'])).toBe(2)
    expect(await c.run('prune', ['--all', '--yes'])).toBe(0)
    expect(c.rmDirs.some((d) => d.endsWith('/dead'))).toBe(true)
  })
})

describe('run ephemeral 控制流（mock 进程面）', () => {
  test('run --provider echo --message → done → rm + exit 0', async () => {
    const c = procCtx()
    // launcher 复刻 echo：spawned + 一条 done(by=runner) 让 run 的 wait 命中
    c.host.launchSupervisor = async (ch, wk) => {
      c.host.store.append(ch, { kind: 'spawned', by: 'main', as: wk, provider: 'echo' })
      c.host.store.append(ch, { kind: 'done', by: wk, text: 'echoed-body' })
      return { pid: 3000, shutdown: async () => {}, done: Promise.resolve(0) }
    }
    const r = await c.run('run', ['--name', 'rx', '--as', 'main', '--provider', 'echo', '--message', 'hi', '--timeout', '5s'])
    expect(r).toBe(0)
    expect(c.out.join('\n')).toContain('echoed-body')
    expect(c.rmDirs.some((d) => d.endsWith('/rx'))).toBe(true)
  })

  test('run 缺 --message → exit 2', async () => {
    const c = procCtx()
    expect(await c.run('run', ['--as', 'main', '--provider', 'echo'])).toBe(2)
  })
})
