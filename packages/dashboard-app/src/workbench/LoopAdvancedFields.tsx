import { CircleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WbLoopRow } from '../api/client'
import { useT } from '../i18n'
import {
  CADS,
  KILL_DESC_KEYS,
  LpChipRow,
  LpSlider,
  RECO_CAD_IDX,
  RECO_INFLIGHT,
  RECO_RUNS,
  RECO_TOKENS_K,
  cadenceIndex,
  clamp,
} from './LoopControls'
import {
  ERR_BLOCK_TW,
  PROV_ENFORCED_TW,
  ProvBadge,
  WB_TW,
  WbAdvanced,
  type LoopDraft,
} from './loopCardModel'

const LEVELS = ['L1', 'L2', 'L3'] as const

export function LoopAdvancedFields({
  row,
  draft,
  tokensK,
  levelBusy,
  levelError,
  onEdit,
  onLevel,
}: {
  row: WbLoopRow
  draft: LoopDraft
  tokensK: number
  levelBusy: boolean
  levelError: string | null
  onEdit: (patch: Partial<LoopDraft>) => void
  onLevel: (level: (typeof LEVELS)[number]) => void
}): JSX.Element {
  const { t } = useT()
  return (
    <WbAdvanced testid="lp-adv">
      <div className={WB_TW.sec} data-sec="">
        <div className={WB_TW.secH}>{t('workbench.lp_sec_budget')}<span className={WB_TW.hint}>{t('workbench.lp_sec_budget_hint')}</span></div>
        <div className="grid grid-cols-2 items-start gap-x-7 gap-y-2 max-[720px]:grid-cols-1">
          <LpSlider id="lp-sld-cadence" label={t('workbench.lp_sld_cadence')} prov={<ProvBadge field="cadence" />} value={cadenceIndex(draft.cadence)} min={0} max={CADS.length - 1} display={draft.cadence} recoLabel={t('workbench.lp_reco', { v: CADS[RECO_CAD_IDX] ?? '' })} recoFrac={RECO_CAD_IDX / (CADS.length - 1)} onValue={(value) => {
            const cadence = CADS[value]
            if (cadence) onEdit({ cadence })
          }} />
          <LpSlider id="lp-sld-runs" label={t('workbench.lp_sld_runs')} prov={<ProvBadge field="max_runs_per_day" />} value={clamp(draft.max_runs_per_day, 1, 100)} min={1} max={100} display={t('workbench.lp_val_runs', { n: draft.max_runs_per_day })} recoLabel={t('workbench.lp_reco', { v: RECO_RUNS })} recoFrac={(RECO_RUNS - 1) / 99} onValue={(value) => onEdit({ max_runs_per_day: value })} />
          <div>
            <LpSlider id="lp-sld-inflight" label={t('workbench.lp_sld_inflight')} prov={<ProvBadge field="max_in_flight" />} value={clamp(draft.max_in_flight, 1, 4)} min={1} max={4} display={t('workbench.lp_val_inflight', { n: draft.max_in_flight })} recoLabel={t('workbench.lp_reco', { v: RECO_INFLIGHT })} recoFrac="edge" onValue={(value) => onEdit({ max_in_flight: value })} />
            <p className={cn(WB_TW.note, 'mt-1')}>{t('workbench.lp_sld_inflight_note')}</p>
          </div>
          <LpSlider id="lp-sld-tokens" label={t('workbench.lp_sld_tokens')} prov={<ProvBadge field="max_tokens_per_day" />} value={tokensK} min={10} max={500} step={10} display={draft.max_tokens_per_day === null ? t('workbench.lp_tokens_unset') : `${Math.round(draft.max_tokens_per_day / 1000)}k`} recoLabel={t('workbench.lp_reco', { v: `${RECO_TOKENS_K}k` })} recoFrac={(RECO_TOKENS_K - 10) / 490} onValue={(value) => onEdit({ max_tokens_per_day: value * 1000 })} />
        </div>
        <div className={WB_TW.policyRow}>
          <span className={WB_TW.flabel}>{t('workbench.lp_policy')}</span><ProvBadge field="on_exceed" />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('workbench.lp_policy')}>
            {(['skip', 'pause'] as const).map((policy) => (
              <button key={policy} type="button" className={cn('h-7 cursor-pointer rounded-full border px-3 text-[12.5px] font-semibold transition-[border-color,background-color,color,box-shadow] duration-[120ms]', draft.on_exceed === policy ? 'border-(--accent) bg-accent-t text-accent-d shadow-[0_0_0_3px_var(--ring-blue)]' : 'border-border bg-fill text-text-2 hover:border-border-2')} role="radio" aria-checked={draft.on_exceed === policy} data-testid={`lp-exceed-${policy}`} onClick={() => onEdit({ on_exceed: policy })}>
                {t(policy === 'skip' ? 'workbench.lp_policy_skip' : 'workbench.lp_policy_pause')}
              </button>
            ))}
          </div>
          <span className={WB_TW.note}>{t('workbench.lp_policy_note')}</span>
        </div>
      </div>
      <div className={WB_TW.sec} data-sec="">
        <div className={WB_TW.secH}>{t('workbench.lp_sec_auto')}<span className={WB_TW.hint}>{t('workbench.lp_sec_auto_hint')}</span></div>
        <span className={cn(WB_TW.flabel, 'mb-[5px]')}>{t('workbench.lp_level')}</span>
        <div className="mt-0.5 mb-1 grid grid-cols-3 gap-2.5 max-[720px]:grid-cols-1" role="radiogroup" aria-label={t('workbench.lp_level')}>
          {LEVELS.map((level) => {
            const selected = row.autonomy_level === level
            return <button key={level} type="button" className={cn('flex cursor-pointer flex-col gap-0.5 rounded-[11px] border px-3 pt-[11px] pb-3 text-left transition-[border-color,background-color,box-shadow] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60', selected ? 'border-(--accent) bg-accent-t shadow-[0_0_0_3px_var(--ring-blue)]' : 'border-border bg-fill hover:border-border-2')} role="radio" aria-checked={selected} data-testid={`lp-lv-${level}`} disabled={levelBusy} onClick={() => onLevel(level)}>
              <span className={cn('text-[13px] font-[750]', selected && 'text-accent-d')}>{t(`workbench.lp_lv${level.slice(1)}_k`)}</span>
              <span className="text-[11.5px] leading-[1.45] text-text-3">{t(`workbench.lp_lv${level.slice(1)}_d`)}</span>
            </button>
          })}
        </div>
        {levelError && <p className={cn(ERR_BLOCK_TW, 'mt-2')} data-tone="error" data-testid="lp-level-error"><CircleAlert className="mr-1 inline size-3.5" aria-hidden="true" />{levelError}</p>}
        <LpChipRow label={t('workbench.lp_gates')} values={draft.human_gates} addAria={t('workbench.lp_add_gate_aria')} prov={<ProvBadge field="human_gates" />} onChange={(next) => onEdit({ human_gates: next })} />
        <LpChipRow label={t('workbench.lp_kill')} values={draft.kill_criteria} addAria={t('workbench.lp_add_kill_aria')} descKeys={KILL_DESC_KEYS} prov={<ProvBadge field="kill_criteria" />} onChange={(next) => onEdit({ kill_criteria: next })} />
        <LpChipRow label={t('workbench.lp_allow')} values={draft.allowlist} addAria={t('workbench.lp_add_allow_aria')} prov={<span className={PROV_ENFORCED_TW} data-kind="enforced" data-testid="lp-prov-allowlist">{t('workbench.lp_prov_reserved')}</span>} note={<><b>{t('workbench.lp_allow_note_lead')}</b>{t('workbench.lp_allow_note_body')}</>} onChange={(next) => onEdit({ allowlist: next })} />
        <LpChipRow label={t('workbench.lp_deny')} values={draft.denylist} addAria={t('workbench.lp_add_deny_aria')} prov={<ProvBadge field="denylist" />} note={<><b>{t('workbench.lp_deny_note_lead')}</b>{t('workbench.lp_deny_note_body')}</>} onChange={(next) => onEdit({ denylist: next })} />
      </div>
    </WbAdvanced>
  )
}
