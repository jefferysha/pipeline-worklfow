/** snapshot.test —— 真 fs：注册表读取 / 聚合 build / 指纹变化检测。 */
import { describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
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
})
