import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, addEdge,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { getToken } from '../api/client'
import { useT } from '../i18n'
import { layoutNodes } from './layout'

/**
 * WorkflowCanvas（GOAL E8 workflow 编辑器画布 Task 6）—— 顶层 step 拓扑图：
 * 渲染 / 增删 step 节点 / 增删 transition 连线 / 保存。消费 Task 2/3 的
 * GET /api/workflows/:name、POST /api/workflows/:name；Task 4 的 layoutNodes 计算初始节点坐标
 * （不持久化坐标——见设计文档 §2.3、layout.ts 顶部注释）。本任务只做**顶层**（step 拓扑）；
 * 钻入 skill DAG（某 step 内部）留给 Task 7——Task 7 会在这同一个文件上加分支逻辑，不是新开
 * 文件，两层共享同一套画布状态管理是设计文档 §1 决策 3 的直接后果，故这里保持结构不做额外重排。
 *
 * 前端本地声明的形状，逐字对齐 kernel WorkflowDef/StepDef 的 JSON 形状（跨 HTTP 边界，不 import
 * kernel 类型只为了编译期形状——同 LoopsPanel.tsx/AfkWorkbench.tsx/WorkflowEditorView.tsx 的既有
 * 惯例：前端自己声明匹配的 interface）。
 *
 * 两个实现前必须验证、不能假设"看起来应该行"的点（均已用独立 spike 实测过，不是抄计划草稿）：
 *
 * 1) 测试要"真触发" onConnect，不能靠真实鼠标拖拽物理模拟（xyflow 内部坐标/命中测试在 jsdom
 *    下不可靠，设计文档 §4 也明确不重新测试库自身的拖拽行为）。计划草稿设想
 *    `fireEvent.click(el, { detail: {...} })` 能让 `(e.nativeEvent as CustomEvent).detail`
 *    拿到任意对象——用独立 spike 实测验证过这不成立：`detail` 是 UIEvent/MouseEvent 规范里的
 *    数字点击次数字段，`new MouseEvent('click', { detail: obj })` 下 detail 落地为数字 `0`，
 *    传入的对象整个丢失（jsdom 遵循规范里 `detail` 是 `long` 而非 `any` 的行为）。因此这里改用
 *    计划本身指出的兜底方案：真实 DOM `CustomEvent('debug-connect', { detail })`，测试用
 *    `fireEvent(el, new CustomEvent(...))` 派发，组件侧不经 React 的 onClick prop，而是用 ref
 *    在真实 DOM 节点上 `addEventListener('debug-connect', ...)` 原生监听——同一 spike 验证过这条
 *    路径对象原样送达。真实用户走 xyflow 原生拖拽触发的是同一个 `onConnect` 回调，两条路径最终
 *    收敛到同一处逻辑，隐藏节点只是测试专用的开发者钩子，不是给生产环境用的按钮。
 *    这条路径本身在隔离 spike 里跑通之后，接进本组件跑全量测试又炸出第二层坑（spike 没覆盖到）：
 *    最初用 `useRef` + `useEffect(fn, [onConnect])` 挂监听器，实测两个 onConnect 相关用例仍然
 *    失败——本组件加载中 / 加载失败会提前 return（不渲染隐藏 div），只有 wf 加载完成后才第一次
 *    渲染出这个节点；而 `onConnect` 是 `useCallback([])`，引用全程不变，`useEffect` 的依赖数组
 *    在"加载态→加载完成"这次重渲染前后没有变化，effect 不会重新执行，监听器就停留在第一次挂载
 *    （加载态、ref.current 还是 null）时"跑了但没挂上"的状态，之后再也没机会补挂。改成 callback
 *    ref（见下）后不再依赖依赖数组时序，两个用例才真正转绿。
 *
 * 2) `useNodesState`/`useEdgesState` 返回的 setter 是否支持函数式更新 `(prev) => next`——已读
 *    node_modules/@xyflow/react 的 dist 源码确认（非猜测）：两个 hook 内部就是
 *    `const [nodes, setNodes] = useState(initialNodes)`，直接把 React 自己的 `useState` setter
 *    透传返回（类型也是 `Dispatch<SetStateAction<NodeType[]>>`，与 useState 完全一致），因此全组件
 *    放心用函数式更新，同 React 自己的 useState 语义。
 */
interface FieldRef { field: string; type: 'string' | 'file_path' | 'boolean' }
interface SkillRef { id: string; depends_on?: string[] }
type GuardConfig = { type: 'tasks-at-least'; n: number } | { type: 'nonempty-output' }
interface StepTransition { event: string; to: string }
interface StepDef {
  id: string; label: string; gate: 'review' | 'confirm' | null
  skills: SkillRef[]; inputs: FieldRef[]; outputs: FieldRef[]
  guards: GuardConfig[]; transitions: StepTransition[]
}
interface WorkflowDef { name: string; steps: StepDef[] }

export interface WorkflowCanvasProps {
  root: string
  name: string
  onBack: () => void
}

