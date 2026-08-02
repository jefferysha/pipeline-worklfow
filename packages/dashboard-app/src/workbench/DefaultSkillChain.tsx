import { useEffect, useRef, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { cn } from '@/lib/utils'
import { postMandatorySkills, type WbSkillEntry } from '../api/client'
import { formatApiError } from '../api/transport'
import { useT } from '../i18n'
import {
  loadMandatoryConfig,
  mergeMandatoryConfigCell,
  peekMandatoryConfig,
  resolveMandatoryCell,
  type MandatoryConfig,
} from './mandatorySkills'
import {
  ACTIONS_CLS,
  ADDCHIP_CLS,
  CHIP_BADGE_CLS,
  CHIP_CLS,
  EMPTY_CLS,
  HINT_CLS,
  NOTE_CLS,
  SEC_H_CLS,
} from './skillChainModel'
import { SkillTransferModal } from './SkillTransferModal'
import { decodeMandatorySkillWriteSuccess } from './mandatorySkillWriteResponse'
import type { WbStepDef } from './WorkbenchView'
import { useMandatoryCellMutations } from './useMandatoryCellMutations'

export function DefaultSkillChain({
  step,
  root,
  registry,
}: {
  step: WbStepDef
  root: string
  registry: WbSkillEntry[] | null
}): JSX.Element {
  const { t, lang } = useT()
  const [requestedTrack, setTrack] = useState<string | null>(null)
  const [cfg, setCfg] = useState<MandatoryConfig | null>(() => peekMandatoryConfig(root))
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState<
    { kind: 'request'; cause: unknown }
    | { kind: 'server'; detail: string; status: number }
    | { kind: 'invalid' }
    | null
  >(null)
  const rootRef = useRef(root)
  rootRef.current = root
  const mutations = useMandatoryCellMutations()

  useEffect(() => {
    let cancelled = false
    const cached = peekMandatoryConfig(root)
    setCfg(cached)
    setEditing(false)
    setSaveError(null)
    if (cached === null) {
      void loadMandatoryConfig(root).then((next) => {
        if (!cancelled) setCfg(next)
      })
    }
    return () => {
      cancelled = true
    }
  }, [root])

  const phase = step.id
  const matrixTracks = cfg?.tracks.filter((track) => track.policyProfile.skills.matrix) ?? []
  const selectedTrack = matrixTracks.find((track) => track.id === requestedTrack) ?? matrixTracks[0] ?? null
  const track = selectedTrack?.id ?? ''
  const cellIdentityRef = useRef('')
  cellIdentityRef.current = `${phase}.${track}`
  const installed = new Map((registry ?? []).map((entry) => [entry.name, entry]))
  const effectiveSkills = (trackId: string): string[] => {
    if (cfg === null) return []
    const definition = matrixTracks.find((candidate) => candidate.id === trackId)
    return definition ? resolveMandatoryCell(cfg.table, definition, phase, cfg.writableProfiles).skills : []
  }

  async function saveMandatory(skills: string[]): Promise<void> {
    if (selectedTrack === null) return
    const cellKey = `${phase}.${track}`
    const requestCfg = cfg
    const op = mutations.begin(root, cellKey, requestCfg?.revision ?? '')
    if (op === null) return
    setSaveError(null)
    const isCurrentOperation = (): boolean => (
      mutations.isLatest(op)
      && rootRef.current === op.root
      && cellIdentityRef.current === op.cellKey
    )
    try {
      const response = await postMandatorySkills({ phase, track, skills, root })
      let body: unknown
      let parsed = false
      try {
        body = await response.json()
        parsed = true
      } catch {
        body = null
      }
      if (!response.ok || (typeof body === 'object' && body !== null && Reflect.get(body, 'ok') === false)) {
        if (isCurrentOperation()) {
          setSaveError({
            kind: 'server',
            detail: typeof body === 'object' && body !== null && typeof Reflect.get(body, 'error') === 'string'
              ? String(Reflect.get(body, 'error'))
              : '',
            status: response.status,
          })
        }
        return
      }
      const success = parsed ? decodeMandatorySkillWriteSuccess(body, { phase, track }) : null
      if (success === null) {
        if (isCurrentOperation()) setSaveError({ kind: 'invalid' })
        return
      }
      if (!mutations.isLatest(op)) return
      const next = await mergeMandatoryConfigCell(root, cellKey, success.skills, requestCfg)
      if (next !== null) {
        if (rootRef.current === op.root) setCfg(next)
        if (isCurrentOperation()) setEditing(false)
      }
    } catch (error) {
      if (isCurrentOperation()) {
        setSaveError({ kind: 'request', cause: error })
      }
    } finally {
      mutations.finish(op)
    }
  }

  const skills = effectiveSkills(track)
  const cell = cfg !== null && selectedTrack !== null
    ? resolveMandatoryCell(cfg.table, selectedTrack, phase, cfg.writableProfiles)
    : null
  const canEdit = cfg?.capable === true && cell?.editable === true && cell.source === 'explicit' && phase !== 'archive'
  const busy = mutations.busy(root, `${phase}.${track}`)
  const missing = cfg?.capable === true && registry !== null
    ? (cell?.skills ?? []).filter((token) => token.split('|').every((alternative) => installed.get(alternative)?.installed !== true))
    : []
  const firstCommand = missing.flatMap((token) => token.split('|'))
    .map((alternative) => installed.get(alternative)?.installCmd)
    .find((command) => command !== undefined)

  return (
    <div className="wb-ed-sec pt-3.5 pb-1" data-testid="wb-sk-sec">
      <div className={SEC_H_CLS}>{t('workbench.sk_sec')}<span className={HINT_CLS}>{t('workbench.sk_hint_default', { phase })}</span></div>
      {cfg === null ? <p className={NOTE_CLS} role="status" aria-live="polite">{t('common.loading')}</p> : <>
        {matrixTracks.length === 0 ? <p className={NOTE_CLS} role="status" aria-live="polite">{t('workbench.track_empty')}</p> : (
          <div className="mb-2.5 flex gap-1" data-testid="wb-sk-tracks">
            {matrixTracks.map((definition) => (
              <button
                key={definition.id}
                type="button"
                className="h-[26px] cursor-pointer rounded-md px-[11px] font-mono text-[12.5px] font-semibold text-text-3 transition-colors not-aria-pressed:hover:bg-fill not-aria-pressed:hover:text-text-2 aria-pressed:bg-fill-2 aria-pressed:text-text"
                aria-pressed={definition.id === track}
                data-testid={`wb-sk-track-${definition.id}`}
                onClick={() => {
                  setTrack(definition.id)
                  setEditing(false)
                  setSaveError(null)
                }}
              >
                {definition.builtin && <LockKeyhole className="mr-1 inline size-3" aria-hidden="true" />}{definition.label}
                {definition.policyProfile.skills.profile !== definition.id && ` · ${t('workbench.sk_inherits', { profile: definition.policyProfile.skills.profile })}`}
                {effectiveSkills(definition.id).length > 0 && <b className="ml-[3px] font-bold text-(--accent)">{effectiveSkills(definition.id).length}</b>}
              </button>
            ))}
          </div>
        )}
        {missing.length > 0 && (
          <p className={cn(NOTE_CLS, 'flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-fill px-2.5 py-2')} data-testid="wb-sk-banner">
            {t('workbench.sk_banner', { tokens: missing.join('、') })}
            {firstCommand && <button type="button" className={cn(CHIP_BADGE_CLS, 'cursor-pointer')} data-testid="wb-sk-banner-copy" title={firstCommand} onClick={() => void navigator.clipboard?.writeText(firstCommand)}>{t('workbench.sk_banner_copy')}</button>}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2" data-testid="wb-sk-mand">
          {skills.length === 0 && <span className={EMPTY_CLS} role="status" aria-live="polite">{t('workbench.sk_empty_default')}</span>}
          {skills.map((skill) => (
            <span key={skill} data-chip="" data-uninstalled={installed.get(skill)?.installed === false ? '' : undefined} className={CHIP_CLS} title={skill}>
              {skill}
              {installed.get(skill)?.installed === false && <span className={CHIP_BADGE_CLS}>{t('workbench.sk_uninstalled')}</span>}
            </span>
          ))}
        </div>
        <div className={ACTIONS_CLS}>
          {canEdit && <button type="button" className={ADDCHIP_CLS} data-testid="wb-sk-edit" onClick={() => { setEditing(true); setSaveError(null) }}>{t('workbench.sk_edit')}</button>}
          {cfg.capable === false && <p className={NOTE_CLS} data-testid="wb-sk-cfg-ro">{t('workbench.sk_cfg_readonly')}</p>}
        </div>
        {saveError && <p className="mt-2 text-[13px] text-red" data-testid="wb-sk-save-error" role="alert">
          {saveError.kind === 'invalid'
            ? t('common.invalid_response')
            : saveError.kind === 'server'
              ? lang === 'zh' && saveError.detail !== ''
                ? saveError.detail
                : t('workbench.sk_save_failed', { status: saveError.status })
              : formatApiError(saveError.cause, t, { exposeServerDetail: lang === 'zh' })}
        </p>}
        {editing && <SkillTransferModal selected={skills} onSave={(next) => { if (!busy) void saveMandatory(next) }} onCancel={() => { if (!busy) { setEditing(false); setSaveError(null) } }} />}
      </>}
      <p className={cn(NOTE_CLS, 'mt-2.5')}>{t('workbench.sk_mand_note')}</p>
    </div>
  )
}
