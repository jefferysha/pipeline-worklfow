/**
 * 门 marker TTL 分级 —— 真实端到端集成测试（BACKLOG #13，GOAL C9：无伪测试）。
 *
 * 退掉 lite 的 15min 统一简化，恢复老内核 pipeline-gate.sh 分级 fresh 判定：
 *   confirm 300s（漏确认安全网，爆炸半径 5min）
 *   review / interaction 1800s（跨整个决策 phase，>5min 常态，不许被短 TTL 误清）
 *
 * 零 mock：真临时项目（freshHarness）+ 真 marker 文件 + utimes 真设 mtime +
 * 真跑 `inbox --json`（buildProgram + realDeps 真 fs readGateMarkers），断言真实入列/不入列。
 */
import { rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { REVIEW_MARKER_PROTOCOL } from '@tenon/kernel'
import { freshHarness, type Harness } from './integration-harness.js'

type Kind = 'confirm' | 'review' | 'interaction'

describe('真实 e2e —— 门 marker TTL 分级（confirm 300s / review·interaction 1800s）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  /** 真建 marker；review 使用与 hook 相同的 v2 Change-identity 协议，并把 mtime 真设为 now - ageS 秒。 */
  async function plantMarker(kind: Kind, ageS: number, name = `chg-${kind}`): Promise<void> {
    const p = join(h.cwd, `.pipeline-pending-${kind}`)
    const raw = kind === 'review'
      ? `${REVIEW_MARKER_PROTOCOL}\nphase=build\nchange=${name}\nrequested_at=2026-07-07T00:00:00Z\n请处理 review\n`
      : `build\n请处理 ${kind}\n${name}\n`
    await writeFile(p, raw, 'utf8')
    const t = new Date(Date.now() - ageS * 1000)
    await utimes(p, t, t)
  }

  async function inboxItems(): Promise<Array<{ name: string; waiting_on: string; waiting_s: number }>> {
    expect(await h.run(['inbox', '--json'])).toBe(0)
    return (JSON.parse(h.out.join('\n')) as { inbox: Array<{ name: string; waiting_on: string; waiting_s: number }> }).inbox
  }

  test('confirm marker 250s → 真入列 gate:confirm（TTL 300s 内）', async () => {
    await plantMarker('confirm', 250)
    const items = await inboxItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'chg-confirm', waiting_on: 'gate:confirm' })
    // 真 mtime 推出的等待时长（允许测试自身耗时的秒级抖动）
    expect(items[0]!.waiting_s).toBeGreaterThanOrEqual(250)
    expect(items[0]!.waiting_s).toBeLessThan(260)
  })

  test('confirm marker 301s → 陈旧不入列（301 > 300，退掉 15min 统一后的核心断言）', async () => {
    await plantMarker('confirm', 301)
    expect(await inboxItems()).toEqual([])
  })

  test('review marker 301s → 仍新鲜入列（TTL 1800s，不被 confirm 的 300s 波及）', async () => {
    await plantMarker('review', 301)
    const items = await inboxItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'chg-review', waiting_on: 'gate:review' })
  })

  test('review marker 1000s（>15min 旧统一 TTL）→ 仍新鲜入列（统一简化确已退场）', async () => {
    await plantMarker('review', 1000)
    const items = await inboxItems()
    expect(items).toHaveLength(1)
    expect(items[0]!.waiting_on).toBe('gate:review')
  })

  test('review marker 1801s → 陈旧不入列（1801 > 1800）', async () => {
    await plantMarker('review', 1801)
    expect(await inboxItems()).toEqual([])
  })

  test('interaction marker 1700s → 仍新鲜；1801s → 陈旧', async () => {
    await plantMarker('interaction', 1700)
    let items = await inboxItems()
    expect(items).toHaveLength(1)
    expect(items[0]!.waiting_on).toBe('gate:interaction')

    await plantMarker('interaction', 1801)
    items = await inboxItems()
    expect(items).toEqual([])
  })

  test('混合三 marker：confirm 400s 陈旧被滤，review 400s + interaction 400s 真入列', async () => {
    await plantMarker('confirm', 400, 'c1')
    await plantMarker('review', 400, 'r1')
    await plantMarker('interaction', 400, 'i1')
    const items = await inboxItems()
    expect(items.map((i) => i.waiting_on).sort()).toEqual(['gate:interaction', 'gate:review'])
    expect(items.map((i) => i.name).sort()).toEqual(['i1', 'r1'])
  })
})
