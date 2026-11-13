// PDF print: one sheet per level (and per section), vector, at a real scale, with a
// title block. What is drawn comes from drawing.js, the same as the CAD export.
import { LAYERS, drawLevel, drawnBounds } from './drawing'
import { computeSection } from './sections'

export const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] }     // landscape, mm
const STANDARD = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000]
const PT = 72 / 25.4
const MARGIN = 10, BAND = 34          // mm: sheet margin, title block height

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] }
// Standard PDF fonts only know Western characters
const safe = s => String(s ?? '').replace(/[\u2212\u2012]/g, '-').replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u20AC\u2026]/g, '?')

export async function planToPdf(plan, opts) {
  const { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath } = await import('pdf-lib')
  const { levelIds, sheet = 'A3', scale = 'auto', underlay = false, sections = false, tb = {}, scanBy = {} } = opts
  const [W, H] = SHEETS[sheet]
  const doc = await PDFDocument.create()
  doc.setTitle(safe(`${tb.project || plan.name} - layout`))
  doc.setCreator('Xyte')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const C = arr => rgb(arr[0], arr[1], arr[2])
  const ink = C([0.06, 0.09, 0.16]), grey = C([0.4, 0.45, 0.52]), line = C([0.6, 0.64, 0.7])

  // drawing area on the sheet (mm from the top-left)
  const area = { x0: MARGIN + 2, y0: MARGIN + 2, x1: W - MARGIN - 2, y1: H - MARGIN - BAND - 2 }
  const pickScale = (w, h) => {
    const need = Math.max(w / (area.x1 - area.x0 - 8), h / (area.y1 - area.y0 - 8))
    return scale === 'auto' ? (STANDARD.find(s => s >= need) || Math.ceil(need)) : +scale
  }
  const sheets = []      // { title, scale, overflow }
  let sheetNo = 0
  const total = levelIds.length + (sections ? (plan.sections || []).length : 0)

  function newPage(title, S) {
    sheetNo++
    const page = doc.addPage([W * PT, H * PT])
    const P = (x, y) => ({ x: x * PT, y: (H - y) * PT })          // sheet mm (top-left) → PDF points
    const box = (x0, y0, x1, y1, thick = 0.25) => page.drawRectangle({ ...P(x0, y1), width: (x1 - x0) * PT, height: (y1 - y0) * PT, borderColor: ink, borderWidth: thick * PT })
    const txt = (s, x, y, size, f = font, color = ink) => page.drawText(safe(s), { ...P(x, y), size: size * PT, font: f, color })
    const fit = (s, maxW, size, f = font) => { let t = safe(s); while (t.length > 1 && f.widthOfTextAtSize(t, size * PT) > maxW * PT) t = t.slice(0, -2) + '…'; return t }

    // border and title block band
    box(MARGIN, MARGIN, W - MARGIN, H - MARGIN, 0.5)
    const by = H - MARGIN - BAND
    page.drawLine({ start: P(MARGIN, by), end: P(W - MARGIN, by), thickness: 0.5 * PT, color: ink })
    // columns from the right: company | number & rev | details | project & title | revisions (rest)
    const cw = { co: 58, no: 46, det: 66, proj: Math.min(120, W * 0.3) }
    let x = W - MARGIN
    const cols = {}
    for (const k of ['co', 'no', 'det', 'proj']) { cols[k] = [x - cw[k], x]; x -= cw[k]; page.drawLine({ start: P(x, by), end: P(x, H - MARGIN), thickness: 0.25 * PT, color: ink }) }
    cols.rev = [MARGIN, x]
    const small = 2.1, mid = 2.8
    const lab = (s, cx, cy) => txt(s, cx, cy, 1.7, font, grey)
    // company
    txt(fit(tb.company || 'Sonicon', cw.co - 6, 4.6, bold), cols.co[0] + 3, by + 11, 4.6, bold)
    txt(fit(tb.companyLine || 'Structural survey layout', cw.co - 6, small), cols.co[0] + 3, by + 16.5, small, font, grey)
    lab('CLIENT', cols.co[0] + 3, by + 23)
    txt(fit(tb.client || '-', cw.co - 6, small), cols.co[0] + 3, by + 27.5, small)
    // drawing number and revision
    lab('DRAWING NO.', cols.no[0] + 3, by + 5)
    txt(fit(tb.drawingNo ? `${tb.drawingNo}-${String(sheetNo).padStart(2, '0')}` : '-', cw.no - 6, mid, bold), cols.no[0] + 3, by + 10.5, mid, bold)
    lab('REVISION', cols.no[0] + 3, by + 17)
    txt(tb.rev || '-', cols.no[0] + 3, by + 25, 6, bold)
    lab(`SHEET ${sheetNo} OF ${total}`, cols.no[0] + 3, by + 30.5)
    // details
    const det = [['SCALE', S ? `1:${S} @ ${sheet}` : `NTS (${sheet})`], ['DATE', tb.date || new Date().toLocaleDateString('en-GB')], ['DRAWN', tb.drawnBy || '-'], ['CHECKED', tb.checkedBy || '-']]
    det.forEach(([k, v], n) => {
      const cy = by + 3 + n * 8
      lab(k, cols.det[0] + 3, cy + 2)
      txt(fit(v, cw.det - 24, small), cols.det[0] + 22, cy + 2.2, small)
      if (n) page.drawLine({ start: P(cols.det[0], cy - 2.5), end: P(cols.det[1], cy - 2.5), thickness: 0.15 * PT, color: line })
    })
    // project and sheet title
    lab('PROJECT', cols.proj[0] + 3, by + 5)
    txt(fit(tb.project || plan.name, cw.proj - 6, 3.4, bold), cols.proj[0] + 3, by + 10.5, 3.4, bold)
    lab('DRAWING TITLE', cols.proj[0] + 3, by + 17)
    txt(fit(title, cw.proj - 6, 3.6, bold), cols.proj[0] + 3, by + 23.5, 3.6, bold)
    txt(fit('Dimensions in millimetres unless noted. Measured survey of existing structure.', cw.proj - 6, 1.7), cols.proj[0] + 3, by + 30.5, 1.7, font, grey)
    // revisions table
    const rw = cols.rev[1] - cols.rev[0]
    if (rw > 60) {
      lab('REV', cols.rev[0] + 3, by + 5); lab('DATE', cols.rev[0] + 13, by + 5); lab('DESCRIPTION', cols.rev[0] + 36, by + 5); lab('BY', cols.rev[1] - 16, by + 5)
      const revs = (plan.revisions || []).slice(-4).reverse()
      revs.forEach((r, n) => {
        const cy = by + 11 + n * 5.6
        txt(r.rev, cols.rev[0] + 3, cy, small, bold)
        txt(new Date(r.date).toLocaleDateString('en-GB'), cols.rev[0] + 13, cy, small)
        txt(fit(r.note || '', rw - 56, small), cols.rev[0] + 36, cy, small)
        txt(fit(r.by || '', 15, small), cols.rev[1] - 16, cy, small)
      })
      if (!revs.length) txt('First issue', cols.rev[0] + 3, by + 11, small, font, grey)
    }

    // everything below is clipped to the drawing area
    const a0 = P(area.x0, area.y0), a1 = P(area.x1, area.y1)
    page.pushOperators(pushGraphicsState(), moveTo(a0.x, a0.y), lineTo(a1.x, a0.y), lineTo(a1.x, a1.y), lineTo(a0.x, a1.y), closePath(), clip(), endPath())
    return { page, P, txt, fit, done: () => page.pushOperators(popGraphicsState()) }
  }

  // ── plan sheets ──
  const levels = plan.levels.filter(l => levelIds.includes(l.id)).sort((a, b) => b.elevation - a.elevation)
  for (const lv of levels) {
    const pts = scanBy[lv.id] || []
    const b = drawnBounds(plan, lv, pts)
    const S = pickScale(b.x1 - b.x0, b.y1 - b.y0)
    const title = `${lv.name} - structural layout (FFL ${lv.elevation >= 0 ? '+' : ''}${lv.elevation})`
    const { page, P, txt, done } = newPage(title, S)
    const cx = (area.x0 + area.x1) / 2, cy = (area.y0 + area.y1) / 2, bx = (b.x0 + b.x1) / 2, byy = (b.y0 + b.y1) / 2
    const M = q => ({ x: cx + (q.x - bx) / S, y: cy + (q.y - byy) / S })          // plan mm → sheet mm
    const Q = q => P(M(q).x, M(q).y)                                             // plan mm → PDF points
    const svgPt = q => { const m = M(q); return `${(m.x * PT).toFixed(2)} ${(m.y * PT).toFixed(2)}` }     // y down, for drawSvgPath
    sheets.push({ title, scale: S, overflow: (b.x1 - b.x0) / S > area.x1 - area.x0 || (b.y1 - b.y0) / S > area.y1 - area.y0 })

    // underlays: the imported drawing and the client's CAD lines, faint
    if (underlay && lv.bg?.show && lv.bg.src?.startsWith('data:image/jpeg')) {
      try {
        const img = await doc.embedJpg(lv.bg.src)
        const tl = M({ x: lv.bg.x, y: lv.bg.y })
        const wmm = lv.bg.w * lv.bg.mmPerPx / S, hmm = lv.bg.h * lv.bg.mmPerPx / S
        page.drawImage(img, { ...P(tl.x, tl.y + hmm), width: wmm * PT, height: hmm * PT, opacity: Math.min(0.45, lv.bg.opacity) })
      } catch { /* skip an underlay that will not embed */ }
    }
    if (underlay && lv.cad?.show) {
      const hidden = new Set(lv.cad.hidden || [])
      for (const l of lv.cad.layers) {
        if (hidden.has(l.name) || !l.segs.length) continue
        let d = ''
        for (let i = 0; i < l.segs.length; i += 4) {
          d += `M${svgPt({ x: l.segs[i] + lv.cad.x, y: l.segs[i + 1] + lv.cad.y })}L${svgPt({ x: l.segs[i + 2] + lv.cad.x, y: l.segs[i + 3] + lv.cad.y })}`
        }
        page.drawSvgPath(d, { x: 0, y: H * PT, borderColor: C([0.72, 0.75, 0.8]), borderWidth: 0.1 * PT })
      }
    }

    const style = layer => LAYERS[layer] || LAYERS['A-TEXT']
    const sink = {
      line: (layer, a, c) => {
        const st = style(layer)
        page.drawLine({ start: Q(a), end: Q(c), thickness: st.w * PT * 0.6, color: C(st.rgb), dashArray: st.dash?.map(v => v * PT) })
      },
      pline: (layer, pts, closed = true) => {
        const st = style(layer)
        const d = pts.map((q, k) => `${k ? 'L' : 'M'}${svgPt(q)}`).join('') + (closed ? 'Z' : '')
        page.drawSvgPath(d, { x: 0, y: H * PT, borderColor: C(st.rgb), borderWidth: st.w * PT * 0.6, color: st.fill ? C(st.fill) : undefined, borderDashArray: st.dash?.map(v => v * PT) })
      },
      circle: (layer, c, r, color) => {
        const st = style(layer)
        page.drawCircle({ ...Q(c), size: r / S * PT, borderColor: color?.color ? C(hex(color.color)) : C(st.rgb), borderWidth: st.w * PT * 0.6, color: layer === 'S-COLS' && st.fill ? C(st.fill) : undefined })
      },
      arc: (layer, c, r, from, to) => {
        const st = style(layer)
        const f = M(from), t = M(to), m = M(c)
        const sweep = (f.x - m.x) * (t.y - m.y) - (f.y - m.y) * (t.x - m.x) > 0 ? 1 : 0
        const R = r / S * PT
        page.drawSvgPath(`M${(f.x * PT).toFixed(2)} ${(f.y * PT).toFixed(2)}A${R.toFixed(2)} ${R.toFixed(2)} 0 0 ${sweep} ${(t.x * PT).toFixed(2)} ${(t.y * PT).toFixed(2)}`,
          { x: 0, y: H * PT, borderColor: C(st.rgb), borderWidth: st.w * PT * 0.5, borderDashArray: [1 * PT, 1 * PT] })
      },
      label: (layer, q, h, s, rot = 0, color) => {
        const text = safe(s)
        if (!text.trim()) return
        const size = Math.max(0.9, h / S) * PT           // never smaller than ~0.9 mm on paper
        const f = layer === 'TITLE' || layer === 'S-GRID-TEXT' || layer === 'S-SECTION' ? bold : font
        const w = f.widthOfTextAtSize(text, size)
        const a = -rot * Math.PI / 180, d = { x: Math.cos(a), y: Math.sin(a) }, up = { x: -Math.sin(a), y: Math.cos(a) }
        const p = Q(q)
        page.drawText(text, {
          x: p.x - d.x * w / 2 - up.x * size * 0.35, y: p.y - d.y * w / 2 - up.y * size * 0.35,
          size, font: f, color: color?.color ? C(hex(color.color)) : C(style(layer).rgb), rotate: degrees(-rot),
        })
      },
    }
    drawLevel(sink, plan, lv, pts)

    // pinned site notes: numbered pins here, the text in a box at the top-left
    const notes = lv.items.filter(i => i.type === 'note')
    notes.forEach((nt, k) => {
      const p = Q(nt)
      page.drawCircle({ ...p, size: 2.2 * PT, color: C([0.96, 0.62, 0.04]), borderColor: ink, borderWidth: 0.2 * PT })
      const s = String(k + 1)
      page.drawText(s, { x: p.x - bold.widthOfTextAtSize(s, 2.4 * PT) / 2, y: p.y - 0.85 * PT, size: 2.4 * PT, font: bold, color: ink })
    })
    done()
    if (notes.length) {
      const rows = notes.slice(0, 12)
      const bw = 95, bh = 7 + rows.length * 4.4
      page.drawRectangle({ ...P(area.x0 + 2, area.y0 + 2 + bh), width: bw * PT, height: bh * PT, color: rgb(1, 1, 1), borderColor: ink, borderWidth: 0.2 * PT, opacity: 0.95 })
      txt('SITE NOTES', area.x0 + 4, area.y0 + 6.5, 2.2, bold)
      rows.forEach((nt, k) => {
        const s = `${k + 1}. ${(nt.text || '').replace(/\s+/g, ' ')}${nt.photos?.length ? ` (${nt.photos.length} photo${nt.photos.length > 1 ? 's' : ''})` : ''}`
        let t = safe(s)
        while (t.length > 1 && font.widthOfTextAtSize(t, 2 * PT) > (bw - 5) * PT) t = t.slice(0, -2) + '…'
        txt(t, area.x0 + 4, area.y0 + 11 + k * 4.4, 2)
      })
    }
  }

  // ── section sheets ──
  if (sections) {
    for (const sec of plan.sections || []) {
      const { L, parts, grids, levels: lvls } = computeSection(plan, sec)
      const zs = [...parts.flatMap(p => [p.z0, p.z1]), ...lvls.flatMap(l => [l.elevation, l.top])]
      const zMin = Math.min(...zs) - 1500, zMax = Math.max(...zs) + 800
      const S = pickScale(L + 9000, zMax - zMin + 1500)
      const title = `Section ${sec.name}-${sec.name}`
      const { page, P, done } = newPage(title, S)
      sheets.push({ title, scale: S })
      const cx = (area.x0 + area.x1) / 2 + 2500 / S, cy = (area.y0 + area.y1) / 2
      const X = s => cx + (s - L / 2) / S, Y = z => cy - (z - (zMin + zMax) / 2) / S
      const rect = (s0, s1, z0, z1, fill, stroke, dashed) => page.drawRectangle({
        ...P(X(s0), Y(z0)), width: Math.max(0.05, (s1 - s0) / S) * PT, height: Math.max(0.05, (z1 - z0) / S) * PT,
        color: fill ? C(fill) : undefined, borderColor: C(stroke), borderWidth: 0.18 * PT, borderDashArray: dashed ? [1.2 * PT, 0.8 * PT] : undefined,
      })
      const T = (s, x, y, size, f = font, color = ink) => page.drawText(safe(s), { ...P(x, y), size: size * PT, font: f, color })
      for (const g of grids) {
        page.drawLine({ start: P(X(g.s), Y(zMax)), end: P(X(g.s), Y(zMin) - 4), thickness: 0.15 * PT, color: C([0.86, 0.15, 0.15]), dashArray: [4 * PT, 1 * PT, 0.8 * PT, 1 * PT] })
        page.drawCircle({ ...P(X(g.s), Y(zMin) + 3.5), size: 3.2 * PT, borderColor: C([0.86, 0.15, 0.15]), borderWidth: 0.25 * PT, color: rgb(1, 1, 1) })
        const w = bold.widthOfTextAtSize(safe(g.label), 2.6 * PT)
        page.drawText(safe(g.label), { x: P(X(g.s), 0).x - w / 2, y: P(0, Y(zMin) + 4.4).y, size: 2.6 * PT, font: bold, color: C([0.86, 0.15, 0.15]) })
      }
      for (const l of lvls) {
        page.drawLine({ start: P(X(0) - 25, Y(l.elevation)), end: P(X(L) + 5, Y(l.elevation)), thickness: 0.15 * PT, color: ink, dashArray: [1.5 * PT, 1 * PT] })
        T(l.name, X(0) - 25, Y(l.elevation) - 1.2, 2.2, bold)
        T(`FFL ${l.elevation >= 0 ? '+' : ''}${l.elevation}`, X(0) - 25, Y(l.elevation) + 2.8, 1.9, font, grey)
        const hx = X(L) + 10
        page.drawLine({ start: P(hx, Y(l.elevation)), end: P(hx, Y(l.top)), thickness: 0.15 * PT, color: C([0.7, 0.33, 0.04]) })
        T(String(l.top - l.elevation), hx + 1.2, (Y(l.elevation) + Y(l.top)) / 2, 1.9, font, C([0.7, 0.33, 0.04]))
      }
      const FILL = { slab: [[0.8, 0.84, 0.88], [0.2, 0.25, 0.33]], beam: [[1, 0.84, 0.67], [0.6, 0.2, 0.07]], column: [[0.58, 0.64, 0.72], [0.12, 0.16, 0.23]], rcwall: [[0.39, 0.45, 0.55], [0.06, 0.09, 0.16]], wall: [[0.95, 0.96, 0.98], [0.4, 0.45, 0.52]] }
      const order = ['wall', 'rcwall', 'column', 'slab', 'beam']
      for (const p of [...parts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))) {
        const [fill, stroke] = FILL[p.kind]
        rect(p.s0, p.s1, p.z0, p.z1, p.seen ? null : fill, stroke, p.seen)
      }
      for (const p of parts.filter(q => q.kind === 'beam' && q.cut)) {
        const s = safe(p.label), w = font.widthOfTextAtSize(s, 1.7 * PT)
        page.drawText(s, { x: P(X((p.s0 + p.s1) / 2), 0).x - w / 2, y: P(0, Y(p.z0) + 2.4).y, size: 1.7 * PT, font, color: C([0.6, 0.2, 0.07]) })
      }
      done()
    }
  }

  return { bytes: await doc.save(), sheets }
}

export async function downloadPdf(plan, opts, fileName) {
  const { bytes, sheets } = await planToPdf(plan, opts)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return sheets
}
