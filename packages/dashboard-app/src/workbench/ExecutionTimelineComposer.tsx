import { useEffect, useMemo, useState, type DragEvent } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  CircleHelp,
  Eye,
  GripVertical,
  LockKeyhole,
  LogOut,
  X,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { outputPresentation } from '../shared/outputPresentation'
import { SkillExecutionTopology } from './SkillExecutionTopology'
import { skillPresentation } from './skillPresentation'
import type { ExecutionTimelineComposerProps } from './executionTimelineTypes'
export type { TimelineSkillMove } from './executionTimelineTypes'
import { EVENT_ORDER, PreviewRow, TimelineHookNodes, sourceLabel, statusTone } from './TimelineHookRows'
import { TimelineStageStrip } from './TimelineStageStrip'
export function ExecutionTimelineComposer({
  workflowName,
  lanes,
  selectedId,
  readonly,
  hooks,
  skillRegistry,
  selectedSkillZone,
  prompt = '',
  onSelect,
  onSkillMove,
  onSkillRemove,
  onPromptChange,
  onLaneEdit,
  onRemoveStage,
  onAddStage,
  onStageReorder,
  onOpenSkillEditor,
}: ExecutionTimelineComposerProps): JSX.Element {
  const selected = lanes.find((lane) => lane.id === selectedId) ?? lanes[0] ?? null
  const [draggingSkill, setDraggingSkill] = useState<string | null>(null)
  const [skillDrop, setSkillDrop] = useState<{ id: string; after: boolean } | null>(null)
  const [codexPanel, setCodexPanel] = useState<'skills' | 'prompt'>('skills')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)

  const registryByName = useMemo(
    () => new Map((skillRegistry ?? []).map((entry) => [entry.name, entry])),
    [skillRegistry],
  )
  const skills = selected?.skills
  const enabledHooks = selected && hooks.hooks !== null
    ? hooks.hooks.filter((hook) => !(`${hook.id}.${selected.id}` in hooks.matrix))
    : null
  const missingSkills = skills && skillRegistry !== null && skillRegistry !== undefined
    ? skills.filter((id) => registryByName.get(id)?.installed !== true).length
    : null
  const dependencyCount = selected
    ? Object.values(selected.skillDeps ?? {}).reduce((total, deps) => total + deps.length, 0)
    : 0
  useEffect(() => {
    setEditingName(false)
    setNameDraft('')
    setConfirmRemove(false)
  }, [selected?.id])

  function commitName(): void {
    if (!selected) return
    const label = nameDraft.trim()
    if (label && label !== selected.name) onLaneEdit?.(selected.id, { label })
    setEditingName(false)
  }

  function skillDropAt(event: DragEvent<HTMLElement>, refSkillId: string): void {
    if (!selected || !draggingSkill || draggingSkill === refSkillId || !onSkillMove) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const after = event.clientY > rect.top + rect.height / 2
    onSkillMove({
      skillId: draggingSkill,
      fromStage: selected.id,
      toStage: selected.id,
      refSkillId,
      after,
    })
    setDraggingSkill(null)
    setSkillDrop(null)
  }

  if (!selected) {
    return <p className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center text-sm text-text-3">工作流没有阶段</p>
  }

  const nextLane = lanes[lanes.findIndex((lane) => lane.id === selected.id) + 1]

  return (
    <div data-testid="wb-timeline-composer" className="space-y-5">
      <TimelineStageStrip
        workflowName={workflowName}
        lanes={lanes}
        selectedId={selected.id}
        readonly={readonly}
        onSelect={onSelect}
        onAddStage={onAddStage}
        onStageReorder={onStageReorder}
      />
      <section data-testid="step-policy-editor" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-(--accent)" aria-hidden="true" />
              {readonly || !onLaneEdit ? (
                <h2 data-testid={`wb-lane-name-${selected.id}`} className="text-[24px] font-bold tracking-[-0.02em] text-text">{selected.name}阶段</h2>
              ) : editingName ? (
                <input
                  autoFocus
                  data-testid={`wb-lane-name-input-${selected.id}`}
                  aria-label="阶段名称"
                  value={nameDraft}
                  className="h-10 min-w-44 rounded-lg border border-(--accent) bg-card px-3 text-[20px] font-bold text-text outline-none ring-3 ring-accent-t"
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={commitName}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitName()
                    if (event.key === 'Escape') setEditingName(false)
                  }}
                />
              ) : (
                <button
                  type="button"
                  data-testid={`wb-lane-name-${selected.id}`}
                  className="rounded-lg text-left text-[24px] font-bold tracking-[-0.02em] text-text outline-none hover:text-accent-d focus-visible:ring-3 focus-visible:ring-accent-t disabled:pointer-events-none"
                  onClick={() => {
                    setNameDraft(selected.name)
                    setEditingName(true)
                  }}
                >
                  {selected.name}阶段
                </button>
              )}
              <span className="grid h-9 w-9 place-items-center rounded-full text-text-3" title="这里按真实执行顺序展示进入阶段、准备输入、运行 Codex、Hook 与结果检查。" aria-label="阶段执行说明">
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] leading-6 text-text-2">
              <span>进入{selected.name}</span><ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span>准备输入</span><ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Codex 执行</span><ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span>检查结果</span><ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{nextLane ? `进入${nextLane.name}` : '结束工作流'}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selected.gate && (
              <span data-testid="wb-selected-gate" className="rounded-full bg-red-t px-3 py-1.5 text-xs font-semibold text-red-d">复核门</span>
            )}
            {!readonly && onLaneEdit && (
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-fill px-3 text-xs font-semibold text-text-2">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="复核门"
                  data-testid={`wb-lane-gate-sw-${selected.id}`}
                  checked={Boolean(selected.gate)}
                  className="accent-(--accent)"
                  onChange={(event) => onLaneEdit(selected.id, { gate: event.target.checked ? 'review' : null })}
                />
                离开前复核
              </label>
            )}
            {!readonly && onRemoveStage && lanes.length > 1 && (
              confirmRemove ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-red-t p-1">
                  <button type="button" className="min-h-8 rounded-md px-2.5 text-xs font-semibold text-red-d hover:bg-card" onClick={() => { onRemoveStage(selected.id); setConfirmRemove(false) }}>确认删除</button>
                  <button type="button" className="min-h-8 rounded-md px-2.5 text-xs text-text-3 hover:bg-card" onClick={() => setConfirmRemove(false)}>取消</button>
                </span>
              ) : (
                <button type="button" data-testid={`wb-lane-rm-${selected.id}`} className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:bg-red-t hover:text-red-d" aria-label="删除阶段" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )
            )}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_260px] items-start gap-5 max-[1000px]:grid-cols-1">
          <div data-testid={`wb-lane-hooks-${selected.id}`} className="relative min-w-0 pl-12 before:absolute before:top-5 before:bottom-5 before:left-[19px] before:w-px before:bg-border-2 before:content-['']">
            <TimelineHookNodes events={EVENT_ORDER.slice(0, 2)} stageId={selected.id} config={hooks} readonly={readonly} />

            <div className="relative mb-2 rounded-2xl border border-accent-b bg-accent-t/35 p-4 shadow-[0_8px_28px_-24px_var(--accent)]" data-testid="wb-timeline-node-codex">
              <span className="absolute top-4 -left-[47px] z-10 grid h-8 w-8 place-items-center rounded-full border border-(--accent) bg-(--accent) text-white">
                <Braces className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="text-base font-semibold text-text">运行 Codex</h3>
                <div className="inline-flex rounded-lg bg-fill p-0.5 text-xs">
                  <button
                    type="button"
                    aria-pressed={codexPanel === 'skills'}
                    className="min-h-8 rounded-md px-3 font-semibold text-text-3 hover:text-text aria-pressed:bg-card aria-pressed:text-accent-d aria-pressed:shadow-sm"
                    onClick={() => setCodexPanel('skills')}
                  >
                    Skill 编排
                  </button>
                  <button
                    type="button"
                    aria-pressed={codexPanel === 'prompt'}
                    className="min-h-8 rounded-md px-3 font-semibold text-text-3 hover:text-text aria-pressed:bg-card aria-pressed:text-accent-d aria-pressed:shadow-sm"
                    onClick={() => setCodexPanel('prompt')}
                  >
                    执行指令
                  </button>
                </div>
                <span className="ml-auto text-xs text-text-3">{codexPanel === 'skills' ? '显示真实依赖关系' : '随阶段定义保存'}</span>
              </div>

              {codexPanel === 'prompt' ? (
                <div className="rounded-xl bg-card p-3 shadow-sm ring-1 ring-border">
                  <label htmlFor={`wb-timeline-prompt-${selected.id}`} className="mb-2 block text-xs font-semibold text-text-2">Codex 阶段指令</label>
                  <textarea
                    id={`wb-timeline-prompt-${selected.id}`}
                    value={prompt}
                    readOnly={readonly || !onPromptChange}
                    rows={7}
                    placeholder="说明这一阶段要完成什么、需要验证什么。"
                    className="min-h-36 w-full resize-y rounded-lg border border-border bg-bg px-3 py-2.5 text-sm leading-6 text-text outline-none placeholder:text-text-3 focus:border-(--accent) focus:ring-3 focus:ring-accent-t read-only:cursor-default read-only:bg-fill"
                    onChange={(event) => onPromptChange?.(event.target.value)}
                  />
                  <p className="mt-2 text-xs leading-5 text-text-3">保存 Workflow 后生效；运行时会与当前阶段、Skill 和 Hook 一起冻结。</p>
                </div>
              ) : skills === undefined ? (
                selectedSkillZone ?? <p className="rounded-lg bg-fill px-3 py-4 text-sm text-text-3">技能来自运行时矩阵，当前数据尚未就绪。</p>
              ) : (
                <div className="space-y-3">
                  {skills.length > 0 && (
                    <SkillExecutionTopology
                      skills={skills}
                      depsBySkill={selected.skillDeps ?? {}}
                      registry={skillRegistry}
                      testId="wb-skill-topology-inline"
                      compact
                    />
                  )}
                  <div className="rounded-xl bg-card px-3 shadow-sm ring-1 ring-border">
                  {skills.length === 0 && <p className="py-5 text-center text-sm text-text-3">此阶段尚未配置 Skill</p>}
                  {skills.map((skillId) => {
                    const entry = registryByName.get(skillId)
                    const presentation = skillPresentation(skillId, skillRegistry)
                    const deps = selected.skillDeps?.[skillId] ?? []
                    const isDrop = skillDrop?.id === skillId
                    return (
                      <div
                        key={skillId}
                        draggable={!readonly && Boolean(onSkillMove)}
                        data-testid={`wb-timeline-skill-${skillId}`}
                        data-drop={isDrop ? (skillDrop?.after ? 'after' : 'before') : undefined}
                        className="relative flex min-h-[62px] items-center gap-3 border-b border-border py-2.5 last:border-b-0 data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:top-0 data-[drop=before]:before:h-0.5 data-[drop=before]:before:bg-(--accent) data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:bottom-0 data-[drop=after]:after:h-0.5 data-[drop=after]:after:bg-(--accent)"
                        onDragStart={(event) => {
                          setDraggingSkill(skillId)
                          event.dataTransfer?.setData('text/plain', skillId)
                          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(event) => {
                          if (!draggingSkill || draggingSkill === skillId) return
                          event.preventDefault()
                          const rect = event.currentTarget.getBoundingClientRect()
                          setSkillDrop({ id: skillId, after: event.clientY > rect.top + rect.height / 2 })
                        }}
                        onDrop={(event) => skillDropAt(event, skillId)}
                        onDragEnd={() => { setDraggingSkill(null); setSkillDrop(null) }}
                      >
                        {!readonly && onSkillMove && <GripVertical className="h-5 w-5 flex-none cursor-grab text-text-3 active:cursor-grabbing" aria-hidden="true" />}
                        <span className={`h-2.5 w-2.5 flex-none rounded-full ${deps.length > 0 ? 'bg-(--accent)' : 'bg-green'}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span data-testid={`wb-lane-sk-${selected.id}-${skillId}`} className="text-[13px] font-semibold text-text" title={presentation.technicalTitle}>{presentation.name}</span>
                            <span className={`text-[11px] font-semibold ${statusTone(entry?.installed)}`}>
                              {entry ? (entry.installed ? '已安装' : '未安装') : '状态未知'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-text-3">
                            {presentation.description} · {entry ? sourceLabel(entry.source) : '未在当前技能库中发现'}
                            {' · '}{deps.length > 0 ? `等待 ${deps.join('、')}` : skills.length > 1 ? '可并行启动' : '独立执行'}
                          </p>
                        </div>
                        {!readonly && onSkillRemove && (
                          <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:bg-fill hover:text-red" aria-label={`移除 ${skillId}`} onClick={() => onSkillRemove(selected.id, skillId)}>
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  </div>
                </div>
              )}

              {codexPanel === 'skills' && !readonly && onOpenSkillEditor && skills !== undefined && (
                <div className="mt-3">
                  <button type="button" data-testid={`wb-lane-sk-add-${selected.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-border-2 px-3 text-sm font-semibold text-accent-d hover:border-(--accent) hover:bg-card" onClick={onOpenSkillEditor}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> 添加 Skill
                  </button>
                </div>
              )}
            </div>

            <TimelineHookNodes events={EVENT_ORDER.slice(2)} stageId={selected.id} config={hooks} readonly={readonly} />

            <div className="relative mb-2 rounded-xl border border-border bg-card px-4 py-3" data-testid="wb-timeline-node-guard">
              <span className="absolute top-3 -left-[47px] z-10 grid h-8 w-8 place-items-center rounded-full border border-border-2 bg-card text-text-3"><ShieldCheck className="h-4 w-4" aria-hidden="true" /></span>
              <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
                <h3 className="w-32 flex-none text-sm font-semibold text-text">检查结果</h3>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-t px-2.5 py-1.5 text-xs font-semibold text-green-d"><ShieldCheck className="h-4 w-4" aria-hidden="true" />安全边界 · 已启用</span>
                <span className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${selected.nonemptyGuard ? 'bg-green-t text-green-d' : 'bg-fill text-text-3'}`}><Check className="h-4 w-4" aria-hidden="true" />产出检查 · {selected.nonemptyGuard ? '按运行结果校验' : '由 Agent 判断'}</span>
              </div>
              <div data-testid={`wb-lane-outs-${selected.id}`} className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-semibold text-text-2">运行时产出</span>
                <span className="text-xs text-text-3">运行 Agent 显式登记，系统校验后展示</span>
                {selected.outputs.map((output) => {
                  const presentation = outputPresentation(output)
                  return (
                  <span key={output} title={`系统已知的结果类型：${presentation.title}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-fill px-2.5 text-xs text-text-2">
                    {presentation.label}
                  </span>
                  )
                })}
                {selected.outputs.length === 0 && <span className="rounded-lg bg-fill px-2.5 py-1.5 text-xs text-text-3">当前没有预设类型</span>}
              </div>
            </div>

            <div className="relative rounded-xl border border-border bg-card px-4 py-3" data-testid="wb-timeline-node-leave">
              <span className="absolute top-3 -left-[47px] z-10 grid h-8 w-8 place-items-center rounded-full border border-border-2 bg-card text-text-3"><LogOut className="h-4 w-4" aria-hidden="true" /></span>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="w-32 flex-none text-sm font-semibold text-text">离开阶段</h3>
                <span className="text-sm text-text-2">{nextLane ? `成功后进入 ${nextLane.name}` : '这是工作流终点'}</span>
                {selected.gate && <span className="rounded-lg bg-red-t px-2.5 py-1.5 text-xs font-semibold text-red-d">复核通过后才能离开</span>}
                {selected.linkEvent && <span className="ml-auto text-xs text-text-3">已配置推进条件</span>}
              </div>
            </div>
          </div>

          <aside data-testid="wb-timeline-preview" className="sticky top-(--nav-offset) rounded-2xl bg-fill p-4 max-[1000px]:static">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-(--accent)" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-text">运行前事实</h3>
              <ChevronDown className="ml-auto h-4 w-4 text-text-3" aria-hidden="true" />
            </div>
            <div className="mt-4 space-y-2" data-testid="wb-runtime-facts">
              <PreviewRow label="技能编排" value={skills === undefined ? '运行时解析' : `${skills.length} 个 Skill · ${dependencyCount} 条依赖`} ready={skills === undefined || skills.length > 0} />
              <PreviewRow label="Hook 覆盖" value={enabledHooks === null ? '读取中' : `${enabledHooks.length} 个 Hook · ${enabledHooks.length}/${hooks.hooks?.length ?? 0} 已启用`} ready={enabledHooks !== null && enabledHooks.length > 0} />
              <PreviewRow label="运行时产出" value={selected.nonemptyGuard ? '登记后执行完整性校验' : '登记后随进度展示'} ready />
              <PreviewRow label="依赖关系" value={dependencyCount > 0 ? `${dependencyCount} 条真实依赖` : '全部可并行'} ready />
              <PreviewRow label="执行指令" value={prompt.trim() ? `${prompt.trim().length} 字` : '尚未填写'} ready={prompt.trim().length > 0} />
            </div>
            {missingSkills !== null && missingSkills > 0 && (
              <p className="mt-3 flex gap-2 rounded-lg bg-amb-t px-3 py-2 text-xs leading-5 text-amb-d"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />存在未安装 Skill，真实运行会由后端准入检查决定是否阻断。</p>
            )}
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs text-text-2">
              <LockKeyhole className="h-4 w-4 text-text-3" aria-hidden="true" />
              <span>快照</span><strong className="ml-auto font-semibold text-text">执行时冻结</strong>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
