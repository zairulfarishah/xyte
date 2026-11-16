import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MapPin, CalendarDays, Users, FileText, ArrowRight, ArrowUp, ArrowDown, Zap, ChartColumn, LayoutGrid,
  Check, Clock, Bell, MapPinPlus, Crosshair, BookOpen, X,
} from 'lucide-react'
import { supabase } from '../supabase'
import { assignmentMemberId, assignmentsForDate, getSiteDates, isPic } from '../utils/siteDays'
import { buildJobIndex, isActiveSite, memberDayStatus } from '../utils/memberDay'
import { buildActions } from '../utils/dashboardActions'
import { PinnedFeedCard } from '../components/FeedWidgets'
import { Skyline } from '../components/SceneArt'
import TasksStrip from '../components/TasksStrip'
import './DashboardHome.css'

// The dashboard: greeting banner, four stat cards, this week's sites on a satellite map,
// today's sites, recent activity, this month's progress, manpower this week, quick access.
// Classes are prefixed dh-.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const C = { blue: '#2a6fdb', green: '#16a34a', orange: '#f07c1e', violet: '#7c5cd6', navy: '#1b2f57', leave: '#c8d0dc', track: '#eef1f5' }
const STATES = ['selangor', 'kuala lumpur', 'wilayah persekutuan kuala lumpur', 'putrajaya', 'wilayah persekutuan putrajaya', 'johor', 'penang', 'pulau pinang', 'perak', 'pahang', 'negeri sembilan', 'melaka', 'malacca', 'kedah', 'kelantan', 'terengganu', 'perlis', 'sabah', 'sarawak', 'labuan']
const ROAD = /^(jalan|jln|lorong|persiaran|lebuh|lebuhraya|lingkaran|no\.?\s|lot\s)/i

const pad = n => String(n).padStart(2, '0')
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d) }
const dowOf = s => new Date(`${s}T00:00:00`).getDay()
const mondayOf = s => addDays(s, dowOf(s) === 0 ? -6 : 1 - dowOf(s))
const monthStart = (s, back = 0) => { const d = new Date(`${s.slice(0, 7)}-01T00:00:00`); d.setMonth(d.getMonth() - back); return isoOf(d) }
const monthEnd = first => { const d = new Date(`${first}T00:00:00`); d.setMonth(d.getMonth() + 1); d.setDate(0); return isoOf(d) }
const fmt = (s, o = { day: 'numeric', month: 'short' }) => new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', o)
const shortName = m => m?.short_name || m?.full_name?.split(' ')[0] || '?'
const initials = m => (m?.full_name || '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

function areaOf(site) {
  const parts = String(site.location || '').split(',').map(p => p.trim())
    .filter(p => p && !/^malaysia$/i.test(p) && !/^\d{4,6}$/.test(p))
  if (!parts.length) return 'No location'
  const last = parts[parts.length - 1]
  const territory = last.replace(/^Wilayah Persekutuan\s+/i, '')
  if (/^(kuala lumpur|putrajaya|labuan)$/i.test(territory)) return territory
  if (STATES.includes(last.toLowerCase()) && parts.length > 1) {
    const city = parts[parts.length - 2]
    if (!ROAD.test(city) && !STATES.includes(city.toLowerCase())) return city
  }
  return territory
}
function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
function when(ts) {
  const d = new Date(ts)
  const time = d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false })
  const day = isoOf(d), today = isoOf(new Date())
  if (day === today) return `Today, ${time}`
  if (day === addDays(today, -1)) return `Yesterday, ${time}`
  return `${fmt(day)}, ${time}`
}
// Pick an icon and colour for a notification from its wording
function notifLook(msg = '') {
  const m = msg.toLowerCase()
  if (/approved|completed|submitted/.test(m)) return { Icon: Check, bg: C.green }
  if (/report/.test(m)) return { Icon: FileText, bg: C.blue }
  if (/timecard|clock/.test(m)) return { Icon: Clock, bg: C.green }
  if (/pic|assign|crew|member|team|leave/.test(m)) return { Icon: Users, bg: C.violet }
  if (/status|moved|date|schedul|postpon|site/.test(m)) return { Icon: CalendarDays, bg: C.orange }
  return { Icon: Bell, bg: C.navy }
}

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

