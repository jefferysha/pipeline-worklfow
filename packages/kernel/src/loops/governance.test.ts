import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ABSENT_REGISTRY_EPOCH, assertActiveAtEpoch, BaseRefCasError, loopMaterialUnchanged, loopsYamlPath,
  LoopNotActiveError, LoopPolicyChangedError, readRegistrySnapshot, registryContentEpoch, withLoopMergePermit,
  withLoopStartPermit, withRegistryGovernanceLock, writeRegistryTextAtomic, writeRegistryWithGovernance,
} from './governance.js'
import { updateLoopInYaml } from './update.js'
import type { LoopEntry } from './types.js'

// H10 §1：+skillBundleId（可选）——缺省不写该行，loadRegistry 按既有口径归一化为 null（unwired）。
const yamlFor = (status: 'active' | 'paused' | 'retired', maxRuns = 24, skillBundleId?: string): string =>
  [
    'version: 1',
    'loops:',
    '  - id: lp',
    '    name: lp loop',
    '    kind: orchestrator',
    '    goal: do the thing well',
    '    cadence: 1h',
    '    risk: low',
    '    runner: claude-code',
    '    change_prefix: lp-',
    '    phases:',
    '      - a',
    '      - b',
    '    human_gates:',
    '      - g',
    '    state: st',
    '    design_doc: dd',
    `    status: ${status}`,
    '    budget:',
    `      max_runs_per_day: ${maxRuns}`,
    '      max_in_flight: 2',
    '      on_exceed: skip',
    '    kill_criteria:',
    '      - k',
    ...(skillBundleId !== undefined ? [`    skill_bundle_id: ${skillBundleId}`] : []),
    '',
  ].join('\n')

let root: string
const seed = async (status: 'active' | 'paused' | 'retired', maxRuns = 24, skillBundleId?: string): Promise<void> => {
  await mkdir(join(root, '.pipeline'), { recursive: true })
  await writeFile(loopsYamlPath(root), yamlFor(status, maxRuns, skillBundleId), 'utf8')
}

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'gov-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

describe('readRegistrySnapshot · text + epoch + registry', () => {
  it('文件存在 → text/epoch(sha256)/registry 齐；同内容两读 epoch 相等', async () => {
    await seed('active')
    const a = await readRegistrySnapshot(root)
    const b = await readRegistrySnapshot(root)
    expect(a.registry?.loops[0]!.id).toBe('lp')
    expect(a.epoch).toBe(b.epoch)
    expect(a.epoch).not.toBe(ABSENT_REGISTRY_EPOCH)
  })

  it('文件缺失 → registry=null、epoch=ABSENT、errors 空', async () => {
    const s = await readRegistrySnapshot(root)
    expect(s.registry).toBeNull()
    expect(s.epoch).toBe(ABSENT_REGISTRY_EPOCH)
    expect(s.errors).toHaveLength(0)
  })

  it('内容变化 → epoch 变', async () => {
    await seed('active', 24)
    const e1 = (await readRegistrySnapshot(root)).epoch
    await seed('active', 25)
    const e2 = (await readRegistrySnapshot(root)).epoch
    expect(e1).not.toBe(e2)
  })
})

describe('writeRegistryTextAtomic · 原子落盘（不留半文件/临时文件）', () => {
  it('写后读回一致，且目录无残留 .tmp', async () => {
    await mkdir(join(root, '.pipeline'), { recursive: true })
    await writeRegistryTextAtomic(root, yamlFor('active'))
    expect(await readFile(loopsYamlPath(root), 'utf8')).toBe(yamlFor('active'))
    const entries = await readdir(join(root, '.pipeline'))
    expect(entries.some((e) => e.includes('.tmp'))).toBe(false) // rename 后无临时文件残留
  })
})

