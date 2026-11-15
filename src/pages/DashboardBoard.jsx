import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { isOffDay } from '../utils/teamLeaves'
import { assignmentMemberId, assignmentsForDate, getSiteDates, isPic } from '../utils/siteDays'
import { buildJobIndex, isActiveSite, memberDayStatus } from '../utils/memberDay'
import { PinnedFeedCard } from '../components/FeedWidgets'
import './DashboardBoard.css'

// The dashboard — "board" style: navy frame, white cards, teal accents.
// First question it answers: which sites are on, where, and who is going.
// Chart colours: one series = blue; jobs-by-type uses the validated blue / orange / aqua set.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TYPES = [
  { key: 'site_scanning', label: 'Site scanning', color: 'var(--s1)' },
  { key: 'site_visit', label: 'Site visit', color: 'var(--s2)' },
  { key: 'meeting', label: 'Meeting', color: 'var(--s3)' },
]
const STATES = ['selangor', 'kuala lumpur', 'wilayah persekutuan kuala lumpur', 'putrajaya', 'wilayah persekutuan putrajaya', 'johor', 'penang', 'pulau pinang', 'perak', 'pahang', 'negeri sembilan', 'melaka', 'malacca', 'kedah', 'kelantan', 'terengganu', 'perlis', 'sabah', 'sarawak', 'labuan']
const ROAD = /^(jalan|jln|lorong|persiaran|lebuh|lebuhraya|lingkaran|no\.?\s|lot\s)/i

