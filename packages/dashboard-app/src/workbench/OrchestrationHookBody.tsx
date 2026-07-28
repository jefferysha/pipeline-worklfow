import { Icon } from '../shared/Icon'
import { useT } from '../i18n'
import { LOCKED_IDS, type HooksConfigState } from './HookTimeline'
import {
  EVENT_ORDER,
  HK_CARD,
  HK_DESC,
  HK_GROUP,
  HK_LOOP,
  HK_MK,
  HK_MK_RO,
  HK_MK_RW,
  HK_NAME,
  HK_TNAME,
  MINI_BASE,
  MINI_RO,
  SWITCH,
  type BoardLane,
} from './orchestrationBoardModel'

export function OrchestrationHookBody({ lane, open, hooks }: {
  lane: BoardLane
  open: boolean
  hooks?: HooksConfigState
}): JSX.Element | null {
  const { t } = useT()
  const list = hooks?.hooks
  if (hooks === undefined || list === null || list === undefined) return null
  if (!open) return <></>
  return (
    <div className="pt-2.5" id={`wb-lane-hk-body-${lane.id}`}>
      <div className="flex flex-col">
        {EVENT_ORDER.map((event) => {
          const eventHooks = list.filter((hook) => hook.event === event)
          return (
            <div key={event} className={HK_GROUP} data-testid={`wb-lane-hk-group-${lane.id}-${event}`}>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className={HK_TNAME} title={`技术事件：${event}`}>{t(`workbench.hk_ev_${event}`)}</span>
                {event === 'UserPromptSubmit' && <span className={HK_LOOP}>{t('workbench.board_hk_loop')}</span>}
              </div>
              <div className="flex flex-col gap-2">
                {eventHooks.length === 0 ? <span className="text-[12.5px] text-text-3" role="status" aria-live="polite">{t('workbench.board_hk_empty')}</span> : eventHooks.map((hook) => {
                  const key = `${hook.id}.${lane.id}`
                  const enabled = !(key in hooks.matrix)
                  const locked = !hook.configurable && LOCKED_IDS.has(hook.id)
                  const pending = !hook.configurable && !locked
                  const nameKey = `workbench.hk_name_${hook.id}`
                  const translatedName = t(nameKey)
                  const display = translatedName === nameKey ? hook.id : translatedName
                  const descriptionKey = `workbench.hk_desc_${hook.id}`
                  const description = t(descriptionKey)
                  return (
                    <div key={hook.id} className={HK_CARD} data-state={pending ? 'pending' : locked ? 'locked' : 'configurable'} data-testid={`wb-lane-hk-${lane.id}-${hook.id}`} title={`${hook.id} · ${hook.event} · matcher ${hook.matcher} · ${hook.script}`}>
                      <div className="flex items-center gap-2">
                        <span className={`${HK_MK} ${hook.configurable ? HK_MK_RW : HK_MK_RO}`} aria-hidden="true"><Icon name={locked ? 'gate' : pending ? 'clock' : 'gauge'} size={12} /></span>
                        <span className={HK_NAME}>{display}</span>
                        <span className={`${MINI_BASE} ${MINI_RO}`}>内置 Hook</span>
                        <span className="min-w-2 flex-1" />
                        {(locked || pending) && <span className={`${MINI_BASE} ${MINI_RO}`} data-testid={`wb-lane-hk-badge-${lane.id}-${hook.id}`}>{locked ? t('workbench.hk_locked') : t('workbench.hk_pending')}</span>}
                        {hook.configurable && <button type="button" className={SWITCH} role="switch" aria-checked={enabled} aria-label={`${display} · ${lane.name}`} disabled={hooks.busyKeys.has(key)} data-testid={`wb-lane-hk-sw-${lane.id}-${hook.id}`} onClick={(click) => { click.stopPropagation(); hooks.toggle(hook.id, lane.id, !enabled) }} />}
                      </div>
                      {description !== descriptionKey && <div className={HK_DESC}>{description}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