describe('writeRegistryWithGovernance · epoch-CAS', () => {
  it('epoch 一致 → 写入成功', async () => {
    await seed('active')
    const snap = await readRegistrySnapshot(root)
    const res = await writeRegistryWithGovernance(root, snap.epoch, (cur) => updateLoopInYaml(cur, 'lp', { status: 'paused' }))
    expect(res.ok).toBe(true)
    expect((await readRegistrySnapshot(root)).registry?.loops[0]!.status).toBe('paused')
  })

  it('epoch 不符（并发修改）→ CAS 失败，不写', async () => {
    await seed('active')
    const stale = (await readRegistrySnapshot(root)).epoch
    await seed('active', 99) // 别处改了文件 → epoch 变
    const res = await writeRegistryWithGovernance(root, stale, (cur) => updateLoopInYaml(cur, 'lp', { status: 'paused' }))
    expect(res.ok).toBe(false)
    expect((await readRegistrySnapshot(root)).registry?.loops[0]!.status).toBe('active') // 未被覆盖
  })
})

describe('withRegistryGovernanceLock · 互斥', () => {
  it('两并发临界区严格串行（无交错）', async () => {
    await seed('active')
    const trace: string[] = []
    const one = withRegistryGovernanceLock(root, async () => { trace.push('A-in'); await sleep(20); trace.push('A-out') })
    const two = withRegistryGovernanceLock(root, async () => { trace.push('B-in'); await sleep(5); trace.push('B-out') })
    await Promise.all([one, two])
    expect(trace.join(',')).toMatch(/^(A-in,A-out,B-in,B-out|B-in,B-out,A-in,A-out)$/)
  })
})

describe('assertActiveAtEpoch', () => {
  it('active → 通过；paused/retired/缺失 → LoopNotActiveError', async () => {
    await seed('active')
    const active = await readRegistrySnapshot(root)
    expect(() => assertActiveAtEpoch(active, 'lp')).not.toThrow()
    expect(() => assertActiveAtEpoch(active, 'ghost')).toThrow(LoopNotActiveError)
    await seed('paused')
    const paused = await readRegistrySnapshot(root)
    expect(() => assertActiveAtEpoch(paused, 'lp')).toThrow(LoopNotActiveError)
  })
})

describe('#3 · docker start permit 原子性', () => {
  it('start permit 持锁时 pause 阻塞；start 完成后 pause 才提交', async () => {
    await seed('active')
    const snap = await readRegistrySnapshot(root)
    // H10 §1：prepared 与此刻现读一致（未发生 TOCTOU），否则本用例会被新的策略比对挡在 fn 之前。
    const prepared = { policy_epoch: registryContentEpoch(snap.registry), skill_bundle_id: null }
    const entered = deferred() // permit fn 已入临界区（确保先持锁再启动 pause，消除 FIFO 竞态）
    const release = deferred()
    const startP = withLoopStartPermit(root, 'lp', prepared, async () => { entered.resolve(); await release.promise; return 'started' })
    await entered.promise
    let pauseCommitted = false
    const pauseP = writeRegistryWithGovernance(root, snap.epoch, (cur) => updateLoopInYaml(cur, 'lp', { status: 'paused' }))
      .then((r) => { pauseCommitted = r.ok })
    await sleep(30)
    expect(pauseCommitted).toBe(false) // pause 被 start permit 的 governance 锁挡住
    release.resolve()
    await Promise.all([startP, pauseP])
    expect(pauseCommitted).toBe(true) // start 释放锁后 pause 才提交
  })

  it('pause 先提交 → start permit 拒绝且 docker start 调用 0 次', async () => {
    await seed('active')
    const snap = await readRegistrySnapshot(root)
    await writeRegistryWithGovernance(root, snap.epoch, (cur) => updateLoopInYaml(cur, 'lp', { status: 'paused' }))
    let startCalls = 0
    // paused 由 assertActiveAtEpoch 抢先拒绝（先于 H10 §1 的策略比对）——prepared 传什么值都不影响本用例。
    const prepared = { policy_epoch: '', skill_bundle_id: null }
    await expect(withLoopStartPermit(root, 'lp', prepared, async () => { startCalls++; return 'x' })).rejects.toThrow(LoopNotActiveError)
    expect(startCalls).toBe(0)
  })
})

