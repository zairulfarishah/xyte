import { dayHighlightHex, dayInfo, formatTime12, isMissingDay, LEAVE_HIGHLIGHTS } from './timecard'
import { leaveAbbr, getLeaveSessionLabel } from './teamLeaves'

// Hours go in as decimal numbers so payroll can sum them in Excel.
const hours = mins => (mins ? Math.round((mins / 60) * 100) / 100 : 0)

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF2F7' } }
const OFF_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBEDF2' } }
const solidFill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex.slice(1)}` } })
const THIN ={ style: 'thin', color: { argb: 'FFCBD5E1' } }
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const HRS_FMT = '0.00'

function slotsOf(card) {
  if (Array.isArray(card?.segments) && card.segments.length > 0) return card.segments
  return card && (card.time_in || card.time_out) ? [{ time_in: card.time_in, time_out: card.time_out, site_id: card.site_id }] : []
}

function fmtDate(d, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY', opts)
}

// Excel sheet names: max 31 chars, no []:*?/\ and unique within the workbook.
function sheetName(name, used) {
  const base = (name || 'Member').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Member'
  let n = base, i = 2
  while (used.has(n.toLowerCase())) n = `${base} ${i++}`
  used.add(n.toLowerCase())
  return n
}

function styleHeader(row) {
  row.eachCell(c => {
    c.font = { bold: true }
    c.fill = HEAD_FILL
    c.border = BORDER
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  row.height = 20
}

const SUMMARY_COLS = [
  { key: 'days',       header: 'Days worked',      width: 12 },
  { key: 'leaveDays',  header: 'Leave days',       width: 11 },
  { key: 'normal',     header: 'Normal (hrs)',     width: 13, hours: true },
  { key: 'otWeekday',  header: 'OT weekday (hrs)', width: 15, hours: true },
  { key: 'otSaturday', header: 'OT Sat (hrs)',     width: 13, hours: true },
  { key: 'otOff',      header: 'OT Sun & PH (hrs)', width: 16, hours: true },
  { key: 'ot',         header: 'Total OT (hrs)',   width: 14, hours: true },
  { key: 'missing',    header: 'Missing days',     width: 12 },
]

//   entries: [{ member, cardsByDate, leaveOn(date), summary }] — same shape as buildTimecardPdf.
// A Summary sheet when there's more than one member, then one sheet per member.
export async function buildTimecardXlsx({ entries, dates, from, to, today, siteName }) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const used = new Set()
  const period = `${fmtDate(from)} - ${fmtDate(to)}`

  if (entries.length > 1) {
    const ws = wb.addWorksheet(sheetName('Summary', used), { views: [{ state: 'frozen', ySplit: 4 }] })
    ws.columns = [{ width: 28 }, { width: 18 }, ...SUMMARY_COLS.map(c => ({ width: c.width }))]
    ws.addRow(['TIMECARD SUMMARY']).font = { bold: true, size: 14 }
    ws.addRow([`Period: ${period}`, '', '', `Generated: ${fmtDate(today)}`])
    ws.addRow([])
    styleHeader(ws.addRow(['Member', 'Position', ...SUMMARY_COLS.map(c => c.header)]))

    const first = ws.rowCount + 1
    for (const { member, summary } of entries) {
      const row = ws.addRow([member.full_name || '', member.role || '',
        ...SUMMARY_COLS.map(c => (c.hours ? hours(summary[c.key]) : summary[c.key] || 0))])
      row.eachCell({ includeEmpty: true }, c => { c.border = BORDER })
    }
    const last = ws.rowCount
    const total = ws.addRow(['Team total', '', ...SUMMARY_COLS.map((c, i) => {
      const col = ws.getColumn(i + 3).letter
      return { formula: `SUM(${col}${first}:${col}${last})` }
    })])
    total.eachCell({ includeEmpty: true }, c => { c.font = { bold: true }; c.fill = HEAD_FILL; c.border = BORDER })
    SUMMARY_COLS.forEach((c, i) => { if (c.hours) ws.getColumn(i + 3).numFmt = HRS_FMT })
  }

  for (const entry of entries) addMemberSheet(wb, entry, { dates, period, today, siteName, used })

  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf)
}

function addMemberSheet(wb, { member, cardsByDate, leaveOn, summary }, { dates, period, today, siteName, used }) {
  const ws = wb.addWorksheet(sheetName(member.full_name, used), { views: [{ state: 'frozen', ySplit: 6 }] })
  ws.columns = [
    { width: 13 }, { width: 7 }, { width: 11 }, { width: 11 }, { width: 28 },
    { width: 13 }, { width: 11 }, { width: 44 },
  ]
  ws.addRow(['TIMECARD & OVERTIME RECORD']).font = { bold: true, size: 14 }
  ws.addRow(['Name:', member.full_name || '-', '', '', 'Position:', member.role || '-'])
  ws.addRow(['Period:', period, '', '', 'Generated:', fmtDate(today)])
  for (const r of [2, 3]) { ws.getCell(r, 1).font = { bold: true }; ws.getCell(r, 5).font = { bold: true } }
  ws.addRow(['Office hours: Mon-Fri 8:00 AM - 5:30 PM, Sat 8:00 AM - 1:00 PM. Lunch 1:00 PM - 2:30 PM is not counted. Time outside office hours, and any work on Sundays or public holidays, is OT.'])
    .font = { italic: true, size: 9, color: { argb: 'FF64748B' } }
  // Colour key for the automatic leave highlights
  const key = ws.addRow(['Key:', LEAVE_HIGHLIGHTS.leave.label, LEAVE_HIGHLIGHTS.medical.label])
  key.font = { size: 9 }
  key.getCell(1).font = { size: 9, bold: true }
  key.getCell(2).fill = solidFill(LEAVE_HIGHLIGHTS.leave.hex)
  key.getCell(3).fill = solidFill(LEAVE_HIGHLIGHTS.medical.hex)
  styleHeader(ws.addRow(['Date', 'Day', 'Time in', 'Time out', 'Site', 'Normal (hrs)', 'OT (hrs)', 'Remarks']))

  for (const date of dates) {
    const card = cardsByDate[date]
    const leave = leaveOn(date)
    const info = dayInfo(date)
    const offDay = info.kind === 'holiday' || info.kind === 'off'
    const slots = slotsOf(card)
    const mark = dayHighlightHex(card, leave)

    const notes = []
    if (info.kind === 'holiday') notes.push(info.label)
    else if (info.kind === 'off' && !card) notes.push('Off day')
    if (leave) notes.push(`${leaveAbbr(leave.leave_type)} (${getLeaveSessionLabel(leave.leave_session)})`)
    if (isMissingDay(date, today, card, leave)) notes.push('No time keyed in')
    if (card?.remarks) notes.push(card.remarks)

    // Multiple time slots on a day stack inside the same cell, one per line.
    const lines = n => slots.map(n).join('\n')
    const row = ws.addRow([
      new Date(`${date}T00:00:00Z`),
      fmtDate(date, { weekday: 'short' }),
      lines(s => formatTime12(s.time_in) || '?'),
      lines(s => formatTime12(s.time_out) || '?'),
      lines(s => (s.site_id && siteName(s.site_id)) || 'Office'),
      card ? hours(card.normal_minutes) : null,
      card ? hours(card.ot_minutes) : null,
      notes.join('; '),
    ])
    row.getCell(1).numFmt = 'dd-mmm-yyyy'
    row.eachCell({ includeEmpty: true }, c => {
      c.border = BORDER
      c.alignment = { vertical: 'top', wrapText: true }
      // A highlight picked on the timecard, or leave, wins over the off-day grey
      if (mark) c.fill = solidFill(mark)
      else if (offDay) c.fill = OFF_FILL
    })
    if (card?.ot_minutes) row.getCell(7).font = { bold: true }
  }
  ws.getColumn(6).numFmt = HRS_FMT
  ws.getColumn(7).numFmt = HRS_FMT

  ws.addRow([])
  const totals = [
    ['Days worked', summary.days || 0],
    ['Leave days', summary.leaveDays || 0],
    ['Normal (hrs)', hours(summary.normal)],
    ['OT weekday (hrs)', hours(summary.otWeekday)],
    ['OT Saturday (hrs)', hours(summary.otSaturday)],
    ['OT Sun & PH (hrs)', hours(summary.otOff)],
    ['TOTAL OT (hrs)', hours(summary.ot)],
  ]
  for (const [label, value] of totals) {
    const row = ws.addRow(['', '', '', '', label, value])
    row.getCell(5).font = { bold: true }
    row.getCell(6).font = { bold: label.startsWith('TOTAL') }
    row.getCell(6).numFmt = label.includes('hrs') ? HRS_FMT : '0'
  }
}

export function timecardXlsxFilename(from, to, member) {
  const who = member ? member.full_name.replace(/[^\w]+/g, '-') : 'All-Members'
  return `Timecard-${who}-${from}-to-${to}.xlsx`
}

export function downloadXlsx(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
