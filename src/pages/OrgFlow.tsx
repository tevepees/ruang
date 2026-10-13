import '@xyflow/react/dist/style.css'
import '../orgflow.css'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { useMemo, useState, type ReactNode } from 'react'
import { formatDateTime } from '../format.ts'
import { COL_W, LANE_H, LANE_LABEL_W, isBackEdge, narrative, ranks, swimlane, type FlowStep } from '../orgflow-layout.ts'
import { usePolling } from '../polling.ts'
import { Dialog, LoadingState, PageTitle, SourceStatus, Unavailable } from '../ui.tsx'

// ---- API shape (server/orgflow.ts) ----
interface EdgeRef { ke: string; apa?: string; kapan?: string; sop?: string }
interface Role {
  id: string; nama: string; jabatan: string; tier: string; status: string; statusKind: string; meja: string; runtime: string; alias: string[]
  atasan?: string; pengawas?: string; uang: boolean; butuhTony: boolean; skills: string[]; sistem: string[]
  pemicu: { jenis: string; job?: string; label: string }[]; tugas: string[]; serah: EdgeRef[]; eskalasi: EdgeRef[]; sop: string[]
  file: string; sections: { judul: string; isi: string }[]
}
interface Sop { id: string; judul: string; status: string; versi: string; owner: string; file: string; langkah: FlowStep[] }
interface Aktor { id: string; nama: string; jabatan: string; jenis: string; meja?: string }
interface ActiveTask { id: string; judul: string; status: string; umurJam: number; heartbeat?: string; alasan?: string }
interface Live {
  role: string; total: number; selesai: number; selesai7: number; otonom: number; gagal: number; blockedSekarang: number; efektivitas: number | null
  rataDurasiMenit: number | null; terakhirAktif: string | null; nganggur: boolean; batasNganggurHari: number; sedangBekerja: boolean; bebanRelatif: number
  aktif: ActiveTask[]; celah: string[]; cron: { name: string; schedule: string; lastStatus?: string; lastRun?: string; nextRun?: string }[]
}
interface Temuan { id: string; judul: string; jenis: string; uang?: boolean; sumber_a: string; sumber_b: string; pro_a?: string; pro_b?: string; rekomendasi?: string; status: string; keputusan?: string }
interface OrgFlowSnapshot {
  roles: Role[]; sops: Sop[]; meja: { id: string; nama: string }[]; aktor: Aktor[]; kasus: { id: string; judul: string; sop: string[] }[]; dueDiligence: Temuan[]
  live: Live[]; tiketTakTerpetakan: { id: string; judul: string; status: string; persona?: string }[]
  drift: { tidakDiSop: { dari: string; ke: string; jumlah: number }[]; belumPernahTerjadi: { dari: string; ke: string }[]; personaTanpaKontrak: string[]; aliasTanpaKontrak: { alias: string; dipakaiOleh: string }[]; sopRoleTakDikenal: { sop: string; langkah: string; role: string }[]; totalTautanKanban: number }
  sistem: { profiles: string[]; cron: { name: string; profile: string; schedule: string; enabled: boolean; lastStatus?: string; lastRun?: string }[]; cronTanpaRole: { name: string; profile: string; schedule: string }[]; kanbanTersedia: boolean; vault: string }
  fetchedAt: string
}

const TABS = ['Peta Organisasi', 'Alur SOP', 'Kasus', 'Kenyataan', 'Due Diligence'] as const
type Tab = typeof TABS[number]
const STATUS_TONE: Record<string, string> = { ACTIVE: 'good', SEBAGIAN: 'unknown', STANDBY: 'info', BLOCKED: 'bad', DRAFT: 'muted' }

interface Filters { meja: string; uang: boolean; tony: boolean; status: string }
const matches = (role: Role, f: Filters) => (f.meja === 'all' || role.meja === f.meja) && (!f.uang || role.uang) && (!f.tony || role.butuhTony) && (f.status === 'all' || role.statusKind === f.status)

// ---- Diagram nodes (BPMN-lite shapes) ----
type StepData = { label: string; who: string; tipe: string; uang: boolean; dim: boolean }
function StepNode({ data }: NodeProps<Node<StepData>>) {
  return <div className={`of-step of-${data.tipe}${data.uang ? ' of-money' : ''}${data.dim ? ' of-dim' : ''}`} title={`${data.who}: ${data.label}`}>
    <Handle type="target" position={Position.Left}/>
    {data.tipe === 'gateway' ? <><span className="of-diamond" aria-hidden="true"/><span className="of-gw-label">{data.label}</span></> : <span>{data.label}</span>}
    {data.uang && <b className="of-coin" aria-label="menyentuh uang">Rp</b>}
    <Handle type="source" position={Position.Right}/>
  </div>
}
type LaneData = { label: string; sub: string; width: number; roleId?: string; onOpen?: (id: string) => void }
function LaneNode({ data }: NodeProps<Node<LaneData>>) {
  return <div className="of-lane" style={{ width: data.width, height: LANE_H }}>
    <button type="button" className="of-lane-label" disabled={!data.roleId} onClick={() => data.roleId && data.onOpen?.(data.roleId)}><b>{data.label}</b><small>{data.sub}</small></button>
  </div>
}
type RoleData = { role: Role; live?: Live; dim: boolean }
function RoleNode({ data }: NodeProps<Node<RoleData>>) {
  const { role, live } = data
  return <div className={`of-role${data.dim ? ' of-dim' : ''}${live?.sedangBekerja ? ' of-working' : ''}`}>
    <Handle type="target" position={Position.Top}/>
    <b>{role.nama}</b><small>{role.jabatan}</small>
    <span className="of-role-tags"><span className={`badge ${STATUS_TONE[role.statusKind] ?? 'muted'}`}>{role.statusKind}</span>{role.uang && <span className="of-coin">Rp</span>}{role.butuhTony && <span className="chip">Tony</span>}</span>
    <Handle type="source" position={Position.Bottom}/>
  </div>
}
type BoxData = { label: string; sub?: string }
function BoxNode({ data }: NodeProps<Node<BoxData>>) {
  return <div className="of-box"><Handle type="target" position={Position.Top}/><b>{data.label}</b>{data.sub && <small>{data.sub}</small>}<Handle type="source" position={Position.Bottom}/></div>
}
const nodeTypes = { step: StepNode, lane: LaneNode, role: RoleNode, box: BoxNode }

