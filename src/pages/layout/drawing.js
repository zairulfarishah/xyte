// The plan as drawing primitives, shared by the CAD (DXF) export and the PDF print, so
// both show the same thing. Coordinates are plan millimetres (y down the page).
// sink = {
//   line(layer, a, b), pline(layer, pts, closed), circle(layer, c, r, color?),
//   arc(layer, c, r, from, to)   minor arc around c between points from and to,
//   label(layer, p, h, text, rot?, color?)   text centred on p, rot = degrees clockwise on the page
// }
import {
  gridPoint, gridLabels, columnCorners, beamAxis, wallAxes, wallCorners, onWall, same, dist, centroid, polyArea, slabNetArea,
} from './geometry'
import { SCAN_STATUS, scanToPlan } from './scan'

// layer: colour (AutoCAD colour number), linetype, and how it prints
export const LAYERS = {
  'S-GRID': { aci: 1, lt: 'CENTER', rgb: [0.86, 0.15, 0.15], w: 0.25, dash: [8, 2, 1.5, 2] },
  'S-GRID-TEXT': { aci: 1, lt: 'CONTINUOUS', rgb: [0.86, 0.15, 0.15], w: 0.3 },
  'S-COLS': { aci: 7, lt: 'CONTINUOUS', rgb: [0.06, 0.09, 0.16], w: 0.5, fill: [0.6, 0.64, 0.7] },
  'S-BEAM': { aci: 30, lt: 'HIDDEN', rgb: [0.85, 0.35, 0.05], w: 0.3, dash: [3, 1.5] },
  'S-BEAM-TEXT': { aci: 30, lt: 'CONTINUOUS', rgb: [0.85, 0.35, 0.05], w: 0.3 },
  'S-SLAB': { aci: 8, lt: 'CONTINUOUS', rgb: [0.45, 0.5, 0.58], w: 0.25 },
  'S-SLAB-TEXT': { aci: 8, lt: 'CONTINUOUS', rgb: [0.4, 0.45, 0.52], w: 0.3 },
  'S-SLAB-OPEN': { aci: 7, lt: 'CONTINUOUS', rgb: [0.06, 0.09, 0.16], w: 0.35 },
  'S-WALL': { aci: 7, lt: 'CONTINUOUS', rgb: [0.06, 0.09, 0.16], w: 0.6 },
  'A-WALL': { aci: 7, lt: 'CONTINUOUS', rgb: [0.2, 0.25, 0.33], w: 0.4 },
  'A-DOOR': { aci: 4, lt: 'CONTINUOUS', rgb: [0.2, 0.25, 0.33], w: 0.25 },
  'A-GLAZ': { aci: 5, lt: 'CONTINUOUS', rgb: [0.15, 0.39, 0.92], w: 0.25 },
  'A-AREA': { aci: 150, lt: 'CONTINUOUS', rgb: [0.15, 0.39, 0.92], w: 0.2 },
  'A-DIMS': { aci: 2, lt: 'CONTINUOUS', rgb: [0.7, 0.33, 0.04], w: 0.25 },
  'A-TEXT': { aci: 7, lt: 'CONTINUOUS', rgb: [0.06, 0.09, 0.16], w: 0.3 },
  'S-SECTION': { aci: 6, lt: 'CENTER', rgb: [0.49, 0.23, 0.93], w: 0.5, dash: [8, 2, 1.5, 2] },
  'SCAN-POINTS': { aci: 30, lt: 'CONTINUOUS', rgb: [0.91, 0.35, 0.05], w: 0.4 },
  'TITLE': { aci: 7, lt: 'CONTINUOUS', rgb: [0.06, 0.09, 0.16], w: 0.4 },
}

export const upright = (a, b) => { let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180; return ang }

