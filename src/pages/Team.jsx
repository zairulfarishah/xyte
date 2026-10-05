import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { fetchTeamLeaves, getMemberLeaveOnDate, isOffDay } from '../utils/teamLeaves'
import { publicHolidayName } from '../utils/holidays'
import {
  assignmentMemberId, assignmentsForDate, getSiteDates, isPic, memberDatesOnSite, memberRoleOnSite, siteMemberIds,
} from '../utils/siteDays'
import { buildWhatsAppUrl } from '../utils/whatsapp'
import './Team.css'

const VIEWS = [
  { key: 'roster',  label: 'Roster' },
  { key: 'week',    label: 'Week Board' },
  { key: 'where',   label: "Where's Everyone" },
  { key: 'ranking', label: 'Leaderboard' },
]
const AVATAR_COLORS = ['#2563eb', '#db2777', '#7c3aed', '#059669', '#d97706', '#0891b2', '#dc2626', '#65a30d']
const SITE_COLORS   = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#65a30d', '#9333ea', '#ea580c']
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const OPEN_REPORT = ['pending', 'in_progress', 'submitted']
const INACTIVE_SITE = ['cancelled', 'postponed']
const NEW_MEMBER_DAYS = 45

// ── dates (local, YYYY-MM-DD) ──
const isoOf = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const addDays = (dateStr, n) => { const d = new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d) }
const mondayOf = dateStr => { const d = new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d) }
const dayNum = dateStr => Number(dateStr.slice(8, 10))
const fmtDay = (dateStr, opts = { day: 'numeric', month: 'short' }) => new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-MY', opts)
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
const loadColor = pct => pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#059669'

