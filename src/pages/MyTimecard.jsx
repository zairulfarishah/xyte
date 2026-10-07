import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useViewport } from '../utils/useViewport'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, Search, X } from 'lucide-react'
import { fetchTeamLeaves, getMemberLeaveOnDate, getLeaveSessionLabel } from '../utils/teamLeaves'
import { normalizeDate, getSiteDates, assignmentsForDate, assignmentMemberId } from '../utils/siteDays'
import { calcTimecard, hasOverlap, dayInfo, formatMinutes, formatTime12, monthDates, isMissingDay } from '../utils/timecard'

const EMPTY_SLOT = { time_in: '', time_out: '', site_id: '' }

const SLOT_MINUTES = 30

function minutesToHHMM(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

// Every half hour of the day, "00:00" to "23:30".
const TIME_SLOTS = Array.from({ length: (24 * 60) / SLOT_MINUTES }, (_, i) => minutesToHHMM(i * SLOT_MINUTES))

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
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(null)        // work_date being saved

  const dates = useMemo(() => monthDates(month), [month])
  const today = normalizeDate(new Date())
  const canEdit = isZairul || (viewId && viewId === memberId)
  const loadKey = `${viewId}|${dates[0]}`
  const loading = !!viewId && loadedKey !== loadKey

  useEffect(() => {
    Promise.all([
      supabase.from('team_members').select('id, full_name, short_name').order('full_name'),
      supabase.from('sites').select('id, site_name, site_status, is_hidden, scheduled_date, end_date, site_assignments(member_id, work_date, assignment_role)'),
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
    }
  }

  function setDraft(date, values) {
    setDrafts(prev => ({ ...prev, [date]: values }))
  }

  async function saveDay(date, values) {
    if (!canEdit) return
    const segments = values.segments.filter(slotHasTime)
    const remarks = values.remarks.trim()
    const saved = cards[date]
    const blank = segments.length === 0 && !remarks
    const unchanged = saved &&
      JSON.stringify(savedSlots(saved)) === JSON.stringify(segments) && (saved.remarks || '') === remarks
    if (unchanged || (!saved && blank)) return

    setSaving(date)
    setError('')
    let result
    if (blank) {
      result = await supabase.from('timecards').delete().eq('id', saved.id)
    } else {
      const { worked, normal, ot } = calcTimecard(date, segments)
      const first = segments[0]
      const last = segments[segments.length - 1]
      result = await supabase.from('timecards').upsert({
        member_id: viewId,
        work_date: date,
        segments,
        time_in: first?.time_in || null,
        time_out: last?.time_out || null,
        site_id: segments.find(s => s.site_id)?.site_id || null,
        remarks: remarks || null,
        worked_minutes: worked,
        normal_minutes: normal,
        ot_minutes: ot,
        updated_by: memberId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'member_id,work_date' }).select().single()
    }
    setSaving(null)

    if (result.error) {
      setError(/segments/.test(result.error.message)
        ? 'The timecards table needs updating — run sql/migrate-timecard-segments.sql in the Supabase SQL editor.'
        : result.error.message)
      return
    }
    setCards(prev => blank ? without(prev, date) : { ...prev, [date]: result.data })
    // Keep any edit made while this save was in flight.
    setDrafts(prev => prev[date] === values ? without(prev, date) : prev)
  }

  // Draft only, or draft + save. Picks that leave the day with no time and no
  // remarks (e.g. choosing a site first) wait as a draft until a time is set.
  function changeDay(date, values, { save = true } = {}) {
    setDraft(date, values)
    if (save) saveDay(date, values)
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
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}{m.id === memberId ? ' (me)' : ''}</option>)}
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

      {/* Day list */}
      <Card padding={0}>
        {!isMobile && (
          <div style={{ ...gridRow, padding: '12px 18px', borderBottom: '1px solid #e2e8f0', fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Date</span><span>Time in</span><span>Time out</span><span>Site</span><span>Remarks</span><span style={{ textAlign: 'right' }}>Normal</span><span style={{ textAlign: 'right' }}>OT</span>
          </div>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>Loading…</div>
        ) : dates.map(date => {
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
              canEdit={canEdit}
              isMobile={isMobile}
              onChange={(values, opts) => changeDay(date, values, opts)}
              onSave={() => saveDay(date, dayValues(date))}
            />
          )
        })}
      </Card>

      <p style={{ fontSize: 12, color: '#64748b' }}>
        Office hours: Mon–Fri 8:00 AM – 5:30 PM, Sat 8:00 AM – 1:00 PM. Time outside these hours, and any work on Sundays or public holidays, counts as OT.
        Lunch (1:00 PM – 2:30 PM) is not counted. A time out earlier than the time in is treated as finishing after midnight.
        Worked at two sites, or came back for night work? Use <b>+ Add time</b> for another slot on the same day.
      </p>
    </div>
  )
}

