/**
 * 真实 e2e —— 并发 transition 不再产生逆序 breadcrumb/history/marker（W1 第二增量收口，
 * codex 2026-07-16 范围评估指定的送审停止线测试）。
 *
 * 复现的正是此前的真实缺陷：breadcrumb/history/marker 曾经在 store.withLock 锁外写，
 * 若第一次 transition 的尾部写入被拖慢，第二次 transition 可能在锁内抢先完成整个转换
 * （state 已提交到更新的相位），随后第一次转换姗姗来迟的尾部写入才落盘，用**旧相位**覆盖
 * 掉本该反映最新相位的 breadcrumb——hook 热路径因此读到过期相位。
 *
 * runRepo.transact 把锁的持有范围扩大到整个 callback（含 breadcrumb/history/marker），
 * 这里直接验证：即使第一次 transition 的 breadcrumb 写入被人为阻塞，第二次 transition
 * 也必须等第一次完全结束（含它的 breadcrumb 写入）才能开始，因此不可能发生覆盖。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { cmdTransition } from './commands/transition.js'
import { freshHarness, realDeps, rm } from './integration-harness.js'

describe('真实 e2e —— 并发 transition 尾部写入严格串行（不逆序覆盖）', () => {
  test('第一次 transition 的 breadcrumb 写入被阻塞期间，第二次 transition 无法抢先完成；' +
    '释放阻塞后两次严格按序结算，最终 breadcrumb/marker/state 全部反映最新相位', async () => {
    const h = await freshHarness()
    try {
      expect(await h.run(['init', 'demo', '--track', 'backend', '--preset', 'full'])).toBe(0)
      await h.seedGovernedDocumentEvidence('demo')
      // explore-complete 的前置（design_doc 非空且文件存在）从一开始就满足，后续两次 transition
      // 之间不需要再插入任何 set 步骤。
      // Reuse the hash-bound OpenSpec design seeded above. Rewriting it would correctly make
      // explore->spec fail before this test reaches its serialization assertion.
      expect(await h.run(['set', 'demo', 'design_doc', 'openspec/changes/demo/design.md'])).toBe(0)

      const out: string[] = []
      const err: string[] = []
      const deps = realDeps(h.cwd, out, err)
      const realWriteBreadcrumb = deps.writeBreadcrumb!

      let releaseFirst: () => void = () => {}
      const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve })
      let markFirstEntered: () => void = () => {}
      const firstEntered = new Promise<void>((resolve) => { markFirstEntered = resolve })
      const order: string[] = []
      let firstBreadcrumbSeen = false
      deps.writeBreadcrumb = async (changeDir, content) => {
        if (!firstBreadcrumbSeen) {
          // 只阻塞第一次调用（open-complete 落 phase=explore 那次），第二次调用（explore-complete
          // 落 phase=spec）不阻塞——否则测试本身会死锁。
          firstBreadcrumbSeen = true
          order.push('first-breadcrumb-blocked')
          markFirstEntered()
          await firstBlocked
        }
        order.push(`breadcrumb:${content.trim()}`)
        await realWriteBreadcrumb(changeDir, content)
      }

      const p1 = cmdTransition(deps, 'demo', 'open-complete')
      // 等待真实观察点，不用固定 sleep 猜 canonical revision/hash 写入在当前机器上要多久。
      await firstEntered
      expect(order).toEqual(['first-breadcrumb-blocked']) // 确认真的卡住了，不是提前跑完

      const p2 = cmdTransition(deps, 'demo', 'explore-complete')
      // 给 p2 一点时间——它应该被锁挡住，不该跑到它自己的 breadcrumb 写入
      await new Promise((r) => setTimeout(r, 30))
      expect(order).toEqual(['first-breadcrumb-blocked']) // p2 仍未进入（被锁挡住，不是碰巧慢）

      releaseFirst()
      const [code1, code2] = await Promise.all([p1, p2])
      expect(code1).toBe(0)
      expect(code2).toBe(0)
      // 严格按序：第一次的 breadcrumb 写完，第二次才可能开始写
      expect(order).toEqual(['first-breadcrumb-blocked', 'breadcrumb:pipeline:demo phase=explore', 'breadcrumb:pipeline:demo phase=spec'])

      // 最终真相：state/breadcrumb/marker 三者一致反映最新相位 spec，没有被 stale 尾部覆盖
      expect(await h.read('demo')).toMatch(/^phase: spec$/m)
      expect(await h.readIn('demo', '.breadcrumb')).toContain('phase=spec')
      const marker = await readFile(join(h.cwd, '.pipeline-pending-review'), 'utf8')
      expect(marker.split('\n')[0]).toBe('spec')
    } finally {
      await rm(h.cwd, { recursive: true, force: true })
    }
  })
})
