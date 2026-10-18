import { describe, expect, it } from 'vitest'
import { swipeAction, triageKey } from './triage'

describe('triageKey', () => {
  it('maps numbers and letters to types', () => {
    expect(triageKey('1')).toEqual({ kind: 'classify', type: 'vocab' })
    expect(triageKey('V')).toEqual({ kind: 'classify', type: 'vocab' })
    expect(triageKey('q')).toEqual({ kind: 'classify', type: 'quote' })
    expect(triageKey('3')).toEqual({ kind: 'classify', type: 'lore' })
  })

  it('maps skip and undo keys', () => {
    expect(triageKey('s')).toEqual({ kind: 'skip' })
    expect(triageKey('ArrowRight')).toEqual({ kind: 'skip' })
    expect(triageKey('U')).toEqual({ kind: 'undo' })
    expect(triageKey('Backspace')).toEqual({ kind: 'undo' })
  })

  it('ignores other keys', () => {
    expect(triageKey('x')).toBeNull()
    expect(triageKey('ArrowLeft')).toBeNull()
  })
})

describe('swipeAction', () => {
  it('skips on a left swipe', () => {
    expect(swipeAction(-120, 10, null)).toBe('skip')
  })

  it('accepts on a right swipe only with a suggestion', () => {
    expect(swipeAction(120, 0, 'quote')).toBe('accept')
    expect(swipeAction(120, 0, null)).toBeNull()
  })

  it('ignores short or mostly vertical gestures', () => {
    expect(swipeAction(40, 0, 'vocab')).toBeNull()
    expect(swipeAction(-100, 200, 'vocab')).toBeNull()
  })
})
