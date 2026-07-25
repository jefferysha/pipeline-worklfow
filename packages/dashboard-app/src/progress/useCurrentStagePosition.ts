import { useEffect, useRef, type RefObject } from 'react'

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
