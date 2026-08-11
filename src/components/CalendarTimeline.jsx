import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getHoliday } from '../utils/holidays'
import { parseCompletionMeta } from '../utils/completionMeta'
import { isDateWithinLeave } from '../utils/teamLeaves'
import { crewForDate, getSiteDates, picForDate } from '../utils/siteDays'

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const STATUS_TEXT = {
  upcoming:  '#b45309',
  ongoing:   '#1d4ed8',
  completed: '#15803d',
  cancelled: '#dc2626',
  postponed: '#64748b',
}

const TYPE_DOT = {
  site_scanning: '#2563eb',
  site_visit:    '#0d9488',
  meeting:       '#7c3aed',
}

const LEAVE_ABBR = {
  'ANNUAL LEAVE':          'AL',
  'EMERGENCY LEAVE':       'EL',
  'HOSPITALIZATION LEAVE': 'HL',
  'MARRIAGE LEAVE':        'ML',
  'MEDICAL':               'MC',
  'PARENTAL LEAVE':        'PL',
  'UNPAID':                'UP',
}

// Column widths — the first two are frozen, the rest scroll with the day columns.
const W = { no: 38, site: 186, company: 132, details: 152, do: 74, status: 84, target: 60, actual: 60, variant: 54, remark: 104, day: 96 }

const SUNDAY_BG  = '#0b1220'
const HOLIDAY_BG = '#4a90d9'
const BAR_BG     = '#a9d18e'
const BAR_TEXT   = '#1f5014'

function pad(n) {
  return String(n).padStart(2, '0')
}

function shortName(member) {
  return member?.short_name || member?.full_name?.split(' ')[0] || '—'
}

