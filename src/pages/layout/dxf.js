// DXF export (AutoCAD R12 ASCII, opens in AutoCAD, BricsCAD, ZWCAD, DraftSight, LibreCAD…).
// Drawn 1:1 in millimetres. Plan y runs down the screen; CAD y runs up, so y is flipped.
// What is drawn comes from drawing.js (shared with the PDF print); this file only writes DXF.
import { LAYERS, drawLevel, drawnBounds } from './drawing'
import { drawDetails } from './details'

function writer() {
  const out = []
  const g = (code, v) => out.push(String(code), typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v))
  return { g, text: () => out.join('\r\n') + '\r\n' }
}

// scanBy: { levelId: [scan point rows] } for levels linked to Scan Marker.
// opts.details: add the reinforcement details (length views and sections) beside the plans.
export function planToDxf(plan, levelIds, scanBy = {}, opts = {}) {
  const { g, text } = writer()
  let dx = 0                                     // offset of the level being written
  const X = p => p.x + dx, Y = p => -p.y

  const sink = {
    line: (layer, a, b) => { g(0, 'LINE'); g(8, layer); g(10, X(a)); g(20, Y(a)); g(30, 0); g(11, X(b)); g(21, Y(b)); g(31, 0) },
    pline: (layer, pts, closed = true) => {
      g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, closed ? 1 : 0)
      for (const p of pts) { g(0, 'VERTEX'); g(8, layer); g(10, X(p)); g(20, Y(p)); g(30, 0) }
      g(0, 'SEQEND'); g(8, layer)
    },
    // filled circle (a bar in section): a closed polyline of two half-circle arcs, as wide as the radius
    disc: (layer, c, r) => {
      g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1); g(40, r); g(41, r)
      for (const sx of [-1, 1]) { g(0, 'VERTEX'); g(8, layer); g(10, X({ x: c.x + sx * r / 2 })); g(20, Y(c)); g(30, 0); g(42, 1) }
      g(0, 'SEQEND'); g(8, layer)
    },
    circle: (layer, c, r, color) => { g(0, 'CIRCLE'); g(8, layer); if (color?.aci) g(62, color.aci); g(10, X(c)); g(20, Y(c)); g(30, 0); g(40, r) },
    // ARC runs anticlockwise (in CAD, y up) from start to end angle; take the shorter way round
    arc: (layer, c, r, from, to) => {
      const ang = p => ((Math.atan2(-(p.y - c.y), p.x - c.x) * 180 / Math.PI) + 360) % 360
      let t1 = ang(from), t2 = ang(to)
      if (((t2 - t1 + 360) % 360) > 180) [t1, t2] = [t2, t1]
      g(0, 'ARC'); g(8, layer); g(10, X(c)); g(20, Y(c)); g(30, 0); g(40, r); g(50, t1); g(51, t2)
    },
    // centred text; rot is clockwise on the page, CAD angles run anticlockwise
    label: (layer, p, h, s, rot = 0, color) => {
      if (!String(s ?? '').trim()) return
      g(0, 'TEXT'); g(8, layer); if (color?.aci) g(62, color.aci)
      g(10, X(p)); g(20, Y(p)); g(30, 0); g(40, h); g(1, String(s).replace(/[\r\n]+/g, ' '))
      if (rot) g(50, -rot)
      g(72, 1); g(73, 2); g(11, X(p)); g(21, Y(p)); g(31, 0)
    },
  }

  // ── header ──
  g(0, 'SECTION'); g(2, 'HEADER')
  g(9, '$ACADVER'); g(1, 'AC1009')
  g(9, '$INSUNITS'); g(70, 4)                    // millimetres
  g(9, '$LTSCALE'); g(40, 100)
  g(0, 'ENDSEC')

  // ── tables: linetypes and layers ──
  g(0, 'SECTION'); g(2, 'TABLES')
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 3)
  const ltype = (name, desc, parts) => {
    g(0, 'LTYPE'); g(2, name); g(70, 0); g(3, desc); g(72, 65); g(73, parts.length); g(40, parts.reduce((s, v) => s + Math.abs(v), 0))
    for (const p of parts) g(49, p)
  }
  ltype('CONTINUOUS', 'Solid line', [])
  ltype('CENTER', 'Center ____ _ ____ _', [31.75, -6.35, 6.35, -6.35])
  ltype('HIDDEN', 'Hidden __ __ __', [6.35, -3.175])
  g(0, 'ENDTAB')
  const layers = Object.entries(LAYERS)
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length + 1)
  for (const [name, { aci, lt }] of [['0', { aci: 7, lt: 'CONTINUOUS' }], ...layers]) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, aci); g(6, lt) }
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')

  g(0, 'SECTION'); g(2, 'ENTITIES')
  const levels = plan.levels.filter(l => levelIds.includes(l.id)).sort((a, b) => a.elevation - b.elevation)
  let nextX = null, topY = 0
  for (const lv of levels) {
    const pts = scanBy[lv.id] || []
    const b = drawnBounds(plan, lv, pts)
    // levels side by side, left to right from the lowest
    if (nextX == null) topY = b.y0
    dx = nextX == null ? 0 : nextX - b.x0
    nextX = b.x1 + dx + 10000
    drawLevel(sink, plan, lv, pts)
    // level title under the drawing
    const titleY = b.y1 + 1500
    sink.label('TITLE', { x: (b.x0 + b.x1) / 2, y: titleY }, 600, `${lv.name.toUpperCase()}  (FFL ${lv.elevation >= 0 ? '+' : ''}${lv.elevation})`)
    sink.label('TITLE', { x: (b.x0 + b.x1) / 2, y: titleY + 800 }, 300, `${plan.name} - dimensions in mm`)
  }
  // reinforcement details to the right of the plans
  if (opts.details) {
    dx = nextX ?? 0
    drawDetails(sink, plan, { x: 0, y: topY })
  }
  g(0, 'ENDSEC')
  g(0, 'EOF')
  return text()
}

export function downloadDxf(plan, levelIds, fileName, scanBy, opts) {
  const blob = new Blob([planToDxf(plan, levelIds, scanBy, opts)], { type: 'application/dxf' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, '-')}.dxf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