function Diagram({ nodes, edges, height = 520, onNode }: { nodes: Node[]; edges: Edge[]; height?: number; onNode?: (id: string) => void }) {
  return <div className="of-canvas" style={{ height }}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.08 }} minZoom={0.2} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => onNode?.(node.id)}>
      <Background gap={24} size={1}/><Controls showInteractive={false}/>
    </ReactFlow>
  </div>
}

// ---- helpers ----
function useLookup(data: OrgFlowSnapshot) {
  return useMemo(() => {
    const roles = new Map(data.roles.map((r) => [r.id, r]))
    const aktor = new Map(data.aktor.map((a) => [a.id, a]))
    const live = new Map(data.live.map((l) => [l.role, l]))
    const meja = new Map(data.meja.map((m) => [m.id, m.nama]))
    const name = (id: string) => roles.get(id)?.nama ?? aktor.get(id)?.nama ?? id
    const title = (id: string) => roles.get(id)?.jabatan ?? aktor.get(id)?.jabatan ?? ''
    const mejaOf = (id: string) => roles.get(id)?.meja ?? aktor.get(id)?.meja ?? 'SYS'
    return { roles, aktor, live, meja, name, title, mejaOf }
  }, [data])
}
type Lookup = ReturnType<typeof useLookup>

function edgeStyle(kind: 'serah' | 'eskalasi' | 'back' | 'flow' | 'atasan'): Partial<Edge> {
  const color = { serah: 'var(--accent)', eskalasi: 'var(--c-ff9d8f, #ff9d8f)', back: 'var(--text-dim)', flow: 'var(--text-muted)', atasan: 'var(--border-strong)' }[kind]
  return { style: { stroke: color, strokeWidth: kind === 'atasan' ? 1 : 1.6, strokeDasharray: kind === 'eskalasi' || kind === 'back' ? '6 4' : undefined }, markerEnd: { type: MarkerType.ArrowClosed, color } }
}

/** Builds swimlane nodes for one or more SOPs placed left-to-right (cases chain SOPs). */
function flowGraph(sops: Sop[], look: Lookup, byMeja: boolean, filters: Filters, onOpen: (id: string) => void): { nodes: Node[]; edges: Edge[]; lanes: number } {
  const laneOf = (role: string) => byMeja ? look.mejaOf(role) : role
  const allSteps = sops.flatMap((sop) => sop.langkah.map((step) => ({ ...step, id: `${sop.id}:${step.id}`, ke: step.ke.map((k) => ({ ...k, id: `${sop.id}:${k.id}` })) })))
  const laneOrder = [...new Set(allSteps.map((s) => laneOf(s.role)))]
  const nodes: Node[] = []
  const edges: Edge[] = []
  let offset = 0
  let previousEnd: string | undefined
  for (const sop of sops) {
    const steps = allSteps.filter((s) => s.id.startsWith(`${sop.id}:`))
    const { placed, cols } = swimlane(steps, laneOf, offset, laneOrder)
    const rank = ranks(steps)
    for (const p of placed) {
      const step = steps.find((s) => s.id === p.id)!
      const role = look.roles.get(step.role)
      const dim = Boolean(role && !matches(role, filters)) || (filters.uang && !step.uang)
      nodes.push({ id: p.id, type: 'step', position: { x: p.x, y: p.y }, data: { label: step.label, who: look.name(step.role), tipe: step.tipe, uang: step.uang, dim }, zIndex: 2 })
      for (const k of step.ke) {
        const back = isBackEdge(rank, step.id, k.id)
        edges.push({ id: `${step.id}>${k.id}`, source: step.id, target: k.id, label: k.syarat, type: back ? 'smoothstep' : 'default', ...edgeStyle(back ? 'back' : 'flow'), labelStyle: { fontSize: 11 }, labelBgStyle: { fill: 'var(--surface)' } })
      }
    }
    const start = steps.find((s) => s.tipe === 'start')
    if (previousEnd && start) edges.push({ id: `${previousEnd}>>${start.id}`, source: previousEnd, target: start.id, label: `lanjut ${sop.id}`, ...edgeStyle('serah'), animated: true })
    previousEnd = steps.find((s) => s.tipe === 'end')?.id
    offset += cols + 1
  }
  const width = LANE_LABEL_W + offset * COL_W + 40
  laneOrder.forEach((lane, index) => nodes.unshift({
    id: `lane:${lane}`, type: 'lane', position: { x: 0, y: index * LANE_H }, selectable: false, zIndex: 0,
    data: byMeja ? { label: look.meja.get(lane) ?? lane, sub: lane, width } : { label: look.name(lane), sub: look.title(lane), width, roleId: look.roles.has(lane) ? lane : undefined, onOpen },
  }))
  return { nodes, edges, lanes: laneOrder.length }
}

