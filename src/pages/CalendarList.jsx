import { useEffect, useMemo, useRef, useState } from 'react'
import { isOffDay, leaveAbbr } from '../utils/teamLeaves'
import { publicHolidayName } from '../utils/holidays'
import { assignmentsForDate, isPic } from '../utils/siteDays'
import './CalendarList.css'

// Calendar → List: the site sheet (one row per site across the month), then At Store, Off and Team Leave.

const STATUS_DOT = { upcoming: '#f59e0b', ongoing: '#2563eb', completed: '#16a34a', cancelled: '#ef4444', postponed: '#94a3b8' }

// Single-day site session — multi-day sites and same-day sites with no
// session picked fall back to the default working-day green.
const DEFAULT_SESSION_COLOR = '#86d387'
const SESSION_COLORS = {
  'Full Day':   '#86d387',
  AM:           '#fbbf24',
  PM:           '#fb923c',
  'Night Work': '#818cf8',
}

const COLS = [
  { key: 'no',      label: 'No.',             width: 44 },
  { key: 'site',    label: 'Site',            width: 220 },
  { key: 'company', label: 'Company',         width: 160 },
  { key: 'details', label: 'Project Details', width: 250 },
  { key: 'days',    label: 'Days',            width: 56 },
]
const DAY_W = 84
const colLeft = idx => COLS.slice(0, idx).reduce((sum, c) => sum + c.width, 0)
const LAST_PIN = COLS.length - 1

const LEGEND = [
  { label: 'Full Day', swatch: SESSION_COLORS['Full Day'] },
  { label: 'AM', swatch: SESSION_COLORS.AM },
  { label: 'PM', swatch: SESSION_COLORS.PM },
  { label: 'Night Work', swatch: SESSION_COLORS['Night Work'] },
  { label: 'Sunday', swatch: '#1e293b' },
  { label: 'Public holiday', swatch: '#2563eb' },
  { label: 'Off day', swatch: '#e2e8f0' },
  { label: 'On leave', swatch: '#fecaca' },
  { label: 'Today', swatch: '#dbeafe' },
]

const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
const nameOf = m => m?.short_name || m?.full_name?.split(' ')[0] || ''

// Every name, one per line — names are never hidden
function Names({ names, tone = '' }) {
  if (!names.length) return null
  return (
    <div className={`cl-names ${tone}`}>
      {names.map(n => <span key={n}>{n}</span>)}
    </div>
  )
}

// The frozen left cells of one row
function PinCells({ cells, className = '', onClick }) {
  return COLS.map((c, i) => (
    <td
      key={c.key}
      className={`pin ${c.key} ${i === LAST_PIN ? 'last' : ''} ${className}`}
      style={{ left: colLeft(i), width: c.width, minWidth: c.width, maxWidth: c.width }}
      onClick={onClick}
    >
      {cells[c.key] ?? ''}
    </td>
  ))
}

