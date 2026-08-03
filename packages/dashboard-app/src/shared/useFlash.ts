import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { toastIn } from './motion'

export interface Flash {
  readonly kind: 'toast' | 'error'
  readonly msg: string
}

export function useFlash(language: string): {
  readonly flash: Flash | null
  readonly flashRef: RefObject<HTMLDivElement>
  readonly showFlash: (kind: Flash['kind'], message: string) => void
} {
  const [flash, setFlash] = useState<Flash | null>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    setFlash(null)
  }, [language])

  useEffect(() => {
    if (!flash || !flashRef.current) return
    const tween = toastIn(flashRef.current)
    return () => tween.kill()
  }, [flash])

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const showFlash = useCallback((kind: Flash['kind'], message: string): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    setFlash({ kind, msg: message })
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setFlash(null)
    }, 4000)
  }, [])

  return { flash, flashRef, showFlash }
}