const shortOf = m => m.short_name || m.full_name?.split(' ')[0] || '?'
const initialsOf = m => (m.full_name || '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()

function Avatar({ m, size = 40, onUpload = null }) {
  return (
    <div
      className={`tm-av${onUpload ? ' can-upload' : ''}`}
      onClick={onUpload ? e => { e.stopPropagation(); onUpload() } : undefined}
      title={onUpload ? 'Change photo' : undefined}
      style={{ width: size, height: size, fontSize: size * 0.36, background: m.color }}
    >
      {m.avatar_url ? <img src={m.avatar_url} alt="" /> : initialsOf(m)}
    </div>
  )
}

function Tags({ m }) {
  return <>
    {m.isLead && <span className="tm-tag lead">Lead</span>}
    {m.isNew && <span className="tm-tag new">New</span>}
  </>
}

export default function Team() {
  const { isZairul } = useAuth()
  const [params, setParams] = useSearchParams()
  const view = VIEWS.some(v => v.key === params.get('view')) ? params.get('view') : 'roster'
  const setView = key => setParams(key === 'roster' ? {} : { view: key }, { replace: true })

  const [rawMembers, setRawMembers] = useState([])
  const [sites, setSites]           = useState([])
  const [leaves, setLeaves]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [openId, setOpenId]         = useState(null)

  const today = isoOf(new Date())
  const thisWeek = mondayOf(today)
  const [weekStart, setWeekStart] = useState(thisWeek)

  async function fetchAll() {
    const [{ data: memberData }, { data: siteData }, leaveData] = await Promise.all([
      supabase.from('team_members').select('*').order('full_name'),
      supabase
        .from('sites')
        .select('id, site_name, location, scheduled_date, end_date, site_status, report_status, site_type, site_session, site_assignments(member_id, assignment_role, work_date)')
        .order('scheduled_date', { ascending: true }),
      fetchTeamLeaves().catch(() => []),
    ])
    setRawMembers(memberData || [])
    setSites(siteData || [])
    setLeaves(leaveData || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    const refresh = () => fetchAll()
    window.addEventListener('xyte:leaves-updated', refresh)
    window.addEventListener('xyte:site-saved', refresh)
    return () => {
      window.removeEventListener('xyte:leaves-updated', refresh)
      window.removeEventListener('xyte:site-saved', refresh)
    }
  }, [])

  // memberId|date → [{ site, role }]
  const jobIndex = useMemo(() => {
    const index = new Map()
    for (const site of sites) {
      if (INACTIVE_SITE.includes(String(site.site_status || '').toLowerCase())) continue
      for (const id of siteMemberIds(site)) {
        for (const date of memberDatesOnSite(site, id)) {
          const role = assignmentsForDate(site.site_assignments, date).some(a => assignmentMemberId(a) === id && isPic(a)) ? 'PIC' : 'crew'
          const key = `${id}|${date}`
          if (!index.has(key)) index.set(key, [])
          index.get(key).push({ site, role })
        }
      }
    }
    return index
  }, [sites])

  // What a member is doing on a date: on site, on leave, rostered off, holiday, store (Sat) or available.
  function dayStatus(memberId, date) {
    const jobs = jobIndex.get(`${memberId}|${date}`)
    if (jobs?.length) return { kind: 'site', jobs }
    const leave = getMemberLeaveOnDate(leaves, memberId, date)
    if (leave) return isOffDay(leave) ? { kind: 'off', label: 'Off' } : { kind: 'leave', label: titleCase(leave.leave_type) }
    const dow = new Date(`${date}T00:00:00`).getDay()
    if (dow === 0) return { kind: 'off', label: 'Off' }
    const holiday = publicHolidayName(date)
    if (holiday) return { kind: 'holiday', label: holiday }
    if (dow === 6) return { kind: 'store', label: 'Store' }
    return { kind: 'free', label: 'Available' }
  }

  const weekDates     = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const thisWeekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(thisWeek, i)), [thisWeek])

  // Distinct colours for the sites on screen, in date order
  const siteColor = useMemo(() => {
    const first = thisWeekDates[0] < weekDates[0] ? thisWeekDates[0] : weekDates[0]
    const last  = thisWeekDates[6] > weekDates[6] ? thisWeekDates[6] : weekDates[6]
    const map = new Map()
    sites
      .filter(s => !INACTIVE_SITE.includes(String(s.site_status || '').toLowerCase()))
      .filter(s => getSiteDates(s).some(d => d >= first && d <= last))
      .forEach((s, i) => map.set(s.id, SITE_COLORS[i % SITE_COLORS.length]))
    return id => map.get(id) || '#64748b'
  }, [sites, thisWeekDates, weekDates])

  function weekLoad(memberId, dates) {
    let work = 0, onSite = 0
    dates.slice(0, 5).forEach(d => {
      const s = dayStatus(memberId, d)
      if (s.kind === 'site') { work++; onSite++ }
      else if (s.kind === 'free') work++
    })
    return { onSite, work, pct: work ? Math.round(onSite / work * 100) : 0 }
  }

  const members = useMemo(() => {
    const year = today.slice(0, 4)
    const newSince = addDays(today, -NEW_MEMBER_DAYS)
    const yearSites = sites.filter(s => String(s.scheduled_date || '').startsWith(year) && !INACTIVE_SITE.includes(String(s.site_status || '').toLowerCase()))
    return rawMembers
      .map((m, i) => {
        const mine = yearSites.filter(s => siteMemberIds(s).includes(m.id))
        const picSites = mine.filter(s => memberRoleOnSite(s, m.id) === 'PIC')
        return {
          ...m,
          color: AVATAR_COLORS[i % AVATAR_COLORS.length],
          isLead: /lead/i.test(m.role || ''),
          isNew: !!m.created_at && m.created_at.slice(0, 10) >= newSince,
          sites: mine.length,
          pic: picSites.length,
          scans: mine.filter(s => s.site_type === 'site_scanning').length,
          open: picSites.filter(s => s.site_type === 'site_scanning' && OPEN_REPORT.includes(String(s.report_status || '').toLowerCase())).length,
        }
      })
      .sort((a, b) => (b.isLead - a.isLead) || (b.sites - a.sites) || a.full_name.localeCompare(b.full_name))
  }, [rawMembers, sites, today])

  // ── avatar upload (admin) ──
  const avatarInput = useRef(null)
  const uploadFor = useRef(null)
  const startUpload = isZairul ? id => { uploadFor.current = id; avatarInput.current?.click() } : null
  async function handleAvatar(e) {
    const file = e.target.files?.[0]
    const memberId = uploadFor.current
    e.target.value = ''
    if (!file || !memberId) return
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return }
    // Unique filename per upload avoids the CDN serving the cached old file
    const fileName = `${memberId}_${Date.now()}.${file.name.split('.').pop()}`
    const { error: upErr } = await supabase.storage.from('team-avatars').upload(fileName, file)
    if (upErr) { alert('Failed to upload photo: ' + upErr.message); return }
    const avatarUrl = supabase.storage.from('team-avatars').getPublicUrl(fileName).data?.publicUrl
    const { error } = await supabase.from('team_members').update({ avatar_url: avatarUrl }).eq('id', memberId)
    if (error) { alert('Failed to save photo: ' + error.message); return }
    setRawMembers(prev => prev.map(m => m.id === memberId ? { ...m, avatar_url: avatarUrl } : m))
  }

  async function saveField(memberId, field, value) {
    const clean = value.trim() || null
    const { error } = await supabase.from('team_members').update({ [field]: clean }).eq('id', memberId)
    if (error) { alert('Failed to save: ' + error.message); return false }
    setRawMembers(prev => prev.map(m => m.id === memberId ? { ...m, [field]: clean } : m))
    return true
  }

  if (loading) return (
    <div className="tm" style={{ display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 14, fontWeight: 600 }}>
        <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
        Loading team…
      </div>
    </div>
  )

  const ctx = { members, today, thisWeekDates, weekDates, dayStatus, weekLoad, siteColor, open: setOpenId, startUpload }
  const weekNav = (
    <div className="tm-seg">
      <button onClick={() => setWeekStart(addDays(weekStart, -7))}>‹ Prev</button>
      <button className={weekStart === thisWeek ? 'on' : ''} onClick={() => setWeekStart(thisWeek)}>This week</button>
      <button onClick={() => setWeekStart(addDays(weekStart, 7))}>Next ›</button>
    </div>
  )
  const selected = members.find(m => m.id === openId)

  return (
    <div className="tm">
      <div className="tm-wrap">
        <div className="tm-top">
          <div>
            <h1>Team</h1>
            <p>{fmtDay(today, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })} · {members.length} members</p>
          </div>
          <div className="tm-tabs" role="tablist">
            {VIEWS.map(v => (
              <button key={v.key} role="tab" aria-selected={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>{v.label}</button>
            ))}
          </div>
        </div>

        {view === 'roster'  && <RosterView {...ctx} />}
        {view === 'week'    && <WeekBoard {...ctx} weekNav={weekNav} />}
        {view === 'where'   && <WhereView {...ctx} weekNav={weekNav} />}
        {view === 'ranking' && <Leaderboard {...ctx} />}
      </div>

      {selected && (
        <ProfileDrawer
          m={selected}
          {...ctx}
          sites={sites}
          leaves={leaves}
          isAdmin={isZairul}
          saveField={saveField}
          onClose={() => setOpenId(null)}
        />
      )}
      <input ref={avatarInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatar} />
    </div>
  )
}

