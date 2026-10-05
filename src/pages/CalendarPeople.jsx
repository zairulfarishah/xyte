import { useMemo, useState } from 'react'
import { isOffDay, leaveAbbr } from '../utils/teamLeaves'
import { publicHolidayName } from '../utils/holidays'
import { assignmentMemberId, assignmentsForDate, getSiteDates, isPic } from '../utils/siteDays'
import './CalendarPeople.css'

// People-first calendar views: Crew (everyone × every day) and Person (one member's month).

const MEMBER_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#dc2626']
const SITE_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626', '#4f46e5', '#0d9488', '#64748b']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = n => String(n).padStart(2, '0')
const dowOf = d => new Date(`${d}T00:00:00`).getDay()
const dayNum = d => Number(d.slice(8))
const fmt = d => new Date(`${d}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
const shortOf = m => m.short_name || m.full_name?.split(' ')[0] || '?'
const initialsOf = m => (m.full_name || '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
const siteCode = s => (s.site_name || '?').replace(/\(.*\)/, '').split(/[\s-]+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const sessionShort = (site, date) => {
  const dates = getSiteDates(site)
  if (dates.length > 1) return `Day ${dates.indexOf(date) + 1}/${dates.length}`
  return (site.site_session || 'Full Day').replace('Night Work', 'Night')
}

function Avatar({ m, size = 28 }) {
  return (
    <div className="cp-av" title={m.full_name} style={{ width: size, height: size, fontSize: size * 0.38, background: m.color }}>
      {m.avatar_url ? <img src={m.avatar_url} alt="" /> : initialsOf(m)}
    </div>
  )
}

// Where each member is on each day of the month, worked out once for both views.
function usePeopleMonth({ sites, leaves, members, year, month }) {
  return useMemo(() => {
    const last = new Date(year, month + 1, 0).getDate()
    const dates = Array.from({ length: last }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`)
    const live = sites
      .filter(s => s.scheduled_date && s.site_status !== 'cancelled')
      .map((s, i) => ({ ...s, color: SITE_COLORS[i % SITE_COLORS.length], code: siteCode(s), dates: getSiteDates(s) }))
    const people = members.map((m, i) => ({ ...m, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }))

    const status = {}
    for (const d of dates) {
      const holiday = publicHolidayName(d)
      for (const m of people) {
        const jobs = []
        for (const s of live) {
          if (!s.dates.includes(d)) continue
          const mine = assignmentsForDate(s.site_assignments || [], d).filter(a => assignmentMemberId(a) === m.id)
          if (mine.length) jobs.push({ site: s, pic: mine.some(isPic) })
        }
        let st
        if (jobs.length) st = { kind: 'site', jobs }
        else {
          const mine = leaves.filter(l => l.member_id === m.id && d >= l.start_date && d <= (l.end_date || l.start_date))
          const real = mine.find(l => !isOffDay(l))
          if (real) st = { kind: 'leave', leave: real, label: titleCase(real.leave_type) }
          else if (mine.length) st = { kind: 'off', label: 'Off' }
          else if (holiday) st = { kind: 'holiday', label: holiday }
          else if (dowOf(d) === 0) st = { kind: 'sunday', label: 'Sunday' }
          else st = { kind: 'store', label: 'At store' }
        }
        status[`${m.id}|${d}`] = st
      }
    }
    return { dates, sites: live, people, statusOf: (id, d) => status[`${id}|${d}`] }
  }, [sites, leaves, members, year, month])
}

const leaveText = st => {
  const ses = st.leave.leave_session
  return `${leaveAbbr(st.leave.leave_type)}${ses === 'AM_ONLY' ? ' AM' : ses === 'PM_ONLY' ? ' PM' : ''}`
}

