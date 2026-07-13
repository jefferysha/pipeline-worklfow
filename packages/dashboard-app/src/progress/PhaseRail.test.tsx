import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PhaseRail, type RailMode } from './PhaseRail'

/**
 * PhaseRail（v9-F1 列车轨）—— 纯展示组件的结构测试：
 *   · 相位数跟随传入列表（= 该 change 所属 workflow 的真实 steps，非硬编码七相）；
 *   · 各 mode 的当前相位状态类（cur/gate/fail/cxl/queue）与 done/todo 前后段；
 *   · data-mode 门控属性（CSS「在跑才流光」的选择器开关）与 role="img" aria-label。
 * 动效本体（流光/呼吸/停帧）是纯 CSS，归 styles.test.tsx 钉住；此处只验 DOM 契约。
 */

function renderRail(over: Partial<Parameters<typeof PhaseRail>[0]> = {}): HTMLElement {
  render(
    <PhaseRail
      phases={['立项', '调研', '规格']}
      currentIndex={1}
      mode="run"
      ariaLabel="3 相位，调研 运行中"
      testid="rail"
      {...over}
    />,
  )
  return screen.getByTestId('rail')
}

function phaseClasses(rail: HTMLElement): string[] {
  return Array.from(rail.querySelectorAll('.rl-ph')).map((el) => el.className)
}

describe('PhaseRail 相位数与骨架', () => {
  it('相位数=传入列表长度（3 相自定义 workflow → 3 段，不硬编码七相）', () => {
    const rail = renderRail()
    expect(rail.querySelectorAll('.rl-ph')).toHaveLength(3)
    const names = Array.from(rail.querySelectorAll('.rl-name')).map((el) => el.textContent)
    expect(names).toEqual(['立项', '调研', '规格'])
  })

  it('七相列表 → 7 段（长度纯随入参）', () => {
    const rail = renderRail({ phases: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], currentIndex: 4 })
    expect(rail.querySelectorAll('.rl-ph')).toHaveLength(7)
  })

  it('每段带 track/node/name 内件与 --i 序号变量（流光 stagger 的 animation-delay 数据源）', () => {
    const rail = renderRail()
    const phs = Array.from(rail.querySelectorAll<HTMLElement>('.rl-ph'))
    for (const [i, ph] of phs.entries()) {
      expect(ph.querySelector('.rl-track')).not.toBeNull()
      expect(ph.querySelector('.rl-node')).not.toBeNull()
      expect(ph.querySelector('.rl-name')).not.toBeNull()
      expect(ph.style.getPropertyValue('--i')).toBe(String(i))
    }
  })

  it('role="img" + aria-label 整句透传；testid 挂在容器上', () => {
    const rail = renderRail()
    expect(rail).toHaveAttribute('role', 'img')
    expect(rail).toHaveAttribute('aria-label', '3 相位，调研 运行中')
  })
})

describe('PhaseRail 状态类：done/cur/gate/fail/cxl/queue/todo', () => {
  it('run 模式：前段 done、当前 cur（列车头）、后段 todo；容器 data-mode="run"（在跑才流光的门控）', () => {
    const rail = renderRail({ mode: 'run', currentIndex: 1 })
    const cls = phaseClasses(rail)
    expect(cls[0]).toContain('rl-ph--done')
    expect(cls[1]).toContain('rl-ph--cur')
    expect(cls[2]).toContain('rl-ph--todo')
    expect(rail).toHaveAttribute('data-mode', 'run')
  })

  it('idle 模式：当前段同为 cur，但 data-mode="idle"——CSS 流光/脉冲选择器不命中（观察行安静）', () => {
    const rail = renderRail({ mode: 'idle' })
    expect(phaseClasses(rail)[1]).toContain('rl-ph--cur')
    expect(rail).toHaveAttribute('data-mode', 'idle')
  })

  it.each([
    ['gate', 'rl-ph--gate'],
    ['fail', 'rl-ph--fail'],
    ['cxl', 'rl-ph--cxl'],
    ['queue', 'rl-ph--queue'],
  ] as [RailMode, string][])('%s 模式：当前段落 %s 状态类，data-mode 同步', (mode, expected) => {
    const rail = renderRail({ mode })
    const cls = phaseClasses(rail)
    expect(cls[1]).toContain(expected)
    expect(cls[0]).toContain('rl-ph--done')
    expect(cls[2]).toContain('rl-ph--todo')
    expect(rail).toHaveAttribute('data-mode', mode)
  })

  it('cxl（琥珀取消）只改当前段——前后段不落 cxl 类（琥珀语义不外溢）', () => {
    const rail = renderRail({ mode: 'cxl' })
    const cls = phaseClasses(rail)
    expect(cls[0]).not.toContain('rl-ph--cxl')
    expect(cls[2]).not.toContain('rl-ph--cxl')
  })

  it('单相退化轨（rules 缺失时宿主传单元素列表）：唯一段=当前段', () => {
    const rail = renderRail({ phases: ['polish'], currentIndex: 0, mode: 'idle' })
    const cls = phaseClasses(rail)
    expect(cls).toHaveLength(1)
    expect(cls[0]).toContain('rl-ph--cur')
  })
})