// ── small shared renderers ──
function statusTone(status, siteColor) {
  if (status.kind === 'site') { const c = siteColor(status.jobs[0].site.id); return { c, bg: `${c}14` } }
  if (status.kind === 'leave') return { c: '#991b1b', bg: '#fef2f2' }
  if (status.kind === 'holiday') return { c: '#b45309', bg: '#fffbeb' }
  return { c: '#475569', bg: '#f1f5f9' }
}
const statusText = s => s.kind === 'site' ? s.jobs.map(j => j.site.site_name).join(' + ') : s.label
const isPicOn = s => s.kind === 'site' && s.jobs.some(j => j.role === 'PIC')
const dotStyle = (s, siteColor) =>
  s.kind === 'site' ? { background: siteColor(s.jobs[0].site.id) }
    : s.kind === 'store' ? { background: '#94a3b8' }
    : s.kind === 'leave' ? { background: '#fca5a5' }
    : {}

function WeekStrip({ m, dates, today, dayStatus, siteColor }) {
  return (
    <div className="tm-wk">
      {dates.map((d, i) => (
        <div key={d} className={d === today ? 'today' : ''} title={`${DAY_NAMES[i]} ${fmtDay(d)} · ${statusText(dayStatus(m.id, d))}`}>
          {DAY_NAMES[i][0]}<span style={dotStyle(dayStatus(m.id, d), siteColor)} />
        </div>
      ))}
    </div>
  )
}

