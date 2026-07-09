import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWorkflow, serializeWorkflow, type WorkflowDef as KernelWorkflowDef } from '@pipeline-lite/kernel'
import { I18nProvider } from '../i18n'
import { invalidateWorkflowRules, useWorkflowRules } from '../model/workflowModel'
import { WorkflowCanvas } from './WorkflowCanvas'

const ROOT = '/tmp/proj-a'
const NAME = 'onboarding'

const TWO_STEP = {
  name: NAME,
  steps: [
    { id: 'intake', label: 'Intake', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
    { id: 'done', label: 'Done', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
}

function renderCanvas(onBack = vi.fn()) {
  render(
    <I18nProvider>
      <WorkflowCanvas root={ROOT} name={NAME} onBack={onBack} />
    </I18nProvider>,
  )
  return onBack
}

// 触发一次"模拟拖线"的调试事件。原计划草案用 `fireEvent.click(el, { detail: {...} })`，
// 假设 `(e.nativeEvent as CustomEvent).detail` 能拿到任意对象——已用独立 spike 验证过这不成立：
// `detail` 是 UIEvent/MouseEvent 的数字点击次数字段，`new MouseEvent('click', { detail: obj })`
// 下 jsdom 的 detail 落地为数字 `0`，不是我们传入的对象（spike 输出：`PATH_A_RESULT number 0`）。
// 改用计划里指出的兜底方案：真实 CustomEvent 派发，组件侧用 ref 挂原生
// `addEventListener('debug-connect', ...)` 接收（同一 spike 验证过这条路径：
// `PATH_B_RESULT object {"source":"a","target":"b"}`，对象原样送达）。
function fireDebugConnect(el: Element, detail: { source: string; target: string }): void {
  fireEvent(el, new CustomEvent('debug-connect', { detail }))
}

// 同一惯例，覆盖 onNodesDelete/onEdgesDelete 的调试触发——两个回调是真实接在 <ReactFlow> 上的
// 回调（真实用户选中节点/边按 Delete 键触发的就是它们），detail 只需要包含回调内部实际读取的
// 字段（.id），不需要构造完整的 xyflow Node/Edge 形状。
function fireDebugDeleteNodes(el: Element, nodes: Array<{ id: string }>): void {
  fireEvent(el, new CustomEvent('debug-delete-nodes', { detail: nodes }))
}
function fireDebugDeleteEdges(el: Element, edges: Array<{ id: string }>): void {
  fireEvent(el, new CustomEvent('debug-delete-edges', { detail: edges }))
}

// test-setup.ts 全局的 ResizeObserver stub 是纯 no-op（observe/unobserve/disconnect 都不做事），
// 够用于"不让 @xyflow/react 因为 ResizeObserver undefined 而报错"，但不够用于真正渲染连线：
// xyflow 内部一个节点在"被 ResizeObserver 通知过一次"之前，internals.handleBounds 是
// undefined，此时任何以它为端点的边（EdgeWrapper 内部判断 sourceX/targetX 是否为 null）都会
// 直接渲染成 null——完全不进 DOM（不是"渲染了但文字找不到"，是这条边从来没挂载过，实测确认：
// 连 fixture 里既有的 intake→done"complete"边都没出现在 <div class="react-flow__edges"> 里）。
// 真实浏览器里 ResizeObserver 迟早会真的回调一次，jsdom 没有布局引擎所以这个回调永远不会自己
// 发生，需要在测试里手动补上"至少通知一次"。看 xyflow 源码确认过：per-node 的
// useResizeObserver 回调只用 entry.target 拿真实 DOM 节点自己重新 measure（不读
// entry.contentRect），jsdom 下量出来的宽高是 0 也没关系——`nodeHasDimensions` 只检查测量结果
// `!== undefined`，不要求 > 0；但画布容器级别另有一个 XYPanZoom 的 extentResizeObserver，
// 会直接读 `entry.contentRect.width/height`，不给这个字段会直接抛错，所以这里的合成 entry
// 两派消费者都要照顾到。跑通这一步后又炸出第二个 jsdom 缺口：真实测量代码内部用
// `new window.DOMMatrixReadOnly(style.transform)` 解析节点的 CSS transform 拿缩放比例，
// jsdom 完全没实现这个构造函数——一并在本文件局部 polyfill（同样不碰 test-setup.ts，原因
// 同上：那是全体 dashboard-app 测试共享的基座，改动影响面不可控，超出本任务范围；这里两个
// stub 都只在本文件的 describe 块生效）。
class FiringResizeObserver implements ResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element): void {
    const rect = { width: 800, height: 480, top: 0, left: 0, right: 800, bottom: 480, x: 0, y: 0 } as DOMRectReadOnly
    queueMicrotask(() => this.cb([{ target, contentRect: rect } as ResizeObserverEntry], this))
  }
  unobserve(): void {}
  disconnect(): void {}
}

// 只解析 `matrix(a,b,c,d,e,f)` 形式（jsdom 下我们的节点/画布 transform 都只有 translate，
// 解析不出 matrix(...) 就落回单位矩阵——m22=1 即"无缩放"，对本文件的断言（只关心文字是否
// 出现在 DOM 里，不关心像素级位置）而言就是正确值，不是凑合值）。
class MockDOMMatrixReadOnly {
  m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0
  constructor(transform?: string) {
    const m = /matrix\(([^)]+)\)/.exec(transform ?? '')
    if (!m) return
    const parts = m[1].split(',').map((n) => parseFloat(n.trim()))
    if (parts.length === 6 && parts.every((n) => !Number.isNaN(n))) {
      [this.m11, this.m12, this.m21, this.m22, this.m41, this.m42] = parts
    }
  }
}

