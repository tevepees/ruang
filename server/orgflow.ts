// Org Flow: read-only view of how RDK roles work together. Design comes from `workflow:` blocks in the
// Obsidian vault (roles, SOPs, registry, due diligence); reality comes from ~/.hermes/kanban.db and cron jobs.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import yaml from 'js-yaml'
import { hermesRoot } from './folders.js'

// ponytail: vault path defaults to this machine's checkout; set RUANG_VAULT elsewhere.
export const vaultRoot = (env: NodeJS.ProcessEnv = process.env) => env.RUANG_VAULT ?? '/root/Projects/second-brain-2/vault'
const ROLES_DIR = '04-ridha-memory/roles'
const SOP_DIR = '03-projects/ridha-dua-keluarga/sop'
const ORG_DIR = '03-projects/ridha-dua-keluarga/org-flow'
const DAY = 86_400

type Obj = Record<string, unknown>
export interface Edge { ke: string; apa?: string; kapan?: string; sop?: string }
export interface Role {
  id: string; nama: string; jabatan: string; tier: string; status: string; statusKind: string; meja: string; runtime: string
  alias: string[]; atasan?: string; pengawas?: string; uang: boolean; butuhTony: boolean; skills: string[]; sistem: string[]
  pemicu: { jenis: string; job?: string; label: string }[]; tugas: string[]; serah: Edge[]; eskalasi: Edge[]; sop: string[]
  file: string; sections: { judul: string; isi: string }[]
}
export interface Step { id: string; role: string; tipe: string; label: string; ke: { id: string; syarat?: string }[]; uang: boolean }
export interface Sop { id: string; judul: string; status: string; versi: string; owner: string; file: string; langkah: Step[] }

export function frontmatter(text: string): { data: Obj; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!match) return { data: {}, body: text }
  return { data: (yaml.load(match[1]) as Obj | null) ?? {}, body: text.slice(match[0].length) }
}

const str = (value: unknown, fallback = '') => typeof value === 'string' ? value : value == null ? fallback : String(value)
const list = <T = string>(value: unknown): T[] => Array.isArray(value) ? value as T[] : []
const statusKind = (status: string) => /^ACTIVE/i.test(status) ? (/BLOCKED/i.test(status) ? 'SEBAGIAN' : 'ACTIVE') : (/^(STANDBY|BLOCKED|DRAFT)/i.exec(status)?.[1].toUpperCase() ?? 'LAINNYA')

/** Splits a markdown body into `## ` sections (persona, scope, boundaries, data contract, eskalasi...). */
export function sections(body: string): { judul: string; isi: string }[] {
  return body.split(/\n(?=## )/).filter((part) => part.startsWith('## ')).map((part) => {
    const [head, ...rest] = part.split('\n')
    return { judul: head.replace(/^##\s+/, '').trim(), isi: rest.join('\n').trim() }
  })
}

function readMarkdown(dir: string, pattern: RegExp): { file: string; data: Obj; body: string }[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => pattern.test(name)).sort().map((name) => {
    const file = path.join(dir, name)
    return { file, ...frontmatter(readFileSync(file, 'utf8')) }
  })
}

export function loadDesign(root = vaultRoot()) {
  const roles: Role[] = readMarkdown(path.join(root, ROLES_DIR), /^role-.+\.md$/).map(({ file, data, body }) => {
    const w = (data.workflow ?? {}) as Obj
    const status = str(data.status, 'TANPA STATUS')
    return {
      id: str(data.role, path.basename(file, '.md').replace(/^role-/, '')), nama: str(data.name), jabatan: str(w.jabatan, str(data.role)),
      tier: str(data.tier), status, statusKind: statusKind(status), meja: str(w.meja, '?'), runtime: str(w.runtime, '?'),
      alias: list(w.alias), atasan: w.atasan ? str(w.atasan) : undefined, pengawas: w.pengawas ? str(w.pengawas) : undefined,
      uang: w.uang === true, butuhTony: w.butuh_tony === true, skills: list(w.skills), sistem: list(w.sistem),
      pemicu: list(w.pemicu), tugas: list(w.tugas), serah: list(w.serah), eskalasi: list(w.eskalasi), sop: list(w.sop),
      file: path.relative(root, file), sections: sections(body),
    }
  })
  const sops: Sop[] = readMarkdown(path.join(root, SOP_DIR), /^SOP-.+\.md$/).map(({ file, data }) => ({
    id: str(data.code).replace(/-RDK$/, '') || path.basename(file).slice(0, 6), judul: str(data.title), status: str(data.status), versi: str(data.version),
    owner: str(data.owner), file: path.relative(root, file),
    langkah: list<Obj>((data.workflow as Obj | undefined)?.langkah).map((s) => ({ id: str(s.id), role: str(s.role), tipe: str(s.tipe, 'task'), label: str(s.label), ke: list(s.ke), uang: s.uang === true })),
  }))
  const registryFile = path.join(root, ORG_DIR, 'org-flow.md')
  const registry = (existsSync(registryFile) ? frontmatter(readFileSync(registryFile, 'utf8')).data.orgflow : undefined) as Obj | undefined
  const ddFile = path.join(root, ORG_DIR, 'due-diligence.md')
  const dueDiligence = existsSync(ddFile) ? list<Obj>(frontmatter(readFileSync(ddFile, 'utf8')).data.temuan) : []
  return { roles, sops, meja: list<Obj>(registry?.meja), aktor: list<Obj>(registry?.aktor), kasus: list<Obj>(registry?.kasus), dueDiligence }
}

/** Maps a kanban task to a role: `[Nama]` title prefix first (role name or alias), then the rdk-role-* skill. */
export function roleOfTask(title: string, skills: string[], roles: Pick<Role, 'id' | 'nama' | 'alias' | 'skills'>[]): { role?: string; persona?: string } {
  const persona = /^\s*\[([^\]]+)\]/.exec(title)?.[1].trim()
  if (persona) {
    const hit = roles.find((role) => role.nama === persona || role.alias.includes(persona))
    if (hit) return { role: hit.id, persona }
  }
  for (const skill of skills) {
    const byPrefix = /^rdk-role-(.+)$/.exec(skill)?.[1]
    const hit = roles.find((role) => role.id === byPrefix) ?? roles.find((role) => role.skills[0] === skill)
    if (hit) return { role: hit.id, persona }
  }
  return { persona }
}

