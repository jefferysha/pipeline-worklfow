import { describe, expect, test } from 'vitest'
import { makeDeps, spy } from '../test-support.js'
import { cmdStateProjection } from './state-projection.js'

describe('pipeline state · G1 YAML projection 运维面', () => {
  test('status --json 原样报告 drift 并 exit 2', async () => {
    const deps = makeDeps()
    deps.store.inspectProjection = spy(async () => ({
      status: 'drift' as const, revision: 3, revisionId: 'rev-3', reason: 'old writer changed phase',
    }))
    expect(await cmdStateProjection(deps, 'status', 'demo', { json: true })).toBe(2)
    expect(JSON.parse(deps.outLines[0]!)).toMatchObject({ status: 'drift', revision: 3 })
  })

  test('repair-projection 只有显式 --force-canonical 才把覆盖选择传入 store', async () => {
    const deps = makeDeps()
    expect(await cmdStateProjection(deps, 'repair-projection', 'demo', {
      forceCanonical: true,
    })).toBe(0)
    expect(deps.store.repairProjection.calls[0]?.[1]).toEqual({ forceCanonical: true })
  })

  test('import-legacy projection pending → canonical import 已发生但 exit 2 提醒仍需 repair', async () => {
    const deps = makeDeps()
    deps.store.importLegacyProjection = spy(async () => ({
      projection: { status: 'pending' as const, error: new Error('disk full') },
    }))
    expect(await cmdStateProjection(deps, 'import-legacy', 'demo')).toBe(2)
    expect(deps.outLines).toEqual(['demo: imported (pending)'])
  })
})
