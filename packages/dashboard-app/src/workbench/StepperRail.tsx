import { Fragment } from 'react'
import { useT } from '../i18n'

/**
 * StepperRail（T12，v5 交互重建）—— 工作台线性 stepper：阶段卡横排 + 卡间转换事件连接件。
 * 交互真相源 design-demos/v5-progress-workbench.html 的 .wb-steps 段（renderStepper/connHTML）。
 *
 * 纯展示组件：不吃原始 WorkflowDef，只吃 WorkbenchView 投影好的 StepperStep 视图模型——
 * 名称回退（label→i18n phases→id）、技能去重、forward 边解析都在投影层做完，本组件零业务判断。
 */
export interface StepperStep {
  id: string
  /** 展示名（label 优先，default 相位走 i18n phases.*，兜底 id）——投影层已算好。 */
  name: string
  gate: 'review' | 'confirm' | null
  /** 去重后的技能 id 序（chips 只展示前 2 个短名 + 截断计数）。 */
  skills: string[]
  outputsCount: number
  /**
   * T15：该阶段的启用 hook 数（/api/hooks 矩阵按阶段算——各卡数字可以不同）；
   * undefined = 数据面未就绪/加载失败，隐藏该段（诚实占位，不谎报数字）。
   */
  hooksCount?: number
  /** 与下一张卡之间的转换事件名；无 forward 边 = null，不画连接件（诚实：边不存在就不画箭头）。 */
  linkEvent: string | null
}

export interface StepperRailProps {
  steps: StepperStep[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** 预演点亮数（WorkbenchView 的 GSAP 预演驱动）：前 litCount 张卡加 --live，最后一张 --live-g。 */
  litCount?: number
  /** T13 挂载点：添加阶段。未接线时按钮渲染禁用态占位。 */
  onAddStage?: () => void
  /** stepper 容器的 aria-label（如「release-train 阶段」）。 */
  label: string
}

/** 技能短名：带命名空间的 id（superpowers:tdd）只显示冒号后段，全名进 title。 */
function shortSkill(id: string): string {
  const ix = id.lastIndexOf(':')
  return ix >= 0 ? id.slice(ix + 1) : id
}

export function StepperRail({ steps, selectedId, onSelect, litCount = 0, onAddStage, label }: StepperRailProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="wb-rail">
      <div className="wb-steps" aria-label={label}>
        {steps.map((s, i) => {
          const on = s.id === selectedId
          const live = i < litCount ? (i === steps.length - 1 ? ' wb-step--live-g' : ' wb-step--live') : ''
          return (
            <Fragment key={s.id}>
              <button
                className={`wb-step${on ? ' wb-step--on' : ''}${live}`}
                data-testid={`wb-step-${s.id}`}
                aria-current={on ? 'step' : undefined}
                onClick={() => onSelect(s.id)}
              >
                <span className="wb-step-top">
                  <span className="wb-step-num">{i + 1}</span>
                  {s.gate && (
                    <span className="badge badge--gate wb-step-gate">
                      {s.gate === 'confirm' ? t('workbench.gate_badge_confirm') : t('workbench.gate_badge')}
                    </span>
                  )}
                </span>
                <span className="wb-step-name">{s.name}</span>
                <span className="wb-step-id">{s.id}</span>
                <span className="wb-step-meta">
                  <span>◇ {t('workbench.meta_skills', { n: s.skills.length })}</span>
                  {s.hooksCount !== undefined && (
                    <>
                      <i>·</i>
                      <span>⚙ {t('workbench.meta_hooks', { n: s.hooksCount })}</span>
                    </>
                  )}
                  <i>·</i>
                  <span>▤ {t('workbench.meta_outputs', { n: s.outputsCount })}</span>
                </span>
                {s.skills.length > 0 && (
                  <span className="wb-step-sk">
                    {s.skills.slice(0, 2).map((id) => (
                      <span key={id} className="wb-skc" title={id}>{shortSkill(id)}</span>
                    ))}
                    {s.skills.length > 2 && <span className="wb-skc-n">+{s.skills.length - 2}</span>}
                  </span>
                )}
              </button>
              {s.linkEvent !== null && i < steps.length - 1 && (
                <span className="wb-link" aria-hidden="true">
                  <span className="wb-link-ev">{s.linkEvent}</span>
                  {/* 箭头不用 <marker>（多连接件会产生重复 id），直接画线 + 三角。 */}
                  <svg viewBox="0 0 54 10" width="54" height="10">
                    <line x1="1" y1="5" x2="45" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M45 1.5 L52 5 L45 8.5 Z" fill="currentColor" />
                  </svg>
                </span>
              )}
            </Fragment>
          )
        })}
        <button
          className="wb-step--add"
          onClick={onAddStage}
          disabled={!onAddStage}
          title={onAddStage ? undefined : t('workbench.add_stage_pending')}
        >
          {t('workbench.add_stage')}
        </button>
      </div>
    </div>
  )
}
