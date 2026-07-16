/**
 * sync 命令 mock 层快速回归（BACKLOG #24，GOAL C9：真 fs 副作用见
 * cli/src/sync-uninstall.integration.test.ts）。内存 fake OwnedFs 穷举决策层分支/退出码。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import type { OwnedFs } from '@pipeline-lite/kernel'
import type { CliDeps } from '../deps.js'
import { cmdSync, type SyncMigrationProvider } from './sync.js'

function makeFakeFs(init: Record<string, string> = {}): OwnedFs {
  const files = new Map<string, string>(Object.entries(init))
  const norm = (p: string) => p.replace(/\/+$/, '')
  const childrenUnder = (dir: string): string[] => {
    const prefix = `${norm(dir)}/`
    const names = new Set<string>()
    for (const p of files.keys()) if (p.startsWith(prefix)) names.add(p.slice(prefix.length).split('/')[0] as string)
    return [...names]
  }
  return {
    readText: async (p) => files.get(p),
    writeText: async (p, c) => { files.set(p, c) },
    exists: async (p) => files.has(p) || childrenUnder(p).length > 0,
    isDir: async (p) => !files.has(p) && childrenUnder(p).length > 0,
    unlink: async (p) => files.delete(p),
    rmrf: async (p) => { const pre = `${norm(p)}/`; for (const k of [...files.keys()]) if (k === p || k.startsWith(pre)) files.delete(k) },
    rmdirEmpty: async (p) => childrenUnder(p).length === 0,
    listDir: async (p) => childrenUnder(p),
    homeDir: () => '/nonexistent-home',
    homedirBypass: () => false,
  }
}

function deps(cwd = '/proj'): { d: CliDeps; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  const d = {
    cwd,
    io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) },
    clock: () => '2026-07-07T00:00:00Z',
  } as unknown as CliDeps
  return { d, out, err }
}

/** 迁移注册表 stub（可注入 pending / breaking 元数据模拟破坏性升级）。 */
function migrations(pending: string[], meta: { breaking?: boolean; recommend_migrate?: boolean }): SyncMigrationProvider {
  return { pending: () => pending, metadata: () => meta }
}

function report(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('\n'))
}

describe('cmdSync — downgrade 守卫（默认拒不写）', () => {
  test('cli<project 无 --allow-downgrade → proceed=false、exit 0、打印两条出路', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '2.0.0' })
    const { d, out, err } = deps()
    expect(await cmdSync(d, { cliVersion: '1.0.0' }, fs)).toBe(0)
    expect(report(out)).toMatchObject({ stage: 'downgrade-guard', proceed: false })
    expect(err.join('\n')).toContain('DOWNGRADE')
  })
  test('cli<project + --allow-downgrade → proceed=true、downgrade_action', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '2.0.0' })
    const { d, out } = deps()
    expect(await cmdSync(d, { cliVersion: '1.0.0', allowDowngrade: true }, fs)).toBe(0)
    expect(report(out)).toMatchObject({ stage: 'sync', downgrade_action: 'downgrade', proceed: true })
  })
})

/**
 * ★当前限制（gap #4）——迁移注册表在 lite 没有实现，缺省注入是 STUB。
 *
 * sync.ts 的 SyncMigrationProvider 缺省 = STUB_MIGRATIONS（空 pending + 无 breaking 元数据）。
 * 下方「--migrate 硬闸」那组测试全都**显式注入** migrations() 才能把闸门推到 required——
 * 也就是说：闸门逻辑本身是真的、可测的，但**缺省注入下它永不触发**。真实后果：
 * 用户敲 `pipeline sync`（无人注入注册表）时，迁移相关分支恒走空集路径，`--migrate` 是死闸。
 *
 * ⚠ 本 describe 直接调 cmdSync 走 fallback，只钉得住「**缺省**是 STUB」这一半。缺口能被补上的
 * 路径有两条，只钉 fallback 会漏掉第二条（生产注入了真 provider → 缺口已补而本测试仍绿）：
 *   · 改掉 sync.ts 的 STUB_MIGRATIONS 缺省          → **本 describe 红**
 *   · 在生产调用点注入 migrations                    → 下方『接线面绊线』describe 红
 * 两半合起来才满足「缺口从任何一条合理路径被实现，测试都会红」。改其一请同步另一半。
 *
 * 本 describe **断言当前缺口存在**。接上真迁移注册表（老仓 migrations.py 的等价物）后
 * 本测试会失败——这是预期的，届时请删除本断言并改为正向测试（缺省即能发现真 pending）。
 */
