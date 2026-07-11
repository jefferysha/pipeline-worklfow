import { useEffect, useState } from 'react'
import { fetchAutomationSettings, postAutomationSettings, type WbAutomationSettings } from '../api/client'
import { useT } from '../i18n'
import { LpSlider } from './LoopCard'

/**
 * AutomationCard（T21）——「AFK 执行」卡：per-root .pipeline/automation.json 的编排面，
 * 跟在 Loop 卡之后。参数作用于本项目全部 AFK 运行：并发沙箱上限（1-8，推荐 4）、失败自动
 * 重试（0-3，推荐 1）、默认入队开关、沙箱镜像（空 = 内置 sandcastle:local）。
 *
 * 交互对齐 LoopCard 的既有拍板：全部参数走「dirty 汇总 → 卡头保存钮」一次 POST
 * /api/automation；保存成功后**再 GET 回读**以 server 归一真值重置草稿（验收「保存后 GET
 * 回读一致」——不信任本地草稿，信落盘真值）。滑杆复用 LoopCard 导出的 LpSlider（lp-slider
 * 样式纪律）。加载失败行内报错不渲染控件（诚实占位，不谎报可配）。
 *
 * 真实起效链路（不是假开关）：写盘 → automation 包 readAutomationJson → sdk.ts createAutomation
 * 装配（maxParallel/maxRetries/defaultOptIn）+ cli afk run 的 dockerRunChange image 同源。
 */

// 推荐值（DEFAULT_CONFIG 同源：maxParallel 4 / maxRetries 1）。
const RECO_PARALLEL = 4
const RECO_RETRIES = 1
const PARALLEL_MIN = 1
const PARALLEL_MAX = 8
const RETRIES_MIN = 0
const RETRIES_MAX = 3

const same = (a: WbAutomationSettings, b: WbAutomationSettings): boolean =>
  a.max_parallel === b.max_parallel && a.max_retries === b.max_retries &&
  a.default_opt_in === b.default_opt_in && a.image === b.image

export interface AutomationCardProps {
  root: string
}

