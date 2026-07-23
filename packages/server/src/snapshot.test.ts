/** snapshot.test —— 真 fs：注册表读取 / 聚合 build / 指纹变化检测。 */
import { describe, expect, it } from 'vitest'
import { symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildSnapshot, computeFingerprint } from './snapshot.js'
import { readRegistry } from './registry.js'
import { initChange, makeProject, makeTempHome, newStore, sleep } from './test-support.js'

describe('readRegistry', () => {
  it('JSON 字符串数组 → 路径数组', async () => {
    const home = await makeTempHome()
    const p = join(home, 'pipeline-projects.json')
    await writeFile(p, JSON.stringify(['/a', '/b']), 'utf8')
    expect(readRegistry(p)).toEqual(['/a', '/b'])
  })
  it('缺文件 → []', async () => {
    expect(readRegistry(join(await makeTempHome(), 'missing.json'))).toEqual([])
  })
  it('损坏 JSON → []', async () => {
    const home = await makeTempHome()
    const p = join(home, 'pipeline-projects.json')
    await writeFile(p, '{ not json', 'utf8')
    expect(readRegistry(p)).toEqual([])
  })
})

describe('buildSnapshot —— 真读多项目 .pipeline.yaml', () => {
  it('canonical current 损坏必须在项目快照 fail-loud，不得静默把 change 隐藏成空项目', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'broken-current')
    await writeFile(join(dir, '.pipeline-run', 'current.json'), '{broken', 'utf8')

    const snap = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(snap.projects[0].ok).toBe(false)
    expect(snap.projects[0].error).toMatch(/broken-current.*current|current.*broken-current/i)
    expect(snap.change_count).toBe(0)
  })

  it('server 扫描自动重建缺失的 YAML projection，但 canonical 仍是读取真相', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'repair-on-scan')
    await unlink(join(dir, '.pipeline.yaml'))

    const snap = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(snap.projects[0].changes[0].name).toBe('repair-on-scan')
    expect(await store.inspectProjection(dir)).toMatchObject({ status: 'current' })
  })

  it('聚合两个注册项目、计数与相位真实', async () => {
    const store = newStore()
    const a = await makeProject()
    const b = await makeProject()
    await initChange(store, a, 'alpha')
    await initChange(store, b, 'beta', { track: 'pm' })
    const snap = await buildSnapshot({
      registry: () => [a, b], store, version: '1.2.3', clock: () => '2026-07-07T00:00:00Z',
    })
    expect(snap.version).toBe('1.2.3')
    expect(snap.project_count).toBe(2)
    expect(snap.change_count).toBe(2)
    const beta = snap.projects.find((p) => p.root === b)!.changes[0]
    expect(beta.name).toBe('beta')
    expect(beta.phase).toBe('open')
    expect(beta.track).toBe('pm')
  })

  it('automation_current_phase 经 fields 全量透传（T4 决策 G：进度详情「沙箱内阶段」数据源）', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'afk-run')
    // init 缺省空串（run 外无沙箱内阶段）
    const snap0 = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(snap0.projects[0].changes[0].fields.automation_current_phase).toBe('')
    // automation runner 运行期写入 → snapshot 原值透传（server 不加工、不改名）
    await store.set(dir, 'automation_current_phase', 'verify')
    const snap1 = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    expect(snap1.projects[0].changes[0].fields.automation_current_phase).toBe('verify')
  })

  it('OpenSpec tasks.md 按 default 七阶段投影到 snapshot，而不是由原始会话提示词另造 Todo', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'todo-source')
    await store.set(dir, 'phase', 'build')
    await writeFile(join(dir, 'tasks.md'), `# Tasks

## Open
- [x] Confirm scope

## Build
- [ ] Implement the endpoint
`, 'utf8')

    const snapshot = await buildSnapshot({ registry: () => [root], store, version: '1', clock: () => 't' })
    const todo = snapshot.projects[0]?.changes[0]?.todo
    expect(todo?.hasTaskSource).toBe(true)
    expect(todo?.stages.map((stage) => stage.id)).toEqual(['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'])
    expect(todo?.stages.find((stage) => stage.id === 'open')?.tasks).toEqual([{ text: 'Confirm scope', completed: true }])
    expect(todo?.stages.find((stage) => stage.id === 'build')?.tasks).toEqual([{ text: 'Implement the endpoint', completed: false }])
  })

  it('不存在的注册路径 → ok:false 不炸', async () => {
    const snap = await buildSnapshot({
      registry: () => ['/definitely/not/here'], store: newStore(), version: '0', clock: () => 'x',
    })
    expect(snap.project_count).toBe(1)
    expect(snap.projects[0].ok).toBe(false)
    expect(snap.change_count).toBe(0)
  })
})

describe('computeFingerprint —— 变更检测', () => {
  it('dangling canonical current 仍进入 fingerprint，不能因 stat 跟随失败而消失', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'dangling-current')
    const current = join(dir, '.pipeline-run', 'current.json')
    await unlink(current)
    await symlink('missing.json', current)

    expect(await computeFingerprint([root])).toContain('.pipeline-run/current.json')
  })

  it('YAML projection 缺失时仍以 canonical current 追踪 change 与 revision 变化', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'canonical-only')
    await unlink(join(dir, '.pipeline.yaml'))

    const fp0 = await computeFingerprint([root])
    expect(fp0).toContain('.pipeline-run/current.json')
    await sleep(5)
    await store.set(dir, 'phase', 'explore')
    const fp1 = await computeFingerprint([root])
    expect(fp1).not.toBe(fp0)
  })

  it('写盘后指纹改变（SSE 推送的触发源）', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'c1')
    const fp0 = await computeFingerprint([root])
    await sleep(5)
    await store.set(dir, 'phase', 'explore')
    const fp1 = await computeFingerprint([root])
    expect(fp1).not.toBe(fp0)
  })

  it('tasks.md 变更也改变指纹，SSE 会推送新的 Todo 投影', async () => {
    const store = newStore()
    const root = await makeProject()
    const dir = await initChange(store, root, 'todo-fingerprint')
    const tasks = join(dir, 'tasks.md')
    await writeFile(tasks, '- [ ] First task\n', 'utf8')
    const fp0 = await computeFingerprint([root])
    await sleep(5)
    await writeFile(tasks, '- [x] First task\n', 'utf8')
    const fp1 = await computeFingerprint([root])
    expect(fp1).not.toBe(fp0)
  })
})