function nextJobLabel(m, today, dayStatus) {
  const now = dayStatus(m.id, today)
  const nowIds = now.kind === 'site' ? now.jobs.map(j => j.site.id).join() : ''
  for (let i = 1; i <= 14; i++) {
    const d = addDays(today, i)
    const s = dayStatus(m.id, d)
    if (s.kind === 'site' && s.jobs.map(j => j.site.id).join() !== nowIds) {
      return `${fmtDay(d, { weekday: 'short' })} ${dayNum(d)} · ${statusText(s)}${isPicOn(s) ? ' (PIC)' : ''}`
    }
  }
  return 'Nothing booked in the next 2 weeks'
}

// ── 1. Roster ──
function RosterView({ members, today, thisWeekDates, dayStatus, weekLoad, siteColor, open, startUpload }) {
  const todays = members.map(m => dayStatus(m.id, today))
  const onSite = todays.filter(s => s.kind === 'site').length
  const locations = new Set(todays.filter(s => s.kind === 'site').flatMap(s => s.jobs.map(j => j.site.id))).size
  const openReports = members.reduce((a, m) => a + m.open, 0)
  return <>
    <div className="tm-bar"><div><h2>Everyone at a glance</h2><p>Tap a card for the full profile and schedule</p></div></div>
    <div className="tm-roster">
      {members.map((m, i) => {
        const s = todays[i]
        const tone = statusTone(s, siteColor)
        const load = weekLoad(m.id, thisWeekDates)
        return (
          <button key={m.id} className="tm-card tm-rc" onClick={() => open(m.id)}>
            <div className="tm-rc-top">
              <Avatar m={m} size={52} onUpload={startUpload && (() => startUpload(m.id))} />
              <div><div className="tm-rc-name">{m.full_name}</div><div className="tm-rc-role">{m.role || 'Member'} <Tags m={m} /></div></div>
            </div>
            <div className="tm-rc-today" style={{ background: tone.bg, color: tone.c }}>
              <small>Today</small><b>{statusText(s)}</b>{isPicOn(s) && <> <span className="tm-tag pic">PIC</span></>}
            </div>
            <div>
              <WeekStrip m={m} dates={thisWeekDates} today={today} dayStatus={dayStatus} siteColor={siteColor} />
              <div className="tm-rc-load"><span>This week</span><b style={{ color: loadColor(load.pct) }}>{load.onSite}/{load.work} days on site</b></div>
              <div className="tm-progress"><i style={{ width: `${Math.min(load.pct, 100)}%`, background: loadColor(load.pct) }} /></div>
            </div>
            <div className="tm-rc-stats">
              <div><b>{m.sites}</b><small>Sites</small></div>
              <div><b>{m.pic}</b><small>As PIC</small></div>
              <div><b style={{ color: m.open ? 'var(--amber)' : undefined }}>{m.open}</b><small>Open rpt</small></div>
            </div>
            <div className="tm-rc-next">Next: <b>{nextJobLabel(m, today, dayStatus)}</b></div>
          </button>
        )
      })}
      <div className="tm-card tm-rc summary">
        <div>
          <div className="tm-eyebrow">Today</div>
          <div className="big">{onSite}/{members.length}</div>
          <p>on site across {locations} location{locations === 1 ? '' : 's'}</p>
        </div>
        <p>{openReports} report{openReports === 1 ? '' : 's'} still open{members.some(m => m.isNew) ? ` · ${members.filter(m => m.isNew).length} new member${members.filter(m => m.isNew).length === 1 ? '' : 's'}` : ''}</p>
      </div>
    </div>
  </>
}

