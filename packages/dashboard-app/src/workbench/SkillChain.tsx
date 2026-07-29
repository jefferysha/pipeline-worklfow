import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ApiError, fetchSkillsRegistry, type WbSkillEntry } from '../api/client'
import { formatApiError } from '../api/transport'
import { useT } from '../i18n'
import { DefaultSkillChain } from './DefaultSkillChain'
import type { WbSkillRef, WbStepDef } from './WorkbenchView'
import { readErrorDetail } from './workbenchApiDecoders'
import './workbench.css'

gsap.registerPlugin(useGSAP)

/**
 * SkillChain（T14，计划 2026-07-11-v5-interaction-rebuild）—— StepEditor 技能区，
 * 挂在「基本」与「产出物」两区之间。交互真相源 design-demos/v5-progress-workbench.html
 * 的 wb-chain / wb-skpanel / wb-tracks 区块。两种模式按 workflow 名分岔：
 *
 * · 自定义 workflow：step.skills 的依赖链可视化（chip ➝ chip 拓扑序、无依赖并列独立行）
 *   + 「+ 添加」面板（候选来自 GET /api/skills/registry，可选「依赖于」下拉列当前 step
 *   已有 skills）+ 移除级联（清掉引用被删技能的 depends_on）。所有编辑经 onChange 交回
 *   WorkbenchView 的 def 草稿（T13 唯一真相源），最终走 POST /api/workflows/:name 真写
 *   回 yaml——循环依赖/未知技能由 kernel validate 在保存时拒绝并原文上抛（T13 已接线，
 *   见 WorkbenchView.readSaveErrors），本组件不自造 DAG 校验逻辑（skillDag.ts 纪律）。
 *
 * · default workflow（决议 #6 穿梭框能力迁移）：运行时 matrix-enabled 轨道 tab × 当前
 *   阶段的 manifest 强制技能（数据 GET /api/config，探测逻辑自 旧设置视图 直接迁移：
 *   探测成功 = 可编辑，编辑经 SkillTransferModal 穿梭框 + POST /api/config/mandatory-skills
 *   真写 templates/manifest.yaml；探测不到（旧 server / 网络失败）= 明确不可用，不拿静态
 *   三轨或技能镜像冒充项目 registry。in-flight 保存守卫（savingKeyRef）
 *   同样自 旧设置视图 迁移——同 cell 在途保存时重复保存/取消整体 no-op。
 *   注意：default 模式忽略 readonly prop——workflow 定义只读（server 400 已挡）不等于
 *   manifest 强制技能矩阵只读，两者是不同的数据面。
 *
 * 链可视化算法沿 demo chainsHTML：单线 walk（每节点取第一个未用后继），多依赖节点只在首链
 * 出现一次；悬空依赖（指向 step 外/未参与首链）以幽灵 chip 呈现在链头。这只是展示投影——
 * 解锁判定的唯一权威在 kernel skillDag.ts::isSkillUnlocked，前端不复刻其语义。
 *
 * 技能链展示契约：链 chips → 编号节点（紫圆 mono 序号）+
 * 紫色流动虚线连接件 + GSAP 逐节点弹入/连线生长；
 * 依赖链语义、添加面板、default 轨道 tab 全部不动，纯展示升级；reduced-motion 直显。
 */

import { ACTIONS_CLS, ADDCHIP_CLS, CHIP_BADGE_CLS, CHIP_CLS, CHAIN_CLS, CHAIN_K_CLS, EMPTY_CLS, ERR_CLS, HINT_CLS, NOTE_CLS, SEC_H_CLS, SKILL_ID_RE, buildChains, skConn } from './skillChainModel'
export { invalidateMandatoryConfig } from './mandatorySkills'

export interface SkillChainProps {
  step: WbStepDef
  /** 项目根必须由宿主显式传入；default config/cache/write 全部以它隔离。 */
  root: string
  /** 显式能力模式；不从 workflow 名称反推可编辑的数据面。 */
  mode?: 'step-dag' | 'manifest-matrix'
  /** 自定义 workflow 只读镜像：隐藏移除 × 与添加面板（default 模式忽略此项，见头注释）。 */
  readonly?: boolean
  onChange: (updated: WbStepDef) => void
}

