/**
 * sync 命令 mock 层快速回归（BACKLOG #24，GOAL C9：真 fs 副作用见
 * cli/src/sync-uninstall.integration.test.ts）。内存 fake OwnedFs 穷举决策层分支/退出码。
 */
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