// ---- Tabs ----
function OrgMap({ data, look, filters, onOpen }: { data: OrgFlowSnapshot; look: Lookup; filters: Filters; onOpen: (id: string) => void }) {
  const [show, setShow] = useState({ serah: true, eskalasi: false, atasan: false })
  const { nodes, edges } = useMemo(() => {
    const mejaIds = data.meja.map((m) => m.id).filter((id) => id !== 'SYS')
    const nodes: Node[] = [{ id: 'tony', type: 'box', position: { x: 520, y: 0 }, data: { label: 'Tony', sub: 'Owner / Direktur' } }]
    const colW = 210, rowH = 128
    let x = 0
    for (const meja of mejaIds) {
      const members = data.roles.filter((r) => r.meja === meja)
      if (!members.length) continue
      nodes.push({ id: `meja:${meja}`, type: 'box', position: { x, y: 110 }, data: { label: look.meja.get(meja) ?? meja, sub: `${meja} · ${members.length} role` } })
      members.forEach((role, i) => nodes.push({ id: role.id, type: 'role', position: { x, y: 210 + i * rowH }, data: { role, live: look.live.get(role.id), dim: !matches(role, filters) } }))
      x += colW
    }
    const edges: Edge[] = []
    const add = (from: string, to: string, kind: 'serah' | 'eskalasi' | 'atasan', label?: string) => {
      if (!nodes.some((n) => n.id === to) || from === to) return
      const id = `${kind}:${from}>${to}`
      if (edges.some((e) => e.id === id)) return
      edges.push({ id, source: from, target: to, ...edgeStyle(kind), data: { label } })
    }
    for (const role of data.roles) {
      if (show.serah) role.serah.forEach((e) => add(role.id, e.ke, 'serah', e.apa))
      if (show.eskalasi) role.eskalasi.forEach((e) => add(role.id, e.ke, 'eskalasi', e.kapan))
      if (show.atasan && role.atasan) add(role.atasan, role.id, 'atasan')
    }
    return { nodes, edges }
  }, [data, look, filters, show])
  const toggle = (key: keyof typeof show) => setShow((s) => ({ ...s, [key]: !s[key] }))
  return <>
    <div className="of-toolbar">
      <span className="eyebrow">GARIS</span>
      <button type="button" className={`chip chip-button${show.serah ? ' active' : ''}`} onClick={() => toggle('serah')}>Serah terima</button>
      <button type="button" className={`chip chip-button${show.eskalasi ? ' active' : ''}`} onClick={() => toggle('eskalasi')}>Eskalasi</button>
      <button type="button" className={`chip chip-button${show.atasan ? ' active' : ''}`} onClick={() => toggle('atasan')}>Garis atasan</button>
      <span className="muted small-note">Klik role untuk detail. Kotak berbingkai hijau = sedang mengerjakan tiket.</span>
    </div>
    <Diagram nodes={nodes} edges={edges} height={720} onNode={(id) => look.roles.has(id) && onOpen(id)}/>
    <Legend/>
  </>
}

function Legend() {
  return <div className="of-legend">
    <span><i className="of-l-start"/>Mulai</span><span><i className="of-l-task"/>Tugas</span><span><i className="of-l-gw"/>Keputusan</span><span><i className="of-l-end"/>Selesai</span>
    <span><b className="of-coin">Rp</b>Menyentuh uang</span><span><i className="of-l-line"/>Alur / serah terima</span><span><i className="of-l-dash"/>Eskalasi / kembali</span>
  </div>
}

function SopFlows({ data, look, filters, byMeja, onOpen }: { data: OrgFlowSnapshot; look: Lookup; filters: Filters; byMeja: boolean; onOpen: (id: string) => void }) {
  const visible = data.sops.filter((sop) => sop.langkah.length && (!filters.uang || sop.langkah.some((s) => s.uang)) && (filters.meja === 'all' || sop.langkah.some((s) => look.mejaOf(s.role) === filters.meja)))
  const [chosen, setChosen] = useState(visible[0]?.id ?? '')
  const sop = visible.find((s) => s.id === chosen) ?? visible[0]
  if (!sop) return <p className="muted">Tidak ada SOP yang cocok dengan filter.</p>
  return <>
    <div className="of-toolbar">{visible.map((s) => <button type="button" key={s.id} className={`chip chip-button${s.id === sop.id ? ' active' : ''}`} onClick={() => setChosen(s.id)}>{s.id}</button>)}</div>
    <FlowBlock sops={[sop]} title={`${sop.id} · ${sop.judul}`} meta={`v${sop.versi} · ${sop.status} · pemilik ${sop.owner} · ${sop.file}`} look={look} filters={filters} byMeja={byMeja} onOpen={onOpen}/>
  </>
}

