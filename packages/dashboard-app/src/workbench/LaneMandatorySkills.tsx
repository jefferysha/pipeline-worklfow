import { useEffect, useRef, useState } from 'react'
import { Layers3, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '../i18n'
import { resolvedSkillId, skillPresentation } from './skillPresentation'
import { resolveMandatoryCell, type MandatoryState } from './mandatoryState'

const ZONE_TITLE = 'text-[13px] font-[750] whitespace-nowrap text-text-2'
const NOTE_CLS = 'text-[12.5px] leading-[1.55] text-text-3'
/** 定稿 .setchips .sc：紫 chip，名字 nowrap 且无 overflow-hidden——列宽（max-content）负责放得下。 */
const CHIP_CLS =
  'inline-flex items-center gap-1.5 rounded-lg border border-purple-b bg-purple-t px-2.5 py-[5px] font-mono text-[13px] font-semibold whitespace-nowrap text-purple-d data-uninstalled:opacity-62'
/** 定稿 .setchips .add：虚线添加钮。 */
const ADD_CLS =
  'cursor-pointer rounded-lg border-[1.5px] border-dashed border-border-2 bg-transparent px-[11px] py-[5px] text-[12.5px] font-bold whitespace-nowrap text-text-3 transition-colors enabled:hover:border-purple-b enabled:hover:text-purple-d disabled:cursor-not-allowed disabled:opacity-50'
/** 未装徽章（同 SkillChain/SkillTransferModal 既有琥珀小徽章：红绿 color-mix 派生，决议 #9）。 */
const UNINST_CLS =
  'ml-1 flex-none whitespace-nowrap rounded-full border-0 bg-[color-mix(in_oklch,var(--red)_52%,var(--green))] px-1.5 py-px text-[11.5px] font-bold text-card'

export interface LaneMandatorySkillsProps {
  phase: string
  state: MandatoryState
  readonly?: boolean
}

export function LaneMandatorySkills({ phase, state, readonly = false }: LaneMandatorySkillsProps): JSX.Element {
  const { t } = useT()
  const { table, capable, track, tracks, writableProfiles, savingKey, saveError, saveErrorKey, registry } = state
  const [popOpen, setPopOpen] = useState(false)
  const popWrapRef = useRef<HTMLDivElement>(null)

  // 候选面板：点外部收起（同 OrchestrationBoard 门 popover 的既有做法；面板内的按钮
  // 自行 stopPropagation，故不会被本监听器误收）。
  useEffect(() => {
    if (!popOpen) return
    function onDocClick(e: MouseEvent): void {
      if (popWrapRef.current && e.target instanceof Node && !popWrapRef.current.contains(e.target)) setPopOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [popOpen])

  const selectedTrack = track === null ? null : tracks.find((candidate) => candidate.id === track) ?? null
  const cell = table !== null && selectedTrack !== null
    ? resolveMandatoryCell(table, selectedTrack, phase, writableProfiles)
    : null
  const writeKey = selectedTrack === null ? '' : `${phase}.${selectedTrack.id}`
  const busy = savingKey === writeKey
  const skills = cell?.skills ?? []
  const isArchive = phase === 'archive'
  // 只有 profile===track.id 且 phase.profile 已显式声明的格子可写。继承 profile、_all、空集合、
  // archive 与 config 不可用都结构性隐藏写入口，避免按钮暗示 server 能完成并不存在的 mutation。
  const entriesRendered = !readonly && capable && cell?.source === 'explicit' && cell.editable && !isArchive
  const writeDisabled = busy

  const entryOf = new Map((registry ?? []).map((e) => [e.name, e]))
  /** 未装徽章：registry 查得到且 installed===false 才标。查不到（如 manifest 的 `a|b` 备选 token）
   *  = 不可判 → 不标（保守，不谎报「没装」）。 */
  const uninstBadge = (id: string): JSX.Element | null => {
    const entry = entryOf.get(id)
    if (!entry || entry.installed) return null
    return (
      <span className={UNINST_CLS} title={entry.installCmd ?? t('workbench.sk_uninstalled_hint_user')}>
        {t('workbench.mand_uninstalled')}
      </span>
    )
  }

  // 说明区：可叠加（如 server 不可写 + 该阶段走 _all 同时成立），故装进一个容器里逐条列，
  // 不做「只显示最高优先级那条」的裁剪——每条都是真的，藏掉任何一条都是少说。
  const notes: string[] = []
  if (isArchive) notes.push(t('workbench.mand_note_archive'))
  if (cell?.source === 'profile-inherited') notes.push(`沿用“${tracks.find((candidate) => candidate.id === cell.profile)?.label ?? cell.profile}”轨道的默认 Skill。`)
  if (cell?.source === 'all-inherited') notes.push('沿用所有轨道共用的默认 Skill。')
  if (cell?.source === 'missing') notes.push('当前轨道尚未设置默认 Skill。')
  if (cell?.source === 'explicit' && !cell.editable) notes.push('当前配置仅供查看。')
  if (entriesRendered && capable && registry === null) notes.push(t('workbench.mand_note_reg'))

  const candidates = (registry ?? []).map((e) => e.name).filter((id) => !skills.includes(id))

  function removeSkill(id: string): void {
    state.setSkills(phase, skills.filter((s) => s !== id))
  }
  function addSkill(id: string): void {
    setPopOpen(false)
    state.setSkills(phase, [...skills, id])
  }

  return (
    <div data-testid={`wb-mand-${phase}`}>
      <div className="mx-0.5 mb-2 flex items-center gap-2">
        <span className={`${ZONE_TITLE} inline-flex items-center gap-1.5`} title={t('workbench.mand_zone_title')}>
          <Layers3 className="h-3.5 w-3.5" aria-hidden="true" /> Skill 调用
        </span>
      </div>

      {table === null ? (
        <span className={cn(NOTE_CLS, 'mx-0.5')} role="status" aria-live="polite">{t('common.loading')}</span>
      ) : selectedTrack === null || cell === null ? (
        <span className={cn(NOTE_CLS, 'mx-0.5')} data-testid={`wb-mand-unavailable-${phase}`} role="status" aria-live="polite">
          {t('workbench.mand_tracks_unavailable')}
        </span>
      ) : (
        <>
          {notes.length > 0 && (
            <div className="mx-0.5 mb-2 flex flex-col gap-1" data-testid={`wb-mand-note-${phase}`}>
              {notes.map((n) => (
                <p key={n} className={NOTE_CLS}>
                  {n}
                </p>
              ))}
            </div>
          )}
          <div className="relative" data-testid={`wb-mand-parallel-${phase}`} title="本阶段启动时会注入这些 Skill；当前来源未声明相互依赖。">
            <div className="mb-2 inline-flex items-center gap-2 text-[11.5px] font-bold text-text-3">
              <span className="h-2.5 w-2.5 rounded-full bg-(--accent) shadow-[0_0_0_4px_var(--accent-t)]" aria-hidden="true" />
              阶段开始
              {skills.length > 0 && <span className="h-px w-7 bg-purple-b" aria-hidden="true" />}
            </div>
            <div className="relative flex flex-col items-start gap-2 border-l border-purple-b pl-4">
            {skills.length === 0 && <span className="mx-0.5 text-[13px] text-text-3" role="status" aria-live="polite">{t('workbench.mand_empty')}</span>}
            {skills.map((id) => {
              const presentation = skillPresentation(id, registry)
              const resolvedId = resolvedSkillId(id, registry)
              return (
                <span
                  key={id}
                  data-skill-node=""
                  data-chip=""
                  data-uninstalled={entryOf.get(resolvedId)?.installed === false ? '' : undefined}
                  className={CHIP_CLS}
                  data-testid={`wb-mand-chip-${phase}-${id}`}
                  title={`${presentation.technicalTitle} 当前来源只提供本阶段需要的 Skill，没有声明先后依赖；可编辑工作流中可设置串行、并行与依赖。`}
                >
                  <span className="-ml-[22px] h-2.5 w-2.5 flex-none rounded-full border-2 border-card bg-purple" aria-hidden="true" />
                  <span className="flex-none font-sans">{presentation.name}</span>
                  {uninstBadge(resolvedId)}
                  {entriesRendered && (
                    <button
                      type="button"
                      className="-mr-1 inline-grid size-4 flex-none cursor-pointer place-items-center rounded-[5px] p-0 text-[14px] leading-none opacity-70 transition hover:opacity-100 enabled:hover:bg-red-t enabled:hover:text-red-d disabled:cursor-not-allowed disabled:opacity-40"
                      data-testid={`wb-mand-rm-${phase}-${id}`}
                      aria-label={t('workbench.mand_rm', { id, phase })}
                      disabled={writeDisabled}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSkill(id)
                      }}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  )}
                </span>
              )
            })}
            {entriesRendered && (
              <div className="relative" ref={popWrapRef}>
                <button
                  type="button"
                  className={ADD_CLS}
                  data-testid={`wb-mand-add-${phase}`}
                  aria-label={t('workbench.mand_add_aria', { phase })}
                  aria-expanded={popOpen}
                  disabled={writeDisabled || registry === null}
                  title={registry === null ? t('workbench.mand_note_reg') : undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPopOpen((v) => !v)
                  }}
                >
                  {t('workbench.mand_add')}
                </button>
                {popOpen && (
                  <div
                    className="absolute top-[calc(100%+6px)] left-0 z-[6] flex max-h-[260px] w-[300px] flex-col gap-0.5 overflow-y-auto rounded-[11px] border border-border bg-card p-1.5 text-left shadow-md"
                    data-testid={`wb-mand-pop-${phase}`}
                    role="group"
                    aria-label={t('workbench.mand_pop_title', { key: cell.key })}
                  >
                    <p className="px-1.5 py-1 text-[11.5px] font-bold text-text-3">{t('workbench.mand_pop_title', { key: cell.key })}</p>
                    {candidates.length === 0 && <p className="px-1.5 py-1 text-[12.5px] text-text-3" role="status" aria-live="polite">{t('workbench.mand_pop_empty')}</p>}
                    {candidates.map((id) => {
                      const presentation = skillPresentation(id, registry)
                      return (
                      <button
                        key={id}
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-left text-[13px] whitespace-nowrap text-text-2 transition-colors hover:border-purple-b hover:bg-purple-t hover:text-purple-d"
                        data-testid={`wb-mand-opt-${phase}-${id}`}
                        title={presentation.technicalTitle}
                        onClick={(e) => {
                          e.stopPropagation()
                          addSkill(id)
                        }}
                      >
                        {presentation.name}
                        {uninstBadge(id)}
                      </button>
                    )})}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
          {/* saveError 是矩阵级单值：只挂在真出错的那一列（saveErrorKey 缺省时退回全列显示，
              见 MandatoryState.saveErrorKey 注释）。 */}
          {saveError !== null && (saveErrorKey == null || saveErrorKey === writeKey) && (
            <p className="mx-0.5 mt-2 text-[12.5px] text-red" data-testid={`wb-mand-err-${phase}`} role="alert">
              {saveError}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// B4：TrackSelector —— 看板级轨道镜头（塞进 OrchestrationBoard 的 toolbarSlot）
// ══════════════════════════════════════════════════════════════════════════

/**
 * 偏离定稿并已知会用户（契约 §3-B4）：定稿 demo 是每列一份 track tab（状态全局同步）。
 * 本实现改为看板级单个选择器——7 份同步控件点一个动全部，locality 坏；track 是横跨整个
 * 矩阵的镜头，不是某一列的属性。
 */
