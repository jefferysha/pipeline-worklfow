import gsap from 'gsap'

/**
 * 跨视图共享的 GSAP 入场/切换动效（T18 自 workflow/ 迁入 shared/——workflow 编辑器退役，
 * 现消费方：App toast / shared/TaskDetail / WorkbenchView。Phase 3 收尾：stampConfirm/
 * slideInPanel/crossfadeStage/foldOpen 四个导出随旧视图退役后全包零消费，已删）：同一套
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

/** toast 底部滑入：y 14→0 + fade，200ms power2.out。 */
export function toastIn(el: gsap.TweenTarget): void {
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 1, y: 0 })
    return
  }
  gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' })
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
