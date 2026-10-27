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

// Written to fit any area (office, store, toilet, walkway); Yes is always the good answer.
// Answers are keyed by position (sort_1 …), so add new questions at the end of a pillar.
export const PILLARS = [
  { key: 'sort', label: 'Sort', ms: 'Sisih', items: [
    'Are only necessary items kept in this area?',
    'Have broken or damaged items been removed or reported for repair?',
    'Is the area free of unused, outdated or excess items?',
    'Are personal belongings kept in their designated place?',
  ] },
  { key: 'set', label: 'Set in Order', ms: 'Susun', items: [
    'Does every item have a designated and labelled location?',
    'Are all items returned to their designated locations?',
    'Are walkways, doors and emergency exits kept clear?',
    'Can items be located quickly without searching?',
  ] },
  { key: 'shine', label: 'Shine', ms: 'Sapu', items: [
    'Is the floor clean, dry and free of debris?',
    'Are tables, shelves and other surfaces clean?',
    'Is the area free of rubbish, with bins emptied regularly?',
    'Are lights, fans, taps and other fittings in working condition?',
  ] },
  { key: 'std', label: 'Standardize', ms: 'Seragam', items: [
    'Are labels and signs clear, readable and up to date?',
    "Is the area's 5S standard (checklist or reference photo) displayed?",
    'Are cleaning supplies available and stocked (soap, tissue, cleaning tools)?',
    'Are cables and wires arranged neatly and safely?',
  ] },
  { key: 'sustain', label: 'Sustain', ms: 'Sentiasa Amal', items: [
    'Have issues from the previous audit been resolved?',
    'Does the area match its displayed 5S standard?',
    'Is the area PIC maintaining the area regularly?',
    'Do users of this area keep it clean and tidy after use?',
  ] },
]
export const ITEM_KEYS = PILLARS.flatMap(p => p.items.map((_, i) => `${p.key}_${i + 1}`))

// Malay translation of each question, shown under the English in the audit report
export const ITEMS_MS = {
  sort_1: 'Adakah hanya barang yang diperlukan disimpan di kawasan ini?',
  sort_2: 'Adakah barang yang rosak telah dibuang atau dilaporkan untuk dibaiki?',
  sort_3: 'Adakah kawasan ini bebas daripada barang yang tidak digunakan, lapuk atau berlebihan?',
  sort_4: 'Adakah barang peribadi disimpan di tempat yang ditetapkan?',
  set_1: 'Adakah setiap barang mempunyai tempat yang ditetapkan dan berlabel?',
  set_2: 'Adakah semua barang dikembalikan ke tempat asalnya?',
  set_3: 'Adakah laluan, pintu dan pintu kecemasan sentiasa bebas daripada halangan?',
  set_4: 'Bolehkah barang dijumpai dengan cepat tanpa perlu mencari?',
  shine_1: 'Adakah lantai bersih, kering dan bebas daripada sampah?',
  shine_2: 'Adakah meja, rak dan permukaan lain bersih?',
  shine_3: 'Adakah kawasan ini bebas sampah dan tong sampah dikosongkan secara berkala?',
  shine_4: 'Adakah lampu, kipas, paip dan kelengkapan lain berfungsi dengan baik?',
  std_1: 'Adakah label dan papan tanda jelas, mudah dibaca dan terkini?',
  std_2: 'Adakah standard 5S kawasan ini (senarai semak atau gambar rujukan) dipaparkan?',
  std_3: 'Adakah bekalan pembersihan tersedia dan mencukupi (sabun, tisu, alat pembersihan)?',
  std_4: 'Adakah kabel dan wayar disusun dengan kemas dan selamat?',
  sustain_1: 'Adakah isu daripada audit sebelum ini telah diselesaikan?',
  sustain_2: 'Adakah keadaan kawasan ini sepadan dengan standard 5S yang dipaparkan?',
  sustain_3: 'Adakah PIC kawasan menyelenggara kawasan ini secara berkala?',
  sustain_4: 'Adakah pengguna kawasan ini memastikan ia bersih dan kemas selepas digunakan?',
}

// The zone layout plan for the report: one image at a fixed path, replaced on each upload
const LAYOUT_PATH = 'layout/zone-layout'
export const layoutUrl = () => `${fivesUrl(LAYOUT_PATH)}?v=${Date.now()}`
export async function uploadLayout(original) {
  const file = original.type === 'application/pdf' ? await pdfToImage(original) : await shrinkPhoto(original, 2400)
  await supabase.storage.from(BUCKET).remove([LAYOUT_PATH])
  const { error } = await supabase.storage.from(BUCKET).upload(LAYOUT_PATH, file, { contentType: file.type, cacheControl: '60' })
  if (error) throw new Error(error.message)
}

// Page 1 of a PDF as a JPEG about 2400px wide (pdf.js is loaded only when needed)
async function pdfToImage(pdfFile) {
  const [pdfjs, { default: workerSrc }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await pdfFile.arrayBuffer()) }).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: Math.min(4, 2400 / page.getViewport({ scale: 1 }).width) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, canvas, viewport }).promise
  doc.destroy()
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9))
  if (!blob) throw new Error('Could not read that PDF.')
  return new File([blob], 'zone-layout.jpg', { type: 'image/jpeg' })
}

// Zone types and the questions that don't apply to them (pre-marked N-A on a new audit)
export const ZONE_TYPES = [
  { key: 'office', label: 'Office', na: ['std_3'] },
  { key: 'meeting', label: 'Meeting room', na: ['sort_4', 'std_3'] },
  { key: 'store', label: 'Store', na: ['std_3'] },
  { key: 'pantry', label: 'Pantry', na: [] },
  { key: 'toilet', label: 'Toilet', na: ['sort_4', 'set_1', 'set_2', 'set_4', 'std_4'] },
  { key: 'walkway', label: 'Walkway', na: ['sort_4', 'set_1', 'set_2', 'set_4', 'std_3'] },
  { key: 'other', label: 'Other', na: [] },
]
export const zoneType = key => ZONE_TYPES.find(t => t.key === key) || null

// Starting answers for a new audit: the type's N-A items, plus "previous audit
// issues resolved" when there is no previous audit
export function presetAnswers(type, isFirstAudit) {
  const keys = [...(zoneType(type)?.na || []), ...(isFirstAudit ? ['sustain_1'] : [])]
  return Object.fromEntries(keys.map(k => [k, 'na']))
}

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
