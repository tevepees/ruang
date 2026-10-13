// Pure layout helpers for the Org Flow page (no React): swimlane ranks, org-map positions, narratives.

export interface FlowStep { id: string; role: string; tipe: string; label: string; ke: { id: string; syarat?: string }[]; uang: boolean }

/** Column per step: longest path from the start, ignoring back edges (loops such as "Revisi" → earlier step). */
export function ranks(steps: FlowStep[]): Map<string, number> {
  const byId = new Map(steps.map((step) => [step.id, step]))
  const back = new Set<string>()
  const state = new Map<string, 'open' | 'done'>()
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const { id: next } of byId.get(id)?.ke ?? []) {
      if (!byId.has(next)) continue
      if (state.get(next) === 'open') back.add(`${id}>${next}`)
      else if (!state.has(next)) visit(next)
    }
    state.set(id, 'done')
  }
  for (const step of steps) if (!state.has(step.id)) visit(step.id)
  const rank = new Map(steps.map((step) => [step.id, 0]))
  // ponytail: Bellman-Ford style relaxation; SOPs have ~10 steps so O(n·e) is nothing.
  for (let pass = 0; pass < steps.length; pass += 1) {
    let changed = false
    for (const step of steps) for (const { id: next } of step.ke) {
      if (!byId.has(next) || back.has(`${step.id}>${next}`)) continue
      const candidate = rank.get(step.id)! + 1
      if (candidate > rank.get(next)!) { rank.set(next, candidate); changed = true }
    }
    if (!changed) break
  }
  return rank
}

export const isBackEdge = (rank: Map<string, number>, from: string, to: string) => (rank.get(to) ?? 0) <= (rank.get(from) ?? 0)

/** Lane order = first appearance in the flow, so the reading order matches the SOP. */
export function lanes(steps: FlowStep[], laneOf: (role: string) => string): string[] {
  return [...new Set(steps.map((step) => laneOf(step.role)))]
}

export interface Placed { id: string; x: number; y: number; lane: string }
export const COL_W = 230
export const LANE_H = 120
export const LANE_LABEL_W = 170

export function swimlane(steps: FlowStep[], laneOf: (role: string) => string, offsetCol = 0, laneOrder?: string[]): { placed: Placed[]; laneIds: string[]; cols: number } {
  const rank = ranks(steps)
  const laneIds = laneOrder ?? lanes(steps, laneOf)
  // Two steps in the same lane and column would overlap; nudge the later one right.
  const taken = new Set<string>()
  const placed = [...steps].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!).map((step) => {
    const lane = laneOf(step.role)
    let col = rank.get(step.id)!
    while (taken.has(`${lane}:${col}`)) col += 1
    taken.add(`${lane}:${col}`)
    return { id: step.id, lane, x: LANE_LABEL_W + (col + offsetCol) * COL_W + 20, y: laneIds.indexOf(lane) * LANE_H + 26 }
  })
  const cols = Math.max(0, ...placed.map((p) => Math.round((p.x - LANE_LABEL_W - 20) / COL_W) - offsetCol)) + 1
  return { placed, laneIds, cols }
}

/** Plain-language walkthrough of an SOP, generated from its steps. */
export function narrative(steps: FlowStep[], who: (role: string) => string): string[] {
  const rank = ranks(steps)
  const byId = new Map(steps.map((step) => [step.id, step]))
  return [...steps].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!).map((step) => {
    const actor = who(step.role)
    const next = step.ke.map((edge) => {
      const target = byId.get(edge.id)
      if (!target) return edge.id
      const label = target.tipe === 'end' ? `selesai (${target.label})` : `${who(target.role)}: ${target.label}`
      return edge.syarat ? `jika "${edge.syarat}" → ${label}` : label
    })
    const money = step.uang ? ' [menyentuh uang]' : ''
    if (step.tipe === 'start') return `Mulai: ${step.label} (oleh ${actor}). Lalu ${next.join('; ')}.`
    if (step.tipe === 'end') return `Selesai: ${step.label} (${actor}).`
    if (step.tipe === 'gateway') return `${actor} memutuskan "${step.label}"${money}: ${next.join('; ')}.`
    return `${actor} — ${step.label}${money}. Berikutnya: ${next.join('; ') || '—'}.`
  })
}
