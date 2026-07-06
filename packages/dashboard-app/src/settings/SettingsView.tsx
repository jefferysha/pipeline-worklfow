import { useState } from 'react'
import { useT } from '../i18n'
import { PHASES, TRANSITIONS } from '../types'
import { MATRIX_TRACKS, isReviewGate, mandatoryFor } from './data'

type Tab = 'axis' | 'matrix'

/**
 * 设置 —— 病灶①解法：配置矩阵 + 相位轴编辑器从看板搬到独立视图。
 * 相位轴：7 相位 + 转换边 + 复核门标记（manifest 单源镜像，只读）。
 * 技能矩阵：相位 × 轨道强制 skill（manifest 镜像，只读预览；写回待 M3 config 端点）。
 */
export function SettingsView(): JSX.Element {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('axis')

  return (
    <section className="view settings" data-testid="settings-view">
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('settings.title')}</h1>
        </div>
        <div className="tabs" role="tablist" data-testid="settings-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'axis'}
            className={tab === 'axis' ? 'tab tab--active' : 'tab'}
            data-testid="settings-tab-axis"
            onClick={() => setTab('axis')}
          >
            {t('settings.tab_axis')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'matrix'}
            className={tab === 'matrix' ? 'tab tab--active' : 'tab'}
            data-testid="settings-tab-matrix"
            onClick={() => setTab('matrix')}
          >
            {t('settings.tab_matrix')}
          </button>
        </div>
      </header>

      {tab === 'axis' && (
        <div className="settings__panel" data-testid="settings-axis">
          <h2 className="settings__h2">{t('settings.axis_title')}</h2>
          <p className="settings__desc">{t('settings.axis_desc')}</p>
          <ol className="axis" data-testid="axis-list">
            {PHASES.map((phase) => (
              <li key={phase} className="axis__row" data-testid={`axis-${phase}`}>
                <span className="axis__phase">{t(`phases.${phase}`)}</span>
                {isReviewGate(phase) && (
                  <span className="badge badge--gate" data-testid={`axis-gate-${phase}`}>
                    {t('settings.review_gate')}
                  </span>
                )}
                <span className="axis__arrow" aria-hidden="true">→</span>
                <span className="axis__targets">
                  {TRANSITIONS[phase].map((to) => t(`phases.${to}`)).join(' / ')}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === 'matrix' && (
        <div className="settings__panel" data-testid="settings-matrix">
          <h2 className="settings__h2">{t('settings.matrix_title')}</h2>
          <p className="settings__desc">{t('settings.matrix_desc')}</p>
          <p className="settings__note" data-testid="matrix-readonly-note">{t('settings.no_config_endpoint')}</p>
          <div className="matrix__scroll">
            <table className="matrix" data-testid="matrix-table">
              <thead>
                <tr>
                  <th>{t('settings.phase')}</th>
                  {MATRIX_TRACKS.map((track) => (
                    <th key={track}>{track}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PHASES.filter((p) => p !== 'archive').map((phase) => (
                  <tr key={phase} data-testid={`matrix-row-${phase}`}>
                    <td className="matrix__phase">{t(`phases.${phase}`)}</td>
                    {MATRIX_TRACKS.map((track) => {
                      const skills = mandatoryFor(phase, track)
                      return (
                        <td key={track} data-testid={`matrix-cell-${phase}-${track}`}>
                          {skills.length === 0 ? (
                            <span className="matrix__none">—</span>
                          ) : (
                            <ul className="matrix__skills">
                              {skills.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
