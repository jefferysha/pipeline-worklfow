import { useT } from '../i18n'
import type { Snapshot } from '../types'
import { TrafficPanel } from './TrafficPanel'

interface AdvancedPanelProps {
  snapshot: Snapshot | null
}

const TOOLS = [
  { key: 'traffic', cap: 'traffic', when: 'traffic_when' },
  { key: 'runtime', cap: 'runtime', when: 'runtime_when' },
] as const

/** 已接线数据端的工具 → 真面板组件（capabilities 声明为 true 时渲染，取代占位）。 */
const PANELS: Partial<Record<(typeof TOOLS)[number]['key'], () => JSX.Element>> = {
  traffic: TrafficPanel,
}

/**
 * 高级 / 调试工具（病灶③解法）——traffic/runtime 从一级导航降级为默认折叠入口
 *（afk 与 loops 原也在此列：afk 于 Task 8 升格为一级导航 <AfkWorkbench/>；loops 于
 * GOAL.md F1 收尾升格为工作台下拉里的一级导航 <LoopsPanel/>——两者均不再在这里重复渲染
 * 只读摘要，避免两份视图让用户困惑哪个是准的）。
 * 能力声明驱动（GOAL B6，不谎报）：
 *   · server 声明 capabilities.<cap>=true 且有真面板（traffic #34d）→ 渲染真数据面板；
 *   · 未声明（runtime 数据端未接线，或 server 未装该域）→ 保持占位 + 待对应里程碑标注。
 */
export function AdvancedPanel({ snapshot }: AdvancedPanelProps): JSX.Element {
  const { t } = useT()
  const caps = snapshot?.capabilities ?? {}
  return (
    <details className="advanced" data-testid="advanced-panel">
      <summary className="advanced__summary" data-testid="advanced-summary">
        {t('advanced.title')}
      </summary>
      <div className="advanced__body">
        <p className="advanced__desc">{t('advanced.desc')}</p>
        <ul className="advanced__list" data-testid="advanced-list">
          {TOOLS.map((tool) => {
            const wired = caps[tool.cap] === true
            const Panel = wired ? PANELS[tool.key] : undefined
            return (
              <li key={tool.key} className="advanced__item" data-testid={`advanced-${tool.key}`}>
                <span className="advanced__name">{t(`advanced.${tool.key}`)}</span>
                {Panel ? (
                  // 已接线数据端：真消费面板取代占位徽标
                  <Panel />
                ) : (
                  <>
                    <span className="badge badge--pending" data-testid={`advanced-status-${tool.key}`}>
                      {wired ? 'ready' : t('advanced.placeholder')}
                    </span>
                    {!wired && <span className="advanced__when">{t(`advanced.${tool.when}`)}</span>}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </details>
  )
}
