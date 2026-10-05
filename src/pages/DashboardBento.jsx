import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isOffDay, leaveAbbr } from '../utils/teamLeaves'
import { assignmentMemberId, assignmentsForDate, getSiteDates, isPic } from '../utils/siteDays'
import { buildJobIndex, isActiveSite, memberDayStatus } from '../utils/memberDay'
import { PinnedFeedCard } from '../components/FeedWidgets'
import './DashboardBento.css'

// The dashboard: six summary cards, then tiles that each answer one question
// (what needs doing, who is out, who is free, what's on today, my next job, reports, this week, leave).

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626', '#0891b2']
const OPEN_REPORT = ['pending', 'in_progress', 'submitted']
const SHOW_ACTIONS = 6

const pad = n => String(n).padStart(2, '0')
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d) }
const dowOf = s => new Date(`${s}T00:00:00`).getDay()
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000)
const fmt = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', opts)
const short = s => fmt(s, { day: 'numeric', month: 'short' })
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
const shortName = m => m?.short_name || m?.full_name?.split(' ')[0] || '?'
const initials = m => (m?.full_name || '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
const placeOf = s => { const parts = String(s.location || '').split(',').map(p => p.trim()).filter(Boolean); return parts.length > 2 ? parts[parts.length - 2] : parts[0] || '' }

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function Avatar({ m, size = 30 }) {
  return (
    <span className="db-av" title={m?.full_name} style={{ width: size, height: size, fontSize: size * 0.36, background: m?.color || '#64748b' }}>
      {m?.avatar_url ? <img src={m.avatar_url} alt="" /> : initials(m)}
    </span>
  )
}

export default function DashboardBento({ sites, members: rawMembers, leaves, kpis, firstName, memberId, isZairul, onAssign, onUpdate }) {
  const today = isoOf(new Date())
  const [showAllActions, setShowAllActions] = useState(false)

  const members = useMemo(
    () => rawMembers.map((m, i) => ({ ...m, color: AVATAR_COLORS[i % AVATAR_COLORS.length] })),
    [rawMembers]
  )
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const jobIndex = useMemo(() => buildJobIndex(sites), [sites])
  const statusOf = (id, date) => memberDayStatus(jobIndex, leaves, id, date)

  // People on a site on a given day, PIC first
  const crewOn = (site, date) => {
    const rows = assignmentsForDate(site.site_assignments || [], date)
    const pic = rows.filter(isPic).map(a => memberById[assignmentMemberId(a)]).filter(Boolean)
    const crew = rows.filter(a => !isPic(a)).map(a => memberById[assignmentMemberId(a)]).filter(m => m && !pic.includes(m))
    return { pic, crew, all: [...pic, ...crew] }
  }
  const dayLabel = (site, date) => {
    const dates = getSiteDates(site)
    return dates.length > 1 ? `Day ${dates.indexOf(date) + 1} of ${dates.length}` : (site.site_session || 'Full day')
  }

  const live = sites.filter(isActiveSite)
  const todaySites = live.filter(s => getSiteDates(s).includes(today))
  const statusToday = members.map(m => statusOf(m.id, today))
  const outToday = statusToday.filter(s => s.kind === 'site').length
  const freeToday = members.filter((m, i) => ['free', 'store'].includes(statusToday[i].kind))

  // ── things someone has to act on ──
  const actions = useMemo(() => {
    const out = []
    const horizon = addDays(today, 14)
    const rel = d => d === today ? 'today' : d === addDays(today, 1) ? 'tomorrow' : fmt(d)

    for (const site of sites) {
      if (!isActiveSite(site) || site.site_status === 'completed') continue
      const coming = getSiteDates(site).filter(d => d >= today && d <= horizon && dowOf(d) !== 0)
      const empty = coming.filter(d => assignmentsForDate(site.site_assignments || [], d).length === 0)
      if (empty.length) out.push({
        key: `crew-${site.id}`, sev: empty[0] <= addDays(today, 1) ? 'red' : 'amber', icon: '👷', when: empty[0],
        title: `Assign crew — ${site.site_name}`,
        sub: empty.length === 1 ? `Nobody assigned ${rel(empty[0])}` : `${empty.length} days with nobody: ${empty.map(d => d === today ? 'today' : Number(d.slice(8))).join(', ')}`,
        go: 'Assign', run: () => onAssign(site),
      })
      const noPic = coming.filter(d => { const rows = assignmentsForDate(site.site_assignments || [], d); return rows.length && !rows.some(isPic) })
      if (noPic.length) out.push({
        key: `pic-${site.id}`, sev: 'amber', icon: '⭐', when: noPic[0],
        title: `Set a PIC — ${site.site_name}`, sub: `${noPic.length} day${noPic.length > 1 ? 's' : ''} with crew but no PIC`,
        go: 'Set PIC', run: () => onAssign(site),
      })
      // Someone booked on a site while on leave
      const clash = coming.flatMap(d => assignmentsForDate(site.site_assignments || [], d)
        .map(a => ({ d, m: memberById[assignmentMemberId(a)] }))
        .filter(({ d: day, m }) => m && leaves.some(l => l.member_id === m.id && !isOffDay(l) && day >= l.start_date && day <= (l.end_date || l.start_date))))
      if (clash.length) out.push({
        key: `clash-${site.id}`, sev: 'red', icon: '🌴', when: clash[0].d,
        title: `Leave clash — ${site.site_name}`, sub: `${[...new Set(clash.map(c => shortName(c.m)))].join(', ')} on leave ${rel(clash[0].d)}`,
        go: 'Reassign', run: () => onAssign(site),
      })
      const end = site.end_date || site.scheduled_date
      if (end && end < today && ['upcoming', 'ongoing'].includes(site.site_status)) out.push({
        key: `close-${site.id}`, sev: 'amber', icon: '🏁', when: end,
        title: `Close site — ${site.site_name}`, sub: `Ended ${short(end)} but still marked ${site.site_status}`,
        go: 'Update', run: () => onUpdate(site),
      })
    }
    for (const site of sites) {
      const rep = site.report_status
      if (site.site_status === 'completed' && site.site_type === 'site_scanning' && ['pending', 'in_progress'].includes(rep)) {
        const end = site.end_date || site.scheduled_date
        const pic = crewOn(site, end).pic[0]
        out.push({
          key: `rep-${site.id}`, sev: 'amber', icon: '📝', when: end || '',
          title: `Finish report — ${site.site_name}`, sub: `${rep === 'pending' ? 'Not started' : 'In progress'} · site done ${short(end)}${pic ? ` · PIC ${shortName(pic)}` : ''}`,
          go: 'Update', run: () => onUpdate(site),
        })
      }
      if (rep === 'submitted') out.push({
        key: `appr-${site.id}`, sev: 'amber', icon: '✅', when: site.end_date || site.scheduled_date || '',
        title: `${isZairul ? 'Approve' : 'Awaiting approval'} — ${site.site_name}`, sub: 'Report submitted', go: isZairul ? 'Review' : 'View', run: () => onUpdate(site),
      })
      if (site.site_status === 'postponed' && site.scheduled_date >= addDays(today, -30)) out.push({
        key: `post-${site.id}`, sev: 'grey', icon: '⏸', when: site.scheduled_date,
        title: `Reschedule — ${site.site_name}`, sub: `Postponed from ${fmt(site.scheduled_date)}`, go: 'Open', link: `/sites/${site.id}`,
      })
    }
    const order = { red: 0, amber: 1, grey: 2 }
    return out.sort((a, b) => order[a.sev] - order[b.sev] || String(a.when).localeCompare(String(b.when)))
  }, [sites, leaves, memberById, today, isZairul]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── my next job ──
  let myNext = null
  if (memberId) {
    for (let i = 1; i <= 60 && !myNext; i++) {
      const d = addDays(today, i)
      const st = statusOf(memberId, d)
      if (st.kind === 'site') myNext = { d, st }
    }
  }
  const myToday = memberId ? statusOf(memberId, today) : null

  // ── reports ──
  const reportsOpen = sites.filter(s => s.site_status === 'completed' && s.site_type === 'site_scanning' && OPEN_REPORT.includes(s.report_status)).length
  const month = today.slice(0, 7)
  const monthSites = live.filter(s => getSiteDates(s).some(d => d.startsWith(month)))
  const monthDone = monthSites.filter(s => s.site_status === 'completed').length

  // ── this week ──
  const monday = addDays(today, -((dowOf(today) + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const loads = week.map(d => members.filter(m => statusOf(m.id, d).kind === 'site').length)
  const maxLoad = Math.max(1, ...loads)

  // ── leave in the next 30 days (the Saturday rota is not leave) ──
  const leaveSoon = leaves
    .filter(l => !isOffDay(l) && (l.end_date || l.start_date) >= today && l.start_date <= addDays(today, 30) && memberById[l.member_id])
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const leaveDays = l => {
    let n = 0
    for (let d = l.start_date; d <= (l.end_date || l.start_date); d = addDays(d, 1)) if (dowOf(d) !== 0) n += l.leave_session && l.leave_session !== 'FULL_DAY' ? 0.5 : 1
    return n
  }

  const shownActions = showAllActions ? actions : actions.slice(0, SHOW_ACTIONS)
  const urgent = actions.filter(a => a.sev === 'red').length

  return (
    <div className="db">
      <header className="db-hero">
        <div className="db-hero-in">
          <div className="eyebrow">{fmt(today, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <h1>{getGreeting()}, <span>{firstName}</span> 👋</h1>
          <p>
            {todaySites.length} site{todaySites.length === 1 ? '' : 's'} running today · {outToday} of {members.length} people out
            · {actions.length} thing{actions.length === 1 ? '' : 's'} need{actions.length === 1 ? 's' : ''} you
          </p>
        </div>
      </header>

      <div className="db-wrap">
        <div className="db-kpis">
          {kpis.map(k => (
            <div key={k.label} className="db-kpi" style={{ '--kc': k.color, '--kg': k.gradient }}>
              <div className="top"><small>{k.label}</small><span className="ico">{k.icon}</span></div>
              <b>{k.value}</b>
              <div className="tr">{k.trend}</div>
            </div>
          ))}
        </div>

        <div className="db-pinned"><PinnedFeedCard /></div>

        <div className="db-bento">
          {/* needs action */}
          <section className="db-tile c w2 h2 t-red">
            <div className="glow" />
            <h4>⚡ Needs action</h4>
            <div className="big">{actions.length}{urgent > 0 && <small>{urgent} urgent</small>}</div>
            <div className="list">
              {actions.length === 0 && <div className="li"><span className="ic">🎉</span><div><b>All clear</b><small>Nothing needs you right now</small></div></div>}
              {shownActions.map(a => {
                const body = <><span className="ic">{a.icon}</span><div className="grow"><b>{a.title}</b><small>{a.sub}</small></div><span className="go">{a.go}</span></>
                return a.link
                  ? <Link key={a.key} to={a.link} className={`li sev-${a.sev}`}>{body}</Link>
                  : <button key={a.key} className={`li sev-${a.sev}`} onClick={a.run}>{body}</button>
              })}
              {actions.length > SHOW_ACTIONS && (
                <button className="more" onClick={() => setShowAllActions(v => !v)}>
                  {showAllActions ? 'Show less' : `Show all ${actions.length}`}
                </button>
              )}
            </div>
          </section>

          {/* team out */}
          <section className="db-tile dark">
            <h4>👷 Team out today</h4>
            <div className="ring" style={{ '--p': members.length ? Math.round(outToday / members.length * 100) : 0 }}>
              <div><span><b>{outToday}/{members.length}</b><small>on site</small></span></div>
            </div>
          </section>

          {/* available */}
          <section className="db-tile c t-teal">
            <div className="glow" />
            <h4>🟢 Free right now</h4>
            <div className="big">{freeToday.length}</div>
            <div className="faces">{freeToday.map(m => <Avatar key={m.id} m={m} size={34} />)}</div>
            <p>{freeToday.map(shortName).join(', ') || 'Everyone is busy'}</p>
          </section>

          {/* today on site */}
          <section className="db-tile c w2 t-blue">
            <div className="glow" />
            <h4>📍 Today on site <Link to="/calendar">Calendar →</Link></h4>
            <div className="list">
              {todaySites.length === 0 && <div className="li"><div><b>No site work today</b></div></div>}
              {todaySites.map(site => {
                const c = crewOn(site, today)
                return (
                  <Link key={site.id} to={`/sites/${site.id}`} className="li">
                    <div className="grow">
                      <b>{site.site_name}</b>
                      <small>{dayLabel(site, today)}{placeOf(site) ? ` · ${placeOf(site)}` : ''}{c.pic[0] ? ` · PIC ${shortName(c.pic[0])}` : ''}</small>
                    </div>
                    {c.all.length
                      ? <span className="faces sm">{c.all.map(m => <Avatar key={m.id} m={m} size={28} />)}</span>
                      : <span className="nocrew">No crew</span>}
                  </Link>
                )
              })}
            </div>
          </section>

          {/* my next job */}
          <section className="db-tile c t-violet">
            <div className="glow" />
            <h4>🎯 Your next job</h4>
            {myToday?.kind === 'site' && <p className="now">Today: {myToday.jobs.map(j => j.site.site_name).join(' + ')}</p>}
            {myNext ? <>
              <div className="next">{myNext.st.jobs.map(j => j.site.site_name).join(' + ')}</div>
              <p>
                {myNext.d === addDays(today, 1) ? 'Tomorrow' : fmt(myNext.d)}
                {myNext.st.jobs.some(j => j.role === 'PIC') ? ' · you are PIC' : ''}
              </p>
            </> : <p>{memberId ? 'Nothing booked yet' : 'Link your account to a team member to see your jobs'}</p>}
          </section>

          {/* reports */}
          <Link to="/reports" className="db-tile c t-amber">
            <div className="glow" />
            <h4>📝 Reports open</h4>
            <div className="big">{reportsOpen}</div>
            <p>{monthDone} of {monthSites.length} sites this month completed</p>
          </Link>

          {/* this week */}
          <section className="db-tile dark w2">
            <h4>📊 This week · people on site</h4>
            <div className="bars">
              {week.map((d, i) => (
                <div key={d} className={d === today ? 'today' : ''}>
                  <b>{loads[i] || ''}</b>
                  <i style={{ height: `${loads[i] / maxLoad * 80}%` }} />
                  <span>{fmt(d, { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
          </section>

          {/* leave */}
          <section className="db-tile c w2 t-pink">
            <div className="glow" />
            <h4>🌴 Team leave · next 30 days</h4>
            <div className="big">{leaveSoon.length}<small>{leaveSoon.some(l => l.start_date <= today) ? 'someone out now' : 'booked'}</small></div>
            <div className="list">
              {leaveSoon.length === 0 && <p>Nobody on leave in the next 30 days 🎉</p>}
              {leaveSoon.map((l, i) => {
                const m = memberById[l.member_id]
                const end = l.end_date || l.start_date
                const n = leaveDays(l)
                const inDays = daysBetween(today, l.start_date)
                const now = l.start_date <= today
                return (
                  <div key={`${l.member_id}-${l.start_date}-${i}`} className="li">
                    <Avatar m={m} size={32} />
                    <div className="grow">
                      <b>{shortName(m)}</b>
                      <small>
                        {titleCase(l.leave_type)} · {l.start_date === end ? fmt(l.start_date) : `${short(l.start_date)} – ${short(end)}`} · {n} day{n === 1 ? '' : 's'}
                        {l.leave_session === 'AM_ONLY' ? ' (AM)' : l.leave_session === 'PM_ONLY' ? ' (PM)' : ''}
                      </small>
                    </div>
                    <span className="lt">{leaveAbbr(l.leave_type)}</span>
                    <span className={`lw${now ? ' now' : ''}`}>{now ? 'On leave now' : inDays === 1 ? 'Tomorrow' : `in ${inDays} days`}</span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
