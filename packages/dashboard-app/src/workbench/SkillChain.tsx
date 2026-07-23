import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fetchSkillsRegistry, postMandatorySkills, type WbSkillEntry } from '../api/client'
import { useT } from '../i18n'
import {
  loadMandatoryConfig,
  isValidMandatorySkillList,
  peekMandatoryConfig,
  primeMandatoryConfig,
  resolveMandatoryCell,
  type MandatoryConfig,
} from './mandatorySkills'
import { SkillTransferModal } from './SkillTransferModal'
import type { WbSkillRef, WbStepDef } from './WorkbenchView'
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
 * v8-E（用户点名，设计真相源 design-demos/v8-trellis-encore.html #skChain/animChain）：
 * 链 chips → 编号节点（紫圆 mono 序号）+ 紫色流动虚线连接件 + GSAP 逐节点弹入/连线生长；
 * 依赖链语义、添加面板、default 轨道 tab 全部不动，纯展示升级；reduced-motion 直显。
 */

// 同 kernel validate.ts IDENT_RE / StepEditor FIELD_RE 一条规则：自定义 workflow 的 skill id
// 字符集越界（如外部技能的 `plugin:skill` 冒号名）会被 kernel validate 在保存时拒绝——
// 添加面板对这类候选直接禁用并给原因，不让用户「加了却存不进去」。
const SKILL_ID_RE = /^[a-zA-Z0-9_-]+$/

// ── W3 tailwind 迁移：原 styles.ts wb-* 规则的等值原子类串（颜色全走 token / var(--*)，
//    状态由 data-* / aria-* 属性承载，tailwind data-/aria- 变体挂样式）。──
/** 原 .wb-note。 */
const NOTE_CLS = 'text-xs leading-[1.55] text-text-3'
/** 原 .view__note.view__note--error。 */
const ERR_CLS = 'p-5 text-[13px] text-red'
/** 原 .wb-ed-sec-h 区头 与 .hint。 */
const SEC_H_CLS = 'mb-2.5 flex items-center gap-1.5 text-[13px] font-bold'
const HINT_CLS = 'text-xs font-normal text-text-3'
/** 原 .wb-empty。 */
const EMPTY_CLS = 'text-[12.5px] text-text-3'
/** 原 .wb-chip；未安装态（原 .wb-chip--uninstalled）由 data-uninstalled 属性驱动。 */
const CHIP_CLS =
  'inline-flex h-6 items-center gap-1 rounded-[7px] border border-border bg-fill px-[9px] font-mono text-xs text-text-2 data-uninstalled:opacity-62'
/** 原 .wb-chip-badge：未安装小徽章（琥珀 = 红绿 color-mix 派生，决议 #9 禁新原色的既有表达）。 */
const CHIP_BADGE_CLS =
  'ml-1 flex-none whitespace-nowrap rounded-full border-0 bg-[color-mix(in_oklch,var(--red)_52%,var(--green))] px-1.5 py-px text-[10px] font-bold text-card'
/** 原 .wb-addchip：虚线「添加/编辑」小钮。 */
const ADDCHIP_CLS =
  'h-6 cursor-pointer rounded-[7px] border border-dashed border-border-2 bg-transparent px-[9px] text-xs font-semibold text-text-3 transition-colors hover:bg-fill hover:text-text-2'
/** 原 .wb-sk-actions。 */
const ACTIONS_CLS = 'flex items-center gap-2 pt-[9px]'
/** 原 .wb-chain 链行（行间虚线分隔由容器 divide-* 承担，对位原 .wb-chain + .wb-chain）与 .wb-chain-k 行头。 */
const CHAIN_CLS = 'flex flex-wrap items-center gap-1.5 py-[7px]'
const CHAIN_K_CLS = 'mr-1 flex-none text-[11px] font-bold tracking-[.04em] text-text-3'

/** 原 .wb8-skconn：紫流动虚线连接件（GSAP/测试锚点换 data-anim="skconn"；keyframes 在 workbench.css，
 *  reduced-motion 停帧走 motion-reduce: 变体）。纯展示元素，可安全复用同一 JSX 常量。 */