export function AutomationCard({ root }: AutomationCardProps): JSX.Element {
  const { t } = useT()
  // settings = server 已保存真值（GET/保存后回读）；draft = 编辑草稿。
  const [settings, setSettings] = useState<WbAutomationSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<WbAutomationSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  // 换 root：清态重载（上一项目的参数不能在新项目语境下多渲染一拍——useLoops 同款纪律）。
  useEffect(() => {
    let cancelled = false
    setSettings(null)
    setDraft(null)
    setLoadError(null)
    setSaveError(null)
    setSaveOk(false)
    fetchAutomationSettings(root)
      .then((s) => {
        if (cancelled) return
        setSettings(s)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(t('workbench.afk_load_error', { msg: err instanceof Error ? err.message : t('workbench.lp_network_error') }))
      })
    return () => {
      cancelled = true
    }
  }, [root, t])

  // settings 对象换新（首载/保存后回读）→ 草稿以 server 真值重置（LoopCard 同款托管）。
  useEffect(() => {
    setDraft(settings ? { ...settings } : null)
  }, [settings])

  const dirty = draft !== null && settings !== null && !same(draft, settings)

  function edit(part: Partial<WbAutomationSettings>): void {
    setDraft((prev) => (prev ? { ...prev, ...part } : prev))
    setSaveOk(false)
  }

  async function save(): Promise<void> {
    if (!draft || !dirty || saving) return
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      await postAutomationSettings({ root, ...draft, image: draft.image.trim() })
      // 保存后 GET 回读：以真落盘值为准重置 settings（草稿随上方 effect 归位）。
      const fresh = await fetchAutomationSettings(root)
      setSettings(fresh)
      setSaveOk(true)
    } catch (err) {
      // server 的值域拒绝原文展示（不翻译不吞并——LoopCard saveErrors 同款）
      setSaveError(err instanceof Error ? err.message : t('workbench.lp_network_error'))
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <section className="card wb-loop" data-testid="wb-afk-card">
        <div className="wb-editor-head lp-head"><b>{t('workbench.afk_title')}</b></div>
        <p className="view__note view__note--error" data-testid="afk-load-error">{loadError}</p>
      </section>
    )
  }
  if (!draft) {
    return (
      <section className="card wb-loop" data-testid="wb-afk-card">
        <div className="wb-editor-head lp-head"><b>{t('workbench.afk_title')}</b></div>
        <p className="view__note">{t('common.loading')}</p>
      </section>
    )
  }

  return (
    <section className="card wb-loop" data-testid="wb-afk-card">
      <div className="wb-editor-head lp-head">
        <b>{t('workbench.afk_title')}</b>
        <span className="wb-spacer" />
        {dirty && <span className="wb-status wb-status--dirty" data-testid="afk-dirty">{t('workbench.afk_dirty')}</span>}
        {saveOk && !dirty && <span className="wb-status wb-status--ok" data-testid="afk-save-ok">{t('workbench.afk_save_ok')}</span>}
        <button className="btn" data-testid="afk-save" onClick={() => void save()} disabled={!dirty || saving}>
          {t('workbench.afk_save')}
        </button>
        <span className="lp-head-sub">{t('workbench.afk_head_sub')}</span>
      </div>

      {saveError && (
        <ul className="wb-save-errors lp-errors" data-testid="afk-save-error">
          <li>{saveError}</li>
        </ul>
      )}

      <div className="wb-ed-sec">
        <div className="wb-ed-sec-h">
          {t('workbench.afk_sec')}
          <span className="hint">{t('workbench.afk_sec_hint')}</span>
        </div>
        <div className="lp-slds">
          <div>
            <LpSlider
              id="afk-sld-parallel"
              label={t('workbench.afk_sld_parallel')}
              value={draft.max_parallel}
              min={PARALLEL_MIN}
              max={PARALLEL_MAX}
              display={t('workbench.afk_val_parallel', { n: draft.max_parallel })}
              recoLabel={t('workbench.lp_reco', { v: RECO_PARALLEL })}
              recoFrac={(RECO_PARALLEL - PARALLEL_MIN) / (PARALLEL_MAX - PARALLEL_MIN)}
              onValue={(v) => edit({ max_parallel: v })}
            />
            {/* 验收反馈②-④：讲清楚这是「整机」上限，不是单 change 的配额 */}
            <p className="wb-note lp-sld-note">{t('workbench.afk_sld_parallel_note')}</p>
          </div>
          <LpSlider
            id="afk-sld-retries"
            label={t('workbench.afk_sld_retries')}
            value={draft.max_retries}
            min={RETRIES_MIN}
            max={RETRIES_MAX}
            display={t('workbench.afk_val_retries', { n: draft.max_retries })}
            recoLabel={t('workbench.lp_reco', { v: RECO_RETRIES })}
            recoFrac={(RECO_RETRIES - RETRIES_MIN) / (RETRIES_MAX - RETRIES_MIN)}
            onValue={(v) => edit({ max_retries: v })}
          />
        </div>

        <div className="lp-policy">
          <span className="wb-flabel">{t('workbench.afk_opt_in')}</span>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={draft.default_opt_in}
            aria-label={t('workbench.afk_opt_in')}
            data-testid="afk-opt-in"
            onClick={() => edit({ default_opt_in: !draft.default_opt_in })}
          />
          <span className="wb-note">{t('workbench.afk_opt_in_note')}</span>
        </div>

        <div className="lp-policy">
          <label className="wb-flabel" htmlFor="afk-image">{t('workbench.afk_image')}</label>
          <input
            className="wb-input lp-mono"
            id="afk-image"
            data-testid="afk-image"
            placeholder="sandcastle:local"
            value={draft.image}
            onChange={(e) => edit({ image: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault() // Enter 守卫：保存只走卡头保存钮（LoopCard 纪律）
            }}
          />
          <span className="wb-note">{t('workbench.afk_image_note')}</span>
        </div>
      </div>
    </section>
  )
}
