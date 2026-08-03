import type { KeyboardEvent } from 'react'

export function handleRadioKey(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  count: number,
  select: (index: number) => void,
): void {
  if (count <= 0) return
  let next: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % count
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + count) % count
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = count - 1
  if (next === null) return
  event.preventDefault()
  select(next)
  event.currentTarget
    .closest('[role="radiogroup"]')
    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    [next]?.focus()
}
