import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowRight, Boxes, GitBranch, GripVertical, Search, Trash2 } from 'lucide-react'
import type { WbSkillEntry } from '../api/client'
import { Dialog } from '../shell/Dialog'
import type { BoardLane } from './OrchestrationBoard'
import { SkillExecutionTopology } from './SkillExecutionTopology'
import { skillPresentation } from './skillPresentation'

export interface SkillOrchestrationDialogProps {
  lane: BoardLane
  registry: WbSkillEntry[] | null | undefined
  readonly?: boolean
  onClose: () => void
  onAdd?: (stageId: string, skillId: string) => void
  onRemove?: (stageId: string, skillId: string) => void
  onMove?: (move: { skillId: string; fromStage: string; toStage: string; refSkillId: string | null; after: boolean }) => void
  onDependencyChange?: (stageId: string, skillId: string, dep: string | null, prevDep: string | null) => void
}

type DragPayload = { kind: 'library' | 'plan'; skillId: string }
type DropTarget = { refSkillId: string | null; after: boolean }

function sourceName(source: WbSkillEntry['source']): string {
  if (source === 'builtin') return '内置能力'
  if (source === 'local-plugin') return '本地插件'
  if (source === 'external-marketplace') return '扩展市场'
  return '用户技能'
}

function DropPreview({ label }: { label: string }): JSX.Element {
  return (
    <div data-testid="wb-skill-drop-preview" className="flex min-h-14 items-center justify-center rounded-2xl border-2 border-dashed border-(--accent) bg-accent-t/55 px-4 text-sm font-semibold text-accent-d shadow-[0_8px_28px_-22px_var(--accent)] transition-all duration-150 motion-reduce:transition-none">
      {label}
    </div>
  )
}

