import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useViewport } from '../utils/useViewport'
import { fetchTeamLeaves } from '../utils/teamLeaves'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TYPE_COLORS = {
  site_scanning: { bg: 'linear-gradient(135deg,#0f2460 0%,#1a4b8c 55%,#0891b2 100%)', text: '#ffffff', border: '#0891b2', dot: '#2563eb', label: 'Site Scanning' },
  site_visit:    { bg: 'linear-gradient(135deg,#042f2e 0%,#065f46 55%,#0d9488 100%)', text: '#ffffff', border: '#0d9488', dot: '#16a34a', label: 'Site Visit'    },
  meeting:       { bg: 'linear-gradient(135deg,#1e0a3c 0%,#4c1d95 55%,#7c3aed 100%)', text: '#ffffff', border: '#7c3aed', dot: '#7c3aed', label: 'Meeting'       },
}

const STATUS_DOT = {
  upcoming:  '#f59e0b',
  ongoing:   '#2563eb',
  completed: '#16a34a',
  cancelled: '#ef4444',
  postponed: '#94a3b8',
}

function Avatar({ name, size = 18 }) {
  const initials = (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const colors   = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#0891b2', '#d97706']
  const color    = colors[(name?.charCodeAt(0) || 0) % colors.length]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, fontWeight: '700', color: 'white', flexShrink: 0, border: '1.5px solid white' }}>
      {initials}
    </div>
  )
}

const GANTT_COLS = [
  { key: 'no',      label: 'No.',             width: 40 },
  { key: 'site',    label: 'Site',            width: 210 },
  { key: 'company', label: 'Company',         width: 160 },
  { key: 'details', label: 'Project Details', width: 260 },
  { key: 'days',    label: 'Days',            width: 60 },
]
const GANTT_DAY_WIDTH = 84

// Fixed-date Malaysia public holidays — same date every year, safe to hardcode.
const FIXED_HOLIDAY_LABELS = {
  '01-01': "New Year's Day",
  '05-01': 'Labour Day',
  '08-31': 'Merdeka Day',
  '09-16': 'Malaysia Day',
  '12-25': 'Christmas Day',
}
// Movable holidays (Chinese New Year, Hari Raya, Wesak, Deepavali, Awal Muharram, etc.) shift every
// year and aren't safe to guess — add the exact gazetted "YYYY-MM-DD" here once known.
const MOVABLE_HOLIDAYS = {}

function publicHolidayName(dateStr) {
  return FIXED_HOLIDAY_LABELS[dateStr.slice(5)] || MOVABLE_HOLIDAYS[dateStr] || null
}

function ganttColLeft(idx) {
  return GANTT_COLS.slice(0, idx).reduce((sum, c) => sum + c.width, 0)
}

// A site's assignments are either day-specific (work_date set) or apply to every
// day of the site (work_date null). Day-specific rows win for that date when present.
function assignmentsForDate(assignments, dateStr) {
  const daySpecific = (assignments || []).filter(a => a.work_date === dateStr)
  return daySpecific.length > 0 ? daySpecific : (assignments || []).filter(a => !a.work_date)
}

function namesForDate(assignments, dateStr) {
  const dayAssignments = assignmentsForDate(assignments, dateStr)
  const pic  = dayAssignments.find(a => a.assignment_role === 'PIC')
  const crew = dayAssignments.filter(a => a.assignment_role === 'crew')
  return [pic, ...crew].map(a => a?.team_members?.short_name || a?.team_members?.full_name).filter(Boolean).join(', ')
}

const LEAVE_ABBR = {
  'ANNUAL LEAVE': 'AL',
  MEDICAL: 'MC',
  'EMERGENCY LEAVE': 'EL',
  'HOSPITALIZATION LEAVE': 'HL',
  'MARRIAGE LEAVE': 'ML',
  'PARENTAL LEAVE': 'PL',
  UNPAID: 'UPL',
}
function leaveAbbr(type) {
  return LEAVE_ABBR[type] || (type || '').slice(0, 2).toUpperCase()
}

