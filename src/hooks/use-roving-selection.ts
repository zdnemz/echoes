import { useCallback, useRef } from 'react'
import type { KeyboardEvent, Ref } from 'react'

/**
 * Which index an arrow/navigation key moves to, or null when the key is not
 * ours to handle.
 *
 * Pure so it can be unit-tested without a DOM — it is the part of the roving
 * behaviour that is easy to get subtly wrong (wrap-around, Home/End).
 */
export function nextIndexForKey(key: string, current: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (current + 1) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * Roving-tabindex + arrow-key behaviour for a single-select group — used by
 * both `role="tablist"` (tabs) and `role="radiogroup"` (mood pickers).
 *
 * The ARIA Authoring Practices require such a group to be a single tab stop:
 * exactly one item carries tabIndex 0, the rest -1, with arrow keys moving
 * (and selecting) between them. Four tablists and two mood pickers had
 * `role`/`aria-selected` but no roving tabindex and no arrow keys, so a
 * keyboard user tabbed through every option and screen readers announced each
 * button in isolation with no group position.
 *
 * Selection moves with focus (automatic activation), matching native radios.
 */
export function useRovingSelection<T>({
  values,
  selected,
  onSelect,
  disabled = false,
}: {
  values: readonly T[]
  selected: T
  onSelect: (value: T) => void
  disabled?: boolean
}) {
  const items = useRef<Map<T, HTMLElement | null>>(new Map())
  const selectedIndex = values.indexOf(selected)

  const registerItem = useCallback(
    (value: T): Ref<HTMLButtonElement> =>
      (el) => {
        items.current.set(value, el)
      },
    [],
  )

  // The single tab stop: the selected item, or the first when none is.
  const tabIndexFor = (value: T) => {
    const index = values.indexOf(value)
    return index === (selectedIndex >= 0 ? selectedIndex : 0) ? 0 : -1
  }

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (disabled) return
      const next = nextIndexForKey(e.key, selectedIndex >= 0 ? selectedIndex : 0, values.length)
      if (next === null) return
      e.preventDefault()
      const value = values[next]
      onSelect(value)
      items.current.get(value)?.focus()
    },
    [values, selectedIndex, onSelect, disabled],
  )

  return { registerItem, tabIndexFor, onKeyDown }
}