export function SkillOrchestrationDialog({
  lane,
  registry,
  readonly = false,
  onClose,
  onAdd,
  onRemove,
  onMove,
  onDependencyChange,
}: SkillOrchestrationDialogProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState<DragPayload | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [customOpen, setCustomOpen] = useState<ReadonlySet<string>>(new Set())
  const skills = lane.skills ?? []
  const library = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (registry ?? [])
      .filter((entry) => entry.available !== false && !skills.includes(entry.name))
      .filter((entry) => {
        if (!normalized) return true
        const presentation = skillPresentation(entry.name, registry)
        return `${presentation.name} ${presentation.description} ${entry.name}`.toLowerCase().includes(normalized)
      })
  }, [query, registry, skills])

  function setExecutionMode(skillId: string, index: number, mode: string): void {
    const deps = lane.skillDeps?.[skillId] ?? []
    if (mode === 'custom') {
      setCustomOpen((previous) => new Set(previous).add(skillId))
      return
    }
    setCustomOpen((previous) => {
      const next = new Set(previous)
      next.delete(skillId)
      return next
    })
    for (const dep of deps) onDependencyChange?.(lane.id, skillId, null, dep)
    if (mode === 'serial' && index > 0) onDependencyChange?.(lane.id, skillId, skills[index - 1] ?? null, null)
  }

  function addFromKeyboard(event: KeyboardEvent<HTMLElement>, entry: WbSkillEntry): void {
    if ((event.key !== 'Enter' && event.key !== ' ') || readonly || !entry.installed || !onAdd) return
    event.preventDefault()
    onAdd(lane.id, entry.name)
  }

  function applyDrop(payload: DragPayload, target: DropTarget): void {
    if (readonly) return
    if (payload.kind === 'library') {
      onAdd?.(lane.id, payload.skillId)
      if (target.refSkillId) {
        onMove?.({ skillId: payload.skillId, fromStage: lane.id, toStage: lane.id, refSkillId: target.refSkillId, after: target.after })
      }
      return
    }
    if (payload.skillId === target.refSkillId) return
    onMove?.({ skillId: payload.skillId, fromStage: lane.id, toStage: lane.id, refSkillId: target.refSkillId, after: target.after })
  }

  function finishDrop(event: DragEvent<HTMLElement>, target: DropTarget): void {
    event.preventDefault()
    event.stopPropagation()
    if (dragging) applyDrop(dragging, target)
    setDragging(null)
    setDropTarget(null)
  }

  return (
    <Dialog title={`${lane.name}阶段 · Skill 编排`} onClose={onClose} testid="wb-skill-orchestration" panelClassName="w-[min(1180px,96vw)]">
      <p className="mb-4 text-sm leading-6 text-text-2">从左侧拖入 Skill。右侧会实时显示落点，以及哪些任务同时开始、哪些任务必须等待。</p>
      <div className="grid min-h-[600px] grid-cols-[350px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-bg max-[820px]:grid-cols-1">
        <section className="border-r border-border bg-card p-4 max-[820px]:border-r-0 max-[820px]:border-b">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-(--accent)" aria-hidden="true" />
            <h2 className="text-lg font-bold text-text">技能库</h2>
            <span className="ml-auto rounded-full bg-fill px-2 py-1 text-xs font-semibold text-text-3">{library.length} 项可用</span>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-border bg-bg px-3 focus-within:border-(--accent) focus-within:ring-3 focus-within:ring-accent-t">
            <Search className="h-4 w-4 text-text-3" aria-hidden="true" />
            <span className="sr-only">搜索技能</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none" placeholder="按用途搜索技能" />
          </label>
          <div className="mt-3 max-h-[505px] space-y-2 overflow-y-auto pr-1">
            {registry === null || registry === undefined ? (
              <p className="rounded-xl bg-fill p-4 text-sm text-text-3">技能库正在读取，暂时不能添加。</p>
            ) : library.length === 0 ? (
              <p className="rounded-xl bg-fill p-4 text-sm text-text-3">没有符合条件的可用技能。</p>
            ) : library.map((entry) => {
              const presentation = skillPresentation(entry.name, registry)
              const canDrag = !readonly && entry.installed && Boolean(onAdd)
              const isDragging = dragging?.kind === 'library' && dragging.skillId === entry.name
              return (
                <article
                  key={entry.name}
                  role="button"
                  tabIndex={canDrag ? 0 : -1}
                  aria-label={`${presentation.name}，拖入执行计划${entry.installed ? '' : '，尚未安装'}`}
                  aria-disabled={!canDrag}
                  data-testid={`wb-skill-library-${entry.name}`}
                  data-dragging={isDragging ? '' : undefined}
                  draggable={canDrag}
                  className={`group rounded-xl border border-border bg-bg p-3 transition-[border-color,box-shadow,opacity,transform] duration-150 hover:border-(--accent) hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent-t data-[dragging]:scale-[.98] data-[dragging]:opacity-45 motion-reduce:transition-none ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-55'}`}
                  title={presentation.technicalTitle}
                  onKeyDown={(event) => addFromKeyboard(event, entry)}
                  onDragStart={(event) => {
                    setDragging({ kind: 'library', skillId: entry.name })
                    if (event.dataTransfer) {
                      event.dataTransfer.effectAllowed = 'copy'
                      event.dataTransfer.setData('text/plain', entry.name)
                    }
                  }}
                  onDragEnd={() => { setDragging(null); setDropTarget(null) }}
                >
                  <div className="flex items-start gap-3">
                    <GripVertical className="mt-1 h-4 w-4 flex-none text-text-3 transition-colors group-hover:text-accent-d" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-text">{presentation.name}</h3>
                      <p className="mt-1 text-xs leading-5 text-text-3">{presentation.description}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-text-3"><span>{sourceName(entry.source)}</span><span>·</span><span className={entry.installed ? 'text-green' : 'text-amb-d'}>{entry.installed ? '已安装' : '未安装'}</span></div>
                    </div>
                    {canDrag && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-d opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">拖入计划 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span>}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section
          data-testid="wb-skill-plan-dropzone"
          className="min-w-0 p-4"
          onDragOver={(event) => {
            event.preventDefault()
            if (event.target === event.currentTarget) setDropTarget({ refSkillId: null, after: true })
          }}
          onDrop={(event) => finishDrop(event, dropTarget ?? { refSkillId: null, after: true })}
        >
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-(--accent)" aria-hidden="true" />
            <h2 className="text-lg font-bold text-text">{lane.name} · 执行计划</h2>
            <span className="ml-auto text-xs text-text-3">拖动排序 · 依赖决定批次</span>
          </div>

          <div className="mt-4">
            <SkillExecutionTopology skills={skills} depsBySkill={lane.skillDeps ?? {}} registry={registry} testId="wb-skill-topology" />
          </div>

          <ol className="relative mt-4 space-y-2">
            {skills.length === 0 && !dropTarget && <li className="rounded-xl border border-dashed border-border-2 bg-card/60 p-10 text-center text-sm text-text-3">拖入第一个 Skill，开始建立调用链</li>}
            {skills.map((skillId, index) => {
              const presentation = skillPresentation(skillId, registry)
              const deps = lane.skillDeps?.[skillId] ?? []
              const previous = skills[index - 1]
              const mode = customOpen.has(skillId) || (deps.length > 0 && !(deps.length === 1 && deps[0] === previous))
                ? 'custom'
                : deps.length === 0 ? 'parallel' : 'serial'
              const before = dropTarget?.refSkillId === skillId && !dropTarget.after
              const after = dropTarget?.refSkillId === skillId && dropTarget.after
              return (
                <li key={skillId} className="space-y-2">
                  {before && <DropPreview label={`放到 ${presentation.name} 前面`} />}
                  <article
                    draggable={!readonly && Boolean(onMove)}
                    data-testid={`wb-skill-plan-${skillId}`}
                    data-dragging={dragging?.kind === 'plan' && dragging.skillId === skillId ? '' : undefined}
                    className="relative rounded-2xl border border-border bg-card p-3 shadow-sm transition-[border-color,box-shadow,opacity,transform] duration-150 hover:border-accent-b hover:shadow-md data-[dragging]:scale-[.99] data-[dragging]:opacity-45 motion-reduce:transition-none"
                    title={presentation.technicalTitle}
                    onDragStart={(event) => {
                      event.stopPropagation()
                      setDragging({ kind: 'plan', skillId })
                      if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', skillId)
                      }
                    }}
                    onDragEnd={() => { setDragging(null); setDropTarget(null) }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      const rect = event.currentTarget.getBoundingClientRect()
                      setDropTarget({ refSkillId: skillId, after: event.clientY > rect.top + rect.height / 2 })
                    }}
                    onDrop={(event) => finishDrop(event, dropTarget ?? { refSkillId: skillId, after: false })}
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-5 w-5 flex-none cursor-grab text-text-3 active:cursor-grabbing" aria-hidden="true" />
                      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-(--accent) font-mono text-xs font-bold text-white shadow-sm">{index + 1}</span>
                      <div className="min-w-0 flex-1"><h3 className="font-semibold text-text">{presentation.name}</h3><p className="mt-0.5 text-xs text-text-3">{presentation.description}</p></div>
                      <div className="inline-flex rounded-xl bg-fill p-1" role="group" aria-label={`${skillId} 的执行方式`}>
                        <button type="button" aria-label={`${skillId} 与其他技能并行`} aria-pressed={mode === 'parallel'} disabled={readonly || !onDependencyChange} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-text-3 transition aria-pressed:bg-card aria-pressed:text-accent-d aria-pressed:shadow-sm" onClick={() => setExecutionMode(skillId, index, 'parallel')}>并行</button>
                        <button type="button" aria-label={`${skillId} 接续上一项`} aria-pressed={mode === 'serial'} disabled={readonly || !onDependencyChange || index === 0} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-text-3 transition aria-pressed:bg-card aria-pressed:text-accent-d aria-pressed:shadow-sm disabled:opacity-35" onClick={() => setExecutionMode(skillId, index, 'serial')}>串行</button>
                        <button type="button" aria-label={`${skillId} 自定义依赖`} aria-pressed={mode === 'custom'} disabled={readonly || !onDependencyChange} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-text-3 transition aria-pressed:bg-card aria-pressed:text-accent-d aria-pressed:shadow-sm" onClick={() => setExecutionMode(skillId, index, 'custom')}>依赖</button>
                      </div>
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:bg-red-t hover:text-red" aria-label={`移除 ${presentation.name}`} disabled={readonly || !onRemove} onClick={() => onRemove?.(lane.id, skillId)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                    {mode === 'custom' && (
                      <fieldset className="mt-3 border-t border-border pt-3">
                        <legend className="px-1 text-xs font-semibold text-text-2">完成哪些 Skill 后才能开始</legend>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {skills.filter((candidate) => candidate !== skillId).map((candidate) => {
                            const checked = deps.includes(candidate)
                            return <label key={candidate} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-bg px-3 text-xs text-text-2"><input type="checkbox" checked={checked} onChange={() => onDependencyChange?.(lane.id, skillId, checked ? null : candidate, checked ? candidate : null)} />{skillPresentation(candidate, registry).name}</label>
                          })}
                        </div>
                      </fieldset>
                    )}
                  </article>
                  {after && <DropPreview label={`放到 ${presentation.name} 后面`} />}
                </li>
              )
            })}
            {dropTarget?.refSkillId === null && <li><DropPreview label="放到执行计划末尾" /></li>}
          </ol>
        </section>
      </div>
      <div className="mt-4 flex justify-end"><button type="button" className="min-h-10 rounded-xl bg-(--accent) px-5 text-sm font-semibold text-white hover:brightness-95" onClick={onClose}>完成</button></div>
    </Dialog>
  )
}
