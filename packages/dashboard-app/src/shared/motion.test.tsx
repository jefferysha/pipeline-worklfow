/**
 * revealStages 分支覆盖（T8 评审补测）：TaskDetail.test.tsx 只钉了 reduce 分支（组件级），
 * 这里补 motion 正分支（fromTo 上浮淡入 stagger）与「无 matchMedia 极老内核」「两条件都不匹配
 * 的非常规 UA 桩」两条兜底——三者都必须保证元素可见，不留半透明残留。
 * 文件后缀 .tsx 是本包 vitest include（只收 src 下 .test.tsx）的准入要求，与是否含 JSX 无关。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import gsap from 'gsap'
import { revealStages, toastIn } from './motion'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** 可控 matchMedia 桩（同 TaskDetail.test.tsx 先例）：reduce/motion 两条媒体查询独立驱动。 */
function stubMatchMedia(opts: { reduce: boolean; motion: boolean }): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce')
        ? opts.reduce
        : query.includes('no-preference')
          ? opts.motion
          : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  )
}

function makeTargets(n: number): HTMLElement[] {
  return Array.from({ length: n }, () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return el
  })
}

describe('revealStages（motion 正分支与兜底）', () => {
  it('motion 分支（no-preference）→ 走 fromTo 上浮淡入，stagger 0.04 / 0.25s', () => {
    stubMatchMedia({ reduce: false, motion: true })
    const fromTo = vi.spyOn(gsap, 'fromTo')
    const set = vi.spyOn(gsap, 'set')
    revealStages(makeTargets(3))
    expect(fromTo).toHaveBeenCalledTimes(1)
    const [, fromVars, toVars] = fromTo.mock.calls[0] as unknown as [unknown, gsap.TweenVars, gsap.TweenVars]
    expect(fromVars).toMatchObject({ autoAlpha: 0, y: 6 })
    expect(toVars).toMatchObject({ autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.04 })
    expect(set).not.toHaveBeenCalled()
  })

  it('无 matchMedia（极老内核）→ gsap.set 直达终态，不走 fromTo', () => {
    vi.stubGlobal('matchMedia', undefined)
    const fromTo = vi.spyOn(gsap, 'fromTo')
    const set = vi.spyOn(gsap, 'set')
    const targets = makeTargets(2)
    revealStages(targets)
    expect(fromTo).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith(targets, expect.objectContaining({ autoAlpha: 1, y: 0 }))
  })

  it('matchMedia 存在但两条件都不匹配（非常规 UA 桩）→ 同兜底直达终态，保证可见', () => {
    stubMatchMedia({ reduce: false, motion: false })
    const fromTo = vi.spyOn(gsap, 'fromTo')
    const set = vi.spyOn(gsap, 'set')
    const targets = makeTargets(2)
    revealStages(targets)
    expect(fromTo).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith(targets, expect.objectContaining({ autoAlpha: 1, y: 0 }))
  })
})

describe('toastIn 生命周期', () => {
  it('返回所属 tween，使 React effect 可在更新或卸载时 kill', () => {
    stubMatchMedia({ reduce: false, motion: true })
    const tween = { kill: vi.fn() }
    vi.spyOn(gsap, 'fromTo').mockReturnValue(tween as unknown as gsap.core.Tween)
    expect(toastIn(document.createElement('div'))).toBe(tween)
  })
})
