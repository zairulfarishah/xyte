import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useViewport } from '../utils/useViewport'
import { useAuth } from '../context/AuthContext'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchTeamLeaves, getMemberLeaveOnDate, getLeaveSessionLabel, leaveAbbr } from '../utils/teamLeaves'
import { normalizeDate } from '../utils/siteDays'
import { dayInfo, formatMinutes, formatTime12, monthDates, isMissingDay } from '../utils/timecard'

const NAME_COL = 190
const DAY_COL = 46
const TOTAL_COL = 78

// Hours as a short number for a grid cell: 480 → "8", 450 → "7.5".
function shortHours(mins) {
  const h = mins / 60
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

export default function TeamTimecards({ month, setMonth, onOpenMember }) {
  const { isMobile } = useViewport()
  const { isZairul } = useAuth()
  const [members, setMembers] = useState([])
  const [cards, setCards]     = useState([])
  const [leaves, setLeaves]   = useState([])
  const [loadedMonth, setLoadedMonth] = useState(null)
  const [error, setError]     = useState('')

  const dates = useMemo(() => monthDates(month), [month])
  const today = normalizeDate(new Date())
  const loading = loadedMonth !== dates[0]

  useEffect(() => {
    Promise.all([
      supabase.from('team_members').select('id, full_name, short_name, avatar_url').order('full_name'),
      fetchTeamLeaves().catch(() => []),
    ]).then(([m, l]) => {
      setMembers(m.data || [])
      setLeaves(l)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('timecards')
      .select('*')
      .gte('work_date', dates[0])
      .lte('work_date', dates[dates.length - 1])
      .then(({ data, error: err }) => {
        if (cancelled) return
        setError(err ? err.message : '')
        setCards(data || [])
        setLoadedMonth(dates[0])
      })
    return () => { cancelled = true }
  }, [dates])

  // member_id -> { work_date -> row }
  const byMember = useMemo(() => {
    const map = {}
    for (const c of cards) (map[c.member_id] ||= {})[c.work_date] = c
    return map
  }, [cards])

  const rows = useMemo(() => members.map(m => {
    const days = byMember[m.id] || {}
    const list = Object.values(days)
    return {
      member: m,
      days,
      normal: list.reduce((s, r) => s + (r.normal_minutes || 0), 0),
      ot: list.reduce((s, r) => s + (r.ot_minutes || 0), 0),
      missing: dates.filter(d => isMissingDay(d, today, days[d], getMemberLeaveOnDate(leaves, m.id, d))).length,
    }
  }), [members, byMember, dates, today, leaves])

  const teamOt = rows.reduce((s, r) => s + r.ot, 0)
  const teamMissing = rows.reduce((s, r) => s + r.missing, 0)
  const monthLabel = month.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'white', borderRadius: 999, padding: 4, boxShadow: '0 2px 8px rgba(15,23,42,0.08)' }}>
          <IconBtn onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></IconBtn>
          <span style={{ minWidth: 130, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{monthLabel}</span>
          <IconBtn onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></IconBtn>
        </div>
        <span style={{ fontSize: 13, color: '#334155' }}>
          Team OT <b style={{ color: '#ea580c' }}>{formatMinutes(teamOt)}</b>
          {teamMissing > 0 && <> · <b style={{ color: '#b91c1c' }}>{teamMissing}</b> day{teamMissing === 1 ? '' : 's'} not keyed in</>}
        </span>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '10px 14px', fontSize: 13.5 }}>{error}</div>}

      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 10px rgba(15,23,42,0.06)', overflowX: 'auto' }}>
        <div style={{ minWidth: NAME_COL + dates.length * DAY_COL + TOTAL_COL * 3 }}>

          {/* Header */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            <HeadCell sticky width={NAME_COL} align="left">Member</HeadCell>
            {dates.map(date => {
              const info = dayInfo(date)
              const d = new Date(`${date}T00:00:00`)
              return (
                <HeadCell key={date} width={DAY_COL} title={info.label || undefined}
                  bg={date === today ? '#dbeafe' : info.kind === 'holiday' ? '#fee2e2' : info.kind === 'off' ? '#f1f5f9' : undefined}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: info.kind === 'holiday' ? '#b91c1c' : '#94a3b8' }}>{d.toLocaleDateString('en-MY', { weekday: 'narrow' })}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{d.getDate()}</div>
                </HeadCell>
              )
            })}
            <HeadCell width={TOTAL_COL}>Normal</HeadCell>
            <HeadCell width={TOTAL_COL}>OT</HeadCell>
            <HeadCell width={TOTAL_COL}>Missing</HeadCell>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>Loading…</div>
          ) : rows.map(({ member, days, normal, ot, missing }) => (
            <div key={member.id} style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
              <button
                onClick={() => onOpenMember(member.id)}
                title="Open timecard"
                style={{ position: 'sticky', left: 0, zIndex: 1, width: NAME_COL, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', border: 'none', borderRight: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', textAlign: 'left' }}
              >
                <Avatar member={member} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isMobile ? (member.short_name || member.full_name) : member.full_name}
                </span>
              </button>

              {dates.map(date => (
                <DayCell
                  key={date}
                  date={date}
                  isToday={date === today}
                  card={days[date]}
                  leave={getMemberLeaveOnDate(leaves, member.id, date)}
                  missing={isMissingDay(date, today, days[date], getMemberLeaveOnDate(leaves, member.id, date))}
                />
              ))}

              <TotalCell width={TOTAL_COL}>{formatMinutes(normal)}</TotalCell>
              <TotalCell width={TOTAL_COL} color={ot ? '#ea580c' : '#94a3b8'} bold>{formatMinutes(ot)}</TotalCell>
              <TotalCell width={TOTAL_COL} color={missing ? '#b91c1c' : '#94a3b8'} bold={!!missing}>{missing || '–'}</TotalCell>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: '#64748b' }}>
        <span><b style={{ color: '#0f172a' }}>8</b> hours worked</span>
        <span><b style={{ color: '#ea580c' }}>+2</b> OT hours</span>
        <span><b style={{ color: '#b45309' }}>AL</b> on leave</span>
        <span><b style={{ color: '#b91c1c' }}>!</b> no time keyed in</span>
        <span>Tap a name to open that timecard{isZairul ? ' and edit it' : ''}.</span>
      </div>
    </div>
  )
}

