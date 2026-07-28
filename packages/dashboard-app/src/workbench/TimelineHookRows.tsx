import { useEffect, useRef, useState } from 'react'
import { ArrowRight, LockKeyhole, LogIn, Wrench } from 'lucide-react'
import type { WbSkillEntry } from '../api/client'
import { useT } from '../i18n'
import type { HooksConfigState } from './HookTimeline'

export const EVENT_META = {
  SessionStart: { title: '进入阶段', hint: '初始化当前任务', icon: LogIn },
  UserPromptSubmit: { title: '准备输入', hint: '每次提交任务', icon: ArrowRight },
  PreToolUse: { title: '工具调用前', hint: '执行动作之前', icon: Wrench },
  PostToolUse: { title: '工具调用后', hint: '取得结果之后', icon: Wrench },
} as const

export const EVENT_ORDER = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse'] as const

export function sourceLabel(source: WbSkillEntry['source']): string {
  if (source === 'builtin') return '内置'
  if (source === 'local-plugin') return '本地插件'
  if (source === 'external-marketplace') return '扩展市场'
  return '用户目录'
}

export function statusTone(installed: boolean | undefined): string {
  if (installed === true) return 'text-green'
  if (installed === false) return 'text-amb-d'
  return 'text-text-3'
}

export function HookRows({
  event,
  stageId,
  config,
  readonly,
}: {
  event: (typeof EVENT_ORDER)[number]
  stageId: string
  config: HooksConfigState
  readonly: boolean
}): JSX.Element {
  const { t } = useT()
  const hooks = config.hooks?.filter((hook) => hook.event === event) ?? []
  if (config.hooks === null) return <span className="text-xs text-text-3">Hook 配置读取中…</span>
  if (hooks.length === 0) return <span className="text-xs text-text-3">此时点没有已注册 Hook</span>
  return (
    <div className="flex min-w-0 flex-1 flex-col divide-y divide-border max-[720px]:w-full">
      {hooks.map((hook) => {
        const key = `${hook.id}.${stageId}`
        const enabled = !(key in config.matrix)
        const locked = !hook.configurable
        const nameKey = `workbench.hk_name_${hook.id}`
        const descriptionKey = `workbench.hk_desc_${hook.id}`
        const translatedName = t(nameKey)
        const translatedDescription = t(descriptionKey)
        const fallback = hook.id === 'guard-write-scope'
          ? { name: '写入范围保护', description: '在工具执行前检查写入是否越界。' }
          : hook.id === 'collect-evidence'
            ? { name: '收集验证证据', description: '工具完成后归集可复核的结果与证据。' }
            : hook.id === 'load-context'
              ? { name: '加载任务上下文', description: '进入阶段时注入当前目标、限制与可用能力。' }
              : { name: hook.id, description: '在这一执行时点运行预先配置的自动化处理。' }
        const name = translatedName === nameKey ? fallback.name : translatedName
        const description = translatedDescription === descriptionKey ? fallback.description : translatedDescription
        return (
          <div key={hook.id} className="flex min-h-14 items-center gap-3 py-2" data-testid={`wb-timeline-hook-${hook.id}`} title={`技术详情：${hook.id} · ${hook.event} · 匹配 ${hook.matcher || '*'} · ${hook.script}`}>
            {locked || readonly ? <LockKeyhole className="h-4 w-4 flex-none text-text-3" aria-hidden="true" /> : (
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${name}（${hook.id}） · ${EVENT_META[event].title}`}
                data-testid={`wb-lane-hk-sw-${stageId}-${hook.id}`}
                disabled={config.busyKeys.has(key)}
                className="relative h-[22px] w-9 flex-none rounded-full bg-fill-2 transition-colors duration-150 aria-checked:bg-green disabled:opacity-50 motion-reduce:transition-none after:absolute after:top-[3px] after:left-[3px] after:h-4 after:w-4 after:rounded-full after:bg-card after:shadow-sm after:transition-transform after:duration-150 after:content-[''] aria-checked:after:translate-x-[14px] motion-reduce:after:transition-none"
                onClick={() => config.toggle(hook.id, stageId, !enabled)}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="truncate text-[13px] font-semibold text-text">{name}</span><span className="rounded-full bg-fill-2 px-2 py-0.5 text-[10px] font-semibold text-text-3">内置 Hook</span></div>
              <p className="mt-0.5 text-[11px] leading-4 text-text-3">{description}</p>
            </div>
            <span className={`text-xs font-semibold ${enabled ? 'text-green' : 'text-text-3'}`}>{enabled ? '启用' : '停用'}</span>
          </div>
        )
      })}
      {event === 'UserPromptSubmit' && <PromptRoutingBypassEditor config={config} />}
    </div>
  )
}

function PromptRoutingBypassEditor({ config }: { config: HooksConfigState }): JSX.Element {
  const { t } = useT()
  const [draft, setDraft] = useState(config.promptSkipKeyword ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const lastEnabledKeyword = useRef('no-tenon')

  useEffect(() => {
    if (config.promptSkipKeyword === null) return
    setDraft(config.promptSkipKeyword)
    if (config.promptSkipKeyword !== '') lastEnabledKeyword.current = config.promptSkipKeyword
  }, [config.promptSkipKeyword])

  const enabled = draft !== ''
  const valid = draft === '' || /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(draft)

  async function save(): Promise<void> {
    setSaved(false)
    if (!valid) {
      setValidationError(t('workbench.hk_bypass_invalid'))
      return
    }
    setValidationError(null)
    if (await config.savePromptSkipKeyword(draft)) setSaved(true)
  }

  return (
    <form
      className="mt-2 rounded-xl border border-border bg-fill/60 p-3"
      data-testid="wb-prompt-routing-bypass"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="flex items-start gap-3 max-[720px]:flex-col max-[720px]:gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('workbench.hk_bypass_enable')}
          disabled={config.promptSkipBusy}
          className="relative mt-0.5 h-[22px] w-9 flex-none rounded-full bg-fill-2 transition-colors duration-150 aria-checked:bg-(--accent) disabled:opacity-50 motion-reduce:transition-none after:absolute after:top-[3px] after:left-[3px] after:h-4 after:w-4 after:rounded-full after:bg-card after:shadow-sm after:transition-transform after:duration-150 after:content-[''] aria-checked:after:translate-x-[14px] motion-reduce:after:transition-none"
          onClick={() => {
            setSaved(false)
            setValidationError(null)
            if (enabled) {
              lastEnabledKeyword.current = draft
              setDraft('')
            } else {
              setDraft(lastEnabledKeyword.current)
            }
          }}
        />
        <div className="min-w-0 flex-1 max-[720px]:w-full">
          <label htmlFor="wb-prompt-skip-keyword" className="block text-[12px] font-semibold text-text">
            {t('workbench.hk_bypass_label')}
          </label>
          <p className="mt-0.5 text-[11px] leading-4 text-text-3">{t('workbench.hk_bypass_hint')}</p>
        </div>
      </div>
      <div className="mt-2 flex gap-2 max-[720px]:flex-col">
        <input
          id="wb-prompt-skip-keyword"
          value={draft}
          disabled={!enabled || config.promptSkipBusy}
          maxLength={33}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
            setValidationError(null)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            void save()
          }}
          className="min-w-0 flex-1 rounded-lg border border-border-2 bg-card px-2.5 py-1.5 font-mono text-xs text-text outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={config.promptSkipBusy}
          className="rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {config.promptSkipBusy
            ? t('workbench.hk_bypass_saving')
            : config.promptSkipError
              ? t('workbench.hk_bypass_retry')
              : t('workbench.hk_bypass_save')}
        </button>
      </div>
      {(validationError || config.promptSkipError) && (
        <p className="mt-2 text-[11px] leading-4 text-red" role="alert">
          {validationError ?? config.promptSkipError}
        </p>
      )}
      {saved && (
        <p className="mt-2 text-[11px] leading-4 text-green" role="status">
          {draft === ''
            ? t('workbench.hk_bypass_disabled')
            : t('workbench.hk_bypass_saved', { keyword: draft })}
        </p>
      )}
    </form>
  )
}

export function TimelineHookNodes({
  events,
  stageId,
  config,
  readonly,
}: {
  events: readonly (typeof EVENT_ORDER)[number][]
  stageId: string
  config: HooksConfigState
  readonly: boolean
}): JSX.Element {
  return <>
    {events.map((event) => {
      const meta = EVENT_META[event]
      const Icon = meta.icon
      return (
        <div key={event} className="relative mb-2 rounded-xl border border-border bg-card px-4 py-2.5" data-testid={`wb-timeline-node-${event}`}>
          <span className="absolute top-3 -left-[47px] z-10 grid h-8 w-8 place-items-center rounded-full border border-border-2 bg-card text-text-3">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 items-start gap-4 max-[720px]:flex-col">
            <div className="w-32 flex-none pt-1">
              <h3 className="text-sm font-semibold text-text">{meta.title}</h3>
              <p className="mt-0.5 font-mono text-[10px] text-text-3">{meta.hint}</p>
            </div>
            <HookRows event={event} stageId={stageId} config={config} readonly={readonly} />
          </div>
        </div>
      )
    })}
  </>
}

export function PreviewRow({ label, value, ready }: { label: string; value: string; ready: boolean }): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-card px-3 py-2.5">
      <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${ready ? 'bg-green' : 'bg-amb'}`} aria-hidden="true" />
      <span className="min-w-0 flex-1"><strong className="block font-semibold text-text">{label}</strong><span className="mt-0.5 block leading-4 text-text-3">{value}</span></span>
    </div>
  )
}
