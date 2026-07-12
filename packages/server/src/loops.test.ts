import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDraftMark, clearDraftMark, draftMarksPath, loadRegistry, readDraftMarks } from '@pipeline-lite/kernel'
import { applyLoopsUpdate, buildLoopsSnapshot } from './loops.js'

/**
 * loop-init L4：clearDraftMark 打成可控 spy（默认真实现——④ 批准/驳回真清标记；⑤ 单次 reject
 * 验「清失败不阻断 ok:true」），其余 kernel 导出全真。node:fs/promises 只把 readFile 打成 spy（默认真读；
 * ④e CAS 靠两次 readFile 返回不同文本注入「并发改」——applyLoopsUpdate 内两读之间无外部 await 隙，
 * 真 IO 无法确定性注入）。两处 mock 均 passthrough，不动既有 15 测（既有测无 status patch、不断言这两个 spy）。
 * 打桩口径同 packages/cli/src/commands/afk.test.ts 的 importOriginal 先例。
 */
vi.mock('@pipeline-lite/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pipeline-lite/kernel')>()
  return { ...actual, clearDraftMark: vi.fn(actual.clearDraftMark) }
})
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

const LOOP_YAML = `version: 1
loops:
  - id: build-loop
    name: Build Loop
    kind: orchestrator
    goal: 保证每次构建都真跑八门验证不假绿保证每次构建都真跑八门验证
    cadence: 1h
    risk: medium
    runner: cron
    change_prefix: build-loop-
    phases: [build, verify]
    human_gates: [g1, g2]
    state: .superpowers/loops/progress.md
    design_doc: docs/build-loop.md
    status: active
    budget:
      max_runs_per_day: 24
      max_in_flight: 1
      on_exceed: skip
      max_tokens_per_day: 100000
    kill_criteria: [k1, k2]
    autonomy_level: L1
`

async function makeProjectWithLoop(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'loops-snap-'))
  await mkdir(join(root, '.pipeline'), { recursive: true })
  await writeFile(join(root, '.pipeline', 'loops.yaml'), LOOP_YAML, 'utf8')
  return root
}

describe('buildLoopsSnapshot', () => {
  it('聚合跨项目 loop，行带 root 字段消歧，含真 readiness/budget 计算', async () => {
    const rootA = await makeProjectWithLoop()
    const rootB = await makeProjectWithLoop() // 同 id（build-loop）不同项目，验证不冲突

    const snap = await buildLoopsSnapshot({ registry: () => [rootA, rootB], now: () => new Date('2026-07-07T00:00:00Z') })

    expect(snap.rows).toHaveLength(2)
    expect(snap.rows.map((r) => r.root).sort()).toEqual([rootA, rootB].sort())
    for (const row of snap.rows) {
      expect(row.id).toBe('build-loop')
      expect(row.autonomy_level).toBe('L1')
      expect(row.readiness.score).toBeGreaterThanOrEqual(0)
      expect(row.budget.breaker).toBe('ok')
    }
  })

  it('v5 T16：行透出编辑面全字段（cadence/goal/…/allowlist/denylist + 原始预算声明 budget_decl）', async () => {
    const root = await makeProjectWithLoop()
    const snap = await buildLoopsSnapshot({ registry: () => [root], now: () => new Date('2026-07-07T00:00:00Z') })
    const row = snap.rows[0]!
    expect(row.cadence).toBe('1h')
    expect(row.goal).toContain('八门验证')
    expect(row.design_doc).toBe('docs/build-loop.md')
    expect(row.change_prefix).toBe('build-loop-')
    expect(row.risk).toBe('medium')
    expect(row.runner).toBe('cron')
    expect(row.human_gates).toEqual(['g1', 'g2'])
    expect(row.kill_criteria).toEqual(['k1', 'k2'])
    // T3 新字段：登记表未写时按 schema 缺省 []（loadRegistry 派生补默认）
    expect(row.allowlist).toEqual([])
    expect(row.denylist).toEqual([])
    // 原始预算声明（滑杆初值），区别于 budget=computeBudgetStatus 的计算结果
    expect(row.budget_decl).toEqual({ max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: 100000 })
  })

  it('项目没有 loops.yaml → 该项目贡献 0 行，不报错、不跳过其它项目', async () => {
    const rootNoLoops = await mkdtemp(join(tmpdir(), 'loops-snap-empty-'))
    const rootWithLoop = await makeProjectWithLoop()
    const snap = await buildLoopsSnapshot({ registry: () => [rootNoLoops, rootWithLoop], now: () => new Date() })
    expect(snap.rows).toHaveLength(1)
    expect(snap.rows[0]?.root).toBe(rootWithLoop)
  })
})

