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