export default function CalendarListView({ sitesSorted, year, month, navigate, leaves, members, canEditRota, onToggleOff }) {
  const pad = n => String(n).padStart(2, '0')
  const lastDay = new Date(year, month + 1, 0).getDate()
  const dayNums = Array.from({ length: lastDay }, (_, i) => i + 1)
  const dateStrOf = day => `${year}-${pad(month + 1)}-${pad(day)}`
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const days = dayNums.map(d => {
    const date = dateStrOf(d)
    const dow = new Date(year, month, d).getDay()
    return { d, date, dow, sun: dow === 0, mon: dow === 1, holiday: publicHolidayName(date), today: date === todayStr }
  })
  const dayClass = info => ['day', info.sun && 'sun', info.holiday && 'ph', info.mon && 'mon', info.today && 'today'].filter(Boolean).join(' ')

  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const from = dateStrOf(1), to = dateStrOf(lastDay)
  const leavesThisMonth = leaves.filter(l => (l.start_date || '') <= to && (l.end_date || l.start_date || '') >= from)
  const inLeave = (l, date) => date >= l.start_date && date <= (l.end_date || l.start_date)

  // Crew per site per day (PIC first) and who is tied to a site each day
  const { crewBySite, assignedByDate } = useMemo(() => {
    const crewBySite = {}, assignedByDate = {}
    const monthDates = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
    for (const site of sitesSorted) {
      const start = site.scheduled_date, end = site.end_date || site.scheduled_date
      const byDate = {}
      for (const date of monthDates) {
        if (!start || date < start || date > end) continue
        const rows = assignmentsForDate(site.site_assignments || [], date)
        const pic = rows.filter(isPic).map(a => nameOf(a.team_members)).filter(Boolean)
        const crew = rows.filter(a => !isPic(a)).map(a => nameOf(a.team_members)).filter(n => n && !pic.includes(n))
        byDate[date] = [...pic.map(n => `★ ${n}`), ...crew]
        rows.forEach(a => { if (a.team_members?.id) (assignedByDate[date] ||= new Set()).add(a.team_members.id) })
      }
      crewBySite[site.id] = byDate
    }
    return { crewBySite, assignedByDate }
  }, [sitesSorted, year, month])

  function storeNames(date) {
    const assigned = assignedByDate[date] || new Set()
    const away = new Set(leavesThisMonth.filter(l => inLeave(l, date)).map(l => l.member_id))
    return members.filter(m => !assigned.has(m.id) && !away.has(m.id)).map(nameOf)
  }
  function offNames(date) {
    const off = new Set(leavesThisMonth.filter(l => isOffDay(l) && inLeave(l, date)).map(l => l.member_id))
    return members.filter(m => off.has(m.id)).map(nameOf)
  }
  const leaveMap = {}
  for (const l of leavesThisMonth.filter(l => !isOffDay(l))) (leaveMap[l.leave_type || 'OTHER'] ||= []).push(l)
  const leavesByType = Object.entries(leaveMap).sort(([a], [b]) => a.localeCompare(b))

  // Who can be switched between Store and Off on a date: not on a site and not on real leave
  function rotaCandidates(date) {
    const assigned = assignedByDate[date] || new Set()
    const todays = leavesThisMonth.filter(l => inLeave(l, date))
    const realLeave = new Set(todays.filter(l => !isOffDay(l)).map(l => l.member_id))
    const off = new Set(todays.filter(isOffDay).map(l => l.member_id))
    return members
      .filter(m => !assigned.has(m.id) && !realLeave.has(m.id))
      .map(m => ({ id: m.id, name: m.short_name || m.full_name, off: off.has(m.id) }))
  }
  const [rota, setRota] = useState(null) // { dateStr, rect }
  const editable = info => canEditRota && !info.sun && !info.holiday
  const rotaProps = info => editable(info)
    ? { onClick: e => setRota({ dateStr: info.date, rect: e.currentTarget.getBoundingClientRect() }), title: 'Set who is at store or off' }
    : {}

  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = key => setExpanded(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })

  // Open scrolled so today sits just right of the frozen columns
  const scrollRef = useRef(null)
  const todayIndex = days.findIndex(x => x.today)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = todayIndex > 2 ? (todayIndex - 2) * DAY_W : 0
  }, [todayIndex])

  const sectionRow = (label, tone) => (
    <tr className={`cl-sec ${tone}`}>
      <td className="pin" style={{ left: 0 }} colSpan={COLS.length}>{label}</td>
      <td colSpan={dayNums.length} />
    </tr>
  )
  const moreBtn = (key, isOpen) => (
    <button className="cl-more" onClick={e => { e.stopPropagation(); toggle(key) }}>{isOpen ? 'Less' : 'More'}</button>
  )

  return (
    <div className="cl">
      {rota && (
        <RotaPopover
          dateStr={rota.dateStr}
          rect={rota.rect}
          people={rotaCandidates(rota.dateStr)}
          onToggle={(memberId, off) => onToggleOff(memberId, rota.dateStr, off)}
          onClose={() => setRota(null)}
        />
      )}

      <div className="cl-scroll gantt-scroll" ref={scrollRef}>
        <table>
          <thead>
            <tr>
              {COLS.map((c, i) => (
                <th key={c.key} className={`pin ${i === LAST_PIN ? 'last' : ''}`} style={{ left: colLeft(i), width: c.width, minWidth: c.width, maxWidth: c.width }}>
                  {c.label}
                </th>
              ))}
              {days.map(info => (
                <th key={info.d} className={dayClass(info)} title={info.holiday || undefined}>
                  <small>{new Date(year, month, info.d).toLocaleDateString('en-MY', { weekday: 'short' })}</small>
                  <b>{info.d}</b>
                  {info.holiday && <i>PH</i>}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sitesSorted.length === 0 && (
              <tr><td colSpan={COLS.length + dayNums.length} className="cl-empty">No sites scheduled this month.</td></tr>
            )}

            {sitesSorted.map((site, i) => {
              const byDate = crewBySite[site.id] || {}
              const isOpen = expanded.has(site.id)
              const canOpen = (site.scope_of_work || '').length > 34 || (site.scope_of_work || '').includes('\n')
                || (site.site_name || '').length > 24 || (site.client_company_name || '').length > 20
              const color = (site.scheduled_date === (site.end_date || site.scheduled_date) && SESSION_COLORS[site.site_session]) || DEFAULT_SESSION_COLOR
              return (
                <tr key={site.id} className={`cl-row${isOpen ? ' open' : ''}`}>
                  <PinCells
                    onClick={() => navigate(`/sites/${site.id}`)}
                    className="site-row"
                    cells={{
                      no: i + 1,
                      site: (
                        <div className="cl-site">
                          <span className="cl-name"><i className="cl-dot" style={{ background: STATUS_DOT[site.site_status] || '#94a3b8' }} />{site.site_name}</span>
                          {canOpen && moreBtn(site.id, isOpen)}
                        </div>
                      ),
                      company: <span className="cl-clamp">{site.client_company_name || '—'}</span>,
                      details: <span className="cl-clamp" title={site.scope_of_work || undefined}>{site.scope_of_work || '—'}</span>,
                      days: site.site_duration_days ?? '—',
                    }}
                  />
                  {days.map(info => {
                    const names = byDate[info.date]
                    if (!names) return <td key={info.d} className={dayClass(info)} />
                    return (
                      <td key={info.d} className={`${dayClass(info)} on`} style={{ '--sc': color }}>
                        {names.length ? <Names names={names} /> : <span className="cl-nocrew">No crew</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {sectionRow('At Store & Off', 'store')}
            <tr className="cl-row ppl">
              <PinCells cells={{ site: <span className="cl-name"><i className="cl-dot" style={{ background: '#3b82f6' }} />At Store</span> }} className="store" />
              {days.map(info => (
                <td key={info.d} className={`${dayClass(info)}${editable(info) ? ' edit' : ''}`} {...rotaProps(info)}>
                  {!info.sun && !info.holiday && <Names names={storeNames(info.date)} tone="store" />}
                </td>
              ))}
            </tr>
            <tr className="cl-row ppl">
              <PinCells
                cells={{
                  site: <span className="cl-name"><i className="cl-dot" style={{ background: '#94a3b8' }} />Off</span>,
                  details: canEditRota ? <span className="cl-hint">Tap a day to set Store / Off</span> : null,
                }}
                className="off"
              />
              {days.map(info => (
                <td key={info.d} className={`${dayClass(info)}${editable(info) ? ' edit' : ''}`} {...rotaProps(info)}>
                  <Names names={offNames(info.date)} tone="off" />
                </td>
              ))}
            </tr>

            {leavesByType.length > 0 && sectionRow('Team Leave', 'leave')}
            {leavesByType.map(([type, list]) => {
              const key = `leave:${type}`
              const namesOn = date => list.filter(l => inLeave(l, date)).map(l => {
                const n = nameOf(memberById[l.member_id])
                return l.leave_session === 'AM_ONLY' ? `${n} (AM)` : l.leave_session === 'PM_ONLY' ? `${n} (PM)` : n
              }).filter(Boolean)
              return (
                <tr key={key} className="cl-row ppl">
                  <PinCells
                    className="leave"
                    cells={{
                      site: (
                        <span className="cl-name"><i className="cl-dot" style={{ background: '#ef4444' }} />{titleCase(type)} <b className="cl-abbr">({leaveAbbr(type)})</b></span>
                      ),
                      details: `${list.length} record${list.length > 1 ? 's' : ''}`,
                    }}
                  />
                  {days.map(info => {
                    const names = namesOn(info.date)
                    return (
                      <td key={info.d} className={`${dayClass(info)}${names.length ? ' lv' : ''}`}>
                        <Names names={names} tone="leave" />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="cl-legend">
        <div>
          {LEGEND.map(item => <span key={item.label}><i style={{ background: item.swatch }} />{item.label}</span>)}
          <span>★ PIC</span>
        </div>
        <div>
          {Object.entries(STATUS_DOT).map(([status, color]) => (
            <span key={status} style={{ textTransform: 'capitalize' }}><b className="cl-dot" style={{ background: color }} />{status}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Store / Off switch for one day. Floats above the page because the table scrolls.
function RotaPopover({ dateStr, rect, people, onToggle, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const width = 250
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))
  const below = window.innerHeight - rect.bottom
  const place = below > 260 || below > rect.top ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }
  const label = new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })
  const seg = (active, tone) => ({
    padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: '11.5px', fontWeight: '700', fontFamily: 'inherit',
    background: active ? (tone === 'off' ? '#475569' : '#2563eb') : 'transparent',
    color: active ? 'white' : '#64748b',
  })

  return (
    <div ref={ref} style={{ position: 'fixed', zIndex: 1300, left, width, ...place, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 16px 40px rgba(15,23,42,0.22)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>{label}</span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Store / Off</span>
      </div>
      <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '6px' }}>
        {people.length === 0 ? (
          <p style={{ padding: '12px 8px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>Everyone is on a site or on leave this day.</p>
        ) : people.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 6px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{p.name}</span>
            <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
              <button onClick={() => onToggle(p.id, false)} style={seg(!p.off, 'store')}>Store</button>
              <button onClick={() => onToggle(p.id, true)} style={seg(p.off, 'off')}>Off</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
