/**
 * revealStages 分支覆盖（T8 评审补测）：TaskDetail.test.tsx 只钉了 reduce 分支（组件级），
 * 这里补 motion 正分支（fromTo 上浮淡入 stagger）与「无 matchMedia 极老内核」「两条件都不匹配
 * 的非常规 UA 桩」两条兜底——三者都必须保证元素可见，不留半透明残留。
 * 文件后缀 .tsx 是本包 vitest include（只收 src 下 .test.tsx）的准入要求，与是否含 JSX 无关。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import gsap from 'gsap'
import { revealDialog, revealList, revealStages, toastIn } from './motion'

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

describe('共享入场动效的运行期 reduced-motion 切换', () => {
  type BranchContext = { conditions?: { reduce?: boolean; motion?: boolean } }
  type BranchCallback = (context: BranchContext) => void | (() => void)

  function installMediaContext(): {
    switchTo: (conditions: NonNullable<BranchContext['conditions']>) => void
  } {
    const branchState: {
      callback?: BranchCallback
      cleanup?: void | (() => void)
    } = {}
    const mediaContext = {
      add: vi.fn((_conditions: unknown, callback: BranchCallback) => {
        branchState.callback = callback
        branchState.cleanup = callback({ conditions: { reduce: false, motion: true } })
        return mediaContext
      }),
    }
    vi.spyOn(gsap, 'matchMedia').mockReturnValue(mediaContext as unknown as gsap.MatchMedia)
    return {
      switchTo: (conditions) => {
        if (typeof branchState.cleanup === 'function') branchState.cleanup()
        branchState.cleanup = branchState.callback?.({ conditions })
      },
    }
  }

  it('revealList 从 motion 切换到 reduce 时清理旧 tween 并直达可见终态', () => {
    stubMatchMedia({ reduce: false, motion: true })
    const media = installMediaContext()
    const motionTween = { kill: vi.fn() }
    const reducedTween = { kill: vi.fn() }
    const fromTo = vi.spyOn(gsap, 'fromTo').mockReturnValue(motionTween as unknown as gsap.core.Tween)
    const set = vi.spyOn(gsap, 'set').mockReturnValue(reducedTween as unknown as gsap.core.Tween)
    const targets = makeTargets(2)

    revealList(targets)
    expect(fromTo).toHaveBeenCalled()

    media.switchTo({ reduce: true, motion: false })
    expect(motionTween.kill).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(targets, { opacity: 1, y: 0 })
  })

  it('revealDialog 从 motion 切换到 reduce 时清理两条旧 tween 并直达终态', () => {
    stubMatchMedia({ reduce: false, motion: true })
    const media = installMediaContext()
    const backdropTween = { kill: vi.fn() }
    const contentTween = { kill: vi.fn() }
    const reducedBackdropTween = { kill: vi.fn() }
    const reducedContentTween = { kill: vi.fn() }
    vi.spyOn(gsap, 'fromTo')
      .mockReturnValueOnce(backdropTween as unknown as gsap.core.Tween)
      .mockReturnValueOnce(contentTween as unknown as gsap.core.Tween)
    const set = vi.spyOn(gsap, 'set')
      .mockReturnValueOnce(reducedBackdropTween as unknown as gsap.core.Tween)
      .mockReturnValueOnce(reducedContentTween as unknown as gsap.core.Tween)
    const backdrop = document.createElement('div')
    const content = document.createElement('div')

    revealDialog(backdrop, content)
    media.switchTo({ reduce: true, motion: false })

    expect(backdropTween.kill).toHaveBeenCalledTimes(1)
    expect(contentTween.kill).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenNthCalledWith(1, backdrop, { opacity: 1 })
    expect(set).toHaveBeenNthCalledWith(2, content, { opacity: 1, scale: 1, y: 0 })
  })
})

describe('toastIn 生命周期', () => {
  it('运行中切换到 reduce 会清理 tween、直达终态，并允许 effect 撤销媒体上下文', () => {
    stubMatchMedia({ reduce: false, motion: true })
    type BranchContext = { conditions?: { reduce?: boolean; motion?: boolean } }
    type BranchCallback = (context: BranchContext) => void | (() => void)

    const motionTween = { kill: vi.fn() }
    const reducedTween = { kill: vi.fn() }
    const fromTo = vi.spyOn(gsap, 'fromTo').mockReturnValue(motionTween as unknown as gsap.core.Tween)
    const set = vi.spyOn(gsap, 'set').mockReturnValue(reducedTween as unknown as gsap.core.Tween)
    const branchState: {
      callback?: BranchCallback
      cleanup?: void | (() => void)
    } = {}
    const mediaContext = {
      add: vi.fn((_conditions: unknown, next: BranchCallback) => {
        branchState.callback = next
        branchState.cleanup = next({ conditions: { reduce: false, motion: true } })
        return mediaContext
      }),
      revert: vi.fn(() => {
        if (typeof branchState.cleanup === 'function') branchState.cleanup()
      }),
    }
    vi.spyOn(gsap, 'matchMedia').mockReturnValue(mediaContext as unknown as gsap.MatchMedia)

    const target = document.createElement('div')
    const handle = toastIn(target)
    expect(fromTo).toHaveBeenCalledWith(
      target,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' },
    )

    if (typeof branchState.cleanup === 'function') branchState.cleanup()
    branchState.cleanup = branchState.callback?.({ conditions: { reduce: true, motion: false } })

    expect(motionTween.kill).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(target, { opacity: 1, y: 0 })

    handle.kill()
    expect(mediaContext.revert).toHaveBeenCalledTimes(1)
    expect(reducedTween.kill).toHaveBeenCalledTimes(1)
  })

  it('无 matchMedia 时直达终态并返回可清理 handle', () => {
    vi.stubGlobal('matchMedia', undefined)
    const tween = { kill: vi.fn() }
    const set = vi.spyOn(gsap, 'set').mockReturnValue(tween as unknown as gsap.core.Tween)
    const target = document.createElement('div')

    const handle = toastIn(target)
    expect(set).toHaveBeenCalledWith(target, { opacity: 1, y: 0 })
    handle.kill()
    expect(tween.kill).toHaveBeenCalledTimes(1)
  })

  it('媒体上下文无条件命中时使用可见终态兜底', () => {
    stubMatchMedia({ reduce: false, motion: false })
    const mediaContext = {
      add: vi.fn(() => mediaContext),
      revert: vi.fn(),
    }
    vi.spyOn(gsap, 'matchMedia').mockReturnValue(mediaContext as unknown as gsap.MatchMedia)
    const fallbackTween = { kill: vi.fn() }
    const set = vi.spyOn(gsap, 'set').mockReturnValue(fallbackTween as unknown as gsap.core.Tween)
    const target = document.createElement('div')

    const handle = toastIn(target)
    expect(set).toHaveBeenCalledWith(target, { opacity: 1, y: 0 })
    handle.kill()
    expect(fallbackTween.kill).toHaveBeenCalledTimes(1)
    expect(mediaContext.revert).toHaveBeenCalledTimes(1)
  })
})
