// "Things that need you" on the dashboard: sites without crew or PIC, leave clashes,
// sites to close, reports to finish or approve, postponed sites to reschedule.
import { isOffDay } from './teamLeaves'
import { assignmentMemberId, assignmentsForDate, getSiteDates, isPic } from './siteDays'
import { isActiveSite } from './memberDay'

const pad = n => String(n).padStart(2, '0')
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d) }
const dowOf = s => new Date(`${s}T00:00:00`).getDay()
const fmt = (s, o = { day: 'numeric', month: 'short' }) => new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', o)
const shortName = m => m?.short_name || m?.full_name?.split(' ')[0] || '?'
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

export function buildActions({ sites, leaves, memberById, today, isZairul, onAssign, onUpdate }) {
  const out = []
  const horizon = addDays(today, 14)
  const rel = d => d === today ? 'today' : d === addDays(today, 1) ? 'tomorrow' : fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })
  const picOf = (site, date) => assignmentsForDate(site.site_assignments || [], date).filter(isPic).map(a => memberById[assignmentMemberId(a)]).find(Boolean)
  for (const site of sites) {
    if (!isActiveSite(site) || site.site_status === 'completed') continue
    const coming = getSiteDates(site).filter(d => d >= today && d <= horizon && dowOf(d) !== 0)
    const empty = coming.filter(d => assignmentsForDate(site.site_assignments || [], d).length === 0)
    if (empty.length) out.push({
      key: `crew-${site.id}`, sev: empty[0] <= addDays(today, 1) ? 'red' : 'amber', when: empty[0],
      title: `Assign crew — ${site.site_name}`,
      sub: empty.length === 1 ? `Nobody assigned ${rel(empty[0])}` : `${empty.length} days with nobody: ${empty.map(d => d === today ? 'today' : Number(d.slice(8))).join(', ')}`,
      go: 'Assign', run: () => onAssign(site),
    })
    const noPic = coming.filter(d => { const rows = assignmentsForDate(site.site_assignments || [], d); return rows.length && !rows.some(isPic) })
    if (noPic.length) out.push({ key: `pic-${site.id}`, sev: 'amber', when: noPic[0], title: `Set a PIC — ${site.site_name}`, sub: `${plural(noPic.length, 'day')} with crew but no PIC`, go: 'Set PIC', run: () => onAssign(site) })
    const clash = coming.flatMap(d => assignmentsForDate(site.site_assignments || [], d)
      .map(a => ({ d, m: memberById[assignmentMemberId(a)] }))
      .filter(({ d: day, m }) => m && leaves.some(l => l.member_id === m.id && !isOffDay(l) && day >= l.start_date && day <= (l.end_date || l.start_date))))
    if (clash.length) out.push({ key: `clash-${site.id}`, sev: 'red', when: clash[0].d, title: `Leave clash — ${site.site_name}`, sub: `${[...new Set(clash.map(c => shortName(c.m)))].join(', ')} on leave ${rel(clash[0].d)}`, go: 'Reassign', run: () => onAssign(site) })
    const end = site.end_date || site.scheduled_date
    if (end && end < today && ['upcoming', 'ongoing'].includes(site.site_status)) out.push({ key: `close-${site.id}`, sev: 'amber', when: end, title: `Close site — ${site.site_name}`, sub: `Ended ${fmt(end)} but still marked ${site.site_status}`, go: 'Update', run: () => onUpdate(site) })
  }
  for (const site of sites) {
    const rep = site.report_status
    if (site.site_status === 'completed' && site.site_type === 'site_scanning' && ['pending', 'in_progress'].includes(rep)) {
      const end = site.end_date || site.scheduled_date
      const pic = end ? picOf(site, end) : null
      out.push({ key: `rep-${site.id}`, sev: 'amber', when: end || '', title: `Finish report — ${site.site_name}`, sub: `${rep === 'pending' ? 'Not started' : 'In progress'} · site done ${end ? fmt(end) : '—'}${pic ? ` · PIC ${shortName(pic)}` : ''}`, go: 'Update', run: () => onUpdate(site) })
    }
    if (rep === 'submitted') out.push({ key: `appr-${site.id}`, sev: 'amber', when: site.end_date || site.scheduled_date || '', title: `${isZairul ? 'Approve' : 'Awaiting approval'} — ${site.site_name}`, sub: 'Report submitted', go: isZairul ? 'Review' : 'View', run: () => onUpdate(site) })
    if (site.site_status === 'postponed' && site.scheduled_date >= addDays(today, -30)) out.push({ key: `post-${site.id}`, sev: 'grey', when: site.scheduled_date, title: `Reschedule — ${site.site_name}`, sub: `Postponed from ${fmt(site.scheduled_date)}`, go: 'Open', link: `/sites/${site.id}` })
  }
  const order = { red: 0, amber: 1, grey: 2 }
  return out.sort((a, b) => order[a.sev] - order[b.sev] || String(a.when).localeCompare(String(b.when)))
}
