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

// ── 工票车间新增词汇（spec §5）：全部 150-250ms、ease-out 族、只传达状态变化 ──

/** 盖章确认：转换成功的绿章从上方压下（scale 1.6→1 + fade），200ms power4.out。 */
export function stampConfirm(el: gsap.TweenTarget): void {
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 1, scale: 1 })
    return
  }
  gsap.fromTo(el, { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.2, ease: 'power4.out' })
}

/** toast 底部滑入：y 14→0 + fade，200ms power2.out。 */
export function toastIn(el: gsap.TweenTarget): void {
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 1, y: 0 })
    return
  }
  gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' })
}

/**
 * 分组展开：body 挂载时 height 0→auto + fade，210ms power3.out。
 * 折叠方向刻意瞬时（条件渲染直接卸载）——展开是"内容到达"的状态变化值得强调，
 * 收起是用户主动收纳，等待动画只会碍事（product register：不让用户等编排）。
 */
export function foldOpen(el: Element): void {
  if (prefersReducedMotion()) return
  gsap.fromTo(el, { height: 0, opacity: 0.3 }, {
    height: 'auto', opacity: 1, duration: 0.21, ease: 'power3.out',
    clearProps: 'height', // 动画后交还文档流，避免锁死后续内容变化的自然高度
  })
}

/* ==== T8 ==== */

/**
 * 任务详情垂直时间线入场：逐阶段行上浮淡入 stagger（demo v5 playStages 对位，.25s/power2.out/.04）。
 * 与文件上方 revealList 的差别：本函数按 T8 验收走 gsap.matchMedia 双分支（测试要能断言
 * 「reduce 分支被真消费」而不是 window.matchMedia 布尔短路），reduce → gsap.set 直达终态。
 * 必须在 useGSAP({ scope }) 回调内同步调用（选择器文本按 scope 寻址 + 自动清理，同文件头告诫）；
 * matchMedia context 建在 useGSAP 的 gsap.context 内，卸载/依赖重跑时随之 revert。
 * 环境无 matchMedia（极老内核）→ 直达终态兜底，不留半透明残留（WorkbenchView 预演的同款兜底）。
 */
export function revealStages(targets: gsap.TweenTarget): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    gsap.set(targets, { autoAlpha: 1, y: 0 })
    return
  }
  let handled = false
  gsap.matchMedia().add(
    { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
    (ctx) => {
      handled = true
      const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
      if (reduce) {
        gsap.set(targets, { autoAlpha: 1, y: 0 })
        return
      }
      gsap.fromTo(
        targets,
        { autoAlpha: 0, y: 6 },
        { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power2.out', stagger: 0.04, clearProps: 'all' },
      )
    },
  )
  // matchMedia 存在但两个条件都不匹配（非常规 UA 桩）：同无 matchMedia 兜底，保证可见。
  if (!handled) gsap.set(targets, { autoAlpha: 1, y: 0 })
}
