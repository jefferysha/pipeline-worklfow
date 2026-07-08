import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, addEdge,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { getToken } from '../api/client'
import { useT } from '../i18n'
import { layoutNodes } from './layout'

/**
 * WorkflowCanvas（GOAL E8 workflow 编辑器画布 Task 6 + Task 7）—— 顶层 step 拓扑图 + 钻入
 * skill DAG 层：渲染 / 增删 step 节点或 skill 节点 / 增删 transition 或 depends_on 连线 / 保存。
 * 消费 Task 2/3 的 GET /api/workflows/:name、POST /api/workflows/:name；Task 4 的 layoutNodes
 * 计算初始节点坐标（不持久化坐标——见设计文档 §2.3、layout.ts 顶部注释）。
 *
 * Task 7（钻入 skill DAG 层）在 Task 6 已有的顶层 step 拓扑基础上加一层"当前渲染哪个数据源"的
 * 分支，不是另起一套并行状态（设计文档 §1 决策 3）：新增 `drillStepId: string | null` state，
 * 非 null 时表示正在看该 step 内部的 skill/depends_on 拓扑；双击顶层 step 节点
 * （`onNodeDoubleClick`）进入，面包屑"‹ 返回顶层"按钮退出（`setDrillStepId(null)`）。
 * `confirmAddStep`/`onConnect`/`onNodesDelete`/`onEdgesDelete` 四个既有函数按 `drillStepId`
 * 分叉：非空时操作 `currentStep.skills`/`depends_on`，为空时操作 `wf.steps`/`transitions`
 * （原有顶层逻辑不变）。`confirmConnect`（"输入 event 名"弹窗的确认按钮）不需要分叉——它只在
 * `pendingConnection` 非 null 时才可能被调用，而 `pendingConnection` 只在 `onConnect` 的顶层分支
 * （`drillStepId` 为空那条路径）才会被设置，钻入态下 `onConnect` 直接落地 depends_on 并提前
 * return，从不设置 `pendingConnection`——因此 `confirmConnect` 在钻入态下结构性不可达，维持
 * 原样即可（本文件"skill 层触发 onConnect 不弹 event 名输入框"这条测试即是这个不可达性的
 * 直接验证：如果 `onConnect` 钻入分支漏写、意外流入了顶层分支，`pendingConnection` 就会被设置，
 * 弹窗就会出现，测试会炸)。
 *
 * 渲染节点/边这件事从"哪个数据源"抽成一个独立 useEffect（依赖 `[wf, drillStepId, currentStep,
 * setNodes, setEdges]`）：非钻入态用 `stepsToNodes`/`stepsToEdges`（Task 6 原样），钻入态用新增的
 * `skillsToNodes`/`skillsToEdges`（结构逐一对应，只是数据源换成 `currentStep.skills`/
 * `depends_on`，布局同样复用 Task 4 的 `layoutNodes`，不引入新布局库）。这个 effect 是
 * `wf` 变化后节点/边视图更新的唯一权威来源：`confirmAddStep`/`onConnect` 钻入分支不再手动
 * append `nodes`（对照 Task 6 `confirmAddStep` 曾经手写的
 * `setNodes((nds) => [...nds, {...}])`——钻入态新增 skill 时，光凭 `newStepId` 算不出该渲染在
 * 顶层图还是 skill 图，与其在两处分别手写增量更新，不如让这个 effect 统一从 `wf`
 * 重新派生，两层共用同一条更新路径）。`onConnect` 钻入分支仍保留手动
 * `setEdges((eds) => addEdge(connection, eds))`（同顶层 `confirmConnect` 的既有写法一致），
 * 虽然紧接着这个 effect 会因为 `wf` 变化而重新计算一次 `edges`（把这次手动 addEdge
 * 的结果整个覆盖掉，等效但不是同一个数组引用），但不产生错误结果，为了两条 onConnect
 * 路径写法尽量对称、不引入不必要的分歧，这里没有删掉。加载完成后的首次 `setNodes`/`setEdges`
 * （fetch effect 内部）仍保留不动——避免额外引入"首次渲染短暂空白再刷新"这一步从未被
 * Task 6 验证过的时序（这个新 effect 加载完成后同样会因为 `wf` 从 null 变为已加载数据而再跑
 * 一次，两次计算结果一致，多余但无害）。
 *
 * 前端本地声明的形状，逐字对齐 kernel WorkflowDef/StepDef 的 JSON 形状（跨 HTTP 边界，不 import
 * kernel 类型只为了编译期形状——同 LoopsPanel.tsx/AfkWorkbench.tsx/WorkflowEditorView.tsx 的既有
 * 惯例：前端自己声明匹配的 interface）。
 *
 * Task 6 实现前就必须验证、不能假设"看起来应该行"的两个点（均已用独立 spike 实测过，不是抄
 * 计划草稿）；钻入层的 onConnect/删除回调复用同一套 debug-trigger 机制，原样成立：
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
 *
 * Task 7 实现过程中另外验证到的两个点（均已用独立 spike / 跑全量测试实测过，不是纸面推演）：
 *
 * 3) 一开始把 `onConnect`/`onNodesDelete`/`onEdgesDelete` 直接改成
 *    `useCallback(fn, [drillStepId])`（或 `[drillStepId, setEdges]`）——"skill 层触发 onConnect
 *    不弹 event 名输入框"这条测试断言失败，事件名输入框仍然弹出来了。根因：这三个回调的
 *    debug-trigger 是靠 callback ref 在真实 DOM 节点上手动 `addEventListener` 挂的（见上面 1)），
 *    Task 6 设计这个机制时它们仨全是 `useCallback(fn, [])`——引用永远不变，callback ref 也就
 *    永远不变，只在 div 首次挂载时被 React 调用一次，全程只挂一次监听器。一旦这三个回调的依赖
 *    数组里加了 `drillStepId`，它们的引用会在每次钻入/退出时改变，连带 `onDebugConnect`/
 *    `debugTriggerRef` 这层 wrapper 的引用也跟着变——React 对 callback ref 的规则是：ref 函数
 *    引用一旦改变，先用 `null` 调旧的 ref 函数，再用真实节点调新的 ref 函数；但旧代码的 ref
 *    函数体是 `el?.addEventListener(...)`，用 `null` 调用时 `el?.` 直接短路，什么都不做——没有
 *    配对的 `removeEventListener`。于是每次钻入状态切换，新监听器都是"追加"而不是"替换"，
 *    同一个 DOM 节点上越攒越多个监听器，一次 `fireEvent(CustomEvent)` 会把所有攒下来的旧监听器
 *    和新监听器全部触发一遍——旧监听器闭包捕获的还是它创建那一刻的 `drillStepId`，不会随后续
 *    状态变化更新，于是"钻入前"和"钻入后"两个版本的回调对同一个 connect/delete 事件都各跑
 *    一遍：本该只走 skill 分支的连接，顶层分支也会跟着跑一遍——"不弹 event 名输入框"这条断言
 *    因此失败（顶层分支的 `setPendingConnection` 被那个陈旧监听器调用了）。`onNodesDelete`/
 *    `onEdgesDelete` 的等价测试之所以没有暴露同样的问题，纯粹是运气：fixture 里 skill id
 *    （a/b/z/c）和顶层 step id（intake/done）没有重名，陈旧监听器执行的顶层分支找不到匹配的
 *    id，过滤器是空操作，两个分支的最终结果碰巧一致，掩盖了同一个根因缺陷。修法：不让这三个
 *    回调的依赖数组包含 `drillStepId`（继续 `useCallback(fn, [])`/`useCallback(fn, [setEdges])`，
 *    引用同 Task 6 一样全程不变，debug-trigger 机制原样不用改），改成读一个持续同步到最新值的
 *    `drillStepIdRef`（`useRef` + `useEffect(() => { ref.current = drillStepId },
 *    [drillStepId])`）——回调本身保持稳定引用，但每次真正被调用时读到的都是调用那一刻的最新
 *    drillStepId，两头都满足：debug-trigger 只挂一次监听器（不会重复累积），行为分支又永远用
 *    最新状态判断。这是"稳定回调 + ref 读最新值"这个 React 常见模式，不是新发明的机制。
 *
 * 4) 已知坑（Task 7 brief 明确标注、实现前必须先验证的点）：brief 草案给"钻入后删除一条
 *    depends_on 连线"这条测试打的占位选择器 `screen.getByText('a').closest('[data-id]')` 选的
 *    其实是错的元素——已用 spike 实测确认：xyflow 节点和边各自独立携带 `data-id` 属性且分处
 *    两棵不同的 DOM 子树（`.react-flow__nodes` vs `.react-flow__edges`），depends_on 边本身
 *    没有可查询的 label 文字，从 skill 节点 'a' 的文字向上 `.closest('[data-id]')` 只能摸到
 *    节点 a 自己的 `data-id="a"`，永远摸不到边的 `data-id="a->b"`——照抄会删错元素（触发
 *    `onNodesDelete` 删节点本身，不是 `onEdgesDelete` 删依赖边）。另外用 spike 单独验证过
 *    "真实 click 边 DOM 节点 + document keyDown Backspace"这条路径本身在本文件已有的
 *    ResizeObserver/DOMMatrixReadOnly/offsetWidth/offsetHeight stub 组合下机制上是可行的
 *    （对顶层既有的 intake->done:complete 边验证过：点击后该边 className 出现 "selected"，
 *    紧接着 keyDown Backspace 并保存后这条 transition 从保存的 body 里消失）——但为了和本
 *    文件其余全部 onNodesDelete/onEdgesDelete 测试（Task 6 已建立的唯一约定）保持一致，删除类
 *    交互测试统一走 debug-trigger 直接调用真实回调，不走 DOM 事件模拟，两种手法不在同一文件里
 *    混用。测试细节见 WorkflowCanvas.test.tsx 对应用例的注释。
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

// 钻入 skill DAG 层的等价物（Task 7）——结构逐一对应 stepsToNodes/stepsToEdges，数据源换成
// 当前 step 的 skills/depends_on。depends_on 本身没有事件名，边不带 label（同顶层 transition
// 边的唯一区别）；边 id 用 `${dep}->${skillId}`（无 `:event` 后缀——这是 skill 层专属的 id
// 约定，测试里 debug-trigger-delete-edges 传入的 id 要按这个格式拼）。
function skillsToNodes(skills: SkillRef[]): Node[] {
  const positions = layoutNodes(skills, skills.flatMap((s) => (s.depends_on ?? []).map((dep) => ({ from: dep, to: s.id }))))
  return skills.map((s) => ({
    id: s.id,
    position: positions.get(s.id) ?? { x: 0, y: 0 },
    data: { label: s.id },
  }))
}

function skillsToEdges(skills: SkillRef[]): Edge[] {
  return skills.flatMap((s) => (s.depends_on ?? []).map((dep) => ({
    id: `${dep}->${s.id}`,
    source: dep,
    target: s.id,
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
  // Task 7：非 null = 正在钻入看该 step 的 skill DAG（值是该 step 的 id）。
  const [drillStepId, setDrillStepId] = useState<string | null>(null)
  // onConnect/onNodesDelete/onEdgesDelete 要读"最新 drillStepId"但自身必须保持稳定引用
  // （不能把 drillStepId 放进它们的 useCallback 依赖数组）——原因见文件头注释第 3 点：这三个
  // 回调的 debug-trigger 测试钩子是靠 callback ref 手动 addEventListener 挂的，那段代码没有配对
  // 的 removeEventListener，回调引用一旦变化就会在同一个 DOM 节点上越攒越多监听器。用一个
  // 持续同步到最新值的 ref 替代直接闭包读 state，两头兼顾。
  const drillStepIdRef = useRef(drillStepId)
  useEffect(() => {
    drillStepIdRef.current = drillStepId
  }, [drillStepId])

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

  // 当前钻入的 step 本身（drillStepId 为 null 时为 null）——所有钻入分支的"操作对象"都从这里取。
  const currentStep = useMemo(
    () => (drillStepId ? wf?.steps.find((s) => s.id === drillStepId) ?? null : null),
    [wf, drillStepId],
  )

  // 数据源切换的唯一权威来源：drillStepId 非空且能在 wf 里找到对应 step 时渲染该 step 的
  // skills/depends_on（Task 7 新增），否则渲染顶层 steps/transitions（Task 6 原有行为）。
  // wf 或 drillStepId 任一变化都会重新从 wf 派生一遍——见文件头注释关于"唯一权威来源"的说明。
  useEffect(() => {
    if (!wf) return
    if (drillStepId && currentStep) {
      setNodes(skillsToNodes(currentStep.skills))
      setEdges(skillsToEdges(currentStep.skills))
    } else {
      setNodes(stepsToNodes(wf.steps))
      setEdges(stepsToEdges(wf.steps))
    }
  }, [wf, drillStepId, currentStep, setNodes, setEdges])

  // 双击顶层 step 节点钻入其 skill DAG；已经钻入时双击 skill 节点不做任何事（没有第三层）。
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_e, node) => {
    if (!drillStepId) setDrillStepId(node.id)
  }, [drillStepId])

  function openAddStep(): void {
    setAddStepOpen(true)
    setNewStepId('')
    setAddStepError(null)
  }

  function confirmAddStep(): void {
    // 钻入态下 id 唯一性对着 currentStep.skills 检查（不是顶层 stepIds）——两层各自的命名空间
    // 互相独立，不共用同一个"已存在 id"集合。
    const existingIds = drillStepId ? new Set(currentStep?.skills.map((s) => s.id)) : stepIds
    if (!/^[a-zA-Z0-9_-]+$/.test(newStepId) || existingIds.has(newStepId)) {
      setAddStepError(t('workflow_editor.duplicate_id'))
      return
    }
    if (drillStepId && currentStep) {
      const newSkill: SkillRef = { id: newStepId }
      setWf((prev) => prev
        ? { ...prev, steps: prev.steps.map((s) => (s.id === drillStepId ? { ...s, skills: [...s.skills, newSkill] } : s)) }
        : prev)
    } else {
      const blank: StepDef = { id: newStepId, label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }
      setWf((prev) => (prev ? { ...prev, steps: [...prev.steps, blank] } : prev))
    }
    // 不再手动 setNodes append——钻入态新增的是 skill 还是顶层新增的是 step 取决于
    // drillStepId，与其在这里重复判断一遍，不如让上面那个统一的派生 effect 接手（wf 变了，
    // 它会自动从新的 wf 重新算一遍 nodes，两层都覆盖到）。
    setAddStepOpen(false)
  }

  // 真实用户走 xyflow 原生拖拽触发的回调；测试经下面的 debug-trigger 隐藏节点直接派发同一个函数。
  // 依赖数组特意不放 drillStepId——读 drillStepIdRef.current 取最新值，保持这个回调引用全程
  // 稳定（原因见文件头注释第 3 点：debug-trigger 的 callback ref 机制要求回调引用稳定，否则
  // 监听器会重复累积）。
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    const drillId = drillStepIdRef.current
    if (drillId) {
      // skill 层：depends_on 没有事件名，不经过"输入 event 名"这道顶层专属确认，直接落地。
      setWf((prev) => prev
        ? {
            ...prev,
            steps: prev.steps.map((s) => (s.id === drillId
              ? {
                  ...s,
                  skills: s.skills.map((sk) => (sk.id === connection.target
                    ? { ...sk, depends_on: [...(sk.depends_on ?? []), connection.source!] }
                    : sk)),
                }
              : s)),
          }
        : prev)
      setEdges((eds) => addEdge(connection, eds))
      return
    }
    setPendingConnection(connection)
    setEventName('')
    setConnectError(null)
  }, [setEdges])

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

  // 完全替换 Task 6 写的版本（不是在其基础上打补丁）：按 drillStepId 分叉——钻入态下删的是
  // currentStep.skills 里的 skill（同时清理其它 skill 指向它的 depends_on），非钻入态下删的
  // 还是顶层 step（同时清理指向它的 transition，行为同 Task 6 原样不变）。同 onConnect，依赖
  // 数组不放 drillStepId，读 drillStepIdRef.current 取最新值（原因见文件头注释第 3 点）。
  const onNodesDelete = useCallback((deleted: Node[]) => {
    const deletedIds = new Set(deleted.map((n) => n.id))
    const drillId = drillStepIdRef.current
    setWf((prev) => {
      if (!prev) return prev
      if (drillId) {
        return {
          ...prev,
          steps: prev.steps.map((s) => (s.id === drillId
            ? {
                ...s,
                skills: s.skills
                  .filter((sk) => !deletedIds.has(sk.id))
                  .map((sk) => ({ ...sk, depends_on: sk.depends_on?.filter((d) => !deletedIds.has(d)) })),
              }
            : s)),
        }
      }
      return {
        ...prev,
        steps: prev.steps
          .filter((s) => !deletedIds.has(s.id))
          .map((s) => ({ ...s, transitions: s.transitions.filter((tr) => !deletedIds.has(tr.to)) })),
      }
    })
  }, [])

  // 同上，完全替换，同样读 drillStepIdRef。钻入态下 edge id 形如 `${dep}->${skillId}`
  // （skillsToEdges 定的格式，无 `:event` 后缀）；非钻入态下 edge id 形如
  // `${stepId}->${to}:${event}`（stepsToEdges 原有格式，Task 6 原样不变）——两种格式不会互相
  // 碰撞（钻入态下这两个 id 命名空间是分离的，因为 onEdgesDelete 在某一时刻只可能处理其中一层
  // 传来的 id）。
  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    const drillId = drillStepIdRef.current
    setWf((prev) => {
      if (!prev) return prev
      if (drillId) {
        const removedDeps = new Set(deleted.map((e) => e.id))
        return {
          ...prev,
          steps: prev.steps.map((s) => (s.id === drillId
            ? { ...s, skills: s.skills.map((sk) => ({ ...sk, depends_on: sk.depends_on?.filter((d) => !removedDeps.has(`${d}->${sk.id}`)) })) }
            : s)),
        }
      }
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
        {drillStepId ? (
          <>
            <button onClick={() => setDrillStepId(null)}>{t('workflow_editor.breadcrumb_top')}</button>
            <span>{t('workflow_editor.breadcrumb_current', { stepId: drillStepId })}</span>
            <button onClick={openAddStep}>{t('workflow_editor.add_skill')}</button>
          </>
        ) : (
          <>
            <button onClick={onBack}>{t('workflow_editor.back')}</button>
            <button onClick={openAddStep}>{t('workflow_editor.add_step')}</button>
          </>
        )}
        <button onClick={save}>{t('workflow_editor.save')}</button>
        {saveStatus.kind === 'ok' && <span>{t('workflow_editor.save_success')}</span>}
        {saveStatus.kind === 'error' && <span>{t('workflow_editor.save_error')}{saveStatus.msg}</span>}
      </div>
      {addStepOpen && (
        <div role="dialog">
          <input
            placeholder={t(drillStepId ? 'workflow_editor.add_skill_prompt' : 'workflow_editor.add_step_prompt')}
            value={newStepId}
            onChange={(e) => setNewStepId(e.target.value)}
          />
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
          onNodeDoubleClick={onNodeDoubleClick}
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
