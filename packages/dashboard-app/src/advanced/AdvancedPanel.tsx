import { useT } from '../i18n'
import type { Snapshot } from '../types'

interface AdvancedPanelProps {
  snapshot: Snapshot | null
}

const TOOLS = [
  { key: 'traffic', cap: 'traffic', when: 'traffic_when' },
  { key: 'runtime', cap: 'runtime', when: 'runtime_when' },
  { key: 'loops', cap: 'loops', when: 'loops_when' },
  { key: 'afk', cap: 'afk', when: 'afk_when' },
] as const

/**
 * 高级 / 调试工具 —— 病灶③解法：traffic/runtime/loops/afk 从一级导航降级为默认折叠入口。
 * 当前均为占位（server 能力声明里这些域未接线，capabilities 不报 true）——诚实标注"待对应里程碑数据端"。
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
            return (
              <li key={tool.key} className="advanced__item" data-testid={`advanced-${tool.key}`}>
                <span className="advanced__name">{t(`advanced.${tool.key}`)}</span>
                <span className="badge badge--pending" data-testid={`advanced-status-${tool.key}`}>
                  {wired ? 'ready' : t('advanced.placeholder')}
                </span>
                {!wired && <span className="advanced__when">{t(`advanced.${tool.when}`)}</span>}
              </li>
            )
          })}
        </ul>
      </div>
    </details>
  )
}
