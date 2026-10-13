import { describe, expect, it } from 'vitest'
import { isBackEdge, narrative, ranks, swimlane, type FlowStep } from '../src/orgflow-layout.ts'
import { effectiveness, roleOfTask, sections } from '../server/orgflow.ts'

describe('orgflow layout', () => {
  const steps: FlowStep[] = [
    { id: 'start', role: 'procurement', tipe: 'start', label: 'Mulai', ke: [{ id: 'task1' }], uang: false },
    { id: 'task1', role: 'procurement', tipe: 'task', label: 'Draft PO', ke: [{ id: 'gate' }], uang: true },
    { id: 'gate', role: 'gm', tipe: 'gateway', label: 'Acc?', ke: [{ id: 'task2', syarat: 'Ya' }, { id: 'task1', syarat: 'Revisi' }], uang: false },
    { id: 'task2', role: 'admin', tipe: 'task', label: 'Terbitkan PO', ke: [{ id: 'end' }], uang: false },
    { id: 'end', role: 'finance', tipe: 'end', label: 'Bayar', ke: [], uang: true },
  ]

  it('computes DAG ranks ignoring back-edges (loop revisited earlier)', () => {
    const r = ranks(steps)
    expect(r.get('start')).toBe(0)
    expect(r.get('task1')).toBe(1)
    expect(r.get('gate')).toBe(2)
    expect(r.get('task2')).toBe(3)
    expect(r.get('end')).toBe(4)
    expect(isBackEdge(r, 'gate', 'task1')).toBe(true)
    expect(isBackEdge(r, 'gate', 'task2')).toBe(false)
  })

  it('places steps in swimlanes with ordered lane IDs', () => {
    const { placed, laneIds, cols } = swimlane(steps, (r) => r)
    expect(laneIds).toEqual(['procurement', 'gm', 'admin', 'finance'])
    expect(cols).toBe(5)
    expect(placed.map((p) => p.lane)).toEqual(['procurement', 'procurement', 'gm', 'admin', 'finance'])
  })

  it('generates human narrative from steps', () => {
    const lines = narrative(steps, (r) => r.toUpperCase())
    expect(lines[0]).toContain('Mulai')
    expect(lines[1]).toContain('[menyentuh uang]')
    expect(lines[2]).toContain('memutuskan "Acc?"')
    expect(lines[4]).toContain('Selesai')
  })
})

describe('server orgflow helpers', () => {
  it('parses markdown sections by ##', () => {
    const s = sections('lead\n## 1. Persona\nBudi\n## 2. Scope\nNgoding')
    expect(s.map((x) => x.judul)).toEqual(['1. Persona', '2. Scope'])
  })

  it('matches kanban tasks to role by [Persona] title prefix, then skill', () => {
    const roles = [{ id: 'procurement', nama: 'Bu Narti', alias: [], skills: ['rdk-role-procurement'] }]
    expect(roleOfTask('[Bu Narti] Audit buffer', [], roles)).toEqual({ role: 'procurement', persona: 'Bu Narti' })
    expect(roleOfTask('Audit buffer', ['rdk-role-procurement'], roles)).toEqual({ role: 'procurement', persona: undefined })
    expect(roleOfTask('Acak-acakan', [], roles)).toEqual({ persona: undefined })
  })

  it('calculates effectiveness weighting autonomy highest', () => {
    expect(effectiveness({ total: 10, selesai: 10, otonom: 10, gagal: 0 })).toBe(100)
    expect(effectiveness({ total: 10, selesai: 10, otonom: 5, gagal: 5 })).toBeLessThan(80)
    expect(effectiveness({ total: 0, selesai: 0, otonom: 0, gagal: 0 })).toBeNull()
  })
})