/**
 * T7（loop 卡审阅面重构）：关系条数据面——matched_changes 镜像 cli
 * `packages/cli/src/commands/loops.ts::REAL_LOOPS_FS.listChanges` 的过滤逻辑（不跨包 import，
 * 对齐 server 零运行时依赖纪律，见 afk.ts:15-19 头注释同款先例）；phases 直接透传登记表原值。
 */
describe('buildLoopsSnapshot —— matched_changes / phases（T7 关系条数据面）', () => {
  it('matched_changes 精确等于 openspec/changes 下 startsWith(change_prefix) 且排除 archive 的目录名，按名排序', async () => {
    const root = await makeProjectWithLoop()
    await mkdir(join(root, 'openspec', 'changes', 'build-loop-002'), { recursive: true })
    await mkdir(join(root, 'openspec', 'changes', 'build-loop-001'), { recursive: true })
    await mkdir(join(root, 'openspec', 'changes', 'other-change'), { recursive: true }) // 不匹配前缀
    await mkdir(join(root, 'openspec', 'changes', 'archive'), { recursive: true }) // 归档目录本身恒排除

    const snap = await buildLoopsSnapshot({ registry: () => [root], now: () => new Date('2026-07-11T00:00:00Z') })
    expect(snap.rows[0]!.matched_changes).toEqual(['build-loop-001', 'build-loop-002'])
  })

  it('change_prefix 为 null 时 matched_changes 恒为空数组（不做「空前缀匹配一切」的危险默认）', async () => {
    const root = await makeProjectWithLoop()
    const upd = await applyLoopsUpdate(root, 'build-loop', { change_prefix: null })
    expect(upd).toEqual({ ok: true })
    await mkdir(join(root, 'openspec', 'changes', 'build-loop-001'), { recursive: true })

    const snap = await buildLoopsSnapshot({ registry: () => [root], now: () => new Date('2026-07-11T00:00:00Z') })
    expect(snap.rows[0]!.change_prefix).toBeNull()
    expect(snap.rows[0]!.matched_changes).toEqual([])
  })

  it('openspec/changes 目录不存在 → matched_changes 空数组，不抛错', async () => {
    const root = await makeProjectWithLoop()
    const snap = await buildLoopsSnapshot({ registry: () => [root], now: () => new Date('2026-07-11T00:00:00Z') })
    expect(snap.rows[0]!.matched_changes).toEqual([])
  })

  it('phases 透传登记表原值（与 yaml 一致，纯声明不做 workflow join 校验）', async () => {
    const root = await makeProjectWithLoop()
    const snap = await buildLoopsSnapshot({ registry: () => [root], now: () => new Date('2026-07-11T00:00:00Z') })
    expect(snap.rows[0]!.phases).toEqual(['build', 'verify'])
  })
})

describe('applyLoopsUpdate —— loops.yaml 字段写回（v5 T3，POST /api/loops/update 的写回逻辑）', () => {
  it('patch 标量 + budget + allowlist/denylist → 真改盘，loadRegistry 读回一致', async () => {
    const root = await makeProjectWithLoop()
    const r = await applyLoopsUpdate(root, 'build-loop', {
      cadence: '2h',
      max_runs_per_day: 12,
      allowlist: ['src/**'],
      denylist: ['secrets/**'],
    })
    expect(r).toEqual({ ok: true })
    const { data, errors } = loadRegistry(root)
    expect(errors).toEqual([])
    const loop = data!.loops[0]!
    expect(loop.cadence).toBe('2h')
    expect(loop.budget.max_runs_per_day).toBe(12)
    expect(loop.allowlist).toEqual(['src/**'])
    expect(loop.denylist).toEqual(['secrets/**'])
  })

  it('未知 loop id → ok:false，盘上文件不动', async () => {
    const root = await makeProjectWithLoop()
    const before = await readFile(join(root, '.pipeline', 'loops.yaml'), 'utf8')
    const r = await applyLoopsUpdate(root, 'ghost-loop', { cadence: '2h' })
    expect(r.ok).toBe(false)
    expect('error' in r && r.error).toContain('ghost-loop')
    expect(await readFile(join(root, '.pipeline', 'loops.yaml'), 'utf8')).toBe(before)
  })

  it('autonomy_level 不收（走 /api/loops/level）→ ok:false', async () => {
    const root = await makeProjectWithLoop()
    const r = await applyLoopsUpdate(root, 'build-loop', { autonomy_level: 'L3' })
    expect(r.ok).toBe(false)
    expect('error' in r && r.error).toContain('autonomy_level')
  })

  it('patch 后 schema 校验失败（cadence 不合 pattern）→ ok:false 携定位错误，不落盘', async () => {
    const root = await makeProjectWithLoop()
    const before = await readFile(join(root, '.pipeline', 'loops.yaml'), 'utf8')
    const r = await applyLoopsUpdate(root, 'build-loop', { cadence: 'whenever-i-feel-like' })
    expect(r.ok).toBe(false)
    expect('errors' in r && r.errors!.some((e) => e.includes('cadence'))).toBe(true)
    expect(await readFile(join(root, '.pipeline', 'loops.yaml'), 'utf8')).toBe(before)
  })

  it('loops.yaml 不存在 → ok:false（不是 throw）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'loops-upd-none-'))
    const r = await applyLoopsUpdate(root, 'build-loop', { cadence: '2h' })
    expect(r.ok).toBe(false)
  })
})

