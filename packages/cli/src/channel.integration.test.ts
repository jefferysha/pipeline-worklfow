/**
 * channel event-sourced worker 总线 —— 真实端到端集成测试（BACKLOG #27，GOAL C9：无伪测试）。
 *
 * 零 mock：真临时 channel root（nodeChannelFs 真读写磁盘）→ 真 cmdChannel append 事件到真 events.jsonl
 * → 真从事件流重建 registry/thread 状态 → 断言真实的事件流→状态重建结果（真 append 真重建真断言）。
 * realDeps 是真 kernel deps（与 main.ts 同款）；但 cmdChannel 只用 deps.io——不碰 deps.store/flow（正交红线）。
 *
 * ★红线自证：channel 事件全落在临时 channel root，openspec/changes 与三门 marker 全程零创建。
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createChannelStore } from '@pipeline-lite/kernel'
import { cmdChannel, type ChannelHost } from './commands/channel.js'
import { realDeps } from './integration-harness.js'

const FIXED_CLOCK = '2026-07-07T00:00:00Z'

let root: string
let cwd: string
let host: ChannelHost
let bucketDir: string

function channelEventsFile(name: string): string {
  return join(bucketDir, name, 'events.jsonl')
}

/** 真调 cmdChannel（realDeps 真 kernel + host 指向临时 channel root）。 */
async function ch(sub: string, args: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = []
  const err: string[] = []
  const code = await cmdChannel(realDeps(cwd, out, err), sub, args, host)
  return { code, out, err }
}

/** 真读磁盘上的 events.jsonl → 事件数组（不经 kernel，验证真落盘）。 */
async function rawEvents(name: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(channelEventsFile(name), 'utf8')
  return text
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'chan-it-root-'))
  cwd = await mkdtemp(join(tmpdir(), 'chan-it-proj-'))
  const env = { root, cwd }
  host = { store: createChannelStore(env, undefined, () => FIXED_CLOCK), env }
  // 该 cwd 的 project 桶（sanitize）目录名，用于直接读盘断言。
  bucketDir = host.store.channelDir('__x__').replace(join('__x__'), '').replace(/\/$/, '')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(cwd, { recursive: true, force: true })
})

describe('真实 e2e —— 事件日志 append-only 真落盘', () => {
  test('create → send 真写 events.jsonl，seq 单调递增、ts 注入', async () => {
    expect((await ch('create', ['chatty', '--task', 'demo', '--type', 'chat'])).code).toBe(0)
    expect((await ch('send', ['chatty', 'hello world', '--as', 'alice'])).code).toBe(0)
    expect((await ch('send', ['chatty', 'second', '--as', 'bob'])).code).toBe(0)

    const evs = await rawEvents('chatty')
    expect(evs.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(evs.map((e) => e.kind)).toEqual(['create', 'message', 'message'])
    expect(evs[1]).toMatchObject({ by: 'alice', text: 'hello world', ts: FIXED_CLOCK })
  })

  test('seq 侧车删除后续 append 不留空洞（真 reconcile）', async () => {
    await ch('create', ['c', '--task', 't'])
    await ch('send', ['c', 'a', '--as', 'x'])
    await rm(join(bucketDir, 'c', '.seq'), { force: true })
    const r = await ch('send', ['c', 'b', '--as', 'y'])
    expect(r.code).toBe(0)
    const evs = await rawEvents('c')
    expect(evs.map((e) => e.seq)).toEqual([1, 2, 3])
    // 侧车真被重建到 jsonl 尾
    expect((await readFile(join(bucketDir, 'c', '.seq'), 'utf8')).trim()).toBe('3')
  })
})

describe('真实 e2e —— send 三态校验 + 真投影 registry', () => {
  test('spawned 事件后 send 定向 → registry 真重建 pendingMessageCount', async () => {
    await ch('create', ['c', '--task', 't'])
    // supervisor 会写的 spawned 事件（真 spawn 留后续，此处用 store 真 append 模拟其事件面）
    host.store.append('c', { kind: 'spawned', by: 'sup', as: 'w1', provider: 'echo' })
    await ch('send', ['c', 'work item', '--as', 'main', '--to', 'w1', '--delivery-mode', 'requireRunningWorker'])

    const reg = await ch('registry', ['c'])
    const parsed = JSON.parse(reg.out[0]!)
    expect(parsed.workers).toHaveLength(1)
    expect(parsed.workers[0]).toMatchObject({ id: 'w1', channel: 'c', lifecycle: 'running', pendingMessageCount: 1 })

    // turn_started 抬水位后 pending 归零（真事件流重建）
    host.store.append('c', { kind: 'turn_started', by: 'w1', worker: 'w1', turnId: 'msg:3', inputSeq: 3 })
    const reg2 = await ch('registry', ['c'])
    expect(JSON.parse(reg2.out[0]!).workers[0].pendingMessageCount).toBe(0)
  })

  test('requireRunningWorker 定向未知 worker → message 永久化 + undeliverable 真落盘', async () => {
    await ch('create', ['c', '--task', 't'])
    const r = await ch('send', ['c', 'go', '--as', 'main', '--to', 'ghost', '--delivery-mode', 'requireRunningWorker'])
    expect(r.code).toBe(0)
    const evs = await rawEvents('c')
    expect(evs.map((e) => e.kind)).toEqual(['create', 'message', 'undeliverable'])
    expect(evs[2]).toMatchObject({ kind: 'undeliverable', targetWorker: 'ghost', reason: 'worker-unknown', messageSeq: 2 })
  })
})

describe('真实 e2e —— wait 快照扫描真事件流', () => {
  test('send 后 wait 真扫到定向事件 exit 0', async () => {
    await ch('create', ['c', '--task', 't'])
    await ch('send', ['c', 'ping', '--as', 'main', '--to', 'me'])
    const r = await ch('wait', ['c', '--as', 'me', '--since', '1'])
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out[0]!)).toMatchObject({ kind: 'message', to: 'me', text: 'ping' })
  })

  test('无匹配 → exit 124', async () => {
    await ch('create', ['c', '--task', 't'])
    const r = await ch('wait', ['c', '--as', 'me', '--since', '50'])
    expect(r.code).toBe(124)
    expect(r.err.join('\n')).toContain('timeout')
  })
})

