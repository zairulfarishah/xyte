import { isActiveMember } from '../utils/members'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react'
import { fetchTeamLeaves, getMemberLeaveOnDate } from '../utils/teamLeaves'
import { normalizeDate } from '../utils/siteDays'
import { formatMinutes, rangeDates, summarizeTimecards } from '../utils/timecard'
import { buildTimecardPdf, timecardPdfFilename, downloadPdf } from '../utils/timecardPdf'
import { buildTimecardXlsx, timecardXlsxFilename, downloadXlsx } from '../utils/timecardExcel'

function monthBounds(offset) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { from: normalizeDate(first), to: normalizeDate(last) }
}

// HR pay period runs from the 26th to the 25th of the next month
const PAY_START_DAY = 26
function payPeriod(offset) {
  const now = new Date()
  const shift = now.getDate() >= PAY_START_DAY ? 1 : 0 // on/after the 26th we're in next month's period
  const first = new Date(now.getFullYear(), now.getMonth() + shift + offset - 1, PAY_START_DAY)
  const last = new Date(now.getFullYear(), now.getMonth() + shift + offset, PAY_START_DAY - 1)
  return { from: normalizeDate(first), to: normalizeDate(last) }
}

const PRESETS = [
  { key: 'pay', label: 'This pay period', range: () => payPeriod(0) },
  { key: 'lastPay', label: 'Last pay period', range: () => payPeriod(-1) },
  { key: 'this', label: 'This month', range: () => monthBounds(0) },
  { key: 'last', label: 'Last month', range: () => monthBounds(-1) },
]

const COLS = [
  { key: 'days',       label: 'Days worked' },
  { key: 'leaveDays',  label: 'Leave' },
  { key: 'normal',     label: 'Normal',     hours: true },
  { key: 'otWeekday',  label: 'OT weekday', hours: true, ot: true },
  { key: 'otSaturday', label: 'OT Sat',     hours: true, ot: true },
  { key: 'otOff',      label: 'OT Sun & PH', hours: true, ot: true },
  { key: 'ot',         label: 'Total OT',   hours: true, ot: true, strong: true },
  { key: 'missing',    label: 'Missing' },
]

