import { isActiveMember } from '../utils/members'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { isOffDay, leaveAbbr } from '../utils/teamLeaves'
import { publicHolidayName } from '../utils/holidays'
import { assignmentsForDate, isPic } from '../utils/siteDays'
import './CalendarList.css'

// Calendar → Sheet: one row per site across the month (soft bars, PIC first), then
// At store / Off / On leave as a count per day ("Show names" lists who).

const STATUS_DOT = { upcoming: 'var(--x-warning)', ongoing: 'var(--x-success)', completed: '#94a3b8', cancelled: 'var(--x-danger)', postponed: '#b8c2d1' }

// Single-day sites take their session's colour; multi-day sites and no session = full day (green)
const SESSION_CLASS = { AM: 'am', PM: 'pm', 'Night Work': 'night' }

const PIN_W = 264
const DAY_W = 78

const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
const nameOf = m => m?.short_name || m?.full_name?.split(' ')[0] || ''

function Names({ names, tone }) {
  if (!names.length) return null
  return <div className={`cl-names ${tone}`}>{names.map(n => <span key={n}>{n}</span>)}</div>
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
    return { d, date, dow, sun: dow === 0, holiday: publicHolidayName(date), today: date === todayStr }
  })
  const dayClass = info => ['day', info.sun && 'sun', info.holiday && 'ph', info.today && 'today'].filter(Boolean).join(' ')

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
        byDate[date] = [...pic.map(name => ({ name, pic: true })), ...crew.map(name => ({ name, pic: false }))]
        rows.forEach(a => { if (a.team_members?.id) (assignedByDate[date] ||= new Set()).add(a.team_members.id) })
      }
      crewBySite[site.id] = byDate
    }
    return { crewBySite, assignedByDate }
  }, [sitesSorted, year, month])

  function storeNames(date) {
    const assigned = assignedByDate[date] || new Set()
    const away = new Set(leavesThisMonth.filter(l => inLeave(l, date)).map(l => l.member_id))
    return members.filter(m => isActiveMember(m) && !assigned.has(m.id) && !away.has(m.id)).map(nameOf)
  }
  function offNames(date) {
    const off = new Set(leavesThisMonth.filter(l => isOffDay(l) && inLeave(l, date)).map(l => l.member_id))
    return members.filter(m => off.has(m.id)).map(nameOf)
  }
  const realLeaves = leavesThisMonth.filter(l => !isOffDay(l))
  const leaveMap = {}
  for (const l of realLeaves) (leaveMap[l.leave_type || 'OTHER'] ||= []).push(l)
  const leavesByType = Object.entries(leaveMap).sort(([a], [b]) => a.localeCompare(b))
  const leaveNames = (list, date) => list.filter(l => inLeave(l, date)).map(l => {
    const n = nameOf(memberById[l.member_id])
    return l.leave_session === 'AM_ONLY' ? `${n} (AM)` : l.leave_session === 'PM_ONLY' ? `${n} (PM)` : n
  }).filter(Boolean)

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

  // People sections show a count per day until "Show names" is pressed
  const [open, setOpen] = useState(() => new Set())
  const toggle = key => setOpen(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })

  // Open scrolled so today sits just right of the site column
  const scrollRef = useRef(null)
  const todayIndex = days.findIndex(x => x.today)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = todayIndex > 2 ? (todayIndex - 2) * DAY_W : 0
  }, [todayIndex])

  const pin = (content, className = '', onClick) => (
    <td className={`pin ${className}`} style={{ width: PIN_W, minWidth: PIN_W, maxWidth: PIN_W }} onClick={onClick}>{content}</td>
  )

  // A people section: header row with a count per day, plus name rows when open
  function section({ key, label, tone, countOn, rows, hint, rotaRow }) {
    const isOpen = open.has(key)
    return (
      <>
        <tr className={`cl-sec ${tone}${isOpen ? ' open' : ''}`}>
          {pin(
            <button type="button" className="cl-sec-btn" onClick={() => toggle(key)} aria-expanded={isOpen}>
              <ChevronRight size={14} className="chev" /><i className={`sw ${tone}`} />{label}
              <span className="tog">{isOpen ? 'Hide names' : 'Show names'}</span>
            </button>,
          )}
          {days.map(info => {
            const n = info.sun && tone !== 'leave' ? 0 : countOn(info.date)
            const edit = rotaRow && !isOpen && editable(info)
            return (
              <td key={info.d} className={`${dayClass(info)} c${edit ? ' edit' : ''}`} {...(edit ? rotaProps(info) : {})}>
                {n > 0 && <span className={`cl-cnt ${tone}`}>{n}</span>}
              </td>
            )
          })}
        </tr>
        {isOpen && rows.map(r => (
          <tr key={r.key} className="cl-ppl">
            {pin(<>{r.label}{hint && <small>{hint}</small>}</>, 'ppl')}
            {days.map(info => {
              const names = r.namesOn(info)
              const edit = r.rota && editable(info)
              return (
                <td key={info.d} className={`${dayClass(info)}${edit ? ' edit' : ''}`} {...(edit ? rotaProps(info) : {})}>
                  <Names names={names} tone={tone} />
                </td>
              )
            })}
          </tr>
        ))}
      </>
    )
  }

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
              <th className="pin" style={{ width: PIN_W, minWidth: PIN_W, maxWidth: PIN_W }}>Site</th>
              {days.map(info => (
                <th key={info.d} className={dayClass(info)} title={info.holiday || undefined}>
                  <small>{info.today ? 'Today' : new Date(year, month, info.d).toLocaleDateString('en-MY', { weekday: 'short' })}</small>
                  <b>{info.d}</b>
                  {info.holiday && <i>PH</i>}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sitesSorted.length === 0 && (
              <tr><td colSpan={1 + dayNums.length} className="cl-empty">No sites scheduled this month.</td></tr>
            )}

            {sitesSorted.map(site => {
              const byDate = crewBySite[site.id] || {}
              const single = site.scheduled_date === (site.end_date || site.scheduled_date)
              const tone = (single && SESSION_CLASS[site.site_session]) || ''
              const daysLabel = site.site_duration_days ? `${site.site_duration_days} day${site.site_duration_days === 1 ? '' : 's'}` : ''
              const sub = [site.client_company_name, daysLabel].filter(Boolean).join(' · ')
              return (
                <tr key={site.id} className="cl-row">
                  {pin(
                    <>
                      <span className="cl-name"><i className="cl-dot" style={{ background: STATUS_DOT[site.site_status] || '#94a3b8' }} />{site.site_name}</span>
                      {sub && <span className="cl-sub">{sub}</span>}
                    </>,
                    'site',
                    () => navigate(`/sites/${site.id}`),
                  )}
                  {days.map((info, i) => {
                    const names = byDate[info.date]
                    if (!names) return <td key={info.d} className={dayClass(info)} />
                    const joinL = i > 0 && byDate[days[i - 1].date]
                    const joinR = i < days.length - 1 && byDate[days[i + 1].date]
                    const shape = joinL && joinR ? ' mid' : joinL ? ' end' : joinR ? ' start' : ''
                    return (
                      <td key={info.d} className={`${dayClass(info)} on`}>
                        <div className={`cl-bar ${tone}${shape}${names.length ? '' : ' none'}`} onClick={() => navigate(`/sites/${site.id}`)}
                          title={site.scope_of_work ? `${site.site_name}\n${site.scope_of_work}` : site.site_name}>
                          {names.length
                            ? names.map(n => <span key={n.name} className={n.pic ? 'pic' : ''}>{n.name}</span>)
                            : <span>No crew</span>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {section({
              key: 'store', label: 'At store', tone: 'store', rotaRow: true,
              countOn: date => storeNames(date).length,
              rows: [{ key: 'store', label: 'At store', rota: true, namesOn: info => (!info.sun && !info.holiday ? storeNames(info.date) : []) }],
              hint: canEditRota ? 'Tap a day to set Store / Off' : null,
            })}
            {section({
              key: 'off', label: 'Off', tone: 'off', rotaRow: true,
              countOn: date => offNames(date).length,
              rows: [{ key: 'off', label: 'Off', rota: true, namesOn: info => offNames(info.date) }],
              hint: canEditRota ? 'Tap a day to set Store / Off' : null,
            })}
            {realLeaves.length > 0 && section({
              key: 'leave', label: 'On leave', tone: 'leave',
              countOn: date => new Set(realLeaves.filter(l => inLeave(l, date)).map(l => l.member_id)).size,
              rows: leavesByType.map(([type, list]) => ({
                key: `leave:${type}`,
                label: <>{titleCase(type)} <b className="cl-abbr">{leaveAbbr(type)}</b></>,
                namesOn: info => leaveNames(list, info.date),
              })),
            })}
          </tbody>
        </table>
      </div>

      <div className="cl-legend">
        <span><i className="bar" />Full day</span>
        <span><i className="bar am" />AM</span>
        <span><i className="bar pm" />PM</span>
        <span><i className="bar night" />Night</span>
        <span><b className="pic" />PIC</span>
        <span><i className="bar none" />No crew</span>
        <span className="gap" />
        {['ongoing', 'upcoming', 'completed', 'postponed'].map(st => (
          <span key={st}><b className="cl-dot" style={{ background: STATUS_DOT[st] }} />{titleCase(st)}</span>
        ))}
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
