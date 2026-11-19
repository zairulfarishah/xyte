import { isActiveMember } from '../utils/members'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useViewport } from '../utils/useViewport'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Play, Plus, Search, Square, X, Zap } from 'lucide-react'
import { fetchTeamLeaves, getMemberLeaveOnDate, getLeaveSessionLabel, isOffDay } from '../utils/teamLeaves'
import { normalizeDate, getSiteDates, assignmentsForDate, assignmentMemberId } from '../utils/siteDays'
import { calcTimecard, hasOverlap, dayInfo, formatMinutes, formatTime12, monthDates, isMissingDay, toMinutes, HIGHLIGHTS, highlightHex, leaveHighlight } from '../utils/timecard'
import { OUTSTATION_HIGHLIGHT } from '../utils/outstation'
import './MyTimecard.css'

const EMPTY_SLOT = { time_in: '', time_out: '', site_id: '' }

const SLOT_MINUTES = 30

function minutesToHHMM(mins) {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Now, rounded to the nearest half hour — what Clock in / Clock out key in.
function roundedNow() {
  const n = new Date()
  return minutesToHHMM(Math.round((n.getHours() * 60 + n.getMinutes()) / SLOT_MINUTES) * SLOT_MINUTES)
}

// "1730", "17:30", "5.30p", "5:30 pm", "7am", "8" -> "HH:MM" (nearest half hour), or null.
function parseTypedTime(text) {
  const match = String(text).trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{1,2})(?:[:.]?(\d{2}))?(a|am|p|pm)?$/)
  if (!match) return null
  let h = Number(match[1])
  const m = Number(match[2] || 0)
  const ampm = match[3]
  if (ampm) {
    if (h < 1 || h > 12) return null
    if (h === 12) h = 0
    if (ampm[0] === 'p') h += 12
  }
  if (h > 23 || m > 59) return null
  return minutesToHHMM(Math.round((h * 60 + m) / SLOT_MINUTES) * SLOT_MINUTES)
}

// "8:00 AM" -> "8 AM", for the short office-hours label on the Normal day button
const shortTime = mins => formatTime12(minutesToHHMM(mins)).replace(':00', '')

// Postgres returns time as "HH:MM:SS"; the time pickers use "HH:MM".
function hhmm(t) {
  return t ? String(t).slice(0, 5) : ''
}

function without(obj, key) {
  const next = { ...obj }
  delete next[key]
  return next
}

