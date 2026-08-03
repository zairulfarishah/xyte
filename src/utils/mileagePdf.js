import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const A4W = 595, A4H = 842
const ML = 40, MR = 40
const TABLE_W = A4W - ML - MR // 515

// No | Date | Location | Description | KM | Trip | Total (RM)
const COLS = [
  { key: 'no',    label: 'No',           w: 26,  align: 'center' },
  { key: 'date',  label: 'Date',         w: 62,  align: 'center' },
  { key: 'loc',   label: 'Location',     w: 150, align: 'left'   },
  { key: 'desc',  label: 'Description',  w: 135, align: 'left'   },
  { key: 'km',    label: 'KM',           w: 44,  align: 'right'  },
  { key: 'trip',  label: 'Trip',         w: 34,  align: 'center' },
  { key: 'total', label: 'Total (RM)',   w: 64,  align: 'right'  },
]

const BLACK = rgb(0, 0, 0)
const GREY  = rgb(0.35, 0.35, 0.35)
const WHITE = rgb(1, 1, 1)
const ZEBRA = rgb(0.968, 0.976, 0.984)

// The standard PDF fonts are WinAnsi-only, so anything outside that set has to be
// folded down first — otherwise pdf-lib throws mid-render (e.g. on "Office → KLCC").
const CHAR_MAP = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>',
  '–': '-', '—': '-', '‑': '-', '−': '-',
  '‘': "'", '’': "'", '‚': ',', '“': '"', '”': '"', '„': '"',
  '…': '...', '•': '-', '·': '-', '×': 'x', '✓': 'v', '✗': 'x',
  ' ': ' ', '\t': ' ',
}

function sanitize(value) {
  let out = ''
  for (const ch of String(value ?? '')) {
    const mapped = CHAR_MAP[ch] ?? ch
    for (const c of mapped) {
      const code = c.codePointAt(0)
      // Printable ASCII and the Latin-1 supplement survive; the rest becomes '?'.
      out += (code >= 32 && code <= 126) || (code >= 160 && code <= 255) ? c : '?'
    }
  }
  return out
}

function textWidth(font, text, size) {
  return font.widthOfTextAtSize(sanitize(text), size)
}

function colX(idx) {
  return ML + COLS.slice(0, idx).reduce((a, c) => a + c.w, 0)
}

function fmtDate(d) {
  if (!d) return '-'
  const parsed = new Date(String(d).slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(parsed.getTime())) return '-'
  return sanitize(parsed.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }))
}

function fmtMoney(n) {
  return sanitize((Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
}

// Wrap text to a max width, capped at maxLines (last line gets an ellipsis if it overflows).
function wrap(text, maxWidth, font, size, maxLines = 2) {
  const clean = sanitize(text).trim()
  if (!clean) return ['']
  const words = clean.split(/\s+/)
  const lines = []
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) { line = next; continue }
    if (line) lines.push(line)
    line = word
    // A single word longer than the column: hard-break it.
    while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) {
      let cut = line.length
      while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxWidth) cut--
      lines.push(line.slice(0, cut))
      line = line.slice(cut)
    }
    if (lines.length >= maxLines) break
  }
  if (line && lines.length < maxLines) lines.push(line)

  if (lines.length > maxLines) lines.length = maxLines
  if (lines.length === maxLines) {
    const joined = lines.join(' ')
    if (joined.length < clean.length) {
      let last = lines[maxLines - 1]
      while (last.length > 1 && font.widthOfTextAtSize(last + '...', size) > maxWidth) last = last.slice(0, -1)
      lines[maxLines - 1] = last + '...'
    }
  }
  return lines
}

function drawCell(page, text, { x, w, y, align, font, size, color = BLACK }) {
  const safe = sanitize(text)
  const tw = font.widthOfTextAtSize(safe, size)
  let tx = x + 5
  if (align === 'right')  tx = x + w - 5 - tw
  if (align === 'center') tx = x + (w - tw) / 2
  page.drawText(safe, { x: tx, y, font, size, color })
}

// Every free-text draw goes through here so nothing unencodable reaches pdf-lib.
function drawText(page, text, opts) {
  page.drawText(sanitize(text), opts)
}