function FlowBlock({ sops, title, meta, look, filters, byMeja, onOpen }: { sops: Sop[]; title: string; meta: string; look: Lookup; filters: Filters; byMeja: boolean; onOpen: (id: string) => void }) {
  const graph = useMemo(() => flowGraph(sops, look, byMeja, filters, onOpen), [sops, look, byMeja, filters, onOpen])
  return <section className="of-flow">
    <h2>{title}</h2><p className="doc-meta">{meta}</p>
    <Diagram nodes={graph.nodes} edges={graph.edges} height={Math.max(300, graph.lanes * LANE_H + 60)}/>
    <Legend/>
    <details className="of-narrative" open><summary>Cara kerja (teks otomatis)</summary>
      {sops.map((sop) => <div key={sop.id}>{sops.length > 1 && <p className="eyebrow">{sop.id}</p>}<ol>{narrative(sop.langkah, look.name).map((line, i) => <li key={i}>{line}</li>)}</ol></div>)}
    </details>
  </section>
}

function Cases({ data, look, filters, byMeja, onOpen }: { data: OrgFlowSnapshot; look: Lookup; filters: Filters; byMeja: boolean; onOpen: (id: string) => void }) {
  const [chosen, setChosen] = useState(data.kasus[0]?.id ?? '')
  const kasus = data.kasus.find((k) => k.id === chosen) ?? data.kasus[0]
  const sops = useMemo(() => (kasus?.sop ?? []).map((id) => data.sops.find((s) => s.id === id)).filter((s): s is Sop => Boolean(s)), [kasus, data.sops])
  if (!kasus) return <p className="muted">Belum ada kasus di registry org-flow.md.</p>
  return <>
    <div className="of-toolbar">{data.kasus.map((k) => <button type="button" key={k.id} className={`chip chip-button${k.id === kasus.id ? ' active' : ''}`} onClick={() => setChosen(k.id)}>{k.judul}</button>)}</div>
    <FlowBlock sops={sops} title={kasus.judul} meta={`Rangkaian: ${kasus.sop.join(' → ')}`} look={look} filters={filters} byMeja={byMeja} onOpen={onOpen}/>
  </>
}

