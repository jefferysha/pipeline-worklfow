import { useEffect, useRef, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  fetchHooksConfig,
  postHookToggle,
  postPromptRoutingBypass,
  type WbHookEvent,
  type WbHookMeta,
} from '../api/client'
import { useT } from '../i18n'

/**
 * HookTimeline（T15，计划 2026-07-11-v5-interaction-rebuild）—— 工作台 Hook 会话时序线：
 * 水平四时机节点（会话开始→你发消息→agent 调工具→工具完成，中段「每轮重复」循环弧）+
 * 时机下人话 hook 卡（名称 + 一句做什么 + 启用开关）。交互真相源
 * design-demos/v5-progress-workbench.html 的 wb-hkline 区块（hooksHTML/HOOK_TL）。
 *
 * 数据面消费 T5（决议#2）：GET /api/hooks 给 8 hook 元数据 + 阶段×hook 禁用矩阵
 * （只存禁用项，缺键=启用，fail-open）；POST /api/hooks 按**当前选中阶段**写回单键。
 * 时机归类以 server HOOK_METAS（= hooks/hooks.json plugin 注册）为准，前端不凭名字猜。
 *
 * 状态托管在 useHooksConfig（WorkbenchView 持有）而非本组件：阶段卡 hooksCount 真数与
 * 摘要卡「钩子」行都要吃同一份矩阵，数据必须住在共同祖先。本组件纯呈现 + 转发 toggle。
 *
 * 三档呈现（决议#2）：
 *   · configurable=true（session-start/breadcrumb/router/skill-tracker）：开关可点，
 *     乐观更新（点击即翻，POST 失败回滚 + 错误提示）；
 *   · 强制常开（gate/interactive-skill-gate）：「强制常开」badge + 开关禁用恒开——
 *     交互门/安全门关掉 = 整个 gate 语义失效，server 写端点也会 400；
 *   · 暂不可配（confirm-clear/decision-recorder）：卡灰显 +「暂不可配」badge——sh 侧
 *     未接线，开放开关就是「设置不起效」，违反交付门槛②。
 *
 * 注意：hooks.json 是 per-root 运行时配置、不属于 workflow def 草稿——default workflow
 * 只读态下本区照常可切（不走保存钮，写回即时生效），与 StepEditor 的 readonly 无关。
 */

/** 时序线固定四时机（列序 = 会话生命周期序；空组也画节点——时序线是解释模型，不随数据缺列）。 */
const EVENT_ORDER: readonly WbHookEvent[] = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse']

/**
 * 强制常开（决议#2）：configurable:false 里的「安全门/交互门」子集；其余 false 项 = 暂不可配。
 * v6 计划 T11：export 供 WorkbenchView 的流程带门徽章 popover 复用同一对 id（静态兜底展示,
 * 不依赖本文件内部状态）——T12 拆 HookTimelineMini 只读迷你版时继续消费同一个常量,不重复定义。
 */
export const LOCKED_IDS: ReadonlySet<string> = new Set(['gate', 'interactive-skill-gate'])

export interface HooksConfigState {
  /** null = 加载中或加载失败（loadError 区分）——消费方此时隐藏计数（诚实占位，不谎报）。 */
  hooks: WbHookMeta[] | null
  matrix: Record<string, false>
  loadError: string | null
  toggleError: string | null
  promptSkipKeyword: string | null
  promptSkipBusy: boolean
  promptSkipError: string | null
  /** 在途写回的 `<hook>.<阶段>` 键：对应开关禁用，防同键乱序竞态。 */
  busyKeys: ReadonlySet<string>
  toggle: (hook: string, phase: string, enabled: boolean) => void
  savePromptSkipKeyword: (keyword: string) => Promise<boolean>
  /** 某阶段的启用 hook 数（含强制常开——它们真的在跑）；数据未就绪 → undefined。 */
  enabledCount: (phase: string) => number | undefined
}

/**
 * /api/hooks 的读写状态托管（WorkbenchView 调用，传给 HookTimeline/阶段卡/摘要三个消费方）。
 * toggle 乐观更新：先翻本地矩阵再 POST，失败按原值回滚 + toggleError 提示（验收②）。
 *
 * T17：可选 onError——宿主（App 经 WorkbenchView）传入时，写回失败的提示改走它（接全局
 * showFlash），不再落 toggleError 行内 alert（两处同时报同一件事是重复）；缺省行为与 T15 一致。
 */