/** v5 T20：runner 双支持——snapshot 行携带 runner（编排页下拉回显），update 端点可写 runner: codex。 */
describe('loops runner 双支持（v5 T20）', () => {
  it('buildLoopsSnapshot 的行带 runner 字段（登记表原值回显）', async () => {
    const root = await makeProjectWithLoop()
    const snap = await buildLoopsSnapshot({ registry: () => [root], now: () => new Date('2026-07-07T00:00:00Z') })
    expect(snap.rows[0]?.runner).toBe('cron')
  })

  it('applyLoopsUpdate 收 runner: codex → 落盘且读回 codex（schema 全绿）', async () => {
    const root = await makeProjectWithLoop()
    const r = await applyLoopsUpdate(root, 'build-loop', { runner: 'codex' })
    expect(r).toEqual({ ok: true })
    const { data, errors } = loadRegistry(root)
    expect(errors).toEqual([])
    expect(data!.loops[0]!.runner).toBe('codex')
  })

  it('applyLoopsUpdate 收 runner: claude-code → 同样合法（下拉双选项另一半）', async () => {
    const root = await makeProjectWithLoop()
    const r = await applyLoopsUpdate(root, 'build-loop', { runner: 'claude-code' })
    expect(r).toEqual({ ok: true })
    expect(loadRegistry(root).data!.loops[0]!.runner).toBe('claude-code')
  })
})

/**
 * loop-init L4：LoopRow.draft 透出 —— 每 root 读一次 loops.drafts.json（sidecar，纯展示元数据），
 * 行级 draft = id 在标记集中；fail-open（缺文件/坏 JSON → 全 false，绝不抛）；仅现有行判 draft，
 * 标记里多出的 id 不产生幽灵行（循环主体是 loadRegistry 的 data.loops，天然满足）。
 */
describe('loop-init L4：LoopRow.draft 透出（sidecar 标记，fail-open）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('① 标记含该行 id → draft:true；标记里没有该 id → draft:false', async () => {
    const root = await makeProjectWithLoop() // loop id = build-loop
    await addDraftMark(draftMarksPath(root), 'build-loop')
    const snap = await buildLoopsSnapshot({ registry: () => [root], now: () => new Date('2026-07-12T00:00:00Z') })
    expect(snap.rows[0]!.draft).toBe(true)

    const root2 = await makeProjectWithLoop() // 有标记文件但不含 build-loop
    await addDraftMark(draftMarksPath(root2), 'some-other-loop')
    const snap2 = await buildLoopsSnapshot({ registry: () => [root2], now: () => new Date('2026-07-12T00:00:00Z') })
    expect(snap2.rows[0]!.draft).toBe(false)
  })

  it('② 标记文件缺失 → 全行 draft:false，不抛（fail-open）', async () => {
    const root = await makeProjectWithLoop() // 未建 loops.drafts.json
    const snap = await buildLoopsSnapshot({ registry: () => [root], now: () => new Date('2026-07-12T00:00:00Z') })
    expect(snap.rows[0]!.draft).toBe(false)
  })

  it('③ 标记含 loops.yaml 不存在的 id → 行数不变（仅现有行判 draft，无幽灵行）', async () => {
    const root = await makeProjectWithLoop()
    await addDraftMark(draftMarksPath(root), 'build-loop') // 存在的行
    await addDraftMark(draftMarksPath(root), 'ghost-not-in-yaml') // 标记里多出的 id
    const snap = await buildLoopsSnapshot({ registry: () => [root], now: () => new Date('2026-07-12T00:00:00Z') })
    expect(snap.rows).toHaveLength(1) // 幽灵 id 不产生行
    expect(snap.rows[0]!.id).toBe('build-loop')
    expect(snap.rows[0]!.draft).toBe(true)
  })
})