function Reality({ data, look, filters, onOpen }: { data: OrgFlowSnapshot; look: Lookup; filters: Filters; onOpen: (id: string) => void }) {
  const rows = data.roles.filter((r) => matches(r, filters)).map((role) => ({ role, live: look.live.get(role.id)! }))
  const working = rows.filter((r) => r.live.aktif.length)
  const sorted = [...rows].sort((a, b) => (a.live.efektivitas ?? -1) - (b.live.efektivitas ?? -1))
  return <>
    <div className="of-kpis">
      <article><span>Role terdaftar</span><strong>{data.roles.length}</strong><small>{data.roles.filter((r) => r.statusKind === 'ACTIVE').length} ACTIVE</small></article>
      <article><span>Sedang bekerja</span><strong>{rows.filter((r) => r.live.sedangBekerja).length}</strong><small>{working.length} punya tiket terbuka</small></article>
      <article><span>Nganggur</span><strong>{rows.filter((r) => r.live.nganggur).length}</strong><small>7 hari (harian) / 30 hari (kejadian)</small></article>
      <article><span>Tiket 30 hari</span><strong>{rows.reduce((a, r) => a + r.live.total, 0)}</strong><small>{rows.reduce((a, r) => a + r.live.otonom, 0)} selesai tanpa campur tangan</small></article>
    </div>
    <section className="of-section"><h2>Sedang dikerjakan</h2>
      {working.length ? <ul className="of-list">{working.flatMap(({ role, live }) => live.aktif.map((t) => <li key={t.id}><button type="button" className="of-link" onClick={() => onOpen(role.id)}>{role.nama}</button> <span className={`badge ${t.status === 'running' ? 'good' : t.status === 'blocked' ? 'bad' : 'info'}`}>{t.status}</span> {t.judul} <small>· {t.umurJam} jam{t.heartbeat ? ` · heartbeat ${formatDateTime(t.heartbeat)}` : ''}</small>{t.alasan && <div className="small-note text-bad">{t.alasan.slice(0, 280)}</div>}</li>))}</ul> : <p className="muted">Tidak ada tiket terbuka saat ini.</p>}
    </section>
    <section className="of-section"><h2>Kinerja per role (30 hari)</h2>
      <p className="muted small-note">Efektivitas: 60% otonomi (selesai tanpa blocked/crash), 25% bebas gagal, 15% tingkat selesai. Diurutkan dari yang paling perlu perhatian.</p>
      <table className="log-table of-table"><thead><tr><th>Role</th><th>Status</th><th>Efektivitas</th><th>Beban</th><th>Tiket</th><th>Selesai (7h)</th><th>Otonom</th><th>Gagal</th><th>Rata durasi</th><th>Terakhir aktif</th><th>Celah</th></tr></thead>
        <tbody>{sorted.map(({ role, live }) => <tr key={role.id} className={live.nganggur ? 'of-idle' : ''}>
          <td><button type="button" className="of-link" onClick={() => onOpen(role.id)}>{role.nama}</button><small>{role.jabatan}</small></td>
          <td><span className={`badge ${STATUS_TONE[role.statusKind] ?? 'muted'}`}>{role.statusKind}</span></td>
          <td>{live.efektivitas === null ? '—' : <Meter value={live.efektivitas}/>}</td>
          <td><Meter value={live.bebanRelatif} neutral/></td>
          <td>{live.total}</td><td>{live.selesai} ({live.selesai7})</td><td>{live.otonom}</td><td>{live.gagal}</td>
          <td>{live.rataDurasiMenit === null ? '—' : `${live.rataDurasiMenit} mnt`}</td>
          <td>{live.terakhirAktif ? formatDateTime(live.terakhirAktif) : 'belum pernah'}{live.nganggur && <small className="text-bad">nganggur &gt; {live.batasNganggurHari} hari</small>}</td>
          <td>{live.celah.length ? <ul className="of-gaps">{live.celah.map((c) => <li key={c}>{c}</li>)}</ul> : <span className="muted">—</span>}</td>
        </tr>)}</tbody></table>
    </section>
    <section className="of-section"><h2>Drift: desain vs kenyataan</h2>
      <div className="of-cols">
        <div><h3>Handoff terjadi tapi tidak dideklarasikan</h3>{data.drift.tidakDiSop.length ? <ul className="of-list">{data.drift.tidakDiSop.map((d) => <li key={d.dari + d.ke}>{look.name(d.dari)} → {look.name(d.ke)} <small>{d.jumlah}×</small></li>)}</ul> : <p className="muted">Tidak ada.</p>}</div>
        <div><h3>Handoff dideklarasikan tapi belum pernah lewat kanban</h3><p className="muted small-note">{data.drift.totalTautanKanban} tautan parent→child di kanban sejauh ini. Estafet antar-role belum berjalan via kanban; role dipicu cron masing-masing.</p><ul className="of-list of-scroll">{data.drift.belumPernahTerjadi.map((d) => <li key={d.dari + d.ke}>{look.name(d.dari)} → {look.name(d.ke)}</li>)}</ul></div>
        <div><h3>Persona / tiket tanpa kontrak role</h3>
          <ul className="of-list">{data.drift.aliasTanpaKontrak.map((a) => <li key={a.alias}><b>{a.alias}</b> — dipakai di bawah {look.name(a.dipakaiOleh)}, tanpa role-*.md sendiri</li>)}
            {data.drift.personaTanpaKontrak.map((p) => <li key={p}><b>{p}</b> — muncul di tiket, tidak ada kontrak</li>)}</ul>
          <p className="eyebrow">TIKET TAK TERPETAKAN ({data.tiketTakTerpetakan.length})</p>
          <ul className="of-list of-scroll">{data.tiketTakTerpetakan.map((t) => <li key={t.id}><span className="badge muted">{t.status}</span> {t.judul}</li>)}</ul>
        </div>
      </div>
    </section>
    <section className="of-section"><h2>Sistem & runtime</h2>
      <p><b>Profile Hermes:</b> {data.sistem.profiles.join(', ')} · semua role berjalan di <code>rdk-agent</code> (target: 1 role = 1 profile). Kanban: {data.sistem.kanbanTersedia ? 'terbaca' : 'tidak terbaca'}.</p>
      <table className="log-table of-table"><thead><tr><th>Cron</th><th>Profile</th><th>Jadwal</th><th>Terakhir</th><th>Dipakai role</th></tr></thead>
        <tbody>{data.sistem.cron.map((c) => { const users = data.roles.filter((r) => r.pemicu.some((p) => p.job === c.name)); return <tr key={c.profile + c.name}>
          <td>{c.name}{!c.enabled && <small className="text-bad">nonaktif</small>}</td><td>{c.profile}</td><td><code>{c.schedule}</code></td>
          <td>{c.lastRun ? formatDateTime(c.lastRun) : '—'} {c.lastStatus && <span className={`badge ${c.lastStatus === 'ok' ? 'good' : 'bad'}`}>{c.lastStatus}</span>}</td>
          <td>{users.length ? users.map((r) => r.nama).join(', ') : <span className="muted">infrastruktur</span>}</td></tr> })}</tbody></table>
    </section>
  </>
}

function Meter({ value, neutral = false }: { value: number; neutral?: boolean }) {
  const tone = neutral ? 'var(--active-border)' : value >= 80 ? 'var(--c-74c59a)' : value >= 50 ? 'var(--accent)' : 'var(--c-ff9d8f, #ff9d8f)'
  return <span className="of-meter" title={`${value}`}><span style={{ width: `${value}%`, background: tone }}/><b>{value}</b></span>
}

