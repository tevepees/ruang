import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildOrgFlow } from '../server/orgflow.ts'
import { OrgFlow, OrgFlowView } from './pages/OrgFlow.tsx'

describe('OrgFlow server-render smoke test', () => {
  it('renders initial loading shell without throw', () => {
    const html = renderToString(createElement(OrgFlow))
    expect(html).toContain('Org Flow')
  })

  it('buildOrgFlow delivers complete contract for all 22 roles and 6 SOPs', () => {
    const data = buildOrgFlow()
    expect(data.roles.length).toBe(22)
    expect(data.sops.length).toBe(6)
    expect(data.live.length).toBe(22)
    expect(data.dueDiligence.length).toBeGreaterThanOrEqual(16)
    for (const sop of data.sops) {
      expect(sop.langkah.length).toBeGreaterThan(0)
      const ids = new Set(sop.langkah.map((l) => l.id))
      for (const l of sop.langkah) for (const k of l.ke) expect(ids.has(k.id)).toBe(true)
    }
    const buNarti = data.roles.find((r) => r.id === 'procurement')!
    expect(buNarti.nama).toBe('Bu Narti')
    expect(buNarti.uang).toBe(true)
    expect(buNarti.serah.some((s) => s.ke === 'general-manager')).toBe(true)
  })

  it('Agent & Cron tab lists every role, all cron jobs and roles without cron', () => {
    const data = JSON.parse(JSON.stringify(buildOrgFlow()))
    const html = renderToString(createElement(OrgFlowView, { data, title: null, snapshot: { status: 'ready', data, refresh: () => {} } as never, tab: 'Agent & Cron', setTab: () => {}, filters: { meja: 'all', uang: false, tony: false, status: 'all' }, setFilters: () => {}, byMeja: false, setByMeja: () => {}, setOpenRole: () => {} })).replaceAll('<!-- -->', '')
    expect(html).toContain('Role tanpa cron')
    expect(html).toContain(`Semua cron job (${data.sistem.cron.length})`)
    for (const r of data.roles) expect(html).toContain(r.nama)
  })
})