export function SkillChain({ step, root, mode = 'step-dag', readonly = false, onChange }: SkillChainProps): JSX.Element {
  const { t, lang } = useT()
  const isDefault = mode === 'manifest-matrix'

  // ── 自定义模式：添加面板态 ──
  const [panelOpen, setPanelOpen] = useState(false)
  const [registry, setRegistry] = useState<WbSkillEntry[] | null>(null)
  const [regError, setRegError] = useState<unknown | null>(null)
  const [candidate, setCandidate] = useState<string | null>(null)
  const [dep, setDep] = useState('')


  // ── 依赖链动态入场——编号节点短距离上浮，连线由左向右出现。
  //    纯展示升级：依赖链语义/添加面板/default 轨道 tab 零改动。useGSAP+matchMedia 全包，
  //    reduced 直显（不放 from 动画,CSS 侧连接件 ::before 流动虚线由 motion-reduce: 变体停帧）。
  //    hook 必须在 isDefault 分岔 return 之前调用（React hooks 纪律）；default 模式 ref 不挂,
  //    内部空 guard 自然跳过。依赖 = 链指纹（skills id 序）,链变(增删/换阶段重挂)才重播。──
  const chainsRef = useRef<HTMLDivElement>(null)
  const chainKey = step.skills.map((s) => s.id).join(',')
  useGSAP(
    () => {
      const el = chainsRef.current
      if (!el || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          if ((ctx.conditions as { reduce?: boolean } | undefined)?.reduce) return
          const nodes = el.querySelectorAll('[data-anim="skc"]')
          if (nodes.length > 0) {
            gsap.from(nodes, { autoAlpha: 0, y: 6, duration: 0.22, stagger: 0.05, ease: 'power2.out', clearProps: 'all' })
          }
          const conns = el.querySelectorAll('[data-anim="skconn"]')
          if (conns.length > 0) {
            gsap.from(conns, { scaleX: 0, transformOrigin: 'left center', duration: 0.24, stagger: 0.07, delay: 0.1, ease: 'power2.out', clearProps: 'transform' })
          }
        },
      )
    },
    { scope: chainsRef, dependencies: [chainKey], revertOnUpdate: true },
  )


  // ── 自定义模式动作 ──

  // v6 T10：registry 挂载即拉(两种模式都要)——已选 chip 的未安装 badge 与 default 黄条都
  // 需要 installed 信息,不能等「+ 添加」面板打开才知道。失败 fail-soft:regError 行内提示,
  // badge/黄条按「不可判」整体不显示(保守,不谎报)。
  useEffect(() => {
    if (registry !== null || regError !== null) return
    let cancelled = false
    fetchSkillsRegistry()
      .then(async (r) => {
        if (!r.ok) {
          const detail = await readErrorDetail(r)
          throw new ApiError(
            detail || `skill registry request failed (${r.status})`,
            r.status,
            detail !== '',
          )
        }
        try {
          return await r.json() as { skills: WbSkillEntry[] }
        } catch {
          throw new ApiError('skill registry response is invalid', r.status)
        }
      })
      .then((body) => {
        if (!cancelled) setRegistry(body.skills)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRegError(err)
        }
      })
    return () => {
      cancelled = true
    }
  }, [registry, regError])

  function togglePanel(): void {
    setPanelOpen((v) => !v)
  }

  // v6 T10：name → SkillEntry 查询面(badge/黄条共用);registry 未就绪 → 空表 = 全部「不可判」。
  const installedMap = new Map((registry ?? []).map((e) => [e.name, e]))

  /** 未安装 badge(标注型提示):有 installCmd → 可点复制;无(user 类)→ 纯提示 title。 */
  const uninstBadge = (id: string): JSX.Element | null => {
    const entry = installedMap.get(id)
    if (!entry || entry.installed) return null
    const cmd = entry.installCmd
    const title = cmd ?? t('workbench.sk_uninstalled_hint_user')
    return cmd ? (
      <button
        type="button"
        className={cn(CHIP_BADGE_CLS, 'cursor-pointer')}
        data-testid={`wb-sk-uninst-${id}`}
        title={title}
        onClick={() => void navigator.clipboard?.writeText(cmd)}
      >
        {t('workbench.sk_uninstalled')}
      </button>
    ) : (
      <span className={CHIP_BADGE_CLS} data-testid={`wb-sk-uninst-${id}`} title={title}>
        {t('workbench.sk_uninstalled')}
      </span>
    )
  }

  function removeSkill(id: string): void {
    onChange({
      ...step,
      skills: step.skills
        .filter((s) => s.id !== id)
        .map((s) => {
          // 级联：清掉指向被删技能的 depends_on（验收④）；清空后落为无键，serialize 不写空数组行。
          if (!s.depends_on?.includes(id)) return s
          const rest = s.depends_on.filter((d) => d !== id)
          if (rest.length === 0) {
            const { depends_on: _dropped, ...bare } = s
            return bare
          }
          return { ...s, depends_on: rest }
        }),
    })
  }

  function confirmAdd(): void {
    if (!candidate) return
    const ref: WbSkillRef = dep ? { id: candidate, depends_on: [dep] } : { id: candidate }
    onChange({ ...step, skills: [...step.skills, ref] })
    setPanelOpen(false)
    setCandidate(null)
    setDep('')
  }

  if (isDefault) return <DefaultSkillChain step={step} root={root} registry={registry} />

  // ── 自定义模式渲染 ──
  const { chains, solos } = buildChains(step.skills)
  const have = new Set(step.skills.map((s) => s.id))
  const candidates = (registry ?? []).map((e) => e.name).filter((id) => !have.has(id))

  // v8-E：链上 chip 升级为「编号节点」（紫圆 mono 序号 = 链内执行序,demo .skc/.skn 对位）；
  // seq 缺省（无依赖独立行/幽灵 chip）不编号——solo 无序语义不变,只有链才有「第几步」。
  // 链节点态 data-anim="skc"（GSAP 入场锚点）、序号 data-skn（测试锚点）、未安装 data-uninstalled。
  const chip = (id: string, seq?: number): JSX.Element => (
    <span
      key={id}
      data-chip=""
      data-anim={seq !== undefined ? 'skc' : undefined}
      data-uninstalled={installedMap.get(id)?.installed === false ? '' : undefined}
      className={cn(CHIP_CLS, seq !== undefined && 'border-purple-b bg-purple-t text-purple-d')}
      title={id}
    >
      {seq !== undefined && (
        <i
          data-skn=""
          aria-hidden="true"
          className="mr-[5px] inline-grid size-[15px] flex-none place-items-center rounded-full bg-purple font-mono text-[10px] font-bold not-italic text-solid-fg"
        >
          {seq}
        </i>
      )}
      {id}
      {uninstBadge(id)}
      {!readonly && (
        <button
          type="button"
          className="-mr-[3px] inline-grid size-4 cursor-pointer place-items-center rounded-[5px] p-0 text-[13px] leading-none text-text-3 transition-colors hover:bg-red-t hover:text-red-d"
          aria-label={t('workbench.sk_remove', { id })}
          onClick={() => removeSkill(id)}
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      )}
    </span>
  )

  return (
    // wb-ed-sec 保留为语义骨架类（StepEditor/wb8-pane 的相邻分隔上下文仍以它为锚，样式已原子化）。
    <div className="wb-ed-sec pt-3.5 pb-1" data-testid="wb-sk-sec">
      <div className={SEC_H_CLS}>
        {t('workbench.sk_sec')}
        <span className={HINT_CLS}>{t('workbench.sk_hint_custom')}</span>
      </div>
      {/* v8-E：链行动态化——文本箭头 ➝ 全部换成紫流动虚线连接件（skConn,与阶段连线同一
          签名语言）；入场动画挂 chainsRef（见上方 useGSAP）。链投影算法/DOM 语义序零改动。 */}
      <div data-testid="wb-sk-chains" ref={chainsRef} className="divide-y divide-dashed divide-border">
        {step.skills.length === 0 && (
          <div className={CHAIN_CLS}>
            <span className={EMPTY_CLS} role="status" aria-live="polite">{t('workbench.sk_empty_custom')}</span>
          </div>
        )}
        {chains.map((c) => (
          <div key={c.ids[0]} className={CHAIN_CLS} data-testid="wb-sk-chain">
            <span className={CHAIN_K_CLS}>{t('workbench.sk_chain_k')}</span>
            {c.ghost && (
              <>
                <span data-chip="" data-ghost="" className={cn(CHIP_CLS, 'border-dashed opacity-55')}>{c.ghost}</span>
                {skConn}
              </>
            )}
            {c.ids.map((id, i) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                {i > 0 && skConn}
                {chip(id, i + 1)}
              </span>
            ))}
          </div>
        ))}
        {solos.length > 0 && (
          <div className={CHAIN_CLS} data-testid="wb-sk-solo">
            <span className={CHAIN_K_CLS}>{t('workbench.sk_solo_k')}</span>
            {/* 不用 solos.map(chip)：map 会把 index 灌进 seq 形参,solo 无序不编号。 */}
            {solos.map((id) => chip(id))}
          </div>
        )}
      </div>
      {!readonly && (
        <div className={ACTIONS_CLS}>
          {/* aria-label 与产出物区的「+ 添加」区分开——同卡两个裸名 '+ 添加' 对读屏是歧义。 */}
          <button
            type="button"
            className={ADDCHIP_CLS}
            data-testid="wb-sk-add"
            aria-label={t('workbench.sk_add_aria')}
            aria-expanded={panelOpen}
            onClick={togglePanel}
          >
            {t('workbench.sk_add')}
          </button>
        </div>
      )}
      {!readonly && panelOpen && (
        <div className="mt-2.5 rounded-lg border border-border bg-card p-3 shadow-md" data-testid="wb-sk-panel">
          <div className="mb-[9px] text-[12.5px] font-bold">
            {t('workbench.sk_panel_title')}
            <span className={cn(HINT_CLS, 'ml-1.5')}>{t('workbench.sk_panel_hint')}</span>
          </div>
          <div className="mb-[11px] flex flex-wrap gap-1.5">
            {regError !== null && <span className={ERR_CLS} role="alert">{t('workbench.sk_registry_error', { msg: formatApiError(regError, t, { exposeServerDetail: lang === 'zh' }) })}</span>}
            {!regError && registry === null && <span className={EMPTY_CLS} role="status" aria-live="polite">{t('common.loading')}</span>}
            {!regError && registry !== null && candidates.length === 0 && (
              <span className={EMPTY_CLS} role="status" aria-live="polite">{t('workbench.sk_panel_empty')}</span>
            )}
            {/* 候选选中态用 aria-pressed 承载（原 .on 类）、未安装用 data-uninstalled（原修饰符类）。 */}
            {candidates.map((id) => {
              const legal = SKILL_ID_RE.test(id)
              const uninst = installedMap.get(id)?.installed === false
              return (
                <button
                  key={id}
                  type="button"
                  className="h-[26px] cursor-pointer rounded-md border border-border bg-fill px-2.5 font-mono text-xs text-text-2 transition not-aria-pressed:hover:border-border-2 aria-pressed:border-(--accent) aria-pressed:bg-accent-t aria-pressed:text-accent-d aria-pressed:shadow-[0_0_0_3px_var(--ring-blue)] disabled:cursor-not-allowed disabled:opacity-50 data-uninstalled:opacity-62"
                  aria-pressed={id === candidate}
                  data-uninstalled={uninst ? '' : undefined}
                  data-testid={`wb-sk-opt-${id}`}
                  disabled={!legal}
                  title={legal ? id : t('workbench.sk_illegal_hint')}
                  onClick={() => setCandidate(id)}
                >
                  {id}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-3">
              {t('workbench.sk_dep_label')}
              <select
                className="h-7 max-w-[300px] rounded-[9px] border border-border bg-card px-[11px] font-mono text-xs text-text transition hover:border-border-2 focus:border-(--accent) focus:shadow-[0_0_0_3px_var(--ring-blue)] focus:outline-none"
                data-testid="wb-sk-dep"
                aria-label={t('workbench.sk_dep_label')}
                value={dep}
                onChange={(e) => setDep(e.target.value)}
              >
                <option value="">{t('workbench.sk_dep_none')}</option>
                {step.skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex-1" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-transparent"
              data-testid="wb-sk-cancel"
              onClick={() => {
                setPanelOpen(false)
                setCandidate(null)
                setDep('')
              }}
            >
              {t('workbench.sk_cancel')}
            </Button>
            <Button type="button" size="sm" data-testid="wb-sk-confirm" disabled={!candidate} onClick={confirmAdd}>
              {t('workbench.sk_confirm')}
            </Button>
          </div>
        </div>
      )}
      <p className={cn(NOTE_CLS, 'mt-2.5')}>{t('workbench.sk_dag_note')}</p>
    </div>
  )
}