export async function buildMileageClaimPdf({ claim, rows, company }) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const co = {
    name: 'Xradar Asia Sdn Bhd',
    reg: '(1449462P)',
    address: '17 Jalan PJS 7/21 Bandar Sunway, 46150 Petaling Jaya, Selangor',
    contact: 'Tel:  03-74940629     Email:  info@xradar.asia',
    ...(company || {}),
  }

  // Logo is optional — the header falls back to a wordmark if it is missing.
  let logoImg = null
  try {
    const resp = await fetch('/xradar-logo.png')
    if (resp.ok) logoImg = await pdf.embedPng(await resp.arrayBuffer())
  } catch { /* no logo available */ }

  const pages = []
  let page = null
  let y = 0

  function newPage() {
    page = pdf.addPage([A4W, A4H])
    pages.push(page)

    const headerTop = A4H - 40
    drawText(page, co.name, { x: ML, y: headerTop, font: bold, size: 13, color: BLACK })
    drawText(page, co.reg, { x: ML + textWidth(bold, co.name, 13) + 6, y: headerTop, font, size: 11, color: GREY })
    drawText(page, co.address, { x: ML, y: headerTop - 16, font, size: 8.5, color: GREY })
    drawText(page, co.contact, { x: ML, y: headerTop - 28, font, size: 8.5, color: GREY })

    if (logoImg) {
      const d = logoImg.scaleToFit(110, 44)
      page.drawImage(logoImg, { x: A4W - MR - d.width, y: headerTop - d.height + 10, width: d.width, height: d.height })
    } else {
      drawText(page, 'Xradar', { x: A4W - MR - 70, y: headerTop - 10, font: bold, size: 22, color: BLACK })
    }

    const divY = headerTop - 42
    page.drawLine({ start: { x: ML, y: divY }, end: { x: A4W - MR, y: divY }, thickness: 1, color: BLACK })
    y = divY - 28
  }

  function drawTableHeader() {
    const h = 24
    page.drawRectangle({ x: ML, y: y - h, width: TABLE_W, height: h, borderColor: BLACK, borderWidth: 0.8, color: rgb(0.93, 0.95, 0.97) })
    COLS.forEach((c, i) => {
      if (i > 0) page.drawLine({ start: { x: colX(i), y }, end: { x: colX(i), y: y - h }, thickness: 0.8, color: BLACK })
      drawCell(page, c.label, { x: colX(i), w: c.w, y: y - 16, align: c.align === 'right' ? 'right' : c.align, font: bold, size: 9 })
    })
    y -= h
  }

  // ── Page 1 title + claim info ──
  newPage()

  drawText(page, 'MILEAGE CLAIM FORM', { x: ML, y, font: bold, size: 15, color: BLACK })
  const rateNote = `Rate: RM ${fmtMoney(claim.rate_per_km)} per km`
  drawText(page, rateNote, { x: A4W - MR - textWidth(font, rateNote, 9), y: y + 3, font, size: 9, color: GREY })
  y -= 22

  const infoRows = [
    ['Name', claim.member_name || '-', 'Vehicle Plate No.', claim.vehicle_plate || '-'],
    ['Claim Period', claim.period || '-', 'Date Generated', fmtDate(new Date().toISOString())],
  ]
  const infoH = 20
  const midX = ML + TABLE_W / 2
  infoRows.forEach((r, i) => {
    const rY = y - infoH * (i + 1)
    page.drawRectangle({ x: ML, y: rY, width: TABLE_W, height: infoH, borderColor: rgb(0.8, 0.84, 0.88), borderWidth: 0.6, color: i % 2 ? WHITE : ZEBRA })
    page.drawLine({ start: { x: midX, y: rY + infoH }, end: { x: midX, y: rY }, thickness: 0.6, color: rgb(0.8, 0.84, 0.88) })
    drawText(page, `${r[0]}:`, { x: ML + 8, y: rY + 6, font: bold, size: 9, color: BLACK })
    drawText(page, String(r[1]), { x: ML + 92, y: rY + 6, font, size: 9, color: BLACK })
    drawText(page, `${r[2]}:`, { x: midX + 8, y: rY + 6, font: bold, size: 9, color: BLACK })
    drawText(page, String(r[3]), { x: midX + 100, y: rY + 6, font, size: 9, color: BLACK })
  })
  y -= infoH * infoRows.length + 22

  // ── Journey table ──
  drawTableHeader()

  const SIZE = 9
  const BOTTOM_LIMIT = 130 // leave room for total + signatures on the last page
  let totalKm = 0, totalAmount = 0, totalTrips = 0

  rows.forEach((row, idx) => {
    // Routes can chain many stops, so the location column gets more lines than the description.
    const locLines  = wrap(row.location, COLS[2].w - 10, font, SIZE, 4)
    const descLines = wrap(row.description, COLS[3].w - 10, font, SIZE, 3)
    const lineCount = Math.max(locLines.length, descLines.length, 1)
    const rowH = Math.max(20, lineCount * 11 + 8)

    if (y - rowH < BOTTOM_LIMIT) {
      newPage()
      drawTableHeader()
    }

    const rY = y - rowH
    page.drawRectangle({ x: ML, y: rY, width: TABLE_W, height: rowH, borderColor: rgb(0.55, 0.6, 0.65), borderWidth: 0.5, color: idx % 2 ? WHITE : ZEBRA })
    COLS.forEach((c, i) => {
      if (i > 0) page.drawLine({ start: { x: colX(i), y: rY + rowH }, end: { x: colX(i), y: rY }, thickness: 0.5, color: rgb(0.55, 0.6, 0.65) })
    })

    const firstLineY = rY + rowH - 13
    drawCell(page, String(idx + 1),          { x: colX(0), w: COLS[0].w, y: firstLineY, align: 'center', font, size: SIZE })
    drawCell(page, fmtDate(row.row_date),    { x: colX(1), w: COLS[1].w, y: firstLineY, align: 'center', font, size: SIZE })
    locLines.forEach((ln, i)  => drawCell(page, ln, { x: colX(2), w: COLS[2].w, y: firstLineY - i * 11, align: 'left', font, size: SIZE }))
    descLines.forEach((ln, i) => drawCell(page, ln, { x: colX(3), w: COLS[3].w, y: firstLineY - i * 11, align: 'left', font, size: SIZE, color: GREY }))
    drawCell(page, fmtMoney(row.km),         { x: colX(4), w: COLS[4].w, y: firstLineY, align: 'right',  font, size: SIZE })
    drawCell(page, String(row.trips || 1),   { x: colX(5), w: COLS[5].w, y: firstLineY, align: 'center', font, size: SIZE })
    drawCell(page, fmtMoney(row.amount),     { x: colX(6), w: COLS[6].w, y: firstLineY, align: 'right',  font: bold, size: SIZE })

    totalKm     += Number(row.km) || 0
    totalTrips  += Number(row.trips) || 0
    totalAmount += Number(row.amount) || 0
    y = rY
  })

  if (rows.length === 0) {
    const rowH = 20
    page.drawRectangle({ x: ML, y: y - rowH, width: TABLE_W, height: rowH, borderColor: rgb(0.55, 0.6, 0.65), borderWidth: 0.5, color: WHITE })
    drawCell(page, 'No journeys recorded', { x: ML, w: TABLE_W, y: y - 14, align: 'center', font, size: SIZE, color: GREY })
    y -= rowH
  }

  // ── Grand total row ──
  const totH = 24
  page.drawRectangle({ x: ML, y: y - totH, width: TABLE_W, height: totH, borderColor: BLACK, borderWidth: 0.8, color: rgb(0.93, 0.95, 0.97) })
  page.drawLine({ start: { x: colX(4), y }, end: { x: colX(4), y: y - totH }, thickness: 0.8, color: BLACK })
  page.drawLine({ start: { x: colX(5), y }, end: { x: colX(5), y: y - totH }, thickness: 0.8, color: BLACK })
  page.drawLine({ start: { x: colX(6), y }, end: { x: colX(6), y: y - totH }, thickness: 0.8, color: BLACK })
  drawCell(page, 'TOTAL',                 { x: colX(0), w: COLS[0].w + COLS[1].w + COLS[2].w + COLS[3].w, y: y - 16, align: 'right', font: bold, size: 10 })
  drawCell(page, fmtMoney(totalKm),       { x: colX(4), w: COLS[4].w, y: y - 16, align: 'right',  font: bold, size: 9.5 })
  drawCell(page, String(totalTrips),      { x: colX(5), w: COLS[5].w, y: y - 16, align: 'center', font: bold, size: 9.5 })
  drawCell(page, `RM ${fmtMoney(totalAmount)}`, { x: colX(6), w: COLS[6].w, y: y - 16, align: 'right', font: bold, size: 9.5 })
  y -= totH + 34

  // ── Signature blocks ──
  if (y < 120) { newPage(); y -= 10 }

  const boxW = (TABLE_W - 30) / 2
  const boxH = 92
  // Signed by hand on the printout — the app itself tracks no approval state.
  const blocks = [
    { title: 'Submitted by', name: claim.member_name || '', date: null },
    { title: 'Approved by',  name: '',                      date: null },
  ]

  blocks.forEach((b, i) => {
    const x = ML + i * (boxW + 30)
    const top = y
    drawText(page, b.title, { x, y: top, font: bold, size: 9.5, color: BLACK })

    // Signature line
    page.drawLine({ start: { x, y: top - 46 }, end: { x: x + boxW, y: top - 46 }, thickness: 0.8, color: BLACK })
    drawText(page, 'Signature', { x, y: top - 58, font, size: 8, color: GREY })

    drawText(page, 'Name:', { x, y: top - 76, font: bold, size: 8.5, color: BLACK })
    drawText(page, b.name || '_______________________', { x: x + 36, y: top - 76, font, size: 8.5, color: BLACK })

    drawText(page, 'Date:', { x, y: top - 90, font: bold, size: 8.5, color: BLACK })
    drawText(page, b.date ? fmtDate(b.date) : '_______________________', { x: x + 36, y: top - 90, font, size: 8.5, color: BLACK })
  })
  y -= boxH

  // ── Footer on every page ──
  const stamp = sanitize(new Date().toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: ML, y: 46 }, end: { x: A4W - MR, y: 46 }, thickness: 0.5, color: rgb(0.8, 0.84, 0.88) })
    drawText(p, `Generated by Xyte - ${stamp}`, { x: ML, y: 34, font, size: 7.5, color: GREY })
    const pg = `Page ${i + 1} of ${pages.length}`
    drawText(p, pg, { x: A4W - MR - textWidth(font, pg, 7.5), y: 34, font, size: 7.5, color: GREY })
  })

  return pdf.save()
}

export function downloadPdf(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function mileagePdfFilename(claim) {
  const who = (claim.member_name || 'claim').replace(/[^\w]+/g, '-')
  const when = (claim.period || new Date().toISOString().slice(0, 7)).replace(/[^\w]+/g, '-')
  return `Mileage-Claim-${who}-${when}.pdf`
}