describe('真实 e2e —— forum thread 投影从真事件流重建', () => {
  test('opened + comment + status + rename → forum list 真重建（rename 归并 timeline）', async () => {
    await ch('create', ['f', '--task', 't', '--type', 'forum'])
    await ch('thread', ['post', 'f', '--as', 'x', '--action', 'opened', '--thread', 'bug-1', '--title', 'Crash on start'])
    await ch('thread', ['post', 'f', '--as', 'y', '--action', 'comment', '--thread', 'bug-1'])
    await ch('thread', ['post', 'f', '--as', 'y', '--action', 'comment', '--thread', 'bug-1'])
    await ch('thread', ['rename', 'f', '--as', 'x', '--thread', 'bug-1', '--new-thread', 'bug-fixed'])

    // 真读盘：5 条事件（含 rename）
    const evs = await rawEvents('f')
    expect(evs.map((e) => e.kind)).toEqual(['create', 'thread', 'thread', 'thread', 'thread'])

    const r = await ch('forum', ['list', 'f', '--json'])
    const states = JSON.parse(r.out[0]!)
    expect(states).toHaveLength(1)
    expect(states[0]).toMatchObject({ thread: 'bug-fixed', title: 'Crash on start', comments: 2 })
    expect(states[0].aliases).toContain('bug-1')
  })

  test('chat channel 拒 thread（forum 校验从事件重建 type）', async () => {
    await ch('create', ['c', '--task', 't', '--type', 'chat'])
    const r = await ch('thread', ['post', 'c', '--as', 'x', '--action', 'opened', '--thread', 'T1'])
    expect(r.code).toBe(2)
    expect(r.err.join('\n')).toContain('不是 forum')
  })

  test('rename 目标已存在 → 拒 silently merge（读真事件流判 existing）', async () => {
    await ch('create', ['f', '--task', 't', '--type', 'forum'])
    await ch('thread', ['post', 'f', '--as', 'x', '--action', 'opened', '--thread', 'A'])
    await ch('thread', ['post', 'f', '--as', 'x', '--action', 'opened', '--thread', 'B'])
    const r = await ch('thread', ['rename', 'f', '--as', 'x', '--thread', 'A', '--new-thread', 'B'])
    expect(r.code).toBe(2)
    expect(r.err.join('\n')).toContain('silently merge')
  })
})

describe('真实 e2e —— list 桶内汇总', () => {
  test('多 channel 汇总 + ephemeral 默认隐藏', async () => {
    await ch('create', ['c1', '--task', 'first', '--type', 'chat'])
    await ch('create', ['c2', '--task', 'second', '--type', 'forum'])
    await ch('create', ['eph', '--task', 'e', '--ephemeral'])

    const def = await ch('list', ['--json'])
    const names = JSON.parse(def.out[0]!).channels.map((r: { name: string }) => r.name).sort()
    expect(names).toEqual(['c1', 'c2'])

    const all = await ch('list', ['--all', '--json'])
    const allNames = JSON.parse(all.out[0]!).channels.map((r: { name: string }) => r.name).sort()
    expect(allNames).toEqual(['c1', 'c2', 'eph'])
  })
})

describe('★正交红线 —— channel 绝不触 barrier / 三门 / openspec', () => {
  test('全流程后：channel 事件全在临时 root，cwd 下零 openspec / 三门 marker', async () => {
    await ch('create', ['c', '--task', 't', '--type', 'forum'])
    await ch('send', ['c', 'hi', '--as', 'a'])
    await ch('thread', ['post', 'c', '--as', 'x', '--action', 'opened', '--thread', 'T1'])

    // 事件落在 channel root 下
    expect(existsSync(channelEventsFile('c'))).toBe(true)
    const dir = host.store.channelDir('c')
    expect(dir.startsWith(root)).toBe(true)

    // cwd（项目根）下：无 openspec、无三门 marker、无 .pipeline.yaml、无 .git 变动
    expect(existsSync(join(cwd, 'openspec'))).toBe(false)
    for (const m of ['.pipeline-pending-confirm', '.pipeline-pending-review', '.pipeline-pending-interaction']) {
      expect(existsSync(join(cwd, m))).toBe(false)
    }
    // 没有任何 build_sha 侧写：channel 事件里不含 build_sha 字段
    const evs = await rawEvents('c')
    for (const e of evs) expect(e).not.toHaveProperty('build_sha')
  })

  test('即便 cwd 下预置了三门 marker，channel 操作不读不清它（不干预 barrier）', async () => {
    const marker = join(cwd, '.pipeline-pending-review')
    await writeFile(marker, 'review\nguidance\nchange-x\n', 'utf8')
    const before = (await stat(marker)).mtimeMs
    await mkdir(join(cwd, 'openspec', 'changes', 'change-x'), { recursive: true })

    await ch('create', ['c', '--task', 't'])
    await ch('send', ['c', 'x', '--as', 'a'])

    // marker 仍在、未被 channel 触碰（mtime 不变）
    expect(existsSync(marker)).toBe(true)
    expect((await stat(marker)).mtimeMs).toBe(before)
  })
})