// 补完这条链路最后一环：即便 ResizeObserver 真的回调了一次，xyflow 内部
// `updateNodeInternals`（@xyflow/system）还有一个"是否要采纳这次测量"的判断——
// `doUpdate = !!(dimensions.width && dimensions.height && ...)`——两个维度都要求非零，
// 不是"已定义就行"。`dimensions` 来自 `getDimensions(el)`，读的是 `el.offsetWidth`/
// `el.offsetHeight`；jsdom 没有布局引擎，这两个 getter 恒返回 0，导致 doUpdate 永远是
// false、handleBounds 永远不会被写入——不管 ResizeObserver 回调触发多少次都没用（实测过：
// 上面两处 stub 单独生效后，<div class="react-flow__edges"> 依然是空的，边仍不渲染）。
// 这里在 HTMLElement.prototype 级别整体覆盖这两个 getter 为固定非零值——测试只关心文字是否
// 出现在 DOM 里，不关心具体像素，用哪个非零值不重要。afterAll 里还原，不让这个 prototype
// 级别的覆盖泄漏到同一进程里其它 test 文件（多数 vitest 配置按文件隔离 module 实例，但这里
// 显式还原更稳妥、不依赖那个隔离假设）。
let originalOffsetWidth: PropertyDescriptor | undefined
let originalOffsetHeight: PropertyDescriptor | undefined
let addedGetBBox = false
beforeAll(() => {
  originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 150 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 40 })
  // 边的 label 用 <EdgeText>，内部量文字尺寸来定位背景矩形要调 SVG 原生的 `getBBox()`——
  // jsdom 从来没实现过这个方法（不是测量结果为 0，是这个方法整个不存在），是所有 SVG
  // 相关库在 jsdom 下测试时的通用已知缺口，不是 xyflow 特有问题。挂载点：实测过
  // jsdom 的 `<text>` 实例是 `SVGElement` 的直接实例，并不落在 `SVGGraphicsElement`
  // 原型链上（`text instanceof SVGGraphicsElement` 为 false、`instanceof SVGElement`
  // 为 true）——jsdom 的 SVG 子类划分本身不完整，`SVGGraphicsElement` 这个全局虽然存在但
  // 没有真的接入实例的原型链，第一次挂在 SVGGraphicsElement.prototype 上时不生效，改挂
  // 在 SVGElement.prototype 上才是实例真正的原型链。
  // 类型定义（lib.dom.d.ts）里 getBBox 只声明在 SVGGraphicsElement 上，SVGElement 本身没有
  // 这个成员——用 `in` 判断存在性，避免对 SVGElement.prototype 做类型不允许的点号访问。
  if (!('getBBox' in SVGElement.prototype)) {
    (SVGElement.prototype as unknown as { getBBox(): DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect
    addedGetBBox = true
  }
})
afterAll(() => {
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
  if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  if (addedGetBBox) delete (SVGElement.prototype as { getBBox?: unknown }).getBBox
})

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', FiringResizeObserver)
  vi.stubGlobal('DOMMatrixReadOnly', MockDOMMatrixReadOnly)
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify(TWO_STEP), { status: 200 })
    }
    if (url === `/api/workflows/${NAME}` && opts?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('WorkflowCanvas —— 顶层 step 拓扑', () => {
  it('挂载后真 fetch workflow，渲染两个 step 节点', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    expect(screen.getByText(/done/i)).toBeInTheDocument()
  })

  it('点"返回列表" → 调用 onBack', async () => {
    const onBack = renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/返回列表/))
    expect(onBack).toHaveBeenCalled()
  })

  it('点"+ step"输入合法新 id → 新增一个 step 节点（初始空 skills/transitions）', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ step' }))
    fireEvent.change(screen.getByPlaceholderText(/step id/), { target: { value: 'review' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByText(/review/i)).toBeInTheDocument())
  })

  it('新增 step 用重复 id → 拒绝，不新增', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ step' }))
    fireEvent.change(screen.getByPlaceholderText(/step id/), { target: { value: 'intake' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(screen.getByText(/id 重复/)).toBeInTheDocument()
  })

  it('真触发 onConnect（模拟拖线）→ 弹 event 名输入 → 确认后新增一条 transition', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    // WorkflowCanvas 把 onConnect 通过 data-testid="debug-trigger-connect" 的隐藏节点暴露供测试
    // 直接触发（不模拟真实鼠标拖拽物理效果——设计文档 §4 明确"库本身的拖拽/连线行为不需要重新测试"）。
    const connectTrigger = screen.getByTestId('debug-trigger-connect')
    fireDebugConnect(connectTrigger, { source: 'done', target: 'intake' })
    fireEvent.change(screen.getByPlaceholderText(/event 名/), { target: { value: 'restart' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByText(/restart/)).toBeInTheDocument())
  })

  it('同一 step 内重复 event 名 → 拒绝创建连线', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    const connectTrigger = screen.getByTestId('debug-trigger-connect')
    fireDebugConnect(connectTrigger, { source: 'intake', target: 'done' })
    fireEvent.change(screen.getByPlaceholderText(/event 名/), { target: { value: 'complete' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(screen.getByText(/event 名不能重复/)).toBeInTheDocument()
  })

  // whole-feature review Finding 1：kernel parse.ts 的 parseTransitionsBlock 用 `event:\s*(\S+)\s*$`
  // 匹配 event 值——只要求非空白，不校验字符集。含空格的 event 名（如这里的 'go back'）此前
  // 能被这个对话框直接接受、写进 wf 状态、POST 保存成功，但下次任何人 GET 这个 workflow 时
  // parseWorkflow 会在这一行匹配失败、最终整体抛错（见本文件下方"Finding 1 闭环回归"
  // describe 块的往返证据）。字符集校验必须同 confirmAddStep 的 step/skill id 校验一致
  // （`^[a-zA-Z0-9_-]+$`），且必须在"是否重复"判断之前生效。
  it('event 名含空格 → 拒绝创建连线，不新增 transition/edge', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    const connectTrigger = screen.getByTestId('debug-trigger-connect')
    fireDebugConnect(connectTrigger, { source: 'done', target: 'intake' })
    fireEvent.change(screen.getByPlaceholderText(/event 名/), { target: { value: 'go back' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(screen.getByText(/非法 event 名/)).toBeInTheDocument()
    // 对话框仍在（没有被当成提交成功而关闭）——输入框依然可见。
    expect(screen.getByPlaceholderText(/event 名/)).toBeInTheDocument()
    // 关掉对话框、保存，确认 wf 状态里从未真正落地过这条坏 transition。
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
    const body = JSON.parse(postCall![1].body as string)
    const doneStep = body.steps.find((s: { id: string }) => s.id === 'done')
    expect(doneStep.transitions).toEqual([])
  })

  it('真触发 onNodesDelete（删除 done 节点）→ wf.steps 移除该节点，且清理指向它的 transition', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    const deleteNodesTrigger = screen.getByTestId('debug-trigger-delete-nodes')
    fireDebugDeleteNodes(deleteNodesTrigger, [{ id: 'done' }])
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
    const body = JSON.parse(postCall![1].body as string)
    // done 节点本身被移除；intake 原本指向 done 的 'complete' transition 也被一并清理，
    // 不留下指向已删节点的悬空 transition。
    expect(body.steps.map((s: { id: string }) => s.id)).toEqual(['intake'])
    const intakeStep = body.steps.find((s: { id: string }) => s.id === 'intake')
    expect(intakeStep.transitions).toEqual([])
  })

  it('真触发 onEdgesDelete（删除一条 transition）→ 只移除这一条，同 step 兄弟 transition 与其它 step 均不受影响', async () => {
    // 本用例专用的三 step fixture（不改共享的 TWO_STEP——那个常量被其余 9 个用例复用，改了
    // 会连带破坏它们对 steps 数组长度/内容的断言）。第三个 step 'closed' 只是给 done 提供一个
    // "会保留"的第二条 transition 的落点：如果只让 done 在删除前恰好只有 1 条 transition，
    // `doneStep.transitions` 删除后变成 `[]` 这件事本身没法分辨"精确按 edge id 过滤"（真实、
    // 正确实现）和"只要 done 的任意一条边被删就清空 done 整个 transitions 数组"（假设中的错误
    // 实现）——两者在"删除前只有 1 条"的前提下产出的结果完全一样，测试分辨不出来
    // （reviewer 指出的缺口）。这里让 done 删除前持有两条 transition，删掉一条后断言剩下
    // 那条还在、且内容精确匹配，才能真正把"精确删一条"和"整段清空"这两种实现区分开。
    const THREE_STEP = {
      name: NAME,
      steps: [
        { id: 'intake', label: 'Intake', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
        { id: 'done', label: 'Done', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
        { id: 'closed', label: 'Closed', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(THREE_STEP), { status: 200 })
      }
      if (url === `/api/workflows/${NAME}` && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())

    // 给 done 造两条 transition：done→intake:restart（待删除）+ done→closed:archive（应保留）。
    const connectTrigger = screen.getByTestId('debug-trigger-connect')
    fireDebugConnect(connectTrigger, { source: 'done', target: 'intake' })
    fireEvent.change(screen.getByPlaceholderText(/event 名/), { target: { value: 'restart' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByText(/restart/)).toBeInTheDocument())

    fireDebugConnect(connectTrigger, { source: 'done', target: 'closed' })
    fireEvent.change(screen.getByPlaceholderText(/event 名/), { target: { value: 'archive' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByText(/archive/)).toBeInTheDocument())

    // 只删 restart 这一条。
    const deleteEdgesTrigger = screen.getByTestId('debug-trigger-delete-edges')
    fireDebugDeleteEdges(deleteEdgesTrigger, [{ id: 'done->intake:restart' }])

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
    const body = JSON.parse(postCall![1].body as string)
    const doneStep = body.steps.find((s: { id: string }) => s.id === 'done')
    const intakeStep = body.steps.find((s: { id: string }) => s.id === 'intake')
    // done 剩下 archive 这一条（不是空数组！证明删除精确命中 restart 一条，不是把 done 整个
    // transitions 数组清空——这才是本用例要补的区分点）；intake 的 complete transition（另一个
    // step 的另一条边）完全不受影响。
    expect(doneStep.transitions).toEqual([{ event: 'archive', to: 'closed' }])
    expect(intakeStep.transitions).toEqual([{ event: 'complete', to: 'done' }])
  })

  it('点保存 → 真 POST 当前 WorkflowDef，成功后显示"已保存"', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
    expect(postCall).toBeTruthy()
    const body = JSON.parse(postCall![1].body as string)
    expect(body.name).toBe(NAME)
    expect(body.steps.map((s: { id: string }) => s.id)).toEqual(['intake', 'done'])
  })

  it('保存失败（校验拒绝）→ 展示 errors，不清空已编辑内容', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(TWO_STEP), { status: 200 })
      }
      if (url === `/api/workflows/${NAME}` && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, errors: ['s1 没有声明任何 transitions'] }), { status: 400 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText(/没有声明任何 transitions/)).toBeInTheDocument())
    // 编辑内容仍在（intake 节点还在）
    expect(screen.getByText(/intake/i)).toBeInTheDocument()
  })
})

// Task 7：钻入 skill DAG 层（双击 step 节点 → 该 step 内部的 skill/depends_on 拓扑；面包屑返回顶层）。
// intake 带 2 个 skill：a、b，其中 b depends_on a——用来断言"钻入后渲染的是 skill 节点 + depends_on
// 连线，不是顶层 step 图"。
const WITH_SKILLS = {
  name: NAME,
  steps: [
    {
      id: 'intake', label: 'Intake', gate: null,
      skills: [{ id: 'a' }, { id: 'b', depends_on: ['a'] }],
      inputs: [], outputs: [], guards: [],
      transitions: [{ event: 'complete', to: 'done' }],
    },
    { id: 'done', label: 'Done', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
}

describe('WorkflowCanvas —— 钻入 skill DAG 层', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(WITH_SKILLS), { status: 200 })
      }
      if (url === `/api/workflows/${NAME}` && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
  })

  it('双击 step 节点 → 画布切换成该 step 的 skill 节点（a、b）+ depends_on 连线，面包屑显示当前 step', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getByText(/当前：intake/)).toBeInTheDocument()
    // 顶层的 done 节点这时候不应该出现（数据源已切换，不是叠加渲染）
    expect(screen.queryByText(/done/i)).not.toBeInTheDocument()
  })

  it('钻入后点面包屑"返回顶层" → 切回顶层图（intake/done 重新出现，skill 节点消失）', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/返回顶层/))
    await waitFor(() => expect(screen.getByText(/done/i)).toBeInTheDocument())
    expect(screen.queryByText('a')).not.toBeInTheDocument()
  })

  it('skill 层"+ skill"新增一个 skill 节点', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ skill' }))
    fireEvent.change(screen.getByPlaceholderText(/skill id/), { target: { value: 'c' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByText('c')).toBeInTheDocument())
  })

  it('skill 层触发 onConnect（depends_on 无标签）不弹 event 名输入框，直接连上；保存后新连线正确落在 depends_on', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
    // 先加一个新 skill c（初始没有 depends_on）：如果直接对 fixture 里已经 depends_on: ['a']
    // 的 b 重连 a→b，即使 onConnect 在钻入态完全不生效，保存后 b.depends_on 也会"恰好"仍包含
    // 'a'（fixture 本来就有），测试分辨不出真假——用一个初始无依赖的新 skill 才能证明这条
    // depends_on 是 onConnect 真正新增的，不是 fixture 原有数据残留。
    fireEvent.click(screen.getByRole('button', { name: '+ skill' }))
    fireEvent.change(screen.getByPlaceholderText(/skill id/), { target: { value: 'c' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByText('c')).toBeInTheDocument())

    const connectTrigger = screen.getByTestId('debug-trigger-connect')
    fireDebugConnect(connectTrigger, { source: 'a', target: 'c' })
    // skill 层不应该弹出 event 名输入框（那是顶层 transition 专属，depends_on 无标签直接落地）
    expect(screen.queryByPlaceholderText(/event 名/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/返回顶层/))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
      const body = JSON.parse(postCall![1].body as string)
      const intake = body.steps.find((s: { id: string }) => s.id === 'intake')
      const cSkill = intake.skills.find((s: { id: string }) => s.id === 'c')
      expect(cSkill.depends_on).toContain('a')
    })
  })

  it('钻入后真触发 onNodesDelete（删除 skill 节点 a）→ a 从 skills 移除，且 b 指向 a 的 depends_on 一并清理', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
    const deleteNodesTrigger = screen.getByTestId('debug-trigger-delete-nodes')
    fireDebugDeleteNodes(deleteNodesTrigger, [{ id: 'a' }])
    fireEvent.click(screen.getByText(/返回顶层/))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
    const body = JSON.parse(postCall![1].body as string)
    const intake = body.steps.find((s: { id: string }) => s.id === 'intake')
    expect(intake.skills.map((s: { id: string }) => s.id)).toEqual(['b'])
    const bSkill = intake.skills.find((s: { id: string }) => s.id === 'b')
    expect(bSkill.depends_on ?? []).not.toContain('a')
  })

  // 已知坑（brief 明确标注"容易漏改、最容易只测新增不测删除"的场景）：钻入后删除一条 depends_on
  // 连线。已知坑 2（选中一条边再按 Delete 键这条真实交互路径在 jsdom 下能否真触发
  // onEdgesDelete）已经用独立 spike 实测验证过——结论见 WorkflowCanvas.tsx 顶部本任务小节的
  // 文件头注释：真实 click(边 DOM 节点) + document keyDown Backspace 确实能在本文件已有的
  // ResizeObserver/DOMMatrixReadOnly/offsetWidth/offsetHeight stub 组合下真实触发 onEdgesDelete
  // （对顶层 intake->done:complete 这条既有边验证过：点击后 className 出现 "selected"，
  // 按 Backspace 并保存后该 transition 消失）。但 brief 自带的占位选择器
  // `screen.getByText('a').closest('[data-id]')` 本身选择的元素是错的：depends_on 边没有可查询的
  // label 文字，'a' 只会命中 skill 节点 a 自己的文字，而 xyflow 的节点/边都各自带独立的
  // `data-id` 属性且分处两棵不同的 DOM 子树（.react-flow__nodes vs .react-flow__edges）——从节点
  // 'a' 的文字向上 `.closest('[data-id]')` 只可能先摸到节点 a 自己的 data-id="a"，永远摸不到边的
  // data-id="a->b"，实际会删除错节点（触发 onNodesDelete 删 a 本身）而不是删边（触发
  // onEdgesDelete 删 a→b 依赖）。因此这里改用与本文件其余全部 onNodesDelete/onEdgesDelete
  // 测试完全一致的既有约定——复用 debug-trigger-delete-edges（同一个隐藏节点、同一个
  // CustomEvent 直接调用真实回调的机制，不额外发明 debug-trigger-delete-edge 单数版本），
  // 保持全文件测试风格统一（不真半假：不混用"DOM 事件模拟"和"直接调用"两种手法）。
  it('钻入后删除一条 depends_on 连线（b 不再依赖 a）→ 保存后 depends_on 只精确移除这一条，不清空整个数组', async () => {
    // 本用例专用 fixture：让 b 同时 depends_on ['a', 'z']（两个依赖），只删 a→b 这一条边，
    // 断言剩下 z 还在——如果只给 b 一个依赖，删除后 depends_on 变成 []，没法分辨"精确按边 id
    // 过滤"（真实实现）和"只要该 skill 任意一条依赖边被删就清空整个 depends_on 数组"
    // （假设中的错误实现），这两者在"删除前只有 1 个依赖"的前提下结果完全一样——同 Task 6
    // 那条 onEdgesDelete 回归测试（reviewer 指出过的同一类缺口）补强的理由完全一致。
    const WITH_SIBLING_DEPENDS_ON = {
      name: NAME,
      steps: [
        {
          id: 'intake', label: 'Intake', gate: null,
          skills: [{ id: 'a' }, { id: 'z' }, { id: 'b', depends_on: ['a', 'z'] }],
          inputs: [], outputs: [], guards: [],
          transitions: [{ event: 'complete', to: 'done' }],
        },
        { id: 'done', label: 'Done', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(WITH_SIBLING_DEPENDS_ON), { status: 200 })
      }
      if (url === `/api/workflows/${NAME}` && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('b')).toBeInTheDocument())

    // skill 层边 id 约定：`${dep}->${skillId}`（无 event 名后缀，depends_on 本身无标签）。
    const deleteEdgesTrigger = screen.getByTestId('debug-trigger-delete-edges')
    fireDebugDeleteEdges(deleteEdgesTrigger, [{ id: 'a->b' }])

    fireEvent.click(screen.getByText(/返回顶层/))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
    const body = JSON.parse(postCall![1].body as string)
    const bSkill = body.steps.find((s: { id: string }) => s.id === 'intake').skills.find((s: { id: string }) => s.id === 'b')
    // 精确移除 a：z 这一条兄弟依赖必须还在（不是整个数组被清空）。
    expect(bSkill.depends_on).toEqual(['z'])
  })
})

