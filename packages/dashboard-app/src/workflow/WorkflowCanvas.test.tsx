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