const skConn = (
  <span
    aria-hidden="true"
    data-anim="skconn"
    className="relative mx-0.5 inline-block h-3.5 w-[26px] flex-none before:absolute before:left-0.5 before:right-[7px] before:top-1.5 before:h-0.5 before:animate-[wb-flowsk_1.6s_linear_infinite] before:bg-[repeating-linear-gradient(90deg,var(--purple)_0_5px,transparent_5px_10px)] before:content-[''] after:absolute after:right-px after:top-[3px] after:h-2 after:w-[5px] after:bg-purple after:content-[''] after:[clip-path:polygon(0_0,100%_50%,0_100%)] motion-reduce:before:animate-none"
  />
)

interface ErrorBody {
  error?: string
}

/** 非 2xx 响应尽量读出 server 的 { error } 文案（同 WorkbenchView.readErrorDetail 的既有模式）。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

// ── 依赖链投影（demo chainsHTML 的 React 移植，depends_on 数组化）──

interface ChainRow {
  /** 链头悬空依赖（指向 step 外的 skill id / 分叉未随首链走掉的父节点），null = 干净链头。 */
  ghost: string | null
  ids: string[]
}

interface ChainProjection {
  chains: ChainRow[]
  solos: string[]
}

function buildChains(skills: readonly WbSkillRef[]): ChainProjection {
  const byId = new Set(skills.map((s) => s.id))
  const inListDeps = (s: WbSkillRef): string[] => (s.depends_on ?? []).filter((d) => byId.has(d))
  const kids = new Map<string, string[]>()
  for (const s of skills) {
    for (const dep of inListDeps(s)) {
      const list = kids.get(dep) ?? []
      list.push(s.id)
      kids.set(dep, list)
    }
  }
  const used = new Set<string>()
  function walk(start: string): string[] {
    const ch = [start]
    used.add(start)
    let cur = start
    for (;;) {
      const next = (kids.get(cur) ?? []).find((k) => !used.has(k))
      if (!next) return ch
      ch.push(next)
      used.add(next)
      cur = next
    }
  }
  const chains: ChainRow[] = []
  const solos: string[] = []
  // 第一遍（声明序）：完全未声明依赖的节点起链；长度 1 且无后继 = 无依赖独立项。
  // （只声明了悬空依赖的节点不算「无依赖」——留给第二遍以幽灵 chip 呈现它挂在谁下面。）
  for (const s of skills) {
    if (used.has(s.id) || (s.depends_on ?? []).length > 0) continue
    const ch = walk(s.id)
    if (ch.length === 1) solos.push(s.id)
    else chains.push({ ghost: null, ids: ch })
  }
  // 第二遍：剩余节点（悬空依赖/分叉支/循环）——链头带幽灵 chip 指明它挂在谁下面。
  for (const s of skills) {
    if (used.has(s.id)) continue
    chains.push({ ghost: s.depends_on?.[0] ?? null, ids: walk(s.id) })
  }
  return { chains, solos }
}

// ── default 模式：manifest 强制技能矩阵的模块级探测缓存 ──
// P1 任务 B 搬迁：MandatoryConfig / loadMandatoryConfig / cfgCache / cfgInflight /
// invalidateMandatoryConfig 原是本模块私有物，已**逐字**移入 ./mandatorySkills（行为零改动，
// 含「res.ok 必须在 res.json() 之前」那条教训注释一并搬走）。理由：编排画布的 default 泳道
// 技能区与本组件（仍挂在 WorkbenchView 高级设置 sheet 里）同屏共存、读写同一份 manifest 矩阵——
// 两份缓存 = 两发 GET /api/config + 写入后状态分叉（画布改完，sheet 还显示旧集合）。故一份缓存两处用。
// 跨模块后只有两处适配（非行为变更）：读 cfgCache → peekMandatoryConfig()，写 cfgCache → primeMandatoryConfig()，
// 因为 ES module 的 import 绑定不可赋值。invalidateMandatoryConfig 是既有 export（测试依赖），
// 于此原样 re-export 保持对外可见性不变。
export { invalidateMandatoryConfig } from './mandatorySkills'