const pad = n => String(n).padStart(2, '0')
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d) }
const dowOf = s => new Date(`${s}T00:00:00`).getDay()
const fmt = (s, o = { day: 'numeric', month: 'short' }) => new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', o)
const shortName = m => m?.short_name || m?.full_name?.split(' ')[0] || '?'
const initials = m => (m?.full_name || '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

// "Menara X, Jalan Y, Brickfields, Kuala Lumpur, 50470, Malaysia" → "Kuala Lumpur"
// "…, Seksyen 7, Shah Alam, Selangor, 40000, Malaysia" → "Shah Alam"
function areaOf(site) {
  const parts = String(site.location || '').split(',').map(p => p.trim())
    .filter(p => p && !/^malaysia$/i.test(p) && !/^\d{4,6}$/.test(p))
  if (!parts.length) return 'Unknown'
  const last = parts[parts.length - 1]
  const territory = last.replace(/^Wilayah Persekutuans+/i, '')
  if (/^(kuala lumpur|putrajaya|labuan)$/i.test(territory)) return territory
  const lastIsState = STATES.includes(last.toLowerCase())
  if (lastIsState && parts.length > 1) {
    const city = parts[parts.length - 2]
    if (!ROAD.test(city) && !STATES.includes(city.toLowerCase())) return city
  }
  return last.replace(/^Wilayah Persekutuan\s+/i, '')
}

function weekMonday(today) {
  const dow = dowOf(today)
  return dow === 0 ? addDays(today, 1) : addDays(today, -(dow - 1))   // Sunday → coming week
}
function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// Width of an element, kept up to date — charts draw at the real card width so text stays readable
function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// Bar with a 4px rounded top, square on the baseline
const barPath = (x, y, w, h, r = 4) => h <= 0 ? '' : `M${x},${y + h}V${y + Math.min(r, h)}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + Math.min(r, h)}V${y + h}Z`

function Tip({ tip }) {
  if (!tip) return null
  return <div className="bd-tip" style={{ left: tip.x + 14, top: tip.y - 10 }}>{tip.body}</div>
}

function Avatar({ m }) {
  return <span className="bd-av" title={m?.full_name}>{m?.avatar_url ? <img src={m.avatar_url} alt="" loading="lazy" /> : initials(m)}</span>
}

export default function DashboardBoard({ sites, members, leaves, firstName, memberId, isZairul, onAssign, onUpdate }) {
  const navigate = useNavigate()
  const today = isoOf(new Date())
  const year = Number(today.slice(0, 4))
  const [period, setPeriod] = useState('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [mine, setMine] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [tip, setTip] = useState(null)
  const showTip = (e, body) => setTip({ x: e.clientX, y: e.clientY, body })
  const hideTip = () => setTip(null)

  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const live = useMemo(() => sites.filter(isActiveSite), [sites])
  const jobIndex = useMemo(() => buildJobIndex(sites), [sites])
  const datesOf = useMemo(() => new Map(live.map(s => [s.id, getSiteDates(s)])), [live])
  const statusOf = (id, date) => memberDayStatus(jobIndex, leaves, id, date)
  const sitesOn = date => live.filter(s => datesOf.get(s.id)?.includes(date))
  const crewOn = (site, date) => {
    const rows = assignmentsForDate(site.site_assignments || [], date)
    const pic = rows.filter(isPic).map(a => memberById[assignmentMemberId(a)]).filter(Boolean)
    const crew = rows.filter(a => !isPic(a)).map(a => memberById[assignmentMemberId(a)]).filter(m => m && !pic.includes(m))
    return { pic, all: [...pic, ...crew] }
  }
  const dayOf = (site, date) => {
    const dates = datesOf.get(site.id) || []
    return dates.length > 1 ? `Day ${dates.indexOf(date) + 1}/${dates.length}` : (site.site_session || 'Full day')
  }

  // ── things that need someone ──
  const actions = useMemo(() => {
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
  }, [sites, leaves, memberById, today, isZairul]) // eslint-disable-line react-hooks/exhaustive-deps
  const urgent = actions.filter(a => a.sev === 'red').length

  useEffect(() => {
    if (!showActions) return
    const onKey = e => { if (e.key === 'Escape') setShowActions(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showActions])

  // ── today card ──
  const todaySites = sitesOn(today)
  let heroDate = today, heroSites = todaySites
  if (!heroSites.length) {
    for (let i = 1; i <= 14; i++) { const d = addDays(today, i); const l = sitesOn(d); if (l.length) { heroDate = d; heroSites = l; break } }
  }
  const outToday = members.filter(m => statusOf(m.id, heroDate).kind === 'site').length
  const ringPct = members.length ? outToday / members.length : 0

  // ── reports ──
  const reportSites = live.filter(s => s.site_status === 'completed' && s.site_type === 'site_scanning')
  const reportsDone = reportSites.filter(s => ['submitted', 'approved'].includes(s.report_status)).length
  const openByPic = useMemo(() => {
    const map = new Map()
    for (const s of reportSites) {
      if (!['pending', 'in_progress'].includes(s.report_status)) continue
      const end = s.end_date || s.scheduled_date
      const pic = assignmentsForDate(s.site_assignments || [], end).filter(isPic).map(a => memberById[assignmentMemberId(a)]).find(Boolean)
      const key = pic?.id || 'none'
      map.set(key, { m: pic, n: (map.get(key)?.n || 0) + 1 })
    }
    return [...map.values()].sort((a, b) => b.n - a.n).slice(0, 4)
  }, [reportSites, memberById])

  // ── period buckets ──
  const monday = weekMonday(today)
  const periodInfo = useMemo(() => {
    if (period === 'week') {
      const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i))
      return { from: days[0], to: days[5], label: `${fmt(days[0])} – ${fmt(days[5])}`, buckets: days.map(d => ({ key: d, label: d === today ? 'Today' : fmt(d, { weekday: 'short' }), from: d, to: d, now: d === today, tip: fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }) })) }
    }
    if (period === 'month') {
      const mm = Number(today.slice(5, 7))
      const first = `${today.slice(0, 7)}-01`
      const last = addDays(mm === 12 ? `${year + 1}-01-01` : `${year}-${pad(mm + 1)}-01`, -1)
      const buckets = []
      let start = first
      while (start <= last) {
        const toSun = addDays(start, (7 - dowOf(start)) % 7)
        const end = toSun > last ? last : toSun
        buckets.push({ key: start, label: fmt(start), from: start, to: end, now: today >= start && today <= end, tip: `${fmt(start)} – ${fmt(end)}` })
        start = addDays(end, 1)
      }
      return { from: first, to: last, label: fmt(first, { month: 'long', year: 'numeric' }), buckets }
    }
    const buckets = MONTHS.map((m, i) => { const from = `${year}-${pad(i + 1)}-01`; const to = addDays(i === 11 ? `${year + 1}-01-01` : `${year}-${pad(i + 2)}-01`, -1); return { key: from, label: m, from, to, now: today >= from && today <= to, tip: `${m} ${year}` } })
    return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year), buckets }
  }, [period, today, monday, year])

  // Person-days on site in each bucket (from the job index: one entry per person per site day)
  const personDays = useMemo(() => {
    const counts = periodInfo.buckets.map(() => new Set())
    for (const key of jobIndex.keys()) {
      const date = key.slice(key.indexOf('|') + 1)
      if (date < periodInfo.from || date > periodInfo.to) continue
      const i = periodInfo.buckets.findIndex(b => date >= b.from && date <= b.to)
      if (i >= 0) counts[i].add(key)
    }
    return counts.map(s => s.size)
  }, [jobIndex, periodInfo])

  const periodSites = live.filter(s => (datesOf.get(s.id) || []).some(d => d >= periodInfo.from && d <= periodInfo.to))
  const areas = useMemo(() => {
    const map = new Map()
    periodSites.forEach(s => { const a = areaOf(s); map.set(a, (map.get(a) || 0) + 1) })
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1])
    if (sorted.length <= 6) return sorted
    return [...sorted.slice(0, 5), ['Other', sorted.slice(5).reduce((n, [, v]) => n + v, 0)]]
  }, [periodSites])
  const typeCounts = TYPES.map(t => ({ ...t, n: periodSites.filter(s => (s.site_type || 'site_scanning') === t.key).length }))
  const typeTotal = typeCounts.reduce((a, t) => a + t.n, 0)

  // ── per month / per year ──
  const byMonth = useMemo(() => {
    const cur = Array(12).fill(0), prev = Array(12).fill(0)
    live.forEach(s => {
      const d = String(s.scheduled_date || '')
      const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1
      if (y === year) cur[m]++
      else if (y === year - 1) prev[m]++
    })
    const thisMonth = Number(today.slice(5, 7)) - 1
    return { cur: cur.map((v, i) => i <= thisMonth ? v : null), prev }
  }, [live, year, today])
  const byYear = [year - 2, year - 1, year].map(y => [y, live.filter(s => String(s.scheduled_date || '').startsWith(String(y))).length])

  // ── schedule table (its own week, with ‹ ›) ──
  const tableMonday = addDays(monday, weekOffset * 7)
  const tableDays = Array.from({ length: 6 }, (_, i) => addDays(tableMonday, i))
  const tableRows = tableDays.map(d => {
    let list = sitesOn(d)
    if (mine && memberId) list = list.filter(s => crewOn(s, d).all.some(m => m.id === memberId))
    const sts = members.map(m => ({ m, st: statusOf(m.id, d) }))
    return {
      d, list,
      free: sts.filter(x => ['free', 'store'].includes(x.st.kind)).map(x => shortName(x.m)),
      leave: sts.filter(x => x.st.kind === 'leave').map(x => shortName(x.m)),
      holiday: sts.find(x => x.st.kind === 'holiday')?.st.label,
    }
  })
  const tableLabel = weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : `${fmt(tableDays[0])} – ${fmt(tableDays[5])}`

  // ── chart sizes ──
  const [barRef, barW] = useWidth()
  const [trendRef, trendW] = useWidth()
  const [yearRef, yearW] = useWidth()

  return (
    <div className="bd">
      <div className="bd-board">
        <header className="bd-top">
          <div className="bd-brand">
            <i>X</i>
            <div><b>{getGreeting()}, {firstName}</b><span>{fmt(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
          </div>
          <div className="bd-seg" role="tablist" aria-label="Period">
            {[['week', 'This week'], ['month', 'Month'], ['year', 'Year']].map(([k, t]) => (
              <button key={k} role="tab" aria-selected={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{t}</button>
            ))}
          </div>
          <button className="bd-need" onClick={() => setShowActions(true)}>
            <b className={urgent ? 'red' : ''}>{actions.length}</b>{actions.length === 1 ? 'thing needs you' : 'things need you'}
          </button>
        </header>

        <div className="bd-pinned"><PinnedFeedCard /></div>

        <div className="bd-grid">
          {/* ── today ── */}
          <section className="bd-card bd-today">
            <div className="hero">
              <div className="eyebrow">{heroDate === today ? `Today · ${fmt(today, { weekday: 'short', day: 'numeric', month: 'short' })}` : `Nothing today · next ${fmt(heroDate, { weekday: 'short', day: 'numeric', month: 'short' })}`}</div>
              <div className="big">
                <div className="ttl"><b>{heroSites.length}</b><span>{heroSites.length === 1 ? 'site' : 'sites'} {heroDate === today ? 'running' : 'booked'}</span></div>
                <div className="ring" title={`${outToday} of ${members.length} people on site ${heroDate === today ? 'today' : fmt(heroDate, { weekday: 'short', day: 'numeric', month: 'short' })}`}>
                  <svg viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="6" />
                    <circle cx="32" cy="32" r="27" fill="none" stroke="var(--teal)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 27 * ringPct} 170`} transform="rotate(-90 32 32)" />
                  </svg>
                  <b>{outToday}/{members.length}</b><small>people out</small>
                </div>
              </div>
              <div className="sites">
                {heroSites.length === 0 && <p className="none">No site work booked in the next 2 weeks.</p>}
                {heroSites.slice(0, 4).map(site => {
                  const c = crewOn(site, heroDate)
                  return (
                    <Link key={site.id} to={`/sites/${site.id}`} className="site">
                      <span className="dot" />
                      <div><b>{site.site_name}</b><small>{areaOf(site)} · {c.all.length ? c.all.map(shortName).join(', ') : <span className="warn">No crew</span>}</small></div>
                      <em>{dayOf(site, heroDate)}</em>
                    </Link>
                  )
                })}
                {heroSites.length > 4 && <Link to="/calendar" className="more">+{heroSites.length - 4} more</Link>}
              </div>
            </div>
            <div className="lower">
              <div className="goal"><b>Reports {reportsDone} / {reportSites.length}</b><span>{reportSites.length ? Math.round(reportsDone / reportSites.length * 100) : 100}% in</span></div>
              <div className="bar"><i style={{ width: `${reportSites.length ? reportsDone / reportSites.length * 100 : 100}%` }} /></div>
              <div className="owners">
                {openByPic.length === 0 && <p className="muted">All reports are in.</p>}
                {openByPic.map(({ m, n }) => (
                  <Link key={m?.id || 'none'} to="/reports" className="owner">
                    {m ? <Avatar m={m} /> : <span className="bd-av">?</span>}
                    <div><b>{m ? shortName(m) : 'No PIC'}</b><small>{plural(n, 'report')} open</small></div>
                    <span className="n">{n}</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* ── person-days chart ── */}
          <section className="bd-card bd-week">
            <h3>People on site <small>{period === 'week' ? 'per day' : period === 'month' ? 'per week (person-days)' : 'per month (person-days)'} · {periodInfo.label}</small></h3>
            <div ref={barRef} className="bd-chart">
              {barW > 0 && (() => {
                const W = barW, H = 190, L = 28, B = 24, T = 20
                const max = Math.max(4, ...personDays)
                const nice = Math.ceil(max / 4) * 4
                const y = v => T + (H - T - B) * (1 - v / nice)
                const n = personDays.length, step = (W - L) / n, bw = Math.min(46, step * .56)
                const maxI = personDays.indexOf(Math.max(...personDays))
                const narrow = step < 30
                return (
                  <svg width={W} height={H} role="img" aria-label="People on site">
                    {[0, .25, .5, .75, 1].map(f => <g key={f}><line x1={L} x2={W} y1={y(nice * f)} y2={y(nice * f)} className="grid" /><text x={L - 8} y={y(nice * f) + 3} textAnchor="end" className="ax">{Math.round(nice * f)}</text></g>)}
                    {periodInfo.buckets.map((b, i) => {
                      const v = personDays[i], x = L + step * i + (step - bw) / 2
                      return (
                        <g key={b.key}>
                          <path d={barPath(x, y(v), bw, y(0) - y(v))} fill={b.now ? 'var(--s1)' : 'var(--rest)'} />
                          {(!narrow || i % 2 === 0 || b.now) && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className={`ax${b.now ? ' now' : ''}`}>{b.label}</text>}
                          {(b.now || i === maxI) && v > 0 && <text x={x + bw / 2} y={y(v) - 6} textAnchor="middle" className="lab">{v}</text>}
                          <rect x={L + step * i} y={T} width={step} height={H - T - B} className="hit"
                            onMouseMove={e => showTip(e, <><b>{b.tip}</b><br />{period === 'week' ? `${v} ${v === 1 ? 'person' : 'people'} on site` : `${v} person-days on site`}</>)} onMouseLeave={hideTip} />
                        </g>
                      )
                    })}
                  </svg>
                )
              })()}
            </div>
          </section>

          {/* ── where ── */}
          <section className="bd-card bd-where">
            <h3>Where we work <small>{periodInfo.label}</small></h3>
            <div className="rank">
              {areas.length === 0 && <p className="muted">No sites in this period.</p>}
              {areas.map(([a, n]) => (
                <div key={a} className="r" title={`${a}: ${plural(n, 'site')}`}>
                  <span>{a}</span>
                  <div className="track"><i style={{ width: `${n / Math.max(...areas.map(x => x[1])) * 100}%` }} /></div>
                  <b>{n}</b>
                </div>
              ))}
            </div>
          </section>

          {/* ── schedule ── */}
          <section className="bd-card bd-sched">
            <h3>
              <span>On site · <b>{tableLabel}</b></span>
              <span className="tools">
                {memberId && <span className="pills"><button className={`pill${!mine ? ' on' : ''}`} onClick={() => setMine(false)}>All</button><button className={`pill${mine ? ' on' : ''}`} onClick={() => setMine(true)}>Mine</button></span>}
                <span className="pills">
                  <button className="pill" onClick={() => setWeekOffset(w => w - 1)} aria-label="Previous week"><ChevronLeft size={14} /></button>
                  {weekOffset !== 0 && <button className="pill" onClick={() => setWeekOffset(0)}>Today</button>}
                  <button className="pill" onClick={() => setWeekOffset(w => w + 1)} aria-label="Next week"><ChevronRight size={14} /></button>
                </span>
              </span>
            </h3>
            <table className="bd-tbl">
              <thead><tr><th>Day</th><th>Site</th><th>Crew</th><th /></tr></thead>
              <tbody>
                {tableRows.map(({ d, list, free, leave, holiday }) => {
                  const isToday = d === today
                  const dayCell = (rows) => (
                    <td className="d" rowSpan={rows}>
                      <b>{isToday ? 'Today' : fmt(d, { weekday: 'short' })}</b>{fmt(d)}
                      {holiday && <small className="hol">{holiday}</small>}
                      <small title={`Free: ${free.join(', ') || '—'}${leave.length ? `\nOn leave: ${leave.join(', ')}` : ''}`}>{free.length} free{leave.length ? ` · ${leave.length} leave` : ''}</small>
                    </td>
                  )
                  if (!list.length) return (
                    <tr key={d} className={`${isToday ? 'is-today ' : ''}${d < today ? 'past' : ''}`}>{dayCell(1)}<td colSpan={3} className="nothing">Nothing booked</td></tr>
                  )
                  return list.map((site, i) => {
                    const c = crewOn(site, d)
                    const crewText = c.all.length
                      ? c.all.map((m, k) => <span key={m.id}>{k ? ', ' : ''}{k < c.pic.length ? <b>{shortName(m)}</b> : shortName(m)}</span>)
                      : d >= today ? <span className="warn">No crew</span> : <span className="muted">—</span>
                    return (
                      <tr key={`${d}-${site.id}`} className={`row${isToday ? ' is-today' : ''}${d < today ? ' past' : ''}`} onClick={() => navigate(`/sites/${site.id}`)}>
                        {i === 0 && dayCell(list.length)}
                        <td className="nm"><b>{site.site_name}</b><small>{areaOf(site)} · {dayOf(site, d)}</small><span className="mcrew">{crewText}</span></td>
                        <td className="crew">{crewText}</td>
                        <td className="tg"><span className="tag">{dayOf(site, d)}</span></td>
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
            <p className="note">Bold = PIC · Click a site to open it · Hover “free” to see names</p>
          </section>

          {/* ── jobs by type ── */}
          <section className="bd-card bd-type">
            <h3>Jobs by type <small>{periodInfo.label}</small></h3>
            <div className="donut">
              <svg viewBox="0 0 190 190" role="img" aria-label="Jobs by type">
                {typeTotal === 0
                  ? <circle cx="95" cy="95" r="76" fill="none" stroke="var(--grid)" strokeWidth="22" />
                  : (() => {
                      const C = 2 * Math.PI * 76
                      let off = 0
                      return typeCounts.filter(t => t.n).map(t => {
                        const len = t.n / typeTotal * C
                        const seg = (
                          <circle key={t.key} cx="95" cy="95" r="76" fill="none" stroke={t.color} strokeWidth="22"
                            strokeDasharray={`${Math.max(0, len - (typeCounts.filter(x => x.n).length > 1 ? 2 : 0))} ${C}`} strokeDashoffset={-off} transform="rotate(-90 95 95)"
                            onMouseMove={e => showTip(e, <><b>{t.label}</b><br />{plural(t.n, 'job')} · {Math.round(t.n / typeTotal * 100)}%</>)} onMouseLeave={hideTip} style={{ cursor: 'pointer' }} />
                        )
                        off += len
                        return seg
                      })
                    })()}
              </svg>
              <div className="mid"><b>{typeTotal}</b><small>{typeTotal === 1 ? 'job' : 'jobs'}</small></div>
            </div>
            <table className="bd-ltable">
              <tbody>
                {typeCounts.map(t => (
                  <tr key={t.key}><td><span className="sw" style={{ background: t.color }} />{t.label}</td><td><b>{t.n}</b></td><td>{typeTotal ? Math.round(t.n / typeTotal * 100) : 0}%</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ── per month ── */}
          <section className="bd-card bd-trend">
            <h3>Sites per month <span className="legend"><span><i style={{ background: 'var(--s1)' }} />{year}</span><span><i style={{ background: 'var(--prev)' }} />{year - 1}</span></span></h3>
            <div ref={trendRef} className="bd-chart">
              {trendW > 0 && <TrendChart W={trendW} cur={byMonth.cur} prev={byMonth.prev} year={year} showTip={showTip} hideTip={hideTip} />}
            </div>
          </section>

          {/* ── per year ── */}
          <section className="bd-card bd-year">
            <h3>Sites per year <small>all types</small></h3>
            <div ref={yearRef} className="bd-chart">
              {yearW > 0 && (() => {
                const W = yearW, H = 170, B = 24, T = 22
                const max = Math.max(10, ...byYear.map(x => x[1])) * 1.1
                const y = v => T + (H - T - B) * (1 - v / max)
                const step = W / 3, bw = Math.min(44, step * .5)
                return (
                  <svg width={W} height={H} role="img" aria-label="Sites per year">
                    <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.25)" />
                    {byYear.map(([yr, v], i) => {
                      const x = step * i + (step - bw) / 2, cur = i === 2
                      return (
                        <g key={yr}>
                          <path d={barPath(x, y(v), bw, y(0) - y(v))} fill={cur ? 'var(--teal)' : 'rgba(255,255,255,.35)'} />
                          <text x={x + bw / 2} y={y(v) - 7} textAnchor="middle" className="lab">{v}</text>
                          <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="ax">{cur ? `${yr} (so far)` : yr}</text>
                          <rect x={step * i} y={T} width={step} height={H - T - B} className="hit" onMouseMove={e => showTip(e, <><b>{yr}</b><br />{plural(v, 'site')}</>)} onMouseLeave={hideTip} />
                        </g>
                      )
                    })}
                  </svg>
                )
              })()}
            </div>
          </section>
        </div>
      </div>

      <Tip tip={tip} />

      {showActions && (
        <div className="bd-modal" onClick={() => setShowActions(false)}>
          <div className="bd-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Things that need you">
            <div className="bd-sheet-h">
              <h3>{actions.length === 1 ? '1 thing needs you' : `${actions.length} things need you`}</h3>
              <button className="bd-x" onClick={() => setShowActions(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="bd-acts">
              {actions.length === 0 && <p className="muted">All clear. Nothing needs you right now.</p>}
              {actions.map(a => {
                const body = <><span className={`dot ${a.sev}`} /><div className="grow"><b>{a.title}</b><small>{a.sub}</small></div><span className="go">{a.go}</span></>
                return a.link
                  ? <Link key={a.key} to={a.link} className="li" onClick={() => setShowActions(false)}>{body}</Link>
                  : <button key={a.key} className="li" onClick={() => { setShowActions(false); a.run?.() }}>{body}</button>
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TrendChart({ W, cur, prev, year, showTip, hideTip }) {
  const [hover, setHover] = useState(null)
  const H = 200, L = 30, R = 34, T = 14, B = 24
  const max = Math.max(10, ...prev, ...cur.filter(v => v != null))
  const nice = Math.ceil(max / 10) * 10
  const x = i => L + (W - L - R) * i / 11, y = v => T + (H - T - B) * (1 - v / nice)
  const ptsCur = cur.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean)
  const line = p => p.map((q, i) => (i ? 'L' : 'M') + q[0] + ',' + q[1]).join('')
  const end = ptsCur.at(-1)
  const narrow = W < 480
  const onMove = e => {
    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    const i = Math.max(0, Math.min(11, Math.round((e.clientX - box.left - L) / (W - L - R) * 11)))
    setHover(i)
    showTip(e, <><b>{MONTHS[i]}</b><br />{year}: {cur[i] ?? '—'}<br />{year - 1}: {prev[i]}</>)
  }
  return (
    <svg width={W} height={H} role="img" aria-label={`Sites per month, ${year} vs ${year - 1}`}>
      <defs><linearGradient id="bd-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a78d6" stopOpacity=".22" /><stop offset="1" stopColor="#2a78d6" stopOpacity="0" /></linearGradient></defs>
      {[0, .5, 1].map(f => <g key={f}><line x1={L} x2={W - R} y1={y(nice * f)} y2={y(nice * f)} className="grid" /><text x={L - 8} y={y(nice * f) + 3} textAnchor="end" className="ax">{nice * f}</text></g>)}
      {MONTHS.map((m, i) => (!narrow || i % 2 === 0) && <text key={m} x={x(i)} y={H - 6} textAnchor="middle" className="ax">{m}</text>)}
      {ptsCur.length > 1 && <path d={line(ptsCur) + `L${end[0]},${y(0)}L${ptsCur[0][0]},${y(0)}Z`} fill="url(#bd-area)" />}
      <path d={line(prev.map((v, i) => [x(i), y(v)]))} fill="none" stroke="var(--prev)" strokeWidth="2" />
      {ptsCur.length > 0 && <path d={line(ptsCur)} fill="none" stroke="var(--s1)" strokeWidth="2" />}
      {end && <><circle cx={end[0]} cy={end[1]} r="4.5" fill="var(--s1)" stroke="#fff" strokeWidth="2" /><text x={end[0] + 8} y={end[1] - 8} className="lab">{cur[ptsCur.length - 1]}</text></>}
      {hover != null && <>
        <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--prev)" />
        <circle cx={x(hover)} cy={y(prev[hover])} r="4" fill="var(--prev)" stroke="#fff" strokeWidth="2" />
        {cur[hover] != null && <circle cx={x(hover)} cy={y(cur[hover])} r="4" fill="var(--s1)" stroke="#fff" strokeWidth="2" />}
      </>}
      <rect x={L} y={T} width={W - L - R} height={H - T - B} className="hit" onMouseMove={onMove} onMouseLeave={() => { setHover(null); hideTip() }} />
    </svg>
  )
}