interface TaskRow { id: string; title: string; status: string; assignee: string | null; skills: string | null; created_at: number; started_at: number | null; completed_at: number | null; last_heartbeat_at: number | null; block_recurrences: number | null; last_failure_error: string | null }

function readKanban(file: string) {
  if (!existsSync(file)) return undefined
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const tasks = db.prepare('SELECT id, title, status, assignee, skills, created_at, started_at, completed_at, last_heartbeat_at, block_recurrences, last_failure_error FROM tasks').all() as unknown as TaskRow[]
    const events = db.prepare("SELECT task_id, kind, COUNT(*) AS n FROM task_events WHERE kind IN ('blocked','crashed','gave_up','timed_out','reclaimed','protocol_violation') GROUP BY task_id, kind").all() as unknown as { task_id: string; kind: string; n: number }[]
    const links = db.prepare('SELECT parent_id, child_id FROM task_links').all() as unknown as { parent_id: string; child_id: string }[]
    return { tasks, events, links }
  } finally { db.close() }
}

// Cron jobs mid-run right now: executions ledger rows still 'claimed'/'running' (read-only, best effort).
function runningJobs(root: string) {
  const dbs = [path.join(root, 'cron/executions.db'), ...(existsSync(path.join(root, 'profiles')) ? readdirSync(path.join(root, 'profiles')).map((p) => path.join(root, 'profiles', p, 'cron/executions.db')) : [])]
  const ids = new Map<string, string>()
  for (const file of dbs.filter(existsSync)) {
    try {
      const db = new DatabaseSync(file, { readOnly: true })
      try { for (const r of db.prepare("SELECT job_id, COALESCE(started_at, claimed_at) AS t FROM executions WHERE status IN ('claimed','running')").all() as unknown as { job_id: string; t: string }[]) ids.set(r.job_id, r.t) } finally { db.close() }
    } catch { /* ledger busy or absent: treat as not running */ }
  }
  return ids
}

function readCron(root: string) {
  const running = runningJobs(root)
  const files = [path.join(root, 'cron/jobs.json'), ...(existsSync(path.join(root, 'profiles')) ? readdirSync(path.join(root, 'profiles')).map((p) => path.join(root, 'profiles', p, 'cron/jobs.json')) : [])]
  return files.filter(existsSync).flatMap((file) => {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
    const profile = file.includes('/profiles/') ? file.split('/profiles/')[1].split('/')[0] : 'default'
    return list<Obj>(Array.isArray(raw) ? raw : (raw as Obj).jobs).map((job) => ({
      id: str(job.id), name: str(job.name), profile, berjalanSejak: running.get(str(job.id)), schedule: str(job.schedule_display ?? (job.schedule as Obj | undefined)?.display), enabled: job.enabled !== false,
      lastStatus: job.last_status ? str(job.last_status) : undefined, lastRun: job.last_run_at ? str(job.last_run_at) : undefined, nextRun: job.next_run_at ? str(job.next_run_at) : undefined,
      script: job.script ? str(job.script) : undefined,
    }))
  })
}