export function drawLevel(sink, plan, lv, scanPts = []) {
  const { line, pline, circle, arc, label } = sink
  const items = lv.items
  const grids = plan.grids || []
  const bayText = 250

  // grid (possibly turned): drawn in its own frame, then placed
  for (const gr of grids) {
    const n = gr.xs.length, m = gr.ys.length
    const W = gr.xs.reduce((s, v) => s + v, 0), H = gr.ys.reduce((s, v) => s + v, 0)
    const P = (lx, ly) => gridPoint(gr, lx, ly)
    const rot = gr.rot || 0
    const over = 2500, r = 400, xl = gridLabels(gr, 'x'), yl = gridLabels(gr, 'y')
    let at = 0
    for (let i = 0; i <= n; i++) {
      line('S-GRID', P(at, -over + r), P(at, H + 1000))
      circle('S-GRID-TEXT', P(at, -over), r)
      label('S-GRID-TEXT', P(at, -over), 350, xl[i], rot)
      if (i < n) {
        const nx = at + gr.xs[i]
        line('S-GRID-TEXT', P(at, -1200), P(nx, -1200))
        label('S-GRID-TEXT', P((at + nx) / 2, -1200 - bayText * 0.8), bayText, String(Math.round(gr.xs[i])), rot)
      }
      at += gr.xs[i] || 0
    }
    at = 0
    for (let j = 0; j <= m; j++) {
      line('S-GRID', P(-over + r, at), P(W + 1000, at))
      circle('S-GRID-TEXT', P(-over, at), r)
      label('S-GRID-TEXT', P(-over, at), 350, yl[j], rot)
      if (j < m) {
        const ny = at + gr.ys[j]
        line('S-GRID-TEXT', P(-1200, at), P(-1200, ny))
        label('S-GRID-TEXT', P(-1200 - bayText * 0.8, (at + ny) / 2), bayText, String(Math.round(gr.ys[j])), rot - 90)
      }
      at += gr.ys[j] || 0
    }
  }

  // slabs, with thickness (and drop below floor level)
  for (const s of items.filter(i => i.type === 'slab')) {
    pline('S-SLAB', s.pts, true)
    if (polyArea(s.pts) > 4e6) label('S-SLAB-TEXT', centroid(s.pts), 200, `S${s.thickness}${s.drop ? ` (-${s.drop})` : ''}`)
  }

  // slab openings: outline with a cross
  for (const o of items.filter(i => i.type === 'void')) {
    pline('S-SLAB-OPEN', o.pts, true)
    const xs = o.pts.map(q => q.x), ys = o.pts.map(q => q.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    if (o.pts.length === 4) {
      line('S-SLAB-OPEN', o.pts[0], o.pts[2])
      line('S-SLAB-OPEN', o.pts[1], o.pts[3])
    } else {
      line('S-SLAB-OPEN', { x: x0, y: y0 }, { x: x1, y: y1 })
      line('S-SLAB-OPEN', { x: x1, y: y0 }, { x: x0, y: y1 })
    }
    if (o.name && polyArea(o.pts) > 2e6) label('S-SLAB-OPEN', centroid(o.pts), 200, o.name)
  }

  // rooms
  for (const r of items.filter(i => i.type === 'room')) {
    pline('A-AREA', r.pts, true)
    const c = centroid(r.pts)
    label('A-AREA', c, 250, r.name)
    label('A-AREA', { x: c.x, y: c.y + 380 }, 180, `${(polyArea(r.pts) / 1e6).toFixed(2)} m2`)
  }

  // beams: outline (hidden line) and size, on their shifted line for edge beams
  for (const bm of items.filter(i => i.type === 'beam')) {
    const ax = beamAxis(bm)
    const L = dist(ax.a, ax.b)
    if (L < 1) continue
    pline('S-BEAM', wallCorners({ a: ax.a, b: ax.b, thickness: bm.width }), true)
    if (L > 1500) label('S-BEAM-TEXT', { x: (ax.a.x + ax.b.x) / 2, y: (ax.a.y + ax.b.y) / 2 }, 150, `B${bm.width}x${bm.depth}`, upright(ax.a, ax.b))
  }

  // columns, after the beams so their fill covers the beam lines
  for (const c of items.filter(i => i.type === 'column')) {
    if (c.shape === 'round') circle('S-COLS', c, c.w / 2)
    else pline('S-COLS', columnCorners(c), true)
  }

  // walls: two faces broken at doors / windows, jambs, and end caps where not joined.
  // Concrete (RC) walls go on the structural layer.
  const walls = items.filter(i => i.type === 'wall')
  for (const w of walls) {
    const { len } = wallAxes(w)
    if (len < 1) continue
    const layer = w.kind === 'rc' ? 'S-WALL' : 'A-WALL'
    const joined = end => walls.some(o => o.id !== w.id && (same(o.a, end) || same(o.b, end)))
    const h = w.thickness / 2
    const s0 = joined(w.a) ? -h : 0, s1 = len + (joined(w.b) ? h : 0)
    const ops = items.filter(o => o.type === 'opening' && o.wallId === w.id)
      .map(o => [o.offset - o.width / 2, o.offset + o.width / 2]).sort((a, c) => a[0] - c[0])
    let cur = s0
    const face = (from, to) => { if (to - from > 0.5) for (const side of [h, -h]) line(layer, onWall(w, from, side), onWall(w, to, side)) }
    for (const [a, c] of ops) {
      face(cur, a)
      line(layer, onWall(w, a, h), onWall(w, a, -h))
      line(layer, onWall(w, c, h), onWall(w, c, -h))
      cur = Math.max(cur, c)
    }
    face(cur, s1)
    if (!joined(w.a)) line(layer, onWall(w, 0, h), onWall(w, 0, -h))
    if (!joined(w.b)) line(layer, onWall(w, len, h), onWall(w, len, -h))
  }

  // doors and windows
  for (const o of items.filter(i => i.type === 'opening')) {
    const w = items.find(i => i.id === o.wallId)
    if (!w) continue
    const h = w.thickness / 2, a = o.offset - o.width / 2, c = o.offset + o.width / 2
    if (o.kind === 'window') {
      for (const k of [-h, 0, h]) line('A-GLAZ', onWall(w, a, k), onWall(w, c, k))
      continue
    }
    const side = o.side || 1
    const hinge = onWall(w, o.flip ? c : a, side * h), shut = onWall(w, o.flip ? a : c, side * h)
    const { n } = wallAxes(w)
    const open = { x: hinge.x + n.x * side * o.width, y: hinge.y + n.y * side * o.width }
    line('A-DOOR', hinge, open)
    arc('A-DOOR', hinge, o.width, open, shut)
  }

  // dimensions (as lines, ticks and text so they read the same everywhere)
  for (const d of items.filter(i => i.type === 'dim')) {
    const L = dist(d.a, d.b)
    if (L < 1) continue
    const u = { x: (d.b.x - d.a.x) / L, y: (d.b.y - d.a.y) / L }, nn = { x: -u.y, y: u.x }, t = 100
    line('A-DIMS', d.a, d.b)
    for (const p of [d.a, d.b]) line('A-DIMS', { x: p.x - (u.x + nn.x) * t, y: p.y - (u.y + nn.y) * t }, { x: p.x + (u.x + nn.x) * t, y: p.y + (u.y + nn.y) * t })
    label('A-DIMS', { x: (d.a.x + d.b.x) / 2 - nn.x * 220, y: (d.a.y + d.b.y) / 2 - nn.y * 220 }, 200, String(Math.round(L)), upright(d.a, d.b))
  }

  for (const l of items.filter(i => i.type === 'label')) label('A-TEXT', l, l.size, l.text)

  // section cut lines
  for (const sc of plan.sections || []) {
    line('S-SECTION', sc.a, sc.b)
    const L = dist(sc.a, sc.b)
    if (L < 1) continue
    const u = { x: (sc.b.x - sc.a.x) / L, y: (sc.b.y - sc.a.y) / L }, n = { x: -u.y, y: u.x }
    for (const [p, k] of [[sc.a, -1], [sc.b, 1]]) {
      line('S-SECTION', p, { x: p.x + n.x * 700, y: p.y + n.y * 700 })
      label('S-SECTION', { x: p.x + u.x * k * 450, y: p.y + u.y * k * 450 }, 450, sc.name)
    }
  }

  // scan points, coloured by status (orange marked, green clear, blue shifted, red no-go)
  for (const sp of scanPts) {
    const p = scanToPlan(sp, lv.bg)
    if (!p) continue
    const st = SCAN_STATUS[sp.status] || SCAN_STATUS.marked
    circle('SCAN-POINTS', p, 120, st)
    circle('SCAN-POINTS', p, 40, st)
    label('SCAN-POINTS', { x: p.x + 330, y: p.y - 150 }, 180, sp.label, 0, st)
  }
}

// Extent of everything drawLevel draws for a level (mm), for fitting on a sheet.
export function drawnBounds(plan, lv, scanPts = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const add = p => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y }
  const sink = {
    line: (_, a, b) => { add(a); add(b) },
    pline: (_, pts) => pts.forEach(add),
    circle: (_, c, r) => { add({ x: c.x - r, y: c.y - r }); add({ x: c.x + r, y: c.y + r }) },
    arc: (_, c, r) => { add({ x: c.x - r, y: c.y - r }); add({ x: c.x + r, y: c.y + r }) },
    label: (_, p, h) => { add({ x: p.x - h, y: p.y - h }); add({ x: p.x + h, y: p.y + h }) },
  }
  drawLevel(sink, plan, lv, scanPts)
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 10000, y1: 10000 }
}

// Net slab area of a level, for title blocks and schedules.
export const levelSlabArea = lv => lv.items.filter(i => i.type === 'slab').reduce((s, x) => s + slabNetArea(x, lv.items), 0)