// Task 8：单击顶层 step 节点打开 StepDetailPanel 详情侧栏（selectedStepId，非钻入）；双击仍
// 钻入 skill DAG（Task 7 原有行为，onNodeDoubleClick 不变）。两个交互必须不冲突——真实浏览器
// 双击一个元素会先触发两次 click、再触发一次 dblclick，如果单击不经延迟就立即生效，会在双击的
// 前两次 click 上各开一次详情侧栏，紧接着才钻入，体验是"闪一下详情面板又切进钻入视图"。
describe('WorkflowCanvas —— Task 8：单击打开详情侧栏 / 双击仍钻入 skill 层', () => {
  it('真实双击时序：双击 step 节点只钻入 skill 层，不会同时打开详情侧栏（先 click 再 dblclick 的真实浏览器序列，用假计时器验证 250ms 内的单击被真正取消，而不是被 drillStepId 渲染条件恰好掩盖）', async () => {
    vi.useFakeTimers()
    try {
      renderCanvas()
      await vi.waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
      const node = screen.getByText(/intake/i)
      fireEvent.click(node)
      fireEvent.click(node)
      fireEvent.doubleClick(node)
      // 定时器回调（若真的触发）会调用 setSelectedStepId 这个 React state 更新，发生在
      // fireEvent 的 act() 包裹之外——用 act() 包一下推进时间这一步，避免 "state update not
      // wrapped in act" 警告，且确保断言执行前状态更新已经落定（不依赖时序侥幸）。
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.queryByDisplayValue('Intake')).not.toBeInTheDocument() // 详情侧栏没开

      // 光凭上面这条断言还不能证明"待生效的单击真的被取消"——此刻 drillStepId 已经非空，
      // StepDetailPanel 的渲染条件本身就要求 !drillStepId；即使 onNodeDoubleClick 完全没清
      // 定时器、遗留的 setSelectedStepId('intake') 在 advanceTimersByTime 期间真的执行了，
      // 面板也会被这条独立的 drillStepId 判断挡住——那样测试会"看起来通过"但根本没验证到
      // 取消逻辑本身。已实测反向验证过这个区分点确实成立：把 onNodeDoubleClick 函数体的
      // clearTimeout 那三行临时删掉、只保留 `if (!drillStepId) setDrillStepId(node.id)`
      // 重跑本用例——上面这条"退出钻入态之前"的断言依然 PASS（如预期，被 !drillStepId
      // 掩盖），但下面这条"退出钻入态之后"的断言真的 FAIL 了：
      // `expect(element).not.toBeInTheDocument() / found <input value="Intake" />`，
      // 证明"待生效单击泄漏成打开面板"这件事真实发生了，只是被上面那条断言看不出来。补一步：
      // 退出钻入态后再断言一次——如果单击真的被取消，selectedStepId 应仍是 null，退出钻入态
      // 后面板依然不出现；如果没被真正取消（只是被 drillStepId 掩盖），退出钻入态的一瞬间
      // 面板就会冒出来——这一步才是本用例名字里"真正取消"这个断言的直接证据。
      fireEvent.click(screen.getByText(/返回顶层/))
      expect(screen.queryByDisplayValue('Intake')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('单击顶层 step 节点 → 打开详情侧栏；双击仍然是钻入 skill 层（两种交互不冲突）', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByDisplayValue('Intake')).toBeInTheDocument())
  })

  // 相邻但不同的一个坑（review 发现）：上面两条用例只覆盖了"待生效的定时器"被 onNodeDoubleClick
  // 清掉这件事，没覆盖"已经落定的 selectedStepId"——单击 intake、等 250ms 真正生效后，
  // selectedStepId 已经是 'intake'（不是待生效定时器，clickTimer 那步清不到它）。此时双击任意
  // step 钻入，详情侧栏当下确实会消失，但只是因为渲染条件 `!drillStepId && selectedStep` 里
  // drillStepId 变真而被挡住——如果 onNodeDoubleClick 不显式清 selectedStepId，退出钻入态
  // （返回顶层）的一瞬间同一条渲染条件又重新成立，详情侧栏会在用户没有对 intake 做任何新点击的
  // 情况下无声重开。同本文件"真实双击时序"那条用例用 bug-injection 验证过的是同一类"被掩盖
  // 而不是被清除"问题，只是这次的触发点是钻入本身，不是待生效定时器。
  it('单击选中 A 打开详情侧栏 → 双击钻入 → 返回顶层后详情侧栏不应无声重开（selectedStepId 需要在钻入时真正清空，不能只被 drillStepId 渲染条件掩盖）', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    // 1) 真单击 intake，等 250ms 延迟真正生效——详情侧栏打开，selectedStepId 落定为
    //    'intake'（不是待生效定时器）。
    fireEvent.click(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByDisplayValue('Intake')).toBeInTheDocument())
    // 2) 双击 done（另一个 step）钻入其 skill 层——done 本身没有 skill，钻入后是空画布 +
    //    面包屑，不影响本用例断言。详情侧栏此刻应该消失。
    fireEvent.doubleClick(screen.getByText(/done/i))
    await waitFor(() => expect(screen.getByText(/当前：done/)).toBeInTheDocument())
    expect(screen.queryByDisplayValue('Intake')).not.toBeInTheDocument()
    // 3) 退出钻入态——如果 selectedStepId 真的被清空，详情侧栏应保持关闭；如果只是被
    //    drillStepId 掩盖（未修复的 bug），这一步会让详情侧栏在没有任何新点击的情况下无声重开。
    fireEvent.click(screen.getByText(/返回顶层/))
    await waitFor(() => expect(screen.getByText(/done/i)).toBeInTheDocument())
    expect(screen.queryByDisplayValue('Intake')).not.toBeInTheDocument()
  })
})