describe('cmdSync — 当前限制：缺省 migrations 是 STUB，--migrate 硬闸是死闸', () => {
  test('当前限制：不注入 migrations → pending 恒 0、gate 恒 ok，即便 cli>project 的破坏性升级', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const { d, out, err } = deps()
    // 刻意不传 migrations：走缺省 STUB_MIGRATIONS。这正是真实 CLI 的调用形态。
    expect(await cmdSync(d, { cliVersion: '2.0.0' }, fs)).toBe(0)
    const r = report(out)
    // 空 pending：STUB 的 pending() 恒返回 []
    expect(r).toMatchObject({ stage: 'sync', proceed: true, pending_count: 0 })
    // 硬闸恒 ok/exit 0：inWindow 需要 pendingCount>0，STUB 下永不成立
    expect(r.migrate_gate).toMatchObject({ decision: 'ok', exitCode: 0 })
    // 连提示都没有：没有 required 也没有 tip
    expect(err.join('\n')).not.toContain('MIGRATION REQUIRED')
    expect(err.join('\n')).not.toContain('--migrate')
  })

  test('当前限制：缺省 STUB 下 --migrate 与不给 --migrate 的闸门结论无差别（闸门空转）', async () => {
    const fs1 = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const a = deps()
    expect(await cmdSync(a.d, { cliVersion: '2.0.0' }, fs1)).toBe(0)

    const fs2 = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const b = deps()
    expect(await cmdSync(b.d, { cliVersion: '2.0.0', migrate: true }, fs2)).toBe(0)

    // 唯一差别只剩 migrate_flag/report_only 这两个「回声」字段，闸门决策完全一样：
    // 说明 --migrate 在缺省注入下不改变任何迁移行为（无 pending 可迁）。
    expect(report(a.out).migrate_gate).toEqual(report(b.out).migrate_gate)
    expect(report(a.out)).toMatchObject({ migrate_flag: false, report_only: true, pending_count: 0 })
    expect(report(b.out)).toMatchObject({ migrate_flag: true, report_only: false, pending_count: 0 })
  })
})

/**
 * ★当前限制（gap #4）**其二：生产接线面绊线**——生产 CLI 从不注入迁移注册表。
 *
 * 为什么这条是 grep 源码而不是跑一遍真 CLI：
 * cmdSync 的签名是 `cmdSync(deps, opts, fs = createOwnedFs())`——生产（program.ts 的 sync
 * action）只传**两个**参数，故 ① fs 恒为真磁盘 fs、② `opts.migrations` 的**唯一注入点**就是
 * program.ts 那一处。要把「生产不注入」测成行为，就得驱动真 program 去读真磁盘，那既超出本文件
 * 的契约（本文件 = 内存 fake 的 mock 层快速回归，真 fs 副作用在 sync-uninstall.integration.test.ts），
 * 又测不准：真 registry 面对本测试的版本对**也可能合法地返回空 pending**，缺口补上了照样绿。
 * 「生产不注入某依赖」本质是**「调用点不引用某标识符」**型事实，用 mock 行为表达是假证据——
 * 同 tools/check-comment-honesty.sh section 2 对 transition↔handoff 的处理，直接断言源码事实。
 *
 * 哪天有人在 program.ts 注入真注册表（无论是传字面量、还是从 deps 里取），本绊线变红，
 * 逼他回来删掉上方那句「缺省注入下 --migrate 是死闸」的当前限制描述，而不是留一句假注释。
 */
describe('cmdSync — 当前限制：生产 CLI 从不注入迁移注册表（gap #4 接线面绊线）', () => {
  /** 抠出 program.ts 里 `sync [sub]` 那条命令的整块（到下一条 `program` 命令为止）。 */
  function syncCommandBlock(): string {
    const src = readFileSync(new URL('../program.ts', import.meta.url), 'utf8')
    const start = src.indexOf(".command('sync [sub]')")
    // 命令被改名/挪走 → 绊线已过期，直接红（而不是静默扫了个空串然后假绿）
    expect(start, "program.ts 里找不到 .command('sync [sub]')——本绊线已过期，请更新它").toBeGreaterThan(-1)
    const rest = src.slice(start)
    const end = rest.indexOf('\n  program\n')
    return end === -1 ? rest : rest.slice(0, end)
  }

  test('绊线自检：抠出的块确实是那条 sync 命令（含 cmdSync 调用）', () => {
    // 防「块抠歪了 → 恒不含 migrations → 恒绿」：先证明抠对了地方。
    expect(syncCommandBlock()).toContain('cmdSync(')
  })

  test('当前限制：program.ts 的 sync action 里零 migrations 注入 → cmdSync 恒走 STUB fallback', () => {
    expect(syncCommandBlock()).not.toMatch(/migrations/)
  })
})

