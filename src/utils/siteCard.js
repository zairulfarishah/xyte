// Small helpers shared by the Sites and Reports card grids.

export const DAY_MS = 86400000
// Days after the report's own time before a pending report counts as overdue
export const REPORT_GRACE_DAYS = 3

export const TYPE_LABEL = {
  site_scanning: 'Site Scanning',
  site_visit:    'Site Visit',
  meeting:       'Meeting',
}

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function dayDiff(from, to) {
  return Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY_MS)
}
export function siteStart(site) { return String(site.scheduled_date || '').slice(0, 10) }
export function siteEnd(site)   { return String(site.end_date || site.scheduled_date || '').slice(0, 10) }

// "6 Oct 2026", "6–8 Oct 2026", "28 Sep – 2 Oct 2026"
export function formatRange(start, end) {
  if (!start) return '—'
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end || start}T00:00:00`)
  const full = d => d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
  if (!end || end === start) return full(a)
  if (a.getFullYear() !== b.getFullYear()) return `${full(a)} – ${full(b)}`
  if (a.getMonth() !== b.getMonth()) return `${a.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} – ${full(b)}`
  return `${a.getDate()}–${full(b)}`
}

// First two parts of the address — full one is on hover
export function shortLocation(location) {
  return String(location || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 2).join(', ')
}

// Report due date: site end + the report's own days + grace (scanning jobs only)
export function reportDueDate(site) {
  if (site.site_type !== 'site_scanning') return null
  const end = siteEnd(site)
  if (!end) return null
  const d = new Date(`${end}T00:00:00`)
  d.setDate(d.getDate() + Math.ceil(Number(site.report_duration_days) || 0) + REPORT_GRACE_DAYS)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function reportOverdueDays(site, today) {
  if (site.site_type !== 'site_scanning' || site.site_status !== 'completed') return 0
  if (!['pending', 'in_progress'].includes(site.report_status)) return 0
  const due = dayDiff(siteEnd(site), today) - Math.ceil(Number(site.report_duration_days) || 0) - REPORT_GRACE_DAYS
  return due > 0 ? due : 0
}
