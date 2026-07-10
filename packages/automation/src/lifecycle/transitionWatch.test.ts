import { describe, expect, it } from 'vitest'
import { createPhaseWatch, parseTransitionLine } from './transitionWatch.js'

/**
 * T4（v5 决策 G）：沙箱日志 [TRANSITION] 行 → automation_current_phase 回写的纯逻辑面。
 *
 * 行格式测试钉死（计划风险条款「与日志行格式强耦合——以 automation 现有 [TRANSITION] 输出为
 * 唯一判据并加测试钉格式」）：真相源 = packages/cli/src/commands/transition.ts 的
 * `[TRANSITION] ${name}: ${from} -> ${to}`（ASCII "->"，无 ANSI）。改 CLI 输出格式 = 先改这里。
 */
describe('parseTransitionLine（[TRANSITION] 行格式钉死）', () => {
  it('标准行：`[TRANSITION] demo: open -> explore` → {name,from,to}', () => {
    expect(parseTransitionLine('[TRANSITION] demo: open -> explore')).toEqual({
      name: 'demo',
      from: 'open',
      to: 'explore',
    })
  })

  it('容忍行尾空白/回车（docker 流可能带 \\r）', () => {
    expect(parseTransitionLine('[TRANSITION] x: build -> verify \r')).toEqual({
      name: 'x',
      from: 'build',
      to: 'verify',
    })
  })

  it.each([
    ['缺前缀', 'TRANSITION demo: open -> explore'],
    ['前缀不在行首', 'xx [TRANSITION] demo: open -> explore'],
    ['unicode 箭头（非 CLI 实际输出）', '[TRANSITION] demo: open → explore'],
    ['缺冒号', '[TRANSITION] demo open -> explore'],
    ['缺目标相位', '[TRANSITION] demo: open ->'],
    ['普通日志行', 'building packages ...'],
    ['空行', ''],
  ])('非法/无关行（%s）→ null', (_label, line) => {
    expect(parseTransitionLine(line)).toBeNull()
  })
})

describe('createPhaseWatch（写回 + 限流 + 结算清理）', () => {
  const collect = (): { writes: string[]; write: (v: string) => Promise<void> } => {
    const writes: string[] = []
    return {
      writes,
      write: async (v) => {
        writes.push(v)
      },
    }
  }

  it('检出 [TRANSITION] 行 → write(to)；连续推进逐次写', async () => {
    const { writes, write } = collect()
    const w = createPhaseWatch('demo', write)
    w.onLine('[TRANSITION] demo: open -> explore')
    w.onLine('some noise')
    w.onLine('[TRANSITION] demo: explore -> spec')
    await w.settle()
    expect(writes).toEqual(['explore', 'spec', ''])
  })

  it('限流：同值重复行只写一次（防 SSE 指纹风暴）', async () => {
    const { writes, write } = collect()
    const w = createPhaseWatch('demo', write)
    w.onLine('[TRANSITION] demo: open -> explore')
    w.onLine('[TRANSITION] demo: open -> explore')
    w.onLine('[TRANSITION] demo: open -> explore')
    await w.settle()
    expect(writes).toEqual(['explore', ''])
  })

  it('其它 change 名的转换行忽略（不写、不串味）', async () => {
    const { writes, write } = collect()
    const w = createPhaseWatch('demo', write)
    w.onLine('[TRANSITION] other: open -> explore')
    await w.settle()
    expect(writes).toEqual([]) // 一次都没写过 → 结算也不补写空串
  })

  it('结算清理：写过才清（写空串一次）；从未写过 → settle 零写', async () => {
    const { writes, write } = collect()
    const w = createPhaseWatch('demo', write)
    await w.settle()
    expect(writes).toEqual([])
  })

  it('settle 幂等：二次 settle 不再写', async () => {
    const { writes, write } = collect()
    const w = createPhaseWatch('demo', write)
    w.onLine('[TRANSITION] demo: build -> verify')
    await w.settle()
    await w.settle()
    expect(writes).toEqual(['verify', ''])
  })

  it('写回失败吞掉（best-effort，同 setStateField 既有 .catch 风格），后续写照常', async () => {
    const writes: string[] = []
    let failFirst = true
    const w = createPhaseWatch('demo', async (v) => {
      if (failFirst) {
        failFirst = false
        throw new Error('disk boom')
      }
      writes.push(v)
    })
    w.onLine('[TRANSITION] demo: open -> explore') // 这笔写失败（吞）
    w.onLine('[TRANSITION] demo: explore -> spec') // 后续照常
    await expect(w.settle()).resolves.toBeUndefined()
    expect(writes).toEqual(['spec', ''])
  })
})