// Zairul only — payroll totals per member plus printable timecards.
export default function TimecardSummary() {
  const [range, setRange]     = useState(() => payPeriod(0))
  const [members, setMembers] = useState([])
  const [sites, setSites]     = useState([])
  const [leaves, setLeaves]   = useState([])
  const [cards, setCards]     = useState([])
  const [loadedKey, setLoadedKey] = useState(null)
  const [error, setError]     = useState('')
  const [exporting, setExporting] = useState(null)    // `${format}:${member id | 'all'}`

  const { from, to } = range
  const validRange = from && to && from <= to
  const loadKey = `${from}|${to}`
  const loading = validRange && loadedKey !== loadKey
  const dates = useMemo(() => validRange ? rangeDates(from, to) : [], [from, to, validRange])
  const today = normalizeDate(new Date())

  useEffect(() => {
    Promise.all([
      supabase.from('team_members').select('id, full_name, short_name, role, is_hidden').order('full_name'),
      supabase.from('sites').select('id, site_name'),
      fetchTeamLeaves().catch(() => []),
    ]).then(([m, s, l]) => {
      setMembers(m.data || [])
      setSites(s.data || [])
      setLeaves(l)
    })
  }, [])

  useEffect(() => {
    if (!validRange) return
    let cancelled = false
    supabase
      .from('timecards')
      .select('*')
      .gte('work_date', from)
      .lte('work_date', to)
      .then(({ data, error: err }) => {
        if (cancelled) return
        setError(err ? err.message : '')
        setCards(data || [])
        setLoadedKey(`${from}|${to}`)
      })
    return () => { cancelled = true }
  }, [from, to, validRange])

  const entries = useMemo(() => {
    const byMember = {}
    for (const c of cards) (byMember[c.member_id] ||= {})[c.work_date] = c
    // Former members only show for periods where they clocked time
    return members.filter(m => isActiveMember(m) || byMember[m.id]).map(member => {
      const cardsByDate = byMember[member.id] || {}
      const leaveOn = date => getMemberLeaveOnDate(leaves, member.id, date)
      return { member, cardsByDate, leaveOn, summary: summarizeTimecards(dates, cardsByDate, leaveOn, today) }
    })
  }, [members, cards, leaves, dates, today])

  const team = useMemo(() => {
    const t = Object.fromEntries(COLS.map(c => [c.key, 0]))
    for (const e of entries) for (const c of COLS) t[c.key] += e.summary[c.key]
    return t
  }, [entries])

  async function exportFile(format, which) {
    const list = which === 'all' ? entries : entries.filter(e => e.member.id === which)
    if (list.length === 0) return
    setExporting(`${format}:${which}`)
    setError('')
    try {
      const siteNames = Object.fromEntries(sites.map(s => [s.id, s.site_name]))
      const args = { entries: list, dates, from, to, today, siteName: id => siteNames[id] }
      const member = which === 'all' ? null : list[0].member
      if (format === 'xlsx') downloadXlsx(await buildTimecardXlsx(args), timecardXlsxFilename(from, to, member))
      else downloadPdf(await buildTimecardPdf(args), timecardPdfFilename(from, to, member))
    } catch (err) {
      setError(`Could not build the ${format === 'xlsx' ? 'Excel file' : 'PDF'}: ${err.message}`)
    } finally {
      setExporting(null)
    }
  }

  const presetKey = PRESETS.find(p => { const r = p.range(); return r.from === from && r.to === to })?.key

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Range picker + export all */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4, background: 'white', borderRadius: 999, padding: 4, boxShadow: '0 2px 8px rgba(15,23,42,0.08)' }}>
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setRange(p.range())}
              style={{ padding: '7px 14px', border: 'none', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: presetKey === p.key ? '#2563eb' : 'transparent', color: presetKey === p.key ? 'white' : '#334155' }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', borderRadius: 999, padding: '4px 12px', boxShadow: '0 2px 8px rgba(15,23,42,0.08)', fontSize: 13, color: '#475569' }}>
          <input type="date" value={from} max={to} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} style={dateInput} />
          <span>to</span>
          <input type="date" value={to} min={from} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} style={dateInput} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => exportFile('xlsx', 'all')} disabled={!!exporting || loading || !validRange}
            style={{ ...allBtn, background: '#15803d', opacity: exporting || loading ? 0.6 : 1 }}>
            {exporting === 'xlsx:all' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} All members Excel
          </button>
          <button onClick={() => exportFile('pdf', 'all')} disabled={!!exporting || loading || !validRange}
            style={{ ...allBtn, background: '#0f172a', opacity: exporting || loading ? 0.6 : 1 }}>
            {exporting === 'pdf:all' ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} All members PDF
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '10px 14px', fontSize: 13.5 }}>{error}</div>}
      {!validRange && <div style={{ fontSize: 13.5, color: '#b91c1c' }}>Pick a start date on or before the end date.</div>}

      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 10px rgba(15,23,42,0.06)', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ ...th, textAlign: 'left', paddingLeft: 18 }}>Member</th>
              {COLS.map(c => <th key={c.key} style={th}>{c.label}</th>)}
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COLS.length + 2} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
            ) : entries.map(({ member, summary }) => (
              <tr key={member.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ ...td, textAlign: 'left', paddingLeft: 18, fontWeight: 700, color: '#0f172a' }}>{member.full_name}</td>
                {COLS.map(c => <SummaryCell key={c.key} col={c} value={summary[c.key]} />)}
                <td style={{ ...td, paddingRight: 14 }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button onClick={() => exportFile('xlsx', member.id)} disabled={!!exporting} title={`Download ${member.full_name}'s timecard as Excel`}
                      style={{ ...rowBtn, color: '#15803d' }}>
                      {exporting === `xlsx:${member.id}` ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Excel
                    </button>
                    <button onClick={() => exportFile('pdf', member.id)} disabled={!!exporting} title={`Download ${member.full_name}'s timecard as PDF`}
                      style={{ ...rowBtn, color: '#1d4ed8' }}>
                      {exporting === `pdf:${member.id}` ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} PDF
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {!loading && entries.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <td style={{ ...td, textAlign: 'left', paddingLeft: 18, fontWeight: 800, color: '#0f172a' }}>Team total</td>
                {COLS.map(c => <SummaryCell key={c.key} col={c} value={team[c.key]} bold />)}
                <td style={td} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p style={{ fontSize: 12, color: '#64748b' }}>
        OT is split by the day it was worked: weekday (before 8:00 AM / after 5:30 PM), Saturday (after 1:00 PM) and Sundays & public holidays (all hours).
        Pay period runs from the 26th to the 25th. Days given a highlight colour on the Timecard keep that colour in the Excel and PDF.
        Missing = past working days with no time keyed in and no full-day leave. Each PDF has a signature block for the employee and approver.
        Excel hours are decimals (1.50 = 1h 30m) so they can be summed; the all-members file has a Summary sheet plus one sheet per member.
      </p>
    </div>
  )
}

function SummaryCell({ col, value, bold }) {
  const text = col.hours ? (value ? formatMinutes(value) : '–') : (value || '–')
  let color = '#334155'
  if (col.ot && value) color = '#ea580c'
  if (col.key === 'missing' && value) color = '#b91c1c'
  if (!value) color = '#94a3b8'
  return <td style={{ ...td, color, fontWeight: bold || col.strong ? 800 : 500 }}>{text}</td>
}

const th = { padding: '12px 10px', fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'right', whiteSpace: 'nowrap' }
const td = { padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }
const allBtn = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', border: 'none', borderRadius: 999, cursor: 'pointer', fontSize: 13.5, fontWeight: 800, color: 'white' }
const rowBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', border: '1px solid #cbd5e1', borderRadius: 999, background: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const dateInput = { border: 'none', fontSize: 13, color: '#0f172a', fontFamily: 'inherit', background: 'transparent', padding: '4px 0' }