// Working days in the span (Sundays and public holidays don't count).
function countWorkingDays(startStr, endStr) {
  if (!startStr) return null
  const start = new Date(`${startStr}T00:00:00`)
  const end   = new Date(`${(endStr || startStr)}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null

  let days = 0
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const ds = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
    if (day.getDay() === 0 || getHoliday(ds)) continue
    days += 1
  }
  return days
}

function actualDays(site) {
  const start = site.scheduled_date
  const end   = site.end_date || site.scheduled_date
  if (!start) return null
  if (start === end) return site.site_session === 'Full Day' ? 1 : 0.5
  return countWorkingDays(start, end)
}

function round1(value) {
  return Math.round(value * 10) / 10
}

export default function CalendarTimeline({ year, month, sites, leaves = [], members = [], today }) {
  const navigate = useNavigate()

  const columns = useMemo(() => {
    const lastDay = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: lastDay }, (_, i) => {
      const day = i + 1
      const date = new Date(year, month, day)
      const ds   = `${year}-${pad(month + 1)}-${pad(day)}`
      const holiday = getHoliday(ds)
      const sunday  = date.getDay() === 0
      return {
        day,
        ds,
        weekday: WEEKDAY_LONG[date.getDay()],
        label: `${day}-${date.toLocaleDateString('en-MY', { month: 'short' })}`,
        sunday,
        holiday,
        tint: sunday ? SUNDAY_BG : holiday ? HOLIDAY_BG : null,
        isToday: today.getFullYear() === year && today.getMonth() === month && today.getDate() === day,
      }
    })
  }, [year, month, today])

  const rows = useMemo(() => {
    return [...sites]
      .sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)))
      .map(site => {
        const meta = parseCompletionMeta(site.notes)
        // A site can carry a different crew each day, so names are resolved per column
        const assignments = site.site_assignments || []
        const namesByDate = {}
        getSiteDates(site).forEach(date => {
          namesByDate[date] = [picForDate(assignments, date), ...crewForDate(assignments, date)]
            .filter(Boolean)
            .map(a => shortName(a.team_members))
        })

        const target = site.site_duration_days != null ? Number(site.site_duration_days) : null
        const actual = actualDays(site)

        return {
          site,
          namesByDate,
          start: site.scheduled_date,
          end: site.end_date || site.scheduled_date,
          doLabel: meta.deliveryOrderNumber
            ? 'Submitted'
            : site.report_status === 'not_applicable' ? 'N/A' : '—',
          remark: meta.completionReason || meta.baseNotes || '',
          target,
          actual,
          variant: target != null && actual != null ? round1(target - actual) : null,
        }
      })
  }, [sites])

  // memberId -> short name, for the unavailability strip
  const memberById = useMemo(() => {
    const map = {}
    members.forEach(m => { map[m.id] = shortName(m) })
    return map
  }, [members])

  const unavailableByDate = useMemo(() => {
    const map = {}
    columns.forEach(col => {
      const entries = leaves
        .filter(leave => isDateWithinLeave(col.ds, leave))
        .map(leave => `${memberById[leave.member_id] || 'Member'} (${LEAVE_ABBR[leave.leave_type] || 'LV'})`)
      if (entries.length > 0) map[col.ds] = entries
    })
    return map
  }, [columns, leaves, memberById])

  const hasUnavailable = Object.keys(unavailableByDate).length > 0

  const th = {
    background: '#1e3a5f',
    color: '#93c5fd',
    fontSize: '11px',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: '.05em',
    padding: '8px 6px',
    border: '1px solid #2c4f7c',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 3,
  }
  const td = {
    border: '1px solid #d7dee8',
    padding: '6px 7px',
    fontSize: '11px',
    color: '#0f172a',
    background: 'white',
    verticalAlign: 'middle',
  }
  const frozen = (left, z) => ({ position: 'sticky', left, zIndex: z })
  // Edge on the last frozen column so scrolled day columns visibly pass underneath.
  const frozenEdge = { boxShadow: '3px 0 6px -2px rgba(15,23,42,.28)' }

  return (
    <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'auto', maxHeight: 'calc(100vh - 210px)', boxShadow: '0 8px 24px rgba(2,8,23,.10)' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: 'max-content' }}>
        <colgroup>
          <col style={{ width: W.no }} />
          <col style={{ width: W.site }} />
          <col style={{ width: W.company }} />
          <col style={{ width: W.details }} />
          <col style={{ width: W.do }} />
          <col style={{ width: W.status }} />
          <col style={{ width: W.target }} />
          <col style={{ width: W.actual }} />
          <col style={{ width: W.variant }} />
          <col style={{ width: W.remark }} />
          {columns.map(col => <col key={col.ds} style={{ width: W.day }} />)}
        </colgroup>

        <thead>
          <tr>
            <th rowSpan={2} style={{ ...th, ...frozen(0, 5) }}>No.</th>
            <th rowSpan={2} style={{ ...th, ...frozen(W.no, 5), ...frozenEdge, textAlign: 'left' }}>Site</th>
            <th rowSpan={2} style={th}>Company</th>
            <th rowSpan={2} style={th}>Project Details</th>
            <th rowSpan={2} style={th}>DO</th>
            <th rowSpan={2} style={th}>Status</th>
            <th rowSpan={2} style={th}>Target Day</th>
            <th rowSpan={2} style={th}>Actual Day</th>
            <th rowSpan={2} style={th}>Variant</th>
            <th rowSpan={2} style={th}>Remark</th>
            {columns.map(col => (
              <th key={col.ds} title={col.holiday || undefined} style={{ ...th, height: '32px', boxSizing: 'border-box', color: col.isToday ? '#ffffff' : '#93c5fd' }}>
                {col.weekday}
              </th>
            ))}
          </tr>
          <tr>
            {columns.map(col => (
              <th
                key={col.ds}
                title={col.holiday || undefined}
                style={{
                  ...th,
                  top: '32px',
                  background: col.isToday ? '#2563eb' : col.tint || '#1e3a5f',
                  color: col.tint || col.isToday ? '#ffffff' : '#e2e8f0',
                  fontSize: '10px',
                }}
              >
                {col.label}
                {col.holiday && <span style={{ display: 'block', fontSize: '9px', opacity: 0.9 }}>PH</span>}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={10 + columns.length} style={{ ...td, textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>
                No sites scheduled this month.
              </td>
            </tr>
          )}

          {rows.map((row, idx) => (
            <tr key={row.site.id}>
              <td style={{ ...td, ...frozen(0, 2), textAlign: 'center', color: '#64748b', fontWeight: '700' }}>{idx + 1}</td>
              <td
                style={{ ...td, ...frozen(W.no, 2), ...frozenEdge, cursor: 'pointer' }}
                onClick={() => navigate(`/sites/${row.site.id}`)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: TYPE_DOT[row.site.site_type] || '#94a3b8', flexShrink: 0 }} />
                  <span style={{ fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase', fontSize: '10.5px', lineHeight: 1.35 }}>
                    {row.site.site_name}
                  </span>
                </span>
              </td>
              <td style={{ ...td, fontWeight: '700', color: '#15803d' }}>{row.site.client_company_name || '—'}</td>
              <td style={{ ...td, color: '#334155' }}>{row.site.scope_of_work || '—'}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: '700', color: row.doLabel === 'Submitted' ? '#1d4ed8' : '#94a3b8' }}>{row.doLabel}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: '700', textTransform: 'capitalize', color: STATUS_TEXT[row.site.site_status] || '#475569' }}>
                {row.site.site_status}
              </td>
              <td style={{ ...td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.target ?? '—'}</td>
              <td style={{ ...td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.actual ?? '—'}</td>
              <td style={{ ...td, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: row.variant ? '800' : '400', color: row.variant ? '#dc2626' : '#94a3b8' }}>
                {row.variant ?? '—'}
              </td>
              <td style={{ ...td, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.remark}>
                {row.remark || ''}
              </td>

              {columns.map(col => {
                // Non-working columns stay blacked out / tinted, matching the planner sheet.
                if (col.tint) return <td key={col.ds} style={{ ...td, background: col.tint, padding: 0 }} />

                const active = row.start && col.ds >= row.start && col.ds <= row.end
                if (!active) return <td key={col.ds} style={{ ...td, background: col.isToday ? '#eff6ff' : 'white' }} />

                const dayNames = row.namesByDate[col.ds] || []

                return (
                  <td
                    key={col.ds}
                    onClick={() => navigate(`/sites/${row.site.id}`)}
                    title={dayNames.join(', ')}
                    style={{
                      ...td,
                      background: BAR_BG,
                      color: BAR_TEXT,
                      fontWeight: '700',
                      fontSize: '10px',
                      textAlign: 'center',
                      lineHeight: 1.3,
                      cursor: 'pointer',
                    }}
                  >
                    {dayNames.length > 0 ? dayNames.join(', ') : '—'}
                  </td>
                )
              })}
            </tr>
          ))}

          {hasUnavailable && (
            <tr>
              <td style={{ ...td, ...frozen(0, 2), background: '#fef2f2' }} />
              <td style={{ ...td, ...frozen(W.no, 2), ...frozenEdge, background: '#fef2f2', fontWeight: '800', color: '#dc2626', fontSize: '10.5px' }}>
                (UNAVAILABLE)
              </td>
              <td colSpan={8} style={{ ...td, background: '#fef2f2' }} />
              {columns.map(col => (
                <td
                  key={col.ds}
                  style={{
                    ...td,
                    background: col.tint || '#fef2f2',
                    textAlign: 'center',
                    color: '#dc2626',
                    fontWeight: '700',
                    fontSize: '10px',
                    lineHeight: 1.4,
                    padding: col.tint ? 0 : '6px 4px',
                  }}
                >
                  {!col.tint && (unavailableByDate[col.ds] || []).map(entry => (
                    <div key={entry}>{entry}</div>
                  ))}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