const LEGEND_ITEMS = [
  { label: 'Working day', swatch: '#86d387' },
  { label: 'Weekend', swatch: '#0f172a' },
  { label: 'Public holiday', swatch: '#2563eb' },
  { label: 'On leave (AL/MC/etc.)', swatch: '#fecaca' },
]

function GanttListView({ sitesSorted, year, month, navigate, leaves, members }) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const dayNums = Array.from({ length: lastDay }, (_, i) => i + 1)

  function dateStrOf(day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const leavesThisMonth = useMemo(() => {
    const from = dateStrOf(1)
    const to   = dateStrOf(lastDay)
    return leaves.filter(l => (l.start_date || '') <= to && (l.end_date || l.start_date || '') >= from)
  }, [leaves, year, month])

  const todayObj = new Date()
  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`
  const lastPin  = GANTT_COLS.length - 1

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div className="gantt-scroll" style={{ background: 'white', borderRadius: '14px', border: '1px solid #cbd5e1', overflow: 'auto', maxHeight: '72vh' }}>
        <table className="gantt-table" style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
          <thead>
            <tr>
              {GANTT_COLS.map((c, i) => (
                <th key={c.key} className="gantt-pin" style={{
                  position: 'sticky', top: 0, left: ganttColLeft(i), zIndex: 3,
                  width: c.width, minWidth: c.width, maxWidth: c.width,
                  background: '#1e3a5f', color: '#93c5fd', textAlign: 'left',
                  fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '.06em',
                  padding: '13px 10px', borderBottom: '2px solid #16314f',
                  borderRight: i === lastPin ? '1px solid #16314f' : '1px solid rgba(148,197,253,0.18)',
                  boxShadow: i === lastPin ? '6px 0 10px -6px rgba(15,23,42,0.35)' : 'none',
                }}>
                  {c.label}
                </th>
              ))}
              {dayNums.map(d => {
                const isSun    = new Date(year, month, d).getDay() === 0
                const holiday  = publicHolidayName(dateStrOf(d))
                const isToday  = dateStrOf(d) === todayStr
                const bg       = holiday ? '#2563eb' : (isSun ? '#0f172a' : (isToday ? '#2c4d7a' : '#1e3a5f'))
                const fg       = holiday ? '#dbeafe' : (isSun ? '#64748b' : '#93c5fd')
                return (
                  <th key={d} title={holiday || undefined} style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    width: GANTT_DAY_WIDTH, minWidth: GANTT_DAY_WIDTH,
                    background: bg, color: fg,
                    textAlign: 'center', padding: '8px 4px', borderBottom: '2px solid #16314f',
                    borderRight: '1px solid rgba(148,197,253,0.18)',
                  }}>
                    <div style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase' }}>{new Date(year, month, d).toLocaleDateString('en-MY', { weekday: 'short' })}</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', marginTop: '2px' }}>{d}</div>
                    {holiday && <div style={{ fontSize: '8px', fontWeight: '800', marginTop: '2px', color: '#bfdbfe' }}>PH</div>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sitesSorted.length === 0 ? (
              <tr>
                <td colSpan={GANTT_COLS.length + dayNums.length} style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No sites scheduled this month.
                </td>
              </tr>
            ) : (
              sitesSorted.map((site, i) => {
                const start = site.scheduled_date
                const end   = site.end_date || site.scheduled_date

                const cells = [
                  { key: 'no',      content: i + 1 },
                  { key: 'site',    content: site.site_name },
                  { key: 'company', content: site.client_company_name || '—' },
                  { key: 'details', content: site.scope_of_work || '—' },
                  { key: 'days',    content: site.site_duration_days ?? '—' },
                ]

                return (
                  <tr key={site.id} className="gantt-row">
                    {GANTT_COLS.map((c, ci) => (
                      <td
                        key={c.key}
                        className="gantt-pin"
                        onClick={() => navigate(`/sites/${site.id}`)}
                        style={{
                          position: 'sticky', left: ganttColLeft(ci), zIndex: 1,
                          width: c.width, minWidth: c.width, maxWidth: c.width,
                          background: 'white', cursor: 'pointer', verticalAlign: 'top',
                          padding: '13px 10px', borderBottom: '1px solid #e5eaf1',
                          borderRight: ci === lastPin ? '1px solid #d7dee7' : '1px solid #eef1f5',
                          boxShadow: ci === lastPin ? '6px 0 10px -6px rgba(15,23,42,0.16)' : 'none',
                          fontSize: c.key === 'site' ? '13px' : '12px',
                          fontWeight: c.key === 'site' || c.key === 'days' ? '700' : '400',
                          color: c.key === 'site' ? '#0f172a' : '#475569',
                          whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4,
                        }}
                      >
                        {c.key === 'site' && <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: STATUS_DOT[site.site_status] || '#94a3b8', marginRight: '6px' }} />}
                        {cells.find(x => x.key === c.key)?.content}
                      </td>
                    ))}
                    {dayNums.map(d => {
                      const dateStr = dateStrOf(d)
                      const active  = start && end && dateStr >= start && dateStr <= end
                      const isSun   = new Date(year, month, d).getDay() === 0
                      const holiday = publicHolidayName(dateStr)
                      const isToday = dateStr === todayStr
                      const bg      = active ? '#86d387' : (holiday ? '#93c5fd' : (isSun ? '#0f172a' : (isToday ? '#e6f0ff' : 'white')))
                      return (
                        <td key={d} style={{
                          width: GANTT_DAY_WIDTH, minWidth: GANTT_DAY_WIDTH,
                          background: bg, verticalAlign: 'middle',
                          borderBottom: '1px solid #e5eaf1', borderRight: '1px solid #eef1f5',
                          padding: '8px 6px', textAlign: 'center',
                        }}>
                          {active && <span style={{ fontSize: '9px', fontWeight: '800', color: '#000000', lineHeight: 1.3 }}>{namesForDate(site.site_assignments, dateStr)}</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}

            {leavesThisMonth.length > 0 && (
              <>
                <tr>
                  <td colSpan={GANTT_COLS.length + dayNums.length} style={{
                    background: '#fef2f2', color: '#991b1b', fontSize: '11px', fontWeight: '800',
                    textTransform: 'uppercase', letterSpacing: '.06em', padding: '9px 10px',
                    borderBottom: '1px solid #fecaca', borderTop: '2px solid #e5eaf1',
                  }}>
                    Team Leave
                  </td>
                </tr>
                {leavesThisMonth.map(leave => {
                  const member = memberById[leave.member_id]
                  const abbr   = leaveAbbr(leave.leave_type)
                  const lStart = leave.start_date
                  const lEnd   = leave.end_date || leave.start_date
                  const days   = Math.round((new Date(`${lEnd}T00:00:00`) - new Date(`${lStart}T00:00:00`)) / 86400000) + 1

                  const cells = [
                    { key: 'no',      content: '—' },
                    { key: 'site',    content: member?.short_name || member?.full_name || 'Unknown' },
                    { key: 'company', content: '—' },
                    { key: 'details', content: leave.note || leave.leave_type },
                    { key: 'days',    content: days },
                  ]

                  return (
                    <tr key={`leave-${leave.id}`} className="gantt-row">
                      {GANTT_COLS.map((c, ci) => (
                        <td key={c.key} className="gantt-pin" style={{
                          position: 'sticky', left: ganttColLeft(ci), zIndex: 1,
                          width: c.width, minWidth: c.width, maxWidth: c.width,
                          background: '#fff7f7', verticalAlign: 'top',
                          padding: '13px 10px', borderBottom: '1px solid #e5eaf1',
                          borderRight: ci === lastPin ? '1px solid #d7dee7' : '1px solid #f3e3e3',
                          boxShadow: ci === lastPin ? '6px 0 10px -6px rgba(15,23,42,0.16)' : 'none',
                          fontSize: c.key === 'site' ? '13px' : '12px',
                          fontWeight: c.key === 'site' || c.key === 'days' ? '700' : '400',
                          color: c.key === 'site' ? '#7f1d1d' : '#a16767',
                          whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4,
                        }}>
                          {c.key === 'site' && <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', marginRight: '6px' }} />}
                          {cells.find(x => x.key === c.key)?.content}
                          {c.key === 'site' && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '800', color: '#dc2626' }}>({abbr})</span>}
                        </td>
                      ))}
                      {dayNums.map(d => {
                        const dateStr = dateStrOf(d)
                        const active  = dateStr >= lStart && dateStr <= lEnd
                        const isToday = dateStr === todayStr
                        return (
                          <td key={d} style={{
                            width: GANTT_DAY_WIDTH, minWidth: GANTT_DAY_WIDTH,
                            background: active ? '#fecaca' : (isToday ? '#e6f0ff' : 'white'), verticalAlign: 'middle',
                            borderBottom: '1px solid #e5eaf1', borderRight: '1px solid #eef1f5',
                            padding: '8px 6px', textAlign: 'center',
                          }}>
                            {active && <span style={{ fontSize: '9px', fontWeight: '800', color: '#7f1d1d' }}>{abbr}</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
          {LEGEND_ITEMS.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '13px', height: '13px', borderRadius: '4px', background: item.swatch, border: '1px solid rgba(0,0,0,0.12)' }} />
              <span style={{ fontSize: '12px', color: '#475569', fontWeight: '600' }}>{item.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '13px', height: '13px', borderRadius: '4px', background: '#e6f0ff', border: '1px solid rgba(0,0,0,0.12)' }} />
            <span style={{ fontSize: '12px', color: '#475569', fontWeight: '600' }}>Today</span>
          </div>
        </div>
        <div style={{ width: '100%', height: '1px', background: '#e2e8f0' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
          {Object.entries(STATUS_DOT).map(([status, color]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: color }} />
              <span style={{ fontSize: '12px', color: '#475569', fontWeight: '600', textTransform: 'capitalize' }}>{status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const { isMobile } = useViewport()
  const today    = useMemo(() => new Date(), [])
  const [current, setCurrent]   = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [sites, setSites]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState('month') // 'month' | 'list'
  const [expanded, setExpanded] = useState(null)
  const [dayModal, setDayModal] = useState(null) // { day, ds, sites }
  const [leaves, setLeaves]     = useState([])
  const [members, setMembers]   = useState([])

  const year  = current.getFullYear()
  const month = current.getMonth()

  useEffect(() => {
    setExpanded(null)
    fetchSites()
  }, [year, month])

  useEffect(() => {
    fetchTeamLeaves().then(setLeaves).catch(() => setLeaves([]))
    supabase.from('team_members').select('id, short_name, full_name').then(({ data }) => setMembers(data || []))
  }, [])

  async function fetchSites() {
    setLoading(true)
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const last = new Date(year, month + 1, 0).getDate()
    const to   = `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    const { data } = await supabase
      .from('sites')
      .select(`id, site_name, site_type, site_status, scheduled_date, end_date, site_session, site_photo_url,
        client_company_name, scope_of_work, site_duration_days,
        site_assignments(assignment_role, work_date, team_members(id, short_name, full_name, avatar_url))`)
      .or(`and(scheduled_date.gte.${from},scheduled_date.lte.${to}),and(end_date.gte.${from},end_date.lte.${to}),and(scheduled_date.lte.${from},end_date.gte.${to})`)
      .order('scheduled_date')
    setSites(data || [])
    setLoading(false)
  }

  const days = useMemo(() => {
    const firstDow  = new Date(year, month, 1).getDay()         // 0=Sun
    const offset    = firstDow === 0 ? 6 : firstDow - 1         // Mon-based offset
    const lastDay   = new Date(year, month + 1, 0).getDate()
    const arr       = Array(offset).fill(null)
    for (let d = 1; d <= lastDay; d++) arr.push(d)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [year, month])

  const sitesByDate = useMemo(() => {
    const map = {}
    sites.forEach(s => {
      const endStr = s.end_date || s.scheduled_date
      let current = new Date(s.scheduled_date + 'T00:00:00')
      const endDate = new Date(endStr + 'T00:00:00')
      while (current <= endDate) {
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
        if (!map[dateStr]) map[dateStr] = []
        map[dateStr].push(s)
        current.setDate(current.getDate() + 1)
      }
    })
    return map
  }, [sites])

  function ds(day) {
    return day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
  }

  function isToday(day) {
    return day && today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
  }

  const monthLabel = current.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
  const agendaDays = useMemo(() => Object.entries(sitesByDate).sort((a, b) => a[0].localeCompare(b[0])), [sitesByDate])
  const sitesSorted = useMemo(() => [...sites].sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || '')), [sites])

  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 88px,#e2e8f0 88px 100%)' }}>
        <div style={{ padding: '18px 14px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Calendar</h1>
            <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '3px' }}>
              {sites.length} site{sites.length !== 1 ? 's' : ''} in {monthLabel}
            </p>
          </div>
          <button
            onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))}
            style={{ padding: '8px 12px', borderRadius: '10px', background: '#2563eb', border: 'none', color: 'white', fontSize: '12px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}
          >
            Today
          </button>
        </div>

        <div style={{ padding: '14px 14px 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #dbe3ec', borderRadius: '16px', padding: '12px 14px' }}>
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))} style={{ padding: '8px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a', cursor: 'pointer', display: 'flex' }}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>{monthLabel}</p>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Agenda view</p>
            </div>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))} style={{ padding: '8px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a', cursor: 'pointer', display: 'flex' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '240px', gap: '10px', color: '#64748b', fontSize: '14px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />
              Loading...
            </div>
          ) : agendaDays.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', padding: '28px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>No sites scheduled</p>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>This month is clear.</p>
            </div>
          ) : (
            agendaDays.map(([dateStr, daySites]) => (
              <div key={dateStr} style={{ background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>
                      {new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{daySites.length} site{daySites.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isToday(Number(dateStr.slice(-2))) ? '#2563eb' : '#cbd5e1' }} />
                </div>

                <div style={{ padding: '10px', display: 'grid', gap: '10px' }}>
                  {daySites.map((site) => {
                    const tc = TYPE_COLORS[site.site_type] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0', label: 'Site' }
                    const dayAssignments = assignmentsForDate(site.site_assignments, dateStr)
                    const pic = dayAssignments.find(a => a.assignment_role === 'PIC')
                    const crew = dayAssignments.filter(a => a.assignment_role === 'crew') || []

                    return (
                      <button
                        key={site.id}
                        onClick={() => navigate(`/sites/${site.id}`)}
                        style={{ width: '100%', textAlign: 'left', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', lineHeight: 1.4 }}>{site.site_name}</p>
                            <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{site.location}</p>
                          </div>
                          <span style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`, padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                            {tc.label}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                          <span style={{ background: '#fff', border: `1px solid ${STATUS_DOT[site.site_status] || '#cbd5e1'}`, color: '#475569', padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', textTransform: 'capitalize' }}>
                            {site.site_status}
                          </span>
                          {pic && <span style={{ fontSize: '11px', color: '#475569', fontWeight: '600' }}>PIC: {pic.team_members?.short_name || pic.team_members?.full_name}</span>}
                          {crew.length > 0 && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{crew.length} crew</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  const SHOW = 2 // max chips before "+X more"

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 100px,#c8d4e3 100px 100%)' }}>

      {/* ── Header ── */}
      <div style={{ padding: '24px 40px 0', display: 'grid', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '18px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Calendar</h1>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>
              {sites.length} site{sites.length !== 1 ? 's' : ''} this month
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', cursor: 'pointer', display: 'flex' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ color: 'white', fontWeight: '700', fontSize: '15px', minWidth: '170px', textAlign: 'center' }}>{monthLabel}</span>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', cursor: 'pointer', display: 'flex' }}>
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))}
              style={{ padding: '7px 14px', borderRadius: '8px', background: '#2563eb', border: 'none', color: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer', marginLeft: '4px' }}
            >
              Today
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '4px', marginLeft: '4px' }}>
              {['month', 'list'].map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    padding: '10px 22px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                    fontSize: '14px', fontWeight: '700', textTransform: 'capitalize',
                    background: view === v ? '#2563eb' : 'transparent',
                    color: view === v ? 'white' : '#94a3b8',
                    transition: 'background-color .15s ease, color .15s ease',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Grid ── */}
      <div style={{ padding: '20px 40px 48px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>

        {/* Calendar */}
        <div style={{ flex: 1, minWidth: 0 }}>

        {view === 'list' ? (
          loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', gap: '10px', color: '#64748b', fontSize: '14px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />
              Loading…
            </div>
          ) : (
            <GanttListView sitesSorted={sitesSorted} year={year} month={month} navigate={navigate} leaves={leaves} members={members} />
          )
        ) : (
        <>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px', background: '#1e3a5f', borderRadius: '10px', padding: '2px' }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding: '12px 0', textAlign: 'center', fontSize: '14px', fontWeight: '700', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>
          ))}
        </div>

        {/* Cells */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', gap: '10px', color: '#64748b', fontSize: '14px' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />
            Loading…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {days.map((day, idx) => {
              const dateStr  = ds(day)
              const daySites = dateStr ? (sitesByDate[dateStr] || []) : []
              const isExp    = expanded === dateStr
              const visible  = isExp ? daySites : daySites.slice(0, SHOW)
              const overflow = daySites.length - SHOW
              const todayCell = isToday(day)

              return (
                <div
                  key={idx}
                  style={{
                    minHeight: '100px',
                    background:    day ? (todayCell ? '#dbeafe' : '#f8fafc') : 'transparent',
                    borderRadius:  day ? '10px' : '0',
                    border:        day ? (todayCell ? '2px solid #2563eb' : '1px solid #cbd5e1') : 'none',
                    padding:       day ? '8px' : '0',
                    display:       'flex',
                    flexDirection: 'column',
                    gap:           '3px',
                  }}
                >
                  {day && (
                    <>
                      {/* Date number */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <div style={{
                          width: '22px', height: '22px', borderRadius: '50%',
                          background: todayCell ? '#2563eb' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: todayCell ? '800' : '600',
                          color: todayCell ? 'white' : '#0f172a',
                          flexShrink: 0,
                        }}>
                          {day}
                        </div>
                        {daySites.length > 0 && (
                          <button
                            onClick={() => setDayModal({ day, dateStr, sites: daySites })}
                            style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer' }}
                          >
                            {daySites.length}
                          </button>
                        )}
                      </div>

                      {/* Site chips */}
                      {visible.map(site => {
                        const tc   = TYPE_COLORS[site.site_type] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' }
                        const dayAssignments = assignmentsForDate(site.site_assignments, dateStr)
                        const pic  = dayAssignments.find(a => a.assignment_role === 'PIC')
                        const crew = dayAssignments.filter(a => a.assignment_role === 'crew') || []
                        const picName = pic?.team_members?.short_name || pic?.team_members?.full_name?.split(' ')[0]

                        return (
                          <div
                            key={site.id}
                            onClick={() => navigate(`/sites/${site.id}`)}
                            style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', border: `1px solid ${tc.border}` }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                          >
                            {/* Photo background */}
                            {site.site_photo_url && (
                              <img
                                src={site.site_photo_url}
                                alt=""
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                              />
                            )}
                            {/* Dark overlay so text is always readable */}
                            <div style={{ position: 'absolute', inset: 0, background: site.site_photo_url ? 'linear-gradient(160deg,rgba(0,0,0,0.62) 0%,rgba(0,0,0,0.38) 100%)' : tc.bg, pointerEvents: 'none' }} />

                            {/* Content */}
                            <div style={{ position: 'relative', padding: '4px 6px' }}>
                            {/* Site name */}
                            <p style={{ fontSize: '10px', fontWeight: '700', color: site.site_photo_url ? '#ffffff' : tc.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3, textShadow: site.site_photo_url ? '0 1px 3px rgba(0,0,0,0.6)' : 'none' }}>
                              {site.site_name}
                            </p>

                            {/* PIC + crew avatars */}
                            {(pic || crew.length > 0) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '4px' }}>
                                {/* PIC */}
                                {pic && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                                    <Avatar name={picName} size={14} />
                                    <span style={{ fontSize: '9px', fontWeight: '600', color: site.site_photo_url ? '#e2e8f0' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '48px', textShadow: site.site_photo_url ? '0 1px 2px rgba(0,0,0,0.6)' : 'none' }}>{picName}</span>
                                  </div>
                                )}
                                {/* Crew avatars stacked */}
                                {crew.length > 0 && (
                                  <div style={{ display: 'flex', marginLeft: '2px' }}>
                                    {crew.slice(0, 3).map((a, i) => (
                                      <div key={a.team_members?.id || i} style={{ marginLeft: i === 0 ? 0 : '-5px', zIndex: 3 - i }}>
                                        <Avatar name={a.team_members?.short_name || a.team_members?.full_name?.split(' ')[0]} size={14} />
                                      </div>
                                    ))}
                                    {crew.length > 3 && (
                                      <div style={{ marginLeft: '-5px', width: '14px', height: '14px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: '700', color: '#64748b', border: '1.5px solid white' }}>
                                        +{crew.length - 3}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            </div>{/* end content */}
                          </div>
                        )
                      })}

                      {/* +X more / show less */}
                      {!isExp && overflow > 0 && (
                        <button onClick={() => setExpanded(dateStr)} style={{ fontSize: '10px', fontWeight: '600', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '1px 2px' }}>
                          +{overflow} more
                        </button>
                      )}
                      {isExp && daySites.length > SHOW && (
                        <button onClick={() => setExpanded(null)} style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '1px 2px' }}>
                          show less
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '16px', justifyContent: 'flex-end' }}>
          {Object.values(TYPE_COLORS).map(tc => (
            <div key={tc.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: tc.bg, border: `1px solid ${tc.border}` }} />
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>{tc.label}</span>
            </div>
          ))}
        </div>
        </>
        )}
        </div>{/* end calendar col */}
      </div>

      {/* ── Day modal (tap the count badge) ── */}
      {dayModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '24px' }}
          onClick={e => e.target === e.currentTarget && setDayModal(null)}
        >
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,.2)' }}>
            {/* Modal header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>
                  {new Date(dayModal.dateStr + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>{dayModal.sites.length} site{dayModal.sites.length !== 1 ? 's' : ''} scheduled</p>
              </div>
              <button onClick={() => setDayModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Site list */}
            <div style={{ overflowY: 'auto', padding: '12px 0' }}>
              {dayModal.sites.map(site => {
                const tc   = TYPE_COLORS[site.site_type] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0', label: site.site_type }
                const dayAssignments = assignmentsForDate(site.site_assignments, dayModal.dateStr)
                const pic  = dayAssignments.find(a => a.assignment_role === 'PIC')
                const crew = dayAssignments.filter(a => a.assignment_role === 'crew') || []

                return (
                  <div
                    key={site.id}
                    onClick={() => { navigate(`/sites/${site.id}`); setDayModal(null) }}
                    style={{ padding: '12px 22px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Site name + type */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_DOT[site.site_status] || '#94a3b8', flexShrink: 0 }} />
                      <p style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a', flex: 1 }}>{site.site_name}</p>
                      <span style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`, padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap' }}>{tc.label}</span>
                    </div>

                    {/* PIC */}
                    {pic && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: crew.length > 0 ? '6px' : 0 }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '28px' }}>PIC</span>
                        <Avatar name={pic.team_members?.short_name || pic.team_members?.full_name?.split(' ')[0]} size={20} />
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>{pic.team_members?.full_name}</span>
                      </div>
                    )}

                    {/* Crew */}
                    {crew.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '28px' }}>Crew</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          {crew.map((a, i) => (
                            <div key={a.team_members?.id || i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Avatar name={a.team_members?.short_name || a.team_members?.full_name?.split(' ')[0]} size={20} />
                              <span style={{ fontSize: '12px', color: '#64748b' }}>{a.team_members?.full_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