export function useHooksConfig(root: string, onError?: (msg: string) => void): HooksConfigState {
  const { t } = useT()
  const [hooks, setHooks] = useState<WbHookMeta[] | null>(null)
  const [matrix, setMatrix] = useState<Record<string, false>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [promptSkipKeyword, setPromptSkipKeyword] = useState<string | null>(null)
  const [promptSkipBusy, setPromptSkipBusy] = useState(false)
  const [promptSkipError, setPromptSkipError] = useState<string | null>(null)
  const promptSkipGeneration = useRef(0)
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    promptSkipGeneration.current += 1
    setHooks(null)
    setMatrix({})
    setLoadError(null)
    setToggleError(null)
    setPromptSkipKeyword(null)
    setPromptSkipBusy(false)
    setPromptSkipError(null)
    fetchHooksConfig(root)
      .then((body) => {
        if (cancelled) return
        setHooks(body.hooks)
        setMatrix(body.matrix)
        setPromptSkipKeyword(body.promptSkipKeyword)
      })
      .catch((err: unknown) => {
        // 加载失败不挡工作台其余区块：计数回落 '—' 占位、时序线区行内报错。
        if (cancelled) return
        setLoadError(t('workbench.hk_load_error', { msg: err instanceof Error ? err.message : t('workbench.network_error') }))
      })
    return () => {
      cancelled = true
    }
  }, [root, t])

  // 故意不 useCallback：闭包要读最新 busyKeys 守卫（WorkbenchView 脏守卫四件套的同一条
  // React 记忆化纪律——冻结的快照会放行同键并发写）。
  function toggle(hook: string, phase: string, enabled: boolean): void {
    const key = `${hook}.${phase}`
    if (busyKeys.has(key)) return
    setToggleError(null)
    // 乐观更新：矩阵只存禁用项——开=删键、关=写键（与 server writeHookToggle 同语义）。
    setMatrix((prev) => {
      const next = { ...prev }
      if (enabled) delete next[key]
      else next[key] = false
      return next
    })
    setBusyKeys((prev) => new Set(prev).add(key))
    postHookToggle({ root, hook, phase, enabled })
      .catch((err: unknown) => {
        // 失败回滚到点击前的值（本键在途期间被 busy 守卫锁住，不会有交叉写覆盖）。
        setMatrix((prev) => {
          const next = { ...prev }
          if (enabled) next[key] = false
          else delete next[key]
          return next
        })
        const msg = t('workbench.hk_toggle_error', { msg: err instanceof Error ? err.message : t('workbench.network_error') })
        if (onError) onError(msg)
        else setToggleError(msg)
      })
      .finally(() => {
        setBusyKeys((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      })
  }

  async function savePromptSkipKeyword(keyword: string): Promise<boolean> {
    if (promptSkipBusy) return false
    const generation = promptSkipGeneration.current
    setPromptSkipBusy(true)
    setPromptSkipError(null)
    try {
      const saved = await postPromptRoutingBypass(root, keyword)
      if (generation !== promptSkipGeneration.current) return false
      setPromptSkipKeyword(saved)
      return true
    } catch (err: unknown) {
      if (generation !== promptSkipGeneration.current) return false
      setPromptSkipError(t('workbench.hk_bypass_save_error', {
        msg: err instanceof Error ? err.message : t('workbench.network_error'),
      }))
      return false
    } finally {
      if (generation === promptSkipGeneration.current) setPromptSkipBusy(false)
    }
  }

  function enabledCount(phase: string): number | undefined {
    if (hooks === null) return undefined
    return hooks.filter((h) => !(`${h.id}.${phase}` in matrix)).length
  }

  return {
    hooks,
    matrix,
    loadError,
    toggleError,
    promptSkipKeyword,
    promptSkipBusy,
    promptSkipError,
    busyKeys,
    toggle,
    savePromptSkipKeyword,
    enabledCount,
  }
}

export interface HookTimelineProps {
  /** 当前选中阶段 id（矩阵键的阶段半边；开关全部按它读写）。 */
  phase: string
  config: HooksConfigState
}

/** 原 .wb-hk-badge / --locked 修饰符（W3 tailwind 迁移，颜色全走 token）。 */
const HK_BADGE_CLS = 'flex-none whitespace-nowrap rounded-full bg-fill-2 px-1.5 py-px text-[10px] font-bold text-text-3'

export function HookTimeline({ phase, config }: HookTimelineProps): JSX.Element {
  const { t } = useT()
  return (
    // wb-ed-sec 保留为语义骨架类（wb8-pane 的「编辑卡后接续分隔」上下文仍以它为锚，样式已原子化）。
    <div className="wb-ed-sec pt-3.5 pb-1" data-testid="wb-hooks">
      <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold">
        {t('workbench.hk_sec')}
        <span className="text-xs font-normal text-text-3">{t('workbench.hk_hint', { phase })}</span>
      </div>
      <p className="-mt-0.5 mb-3.5 text-xs leading-[1.55] text-text-3">{t('workbench.hk_note')}</p>
      {config.loadError && (
        <p className="p-5 text-[13px] text-red" data-testid="wb-hk-load-error">{config.loadError}</p>
      )}
      {config.toggleError && (
        <p className="p-5 text-[13px] text-red" role="alert" data-testid="wb-hk-toggle-error">{config.toggleError}</p>
      )}
      {config.hooks && (
        // v6 T12：横排 4 列网格 → 纵排分组（唯一消费方改为右栏 280px 窄列；交互真相源
        // v6-workbench-flow.html 方案 A 右栏「钩子时序(全局)」取代 v5 编辑区横排口径）。
        // 循环提示（原跨两列的 wb-hkloop 弧）改为 PreToolUse 分组头上的一行小字，语义不丢。
        <div className="flex flex-col gap-3">
          {EVENT_ORDER.map((ev) => (
            <div key={ev} className="border-l-2 border-border-2 pl-2.5" data-testid={`wb-hk-group-${ev}`}>
              <div
                className="relative mb-1.5 pt-[22px] pb-2.5 pl-[18px] before:absolute before:left-0 before:top-[5px] before:h-3 before:w-3 before:rounded-full before:border-[3px] before:border-(--accent) before:bg-card before:content-['']"
                data-testid={`wb-hk-node-${ev}`}
              >
                <div className="text-[13px] font-bold leading-[1.2]">{t(`workbench.hk_ev_${ev}`)}</div>
                <div className="mt-px font-mono text-[11px] text-text-3">{ev}</div>
              </div>
              {ev === 'PreToolUse' && (
                <div className="mb-1.5 text-[10.5px] text-text-3" aria-hidden="true"><span>{t('workbench.hk_loop')}</span></div>
              )}
              <div className="flex min-w-0 flex-col gap-2" data-testid={`wb-hk-stack-${ev}`}>
                {(config.hooks ?? []).filter((h) => h.event === ev).map((h) => {
                const key = `${h.id}.${phase}`
                const enabled = !(key in config.matrix)
                const locked = !h.configurable && LOCKED_IDS.has(h.id)
                const pending = !h.configurable && !locked
                // 人话文案缺席的未知 hook（server 端新加而前端词典未跟上）：名称回落 id、描述留白。
                const nameKey = `workbench.hk_name_${h.id}`
                const name = t(nameKey)
                const descKey = `workbench.hk_desc_${h.id}`
                const desc = t(descKey)
                return (
                  // 三档呈现的状态承载：data-state=pending（暂不可配灰显）/locked（强制常开）/configurable。
                  <div
                    key={h.id}
                    data-state={pending ? 'pending' : locked ? 'locked' : 'configurable'}
                    className="rounded-[10px] bg-fill px-[11px] py-2 data-[state=pending]:opacity-60"
                    data-testid={`wb-hk-${h.id}`}
                  >
                    <div className="flex items-center gap-1.5 text-[12.5px] font-[650]">
                      <span className="min-w-0 truncate">{name === nameKey ? h.id : name}</span>
                      {locked && <span className={cn(HK_BADGE_CLS, 'bg-red-t text-red-d')}>{t('workbench.hk_locked')}</span>}
                      {pending && <span className={HK_BADGE_CLS}>{t('workbench.hk_pending')}</span>}
                      <Switch
                        // 强制常开/暂不可配的 hook 实际都在跑（sh 侧不读/不认它们的禁用键）——开关恒显开，不撒谎。
                        checked={h.configurable ? enabled : true}
                        aria-label={name === nameKey ? h.id : name}
                        disabled={!h.configurable || config.busyKeys.has(key)}
                        data-testid={`wb-hk-sw-${h.id}`}
                        onCheckedChange={() => config.toggle(h.id, phase, !enabled)}
                        // 开=项目蓝（原 .switch[aria-checked=true] 的 --accent 口径，覆掉基元的 primary 绿）。
                        className="ml-auto origin-right scale-85 data-[state=checked]:bg-(--accent)"
                      />
                    </div>
                    {desc !== descKey && <div className="mt-0.5 text-[11.5px] leading-[1.5] text-text-3">{desc}</div>}
                  </div>
                )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