function titleCase(s) {
  return (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// Slots of a saved row. Rows saved before slots existed only have the
// time_in / time_out / site_id columns.
function savedSlots(row) {
  const slots = Array.isArray(row.segments) && row.segments.length > 0
    ? row.segments
    : (row.time_in || row.time_out) ? [{ time_in: row.time_in, time_out: row.time_out, site_id: row.site_id }] : []
  return slots.map(s => ({ time_in: hhmm(s.time_in), time_out: hhmm(s.time_out), site_id: s.site_id || '' }))
}

const slotHasTime = s => s.time_in || s.time_out

// Teammates who logged the same site on the same day with a different time in / out.
// Only compares times both sides have keyed in (someone still on site has no time out yet).
// Returns [{ slot, siteId, mine, others: [{ memberId, time_in, time_out }] }]
function teamTimeMismatches(segments, teamRows) {
  const out = []
  segments.forEach((mine, slot) => {
    if (!mine.site_id || !slotHasTime(mine)) return
    const others = []
    for (const row of teamRows) {
      const theirs = savedSlots(row).filter(t => t.site_id === mine.site_id && slotHasTime(t))
      if (!theirs.length) continue
      // Two visits to the same site in a day: compare with the closest one
      const t = theirs.reduce((best, x) => Math.abs((toMinutes(x.time_in) ?? 0) - (toMinutes(mine.time_in) ?? 0)) < Math.abs((toMinutes(best.time_in) ?? 0) - (toMinutes(mine.time_in) ?? 0)) ? x : best)
      const inDiff = mine.time_in && t.time_in && mine.time_in !== t.time_in
      const outDiff = mine.time_out && t.time_out && mine.time_out !== t.time_out
      if (inDiff || outDiff) others.push({ memberId: row.member_id, time_in: t.time_in, time_out: t.time_out })
    }
    if (others.length) out.push({ slot, siteId: mine.site_id, mine, others })
  })
  return out
}

const isFullLeave = leave => leave?.leave_session === 'FULL_DAY'

function saveErrorText(err) {
  return /segments/.test(err.message)
    ? 'The timecards table needs updating — run sql/migrate-timecard-segments.sql in the Supabase SQL editor.'
    : /highlight/.test(err.message)
      ? 'Highlights need a database update — run sql/migrate-timecard-highlight.sql in the Supabase SQL editor.'
      : err.message
}

// Office hours of a working day as one slot ("Normal day").
function officeSlot(date, site_id) {
  const win = dayInfo(date).window
  return { time_in: minutesToHHMM(win.start), time_out: minutesToHHMM(win.end), site_id: site_id || '' }
}

// month and viewId live in Schedule so the Team view can open a member's timecard.
export default function MyTimecard({ month, setMonth, viewId, setViewId }) {
  const { memberId, isZairul } = useAuth()
  const { isMobile } = useViewport()

  const [members, setMembers] = useState([])
  const [cards, setCards]     = useState({})          // work_date -> saved row
  const [drafts, setDrafts]   = useState({})          // work_date -> unsaved { segments, remarks }
  const [leaves, setLeaves]   = useState([])
  const [sites, setSites]     = useState([])
  const [loadedKey, setLoadedKey] = useState(null)    // member|month the cards belong to
  const [teamCards, setTeamCards] = useState([])      // teammates' rows this month, for the same-site time check
  const [timePrompt, setTimePrompt] = useState(null)  // { date, items } — your time differs from the team
  const promptedRef = useRef(new Set())               // mismatches already shown, so they don't pop up again
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(null)        // work_date being saved, or 'fill'
  const [missingOnly, setMissingOnly] = useState(false)
  const [showLater, setShowLater]     = useState(false) // days after today
  const [fillOpen, setFillOpen]       = useState(false)

  const dates = useMemo(() => monthDates(month), [month])
  const today = normalizeDate(new Date())
  const canEdit = isZairul || (viewId && viewId === memberId)
  const loadKey = `${viewId}|${dates[0]}`
  const loading = !!viewId && loadedKey !== loadKey

  useEffect(() => {
    Promise.all([
      supabase.from('team_members').select('id, full_name, short_name, is_hidden').order('full_name'),
      supabase.from('sites').select('*, site_assignments(member_id, work_date, assignment_role)'),
      fetchTeamLeaves().catch(() => []),
    ]).then(([m, s, l]) => {
      setMembers(m.data || [])
      // Newest first — the site picker lists them in date order.
      setSites((s.data || []).slice().sort((a, b) => String(b.scheduled_date || '').localeCompare(String(a.scheduled_date || ''))))
      setLeaves(l)
    })
  }, [])

  useEffect(() => {
    if (!viewId) return
    let cancelled = false
    supabase
      .from('timecards')
      .select('*')
      .eq('member_id', viewId)
      .gte('work_date', dates[0])
      .lte('work_date', dates[dates.length - 1])
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.code === '42P01' || /timecards/.test(err.message)
            ? 'The timecards table is missing — run sql/setup-timecards.sql in the Supabase SQL editor.'
            : err.message)
          setCards({})
        } else {
          setError('')
          setCards(Object.fromEntries((data || []).map(r => [r.work_date, r])))
        }
        setDrafts({})
        setLoadedKey(`${viewId}|${dates[0]}`)
      })
    return () => { cancelled = true }
  }, [viewId, dates])

  // Teammates' timecards for the month — used to spot a different time at the same site
  useEffect(() => {
    if (!viewId) return
    let cancelled = false
    supabase
      .from('timecards')
      .select('member_id, work_date, segments, time_in, time_out, site_id')
      .neq('member_id', viewId)
      .gte('work_date', dates[0])
      .lte('work_date', dates[dates.length - 1])
      .then(({ data }) => { if (!cancelled) setTeamCards(data || []) })
    return () => { cancelled = true }
  }, [viewId, dates])

  const teamByDate = useMemo(() => {
    const map = {}
    for (const r of teamCards) (map[r.work_date] ||= []).push(r)
    return map
  }, [teamCards])

  const nameOf = id => { const m = members.find(x => x.id === id); return m?.short_name || m?.full_name?.split(' ')[0] || 'a teammate' }

  // After a save: if a finished slot differs from a teammate at the same site, ask once
  function checkTeamTimes(date, segments) {
    const items = teamTimeMismatches(segments.filter(s => s.time_in && s.time_out), teamByDate[date] || [])
    if (!items.length) return
    const key = `${date}|${JSON.stringify(items.map(i => [i.mine, i.others]))}`
    if (promptedRef.current.has(key)) return
    promptedRef.current.add(key)
    setTimePrompt({ date, items })
  }

  // "Use their time" — copy a teammate's in / out into my slot
  function applyTeamTime(date, slot, other) {
    const values = dayValues(date)
    const segments = values.segments.map((s, i) => i === slot ? { ...s, time_in: other.time_in || s.time_in, time_out: other.time_out || s.time_out } : s)
    changeDay(date, { ...values, segments })
    setTimePrompt(null)
  }

  // Sites the member is assigned to on a date (not cancelled), used to pre-fill the site pick.
  // No assignment means the default: Store (site_id '').
  function suggestedSiteIds(date) {
    return sites
      .filter(s => s.site_status !== 'cancelled' && !s.is_hidden &&
        getSiteDates(s).includes(date) &&
        assignmentsForDate(s.site_assignments || [], date).some(a => assignmentMemberId(a) === viewId))
      .map(s => s.id)
  }

  function dayValues(date) {
    if (drafts[date]) return drafts[date]
    const saved = cards[date]
    const slots = saved ? savedSlots(saved) : []
    return {
      segments: slots.length > 0 ? slots : [{ ...EMPTY_SLOT, site_id: suggestedSiteIds(date)[0] || '' }],
      remarks: saved?.remarks || '',
      highlight: saved?.highlight || '',
    }
  }

  function setDraft(date, values) {
    setDrafts(prev => ({ ...prev, [date]: values }))
  }

  function timecardRow(date, segments, remarks, highlight) {
    const { worked, normal, ot } = calcTimecard(date, segments)
    return {
      member_id: viewId,
      work_date: date,
      segments,
      time_in: segments[0]?.time_in || null,
      time_out: segments[segments.length - 1]?.time_out || null,
      site_id: segments.find(s => s.site_id)?.site_id || null,
      remarks: remarks || null,
      highlight: highlight || null,
      worked_minutes: worked,
      normal_minutes: normal,
      ot_minutes: ot,
      updated_by: memberId,
      updated_at: new Date().toISOString(),
    }
  }

  async function saveDay(date, values) {
    if (!canEdit) return
    const segments = values.segments.filter(slotHasTime)
    const remarks = values.remarks.trim()
    const highlight = values.highlight || ''
    const saved = cards[date]
    const blank = segments.length === 0 && !remarks && !highlight
    const unchanged = saved &&
      JSON.stringify(savedSlots(saved)) === JSON.stringify(segments) && (saved.remarks || '') === remarks &&
      (saved.highlight || '') === highlight
    if (unchanged || (!saved && blank)) return

    setSaving(date)
    setError('')
    const result = blank
      ? await supabase.from('timecards').delete().eq('id', saved.id)
      : await supabase.from('timecards').upsert(timecardRow(date, segments, remarks, highlight), { onConflict: 'member_id,work_date' }).select().single()
    setSaving(null)

    if (result.error) {
      setError(saveErrorText(result.error))
      return
    }
    setCards(prev => blank ? without(prev, date) : { ...prev, [date]: result.data })
    // Keep any edit made while this save was in flight.
    setDrafts(prev => prev[date] === values ? without(prev, date) : prev)
    if (!blank) checkTeamTimes(date, segments)
  }

  // Draft only, or draft + save. Picks that leave the day with no time and no
  // remarks (e.g. choosing a site first) wait as a draft until a time is set.
  function changeDay(date, values, { save = true } = {}) {
    setDraft(date, values)
    if (save) saveDay(date, values)
  }

  // "Normal day": office hours in one slot, keeping the site already picked.
  function normalDay(date) {
    if (!dayInfo(date).window) return
    const values = dayValues(date)
    changeDay(date, { ...values, segments: [officeSlot(date, values.segments[0]?.site_id)] })
  }

  // Past working days with no time keyed in (and none being typed).
  const missingDates = loading ? [] : dates.filter(date =>
    isMissingDay(date, today, cards[date], getMemberLeaveOnDate(leaves, viewId, date)) &&
    !(drafts[date]?.segments || []).some(slotHasTime))

  // Fill several missing days with office hours in one save.
  async function fillDays(list) {
    setFillOpen(false)
    if (!canEdit || list.length === 0) return
    const rows = list.map(date => {
      const values = dayValues(date)
      return timecardRow(date, [officeSlot(date, values.segments[0]?.site_id)], values.remarks.trim(), values.highlight)
    })
    setSaving('fill')
    setError('')
    const { data, error: err } = await supabase.from('timecards').upsert(rows, { onConflict: 'member_id,work_date' }).select()
    setSaving(null)
    if (err) {
      setError(saveErrorText(err))
      return
    }
    setCards(prev => ({ ...prev, ...Object.fromEntries((data || []).map(r => [r.work_date, r])) }))
    setDrafts(prev => list.reduce((acc, date) => without(acc, date), prev))
  }

  const totals = useMemo(() => {
    const rows = Object.values(cards)
    return {
      days: rows.filter(r => r.worked_minutes > 0).length,
      normal: rows.reduce((s, r) => s + (r.normal_minutes || 0), 0),
      ot: rows.reduce((s, r) => s + (r.ot_minutes || 0), 0),
    }
  }, [cards])

  const monthLabel = month.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })

  if (!memberId && !isZairul) {
    return <Card><p style={{ color: '#64748b', fontSize: 14 }}>Your login isn't linked to a team member yet, so there's no timecard to show.</p></Card>
  }

  // Days after today stay folded in the current month until asked for.
  const isThisMonth = dates.includes(today)
  const laterDays = isThisMonth ? dates.filter(d => d > today) : []
  let visible = missingOnly ? missingDates
    : isThisMonth && !showLater ? dates.filter(d => d <= today) : dates
  // On a phone the newest day goes first, right under the Today card.
  if (isMobile) visible = [...visible].reverse()
  const showTodayCard = isMobile && canEdit && viewId === memberId && isThisMonth && !loading

  const fillList = missingDates.map(date => {
    const leave = getMemberLeaveOnDate(leaves, viewId, date)
    const win = dayInfo(date).window
    const siteId = dayValues(date).segments[0]?.site_id
    return {
      date,
      hours: `${shortTime(win.start)} – ${shortTime(win.end)}`,
      site: sites.find(s => s.id === siteId)?.site_name || STORE_LABEL,
      halfLeave: leave ? `${titleCase(leave.leave_type)} · ${getLeaveSessionLabel(leave.leave_session)}` : '',
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Month + member picker */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'white', borderRadius: 999, padding: 4, boxShadow: '0 2px 8px rgba(15,23,42,0.08)' }}>
          <IconBtn onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></IconBtn>
          <span style={{ minWidth: 130, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{monthLabel}</span>
          <IconBtn onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></IconBtn>
        </div>
        {isZairul && (
          <select value={viewId || ''} onChange={e => setViewId(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 200, borderRadius: 999, padding: '9px 14px', fontWeight: 600 }}>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}{m.id === memberId ? ' (me)' : isActiveMember(m) ? '' : ' (former)'}</option>)}
          </select>
        )}
        {!isZairul && viewId !== memberId && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '7px 8px 7px 14px', fontSize: 13, fontWeight: 600 }}>
            Viewing {members.find(m => m.id === viewId)?.full_name || 'a teammate'} · read only
            <button onClick={() => setViewId(null)} style={{ border: 'none', borderRadius: 999, padding: '5px 12px', background: 'white', color: '#92400e', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Back to mine
            </button>
          </span>
        )}
        {saving && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475569' }}><Loader2 size={14} className="animate-spin" /> Saving…</span>}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '10px 14px', fontSize: 13.5 }}>{error}</div>}

      {/* Month totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: isMobile ? 8 : 12 }}>
        <Stat label="Days worked" value={totals.days} />
        <Stat label="Normal hours" value={formatMinutes(totals.normal)} />
        <Stat label="OT hours" value={formatMinutes(totals.ot)} accent />
      </div>

      {showTodayCard && (
        <TodayCard date={today} values={dayValues(today)} sites={sites}
          onChange={values => changeDay(today, values)} onNormalDay={() => normalDay(today)} />
      )}

      {/* Quick actions */}
      {!loading && (
        <div className="tc-bar">
          {canEdit && (
            <button type="button" className="tc-btn pri" disabled={missingDates.length === 0 || saving === 'fill'} onClick={() => setFillOpen(true)}>
              {missingDates.length ? <><Zap size={15} /> Fill missing days <span className="n">{missingDates.length}</span></> : <><Check size={15} /> No missing days</>}
            </button>
          )}
          <button type="button" className={`tc-toggle${missingOnly ? ' on' : ''}`} aria-pressed={missingOnly} onClick={() => setMissingOnly(v => !v)}>
            <span className="sw" /> Show missing only
          </button>
        </div>
      )}

      {/* Day list */}
      <Card padding={0}>
        {!isMobile && (
          <div style={{ ...gridRow, padding: '12px 18px', borderBottom: '1px solid #e2e8f0', fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Date</span><span>Time in → out</span><span>Site</span><span>Remarks</span><span style={{ textAlign: 'right' }}>Normal</span><span style={{ textAlign: 'right' }}>OT</span>
          </div>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>Nothing missing — every working day has times.</div>
        ) : visible.map(date => {
          const leave = getMemberLeaveOnDate(leaves, viewId, date)
          return (
            <DayRow
              key={date}
              date={date}
              isToday={date === today}
              values={dayValues(date)}
              leave={leave}
              missing={isMissingDay(date, today, cards[date], leave)}
              sites={sites}
              suggested={suggestedSiteIds(date)}
              teamDiff={[...new Set(teamTimeMismatches(dayValues(date).segments, teamByDate[date] || []).flatMap(m => m.others.map(o => nameOf(o.memberId))))]}
              onTeamDiff={() => setTimePrompt({ date, items: teamTimeMismatches(dayValues(date).segments, teamByDate[date] || []) })}
              canEdit={canEdit}
              isMobile={isMobile}
              onChange={(values, opts) => changeDay(date, values, opts)}
              onSave={() => saveDay(date, dayValues(date))}
              onNormalDay={() => normalDay(date)}
            />
          )
        })}
        {!loading && !missingOnly && laterDays.length > 0 && (
          <button type="button" className="tc-fold" onClick={() => setShowLater(v => !v)}>
            <ChevronDown size={15} style={{ transform: showLater ? 'rotate(180deg)' : 'none' }} />
            {showLater ? 'Hide the days after today' : `Show the other ${laterDays.length} days of ${month.toLocaleDateString('en-MY', { month: 'long' })}`}
          </button>
        )}
      </Card>

      <p style={{ fontSize: 12, color: '#64748b' }}>
        Office hours: Mon–Fri 8:00 AM – 5:30 PM, Sat 8:00 AM – 1:00 PM. Time outside these hours, and any work on Sundays or public holidays, counts as OT.
        Lunch (1:00 PM – 2:30 PM) is not counted. A time out earlier than the time in is treated as finishing after midnight.
        Tap a time to change it — pick the hour, or type it (e.g. 1730 or 5.30p). Worked at two sites, or came back for night work? Use <b>+ Add time</b> for another slot on the same day.
      </p>

      {fillOpen && <FillDialog days={fillList} onCancel={() => setFillOpen(false)} onFill={fillDays} />}
      {timePrompt && (
        <TeamTimeDialog prompt={timePrompt} sites={sites} nameOf={nameOf} canEdit={canEdit} own={viewId === memberId}
          onUse={(slot, other) => applyTeamTime(timePrompt.date, slot, other)} onClose={() => setTimePrompt(null)} />
      )}
    </div>
  )
}

// Phone only: big Clock in / Clock out buttons for today, rounded to the half hour.
function TodayCard({ date, values, sites, onChange, onNormalDay }) {
  const { segments } = values
  const last = segments[segments.length - 1]
  const anyTime = segments.some(slotHasTime)
  const clockedIn = !!last.time_in && !last.time_out
  const complete = anyTime && !clockedIn
  const now = roundedNow()
  const site = sites.find(s => s.id === segments[0].site_id)
  const workday = !!dayInfo(date).window
  const { normal, ot } = calcTimecard(date, segments)
  const d = new Date(`${date}T00:00:00`)

  const setSegments = next => onChange({ ...values, segments: next })
  function clockIn() {
    if (!anyTime) setSegments(segments.map((s, i) => i === 0 ? { ...s, time_in: now } : s))
    else setSegments([...segments, { ...EMPTY_SLOT, time_in: now, site_id: last.site_id }])
  }
  function clockOut() {
    setSegments(segments.map((s, i) => i === segments.length - 1 ? { ...s, time_out: now } : s))
  }

  return (
    <div className="tc-today">
      <div className="h">
        <b>Today · {d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
        <span className="tc-site-line"><i style={{ background: site ? '#3478d4' : '#94a3b8' }} />{site ? site.site_name : STORE_LABEL}</span>
      </div>

      {anyTime && (
        <div className="done">
          {segments.filter(slotHasTime).map((s, i) => (
            <div key={i}><small>{i === 0 ? 'In' : 'In again'}</small><b>{s.time_in ? formatTime12(s.time_in) : '–'}</b>
              <small>Out</small><b>{s.time_out ? formatTime12(s.time_out) : '…'}</b></div>
          ))}
        </div>
      )}

      {clockedIn ? (
        <button type="button" className="tc-big out" onClick={clockOut}><Square size={16} fill="currentColor" /> Clock out now <small>{formatTime12(now)}</small></button>
      ) : !complete ? (
        <button type="button" className="tc-big in" onClick={clockIn}><Play size={16} fill="currentColor" /> Clock in now <small>{formatTime12(now)}</small></button>
      ) : (
        <div className="tot">
          <span>Normal {formatMinutes(normal)}</span>
          <b className={ot ? 'ot' : ''}>OT {formatMinutes(ot)}</b>
          <button type="button" className="tc-link" onClick={clockIn}>Clock in again</button>
        </div>
      )}
      {!anyTime && workday && (
        <button type="button" className="tc-quick wide" onClick={onNormalDay}><Check size={14} /> Normal day</button>
      )}
      <p className="hint">Times are rounded to the nearest half hour. Tap a time in the list below to change it.</p>
    </div>
  )
}

function DayRow({ date, isToday, values, leave, missing, sites, suggested, teamDiff = [], onTeamDiff, canEdit, isMobile, onChange, onSave, onNormalDay }) {
  const info = dayInfo(date)
  const { segments, remarks, highlight } = values
  const { normal, ot } = calcTimecard(date, segments)
  const outstation = segments.some(s => s.site_id && sites.find(x => x.id === s.site_id)?.outstation)
  const mark = highlightHex(highlight) || leaveHighlight(leave)?.hex || (outstation ? OUTSTATION_HIGHLIGHT.hex : null)
  const d = new Date(`${date}T00:00:00`)
  const offDay = info.kind === 'holiday' || info.kind === 'off'
  const fullLeave = isFullLeave(leave)
  const hasTime = segments.some(slotHasTime)
  const dayHasContent = slots => slots.some(slotHasTime) || !!remarks.trim()
  const [picker, setPicker] = useState(null)          // { slot, field, rect } of the open time picker

  const badges = []
  if (info.kind === 'holiday') badges.push({ text: info.label, color: '#b91c1c', bg: '#fee2e2' })
  if (info.kind === 'off') badges.push({ text: 'Off day', color: '#475569', bg: '#e2e8f0' })
  if (outstation) badges.push({ text: 'Outstation', color: '#fff', bg: '#6366f1' })
  if (offDay && segments.some(s => s.site_id)) badges.push({ text: 'Site day', color: '#1d4ed8', bg: '#dbeafe' })
  if (leave) badges.push({ text: `${titleCase(leave.leave_type)} · ${getLeaveSessionLabel(leave.leave_session)}`, color: '#b45309', bg: '#fef3c7' })
  if (missing) badges.push({ text: 'No time keyed in', color: '#b91c1c', bg: '#fef2f2' })
  if (hasOverlap(segments)) badges.push({ text: 'Times overlap', color: '#b91c1c', bg: '#fef2f2' })

  function updateSlot(i, patch) {
    const next = segments.map((s, j) => j === i ? { ...s, ...patch } : s)
    onChange({ ...values, segments: next }, { save: dayHasContent(next) })
    return next
  }
  function removeSlot(i) {
    const next = segments.filter((_, j) => j !== i)
    onChange({ ...values, segments: next.length > 0 ? next : [{ ...EMPTY_SLOT }] })
  }
  function addSlot() {
    // A second assigned site that day (if any) is the likely pick for the new slot.
    const nextSite = suggested.find(id => !segments.some(s => s.site_id === id)) || ''
    onChange({ ...values, segments: [...segments, { ...EMPTY_SLOT, site_id: nextSite }] }, { save: false })
  }

  function openPicker(slot, field, e) {
    setPicker({ slot, field, rect: e.currentTarget.getBoundingClientRect() })
  }
  function applyTime(value) {
    const { slot, field } = picker
    const next = updateSlot(slot, { [field]: value })
    // Set the time in of an empty slot -> carry straight on to its time out.
    setPicker(field === 'time_in' && !next[slot].time_out ? { ...picker, field: 'time_out' } : null)
  }
  function clearTime() {
    updateSlot(picker.slot, { [picker.field]: '' })
    setPicker(null)
  }

  const dateLabel = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
      <HighlightPicker value={highlight} disabled={!canEdit} onChange={h => onChange({ ...values, highlight: h })} />
      <span style={{ fontSize: 13.5, fontWeight: 700, color: offDay && !hasTime ? '#94a3b8' : '#0f172a', whiteSpace: 'nowrap' }}>
        {d.toLocaleDateString('en-MY', { weekday: 'short' })} {d.getDate()}
      </span>
      {isToday && <Badge text="Today" color="white" bg="#f07c1e" />}
      {badges.map(b => <Badge key={b.text} {...b} />)}
      {teamDiff.length > 0 && (
        <button type="button" onClick={onTeamDiff} title="Your time is different from your teammate at the same site — tap to compare"
          style={{ border: '1px solid #fcd34d', borderRadius: 999, padding: '2px 8px', background: '#fffbeb', color: '#b45309', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ⚠ Time differs from {teamDiff.slice(0, 2).join(', ')}{teamDiff.length > 2 ? ` +${teamDiff.length - 2}` : ''}
        </button>
      )}
    </div>
  )
  const addButton = canEdit && hasTime && (
    <button onClick={addSlot} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start', justifySelf: 'start', padding: '3px 8px', border: '1px dashed #93c5fd', borderRadius: 999, background: 'transparent', color: '#1d4ed8', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
      <Plus size={12} /> Add time
    </button>
  )

  const chip = (slot, i, field) => {
    const isOpen = picker?.slot === i && picker.field === field
    if (!canEdit) return <span className="tc-chip ro">{slot[field] ? formatTime12(slot[field]) : '–'}</span>
    return (
      <button type="button" className={`tc-chip${slot[field] ? '' : ' empty'}${isOpen ? ' act' : ''}`} onClick={e => openPicker(i, field, e)}>
        {slot[field] ? formatTime12(slot[field]) : field === 'time_in' ? 'Time in' : 'Time out'}
      </button>
    )
  }

  // What the times cell shows on a day with nothing keyed in yet.
  let emptyTimes = null
  if (!hasTime) {
    if (!canEdit) emptyTimes = <span className="tc-muted">–</span>
    else if (fullLeave) emptyTimes = <>
      <span className="tc-muted">{isOffDay(leave) ? 'Day off' : 'On leave'}</span>
      <button type="button" className="tc-link" onClick={e => openPicker(0, 'time_in', e)}>Worked anyway?</button>
    </>
    else if (offDay) emptyTimes = <>
      <button type="button" className="tc-chip empty" onClick={e => openPicker(0, 'time_in', e)}><Plus size={13} /> Add time</button>
      <span className="tc-muted">all OT</span>
    </>
    else emptyTimes = <>
      <button type="button" className="tc-quick" onClick={onNormalDay}>
        <Check size={14} /> Normal day <small>{shortTime(info.window.start)} – {shortTime(info.window.end)}</small>
      </button>
      <button type="button" className="tc-link" onClick={e => openPicker(0, 'time_in', e)}>Other times</button>
    </>
  }

  const timesCell = (slot, i) => (
    <div className="tc-times">
      {emptyTimes || <>{chip(slot, i, 'time_in')}<span className="tc-arrow">→</span>{chip(slot, i, 'time_out')}</>}
    </div>
  )

  // Off days and full-day leave with nothing keyed in don't need a site.
  const quiet = !hasTime && (offDay || fullLeave)
  const siteCell = (slot, i) => quiet && !slot.site_id ? <span /> : (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
      <SitePicker value={slot.site_id} sites={sites} date={date} suggested={suggested} disabled={!canEdit}
        onChange={site_id => updateSlot(i, { site_id })} />
      {canEdit && segments.length > 1 && (
        <button onClick={() => removeSlot(i)} title="Remove this time slot" style={{ flexShrink: 0, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 999, background: '#f1f5f9', color: '#64748b', cursor: 'pointer' }}>
          <X size={14} />
        </button>
      )}
    </div>
  )

  const remarksField = (
    <input type="text" value={remarks} disabled={!canEdit} placeholder="Remarks" style={inputStyle}
      onChange={e => onChange({ ...values, remarks: e.target.value }, { save: false })} onBlur={onSave} />
  )
  const totalsText = hasTime && (
    <span style={{ fontSize: 12.5, color: '#475569', whiteSpace: 'nowrap' }}>{formatMinutes(normal)} · <b style={{ color: ot ? '#ea580c' : '#94a3b8' }}>OT {formatMinutes(ot)}</b></span>
  )

  const panel = picker && (
    <TimePanel
      key={`${picker.slot}-${picker.field}`}
      title={`${picker.field === 'time_in' ? 'Time in' : 'Time out'} · ${d.toLocaleDateString('en-MY', { weekday: 'short' })} ${d.getDate()}`}
      value={segments[picker.slot]?.[picker.field] || ''}
      fallback={picker.field === 'time_in'
        ? minutesToHHMM(info.window?.start ?? 8 * 60)
        : minutesToHHMM(info.window?.end ?? 17 * 60 + 30)}
      win={info.window}
      rect={picker.rect}
      onApply={applyTime}
      onClear={clearTime}
      onClose={() => setPicker(null)}
    />
  )

  const rowBg = mark || (isToday ? '#fff8f1' : missing ? '#fffafa' : offDay ? '#f8fafc' : 'white')
  const todayEdge = isToday ? { boxShadow: 'inset 3px 0 0 #f07c1e' } : null

  if (isMobile) {
    return (
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', background: rowBg, display: 'flex', flexDirection: 'column', gap: 8, ...todayEdge }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {dateLabel}
          {totalsText}
        </div>
        {segments.map((slot, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, ...(i > 0 ? { paddingTop: 8, borderTop: '1px dashed #e2e8f0' } : {}) }}>
            {timesCell(slot, i)}
            {siteCell(slot, i)}
          </div>
        ))}
        {addButton}
        {(hasTime || remarks || !quiet) && remarksField}
        {panel}
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 18px', borderBottom: '1px solid #f1f5f9', background: rowBg, display: 'flex', flexDirection: 'column', gap: 6, ...todayEdge }}>
      {segments.map((slot, i) => {
        const first = i === 0
        return (
          <div key={i} style={gridRow}>
            {first ? dateLabel : <span />}
            {timesCell(slot, i)}
            {siteCell(slot, i)}
            {first ? remarksField : <span />}
            {first
              ? <span style={{ fontSize: 13.5, color: '#334155', textAlign: 'right' }}>{hasTime ? formatMinutes(normal) : '–'}</span>
              : <span />}
            {first
              ? <span style={{ fontSize: 13.5, fontWeight: 700, textAlign: 'right', color: ot ? '#ea580c' : '#94a3b8' }}>{hasTime ? formatMinutes(ot) : '–'}</span>
              : <span />}
          </div>
        )
      })}
      {addButton && <div style={gridRow}><span />{addButton}</div>}
      {panel}
    </div>
  )
}

const PANEL_W = 300
const PANEL_H = 380

// Quick time picker: tap the hour, then :00 or :30 — or type it. Office hours are outlined.
function TimePanel({ title, value, fallback, win, rect, onApply, onClear, onClose }) {
  const start = toMinutes(value || fallback)
  const [h, setH] = useState(Math.floor(start / 60))
  const [m, setM] = useState(start % 60)
  const [typed, setTyped] = useState('')
  const [bad, setBad] = useState(false)
  const panelRef = useRef(null)
  // Typing pops the keyboard on a phone, so only focus the box where there's a real keyboard
  const [autoFocus] = useState(() => !window.matchMedia?.('(pointer: coarse)').matches)

  const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_W - 8))
  const below = rect.bottom + 6
  const top = below + PANEL_H <= window.innerHeight - 8 ? below : Math.max(8, rect.top - PANEL_H - 6)

  useEffect(() => {
    const close = e => { if (!panelRef.current?.contains(e.target)) onClose() }
    const onScroll = e => { if (!panelRef.current?.contains(e.target)) onClose() }
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const picked = minutesToHHMM(h * 60 + m)
  function submitTyped() {
    const t = parseTypedTime(typed)
    if (t) onApply(t)
    else setBad(true)
  }
  const hourButton = x => {
    const office = win && x * 60 >= win.start && x * 60 < win.end
    return (
      <button key={x} type="button" className={`${x === h ? 'on' : ''}${office ? ' office' : ''}`} onClick={() => setH(x)}>
        {x % 12 || 12}
      </button>
    )
  }

  return (
    <div ref={panelRef} className="tc-tp" style={{ left, top, width: PANEL_W }}>
      <div className="tc-tp-h"><span>{title}</span><b>{formatTime12(picked)}</b></div>
      <input className={`tc-tp-type${bad ? ' bad' : ''}`} autoFocus={autoFocus} value={typed} inputMode="text"
        placeholder="Type it: 1730, 5.30p, 7am…"
        onChange={e => { setTyped(e.target.value); setBad(false) }}
        onKeyDown={e => { if (e.key === 'Enter') submitTyped() }} />
      <div className="tc-tp-grp">AM</div>
      <div className="tc-tp-hrs">{Array.from({ length: 12 }, (_, i) => hourButton(i))}</div>
      <div className="tc-tp-grp">PM</div>
      <div className="tc-tp-hrs">{Array.from({ length: 12 }, (_, i) => hourButton(i + 12))}</div>
      <div className="tc-tp-mins">
        <button type="button" className={m === 0 ? 'on' : ''} onClick={() => setM(0)}>:00</button>
        <button type="button" className={m === 30 ? 'on' : ''} onClick={() => setM(30)}>:30</button>
      </div>
      <div className="tc-tp-foot">
        {value ? <button type="button" className="tc-link" onClick={onClear}>Clear</button> : <span />}
        <button type="button" className="tc-tp-set" onClick={() => onApply(picked)}>Set {formatTime12(picked)}</button>
      </div>
    </div>
  )
}

// Confirm before filling missing days with office hours; half-day leave days start unticked.
// "Your time doesn't match your teammate's at the same site — please check with your team."
function TeamTimeDialog({ prompt, sites, nameOf, canEdit, own, onUse, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const d = new Date(`${prompt.date}T00:00:00`)
  const range = s => `${s.time_in ? formatTime12(s.time_in) : '–'} – ${s.time_out ? formatTime12(s.time_out) : '…'}`
  const people = [...new Set(prompt.items.flatMap(i => i.others.map(o => nameOf(o.memberId))))]
  return (
    <div className="tc-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tc-modal" role="dialog" aria-modal="true" aria-label="Time differs from your team">
        <h3>⚠ {own ? 'Your time' : 'This time'} doesn't match {people.join(', ')}</h3>
        <p>Same site on {d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}, but different time in / out. Please check with your team.</p>
        <div className="tc-tt">
          {prompt.items.map(item => (
            <div key={item.slot} className="tc-tt-site">
              <b>{sites.find(s => s.id === item.siteId)?.site_name || 'Site'}</b>
              <div className="row me"><span>{own ? 'You' : 'This timecard'}</span><em>{range(item.mine)}</em></div>
              {item.others.map(o => (
                <div key={o.memberId} className="row">
                  <span>{nameOf(o.memberId)}</span><em>{range(o)}</em>
                  {canEdit && <button type="button" className="tc-btn" onClick={() => onUse(item.slot, o)}>Use {nameOf(o.memberId)}'s time</button>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="tc-mf">
          <button type="button" className="tc-btn pri" onClick={onClose}>{canEdit ? 'Keep mine' : 'OK'}</button>
        </div>
      </div>
    </div>
  )
}

function FillDialog({ days, onCancel, onFill }) {
  const [picked, setPicked] = useState(() => new Set(days.filter(d => !d.halfLeave).map(d => d.date)))
  const toggle = date => setPicked(prev => {
    const next = new Set(prev)
    if (next.has(date)) next.delete(date)
    else next.add(date)
    return next
  })
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const n = picked.size
  return (
    <div className="tc-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="tc-modal" role="dialog" aria-modal="true" aria-label="Fill missing days">
        <h3>Fill {days.length} missing day{days.length === 1 ? '' : 's'} with office hours?</h3>
        <p>Untick any day you didn't work normal hours. You can still change any day afterwards.</p>
        <div className="tc-ml">
          {days.map(day => {
            const d = new Date(`${day.date}T00:00:00`)
            return (
              <label key={day.date}>
                <input type="checkbox" checked={picked.has(day.date)} onChange={() => toggle(day.date)} />
                <b>{d.toLocaleDateString('en-MY', { weekday: 'short' })} {d.getDate()}</b>
                <span>{day.hours} · {day.site}{day.halfLeave && <em> · {day.halfLeave}</em>}</span>
              </label>
            )
          })}
        </div>
        <p className="skip">Skipped automatically: Sundays, public holidays, full-day leave and days already keyed in.</p>
        <div className="tc-mf">
          <button type="button" className="tc-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="tc-btn pri" disabled={n === 0} onClick={() => onFill(days.filter(d => picked.has(d.date)).map(d => d.date))}>
            Fill {n} day{n === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Colour dot before the date. Picking a colour highlights the day here and in the Excel / PDF export.
function HighlightPicker({ value, disabled, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const hex = highlightHex(value)

  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (disabled && !hex) return null
  const pick = key => { setOpen(false); if (key !== (value || '')) onChange(key) }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        title={hex ? `Highlighted ${HIGHLIGHTS.find(h => h.key === value).label.toLowerCase()} — change` : 'Highlight this day'}
        aria-label="Highlight colour" aria-expanded={open}
        style={{ width: 18, height: 18, borderRadius: 999, padding: 0, cursor: disabled ? 'default' : 'pointer',
          background: hex || 'white', border: hex ? '1px solid rgba(15,23,42,0.25)' : '1.5px dashed #94a3b8' }} />
      {open && (
        <span style={{ position: 'absolute', top: 24, left: -6, zIndex: 20, display: 'flex', alignItems: 'center', gap: 6, padding: 8, background: 'white', borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.18)', border: '1px solid #e2e8f0' }}>
          {HIGHLIGHTS.map(h => (
            <button key={h.key} type="button" onClick={() => pick(h.key)} title={h.label} aria-label={h.label}
              style={{ width: 22, height: 22, borderRadius: 999, padding: 0, cursor: 'pointer', background: h.hex,
                border: h.key === value ? '2px solid #0f172a' : '1px solid rgba(15,23,42,0.2)' }} />
          ))}
          <button type="button" onClick={() => pick('')} title="No highlight" aria-label="No highlight"
            style={{ width: 22, height: 22, borderRadius: 999, padding: 0, cursor: 'pointer', background: 'white', border: '1px solid #cbd5e1', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={12} />
          </button>
        </span>
      )}
    </span>
  )
}

const gridRow = { display: 'grid', gridTemplateColumns: 'minmax(170px,1.2fr) minmax(300px,1.7fr) minmax(170px,1.4fr) minmax(130px,1.1fr) 70px 70px', gap: 10, alignItems: 'center' }

const inputStyle = { width: '100%', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13.5, color: '#0f172a', background: 'white', fontFamily: 'inherit', minWidth: 0 }

function Card({ children, padding = 18 }) {
  return <div style={{ background: 'white', borderRadius: 16, padding, boxShadow: '0 2px 10px rgba(15,23,42,0.06)', overflow: 'hidden' }}>{children}</div>
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 10px rgba(15,23,42,0.06)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: accent ? '#ea580c' : '#0f172a' }}>{value}</div>
    </div>
  )
}

function Badge({ text, color, bg }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{text}</span>
}

function IconBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 999, background: '#f1f5f9', color: '#0f172a', cursor: 'pointer' }}>{children}</button>
}

const STORE_LABEL = 'Store'

function shortDate(value) {
  if (!value) return ''
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Searchable site picker. Store (no site) first, then the sites running that day
// (yours marked), then every site newest first. The list floats above the page
// because the timecard card clips anything that overflows it.
function SitePicker({ value, sites, date, suggested, disabled, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const selected = sites.find(s => s.id === value)

  function openPanel() {
    if (disabled) return
    const r = buttonRef.current.getBoundingClientRect()
    const width = Math.min(Math.max(r.width, 300), window.innerWidth - 16)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const below = window.innerHeight - r.bottom
    const height = 340
    setPos(below >= height || below > r.top
      ? { left, width, top: r.bottom + 4, maxHeight: Math.min(height, below - 12) }
      : { left, width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(height, r.top - 12) })
    setQuery('')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    const close = e => {
      if (panelRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onScroll = e => { if (!panelRef.current?.contains(e.target)) setOpen(false) }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const sections = useMemo(() => {
    if (!open) return []
    // Hidden sites still name slots already saved against them, but aren't offered for new ones
    const match = s => !s.is_hidden && (!q || s.site_name.toLowerCase().includes(q) || shortDate(s.scheduled_date).toLowerCase().includes(q))
    const onDay = sites.filter(s => getSiteDates(s).includes(date) && match(s))
      .sort((a, b) => (suggested.includes(b.id) ? 1 : 0) - (suggested.includes(a.id) ? 1 : 0))
    const onDayIds = new Set(onDay.map(s => s.id))
    const rest = sites.filter(s => !onDayIds.has(s.id) && match(s)).slice(0, 150)
    return [
      ...(onDay.length ? [{ title: 'On this day', items: onDay }] : []),
      { title: q ? 'Matching sites' : 'All sites (newest first)', items: rest },
    ]
  }, [open, q, sites, date, suggested])

  const showStore = !q || STORE_LABEL.toLowerCase().includes(q) || 'office'.includes(q)
  function pick(id) { onChange(id); setOpen(false) }
  function onKeyDown(e) {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Enter') {
      const firstSite = sections.flatMap(sec => sec.items)[0]
      if (q && firstSite) pick(firstSite.id)
      else if (showStore) pick('')
    }
  }

  const row = active => ({ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 'none', borderRadius: 8, background: active ? '#eff6ff' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' })

  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => (open ? setOpen(false) : openPanel())} disabled={disabled}
        style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'default' : 'pointer', textAlign: 'left' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? '#0f172a' : '#475569', fontWeight: selected ? 600 : 400 }}>
          {selected ? selected.site_name : STORE_LABEL}
        </span>
        {!disabled && <ChevronDown size={14} color="#94a3b8" style={{ flexShrink: 0 }} />}
      </button>

      {open && pos && (
        <div ref={panelRef} style={{ position: 'fixed', zIndex: 1200, left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, display: 'flex', flexDirection: 'column', background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 16px 40px rgba(15,23,42,0.2)', overflow: 'hidden' }}>
          <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid #f1f5f9' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)' }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown} placeholder="Search site name or date…"
              style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
          <div style={{ overflowY: 'auto', padding: 4 }}>
            {showStore && (
              <button type="button" onClick={() => pick('')} style={row(!value)}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1 }}>{STORE_LABEL}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>No site</span>
              </button>
            )}
            {sections.map(sec => sec.items.length > 0 && (
              <div key={sec.title}>
                <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', padding: '8px 10px 4px' }}>{sec.title}</p>
                {sec.items.map(s => (
                  <button key={s.id} type="button" onClick={() => pick(s.id)} style={row(s.id === value)}>
                    <span style={{ fontSize: 13, color: '#0f172a', fontWeight: s.id === value ? 700 : 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.site_name}</span>
                    {suggested.includes(s.id) && <Badge text="Assigned to you" color="#166534" bg="#dcfce7" />}
                    {s.site_status === 'cancelled' && <Badge text="Cancelled" color="#991b1b" bg="#fee2e2" />}
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{shortDate(s.scheduled_date)}</span>
                  </button>
                ))}
              </div>
            ))}
            {!showStore && sections.every(sec => sec.items.length === 0) && (
              <p style={{ padding: '14px 10px', fontSize: 12.5, color: '#94a3b8', textAlign: 'center' }}>No sites match “{query}”</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
