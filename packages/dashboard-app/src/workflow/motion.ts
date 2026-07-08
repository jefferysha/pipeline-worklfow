import gsap from 'gsap'

/**
 * workflow 编辑器共享的 GSAP 入场/切换动效——三个组件（列表页/画布/详情侧栏）用同一套
 * reduced-motion 判断 + 时长/缓动惯例，抽成一份而非各自重复 gsap.matchMedia 判断逻辑。
 * 必须在各组件的 `useGSAP(() => { ... }, { scope })` 回调内同步调用——GSAP 的 context
 * 追踪按调用栈生效，不按函数定义所在文件生效，这里的调用一样会被自动纳入清理范围。
 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}

/** 列表/网格项入场：轻微上浮 + 淡入，按顺序错开。reduced-motion 时瞬时可见。 */
export function revealList(targets: gsap.TweenTarget, stagger = 0.035): void {
  if (prefersReducedMotion()) {
    gsap.set(targets, { opacity: 1, y: 0 })
    return
  }
  gsap.fromTo(targets, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out', stagger })
}

/** 弹窗：backdrop 淡入 + 内容轻微放大淡入。 */
export function revealDialog(backdrop: gsap.TweenTarget, content: gsap.TweenTarget): void {
  if (prefersReducedMotion()) {
    gsap.set(backdrop, { opacity: 1 })
    gsap.set(content, { opacity: 1, scale: 1, y: 0 })
    return
  }
  gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'power1.out' })
  gsap.fromTo(content, { opacity: 0, scale: 0.96, y: 4 }, { opacity: 1, scale: 1, y: 0, duration: 0.2, ease: 'power2.out', delay: 0.02 })
}

/** 侧栏从右侧滑入。 */
export function slideInPanel(el: gsap.TweenTarget): void {
  if (prefersReducedMotion()) {
    gsap.set(el, { x: 0, opacity: 1 })
    return
  }
  gsap.fromTo(el, { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.22, ease: 'power3.out' })
}

/** 画布数据源切换（顶层 ⇄ 钻入）时的短暂淡入，提示"内容已切换"而非资产突变造成的错觉。 */
export function crossfadeStage(el: gsap.TweenTarget): void {
  if (prefersReducedMotion()) return
  gsap.fromTo(el, { opacity: 0.4 }, { opacity: 1, duration: 0.18, ease: 'power1.out' })
}
