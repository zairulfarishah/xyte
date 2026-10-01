import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { sanitize, wrap, drawCell, drawText, embedLogo, drawCompanyHeader, drawFooters } from './mileagePdf'
import { dayInfo, formatMinutes, formatTime12, isMissingDay } from './timecard'
import { leaveAbbr, getLeaveSessionLabel } from './teamLeaves'

const A4W = 595, A4H = 842
const ML = 40, MR = 40
const TABLE_W = A4W - ML - MR // 515

// Date | Day | Time | Site | Normal | OT | Remarks
const COLS = [
  { label: 'Date',    w: 54,  align: 'center' },
  { label: 'Day',     w: 30,  align: 'center' },
  { label: 'Time',    w: 112, align: 'left'   },
  { label: 'Site',    w: 128, align: 'left'   },
  { label: 'Normal',  w: 50,  align: 'right'  },
  { label: 'OT',      w: 50,  align: 'right'  },
  { label: 'Remarks', w: 91,  align: 'left'   },
]

const BLACK = rgb(0, 0, 0)
const GREY  = rgb(0.35, 0.35, 0.35)
const WHITE = rgb(1, 1, 1)
const ZEBRA = rgb(0.968, 0.976, 0.984)
const OFF   = rgb(0.92, 0.93, 0.95)
const HEAD  = rgb(0.93, 0.95, 0.97)
const LINE  = rgb(0.55, 0.6, 0.65)
const SOFT  = rgb(0.8, 0.84, 0.88)

// Compact rows so a normal month (one slot a day) fits on a single page.
const SIZE = 8
const LINE_H = 9.5

function colX(idx) {
  return ML + COLS.slice(0, idx).reduce((a, c) => a + c.w, 0)
}

function fmtDate(d, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return sanitize(new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY', opts))
}

function hrs(mins) {
  return mins ? formatMinutes(mins) : '-'
}

function slotsOf(card) {
  if (Array.isArray(card?.segments) && card.segments.length > 0) return card.segments
  return card && (card.time_in || card.time_out) ? [{ time_in: card.time_in, time_out: card.time_out, site_id: card.site_id }] : []
}

// One timecard per member, each starting on a new page.
//   entries: [{ member, cardsByDate, leaveOn(date), summary }]
//   siteName(id): site name for a slot's site_id
export async function buildTimecardPdf({ entries, dates, from, to, today, siteName }) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logoImg = await embedLogo(pdf)

  for (const entry of entries) {
    drawMemberTimecard({ pdf, font, bold, logoImg, entry, dates, from, to, today, siteName })
  }
  return pdf.save()
}

