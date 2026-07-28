import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { DRAWER_FOCUSABLE_SEL, rowKeyOf, type FlatRow } from './progressViewModel'

export interface ProgressDrawerOptions {
  rootRef: RefObject<HTMLElement>
  currentRoot: string
  rows: readonly FlatRow[]
  selectedChange?: string | null
  onSelectedChange?: (name: string | null) => void
}

export interface ProgressDrawerState {
  drawerRef: RefObject<HTMLElement>
  scrimRef: RefObject<HTMLDivElement>
  drawerKey: string | null
  drawerRow: FlatRow | null
  openDrawer: (key: string, trigger?: HTMLElement | null) => void
  closeDrawer: () => void
}

export function useProgressDrawer({
  rootRef,
  currentRoot,
  rows,
  selectedChange,
  onSelectedChange,
}: ProgressDrawerOptions): ProgressDrawerState {
  const drawerRef = useRef<HTMLElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const closingRef = useRef(false)
  const [drawerKey, setDrawerKey] = useState<string | null>(null)
  const rowByKey = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows])
  const drawerRow = drawerKey === null ? null : (rowByKey.get(drawerKey) ?? null)
  const drawerOpen = drawerRow !== null

  useEffect(() => {
    if (selectedChange === undefined) return
    if (selectedChange === null) {
      if (drawerKey !== null) setDrawerKey(null)
      return
    }
    const key = rowKeyOf(currentRoot, selectedChange)
    if (rowByKey.has(key) && drawerKey !== key) setDrawerKey(key)
  }, [currentRoot, drawerKey, rowByKey, selectedChange])

  const closeDrawer = useCallback((): void => {
    if (closingRef.current) return
    const drawer = drawerRef.current
    const scrim = scrimRef.current
    const motion = typeof window.matchMedia === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!motion || !drawer || !scrim) {
      setDrawerKey(null)
      onSelectedChange?.(null)
      return
    }
    closingRef.current = true
    gsap.to(scrim, { autoAlpha: 0, duration: 0.2, ease: 'power1.out' })
    gsap.to(drawer, {
      xPercent: 103,
      duration: 0.24,
      ease: 'power3.out',
      onComplete: () => {
        closingRef.current = false
        setDrawerKey(null)
        onSelectedChange?.(null)
      },
    })
  }, [onSelectedChange])

  const openDrawer = useCallback((key: string, trigger?: HTMLElement | null): void => {
    if (closingRef.current) return
    triggerRef.current = trigger
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setDrawerKey(key)
    const separator = key.indexOf('@')
    onSelectedChange?.(separator < 0 ? key : key.slice(0, separator))
  }, [onSelectedChange])

  useEffect(() => {
    if (!drawerOpen) return
    document.documentElement.classList.add('prg9-lock')
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        closeDrawer()
        return
      }
      if (event.key !== 'Tab') return
      const drawer = drawerRef.current
      if (!drawer) return
      const focusables = Array.from(drawer.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SEL))
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      const inside = active instanceof HTMLElement && drawer.contains(active)
      if (!inside) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      closingRef.current = false
      document.documentElement.classList.remove('prg9-lock')
      document.removeEventListener('keydown', onKey)
      const trigger = triggerRef.current
      if (trigger?.isConnected) trigger.focus()
    }
  }, [closeDrawer, drawerOpen])

  useEffect(() => {
    if (!drawerOpen) return
    drawerRef.current?.querySelector<HTMLElement>('[data-testid="detail-close"]')?.focus()
  }, [drawerOpen])

  useGSAP(() => {
    const drawer = drawerRef.current
    const scrim = scrimRef.current
    if (!drawer || !scrim) return
    if (typeof window.matchMedia !== 'function') {
      gsap.set(drawer, { x: 0, xPercent: 0 })
      gsap.set(scrim, { autoAlpha: 1 })
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      gsap.set(drawer, { x: 0, xPercent: 0 })
      gsap.set(scrim, { autoAlpha: 1 })
      return
    }
    gsap.fromTo(scrim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' })
    gsap.fromTo(drawer, { x: 0, xPercent: 103 }, { xPercent: 0, duration: 0.26, ease: 'power3.out' })
  }, { scope: rootRef, dependencies: [drawerKey] })

  return { drawerRef, scrimRef, drawerKey, drawerRow, openDrawer, closeDrawer }
}