describe('cmdSync — --migrate 硬闸（不可降级为提示）', () => {
  test('breaking∧recommend∧pending∧!migrate∧cli>project → decision=required、exit 1', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const { d, out, err } = deps()
    const rc = await cmdSync(
      d,
      { cliVersion: '2.0.0', migrations: migrations(['a/b.md'], { breaking: true, recommend_migrate: true }) },
      fs,
    )
    expect(rc).toBe(1)
    expect(report(out).migrate_gate).toMatchObject({ decision: 'required', exitCode: 1 })
    expect(err.join('\n')).toContain('MIGRATION REQUIRED')
  })
  test('仅 breaking（!recommend）→ tip、exit 0', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const { d, out } = deps()
    const rc = await cmdSync(
      d,
      { cliVersion: '2.0.0', migrations: migrations(['a/b.md'], { breaking: true, recommend_migrate: false }) },
      fs,
    )
    expect(rc).toBe(0)
    expect(report(out).migrate_gate).toMatchObject({ decision: 'tip', exitCode: 0 })
  })
  test('带 --migrate → gate ok、report_only=false', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const { d, out } = deps()
    const rc = await cmdSync(
      d,
      { cliVersion: '2.0.0', migrate: true, migrations: migrations(['a/b.md'], { breaking: true, recommend_migrate: true }) },
      fs,
    )
    expect(rc).toBe(0)
    expect(report(out)).toMatchObject({ report_only: false, migrate_flag: true })
  })
})

describe('cmdSync — 报告字段 + prune + codex 探测', () => {
  test('report_only 默认 true；同版 → inject_config_sections=false', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const { d, out } = deps()
    expect(await cmdSync(d, { cliVersion: '1.0.0' }, fs)).toBe(0)
    expect(report(out)).toMatchObject({
      stage: 'sync',
      project_version: '1.0.0',
      cli_version: '1.0.0',
      report_only: true,
      inject_config_sections: false,
    })
  })
  test('cli>project ∧ ≠unknown → inject_config_sections=true', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const { d, out } = deps()
    await cmdSync(d, { cliVersion: '2.0.0' }, fs)
    expect(report(out).inject_config_sections).toBe(true)
  })
  test('缺 .pipeline-version → project=unknown（一等态，不触发降级）', async () => {
    const fs = makeFakeFs({})
    const { d, out } = deps()
    expect(await cmdSync(d, { cliVersion: '1.0.0' }, fs)).toBe(0)
    expect(report(out)).toMatchObject({ project_version: 'unknown', proceed: true })
  })
  test('codex-only marker 在清单且无 .codex → codex_upgrade_needed=true', async () => {
    const fs = makeFakeFs({
      '/proj/.pipeline-version': '1.0.0',
      '/proj/.pipeline-owned.json': JSON.stringify({ '.agents/skills/pipeline-continue/SKILL.md': 'h1' }),
    })
    const { d, out } = deps()
    await cmdSync(d, { cliVersion: '2.0.0' }, fs)
    expect(report(out).codex_upgrade_needed).toBe(true)
  })
  test('prune persist 仅在 --migrate 时落盘（report-only 不改清单）', async () => {
    const manifest = JSON.stringify({ 'orphan.md': 'h1' })
    const fs = makeFakeFs({ '/proj/.pipeline-version': '1.0.0', '/proj/.pipeline-owned.json': manifest })
    const { d, out } = deps()
    // report-only：算出 pruned 但不落盘
    await cmdSync(d, { cliVersion: '2.0.0' }, fs)
    expect(report(out).pruned_persisted).toBe(false)
    expect(await fs.readText('/proj/.pipeline-owned.json')).toBe(manifest) // 字节不变
  })
})

describe('cmdSync — banner / upgrade-channel 子命令', () => {
  test('banner：cli>project → update 方向', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const { d, out } = deps()
    expect(await cmdSync(d, { sub: 'banner', cliVersion: '2.0.0' }, fs)).toBe(0)
    expect(report(out)).toMatchObject({ direction: 'update' })
  })
  test('banner：同版 → 静默（无 stdout）', async () => {
    const fs = makeFakeFs({ '/proj/.pipeline-version': '1.0.0' })
    const { d, out } = deps()
    expect(await cmdSync(d, { sub: 'banner', cliVersion: '1.0.0' }, fs)).toBe(0)
    expect(out).toEqual([])
  })
  test('upgrade-channel：从 installed_plugins.json 派生（rc 后缀）', async () => {
    const installed = JSON.stringify({ plugins: { k: [{ version: '9.0.0-rc.2' }] } })
    const fs = makeFakeFs({})
    const { d, out } = deps()
    expect(await cmdSync(d, { sub: 'upgrade-channel', cliVersion: '1.0.0', installedJson: installed, pluginKey: 'k' }, fs)).toBe(0)
    expect(report(out)).toMatchObject({ channel: 'rc' })
  })
})