function DayRow({ date, isToday, values, leave, missing, sites, suggested, canEdit, isMobile, onChange, onSave }) {
  const info = dayInfo(date)
  const { segments, remarks } = values
  const { normal, ot } = calcTimecard(date, segments)
  const d = new Date(`${date}T00:00:00`)
  const offDay = info.kind === 'holiday' || info.kind === 'off'
  const hasTime = segments.some(slotHasTime)
  const dayHasContent = slots => slots.some(slotHasTime) || !!remarks.trim()

  const badges = []
  if (info.kind === 'holiday') badges.push({ text: info.label, color: '#b91c1c', bg: '#fee2e2' })
  if (info.kind === 'off') badges.push({ text: 'Off day', color: '#475569', bg: '#e2e8f0' })
  if (offDay && segments.some(s => s.site_id)) badges.push({ text: 'Site day', color: '#1d4ed8', bg: '#dbeafe' })
  if (leave) badges.push({ text: `${titleCase(leave.leave_type)} · ${getLeaveSessionLabel(leave.leave_session)}`, color: '#b45309', bg: '#fef3c7' })
  if (missing) badges.push({ text: 'No time keyed in', color: '#b91c1c', bg: '#fef2f2' })
  if (hasOverlap(segments)) badges.push({ text: 'Times overlap', color: '#b91c1c', bg: '#fef2f2' })

  function updateSlot(i, patch) {
    const next = segments.map((s, j) => j === i ? { ...s, ...patch } : s)
    onChange({ ...values, segments: next }, { save: dayHasContent(next) })
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

  const dateLabel = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: offDay && !hasTime ? '#94a3b8' : '#0f172a', whiteSpace: 'nowrap' }}>
        {d.toLocaleDateString('en-MY', { weekday: 'short' })} {d.getDate()}
      </span>
      {isToday && <Badge text="Today" color="white" bg="#2563eb" />}
      {badges.map(b => <Badge key={b.text} {...b} />)}
    </div>
  )
  const addButton = canEdit && hasTime && (
    <button onClick={addSlot} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start', padding: '3px 8px', border: '1px dashed #93c5fd', borderRadius: 999, background: 'transparent', color: '#1d4ed8', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
      <Plus size={12} /> Add time
    </button>
  )

  const slotFields = (slot, i) => ({
    timeIn: (
      <TimeSelect value={slot.time_in} disabled={!canEdit} placeholder="Time in"
        onChange={v => updateSlot(i, { time_in: v })} />
    ),
    timeOut: (
      <TimeSelect value={slot.time_out} disabled={!canEdit} placeholder="Time out"
        onChange={v => updateSlot(i, { time_out: v })} />
    ),
    site: (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
        <SitePicker value={slot.site_id} sites={sites} date={date} suggested={suggested} disabled={!canEdit}
          onChange={site_id => updateSlot(i, { site_id })} />
        {canEdit && segments.length > 1 && (
          <button onClick={() => removeSlot(i)} title="Remove this time slot" style={{ flexShrink: 0, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 999, background: '#f1f5f9', color: '#64748b', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        )}
      </div>
    ),
  })

  const remarksField = (
    <input type="text" value={remarks} disabled={!canEdit} placeholder="Remarks" style={inputStyle}
      onChange={e => onChange({ ...values, remarks: e.target.value }, { save: false })} onBlur={onSave} />
  )
  const totalsText = hasTime && (
    <span style={{ fontSize: 12.5, color: '#475569', whiteSpace: 'nowrap' }}>{formatMinutes(normal)} · <b style={{ color: ot ? '#ea580c' : '#94a3b8' }}>OT {formatMinutes(ot)}</b></span>
  )

  const rowBg = isToday ? '#eff6ff' : offDay ? '#f8fafc' : 'white'

  if (isMobile) {
    return (
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', background: rowBg, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {dateLabel}
          {totalsText}
        </div>
        {segments.map((slot, i) => {
          const f = slotFields(slot, i)
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, ...(i > 0 ? { paddingTop: 8, borderTop: '1px dashed #e2e8f0' } : {}) }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{f.timeIn}{f.timeOut}</div>
              {f.site}
            </div>
          )
        })}
        {addButton}
        {remarksField}
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 18px', borderBottom: '1px solid #f1f5f9', background: rowBg, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {segments.map((slot, i) => {
        const f = slotFields(slot, i)
        const first = i === 0
        return (
          <div key={i} style={gridRow}>
            {first ? dateLabel : <span />}
            {f.timeIn}{f.timeOut}{f.site}
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
    </div>
  )
}

const gridRow = { display: 'grid', gridTemplateColumns: 'minmax(170px,1.3fr) 120px 120px minmax(190px,1.5fr) minmax(140px,1.3fr) 80px 80px', gap: 10, alignItems: 'center' }

const inputStyle = { width: '100%', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13.5, color: '#0f172a', background: 'white', fontFamily: 'inherit', minWidth: 0 }

// Half-hour picker. A saved time that isn't on the half hour (keyed in before
// this picker existed) stays listed so it isn't silently lost.
function TimeSelect({ value, onChange, disabled, placeholder }) {
  const slots = value && !TIME_SLOTS.includes(value) ? [...TIME_SLOTS, value].sort() : TIME_SLOTS
  return (
    <select value={value} disabled={disabled} style={inputStyle} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {slots.map(t => <option key={t} value={t}>{formatTime12(t)}</option>)}
    </select>
  )
}

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
