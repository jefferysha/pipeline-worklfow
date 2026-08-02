import { useEffect, useRef, type RefObject } from 'react'

/** Restore the control that started an atomic mutation when a retry remains possible. */
export function useMutationFocus(busy: boolean, editorOpen: boolean): {
  readonly saveButtonRef: RefObject<HTMLButtonElement>
  readonly capture: () => void
  readonly captureEditorReturn: (target?: HTMLElement | null) => void
} {
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const restoreTarget = useRef<HTMLElement | null>(null)
  const editorReturnTarget = useRef<HTMLElement | null>(null)
  const wasBusy = useRef(false)
  const wasEditorOpen = useRef(editorOpen)
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
  useEffect(() => {
    if (wasEditorOpen.current && !editorOpen) {
      const target = editorReturnTarget.current
      editorReturnTarget.current = null
      if (target?.isConnected && !target.matches(':disabled')) target.focus()
    }
    wasEditorOpen.current = editorOpen
  }, [editorOpen])
  return {
    saveButtonRef,
    capture: () => {
      restoreTarget.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    },
    captureEditorReturn: (target) => {
      editorReturnTarget.current = target === undefined
        ? document.activeElement instanceof HTMLElement ? document.activeElement : null
        : target
    },
  }
}
