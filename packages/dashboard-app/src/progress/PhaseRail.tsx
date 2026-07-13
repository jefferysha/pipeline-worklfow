import type { CSSProperties } from 'react'

/**
 * PhaseRail（v9-F1，列车轨进度条）—— 设计真相源 design-demos/v9-flowdeck.html R1 列车轨
 * （.rail 容器与 .rl- 骨架、.st- 状态类两族；R2 液态 / R3 星轨两备选已退役不移植）。release-train 隐喻：
 * 轨道逐段连结、节点在上、名称在下、列车头（蓝点）停在当前相位。
 *
 * 纯展示组件（零业务零 i18n）：相位列表来自该 change 所属 workflow 的真实 steps——由宿主
 * （ProgressView）按现有 stepLabel 惯例解析成展示名后传入，**不在组件内硬编码 default 七相**；
 * ariaLabel 同理由宿主经 progress.rail_aria_* i18n 组好整句传入。
 *
 * 动效=状态语义，全部纯 CSS（styles.ts v9-F1 块），组件内零 JS 循环：
 *   · 在跑才流光——流光/列车头脉冲只挂在 `.prg9-rail[data-mode="run"]` 门控选择器下，
 *     观察行（gate/fail/cxl/queue/idle）安静不流动；
 *   · 门=红菱形呼吸（data-mode="gate" 门控）；失败=断轨豁口；取消=琥珀；排队/未达=幽灵虚线轨；
 *   · prefers-reduced-motion 全停（纯 CSS media，见 styles.ts 块尾停帧规则）。
 * 入场生长动画（轨道 scaleX + 节点弹入）归宿主 ProgressView 的 useGSAP 编排，不在本组件内。
 */

export type RailMode = 'run' | 'gate' | 'fail' | 'cxl' | 'queue' | 'idle'

export interface PhaseRailProps {
  /** 相位展示名（宿主已按 rules.labelByStep / phases.* i18n 解析），长度 = workflow 真实相位数。 */
  phases: readonly string[]
  /** 当前相位下标（宿主保证 0 ≤ currentIndex < phases.length；rules 缺失时宿主退化为单相轨）。 */
  currentIndex: number
  mode: RailMode
  /** 整句人话（progress.rail_aria_* 组好传入）——role="img" 的读法。 */
  ariaLabel: string
  testid?: string
}

/** 单相位状态类尾缀：done / cur / gate / fail / cxl / queue / todo。 */
function phaseState(i: number, currentIndex: number, mode: RailMode): string {
  if (i < currentIndex) return 'done'
  if (i > currentIndex) return 'todo'
  switch (mode) {
    case 'gate':
      return 'gate'
    case 'fail':
      return 'fail'
    case 'cxl':
      return 'cxl'
    case 'queue':
      return 'queue'
    default:
      return 'cur' // run / idle：列车头停在当前相位（流光与否由 data-mode 门控）
  }
}

export function PhaseRail({ phases, currentIndex, mode, ariaLabel, testid }: PhaseRailProps): JSX.Element {
  return (
    <div className="prg9-rail" data-mode={mode} role="img" aria-label={ariaLabel} data-testid={testid}>
      <ol className="rl">
        {phases.map((name, i) => (
          <li
            key={`${i}-${name}`}
            className={`rl-ph rl-ph--${phaseState(i, currentIndex, mode)}`}
            style={{ '--i': i } as CSSProperties}
          >
            <i className="rl-track" aria-hidden="true" />
            <i className="rl-node" aria-hidden="true" />
            <span className="rl-name">{name}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