// whole-feature review Finding 1 闭环回归：证明"含空格 event 名"不是假设中的风险,
// 而是真的会把 kernel parser 写挂的可达 bug，且本次修复在 confirmConnect 的状态变更分支
// （setWf/setEdges）执行之前就把它挡住——两件事在同一条用例里各自给出独立证据，不是互相
// 假设对方成立。
describe('WorkflowCanvas —— Finding 1 闭环回归（event 名字符集）', () => {
  it('含空格 event 名：Part A 证明它真的会让 kernel loadWorkflow 抛错（往返证据，非假设）；Part B 证明同一个值经画布 UI 提交时，在 setWf 生效前就被挡下（从未真正落地）', async () => {
    // Part A —— kernel 侧真实性证据：不经过任何 UI，直接构造一个 event 名带空格的
    // WorkflowDef，走 serializeWorkflow（既有反向操作）写盘，再走 loadWorkflow（parseWorkflow
    // 的唯一导出入口，见 kernel/src/index.ts）读回。parse.ts 的 parseTransitionsBlock 用
    // `event:\s*(\S+)\s*$` 匹配这一行——"go back" 只有 "go" 落进 `\S+`，剩下的 " back" 让
    // `\s*$` 匹配失败，整行匹配失败、transitions block 提前 break；游标停在这一行，
    // parseStep 的字段扫描循环同样对不上任何前缀、也 break；回到 parseWorkflow 主循环时这一行
    // 仍不匹配 '- id:' 前缀，最终 throw——这条链路是本文件用真文件系统 + 真 loadWorkflow
        // 验证过的真实行为，不是纸面推演。
    const badWf: KernelWorkflowDef = {
      name: 'bad-event',
      steps: [
        { id: 'intake', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'go back', to: 'done' }] },
        { id: 'done', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }
    const repoRoot = await mkdtemp(join(tmpdir(), 'wf-charset-bug-'))
    await mkdir(join(repoRoot, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(repoRoot, '.pipeline', 'workflows', 'bad-event.yaml'), serializeWorkflow(badWf), 'utf8')
    expect(() => loadWorkflow(repoRoot, 'bad-event')).toThrow(/steps 下每项必须以/)

    // Part B —— 同一个值（'go back'）这次经画布"添加 transition"对话框提交：客户端字符集
    // 校验必须在 confirmConnect 真正调用 setWf/setEdges（状态变更分支）之前就拒绝，因此
    // Part A 里那种会让 kernel parser 炸掉的 WorkflowDef 永远不会被这条 UI 路径构造出来。
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    const connectTrigger = screen.getByTestId('debug-trigger-connect')
    fireDebugConnect(connectTrigger, { source: 'done', target: 'intake' })
    fireEvent.change(screen.getByPlaceholderText(/event 名/), { target: { value: 'go back' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(screen.getByText(/非法 event 名/)).toBeInTheDocument()

    // 保存后的请求体必须完全不含 'go back'——证明那条非法输入从未触发过 setWf 的状态变更分支。
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
    const body = JSON.parse(postCall![1].body as string)
    expect(JSON.stringify(body)).not.toContain('go back')
  })
})

describe('gate 节点徽章（工票车间：编辑器侧的 gate 可视化）', () => {
  it('gate=review / gate=confirm 的 step 节点内分别渲染朱红"复核门"/中性"确认门"徽章', async () => {
    const GATED = {
      name: NAME,
      steps: [
        { id: 'draft', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'approved', to: 'check' }] },
        { id: 'check', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'go', to: 'ship' }] },
        { id: 'ship', label: '', gate: 'confirm', skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }
    global.fetch = vi.fn(async (url: string) => {
      if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(GATED), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderCanvas()
    await waitFor(() => expect(screen.getByText('check')).toBeInTheDocument())
    const gateBadge = screen.getByText('复核门')
    expect(gateBadge).toBeInTheDocument()
    expect(gateBadge.className).toContain('badge--gate')
    expect(screen.getByText('确认门').className).toContain('badge--phase')
    // 无 gate 的节点不带徽章（按节点框自身的文本判断，不受兄弟节点影响）
    expect(screen.getByText('draft').closest('.react-flow__node')?.textContent).toBe('draft')
  })
})

// ── 评审 P0-4：保存成功后 (root,name) 规则缓存必须失效（spec §2.1 明确要求）──
// 缺陷形态：save() 只 setSaveStatus('ok')，invalidateWorkflowRules 全 src 零调用点——
// 用户在编辑器给 step 加了 review gate、保存成功、切到收件箱/看板，workflowModel 的
// 模块级缓存还在供旧规则，新 gate 直到整页刷新才出现。
function RulesProbe(): JSX.Element {
  const { rules } = useWorkflowRules(ROOT, [NAME])
  return <div data-testid="rules-probe">{rules.get(NAME)?.steps.length ?? 0}</div>
}

describe('保存后规则缓存失效（评审 P0-4）', () => {
  it('保存成功 → 下一个 useWorkflowRules 消费方看到保存后的新定义，而非旧缓存', async () => {
    invalidateWorkflowRules() // 清场：模块级缓存跨测试存活
    // 计数断言会被画布自身的加载 GET 污染（同一 URL 两个消费方），改用内容断言：
    // POST 保存后 mock 切到 v2（3 个 step）——探针若真重拉看到 3，命中旧缓存只能是 2。
    const V2 = { ...TWO_STEP, steps: [...TWO_STEP.steps, { id: 'extra', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }] }
    let saved = false
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(saved ? V2 : TWO_STEP), { status: 200 })
      }
      if (url === `/api/workflows/${NAME}` && opts?.method === 'POST') {
        saved = true
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    // 1. 探针灌缓存（模拟看板/收件箱已消费过 v1 规则）
    const probe1 = render(<RulesProbe />)
    await waitFor(() => expect(screen.getByTestId('rules-probe').textContent).toBe('2'))
    probe1.unmount()

    // 2. 画布保存成功（此后 server 端已是 v2）
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())

    // 3. 消费方再次挂载：缓存已失效 → 真重拉 → 看到 v2 的 3 个 step
    render(<RulesProbe />)
    await waitFor(() => expect(screen.getByTestId('rules-probe').textContent).toBe('3'))
  })
})