/** POST /api/config/mandatory-skills 的成功响应体形状（自 旧设置视图 迁移）。 */
interface MandatorySkillsPostResponse {
  ok?: boolean
  error?: string
  skills?: string[]
}

export interface SkillChainProps {
  step: WbStepDef
  /** 项目根必须由宿主显式传入；default config/cache/write 全部以它隔离。 */
  root: string
  /** 所属 workflow 名：'default' 走 manifest 强制技能矩阵模式，其余为 step.skills DAG 编辑。 */
  workflow?: string
  /** 自定义 workflow 只读镜像：隐藏移除 × 与添加面板（default 模式忽略此项，见头注释）。 */
  readonly?: boolean
  onChange: (updated: WbStepDef) => void
}

export function SkillChain({ step, root, workflow = '', readonly = false, onChange }: SkillChainProps): JSX.Element {
  const { t } = useT()
  const isDefault = workflow === 'default'

  // ── 自定义模式：添加面板态 ──
  const [panelOpen, setPanelOpen] = useState(false)
  const [registry, setRegistry] = useState<WbSkillEntry[] | null>(null)
  const [regError, setRegError] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<string | null>(null)
  const [dep, setDep] = useState('')

  // ── default 模式：矩阵态（探测/轨道/穿梭框/保存）──
  const [requestedTrack, setTrack] = useState<string | null>(null)
  const [cfg, setCfg] = useState<MandatoryConfig | null>(() => peekMandatoryConfig(root))
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // 保存操作绑定发起时的项目；token 防止旧项目的 finally 干扰切换项目后的新保存。
  const rootRef = useRef(root)
  rootRef.current = root
  const savingOpRef = useRef<{ token: symbol; root: string; cellKey: string } | null>(null)

  // ── v8-E（用户点名）：依赖链动态入场——编号节点逐个弹入 + 紫流动虚线连线生长
  //    （demo v8 animChain 对位：节点 back.out stagger .07、连线 scaleX 0→1 origin left）。
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
            gsap.from(nodes, { autoAlpha: 0, scale: 0.88, duration: 0.28, stagger: 0.07, ease: 'back.out(1.8)', clearProps: 'all' })
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

  useEffect(() => {
    if (!isDefault) return
    let cancelled = false
    const cached = peekMandatoryConfig(root)
    setCfg(cached)
    setEditing(false)
    setSaveError(null)
    if (cached !== null) return
    void loadMandatoryConfig(root).then((r) => {
      if (!cancelled) setCfg(r)
    })
    return () => {
      cancelled = true
    }
  }, [isDefault, root])

  // ── 自定义模式动作 ──

  // v6 T10：registry 挂载即拉(两种模式都要)——已选 chip 的未安装 badge 与 default 黄条都
  // 需要 installed 信息,不能等「+ 添加」面板打开才知道。失败 fail-soft:regError 行内提示,
  // badge/黄条按「不可判」整体不显示(保守,不谎报)。
  useEffect(() => {
    if (registry !== null || regError !== null) return
    let cancelled = false
    fetchSkillsRegistry()
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<{ skills: WbSkillEntry[] }>
      })
      .then((body) => {
        if (!cancelled) setRegistry(body.skills)
      })
      .catch((err: unknown) => {
        if (!cancelled) setRegError(t('workbench.sk_registry_error', { msg: err instanceof Error ? err.message : t('workbench.network_error') }))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只拉一次;t 变化不重拉
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

  // ── default 模式动作（探测/保存逻辑自 旧设置视图 saveCellWith/requestSave/requestCancel 迁移）──

  const phase = step.id
  const matrixTracks = cfg?.tracks.filter((candidate) => candidate.policyProfile.skills.matrix) ?? []
  const selectedTrack = matrixTracks.find((candidate) => candidate.id === requestedTrack) ?? matrixTracks[0] ?? null
  const track = selectedTrack?.id ?? ''
  function effectiveSkills(tr: string): string[] {
    if (cfg === null) return []
    const definition = matrixTracks.find((candidate) => candidate.id === tr)
    return definition ? resolveMandatoryCell(cfg.table, definition, phase, cfg.writableProfiles).skills : []
  }

  async function saveMandatory(skills: string[]): Promise<void> {
    if (selectedTrack === null) return
    const cellKey = `${phase}.${track}`
    const requestRoot = root
    const requestCfg = cfg
    const op = { token: Symbol(cellKey), root: requestRoot, cellKey }
    savingOpRef.current = op
    setSaveError(null)
    try {
      const res = await postMandatorySkills({ phase, track, skills, root: requestRoot })
      let body: MandatorySkillsPostResponse = {}
      try {
        body = (await res.json()) as MandatorySkillsPostResponse
      } catch {
        /* 无 JSON 体：走下方通用错误文案 */
      }
      if (!res.ok || body.ok !== true) {
        throw new Error(body.error || t('workbench.sk_save_failed', { status: res.status }))
      }
      if (body.skills !== undefined && !isValidMandatorySkillList(body.skills)) {
        throw new Error(t('workbench.mand_save_invalid'))
      }
      const saved = body.skills ?? skills
      const base = peekMandatoryConfig(requestRoot) ?? requestCfg
      if (base !== null) {
        const next: MandatoryConfig = { ...base, table: { ...base.table, [cellKey]: saved } }
        primeMandatoryConfig(next, requestRoot)
        if (rootRef.current === requestRoot) {
          setCfg(next)
          setEditing(false)
        }
      }
    } catch (e) {
      if (rootRef.current === requestRoot) setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      if (savingOpRef.current?.token === op.token) savingOpRef.current = null
    }
  }

  function requestSave(skills: string[]): void {
    const active = savingOpRef.current
    if (active?.root === root && active.cellKey === `${phase}.${track}`) return
    void saveMandatory(skills)
  }

  function requestCancel(): void {
    const active = savingOpRef.current
    if (active?.root === root && active.cellKey === `${phase}.${track}`) return
    setEditing(false)
    setSaveError(null)
  }

  // ── default 模式渲染 ──
  if (isDefault) {
    const skills = effectiveSkills(track)
    // archive 无强制技能（manifest 约定，POST 端点亦拒 archive）——不给编辑钮。
    const cell = cfg !== null && selectedTrack !== null
      ? resolveMandatoryCell(cfg.table, selectedTrack, phase, cfg.writableProfiles)
      : null
    const canEdit = cfg?.capable === true && cell?.editable === true && cell.source === 'explicit' && phase !== 'archive'
    return (
      // wb-ed-sec 保留为语义骨架类（StepEditor/wb8-pane 的相邻分隔上下文仍以它为锚，样式已原子化）。
      <div className="wb-ed-sec pt-3.5 pb-1" data-testid="wb-sk-sec">
        <div className={SEC_H_CLS}>
          {t('workbench.sk_sec')}
          <span className={HINT_CLS}>{t('workbench.sk_hint_default', { phase })}</span>
        </div>
        {cfg === null ? (
          <p className={NOTE_CLS}>{t('common.loading')}</p>
        ) : (
          <>
            {matrixTracks.length === 0 ? (
              <p className={NOTE_CLS}>{t('workbench.track_empty')}</p>
            ) : (
            <div className="mb-2.5 flex gap-1" data-testid="wb-sk-tracks">
              {matrixTracks.map((definition) => {
                const tr = definition.id
                const n = effectiveSkills(tr).length
                return (
                  <button
                    key={tr}
                    type="button"
                    className="h-[26px] cursor-pointer rounded-md px-[11px] font-mono text-[12.5px] font-semibold text-text-3 transition-colors not-aria-pressed:hover:bg-fill not-aria-pressed:hover:text-text-2 aria-pressed:bg-fill-2 aria-pressed:text-text"
                    aria-pressed={tr === track}
                    data-testid={`wb-sk-track-${tr}`}
                    onClick={() => setTrack(tr)}
                  >
                    {definition.builtin && <LockKeyhole className="mr-1 inline size-3" aria-hidden="true" />}{definition.label}
                    {definition.policyProfile.skills.profile !== tr && ` · inherits ${definition.policyProfile.skills.profile}`}
                    {n > 0 && <b className="ml-[3px] font-bold text-(--accent)">{n}</b>}
                  </button>
                )
              })}
            </div>
            )}
            {/* v6 T10：manifest 缺失黄条——当前 阶段×轨道 任一 token 的全部 a|b 备选都未装才触发
                (部分已装即满足);capable:false(静态镜像兜底)或 registry 未就绪 → 不可判,保守不显示。 */}
            {(() => {
              if (cfg.capable !== true || registry === null) return null
              const rawTokens = cell?.skills ?? []
              const missing = rawTokens.filter((tok) =>
                tok.split('|').every((alt) => installedMap.get(alt)?.installed !== true),
              )
              if (missing.length === 0) return null
              const firstCmd = missing
                .flatMap((tok) => tok.split('|'))
                .map((alt) => installedMap.get(alt)?.installCmd)
                .find((c) => c !== undefined)
              return (
                <p
                  className={cn(
                    NOTE_CLS,
                    'flex flex-wrap items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,color-mix(in_oklch,var(--red)_52%,var(--green))_45%,var(--border))] bg-[color-mix(in_srgb,color-mix(in_oklch,var(--red)_52%,var(--green))_14%,var(--card))] px-2.5 py-2',
                  )}
                  data-testid="wb-sk-banner"
                >
                  {t('workbench.sk_banner', { tokens: missing.join('、') })}
                  {firstCmd && (
                    <button
                      type="button"
                      className={cn(CHIP_BADGE_CLS, 'cursor-pointer')}
                      data-testid="wb-sk-banner-copy"
                      title={firstCmd}
                      onClick={() => void navigator.clipboard?.writeText(firstCmd)}
                    >
                      {t('workbench.sk_banner_copy')}
                    </button>
                  )}
                </p>
              )
            })()}
            <div className="flex flex-wrap items-center gap-2" data-testid="wb-sk-mand">
              {skills.length === 0 && <span className={EMPTY_CLS}>{t('workbench.sk_empty_default')}</span>}
              {skills.map((s) => (
                <span
                  key={s}
                  data-chip=""
                  data-uninstalled={installedMap.get(s)?.installed === false ? '' : undefined}
                  className={CHIP_CLS}
                  title={s}
                >
                  {s}
                  {uninstBadge(s)}
                </span>
              ))}
            </div>
            <div className={ACTIONS_CLS}>
              {canEdit && (
                <button type="button" className={ADDCHIP_CLS} data-testid="wb-sk-edit" onClick={() => { setEditing(true); setSaveError(null) }}>
                  {t('workbench.sk_edit')}
                </button>
              )}
              {cfg.capable === false && (
                <p className={NOTE_CLS} data-testid="wb-sk-cfg-ro">{t('workbench.sk_cfg_readonly')}</p>
              )}
            </div>
            {saveError && (
              <p className={cn(ERR_CLS, 'mt-2')} data-testid="wb-sk-save-error">{saveError}</p>
            )}
            {editing && <SkillTransferModal selected={skills} onSave={requestSave} onCancel={requestCancel} />}
          </>
        )}
        <p className={cn(NOTE_CLS, 'mt-2.5')}>{t('workbench.sk_mand_note')}</p>
      </div>
    )
  }

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
          ×
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
            <span className={EMPTY_CLS}>{t('workbench.sk_empty_custom')}</span>
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
            {regError && <span className={ERR_CLS}>{regError}</span>}
            {!regError && registry === null && <span className={EMPTY_CLS}>{t('common.loading')}</span>}
            {!regError && registry !== null && candidates.length === 0 && (
              <span className={EMPTY_CLS}>{t('workbench.sk_panel_empty')}</span>
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
