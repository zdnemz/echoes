import { describe, expect, test } from 'bun:test'
import { nextIndexForKey } from '../use-roving-selection'

/**
 * The wrap-around arithmetic is the part of the roving-tabindex behaviour
 * that is easy to get subtly wrong (and impossible to eyeball), so it is
 * extracted pure and checked here.
 */
describe('nextIndexForKey', () => {
  const n = 3

  test('ArrowRight / ArrowDown advance and wrap forward', () => {
    expect(nextIndexForKey('ArrowRight', 0, n)).toBe(1)
    expect(nextIndexForKey('ArrowRight', 2, n)).toBe(0)
    expect(nextIndexForKey('ArrowDown', 1, n)).toBe(2)
  })

  test('ArrowLeft / ArrowUp retreat and wrap backward', () => {
    expect(nextIndexForKey('ArrowLeft', 0, n)).toBe(2)
    expect(nextIndexForKey('ArrowLeft', 2, n)).toBe(1)
    expect(nextIndexForKey('ArrowUp', 1, n)).toBe(0)
  })

  test('Home and End jump to the edges', () => {
    expect(nextIndexForKey('Home', 2, n)).toBe(0)
    expect(nextIndexForKey('End', 0, n)).toBe(2)
  })

  test('other keys are not ours to handle', () => {
    for (const key of ['Enter', ' ', 'Tab', 'Escape', 'a']) {
      expect(nextIndexForKey(key, 0, n)).toBeNull()
    }
  })

  test('a single item wraps onto itself', () => {
    expect(nextIndexForKey('ArrowRight', 0, 1)).toBe(0)
    expect(nextIndexForKey('ArrowLeft', 0, 1)).toBe(0)
  })

  test('an empty group has nowhere to go', () => {
    expect(nextIndexForKey('ArrowRight', 0, 0)).toBeNull()
  })
})
