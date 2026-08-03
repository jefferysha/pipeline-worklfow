import { useEffect, useRef, useState, type RefObject } from 'react'

export function useCanvasOverflow(
  rootRef: RefObject<HTMLElement>,
  layoutKey: string,
): ReadonlySet<string> {
  const [overflowingGroups, setOverflowingGroups] = useState<Set<string>>(new Set())
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = (): void => {
      const next = new Set<string>()
      for (const viewport of root.querySelectorAll<HTMLElement>('[data-canvas-scroll]')) {
        if (viewport.scrollWidth > viewport.clientWidth + 1) next.add(viewport.dataset.scrollKey ?? '')
      }
      setOverflowingGroups((current) =>
        current.size === next.size && [...current].every((key) => next.has(key)) ? current : next)
    }
    measure()
    const frame = window.requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    for (const viewport of root.querySelectorAll<HTMLElement>('[data-canvas-scroll]')) observer?.observe(viewport)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [layoutKey, rootRef])
  return overflowingGroups
}

export function useCurrentStagePosition(
  rootRef: RefObject<HTMLElement>,
  currentPositionKey: string,
): void {
  const positionedKeys = useRef(new WeakMap<HTMLElement, string>())

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    for (const viewport of root.querySelectorAll<HTMLElement>('[data-canvas-scroll]')) {
      const groupPositionKey = viewport.dataset.currentPositionKey ?? ''
      if (positionedKeys.current.get(viewport) === groupPositionKey) continue
      const current = viewport.querySelector<HTMLElement>('[data-stage-state="current"]')
      if (
        !current
        || viewport.clientWidth <= 0
        || typeof viewport.scrollTo !== 'function'
      ) continue
      viewport.scrollTo({
        left: Math.max(0, current.offsetLeft - (viewport.clientWidth - current.offsetWidth) / 2),
        behavior: 'auto',
      })
      positionedKeys.current.set(viewport, groupPositionKey)
    }
  }, [currentPositionKey, rootRef])
}