// ── Crew: people × days ──
export function CrewScheduleView(props) {
  const { todayStr, navigate } = props
  const { dates, sites, people, statusOf } = usePeopleMonth(props)
  const dayClass = d => `${dowOf(d) === 0 || publicHolidayName(d) ? 'we' : ''} ${d === todayStr ? 'today' : ''}`

  return (
    <div className="cp">
      <div className="cp-card">
        <div className="cp-scroll">
          <table className="cp-cs">
            <thead>
              <tr>
                <th className="who">Member</th>
                {dates.map(d => (
                  <th key={d} className={dayClass(d)} title={publicHolidayName(d) || undefined}>
                    {new Date(`${d}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'narrow' })}<b>{dayNum(d)}</b>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map(m => {
                const siteDays = dates.filter(d => statusOf(m.id, d).kind === 'site').length
                return (
                  <tr key={m.id}>
                    <td className="who">
                      <div><Avatar m={m} size={30} /><span>{shortOf(m)}<small>{siteDays} site day{siteDays === 1 ? '' : 's'}</small></span></div>
                    </td>
                    {dates.map(d => {
                      const st = statusOf(m.id, d)
                      let cell
                      if (st.kind === 'site') {
                        const j = st.jobs[0]
                        const title = st.jobs.map(x => `${x.site.site_name}${x.pic ? ' (PIC)' : ''}`).join(' + ')
                        cell = (
                          <button className="blk" style={{ background: j.site.color }} title={title} onClick={() => navigate(`/sites/${j.site.id}`)}>
                            {j.site.code}{st.jobs.length > 1 ? '+' : ''}
                            <small>{j.pic ? 'PIC' : sessionShort(j.site, d).replace(/^Day /, 'D')}</small>
                          </button>
                        )
                      } else if (st.kind === 'leave') cell = <div className="blk leave" title={st.label}>{leaveText(st)}</div>
                      else if (st.kind === 'off') cell = <div className="blk off" title="Off (rota)">OFF</div>
                      else if (st.kind === 'holiday') cell = <div className="blk off" title={st.label}>PH</div>
                      else if (st.kind === 'sunday') cell = <div className="blk off" />
                      else cell = <div className="blk store" title="At store">S</div>
                      return <td key={d} className={`d ${dayClass(d)}`}>{cell}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="who">On site</td>
                {dates.map(d => {
                  const n = people.filter(m => statusOf(m.id, d).kind === 'site').length
                  return <td key={d}>{n || ''}</td>
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="cp-key">
          {sites.map(s => (
            <button key={s.id} onClick={() => navigate(`/sites/${s.id}`)}>
              <i style={{ background: s.color }}>{s.code}</i>
              <span>
                <b>{s.site_name}</b>
                <small>
                  {s.client_company_name || '—'} · {s.dates.length > 1 ? `${fmt(s.dates[0])} – ${fmt(s.dates.at(-1))}` : fmt(s.dates[0])}
                  {s.dates.length === 1 && s.site_session ? ` · ${s.site_session}` : ''}
                </small>
              </span>
            </button>
          ))}
          <div><i className="store">S</i><span><b>At store</b><small>Not on site, not off</small></span></div>
          <div><i className="leave">AL</i><span><b>Leave</b><small>AL annual · MC medical · AM/PM = half day</small></span></div>
          <div><i className="off">OFF</i><span><b>Off</b><small>Saturday rota · PH = public holiday</small></span></div>
        </div>
      </div>
      {sites.length === 0 && <p className="cp-empty">No sites scheduled this month.</p>}
    </div>
  )
}

// ── Person: one member's month ──
export function PersonView(props) {
  const { todayStr, navigate, defaultMemberId } = props
  const { dates, people, statusOf } = usePeopleMonth(props)
  const [picked, setPicked] = useState(null)
  const selId = picked || (people.some(m => m.id === defaultMemberId) ? defaultMemberId : people[0]?.id)
  const m = people.find(p => p.id === selId)

  if (!m) return <p className="cp-empty">No team members yet.</p>

  const days = dates.map(d => ({ d, st: statusOf(m.id, d) }))
  const siteDays = days.filter(x => x.st.kind === 'site')
  const picDays = siteDays.filter(x => x.st.jobs.some(j => j.pic)).length
  const satDays = siteDays.filter(x => dowOf(x.d) === 6).length
  const awayDays = days.filter(x => x.st.kind === 'leave' || x.st.kind === 'off').length
  const teamAvg = people.length
    ? (people.reduce((n, p) => n + dates.filter(d => statusOf(p.id, d).kind === 'site').length, 0) / people.length).toFixed(1)
    : 0
  const lead = (dowOf(dates[0]) + 6) % 7

  // Upcoming jobs this month, consecutive days on the same site joined into one row
  const jobs = []
  siteDays.filter(x => x.d >= todayStr).forEach(({ d, st }) => st.jobs.forEach(j => {
    const run = jobs.find(x => x.site.id === j.site.id && dates.indexOf(x.to) + 1 === dates.indexOf(d))
    if (run) { run.to = d; run.pic = run.pic || j.pic } else jobs.push({ site: j.site, from: d, to: d, pic: j.pic })
  }))
  const away = []
  days.filter(x => x.d >= todayStr && (x.st.kind === 'leave' || x.st.kind === 'off')).forEach(({ d, st }) => {
    const label = st.kind === 'off' ? 'Off (Saturday rota)' : st.label
    const run = away.at(-1)
    if (run && run.label === label && dates.indexOf(run.to) + 1 === dates.indexOf(d)) run.to = d
    else away.push({ label, from: d, to: d })
  })

  return (
    <div className="cp">
      <div className="cp-tabs" role="tablist">
        {people.map(p => (
          <button key={p.id} role="tab" aria-selected={p.id === selId} className={p.id === selId ? 'on' : ''} onClick={() => setPicked(p.id)}>
            <Avatar m={p} size={28} />{shortOf(p)}
          </button>
        ))}
      </div>

      <div className="cp-pl">
        <div className="cp-card">
          <div className="cp-prof">
            <Avatar m={m} size={60} />
            <div>
              <h2>{m.full_name}</h2>
              <p>{m.role || 'Member'} · team average is {teamAvg} site days this month</p>
            </div>
          </div>
          <div className="cp-stats">
            <div><b>{siteDays.length}</b><span>Site days</span></div>
            <div><b>{picDays}</b><span>Days as PIC</span></div>
            <div><b>{satDays}</b><span>Saturdays on site</span></div>
            <div><b>{awayDays}</b><span>Days off / leave</span></div>
          </div>
          <div className="cp-cal">
            <div className="cp-head">{WEEKDAYS.map(w => <div key={w}>{w}</div>)}</div>
            <div className="cp-grid">
              {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} className="pc blank" />)}
              {days.map(({ d, st }) => {
                const num = <span className={`n${d === todayStr ? ' today' : ''}`}>{dayNum(d)}</span>
                const past = d < todayStr ? ' past' : ''
                if (st.kind === 'site') {
                  const j = st.jobs[0]
                  return (
                    <button key={d} className={`pc site${past}`} style={{ background: j.site.color }} onClick={() => navigate(`/sites/${j.site.id}`)}
                      title={st.jobs.map(x => x.site.site_name).join(' + ')}>
                      {num}
                      <span className="lab">{j.site.site_name}{st.jobs.length > 1 ? ' +1' : ''}</span>
                      <span className="rl">{j.pic ? '★ PIC' : 'Crew'} · {sessionShort(j.site, d)}</span>
                    </button>
                  )
                }
                const label = st.kind === 'leave' ? st.label : st.kind === 'off' ? 'Off (rota)' : st.kind === 'store' ? 'At store' : st.kind === 'holiday' ? st.label : ''
                return <div key={d} className={`pc ${st.kind}${past}`}>{num}<span className="lab">{label}</span></div>
              })}
            </div>
          </div>
        </div>

        <div className="cp-card cp-side">
          <h3>Coming up for {shortOf(m)}</h3>
          <div className="cp-h4">Jobs this month</div>
          {jobs.length ? jobs.map(j => (
            <button key={`${j.site.id}${j.from}`} className="cp-job" style={{ '--c': j.site.color }} onClick={() => navigate(`/sites/${j.site.id}`)}>
              <b>{j.site.site_name} {j.pic && <span className="cp-pic">PIC</span>}</b>
              <small>
                {j.from === j.to ? fmt(j.from) : `${fmt(j.from)} – ${fmt(j.to)}`}<br />
                {j.site.client_company_name || '—'}{j.site.location ? ` · ${j.site.location.split(',').slice(-2).join(',').trim()}` : ''}
              </small>
            </button>
          )) : <p className="cp-none">No more jobs this month.</p>}
          <div className="cp-h4">Off &amp; leave</div>
          {away.length ? away.map(a => (
            <div key={a.from} className="cp-away">{a.label}<small>{a.from === a.to ? fmt(a.from) : `${fmt(a.from)} – ${fmt(a.to)}`}</small></div>
          )) : <p className="cp-none">Nothing booked.</p>}
        </div>
      </div>
    </div>
  )
}