// ── 2. Week board ──
function WeekBoard({ members, today, weekDates, dayStatus, weekLoad, siteColor, open, weekNav }) {
  const shownSites = new Map()
  const cell = s => {
    if (s.kind === 'site') return s.jobs.map(j => {
      const c = siteColor(j.site.id)
      shownSites.set(j.site.id, j.site)
      return (
        <Link key={j.site.id} to={`/sites/${j.site.id}`} className="tm-slot" style={{ background: `${c}14`, borderLeftColor: c, color: c }}>
          {j.role === 'PIC' ? '★ ' : ''}{j.site.site_name}<small>{j.site.location}</small>
        </Link>
      )
    })
    if (s.kind === 'off') return null
    return <div className={`tm-slot ${s.kind === 'leave' || s.kind === 'holiday' ? 'leave' : 'plain'}`}>{s.label}</div>
  }
  return <>
    <div className="tm-bar">
      <div><h2>Week board</h2><p>{fmtDay(weekDates[0])} – {fmtDay(weekDates[6], { day: 'numeric', month: 'short', year: 'numeric' })} · ★ = PIC</p></div>
      {weekNav}
    </div>
    <div className="tm-card tm-board">
      <table>
        <thead><tr>
          <th>Member</th>
          {weekDates.map((d, i) => (
            <th key={d} className={d === today ? 'today' : ''}>{DAY_NAMES[i]}<span className="n">{dayNum(d)}</span>{publicHolidayName(d) && <span className="hol">{publicHolidayName(d)}</span>}</th>
          ))}
        </tr></thead>
        <tbody>
          {members.map(m => {
            const load = weekLoad(m.id, weekDates)
            return (
              <tr key={m.id}>
                <td><button className="tm-who" onClick={() => open(m.id)}><Avatar m={m} size={36} /><div><b>{shortOf(m)} <Tags m={m} /></b><small>{load.onSite}/{load.work} days on site</small></div></button></td>
                {weekDates.map((d, i) => <td key={d} className={`${d === today ? 'today' : ''} ${i >= 5 ? 'wkend' : ''}`}>{cell(dayStatus(m.id, d))}</td>)}
              </tr>
            )
          })}
        </tbody>
        <tfoot><tr>
          <td>On site</td>
          {weekDates.map(d => <td key={d}>{members.filter(m => dayStatus(m.id, d).kind === 'site').length} / {members.length}</td>)}
        </tr></tfoot>
      </table>
    </div>
    <div className="tm-legend">
      {[...shownSites.values()].map(s => <span key={s.id}><i className="tm-dot" style={{ background: siteColor(s.id) }} />{s.site_name}</span>)}
      <span>★ PIC</span>
    </div>
  </>
}

