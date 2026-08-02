import { useEffect, useRef, type RefObject } from 'react'

/** Restore the control that started an atomic mutation when a retry remains possible. */
export function useMutationFocus(busy: boolean, editorOpen: boolean): {
  readonly saveButtonRef: RefObject<HTMLButtonElement>
  readonly capture: () => void
} {
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const restoreTarget = useRef<HTMLElement | null>(null)
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy) {
      const target = restoreTarget.current
      restoreTarget.current = null
      if (editorOpen) {
        if (target?.isConnected && !target.matches(':disabled')) target.focus()
        else saveButtonRef.current?.focus()
      }
    }
    wasBusy.current = busy
  }, [busy, editorOpen])
  return {
    saveButtonRef,
    capture: () => {
      restoreTarget.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    },
  }
}