function DayCell({ date, isToday, card, leave, missing }) {
  const info = dayInfo(date)
  const d = new Date(`${date}T00:00:00`)
  const dayLabel = d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })

  let content = null
  let title = [dayLabel, info.label].filter(Boolean).join(' · ')
  if (card && card.worked_minutes > 0) {
    content = (
      <>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{shortHours(card.worked_minutes)}</div>
        {card.ot_minutes > 0 && <div style={{ fontSize: 10.5, fontWeight: 800, color: '#ea580c' }}>+{shortHours(card.ot_minutes)}</div>}
      </>
    )
    const slots = card.segments?.length ? card.segments : [{ time_in: card.time_in, time_out: card.time_out }]
    title += ` · ${slots.map(s => `${formatTime12(s.time_in)} – ${formatTime12(s.time_out)}`).join(', ')}`
    title += ` · ${formatMinutes(card.worked_minutes)}${card.ot_minutes ? `, OT ${formatMinutes(card.ot_minutes)}` : ''}`
  } else if (card) {
    content = <div style={{ fontSize: 11, color: '#94a3b8' }}>…</div>
    title += ' · time out not keyed in'
  } else if (leave) {
    content = <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309' }}>{leaveAbbr(leave.leave_type)}</div>
    title += ` · ${leave.leave_type} (${getLeaveSessionLabel(leave.leave_session)})`
  } else if (missing) {
    content = <div style={{ fontSize: 13, fontWeight: 800, color: '#b91c1c' }}>!</div>
    title += ' · no time keyed in'
  }

  const bg = isToday ? '#eff6ff' : info.kind === 'holiday' ? '#fef2f2' : info.kind === 'off' ? '#f8fafc' : 'white'
  return (
    <div title={title} style={{ width: DAY_COL, flexShrink: 0, minHeight: 46, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #f1f5f9', background: bg, lineHeight: 1.15 }}>
      {content}
    </div>
  )
}

function HeadCell({ children, width, sticky, align = 'center', bg, title }) {
  return (
    <div title={title} style={{
      width, flexShrink: 0, padding: '8px 6px', textAlign: align, background: bg || 'white',
      fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em',
      borderRight: '1px solid #f1f5f9',
      ...(sticky ? { position: 'sticky', left: 0, zIndex: 2, paddingLeft: 12, borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' } : {}),
    }}>
      {children}
    </div>
  )
}

function TotalCell({ children, width, color = '#334155', bold }) {
  return (
    <div style={{ width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: bold ? 800 : 500, color, background: '#fafafa', borderLeft: '1px solid #f1f5f9' }}>
      {children}
    </div>
  )
}

function Avatar({ member }) {
  const initials = (member.short_name || member.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return member.avatar_url
    ? <img src={member.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
    : <span style={{ width: 26, height: 26, borderRadius: 999, background: '#e2e8f0', color: '#475569', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</span>
}

function IconBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 999, background: '#f1f5f9', color: '#0f172a', cursor: 'pointer' }}>{children}</button>
}