// ── 3. Where's everyone ──
function WhereView({ members, today, weekDates, dayStatus, weekLoad, siteColor, open, weekNav }) {
  const [picked, setPicked] = useState(null)
  const date = picked && weekDates.includes(picked) ? picked : weekDates.includes(today) ? today : weekDates[0]
  const nextDate = addDays(date, new Date(`${date}T00:00:00`).getDay() === 6 ? 2 : 1)

  const groupFor = d => {
    const bySite = new Map(), other = {}
    members.forEach(m => {
      const s = dayStatus(m.id, d)
      if (s.kind === 'site') s.jobs.forEach(j => {
        if (!bySite.has(j.site.id)) bySite.set(j.site.id, { site: j.site, people: [] })
        bySite.get(j.site.id).people.push({ m, role: j.role })
      })
      else (other[s.label] ||= []).push(m)
    })
    return { sites: [...bySite.values()].sort((a, b) => b.people.length - a.people.length), other }
  }
  const { sites: groups, other } = groupFor(date)
  const next = groupFor(nextDate).sites

  return <>
    <div className="tm-bar">
      <div><h2>Where's everyone</h2><p>{date === today ? 'Today · ' : ''}{fmtDay(date, { weekday: 'long', day: 'numeric', month: 'short' })}</p></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="tm-seg">
          {weekDates.slice(0, 6).map((d, i) => <button key={d} className={d === date ? 'on' : ''} onClick={() => setPicked(d)}>{d === today ? 'Today' : `${DAY_NAMES[i]} ${dayNum(d)}`}</button>)}
        </div>
        {weekNav}
      </div>
    </div>
    <div className="tm-where">
      <div>
        {groups.length === 0 && <div className="tm-card tm-empty">No site work on this day.</div>}
        {groups.map(({ site, people }) => {
          const c = siteColor(site.id)
          people.sort((a, b) => (b.role === 'PIC') - (a.role === 'PIC'))
          return (
            <div key={site.id} className="tm-card tm-loc" style={{ borderTop: `4px solid ${c}` }}>
              <div className="tm-loc-head">
                <div>
                  <h3><span className="tm-dot" style={{ background: c, width: 10, height: 10 }} /><Link to={`/sites/${site.id}`}>{site.site_name}</Link></h3>
                  <p>{site.location}{site.site_session ? ` · ${site.site_session}` : ''}</p>
                </div>
                <span className="tm-chip" style={{ background: `${c}14`, color: c }}>{people.length} on site</span>
              </div>
              <div className="tm-people">
                {people.map(({ m, role }) => (
                  <button key={m.id} className="tm-person" onClick={() => open(m.id)}>
                    <Avatar m={m} size={34} /><div><b>{shortOf(m)}</b><small>{role === 'PIC' ? 'PIC' : 'Crew'}</small></div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="tm-side">
        <div className="tm-card">
          <h4>Not on site</h4>
          {Object.keys(other).length === 0
            ? <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Everyone is out on site.</p>
            : Object.entries(other).map(([label, ppl]) => (
              <div key={label} className="tm-side-row">
                <span>{label}</span>
                <div className="tm-stack">{ppl.map(m => <span key={m.id} onClick={() => open(m.id)} style={{ cursor: 'pointer' }} title={m.full_name}><Avatar m={m} size={30} /></span>)}</div>
              </div>
            ))}
        </div>
        <div className="tm-card">
          <h4>{fmtDay(nextDate, { weekday: 'short', day: 'numeric', month: 'short' })}</h4>
          {next.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>No site work.</p>}
          {next.map(({ site, people }) => (
            <div key={site.id} className="tm-side-row" style={{ alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><i className="tm-dot" style={{ background: siteColor(site.id) }} />{site.site_name}</span>
              <div className="tm-stack">{people.map(({ m }) => <Avatar key={m.id} m={m} size={26} />)}</div>
            </div>
          ))}
        </div>
        <div className="tm-card">
          <h4>This week</h4>
          {members.map(m => {
            const load = weekLoad(m.id, weekDates)
            return (
              <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                <Avatar m={m} size={24} />
                <span style={{ fontSize: 12, fontWeight: 600, width: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortOf(m)}</span>
                <div className="tm-progress" style={{ flex: 1 }}><i style={{ width: `${Math.min(load.pct, 100)}%`, background: loadColor(load.pct) }} /></div>
                <span style={{ fontSize: 12, color: 'var(--muted)', width: 30, textAlign: 'right' }}>{load.onSite}/{load.work}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  </>
}

// ── 4. Leaderboard ──
function Leaderboard({ members, today, thisWeekDates, dayStatus, weekLoad, siteColor, open }) {
  const [sort, setSort] = useState({ key: 'sites', dir: -1 })
  const rows = members
    .map(m => { const w = weekLoad(m.id, thisWeekDates); return { ...m, load: w.onSite, week: w } })
    .sort((a, b) => {
      const x = a[sort.key], y = b[sort.key]
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir || a.full_name.localeCompare(b.full_name)
    })
  const best = key => [...members].sort((a, b) => b[key] - a[key])[0]
  const podium = [['Most sites', 'sites', 'sites'], ['Most PIC', 'pic', 'as PIC'], ['Most scans', 'scans', 'scans']]
  const cols = [['#'], ['Member', 'full_name'], ['Sites', 'sites'], ['As PIC', 'pic'], ['Scans', 'scans'], ['Open reports', 'open'], ['This week', 'load'], ['Mon – Sun']]
  const clickSort = key => setSort(s => ({ key, dir: s.key === key ? -s.dir : key === 'full_name' ? 1 : -1 }))

  return <>
    <div className="tm-bar"><div><h2>Leaderboard</h2><p>Year to date · {today.slice(0, 4)} · click a column to sort</p></div></div>
    {members.length > 0 && (
      <div className="tm-podium">
        {podium.map(([title, key, unit]) => { const m = best(key); return (
          <button key={key} className="tm-card tm-pod" onClick={() => open(m.id)} style={{ textAlign: 'left' }}>
            <Avatar m={m} size={44} /><div><span className="medal">{title}</span><b>{shortOf(m)}</b><small>{m[key]} {unit}</small></div>
          </button>
        ) })}
      </div>
    )}
    <div className="tm-card tm-lb">
      <table>
        <thead><tr>
          {cols.map(([label, key]) => (
            <th key={label} className={`${key ? 's' : ''} ${key === sort.key ? 'sorted' : ''}`} onClick={key ? () => clickSort(key) : undefined}>
              {label}{key === sort.key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={m.id} onClick={() => open(m.id)}>
              <td className="rank">{i + 1}</td>
              <td><div className="tm-who" style={{ minWidth: 0 }}><Avatar m={m} size={34} /><div><b>{m.full_name}</b><small>{m.role || 'Member'} <Tags m={m} /></small></div></div></td>
              <td className="num">{m.sites}</td>
              <td className="num">{m.pic}</td>
              <td className="num">{m.scans}</td>
              <td className="num" style={{ color: m.open ? 'var(--amber)' : 'var(--faint)' }}>{m.open || '—'}</td>
              <td><div className="tm-wbar"><div className="tm-progress"><i style={{ width: `${Math.min(m.week.pct, 100)}%`, background: loadColor(m.week.pct) }} /></div><span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{m.week.onSite}/{m.week.work} days</span></div></td>
              <td><div className="tm-minidots">{thisWeekDates.map(d => <i key={d} title={`${fmtDay(d)} · ${statusText(dayStatus(m.id, d))}`} style={dotStyle(dayStatus(m.id, d), siteColor)} />)}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
}

// ── profile drawer ──
function EditableField({ label, value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  if (!editing) return (
    <div className="tm-dl-row">
      <span className="d">{label}</span><span style={{ flex: 1 }}>{value || <small>Not set</small>}</span>
      <button className="tm-btn ghost" onClick={() => { setDraft(value || ''); setEditing(true) }}>Edit</button>
    </div>
  )
  return (
    <div className="tm-dl-row">
      <span className="d">{label}</span>
      <div className="tm-field" style={{ flex: 1 }}>
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Escape' && setEditing(false)} />
        <button className="tm-btn" disabled={saving} onClick={async () => { setSaving(true); if (await onSave(draft)) setEditing(false); setSaving(false) }}>{saving ? '…' : 'Save'}</button>
      </div>
    </div>
  )
}

function ProfileDrawer({ m, today, thisWeekDates, dayStatus, siteColor, startUpload, sites, leaves, isAdmin, saveField, onClose }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const upcoming = sites
    .filter(s => !INACTIVE_SITE.includes(String(s.site_status || '').toLowerCase()) && siteMemberIds(s).includes(m.id))
    .map(s => ({ s, dates: memberDatesOnSite(s, m.id).filter(d => d > thisWeekDates[6]) }))
    .filter(x => x.dates.length)
    .sort((a, b) => a.dates[0].localeCompare(b.dates[0]))
    .slice(0, 5)
  const nextLeave = leaves
    .filter(l => l.member_id === m.id && !isOffDay(l) && (l.end_date || l.start_date) >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  const waUrl = m.phone ? buildWhatsAppUrl(m.phone) : null

  return <>
    <div className="tm-drawer-bg" onClick={onClose} />
    <aside className="tm-drawer" role="dialog" aria-label={m.full_name}>
      <button className="x" onClick={onClose} aria-label="Close">×</button>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', paddingRight: 36 }}>
        <Avatar m={m} size={64} onUpload={startUpload && (() => startUpload(m.id))} />
        <div><h2>{m.full_name}</h2><div className="tm-rc-role">{m.role || 'Member'} <Tags m={m} /></div></div>
      </div>
      {nextLeave && (
        <div className="tm-dl-row" style={{ marginTop: 16, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}>
          <span className="tm-tag leave">Leave</span>
          {titleCase(nextLeave.leave_type)} · {fmtDay(nextLeave.start_date)}{nextLeave.end_date && nextLeave.end_date !== nextLeave.start_date ? ` – ${fmtDay(nextLeave.end_date)}` : ''}
        </div>
      )}
      <div className="tm-kpis">
        <div className="tm-card tm-kpi"><div className="v">{m.sites}</div><div className="l">Sites {today.slice(0, 4)}</div></div>
        <div className="tm-card tm-kpi"><div className="v">{m.pic}</div><div className="l">As PIC</div></div>
        <div className="tm-card tm-kpi"><div className="v" style={{ color: m.open ? 'var(--amber)' : undefined }}>{m.open}</div><div className="l">Open reports</div></div>
      </div>

      <h3>This week</h3>
      <div className="tm-dl">
        {thisWeekDates.map((d, i) => {
          const s = dayStatus(m.id, d)
          return (
            <div key={d} className={`tm-dl-row${d === today ? ' today' : ''}`}>
              <span className="d">{DAY_NAMES[i]} {dayNum(d)}</span>
              <span className="tm-dot" style={{ background: dotStyle(s, siteColor).background || '#cbd5e1' }} />
              <span style={{ flex: 1 }}>
                {s.kind === 'site'
                  ? s.jobs.map(j => <div key={j.site.id}><Link to={`/sites/${j.site.id}`} style={{ color: 'inherit', fontWeight: 700 }}>{j.site.site_name}</Link><br /><small>{j.site.location}</small></div>)
                  : <b>{s.label}</b>}
              </span>
              {isPicOn(s) && <span className="tm-tag pic">PIC</span>}
            </div>
          )
        })}
      </div>

      {upcoming.length > 0 && <>
        <h3>Coming up</h3>
        <div className="tm-dl">
          {upcoming.map(({ s, dates }) => (
            <Link key={s.id} to={`/sites/${s.id}`} className="tm-dl-row">
              <span className="d">{fmtDay(dates[0])}{dates.length > 1 ? ` +${dates.length - 1}` : ''}</span>
              <span style={{ flex: 1 }}><b>{s.site_name}</b><br /><small>{s.location}</small></span>
              {memberRoleOnSite(s, m.id) === 'PIC' && <span className="tm-tag pic">PIC</span>}
            </Link>
          ))}
        </div>
      </>}

      {m.phone && <>
        <h3>Contact</h3>
        <div className="tm-actions">
          {waUrl && <a className="tm-btn" href={waUrl} target="_blank" rel="noopener noreferrer">WhatsApp {shortOf(m)}</a>}
          <a className="tm-btn ghost" href={`tel:+${String(m.phone).replace(/\D/g, '')}`}>Call</a>
        </div>
      </>}

      {isAdmin && <>
        <h3>Admin</h3>
        <div className="tm-dl">
          <EditableField key={`legal-${m.id}`} label="Legal name" value={m.legal_name} onSave={v => saveField(m.id, 'legal_name', v)} />
          <EditableField key={`ic-${m.id}`} label="IC number" value={m.ic_number} onSave={v => saveField(m.id, 'ic_number', v)} />
        </div>
      </>}
    </aside>
  </>
}