function installedSkills(root: string, profile: string): Set<string> {
  const base = profile === 'default' ? path.join(root, 'skills') : path.join(root, 'profiles', profile, 'skills')
  const found = new Set<string>()
  const walk = (dir: string, depth: number) => {
    if (depth > 3 || !existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (!entry.isDirectory() && !(entry.isSymbolicLink() && existsSync(path.join(full, '.')))) continue
      if (existsSync(path.join(full, 'SKILL.md'))) found.add(entry.name)
      else walk(full, depth + 1)
    }
  }
  walk(base, 0)
  return found
}

const profilesOf = (root: string) => ['default', ...(existsSync(path.join(root, 'profiles')) ? readdirSync(path.join(root, 'profiles'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [])]

/** Effectiveness weights autonomy (done without any block / crash) most, per Tony 2026-10-13. */
export function effectiveness(m: { selesai: number; total: number; otonom: number; gagal: number }): number | null {
  if (m.total === 0) return null
  const autonomy = m.selesai ? m.otonom / m.selesai : 0
  return Math.round(100 * (0.6 * autonomy + 0.25 * (1 - Math.min(1, m.gagal / m.total)) + 0.15 * (m.selesai / m.total)))
}

let skillCache: { at: number; sets: Map<string, Set<string>> } | undefined
export function buildOrgFlow(now = Date.now(), root = hermesRoot(), vault = vaultRoot()) {
  const design = loadDesign(vault)
  const { roles } = design
  const nowSec = Math.floor(now / 1000)
  const kanban = readKanban(path.join(root, 'kanban.db'))
  const cron = readCron(root)
  const profiles = profilesOf(root)
  // ponytail: skill folders change rarely; rescanning ~300 dirs per request costs ~0.5s, so cache 5 min.
  if (!skillCache || now - skillCache.at > 300_000) skillCache = { at: now, sets: new Map(profiles.map((p) => [p, installedSkills(root, p)])) }
  const skillSets = skillCache.sets

  const eventsByTask = new Map<string, Record<string, number>>()
  for (const e of kanban?.events ?? []) eventsByTask.set(e.task_id, { ...eventsByTask.get(e.task_id), [e.kind]: e.n })
  const taskRole = new Map<string, string>()
  const unmapped: { id: string; judul: string; status: string; persona?: string }[] = []
  const tasks = (kanban?.tasks ?? []).map((t) => {
    const skills = (() => { try { return list<string>(JSON.parse(t.skills ?? '[]')) } catch { return [] } })()
    const { role, persona } = roleOfTask(t.title, skills, roles)
    if (role) taskRole.set(t.id, role)
    else if (t.assignee === 'rdk-agent' || persona) unmapped.push({ id: t.id, judul: t.title, status: t.status, persona })
    return { ...t, role, persona, ev: eventsByTask.get(t.id) ?? {} }
  })

  const live = roles.map((role) => {
    const mine = tasks.filter((t) => t.role === role.id)
    const window = (days: number) => mine.filter((t) => t.created_at >= nowSec - days * DAY)
    const last30 = window(30)
    const done = last30.filter((t) => t.status === 'done')
    const troubled = (t: typeof mine[number]) => (t.ev.blocked ?? 0) + (t.ev.crashed ?? 0) + (t.ev.gave_up ?? 0) + (t.ev.timed_out ?? 0) > 0
    const durations = done.filter((t) => t.started_at && t.completed_at).map((t) => t.completed_at! - t.started_at!)
    const lastActivity = Math.max(0, ...mine.map((t) => t.completed_at ?? t.started_at ?? t.created_at))
    const harian = role.pemicu.some((p) => p.jenis === 'cron')
    const idleDays = harian ? 7 : 30
    const metrics = {
      total: last30.length, selesai: done.length, selesai7: window(7).filter((t) => t.status === 'done').length,
      otonom: done.filter((t) => !troubled(t)).length, gagal: last30.filter(troubled).length,
      blockedSekarang: mine.filter((t) => t.status === 'blocked').length,
    }
    const aktif = mine.filter((t) => ['running', 'blocked', 'ready', 'todo'].includes(t.status)).map((t) => ({
      id: t.id, judul: t.title, status: t.status, umurJam: Math.round((nowSec - t.created_at) / 360) / 10,
      heartbeat: t.last_heartbeat_at ? new Date(t.last_heartbeat_at * 1000).toISOString() : undefined, alasan: t.last_failure_error ?? undefined,
    }))
    const runtimeSkills = skillSets.get(role.runtime)
    const celah = [
      ...(!/^ACTIVE/i.test(role.status) ? [`Status ${role.status}`] : []),
      ...(runtimeSkills ? role.skills.filter((s) => !runtimeSkills.has(s)).map((s) => `Skill ${s} tidak terpasang di profile ${role.runtime}`) : [`Profile runtime ${role.runtime} tidak ditemukan`]),
      ...(role.sop.length === 0 ? ['Belum tercakup SOP mana pun'] : []),
      ...(!role.sections.some((s) => /data contract|integration/i.test(s.judul)) ? ['Kontrak tanpa Data Contract'] : []),
      ...(!role.sections.some((s) => /eskalasi/i.test(s.judul)) && role.eskalasi.length === 0 ? ['Kontrak tanpa Eskalasi'] : []),
      ...(metrics.blockedSekarang > 0 ? [`${metrics.blockedSekarang} tiket sedang blocked`] : []),
      ...(mine.some((t) => (t.block_recurrences ?? 0) > 1) ? ['Blocker berulang pada tiket yang sama'] : []),
      ...(role.pemicu.filter((p) => p.jenis === 'cron' && p.job && !cron.some((c) => c.name === p.job)).map((p) => `Cron "${p.job}" tidak ditemukan`)),
    ]
    return {
      role: role.id, ...metrics, efektivitas: effectiveness(metrics), rataDurasiMenit: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60) : null,
      terakhirAktif: lastActivity ? new Date(lastActivity * 1000).toISOString() : null,
      nganggur: !lastActivity || nowSec - lastActivity > idleDays * DAY, batasNganggurHari: idleDays,
      sedangBekerja: aktif.some((t) => t.status === 'running') || role.pemicu.some((p) => cron.some((c) => c.name === p.job && c.berjalanSejak)), aktif, celah,
      cron: role.pemicu.filter((p) => p.job).map((p) => cron.find((c) => c.name === p.job)).filter(Boolean),
    }
  })
  const busiest = Math.max(1, ...live.map((l) => l.total))
  for (const l of live) Object.assign(l, { bebanRelatif: Math.round((100 * l.total) / busiest) })

  // Drift: handoffs seen in kanban (parent → child across roles) vs handoffs declared in role contracts.
  const declared = new Set(roles.flatMap((r) => [...r.serah, ...r.eskalasi].map((e) => `${r.id}>${e.ke}`)))
  const seen = new Map<string, number>()
  for (const link of kanban?.links ?? []) {
    const from = taskRole.get(link.parent_id), to = taskRole.get(link.child_id)
    if (from && to && from !== to) seen.set(`${from}>${to}`, (seen.get(`${from}>${to}`) ?? 0) + 1)
  }
  const roleIds = new Set(roles.map((r) => r.id))
  const drift = {
    tidakDiSop: [...seen].filter(([key]) => !declared.has(key)).map(([key, n]) => ({ dari: key.split('>')[0], ke: key.split('>')[1], jumlah: n })),
    belumPernahTerjadi: [...declared].filter((key) => !seen.has(key) && roleIds.has(key.split('>')[1])).map((key) => ({ dari: key.split('>')[0], ke: key.split('>')[1] })),
    personaTanpaKontrak: [...new Set(unmapped.map((u) => u.persona).filter((p): p is string => Boolean(p)))],
    aliasTanpaKontrak: roles.flatMap((r) => r.alias.map((a) => ({ alias: a, dipakaiOleh: r.id }))),
    sopRoleTakDikenal: design.sops.flatMap((s) => s.langkah.filter((l) => !roleIds.has(l.role) && !design.aktor.some((a) => a.id === l.role)).map((l) => ({ sop: s.id, langkah: l.id, role: l.role }))),
    totalTautanKanban: kanban ? kanban.links.length : 0,
  }
  const referencedJobs = new Set(roles.flatMap((r) => r.pemicu.map((p) => p.job)))
  return {
    ...design, live, drift, tiketTakTerpetakan: unmapped.filter((u) => u.status !== 'archived'),
    sistem: { profiles, cron, cronTanpaRole: cron.filter((c) => !referencedJobs.has(c.name)), kanbanTersedia: Boolean(kanban), vault },
    fetchedAt: new Date(now).toISOString(),
  }
}

let cache: { at: number; value: ReturnType<typeof buildOrgFlow> } | undefined
export function getOrgFlow(now = Date.now()) {
  if (!cache || now - cache.at > 10_000) cache = { at: now, value: buildOrgFlow(now) }
  return cache.value
}