/**
 * loop-init L4：applyLoopsUpdate 落盘成功且 patch 含 status 自有键（批准 active / 驳回 paused 都算「已审阅」）
 * → best-effort clearDraftMark（清失败吞错不影响 ok:true）。patch 不含 status 或落盘失败（schema/CAS 拒）→ 不清。
 */
describe('loop-init L4：status 写回清标记（批准/驳回即已审阅，best-effort）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('④a patch 含 status:active（批准）→ 落盘成功后标记被清', async () => {
    const root = await makeProjectWithLoop()
    await addDraftMark(draftMarksPath(root), 'build-loop')
    const r = await applyLoopsUpdate(root, 'build-loop', { status: 'active' })
    expect(r).toEqual({ ok: true })
    expect(vi.mocked(clearDraftMark)).toHaveBeenCalledTimes(1)
    expect(readDraftMarks(draftMarksPath(root))).not.toContain('build-loop')
  })

  it('④b patch 含 status:paused（驳回，现场保留）→ 落盘成功后标记被清', async () => {
    const root = await makeProjectWithLoop()
    await addDraftMark(draftMarksPath(root), 'build-loop')
    const r = await applyLoopsUpdate(root, 'build-loop', { status: 'paused' })
    expect(r).toEqual({ ok: true })
    expect(vi.mocked(clearDraftMark)).toHaveBeenCalledTimes(1)
    expect(readDraftMarks(draftMarksPath(root))).not.toContain('build-loop')
  })

  it('④c patch 只含 goal（无 status）→ 标记保留、clearDraftMark 不调用', async () => {
    const root = await makeProjectWithLoop()
    await addDraftMark(draftMarksPath(root), 'build-loop')
    const r = await applyLoopsUpdate(root, 'build-loop', { goal: '换一个足够长度满足 minLength 的新目标描述文字' })
    expect(r).toEqual({ ok: true })
    expect(vi.mocked(clearDraftMark)).not.toHaveBeenCalled()
    expect(readDraftMarks(draftMarksPath(root))).toContain('build-loop')
  })

  it('④d patch 含 status 但被 schema 拒（未落盘）→ 标记保留、clearDraftMark 不调用', async () => {
    const root = await makeProjectWithLoop()
    await addDraftMark(draftMarksPath(root), 'build-loop')
    // status 在 patch 里，但 cadence 违 pattern → 整文档 schema 校验失败 → 不落盘；清标记在 writeFile 之后不可达
    const r = await applyLoopsUpdate(root, 'build-loop', { status: 'active', cadence: 'whenever-i-feel' })
    expect(r.ok).toBe(false)
    expect(vi.mocked(clearDraftMark)).not.toHaveBeenCalled()
    expect(readDraftMarks(draftMarksPath(root))).toContain('build-loop')
  })

  it('④e patch 含 status 但 CAS 拒（并发改）→ 标记保留、clearDraftMark 不调用', async () => {
    const root = await makeProjectWithLoop()
    await addDraftMark(draftMarksPath(root), 'build-loop')
    const yamlPath = join(root, '.pipeline', 'loops.yaml')
    const orig = await readFile(yamlPath, 'utf8')
    // 注入：applyLoopsUpdate 内两次 readFile——首读回真原文，CAS 复读回被改文本 → current !== before → 拒
    vi.mocked(readFile).mockResolvedValueOnce(orig).mockResolvedValueOnce(`${orig}# concurrent\n`)
    const r = await applyLoopsUpdate(root, 'build-loop', { status: 'active' })
    expect(r.ok).toBe(false)
    expect(vi.mocked(clearDraftMark)).not.toHaveBeenCalled()
    expect(readDraftMarks(draftMarksPath(root))).toContain('build-loop')
  })

  it('⑤ clearDraftMark 抛错 → update 仍返回 {ok:true}（标记是展示元数据，清失败不阻断写回）', async () => {
    const root = await makeProjectWithLoop()
    await addDraftMark(draftMarksPath(root), 'build-loop')
    vi.mocked(clearDraftMark).mockRejectedValueOnce(new Error('注入：清标记失败'))
    const r = await applyLoopsUpdate(root, 'build-loop', { status: 'active' })
    expect(r).toEqual({ ok: true })
    expect(vi.mocked(clearDraftMark)).toHaveBeenCalledTimes(1)
  })
})