function drawMemberTimecard({ pdf, font, bold, logoImg, entry, dates, from, to, today, siteName }) {
  const { member, cardsByDate, leaveOn, summary } = entry
  const pages = []
  let page = null
  let y = 0

  function newPage() {
    page = pdf.addPage([A4W, A4H])
    pages.push(page)
    y = drawCompanyHeader(page, { font, bold, logoImg })
  }

  function drawTableHeader() {
    const h = 20
    page.drawRectangle({ x: ML, y: y - h, width: TABLE_W, height: h, borderColor: BLACK, borderWidth: 0.8, color: HEAD })
    COLS.forEach((c, i) => {
      if (i > 0) page.drawLine({ start: { x: colX(i), y }, end: { x: colX(i), y: y - h }, thickness: 0.8, color: BLACK })
      drawCell(page, c.label, { x: colX(i), w: c.w, y: y - 14, align: c.align, font: bold, size: 8.5 })
    })
    y -= h
  }

  // ── Title + member info ──
  newPage()
  drawText(page, 'TIMECARD & OVERTIME RECORD', { x: ML, y, font: bold, size: 15, color: BLACK })
  y -= 20

  const infoRows = [
    ['Name', member.full_name || '-', 'Position', member.role || '-'],
    ['Period', `${fmtDate(from)} - ${fmtDate(to)}`, 'Date Generated', fmtDate(today)],
  ]
  const infoH = 20
  const midX = ML + TABLE_W / 2
  infoRows.forEach((r, i) => {
    const rY = y - infoH * (i + 1)
    page.drawRectangle({ x: ML, y: rY, width: TABLE_W, height: infoH, borderColor: SOFT, borderWidth: 0.6, color: i % 2 ? WHITE : ZEBRA })
    page.drawLine({ start: { x: midX, y: rY + infoH }, end: { x: midX, y: rY }, thickness: 0.6, color: SOFT })
    drawText(page, `${r[0]}:`, { x: ML + 8, y: rY + 6, font: bold, size: 9, color: BLACK })
    drawText(page, String(r[1]), { x: ML + 60, y: rY + 6, font, size: 9, color: BLACK })
    drawText(page, `${r[2]}:`, { x: midX + 8, y: rY + 6, font: bold, size: 9, color: BLACK })
    drawText(page, String(r[3]), { x: midX + 92, y: rY + 6, font, size: 9, color: BLACK })
  })
  y -= infoH * infoRows.length + 8
  const note = 'Office hours: Mon-Fri 8:00 AM - 5:30 PM, Sat 8:00 AM - 1:00 PM. Lunch 1:00 PM - 2:30 PM is not counted. ' +
    'Time outside office hours, and any work on Sundays or public holidays, is OT.'
  wrap(note, TABLE_W, font, 7.5, 2).forEach((ln, i) => drawText(page, ln, { x: ML, y: y - i * 9, font, size: 7.5, color: GREY }))
  y -= 22

  // ── Day table ──
  drawTableHeader()
  const BOTTOM_LIMIT = 56

  dates.forEach((date, idx) => {
    const card = cardsByDate[date]
    const leave = leaveOn(date)
    const info = dayInfo(date)
    const offDay = info.kind === 'holiday' || info.kind === 'off'
    const slots = slotsOf(card)

    const timeLines = slots.map(s => `${formatTime12(s.time_in) || '?'} - ${formatTime12(s.time_out) || '?'}`)
    const siteLines = slots.map(s => (s.site_id && siteName(s.site_id)) || 'Office')
      .map(name => wrap(name, COLS[3].w - 10, font, SIZE, 1)[0])

    const notes = []
    if (info.kind === 'holiday') notes.push(info.label)
    else if (info.kind === 'off' && !card) notes.push('Off day')
    if (leave) notes.push(`${leaveAbbr(leave.leave_type)} (${getLeaveSessionLabel(leave.leave_session)})`)
    if (isMissingDay(date, today, card, leave)) notes.push('No time keyed in')
    if (card?.remarks) notes.push(card.remarks)
    const remarkLines = wrap(notes.join('; '), COLS[6].w - 10, font, SIZE, Math.max(2, slots.length))

    const lineCount = Math.max(timeLines.length, siteLines.length, remarkLines.length, 1)
    const rowH = Math.max(13, lineCount * LINE_H + 4)

    if (y - rowH < BOTTOM_LIMIT) {
      newPage()
      drawTableHeader()
    }

    const rY = y - rowH
    page.drawRectangle({ x: ML, y: rY, width: TABLE_W, height: rowH, borderColor: LINE, borderWidth: 0.4, color: offDay ? OFF : idx % 2 ? WHITE : ZEBRA })
    COLS.forEach((c, i) => {
      if (i > 0) page.drawLine({ start: { x: colX(i), y: rY + rowH }, end: { x: colX(i), y: rY }, thickness: 0.4, color: LINE })
    })

    const firstY = rY + rowH - 9.5
    const muted = offDay && !card ? GREY : BLACK
    drawCell(page, fmtDate(date, { day: '2-digit', month: 'short' }), { x: colX(0), w: COLS[0].w, y: firstY, align: 'center', font, size: SIZE, color: muted })
    drawCell(page, fmtDate(date, { weekday: 'short' }), { x: colX(1), w: COLS[1].w, y: firstY, align: 'center', font, size: SIZE, color: muted })
    timeLines.forEach((ln, i) => drawCell(page, ln, { x: colX(2), w: COLS[2].w, y: firstY - i * LINE_H, align: 'left', font, size: SIZE }))
    siteLines.forEach((ln, i) => drawCell(page, ln, { x: colX(3), w: COLS[3].w, y: firstY - i * LINE_H, align: 'left', font, size: SIZE, color: GREY }))
    if (card) {
      drawCell(page, hrs(card.normal_minutes), { x: colX(4), w: COLS[4].w, y: firstY, align: 'right', font, size: SIZE })
      drawCell(page, hrs(card.ot_minutes), { x: colX(5), w: COLS[5].w, y: firstY, align: 'right', font: bold, size: SIZE })
    }
    remarkLines.forEach((ln, i) => drawCell(page, ln, { x: colX(6), w: COLS[6].w, y: firstY - i * LINE_H, align: 'left', font, size: SIZE, color: GREY }))

    y = rY
  })

  // ── Totals ──
  const totals = [
    ['Days worked', String(summary.days)],
    ['Leave days', String(summary.leaveDays)],
    ['Normal hours', hrs(summary.normal)],
    ['OT weekday', hrs(summary.otWeekday)],
    ['OT Saturday', hrs(summary.otSaturday)],
    ['OT Sun & PH', hrs(summary.otOff)],
    ['TOTAL OT', hrs(summary.ot)],
  ]
  // Totals and signatures stay together; move both over if they don't fit.
  const totH = 28
  if (y - 10 - totH - 81 < BOTTOM_LIMIT) newPage()
  y -= 10
  const cellW = TABLE_W / totals.length
  totals.forEach(([label, value], i) => {
    const x = ML + i * cellW
    const last = i === totals.length - 1
    page.drawRectangle({ x, y: y - totH, width: cellW, height: totH, borderColor: BLACK, borderWidth: 0.7, color: last ? HEAD : WHITE })
    drawCell(page, label, { x, w: cellW, y: y - 10.5, align: 'center', font, size: 7.5, color: GREY })
    drawCell(page, value, { x, w: cellW, y: y - 22.5, align: 'center', font: bold, size: last ? 11 : 10 })
  })
  y -= totH + 18

  // ── Signatures (signed by hand on the printout) ──
  const boxW = (TABLE_W - 30) / 2
  const blocks = [
    { title: 'Employee', name: member.full_name || '' },
    { title: 'Verified / Approved by', name: '' },
  ]
  blocks.forEach((b, i) => {
    const x = ML + i * (boxW + 30)
    drawText(page, b.title, { x, y, font: bold, size: 9.5, color: BLACK })
    page.drawLine({ start: { x, y: y - 26 }, end: { x: x + boxW, y: y - 26 }, thickness: 0.8, color: BLACK })
    drawText(page, 'Signature', { x, y: y - 36, font, size: 8, color: GREY })
    drawText(page, 'Name:', { x, y: y - 50, font: bold, size: 8.5, color: BLACK })
    drawText(page, b.name || '_______________________', { x: x + 36, y: y - 50, font, size: 8.5, color: BLACK })
    drawText(page, 'Date:', { x, y: y - 63, font: bold, size: 8.5, color: BLACK })
    drawText(page, '_______________________', { x: x + 36, y: y - 63, font, size: 8.5, color: BLACK })
  })

  // Page numbers count within this member's timecard.
  drawFooters(pages, font)
}

export function timecardPdfFilename(from, to, member) {
  const who = member ? member.full_name.replace(/[^\w]+/g, '-') : 'All-Members'
  return `Timecard-${who}-${from}-to-${to}.pdf`
}

// Re-exported so callers only need this module.
export { downloadPdf } from './mileagePdf'