// H10 §1（复审阻断1修复）：ledger snapshot 落账（=admission/prepare 阶段冻结 policy_epoch/
// skill_bundle_id 那一刻）之后、start permit 之前——loop 仍 active，但 registry 被改——必须拒绝启动，
// 绝不沿用 prepare 阶段冻结的旧快照。
describe('#H10§1 · start permit 兑现 policy_epoch/skill_bundle_id 失效语义', () => {
  it('prepared 落定后、permit 前 skill_bundle_id 被换（loop 仍 active）→ LoopPolicyChangedError，fn 0 次调用', async () => {
    await seed('active', 24, 'profile-a') // 模拟 prepare 阶段：loop 此刻绑定 profile-a
    const snap = await readRegistrySnapshot(root)
    // 冻结「ledger snapshot 落账那一刻」的治理身份——同源 loop-admission.ts::reserveOnce 对
    // ExecutionContext.policy_epoch 的派生方式（registryContentEpoch，非 readRegistrySnapshot 的
    // 原始字节 epoch）。
    const prepared = { policy_epoch: registryContentEpoch(snap.registry), skill_bundle_id: 'profile-a' }
    // permit 前：TOCTOU 窗口内另一次写把 loop 换绑 profile-b（status 仍 active，不触发 LoopNotActiveError）。
    const res = await writeRegistryWithGovernance(root, snap.epoch, (cur) => updateLoopInYaml(cur, 'lp', { skill_bundle_id: 'profile-b' }))
    expect(res.ok).toBe(true)

    let startCalls = 0
    const err: unknown = await withLoopStartPermit(root, 'lp', prepared, async () => { startCalls++; return 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LoopPolicyChangedError)
    const policyErr = err as LoopPolicyChangedError
    expect(policyErr.loopId).toBe('lp')
    expect(policyErr._tag).toBe('LoopPolicyChangedError') // 可判别：与 LoopNotActiveError 的 _tag 不同字符串
    expect(policyErr.changed).toContain('skill_bundle_id')
    // 换 bundle 必然改变整份 registry 的聚合内容 hash——两个信号同时触发，诊断字段如实反映两者。
    expect(policyErr.changed).toContain('policy_epoch')
    expect(startCalls).toBe(0) // 绝不沿用 prepare 阶段冻结的旧快照启动 sandbox
  })

  it('prepared 落定后、permit 前仅影响 policy_epoch 的字段变化（skill_bundle_id 未变）→ 仍拒绝', async () => {
    await seed('active', 24) // 无 bundle 绑定（unwired，skill_bundle_id 归一化为 null）
    const snap = await readRegistrySnapshot(root)
    const prepared = { policy_epoch: registryContentEpoch(snap.registry), skill_bundle_id: null }
    // max_runs_per_day 不属于 skill_bundle_id，但仍是 registryContentEpoch 的输入之一（budget 变化）。
    const res = await writeRegistryWithGovernance(root, snap.epoch, (cur) => updateLoopInYaml(cur, 'lp', { max_runs_per_day: 99 }))
    expect(res.ok).toBe(true)

    let startCalls = 0
    const err: unknown = await withLoopStartPermit(root, 'lp', prepared, async () => { startCalls++; return 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LoopPolicyChangedError)
    expect((err as LoopPolicyChangedError).changed).toEqual(['policy_epoch']) // skill_bundle_id 本身未变，只报真正变化的一项
    expect(startCalls).toBe(0)
  })

  it('prepared 与此刻现读一致（无 TOCTOU）→ 正常放行，fn 执行一次（无回归）', async () => {
    await seed('active', 24, 'profile-a')
    const snap = await readRegistrySnapshot(root)
    const prepared = { policy_epoch: registryContentEpoch(snap.registry), skill_bundle_id: 'profile-a' }
    let startCalls = 0
    const result = await withLoopStartPermit(root, 'lp', prepared, async () => { startCalls++; return 'ok' })
    expect(result).toBe('ok')
    expect(startCalls).toBe(1)
  })

  it('prepared.skill_bundle_id 缺席（undefined）而现读为 null（unwired）→ 同一语义，放行', async () => {
    await seed('active') // 未接线 skill_bundle_id → loadRegistry 归一化为 null
    const snap = await readRegistrySnapshot(root)
    const prepared = { policy_epoch: registryContentEpoch(snap.registry) } // skill_bundle_id 缺席
    let startCalls = 0
    await withLoopStartPermit(root, 'lp', prepared, async () => { startCalls++; return 'ok' })
    expect(startCalls).toBe(1)
  })
})

describe('#3 · merge permit 原子性 + base ref CAS', () => {
  it('merge permit 持锁时 pause 阻塞；merge ref 更新完成后 pause 提交', async () => {
    await seed('active')
    const snap = await readRegistrySnapshot(root)
    const prepared = { policy_epoch: registryContentEpoch(snap.registry), skill_bundle_id: null }
    const entered = deferred()
    const release = deferred()
    const mergeP = withLoopMergePermit(root, 'lp', prepared, async () => { entered.resolve(); await release.promise })
    await entered.promise
    let pauseCommitted = false
    const pauseP = writeRegistryWithGovernance(root, snap.epoch, (cur) => updateLoopInYaml(cur, 'lp', { status: 'paused' }))
      .then((r) => { pauseCommitted = r.ok })
    await sleep(30)
    expect(pauseCommitted).toBe(false) // pause 被 merge permit 的 governance 锁挡住
    release.resolve()
    await Promise.all([mergeP, pauseP])
    expect(pauseCommitted).toBe(true)
  })

  it('pause 先提交 → merge permit 拒绝且 merge 调用 0 次', async () => {
    await seed('active')
    const snap = await readRegistrySnapshot(root)
    const prepared = { policy_epoch: registryContentEpoch(snap.registry), skill_bundle_id: null }
    await writeRegistryWithGovernance(root, snap.epoch, (cur) => updateLoopInYaml(cur, 'lp', { status: 'paused' }))
    let mergeCalls = 0
    await expect(withLoopMergePermit(root, 'lp', prepared, async () => { mergeCalls++ })).rejects.toThrow(LoopNotActiveError)
    expect(mergeCalls).toBe(0)
  })

  it('base SHA 被改变（expected-old-SHA CAS 失败）→ 不 merge、不推进 base', async () => {
    await seed('active')
    const snap = await readRegistrySnapshot(root)
    const prepared = { policy_epoch: registryContentEpoch(snap.registry), skill_bundle_id: null }
    let mergeCalls = 0
    await expect(
      withLoopMergePermit(root, 'lp', prepared, async () => { mergeCalls++ }, async () => false /* base 已被外部推进 */),
    ).rejects.toThrow(BaseRefCasError)
    expect(mergeCalls).toBe(0)
  })

  it('base SHA 仍为预期（verifyBase true）→ merge 执行', async () => {
    await seed('active')
    const snap = await readRegistrySnapshot(root)
    const prepared = { policy_epoch: registryContentEpoch(snap.registry), skill_bundle_id: null }
    let mergeCalls = 0
    await withLoopMergePermit(root, 'lp', prepared, async () => { mergeCalls++ }, async () => true)
    expect(mergeCalls).toBe(1)
  })

  it('run 启动后 allowlist 收紧（loop 仍 active/base 未变）→ merge permit 拒绝旧 policy_epoch，merge 0 次', async () => {
    await seed('active')
    const snap = await readRegistrySnapshot(root)
    const seeded = await writeRegistryWithGovernance(root, snap.epoch, (cur) =>
      updateLoopInYaml(cur, 'lp', { allowlist: ['src/**', '.github/**'] }))
    expect(seeded.ok).toBe(true)
    const beforeTighten = await readRegistrySnapshot(root)
    const prepared = { policy_epoch: registryContentEpoch(beforeTighten.registry), skill_bundle_id: null }
    const tightened = await writeRegistryWithGovernance(root, beforeTighten.epoch, (cur) =>
      updateLoopInYaml(cur, 'lp', { allowlist: ['src/**'] }))
    expect(tightened.ok).toBe(true)

    let mergeCalls = 0
    let verifyBaseCalls = 0
    const err: unknown = await withLoopMergePermit(
      root, 'lp', prepared,
      async () => { mergeCalls++ },
      async () => { verifyBaseCalls++; return true },
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LoopPolicyChangedError)
    expect((err as LoopPolicyChangedError).changed).toContain('policy_epoch')
    expect(verifyBaseCalls).toBe(0)
    expect(mergeCalls).toBe(0)
  })
})

describe('registryContentEpoch / loopMaterialUnchanged', () => {
  const loop = (over: Partial<LoopEntry> = {}): LoopEntry => ({
    id: 'lp', name: 'lp', kind: 'orchestrator', goal: 'do the thing well', cadence: '1h', risk: 'low',
    runner: 'claude-code', change_prefix: 'lp-', phases: ['a', 'b'], human_gates: ['g'], state: 's', design_doc: 'd',
    status: 'active', budget: { max_runs_per_day: 24, max_in_flight: 2, on_exceed: 'skip' }, kill_criteria: ['k'],
    autonomy_level: 'L1', allowlist: [], denylist: [], ...over,
  })

  it('registryContentEpoch：同内容相等、异内容不等、null→ABSENT', () => {
    const a = registryContentEpoch({ version: 1, loops: [loop()] })
    const b = registryContentEpoch({ version: 1, loops: [loop()] })
    const c = registryContentEpoch({ version: 1, loops: [loop({ status: 'paused' })] })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(registryContentEpoch(null)).toBe(ABSENT_REGISTRY_EPOCH)
  })

  it('loopMaterialUnchanged：status/runner/prefix/budget 任一变 → false', () => {
    expect(loopMaterialUnchanged(loop(), loop())).toBe(true)
    expect(loopMaterialUnchanged(loop(), loop({ status: 'paused' }))).toBe(false)
    expect(loopMaterialUnchanged(loop(), loop({ runner: 'codex' }))).toBe(false)
    expect(loopMaterialUnchanged(loop(), loop({ change_prefix: 'x-' }))).toBe(false)
    expect(loopMaterialUnchanged(loop(), loop({ budget: { max_runs_per_day: 99, max_in_flight: 2, on_exceed: 'skip' } }))).toBe(false)
  })

  // H10 §1：admission 之后单独修改 skill_bundle_id 必须让 material check 失效——否则已发的
  // start permit 会带着旧 bundle 快照继续跑，绕过治理对新 bundle 的确认。
  it('loopMaterialUnchanged：只改 skill_bundle_id → false（H10 §1 red：换 bundle 必须使 permit 失效）', () => {
    expect(loopMaterialUnchanged(loop({ skill_bundle_id: 'pm' }), loop({ skill_bundle_id: 'pm' }))).toBe(true)
    expect(loopMaterialUnchanged(loop({ skill_bundle_id: null }), loop({ skill_bundle_id: 'pm' }))).toBe(false)
    expect(loopMaterialUnchanged(loop({ skill_bundle_id: 'pm' }), loop({ skill_bundle_id: '_all' }))).toBe(false)
    expect(loopMaterialUnchanged(loop(), loop({ skill_bundle_id: 'pm' }))).toBe(false)
    // undefined（未接线本字段的旧式构造）与显式 null 视为同一 unwired 语义，不误报"已变"
    expect(loopMaterialUnchanged(loop(), loop({ skill_bundle_id: null }))).toBe(true)
  })
})
