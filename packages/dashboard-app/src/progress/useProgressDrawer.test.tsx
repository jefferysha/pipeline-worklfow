import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useProgressDrawer } from './useProgressDrawer'

const { gsapTo } = vi.hoisted(() => ({ gsapTo: vi.fn() }))

vi.mock('gsap', () => ({
  default: {
    to: gsapTo,
    set: vi.fn(),
    fromTo: vi.fn(),
  },
}))

vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn(),
}))

function Harness(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const drawer = useProgressDrawer({
    rootRef,
    currentRoot: '/repo',
    rows: [],
  })
  return (
    <div ref={rootRef}>
      <div ref={drawer.scrimRef} />
      <aside ref={drawer.drawerRef} />
      <button type="button" onClick={() => drawer.openDrawer('change@workflow')}>open</button>
      <button type="button" onClick={drawer.closeDrawer}>close</button>
    </div>
  )
}

describe('useProgressDrawer motion vocabulary', () => {
  beforeEach(() => {
    gsapTo.mockReset()
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
  })

  it('关闭 scrim 和 drawer 均使用 ease-out', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(gsapTo).toHaveBeenNthCalledWith(
      1,
      expect.any(HTMLDivElement),
      expect.objectContaining({ ease: 'power1.out' }),
    )
    expect(gsapTo).toHaveBeenNthCalledWith(
      2,
      expect.any(HTMLElement),
      expect.objectContaining({ ease: 'power3.out' }),
    )
  })
})