interface ErrorBody { error?: string; errors?: string[] }
/** 非 2xx 响应尽量读出 server 的 { error } 或 { errors } 文案；没有 JSON 体就吞掉，回落调用方的通用文案。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
    if (Array.isArray(body?.errors)) return body.errors.join('; ')
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

function stepsToNodes(steps: StepDef[]): Node[] {
  const positions = layoutNodes(steps, steps.flatMap((s) => s.transitions.map((t) => ({ from: s.id, to: t.to }))))
  return steps.map((s) => ({
    id: s.id,
    position: positions.get(s.id) ?? { x: 0, y: 0 },
    data: { label: s.label ? `${s.id} (${s.label})` : s.id },
  }))
}

function stepsToEdges(steps: StepDef[]): Edge[] {
  return steps.flatMap((s) => s.transitions.map((t) => ({
    id: `${s.id}->${t.to}:${t.event}`,
    source: s.id,
    target: t.to,
    label: t.event,
  })))
}

function WorkflowCanvasInner({ root, name, onBack }: WorkflowCanvasProps): JSX.Element {
  const { t } = useT()
  const [wf, setWf] = useState<WorkflowDef | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [addStepOpen, setAddStepOpen] = useState(false)
  const [newStepId, setNewStepId] = useState('')
  const [addStepError, setAddStepError] = useState<string | null>(null)
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null)
  const [eventName, setEventName] = useState('')
  const [connectError, setConnectError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' })

  useEffect(() => {
    fetch(`/api/workflows/${encodeURIComponent(name)}?root=${encodeURIComponent(root)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<WorkflowDef>
      })
      .then((body) => {
        setWf(body)
        setNodes(stepsToNodes(body.steps))
        setEdges(stepsToEdges(body.steps))
      })
      .catch((err: unknown) => setLoadError(t('workflow_editor.load_error_wf', { msg: err instanceof Error ? err.message : t('workflow_editor.network_error') })))
  }, [root, name, t, setNodes, setEdges])

  const stepIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])

  function openAddStep(): void {
    setAddStepOpen(true)
    setNewStepId('')
    setAddStepError(null)
  }

  function confirmAddStep(): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(newStepId) || stepIds.has(newStepId)) {
      setAddStepError(t('workflow_editor.duplicate_id'))
      return
    }
    const blank: StepDef = { id: newStepId, label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }
    setWf((prev) => (prev ? { ...prev, steps: [...prev.steps, blank] } : prev))
    setNodes((nds) => [...nds, { id: newStepId, position: { x: 0, y: nds.length * 100 }, data: { label: newStepId } }])
    setAddStepOpen(false)
  }

  // 真实用户走 xyflow 原生拖拽触发的回调；测试经下面的 debug-trigger 隐藏节点直接派发同一个函数。
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    setPendingConnection(connection)
    setEventName('')
    setConnectError(null)
  }, [])

  function confirmConnect(): void {
    if (!pendingConnection || !wf) return
    const { source, target } = pendingConnection
    const sourceStep = wf.steps.find((s) => s.id === source)
    if (sourceStep?.transitions.some((tr) => tr.event === eventName)) {
      setConnectError(t('workflow_editor.duplicate_event'))
      return
    }
    setWf((prev) => prev
      ? { ...prev, steps: prev.steps.map((s) => (s.id === source ? { ...s, transitions: [...s.transitions, { event: eventName, to: target! }] } : s)) }
      : prev)
    setEdges((eds) => addEdge({ ...pendingConnection, label: eventName, id: `${source}->${target}:${eventName}` }, eds))
    setPendingConnection(null)
  }

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const deletedIds = new Set(deleted.map((n) => n.id))
    setWf((prev) => prev
      ? {
          ...prev,
          steps: prev.steps
            .filter((s) => !deletedIds.has(s.id))
            .map((s) => ({ ...s, transitions: s.transitions.filter((tr) => !deletedIds.has(tr.to)) })),
        }
      : prev)
  }, [])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    setWf((prev) => {
      if (!prev) return prev
      const removed = new Set(deleted.map((e) => e.id))
      return {
        ...prev,
        steps: prev.steps.map((s) => ({
          ...s,
          transitions: s.transitions.filter((tr) => !removed.has(`${s.id}->${tr.to}:${tr.event}`)),
        })),
      }
    })
  }, [])

  // ── debug-trigger：测试专用钩子（known pitfall #1 的兜底方案，见文件头注释）──
  // 真实 DOM CustomEvent，经 ref 原生 addEventListener 接收，绕开 React onClick/detail 不支持
  // 任意对象这个限制。收到后调用的就是上面同一个 onConnect——不是另建一条测试专用逻辑。
  //
  // 用 callback ref 而非 `useRef` + `useEffect(fn, [onConnect])`：本组件加载态/错误态走提前
  // return（不渲染这个隐藏 div），只有 wf 加载完成后才第一次渲染出这个节点。若用
  // useEffect(fn, [onConnect])，因为 onConnect 引用（useCallback([]))全程不变，effect 只在首次
  // 挂载（加载态、这个 div 还不存在、ref.current 仍是 null）时跑一次，之后 wf 加载完、div 真正
  // 出现时不会再重新执行——监听器永远没挂上（跑一次全量测试才炸出来的真实回归，不是纸面推演）。
  // callback ref 由 React 在节点真正 attach/detach 时调用，不受依赖数组是否变化影响，天然规避
  // 这个时序坑，且不需要额外记录"上一个节点"来做 cleanup（这个隐藏节点一旦渲染就不会再被移除，
  // 组件卸载时随 DOM 子树一起被回收）。
  const onDebugConnect = useCallback((e: Event): void => {
    const detail = (e as CustomEvent<Connection>).detail
    if (detail) onConnect(detail)
  }, [onConnect])
  const debugTriggerRef = useCallback((el: HTMLDivElement | null) => {
    el?.addEventListener('debug-connect', onDebugConnect)
  }, [onDebugConnect])

  // 同一套 debug-trigger 惯例，覆盖 onNodesDelete/onEdgesDelete——两个回调本身早已真实接在
  // <ReactFlow> 上（真实用户走选中+Delete 键触发的就是它们），但此前没有任何测试真正调用过；
  // Task 7 即将在这同一个文件上把它们改成按 drillStepId 分支的版本，改之前这段状态变更逻辑
  // 完全没有回归保护是真实风险（whole-branch review 指出）。触发/清理方式与上面 onConnect
  // 保持一致，不引入新模式。
  const onDebugDeleteNodes = useCallback((e: Event): void => {
    const detail = (e as CustomEvent<Node[]>).detail
    if (detail) onNodesDelete(detail)
  }, [onNodesDelete])
  const debugDeleteNodesRef = useCallback((el: HTMLDivElement | null) => {
    el?.addEventListener('debug-delete-nodes', onDebugDeleteNodes)
  }, [onDebugDeleteNodes])

  const onDebugDeleteEdges = useCallback((e: Event): void => {
    const detail = (e as CustomEvent<Edge[]>).detail
    if (detail) onEdgesDelete(detail)
  }, [onEdgesDelete])
  const debugDeleteEdgesRef = useCallback((el: HTMLDivElement | null) => {
    el?.addEventListener('debug-delete-edges', onDebugDeleteEdges)
  }, [onDebugDeleteEdges])

  async function save(): Promise<void> {
    if (!wf) return
    setSaveStatus({ kind: 'idle' })
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ...wf, root }),
      })
      if (!res.ok) {
        setSaveStatus({ kind: 'error', msg: (await readErrorDetail(res)) || `(${res.status})` })
        return
      }
      setSaveStatus({ kind: 'ok' })
    } catch (err) {
      setSaveStatus({ kind: 'error', msg: err instanceof Error ? err.message : t('workflow_editor.network_error') })
    }
  }

  if (loadError) return <p className="subtitle">{loadError}</p>
  if (!wf) return <p className="subtitle">{t('common.loading')}</p>

  return (
    <div className="workflow-canvas">
      <div className="workflow-canvas__toolbar">
        <button onClick={onBack}>{t('workflow_editor.back')}</button>
        <button onClick={openAddStep}>{t('workflow_editor.add_step')}</button>
        <button onClick={save}>{t('workflow_editor.save')}</button>
        {saveStatus.kind === 'ok' && <span>{t('workflow_editor.save_success')}</span>}
        {saveStatus.kind === 'error' && <span>{t('workflow_editor.save_error')}{saveStatus.msg}</span>}
      </div>
      {addStepOpen && (
        <div role="dialog">
          <input placeholder={t('workflow_editor.add_step_prompt')} value={newStepId} onChange={(e) => setNewStepId(e.target.value)} />
          <button onClick={confirmAddStep}>{t('workflow_editor.confirm')}</button>
          <button onClick={() => setAddStepOpen(false)}>{t('workflow_editor.cancel')}</button>
          {addStepError && <p>{addStepError}</p>}
        </div>
      )}
      {pendingConnection && (
        <div role="dialog">
          <input placeholder={t('workflow_editor.add_transition_prompt')} value={eventName} onChange={(e) => setEventName(e.target.value)} />
          <button onClick={confirmConnect}>{t('workflow_editor.confirm')}</button>
          <button onClick={() => setPendingConnection(null)}>{t('workflow_editor.cancel')}</button>
          {connectError && <p>{connectError}</p>}
        </div>
      )}
      <div data-testid="debug-trigger-connect" ref={debugTriggerRef} style={{ display: 'none' }} />
      <div data-testid="debug-trigger-delete-nodes" ref={debugDeleteNodesRef} style={{ display: 'none' }} />
      <div data-testid="debug-trigger-delete-edges" ref={debugDeleteEdgesRef} style={{ display: 'none' }} />
      <div style={{ height: 480 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}

export function WorkflowCanvas(props: WorkflowCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
