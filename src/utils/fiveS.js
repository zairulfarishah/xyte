import { supabase } from '../supabase'
import { shrinkPhoto } from './makan'

// Tables from sql/setup-5s.sql; zone photos go in the public five-s bucket
const BUCKET = 'five-s'

const check = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

export const fetchZones = async () =>
  check(await supabase.from('fives_zones').select('*').order('sort_order').order('created_at')) || []

export const addZone = async zone => check(await supabase.from('fives_zones').insert(zone))
export const updateZone = async (id, patch) => check(await supabase.from('fives_zones').update(patch).eq('id', id))
// Its audits go with it (on delete cascade); their photos are removed from storage first
export async function deleteZone(id) {
  const audits = check(await supabase.from('fives_audits').select('photos').eq('zone_id', id)) || []
  await removePhotos(audits.flatMap(a => (a.photos || []).map(p => p.path)))
  check(await supabase.from('fives_zones').delete().eq('id', id))
}

// Audits on or after `since` (YYYY-MM-DD), newest first
export const fetchAudits = async since =>
  check(await supabase.from('fives_audits').select('*').gte('audit_date', since).order('audit_date', { ascending: false })) || []

// One audit per zone per date: saving the same zone and date again updates it
export const saveAudit = async audit =>
  check(await supabase.from('fives_audits').upsert(audit, { onConflict: 'zone_id,audit_date' }).select().single())

export async function deleteAudit(audit) {
  check(await supabase.from('fives_audits').delete().eq('id', audit.id))
  await removePhotos((audit.photos || []).map(p => p.path))
}

export async function removePhotos(paths) {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

// Same 15 checks as the "Checklist Guide" tab of 5S_Checklist_Audit.xlsx
export const PILLARS = [
  { key: 'sort', label: 'Sort', items: [
    'No broken, damaged or non-working equipment left in the zone',
    'No unused, obsolete or duplicate items sitting in the area',
    'Personal items (bags, food, chargers) not mixed into the work area',
  ] },
  { key: 'set', label: 'Set in Order', items: [
    'Every item has a labeled, fixed storage location (shelf / rack / shadow board)',
    'Items are actually placed in their labeled / assigned spot',
    'Walkways and access paths are clear, nothing blocking',
  ] },
  { key: 'shine', label: 'Shine', items: [
    'Floor and surfaces are clean, no dust / oil / debris',
    'Equipment itself is clean, no dirt or grease buildup',
    'No trash, wrappers or general clutter left in the area',
  ] },
  { key: 'std', label: 'Standardize', items: [
    'Labels / signage are visible, legible and match the layout',
    'Zone checklist or visual standard is posted and being followed',
    'Equipment checkout/return log (for gear taken to job sites) is being used',
  ] },
  { key: 'sustain', label: 'Sustain', items: [
    'This audit was done on the scheduled day and time',
    "Last week's issues were actually fixed, not repeated",
    'Zone PIC is aware of and engaged with the 5S process for this area',
  ] },
]
export const ITEM_KEYS = PILLARS.flatMap(p => p.items.map((_, i) => `${p.key}_${i + 1}`))

// Yes ÷ (Yes + No) as 0–100; null when nothing was marked Yes or No
export function passPct(answers = {}) {
  const vals = ITEM_KEYS.map(k => answers[k])
  const yes = vals.filter(v => v === 'yes').length
  const no = vals.filter(v => v === 'no').length
  return yes + no ? Math.round((yes / (yes + no)) * 1000) / 10 : null
}

// Excel rules: under 60% is red, under 80% amber; red two audits running means escalate
export const RED = 60
export const GREEN = 80
export function tone(pct) {
  if (pct == null) return 'none'
  return pct < RED ? 'red' : pct < GREEN ? 'amber' : 'green'
}

// audits for one zone, newest first → { latest, prev, level, label }
export function zoneStatus(audits = []) {
  const scored = audits.filter(a => a.pass_pct != null)
  const [latest, prev] = scored
  if (!latest) return { latest: null, prev: null, level: 'none', label: 'No audit data yet' }
  const pct = Number(latest.pass_pct)
  if (pct >= RED) return { latest, prev, level: pct < GREEN ? 'amber' : 'green', label: pct < GREEN ? 'Amber — monitor' : 'Green — OK' }
  if (prev && Number(prev.pass_pct) < RED) return { latest, prev, level: 'escalate', label: 'Escalate — red 2+ audits running, talk to PIC now' }
  return { latest, prev, level: 'watch', label: 'Watch — red this audit' }
}

export const fmtPct = pct => pct == null ? '—' : `${Math.round(Number(pct))}%`

export function fivesUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : ''
}

export async function uploadZonePhoto(original, zoneId) {
  const file = await shrinkPhoto(original)
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${zoneId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw new Error(error.message)
  return { path, name: original.name }
}

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtDate(date, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!date) return '—'
  return new Date(`${String(date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY', opts)
}

// Last n months as "YYYY-MM", oldest first
export function lastMonths(n = 6) {
  const d = new Date()
  return Array.from({ length: n }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1)
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
  })
}

export function monthName(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-MY', { month: 'short', year: '2-digit' })
}

export const average = nums => nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null
