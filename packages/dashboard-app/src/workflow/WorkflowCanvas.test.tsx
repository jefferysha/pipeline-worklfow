import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
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
