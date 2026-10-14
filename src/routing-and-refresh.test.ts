import { describe, expect, it } from 'vitest'
import { orderedStatuses } from './format.ts'
import { mergeRefresh } from './request-state.ts'
import { navigation, pageFromHash, pageSlug } from './routes.ts'

describe('hash routing', () => {
  it('round-trips every page and falls back to the Org Flow home', () => {
    for (const page of navigation) expect(pageFromHash(`#/${pageSlug(page)}`)).toBe(page)
    expect(pageFromHash('#/task-board')).toBe('Task Board')
    expect(pageFromHash('#dashboard')).toBe('Org Flow')
    expect(pageFromHash('')).toBe('Org Flow')
    expect(pageFromHash('#/nope')).toBe('Org Flow')
    expect(navigation).toContain('Logs')
    expect(navigation).not.toContain('Office')
    expect(pageFromHash('#/office')).toBe('Office')
    expect(pageFromHash('#/knowledge')).toBe('Memory')
    expect(pageFromHash('#/folders/coder')).toBe('Folders')
  })
})

describe('background refresh', () => {
  it('keeps the last good data (marked stale) when a refresh fails', () => {
    expect(mergeRefresh({ status: 'ready', data: 1 }, { status: 'failed' })).toEqual({ status: 'ready', data: 1, stale: true })
    expect(mergeRefresh<number>({ status: 'pending' }, { status: 'failed' })).toEqual({ status: 'failed' })
    expect(mergeRefresh({ status: 'ready', data: 1, stale: true }, { status: 'ready', data: 2 })).toEqual({ status: 'ready', data: 2 })
  })
})

describe('kanban column order', () => {
  it('follows the Hermes board order and appends unknown statuses', () => {
    expect(orderedStatuses(['done', 'custom', 'running', 'triage'])).toEqual(['triage', 'running', 'done', 'custom'])
    expect(orderedStatuses(['blocked'], true)).toEqual(['todo', 'ready', 'running', 'blocked', 'review', 'done'])
  })
})
