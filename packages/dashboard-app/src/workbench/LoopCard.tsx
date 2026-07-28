import { useEffect, useState } from 'react'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { postLoopLevel, postLoopUpdate } from '../api/client'
import { useT } from '../i18n'
import { Dialog } from '../shared/Dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
export { LOOP_RUNNERS, WB_TW, WbAdvanced } from './loopCardModel'
export { LpSlider } from './LoopControls'
export { useLoops, type LoopsState } from './useLoops'
import { BADGE_TW, CHIP_TW, LOOP_RUNNERS, ProvBadge, WB_TW, computePatch, draftOf, type LoopDraft } from './loopCardModel'
import { RECO_TOKENS_K, clamp } from './LoopControls'
import type { LoopsState } from './useLoops'
import { LoopAdvancedFields } from './LoopAdvancedFields'
import { LoopCardActions } from './LoopCardActions'
const LEVELS = ['L1', 'L2', 'L3'] as const
export interface LoopCardProps {
  root: string
  loops: LoopsState
}
export function LoopCard({ root, loops }: LoopCardProps): JSX.Element {
  const { t } = useT()
  const row = loops.selected
  const [draft, setDraft] = useState<LoopDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<string[] | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [levelError, setLevelError] = useState<string | null>(null)
  const [levelBusy, setLevelBusy] = useState(false)
  const [confirmLevel, setConfirmLevel] = useState<(typeof LEVELS)[number] | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [promptCopied, setPromptCopied] = useState(false)
  const [showMatches, setShowMatches] = useState(false)
  useEffect(() => {
    setDraft(row ? draftOf(row) : null)
    setSaveErrors(null)
    setLevelError(null)
    setReviewError(null)
  }, [row])
  const base = row ? draftOf(row) : null
  const patch = draft && base ? computePatch(draft, base) : {}
  const dirty = Object.keys(patch).length > 0
  function edit(part: Partial<LoopDraft>): void {
    setDraft((prev) => (prev ? { ...prev, ...part } : prev))
    setSaveOk(false)
  }
  async function save(): Promise<void> {
    if (!row || !dirty || saving) return
    setSaving(true)
    setSaveErrors(null)
    setSaveOk(false)
    try {
      await postLoopUpdate({ root, id: row.id, patch })
      setSaveOk(true)
      loops.reload() // 新行到达后草稿以 server 真值重置（见上方 effect）
    } catch (err) {
      setSaveErrors([(err instanceof Error ? err.message : t('workbench.lp_network_error'))])
    } finally {
      setSaving(false)
    }
  }
  function requestLevel(target: (typeof LEVELS)[number]): void {
    if (!row || levelBusy || target === row.autonomy_level) return
    if (LEVELS.indexOf(target) > LEVELS.indexOf(row.autonomy_level)) {
      setConfirmLevel(target)
    } else {
      void applyLevel(target)
    }
  }
  async function applyLevel(target: string): Promise<void> {
    if (!row) return
    setLevelBusy(true)
    setLevelError(null)
    try {
      await postLoopLevel({ root, id: row.id, target })
      loops.reload()
    } catch (err) {
      setLevelError(t('workbench.lp_level_fail', { msg: err instanceof Error ? err.message : t('workbench.lp_network_error') }))
    } finally {
      setLevelBusy(false)
    }
  }
  async function reviewAction(status: 'active' | 'paused'): Promise<void> {
    if (!row || reviewBusy) return
    setReviewBusy(true)
    setReviewError(null)
    try {
      await postLoopUpdate({ root, id: row.id, patch: { status } })
      loops.reload() // 显式重拉：draft 标记已被 server 清，新快照到达即徽章消失
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : t('workbench.lp_network_error'))
    } finally {
      setReviewBusy(false)
    }
  }
  if (loops.loadError) {
    return (
      <section className={WB_TW.card} data-testid="wb-loop-card">
        <div className={WB_TW.head}><b className={WB_TW.headB}>{t('workbench.lp_title')}</b></div>
        <p className={WB_TW.loadError} data-tone="error" data-testid="lp-load-error" role="alert">{loops.loadError}</p>
      </section>
    )
  }
  if (loops.rows === null) {
    return (
      <section className={WB_TW.card} data-testid="wb-loop-card">
        <div className={WB_TW.head}><b className={WB_TW.headB}>{t('workbench.lp_title')}</b></div>
        <p className={WB_TW.loading} role="status" aria-live="polite">{t('common.loading')}</p>
      </section>
    )
  }
  if (!row || !draft) {
    const prompt = t('workbench.lp_empty_prompt')
    return (
      <section className={WB_TW.card} data-testid="wb-loop-card">
        <div className={WB_TW.head}><b className={WB_TW.headB}>{t('workbench.lp_title')}</b></div>
        <div className="pt-2.5 pb-1" data-testid="lp-empty" role="status" aria-live="polite">
          <p className="mb-1 text-[13px] font-bold">{t('workbench.lp_empty_title')}</p>
          <p className={WB_TW.note}>{t('workbench.lp_empty_go')}</p>
          <div className="my-3 rounded-md border border-dashed border-border-2 bg-fill px-3.5 py-3" data-testid="lp-empty-prompt">
            <p className="mb-2.5 text-[12.5px] leading-[1.65] text-text-2">{prompt}</p>
            <Button
              variant="ghost"
              size="sm"
              className={cn(WB_TW.btnGhost, 'h-7 px-3 text-xs')}
              data-testid="lp-empty-copy"
              aria-label={t('workbench.lp_empty_copy_aria')}
              onClick={() => {
                void navigator.clipboard?.writeText(prompt).then(() => setPromptCopied(true))
              }}
            >
              {promptCopied ? t('workbench.lp_empty_copied') : t('workbench.lp_empty_copy')}
            </Button>
            {promptCopied && <span className="sr-only" role="status" aria-live="polite">{t('workbench.lp_empty_copied')}</span>}
          </div>
          <p className={cn(WB_TW.note, 'mt-2')}>{t('workbench.lp_empty_note')}</p>
        </div>
      </section>
    )
  }
  const active = draft.status === 'active'
  const isPendingReview = row.draft === true
  const tokensK = draft.max_tokens_per_day === null ? RECO_TOKENS_K : clamp(Math.round(draft.max_tokens_per_day / 10000) * 10, 10, 500)
  return (
    <section className={WB_TW.card} data-testid="wb-loop-card">
      <div className={WB_TW.head}>
        <b className={WB_TW.headB}>{t('workbench.lp_title')}</b>
        <Switch
          className={WB_TW.switch}
          checked={active}
          aria-label={t('workbench.lp_enable')}
          data-testid="lp-enable"
          onCheckedChange={() => edit({ status: active ? 'paused' : 'active' })}
        />
        <span
          className={cn(BADGE_TW, active ? 'bg-transparent pl-0 text-green-d' : 'bg-fill text-text-3')}
          data-state={active ? 'run' : 'paused'}
          data-testid="lp-pill"
        >
          {t(active ? 'workbench.lp_running' : 'workbench.lp_paused')}
        </span>
        <ProvBadge field="status" />
        {/* loop-init L5：草稿待审阅徽章——蓝底 color-mix 从 --accent 派生（决议 #9）；testid 走
            lp-draft-* 审阅语义，与既有编辑态无关。 */}
        {isPendingReview && (
          <span
            className={cn(BADGE_TW, 'bg-[color-mix(in_srgb,var(--accent)_14%,var(--card))] text-accent-d')}
            data-testid="lp-draft-badge"
          >
            {t('workbench.lp_draft_badge')}
          </span>
        )}
        {loops.rows.length > 1 && (
          <select
            className={cn(WB_TW.input, 'h-[26px] w-auto px-2 font-mono text-xs')}
            aria-label={t('workbench.lp_loop_select')}
            data-testid="lp-loop-select"
            value={row.id}
            disabled={dirty}
            title={dirty ? t('workbench.lp_select_dirty') : undefined}
            onChange={(e) => loops.select(e.target.value)}
          >
            {loops.rows.map((r) => (
              <option key={r.id} value={r.id}>{r.id}</option>
            ))}
          </select>
        )}
        <span className="flex-1" />
        {dirty && <span className={WB_TW.statusDirty} data-state="dirty" data-testid="lp-dirty" role="status" aria-live="polite">{t('workbench.lp_dirty')}</span>}
        {saveOk && !dirty && <span className={WB_TW.statusOk} data-state="ok" data-testid="lp-save-ok" role="status" aria-live="polite">{t('workbench.lp_save_ok')}</span>}
        <Button size="sm" className={WB_TW.btnSolid} data-testid="lp-save" onClick={() => void save()} disabled={!dirty || saving}>
          {t('workbench.lp_save')}
        </Button>
        <span className={WB_TW.headSub}>{t('workbench.lp_head_sub')}</span>
      </div>
      {saveErrors && (
        <ul className={WB_TW.saveErrors} data-testid="lp-save-errors" role="alert">
          {saveErrors.map((e) => (
            <li key={e} className={WB_TW.saveErrorsLi}>{e}</li>
          ))}
        </ul>
      )}
      {/* ── T7（A2 决策）：三方关系条——loop 是 root 级配置，不属于任何单个 workflow；
          change_prefix → 实际匹配的 changes（弹层，读 row 真值，不随草稿输入重算——保存前
          修改草稿不影响本条显示，保存并 reload 后才随新真值刷新）；phases → 阶段 chips 纯
          展示无点击语义。决议 #3 裁减口径：这是「数据关系澄清」，不是健康度评分——不画环、
          不给成功率角标。布局沿旧 .lp-policy 的 flex-wrap 分组纪律。 ── */}
      <div className={WB_TW.sec} data-sec="">
        <div className={WB_TW.secH}>
          {t('workbench.lp_rel_sec')}
          <span className={WB_TW.hint}>{t('workbench.lp_rel_sec_hint')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5" data-testid="lp-rel">
          <span
            className="max-w-[280px] overflow-hidden rounded-[7px] bg-fill-2 px-[9px] py-1 font-mono text-xs font-bold text-ellipsis whitespace-nowrap"
            data-testid="lp-rel-root"
            title={row.root}
          >
            {row.root}
          </span>
          <span className="text-[11.5px] text-text-3">{t('workbench.lp_rel_root_note')}</span>
          <ArrowRight className="size-3.5 flex-none text-text-3" strokeWidth={1.75} aria-hidden="true" />
          <button
            type="button"
            className="h-[26px] cursor-pointer rounded-full border border-border bg-fill px-2.5 font-mono text-xs text-text-2 transition-colors duration-[120ms] hover:border-(--accent) hover:bg-accent-t hover:text-accent-d"
            data-testid="lp-rel-prefix-btn"
            onClick={() => setShowMatches(true)}
          >
            {t('workbench.lp_rel_match_btn', {
              prefix: row.change_prefix ?? t('workbench.lp_rel_prefix_unset'),
              n: row.matched_changes.length,
            })}
          </button>
          <span className="text-border-2" aria-hidden="true">·</span>
          <span className="text-xs font-semibold text-text-3">{t('workbench.lp_rel_phases_label')}</span>
          {row.phases.length === 0 ? (
            <span className={WB_TW.note} role="status" aria-live="polite">{t('workbench.lp_rel_phases_empty')}</span>
          ) : (
            row.phases.map((p) => (
              <span key={p} className={CHIP_TW} data-testid="lp-rel-phase-chip">{p}</span>
            ))
          )}
          <p className={cn(WB_TW.note, 'mt-1 basis-full')}>{t('workbench.lp_rel_note')}</p>
        </div>
      </div>
      {showMatches && (
        <Dialog
          title={t('workbench.lp_rel_dialog_title', { prefix: row.change_prefix ?? t('workbench.lp_rel_prefix_unset') })}
          onClose={() => setShowMatches(false)}
          testid="lp-rel-dialog"
          actions={
            <Button variant="ghost" size="sm" className={WB_TW.btnGhost} onClick={() => setShowMatches(false)}>
              {t('workbench.lp_rel_dialog_close')}
            </Button>
          }
        >
          {row.matched_changes.length === 0 ? (
            <p className="mb-4 text-[12.5px] leading-[1.6] text-text-2" role="status" aria-live="polite">{t('workbench.lp_rel_dialog_empty')}</p>
          ) : (
            <ul className="flex max-h-80 list-none flex-col gap-1.5 overflow-y-auto p-0 text-[12.5px]" data-testid="lp-rel-dialog-list">
              {row.matched_changes.map((c) => (
                <li key={c} className="font-mono">{c}</li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
      {/* ── 目标 ── */}
      <div className={WB_TW.sec} data-sec="">
        <div className={WB_TW.secH}>
          {t('workbench.lp_sec_goal')}
          <span className={WB_TW.hint}>{t('workbench.lp_sec_goal_hint')}</span>
        </div>
        <div className="mb-[5px] flex items-center gap-2">
          <label className={WB_TW.flabel} htmlFor="lp-goal">{t('workbench.lp_goal')}</label>
          <ProvBadge field="goal" />
        </div>
        <input
          className={WB_TW.input}
          id="lp-goal"
          data-testid="lp-goal"
          value={draft.goal}
          onChange={(e) => edit({ goal: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault() // Enter 守卫：保存只走卡头保存钮
          }}
        />
        <div className="mt-3 grid grid-cols-3 gap-3.5 mobile:grid-cols-1">
          <div>
            <div className="mb-[5px] flex items-center gap-2">
              <label className={WB_TW.flabel} htmlFor="lp-doc">{t('workbench.lp_doc')}</label>
              <ProvBadge field="design_doc" />
            </div>
            <input
              className={cn(WB_TW.input, 'font-mono')}
              id="lp-doc"
              data-testid="lp-doc"
              value={draft.design_doc}
              onChange={(e) => edit({ design_doc: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
          </div>
          <div>
            <div className="mb-[5px] flex items-center gap-2">
              <label className={WB_TW.flabel} htmlFor="lp-prefix">{t('workbench.lp_prefix')}</label>
              <ProvBadge field="change_prefix" />
            </div>
            <input
              className={cn(WB_TW.input, 'font-mono')}
              id="lp-prefix"
              data-testid="lp-prefix"
              value={draft.change_prefix}
              onChange={(e) => edit({ change_prefix: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
            <p className="mt-[5px] text-[11.5px] text-text-3">
              {t('workbench.lp_prefix_eg')}
              <b className="font-mono font-semibold text-text-2" data-testid="lp-prefix-eg">{`${draft.change_prefix}0142-migrate-card`}</b>
            </p>
          </div>
          <div>
            <div className="mb-[5px] flex items-center gap-2">
              <label className={WB_TW.flabel} htmlFor="lp-risk">{t('workbench.lp_risk')}</label>
              <ProvBadge field="risk" />
            </div>
            <select className={WB_TW.input} id="lp-risk" data-testid="lp-risk" value={draft.risk} onChange={(e) => edit({ risk: e.target.value })}>
              <option value="low">{t('workbench.lp_risk_low')}</option>
              <option value="medium">{t('workbench.lp_risk_medium')}</option>
              <option value="high">{t('workbench.lp_risk_high')}</option>
            </select>
          </div>
          {/* T17 决议#14：runner 下拉（LOOP_RUNNERS 双选项）——数据面 T20 已交付
              （PATCHABLE_SCALAR_FIELDS 含 runner），写回走同一 dirty→保存钮 patch 链路。
              runner id 是代码标识符（mono 呈现，不翻译）；历史自由字符串真值补渲染为第三选项。 */}
          <div>
            <div className="mb-[5px] flex items-center gap-2">
              <label className={WB_TW.flabel} htmlFor="lp-runner">{t('workbench.lp_runner')}</label>
              <ProvBadge field="runner" />
            </div>
            <select
              className={cn(WB_TW.input, 'font-mono')}
              id="lp-runner"
              data-testid="lp-runner"
              value={draft.runner}
              onChange={(e) => edit({ runner: e.target.value })}
            >
              {!(LOOP_RUNNERS as readonly string[]).includes(draft.runner) && (
                <option value={draft.runner}>{draft.runner}</option>
              )}
              {LOOP_RUNNERS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {/* 观察项②（决议#14① backlog）：非标准 runner 值软校验警告——纯提示，不拦截保存/
                不改值/不清第三选项。文案按 runnerFor.ts 真实归属语义（仅 'codex' 起 codex exec，
                其余一律走 claude-code 缺省路径）：它仍会执行，不谎称「不会执行」。警示色
                color-mix 从既有 --red/--text-2 派生（决议#9，禁新原色）。 */}
            {!(LOOP_RUNNERS as readonly string[]).includes(draft.runner) && (
              <p className="mt-[5px] flex items-start gap-1.5 text-xs leading-[1.55] text-[color-mix(in_srgb,var(--red)_68%,var(--text-2))]" data-testid="lp-runner-warn">
                <TriangleAlert className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
                {t('workbench.lp_runner_warn', { runner: draft.runner })}
              </p>
            )}
          </div>
        </div>
      </div>
      <LoopAdvancedFields
        row={row}
        draft={draft}
        tokensK={tokensK}
        levelBusy={levelBusy}
        levelError={levelError}
        onEdit={edit}
        onLevel={requestLevel}
      />
      <LoopCardActions
        row={row}
        pendingReview={isPendingReview}
        reviewBusy={reviewBusy}
        reviewError={reviewError}
        confirmLevel={confirmLevel}
        onReview={(status) => void reviewAction(status)}
        onClosePromotion={() => setConfirmLevel(null)}
        onConfirmPromotion={(target) => {
          setConfirmLevel(null)
          void applyLevel(target)
        }}
      />
    </section>
  )
}