function DueDiligence({ data, filters }: { data: OrgFlowSnapshot; filters: Filters }) {
  const [status, setStatus] = useState('all')
  const items = data.dueDiligence.filter((t) => (status === 'all' || t.status === status) && (!filters.uang || t.uang))
  const statuses = [...new Set(data.dueDiligence.map((t) => t.status))]
  return <>
    <p className="muted">Register pertentangan SOP vs kontrak role vs runtime. Sumber: <code>03-projects/ridha-dua-keluarga/org-flow/due-diligence.md</code>. Tidak ada pemenang otomatis; tiap temuan diputuskan bersama, lalu SOP/kontrak diperbarui.</p>
    <div className="of-toolbar"><button type="button" className={`chip chip-button${status === 'all' ? ' active' : ''}`} onClick={() => setStatus('all')}>Semua ({data.dueDiligence.length})</button>
      {statuses.map((s) => <button type="button" key={s} className={`chip chip-button${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>{s} ({data.dueDiligence.filter((t) => t.status === s).length})</button>)}</div>
    <div className="of-dd">{items.map((t) => <article key={t.id} className="card">
      <p className="eyebrow">{t.id} · {t.jenis}{t.uang ? ' · menyentuh uang' : ''}</p>
      <h3>{t.judul} <span className={`badge ${t.status === 'terbuka' ? 'unknown' : t.status === 'selesai' ? 'muted' : 'good'}`}>{t.status}</span></h3>
      <dl className="of-ab"><div><dt>Sumber A</dt><dd>{t.sumber_a}</dd>{t.pro_a && <dd className="muted">Pro: {t.pro_a}</dd>}</div><div><dt>Sumber B</dt><dd>{t.sumber_b}</dd>{t.pro_b && <dd className="muted">Pro: {t.pro_b}</dd>}</div></dl>
      {t.rekomendasi && <p className="card-note"><b>Rekomendasi:</b> {t.rekomendasi}</p>}
      {t.keputusan && <p className="card-note"><b>Keputusan:</b> {t.keputusan}</p>}
    </article>)}</div>
  </>
}

// ---- Role detail panel ----
const PANEL_TABS = ['Ringkasan', 'Alur Internal', 'Relasi', 'Skill & Pemicu', 'Kinerja', 'Kontrak'] as const
function RolePanel({ role, data, look, onClose, onOpen }: { role: Role; data: OrgFlowSnapshot; look: Lookup; onClose: () => void; onOpen: (id: string) => void }) {
  const [tab, setTab] = useState<typeof PANEL_TABS[number]>('Ringkasan')
  const live = look.live.get(role.id)
  const incoming = data.roles.flatMap((r) => r.serah.filter((e) => e.ke === role.id).map((e) => ({ dari: r.id, ...e })))
  const escalatedTo = data.roles.flatMap((r) => r.eskalasi.filter((e) => e.ke === role.id).map((e) => ({ dari: r.id, ...e })))
  const supervises = data.roles.filter((r) => r.pengawas === role.id || r.atasan === role.id)
  const internal = useMemo(() => {
    const steps: FlowStep[] = [
      ...role.pemicu.map((p, i) => ({ id: `p${i}`, role: 'pemicu', tipe: 'start', label: `${p.jenis === 'cron' ? '⏱ ' : ''}${p.label}`, ke: [{ id: 't0' }], uang: false })),
      ...role.tugas.map((t, i) => ({ id: `t${i}`, role: role.id, tipe: 'task', label: t, ke: [{ id: i + 1 < role.tugas.length ? `t${i + 1}` : 'out' }], uang: role.uang && i === role.tugas.length - 1 })),
      { id: 'out', role: role.id, tipe: 'gateway', label: 'Hasil?', ke: [...role.serah.map((_, i) => ({ id: `s${i}`, syarat: 'normal' })), ...role.eskalasi.map((e, i) => ({ id: `e${i}`, syarat: e.kapan }))], uang: false },
      ...role.serah.map((e, i) => ({ id: `s${i}`, role: 'serah', tipe: 'end', label: `→ ${look.name(e.ke)}: ${e.apa ?? ''}`, ke: [], uang: false })),
      ...role.eskalasi.map((e, i) => ({ id: `e${i}`, role: 'eskalasi', tipe: 'end', label: `⚠ ${look.name(e.ke)}`, ke: [], uang: false })),
    ]
    if (!role.tugas.length) steps.forEach((s) => s.ke = s.ke.map((k) => k.id === 't0' ? { id: 'out' } : k))
    const laneName: Record<string, string> = { pemicu: 'Pemicu', serah: 'Serah terima', eskalasi: 'Eskalasi', [role.id]: role.nama }
    const { placed } = swimlane(steps, (r) => r, 0, ['pemicu', role.id, 'serah', 'eskalasi'].filter((l) => steps.some((s) => s.role === l)))
    const rank = ranks(steps)
    const lanesUsed = [...new Set(placed.map((p) => p.lane))]
    const width = LANE_LABEL_W + (Math.max(...rank.values()) + 2) * COL_W
    const nodes: Node[] = [
      ...lanesUsed.map((lane, i) => ({ id: `lane:${lane}`, type: 'lane', position: { x: 0, y: i * LANE_H }, zIndex: 0, data: { label: laneName[lane], sub: '', width } })),
      ...placed.map((p) => { const s = steps.find((x) => x.id === p.id)!; return { id: p.id, type: 'step', zIndex: 2, position: { x: p.x, y: lanesUsed.indexOf(p.lane) * LANE_H + 26 }, data: { label: s.label, who: laneName[s.role], tipe: s.tipe, uang: s.uang, dim: false } } }),
    ]
    const edges: Edge[] = steps.flatMap((s) => s.ke.map((k) => ({ id: `${s.id}>${k.id}`, source: s.id, target: k.id, label: k.syarat === 'normal' ? undefined : k.syarat, ...edgeStyle(k.id.startsWith('e') ? 'eskalasi' : 'flow'), labelStyle: { fontSize: 10 } })))
    return { nodes, edges, height: lanesUsed.length * LANE_H + 60 }
  }, [role, look])
  const Field = ({ label, children }: { label: string; children: ReactNode }) => <div><dt>{label}</dt><dd>{children}</dd></div>
  const RoleLink = ({ id }: { id: string }) => look.roles.has(id) ? <button type="button" className="of-link" onClick={() => onOpen(id)}>{look.name(id)}</button> : <span>{look.name(id)}</span>
  return <Dialog labelledBy="of-role-title" onClose={onClose} closeLabel={`Tutup detail ${role.nama}`} className="of-panel">
    <p className="eyebrow">{role.meja} · {look.meja.get(role.meja)} · {role.tier}</p>
    <h2 id="of-role-title">{role.nama} <small className="muted">{role.jabatan}</small></h2>
    <div className="task-meta"><span className={`badge ${STATUS_TONE[role.statusKind] ?? 'muted'}`}>{role.status}</span><span className="chip">runtime {role.runtime}</span>{role.uang && <span className="chip chip-priority">menyentuh uang</span>}{role.butuhTony && <span className="chip">butuh Tony</span>}{live?.sedangBekerja && <span className="badge good">sedang bekerja</span>}</div>
    <div className="panel-tabs of-panel-tabs" role="tablist">{PANEL_TABS.map((t) => <button type="button" role="tab" aria-selected={tab === t} key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === 'Ringkasan' && <dl className="office-detail-grid">
      <Field label="Atasan">{role.atasan ? <RoleLink id={role.atasan}/> : '—'}</Field>
      <Field label="Diawasi oleh">{role.pengawas ? <RoleLink id={role.pengawas}/> : '—'}</Field>
      <Field label="Tugas utama"><ul className="of-list">{role.tugas.map((t) => <li key={t}>{t}</li>)}</ul></Field>
      <Field label="Pekerjaan dilanjutkan oleh"><ul className="of-list">{role.serah.map((e) => <li key={e.ke + e.apa}><RoleLink id={e.ke}/> — {e.apa}{e.sop && <small> ({e.sop})</small>}</li>)}{!role.serah.length && <li className="muted">—</li>}</ul></Field>
      <Field label="SOP">{role.sop.join(', ') || '—'}</Field>
      <Field label="Sistem disentuh">{role.sistem.join(', ') || '—'}</Field>
      {role.alias.length > 0 && <Field label="Persona lain di role ini">{role.alias.join(', ')}</Field>}
      <Field label="File kontrak"><code>{role.file}</code></Field>
    </dl>}
    {tab === 'Alur Internal' && <Diagram nodes={internal.nodes} edges={internal.edges} height={Math.min(560, internal.height)}/>}
    {tab === 'Relasi' && <dl className="office-detail-grid">
      <Field label="Menerima pekerjaan dari"><ul className="of-list">{incoming.map((e) => <li key={e.dari + e.apa}><RoleLink id={e.dari}/> — {e.apa}</li>)}{!incoming.length && <li className="muted">— (dipicu cron / kejadian)</li>}</ul></Field>
      <Field label="Menyerahkan ke"><ul className="of-list">{role.serah.map((e) => <li key={e.ke + e.apa}><RoleLink id={e.ke}/> — {e.apa}</li>)}{!role.serah.length && <li className="muted">—</li>}</ul></Field>
      <Field label="Eskalasi ke"><ul className="of-list">{role.eskalasi.map((e) => <li key={e.ke + e.kapan}><RoleLink id={e.ke}/> — {e.kapan}</li>)}{!role.eskalasi.length && <li className="muted">—</li>}</ul></Field>
      <Field label="Menerima eskalasi dari"><ul className="of-list">{escalatedTo.map((e) => <li key={e.dari + e.kapan}><RoleLink id={e.dari}/> — {e.kapan}</li>)}{!escalatedTo.length && <li className="muted">—</li>}</ul></Field>
      <Field label="Mengawasi / membawahi"><ul className="of-list">{supervises.map((r) => <li key={r.id}><RoleLink id={r.id}/></li>)}{!supervises.length && <li className="muted">—</li>}</ul></Field>
    </dl>}
    {tab === 'Skill & Pemicu' && <dl className="office-detail-grid">
      <Field label="Skill Hermes"><ul className="of-list">{role.skills.map((s) => <li key={s}><code>{s}</code>{live?.celah.some((c) => c.includes(s)) && <span className="badge bad">tidak terpasang</span>}</li>)}</ul></Field>
      <Field label="Pemicu"><ul className="of-list">{role.pemicu.map((p) => <li key={p.label}>{p.jenis === 'cron' ? '⏱' : '⚡'} {p.label}{p.job && <small> · cron "{p.job}"</small>}</li>)}</ul></Field>
      <Field label="Cron terhubung"><ul className="of-list">{live?.cron.map((c) => <li key={c.name}>{c.name} <code>{c.schedule}</code> {c.lastStatus && <span className={`badge ${c.lastStatus === 'ok' ? 'good' : 'bad'}`}>{c.lastStatus}</span>}{c.nextRun && <small> · berikutnya {formatDateTime(c.nextRun)}</small>}</li>)}{!live?.cron.length && <li className="muted">—</li>}</ul></Field>
    </dl>}
    {tab === 'Kinerja' && live && <>
      <dl className="office-detail-grid">
        <Field label="Efektivitas (30 hari)">{live.efektivitas === null ? 'Belum ada tiket' : <Meter value={live.efektivitas}/>}</Field>
        <Field label="Beban relatif"><Meter value={live.bebanRelatif} neutral/></Field>
        <Field label="Tiket 30 hari">{live.total} total · {live.selesai} selesai · {live.otonom} otonom · {live.gagal} pernah gagal/blocked</Field>
        <Field label="Terakhir aktif">{live.terakhirAktif ? formatDateTime(live.terakhirAktif) : 'belum pernah'}{live.nganggur && <span className="badge bad">nganggur &gt; {live.batasNganggurHari} hari</span>}</Field>
        <Field label="Celah / perlu perbaikan"><ul className="of-gaps">{live.celah.map((c) => <li key={c}>{c}</li>)}{!live.celah.length && <li className="muted">Tidak ada</li>}</ul></Field>
      </dl>
      <p className="eyebrow">TIKET TERBUKA ({live.aktif.length})</p>
      <ul className="of-list">{live.aktif.map((t) => <li key={t.id}><span className="badge info">{t.status}</span> {t.judul} <small>{t.umurJam} jam</small>{t.alasan && <div className="small-note text-bad">{t.alasan}</div>}</li>)}{!live.aktif.length && <li className="muted">Tidak ada.</li>}</ul>
    </>}
    {tab === 'Kontrak' && <div className="of-contract">{role.sections.map((s) => <details key={s.judul}><summary>{s.judul}</summary><pre className="task-text">{s.isi}</pre></details>)}</div>}
  </Dialog>
}

// ---- Page ----
export function OrgFlow() {
  const snapshot = usePolling<OrgFlowSnapshot>('/api/orgflow', 30_000)
  const [tab, setTab] = useState<Tab>('Peta Organisasi')
  const [filters, setFilters] = useState<Filters>({ meja: 'all', uang: false, tony: false, status: 'all' })
  const [byMeja, setByMeja] = useState(false)
  const [openRole, setOpenRole] = useState<string>()
  const title = <PageTitle eyebrow="RDK AUTONOMOUS COMPANY" title="Org Flow">Siapa mengerjakan apa, diawasi siapa, diteruskan ke siapa, dan apa yang sebenarnya terjadi. Desain dibaca dari vault Obsidian; kenyataan dari kanban, diperbarui tiap 30 detik.</PageTitle>
  if (snapshot.status === 'pending') return <>{title}<LoadingState message="Membaca vault & kanban..."/></>
  if (snapshot.status === 'failed') return <>{title}<Unavailable request={snapshot}/></>
  const data = snapshot.data
  return <OrgFlowView data={data} title={title} snapshot={snapshot} tab={tab} setTab={setTab} filters={filters} setFilters={setFilters} byMeja={byMeja} setByMeja={setByMeja} openRole={openRole} setOpenRole={setOpenRole}/>
}

function OrgFlowView({ data, title, snapshot, tab, setTab, filters, setFilters, byMeja, setByMeja, openRole, setOpenRole }: {
  data: OrgFlowSnapshot; title: ReactNode; snapshot: ReturnType<typeof usePolling<OrgFlowSnapshot>>; tab: Tab; setTab: (t: Tab) => void
  filters: Filters; setFilters: (f: Filters) => void; byMeja: boolean; setByMeja: (b: boolean) => void; openRole?: string; setOpenRole: (id?: string) => void
}) {
  const look = useLookup(data)
  const role = openRole ? look.roles.get(openRole) : undefined
  const statuses = [...new Set(data.roles.map((r) => r.statusKind))]
  return <>
    {title}
    <SourceStatus source={{ availability: 'available', data: null }} fetchedAt={data.fetchedAt} request={snapshot}/>
    <div className="of-tabs view-toggle" role="tablist">{TABS.map((t) => <button type="button" role="tab" aria-selected={tab === t} key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}{t === 'Due Diligence' ? ` (${data.dueDiligence.filter((d) => d.status === 'terbuka').length})` : ''}</button>)}</div>
    <div className="of-toolbar of-filters">
      <span className="eyebrow">FILTER</span>
      <label>Meja <select value={filters.meja} onChange={(e) => setFilters({ ...filters, meja: e.target.value })}><option value="all">Semua meja</option>{data.meja.filter((m) => m.id !== 'SYS').map((m) => <option key={m.id} value={m.id}>{m.id} · {m.nama}</option>)}</select></label>
      <label>Status <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select></label>
      <button type="button" className={`chip chip-button${filters.uang ? ' active' : ''}`} onClick={() => setFilters({ ...filters, uang: !filters.uang })}>Rp Menyentuh uang</button>
      <button type="button" className={`chip chip-button${filters.tony ? ' active' : ''}`} onClick={() => setFilters({ ...filters, tony: !filters.tony })}>Butuh approval / aksi Tony</button>
      {(tab === 'Alur SOP' || tab === 'Kasus') && <span className="view-toggle of-lanes"><button type="button" className={!byMeja ? 'active' : ''} onClick={() => setByMeja(false)}>Lane per role</button><button type="button" className={byMeja ? 'active' : ''} onClick={() => setByMeja(true)}>Lane per meja</button></span>}
    </div>
    {tab === 'Peta Organisasi' && <OrgMap data={data} look={look} filters={filters} onOpen={setOpenRole}/>}
    {tab === 'Alur SOP' && <SopFlows data={data} look={look} filters={filters} byMeja={byMeja} onOpen={setOpenRole}/>}
    {tab === 'Kasus' && <Cases data={data} look={look} filters={filters} byMeja={byMeja} onOpen={setOpenRole}/>}
    {tab === 'Kenyataan' && <Reality data={data} look={look} filters={filters} onOpen={setOpenRole}/>}
    {tab === 'Due Diligence' && <DueDiligence data={data} filters={filters}/>}
    {role && <RolePanel role={role} data={data} look={look} onClose={() => setOpenRole(undefined)} onOpen={setOpenRole}/>}
  </>
}