const barPath = (x, y, w, h, r = 4) => h <= 0 ? '' : `M${x},${y + h}V${y + Math.min(r, h)}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + Math.min(r, h)}V${y + h}Z`

function Avatar({ m }) {
  return <span className="dh-av" title={m?.full_name}>{m?.avatar_url ? <img src={m.avatar_url} alt="" loading="lazy" /> : initials(m)}</span>
}

// Small area chart in the stat cards; labels[i] goes in the tooltip
function Spark({ values, labels, color, id, showTip, hideTip }) {
  const W = 200, H = 54
  if (values.length < 2) return <span className="dh-spark" />
  const mx = Math.max(...values), mn = Math.min(...values)
  const pts = values.map((n, i) => [i * W / (values.length - 1), H - 4 - (n - mn) / (mx - mn || 1) * (H - 12)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.max(0, Math.min(values.length - 1, Math.round((e.clientX - r.left) / r.width * (values.length - 1))))
    showTip(e, <>{labels[i]}: <b>{values[i]}</b></>)
  }
  return (
    <svg className="dh-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={hideTip} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line}L${W} ${H}L0 ${H}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

function Delta({ n, label }) {
  if (n === 0) return <span className="dl">No change {label}</span>
  const up = n > 0
  return <span className="dl"><em className={up ? 'up' : 'down'}>{up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{up ? '+' : '−'}{Math.abs(n)}</em> {label}</span>
}

// Fit the map to the pins once they are known
function FitPins({ points }) {
  const map = useMap()
  const key = points.map(p => p.join(',')).join('|')
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1) map.setView(points[0], 12)
    else map.fitBounds(points, { padding: [36, 36], maxZoom: 13 })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- refit only when the pins change
  return null
}

const PIN_SVG = '<svg width="26" height="34" viewBox="0 0 26 34"><path d="M13 33s11-10.5 11-19.5A11 11 0 0 0 2 13.5C2 22.5 13 33 13 33z" fill="#f07c1e" stroke="#fff" stroke-width="2"/><circle cx="13" cy="13" r="4.5" fill="#fff"/></svg>'
const PIN = L.divIcon({ html: PIN_SVG, className: 'dh-pin', iconSize: [26, 34], iconAnchor: [13, 33], popupAnchor: [0, -30] })
const PIN_TODAY = L.divIcon({ html: '<span class="dh-pin-now"></span>', className: 'dh-pin', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] })

export default function DashboardHome({ sites, members, leaves, firstName, fullName, memberId, isZairul, onAssign, onUpdate, onAdd }) {
  const navigate = useNavigate()
  const today = isoOf(new Date())
  const [tip, setTip] = useState(null)
  const [showActions, setShowActions] = useState(false)
  const [notifs, setNotifs] = useState(null)
  const [dueTasks, setDueTasks] = useState([])
  const showTip = (e, body) => setTip({ x: e.clientX, y: e.clientY, body })
  const hideTip = () => setTip(null)

  useEffect(() => {
    let cancelled = false
    let q = supabase.from('notifications').select('id, message, actor, created_at').order('created_at', { ascending: false }).limit(6)
    if (memberId) q = q.or(`recipient_id.is.null,recipient_id.eq.${memberId}`)
    q.then(({ data }) => { if (!cancelled) setNotifs(data || []) })
    return () => { cancelled = true }
  }, [memberId])

  useEffect(() => {
    if (!showActions) return undefined
    const onKey = e => { if (e.key === 'Escape') setShowActions(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showActions])

  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const live = useMemo(() => sites.filter(isActiveSite), [sites])
  const jobIndex = useMemo(() => buildJobIndex(sites), [sites])
  const datesOf = useMemo(() => new Map(live.map(s => [s.id, getSiteDates(s)])), [live])
  const statusOf = (id, date) => memberDayStatus(jobIndex, leaves, id, date)
  const sitesOn = date => live.filter(s => datesOf.get(s.id)?.includes(date))
  const sitesBetween = (from, to) => live.filter(s => (datesOf.get(s.id) || []).some(d => d >= from && d <= to))
  const crewOn = (site, date) => {
    const rows = assignmentsForDate(site.site_assignments || [], date)
    const pic = rows.filter(isPic).map(a => memberById[assignmentMemberId(a)]).filter(Boolean)
    const crew = rows.filter(a => !isPic(a)).map(a => memberById[assignmentMemberId(a)]).filter(m => m && !pic.includes(m))
    return [...pic, ...crew]
  }
  const dayOf = (site, date) => {
    const dates = datesOf.get(site.id) || []
    return dates.length > 1 ? `Day ${dates.indexOf(date) + 1}/${dates.length}` : (site.site_session || 'Full day')
  }
  const countOut = date => members.filter(m => statusOf(m.id, date).kind === 'site').length
  const countLeave = date => members.filter(m => statusOf(m.id, date).kind === 'leave').length

  const actions = useMemo(
    () => [...dueTasks, ...buildActions({ sites, leaves, memberById, today, isZairul, onAssign, onUpdate })],
    [dueTasks, sites, leaves, memberById, today, isZairul], // eslint-disable-line react-hooks/exhaustive-deps -- callbacks are recreated each render
  )
  const urgent = actions.filter(a => a.sev === 'red').length

  // ── stat cards ──
  const monday = mondayOf(today)
  const weeks = Array.from({ length: 10 }, (_, i) => addDays(monday, (i - 9) * 7))
  const sitesPerWeek = weeks.map(w => sitesBetween(w, addDays(w, 6)).length)
  const months = Array.from({ length: 10 }, (_, i) => monthStart(today, 9 - i))
  const sitesPerMonth = months.map(m => sitesBetween(m, monthEnd(m)).length)
  const workDays = []
  for (let d = today; workDays.length < 10; d = addDays(d, -1)) if (dowOf(d) !== 0) workDays.unshift(d)
  const outPerDay = workDays.map(countOut)
  const outToday = countOut(today)
  const leaveToday = countLeave(today)
  const reportSites = live.filter(s => s.site_status === 'completed' && s.site_type === 'site_scanning')
  const notStarted = reportSites.filter(s => ['pending', 'in_progress'].includes(s.report_status)).length
  const awaiting = live.filter(s => s.report_status === 'submitted').length

  // ── today ──
  let heroDate = today, heroSites = sitesOn(today)
  if (!heroSites.length) {
    for (let i = 1; i <= 14; i++) { const d = addDays(today, i); const l = sitesOn(d); if (l.length) { heroDate = d; heroSites = l; break } }
  }
  const SESSION_ORDER = { morning: 0, 'full day': 1, afternoon: 2, night: 3 }
  const todayList = [...heroSites].sort((a, b) => (SESSION_ORDER[String(a.site_session || 'full day').toLowerCase()] ?? 1) - (SESSION_ORDER[String(b.site_session || 'full day').toLowerCase()] ?? 1))

  // ── map: this week's sites ──
  const weekSites = sitesBetween(monday, addDays(monday, 6))
  const pins = weekSites.filter(s => Number(s.latitude) && Number(s.longitude)).map(s => {
    const dates = (datesOf.get(s.id) || []).filter(d => d >= monday && d <= addDays(monday, 6))
    const isToday = dates.includes(today)
    const next = dates.find(d => d >= today) || dates[dates.length - 1]
    return { s, pos: [Number(s.latitude), Number(s.longitude)], isToday, next }
  })
  const unmapped = weekSites.length - pins.length

  // ── progress this month ──
  const mFirst = monthStart(today), mLast = monthEnd(mFirst)
  const monthSites = sitesBetween(mFirst, mLast)
  const prog = [
    { key: 'completed', label: 'Completed', color: C.green, n: monthSites.filter(s => s.site_status === 'completed').length },
    { key: 'ongoing', label: 'Ongoing', color: C.orange, n: monthSites.filter(s => s.site_status === 'ongoing').length },
    { key: 'upcoming', label: 'Upcoming', color: C.leave, n: monthSites.filter(s => !['completed', 'ongoing'].includes(s.site_status)).length },
  ]
  const progPct = monthSites.length ? Math.round(prog[0].n / monthSites.length * 100) : 0
  const trendMonths = months.slice(-7)
  const donePerMonth = trendMonths.map(m => live.filter(s => {
    if (s.site_status !== 'completed') return false
    const end = s.end_date || s.scheduled_date || ''
    return end >= m && end <= monthEnd(m)
  }).length)

  // ── manpower this week ──
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const manpower = weekDays.map(d => ({ d, on: countOut(d), leave: countLeave(d) }))

  const [trendRef, trendW] = useWidth()
  const [barRef, barW] = useWidth()

  // ── banner photo: today's site photos, rotating; the drawn skyline when there are none (store days) ──
  const [broken, setBroken] = useState(() => new Set())
  const [photoTick, setPhotoTick] = useState(0)
  const photoSites = heroDate === today ? todayList.filter(s => s.site_photo_url && !broken.has(s.site_photo_url)) : []
  const photoCount = photoSites.length
  useEffect(() => {
    if (photoCount < 2) return undefined
    const t = setInterval(() => setPhotoTick(i => i + 1), 7000)
    return () => clearInterval(t)
  }, [photoCount])
  const photoOn = photoCount ? photoTick % photoCount : 0
  const photoSite = photoSites[photoOn]

  const summary = heroDate === today
    ? `${plural(heroSites.length, 'site')} on today · ${outToday} crew out`
    : `No sites today · next on ${fmt(heroDate, { weekday: 'short', day: 'numeric', month: 'short' })}`

  return (
    <div className="dh">
      <section className="dh-hero">
        <div className="txt">
          <h1>{getGreeting()}, {firstName}</h1>
          <p>
            {summary}
            {' · '}
            <button className={`need${urgent ? ' red' : ''}`} onClick={() => setShowActions(true)}>
              {actions.length === 0 ? 'nothing needs you' : `${actions.length} ${actions.length === 1 ? 'thing needs' : 'things need'} you`}
            </button>
          </p>
        </div>
        {photoSite
          ? (
            <div className="photo">
              <div className="imgs">
                {photoSites.map((s, i) => (
                  <img key={s.id} src={s.site_photo_url} alt="" className={i === photoOn ? 'on' : ''}
                    onError={() => setBroken(prev => new Set(prev).add(s.site_photo_url))} />
                ))}
              </div>
              <span className="slash" />
              <Link to={`/sites/${photoSite.id}`} className="tag">
                <MapPin size={13} /><span>Today · {photoSite.site_name}</span>{photoCount > 1 && <em>{photoOn + 1}/{photoCount}</em>}
              </Link>
            </div>
          )
          : <Skyline className="city" />}
      </section>

      <TasksStrip members={members} memberId={memberId} fullName={fullName} onDue={setDueTasks} />

      <div className="dh-pinned"><PinnedFeedCard /></div>

      <section className="dh-kpis">
        <Link to="/calendar" className="dh-card dh-kpi">
          <span className="ic" style={{ background: '#e3edfc', color: C.blue }}><MapPin /></span>
          <div className="nums"><b>{sitesPerWeek[9]}</b><span className="lb">Sites this week</span><Delta n={sitesPerWeek[9] - sitesPerWeek[8]} label="vs last week" /></div>
          <Spark id="dh-sp1" values={sitesPerWeek} labels={weeks.map(w => `Week of ${fmt(w)}`)} color={C.blue} showTip={showTip} hideTip={hideTip} />
        </Link>
        <Link to="/sites" className="dh-card dh-kpi">
          <span className="ic" style={{ background: '#dff3e6', color: C.green }}><CalendarDays /></span>
          <div className="nums"><b>{sitesPerMonth[9]}</b><span className="lb">Sites this month</span><Delta n={sitesPerMonth[9] - sitesPerMonth[8]} label="vs last month" /></div>
          <Spark id="dh-sp2" values={sitesPerMonth} labels={months.map(m => fmt(m, { month: 'short', year: 'numeric' }))} color={C.green} showTip={showTip} hideTip={hideTip} />
        </Link>
        <Link to="/team" className="dh-card dh-kpi">
          <span className="ic" style={{ background: '#fdeadb', color: C.orange }}><Users /></span>
          <div className="nums"><b>{outToday}<small> / {members.length}</small></b><span className="lb">Crew on site today</span><span className="dl">{leaveToday} on leave</span></div>
          <Spark id="dh-sp3" values={outPerDay} labels={workDays.map(d => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }))} color={C.orange} showTip={showTip} hideTip={hideTip} />
        </Link>
        <Link to="/reports" className="dh-card dh-kpi">
          <span className="ic" style={{ background: '#ece6fa', color: C.violet }}><FileText /></span>
          <div className="nums"><b>{notStarted + awaiting}</b><span className="lb">Reports pending</span><span className="dl">{notStarted} to write · {awaiting} to approve</span></div>
        </Link>
      </section>

      <section className="dh-row dh-r2">
        <div className="dh-card dh-mapcard">
          <div className="ch"><MapPin className="hi" /><h2>Sites this week</h2><Link className="more" to="/map">Open map <ArrowRight /></Link></div>
          <div className="dh-map">
            <MapContainer center={[3.1, 101.62]} zoom={10} scrollWheelZoom={false} style={{ position: 'absolute', inset: 0 }}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Esri" maxZoom={18} />
              <FitPins points={pins.map(p => p.pos)} />
              {pins.map(({ s, pos, isToday, next }) => (
                <Marker key={s.id} position={pos} icon={isToday ? PIN_TODAY : PIN} zIndexOffset={isToday ? 500 : 0}>
                  <Popup closeButton={false}>
                    <button className="dh-pop" onClick={() => navigate(`/sites/${s.id}`)}>
                      <b>{s.site_name}</b>
                      <span>{isToday ? 'Today' : fmt(next, { weekday: 'short', day: 'numeric', month: 'short' })} · {crewOn(s, next).length ? plural(crewOn(s, next).length, 'crew') : 'No crew yet'}</span>
                    </button>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
            {pins.length === 0 && <div className="dh-map-empty">{weekSites.length ? 'This week\'s sites have no map location yet' : 'No sites this week'}</div>}
            {unmapped > 0 && pins.length > 0 && <div className="dh-map-note">{plural(unmapped, 'site')} without a location</div>}
          </div>
        </div>

        <div className="dh-card">
          <div className="ch"><CalendarDays className="hi" /><h2>{heroDate === today ? 'Today\'s sites' : `Next sites · ${fmt(heroDate, { weekday: 'short', day: 'numeric', month: 'short' })}`}</h2><Link className="more" to="/calendar">Schedule <ArrowRight /></Link></div>
          {todayList.length === 0
            ? <p className="dh-empty">No site work booked in the next 2 weeks.</p>
            : (
              <ul className="dh-tl">
                {todayList.slice(0, 5).map((site, i) => {
                  const crew = crewOn(site, heroDate)
                  return (
                    <li key={site.id} className={i === 0 && heroDate === today ? 'now' : ''}>
                      <span className="dot" />
                      <span className="t">{dayOf(site, heroDate)}</span>
                      <Link to={`/sites/${site.id}`} className="what">
                        <b>{site.site_name}</b>
                        <small>{areaOf(site)}{site.client_company_name ? ` · ${site.client_company_name}` : ''}</small>
                        <span className="crew">
                          {crew.length
                            ? <>{crew.slice(0, 5).map(m => <Avatar key={m.id} m={m} />)}<i>{crew.map(shortName).join(', ')}</i></>
                            : <i className="none">No crew yet</i>}
                        </span>
                      </Link>
                    </li>
                  )
                })}
                {todayList.length > 5 && <li className="more-li"><Link to="/calendar">+{todayList.length - 5} more</Link></li>}
              </ul>
            )}
        </div>

        <div className="dh-card">
          <div className="ch"><Zap className="hi" style={{ color: C.orange }} /><h2>Recent activity</h2><Link className="more" to="/feed">Feed <ArrowRight /></Link></div>
          {notifs === null
            ? <p className="dh-empty">Loading…</p>
            : notifs.length === 0
              ? <p className="dh-empty">Nothing new yet.</p>
              : (
                <ul className="dh-act">
                  {notifs.map(n => {
                    const { Icon, bg } = notifLook(n.message)
                    return (
                      <li key={n.id}>
                        <span className="ai" style={{ background: bg }}><Icon /></span>
                        <div><b>{n.message}</b><small>{n.actor && n.actor !== 'System' ? `${n.actor} · ` : ''}{when(n.created_at)}</small></div>
                      </li>
                    )
                  })}
                </ul>
              )}
        </div>
      </section>

      <section className="dh-row dh-r3">
        <div className="dh-card">
          <div className="ch"><ChartColumn className="hi" /><h2>Site progress</h2><span className="qual">{fmt(mFirst, { month: 'long' })}</span></div>
          <div className="dh-prog">
            <div className="donut">
              <svg viewBox="0 0 150 150" role="img" aria-label={`${progPct}% of this month's sites completed`}>
                <circle cx="75" cy="75" r="60" fill="none" stroke={C.track} strokeWidth="14" />
                {(() => {
                  const R = 2 * Math.PI * 60
                  let off = 0
                  const parts = prog.filter(p => p.n)
                  return parts.map(p => {
                    const len = p.n / monthSites.length * R
                    const seg = (
                      <circle key={p.key} cx="75" cy="75" r="60" fill="none" stroke={p.color} strokeWidth="14"
                        strokeDasharray={`${Math.max(len - (parts.length > 1 ? 3 : 0), 0)} ${R}`} strokeDashoffset={-off} transform="rotate(-90 75 75)"
                        onMouseMove={e => showTip(e, <>{p.label}: <b>{plural(p.n, 'site')}</b></>)} onMouseLeave={hideTip} />
                    )
                    off += len
                    return seg
                  })
                })()}
              </svg>
              <b>{progPct}%</b>
            </div>
            <div className="side">
              <ul className="legend">
                {prog.map(p => <li key={p.key}><span style={{ background: p.color }} />{p.label}<em>{p.n}</em></li>)}
              </ul>
              <small className="cap">Sites completed per month</small>
              <div ref={trendRef} className="trend">
                {trendW > 0 && (() => {
                  const W = trendW, H = 92, B = 18, T = 10, PX = 14
                  const max = Math.max(4, ...donePerMonth)
                  const x = i => PX + i * (W - PX * 2) / (donePerMonth.length - 1), y = v => T + (H - T - B) * (1 - v / max)
                  const line = donePerMonth.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join('')
                  const last = donePerMonth.length - 1
                  return (
                    <svg width={W} height={H} role="img" aria-label="Sites completed per month">
                      <defs><linearGradient id="dh-tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.green} stopOpacity=".25" /><stop offset="1" stopColor={C.green} stopOpacity="0" /></linearGradient></defs>
                      <path d={`${line}L${x(last)} ${H - B}L${x(0)} ${H - B}Z`} fill="url(#dh-tg)" />
                      <path d={line} fill="none" stroke={C.green} strokeWidth="2" />
                      {donePerMonth.map((v, i) => (
                        <g key={i}>
                          <circle cx={x(i)} cy={y(v)} r={i === last ? 4.5 : 3} fill={i === last ? C.green : '#fff'} stroke={C.green} strokeWidth="2" />
                          {(i % 2 === 0 || i === last) && <text x={x(i)} y={H - 3} textAnchor="middle" className="ax">{MONTHS[Number(trendMonths[i].slice(5, 7)) - 1]}</text>}
                          <rect x={x(i) - 14} y={0} width={28} height={H} fill="transparent" onMouseMove={e => showTip(e, <>{fmt(trendMonths[i], { month: 'long', year: 'numeric' })}: <b>{v}</b> completed</>)} onMouseLeave={hideTip} />
                        </g>
                      ))}
                    </svg>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>

        <div className="dh-card">
          <div className="ch"><Users className="hi" /><h2>Manpower this week</h2><Link className="more" to="/team">Team <ArrowRight /></Link></div>
          <div className="dh-mp-leg"><span><i style={{ background: C.navy }} />On site</span><span><i style={{ background: C.leave }} />On leave</span></div>
          <div ref={barRef} className="dh-bars">
            {barW > 0 && (() => {
              const W = barW, H = 196, Lp = 28, B = 24, T = 10
              const max = Math.max(4, ...manpower.map(m => Math.max(m.on, m.leave)))
              const nice = Math.ceil(max / 4) * 4
              const y = v => T + (H - T - B) * (1 - v / nice)
              const step = (W - Lp) / 7, bw = Math.min(16, step * 0.3)
              return (
                <svg width={W} height={H} role="img" aria-label="People on site and on leave each day this week">
                  {[0, 0.5, 1].map(f => <g key={f}><line x1={Lp} x2={W} y1={y(nice * f)} y2={y(nice * f)} className="grid" /><text x={Lp - 8} y={y(nice * f) + 4} textAnchor="end" className="ax">{nice * f}</text></g>)}
                  {manpower.map(({ d, on, leave }, i) => {
                    const cx = Lp + step * i + step / 2, isToday = d === today
                    return (
                      <g key={d}>
                        <path d={barPath(cx - bw - 2, y(on), bw, y(0) - y(on))} fill={C.navy} />
                        <path d={barPath(cx + 2, y(leave), bw, y(0) - y(leave))} fill={C.leave} />
                        <text x={cx} y={H - 6} textAnchor="middle" className={`ax${isToday ? ' now' : ''}`}>{isToday ? 'Today' : DAYS[i]}</text>
                        <rect x={cx - step / 2} y={T} width={step} height={H - T - B} fill="transparent"
                          onMouseMove={e => showTip(e, <><b>{fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}</b><br />{on} on site · {leave} on leave</>)} onMouseLeave={hideTip} />
                      </g>
                    )
                  })}
                </svg>
              )
            })()}
          </div>
        </div>

        <div className="dh-card dh-qacard">
          <div className="ch"><LayoutGrid className="hi" /><h2>Quick access</h2></div>
          <div className="dh-qa">
            <button onClick={onAdd}><MapPinPlus />Add site</button>
            <Link to="/reports"><FileText />Reports</Link>
            <Link to="/team"><Users />Team</Link>
            <Link to="/calendar"><CalendarDays />Calendar</Link>
            <Link to="/scan-points"><Crosshair />Scan Points</Link>
            <Link to="/library"><BookOpen />Library</Link>
          </div>
        </div>
      </section>

      {tip && <div className="dh-tip" style={{ left: tip.x + 14, top: tip.y - 10 }}>{tip.body}</div>}

      {showActions && (
        <div className="dh-modal" onClick={() => setShowActions(false)}>
          <div className="dh-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Things that need you">
            <div className="dh-sheet-h">
              <h3>{actions.length === 1 ? '1 thing needs you' : `${actions.length} things need you`}</h3>
              <button className="x" onClick={() => setShowActions(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="dh-acts">
              {actions.length === 0 && <p className="dh-empty">All clear. Nothing needs you right now.</p>}
              {actions.map(a => {
                const body = <><span className={`sev ${a.sev}`} /><div className="grow"><b>{a.title}</b><small>{a.sub}</small></div><span className="go">{a.go}</span></>
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
