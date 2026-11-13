// Layout plan model and geometry. All lengths are millimetres, plan coordinates
// have x to the right and y downwards (same as the screen).
//
// plan = { v, name, grid, snap, levelId, levels: [level] }
// level = { id, name, elevation, wallHeight, slab, items: [item], bg }
// item types:
//   wall    { a, b, thickness, height }
//   room    { pts: [p], name, slab }
//   column  { shape: 'rect'|'round', x, y, w, d, height, grid? }
//   beam    { a, b, width, depth, ga?, gb? }  (depth hangs below the slab above)
//   grid    { x, y, xs, ys }  structural gridlines, see syncGrid
//   opening { kind: 'door'|'window', wallId, offset (centre, from wall start), width, height, sill, flip, side }
//   dim     { a, b }
//   label   { x, y, text, size }
// bg = { src (data URL), w, h (px), x, y (mm, top-left), mmPerPx, opacity, show }

export const uid = () => Math.random().toString(36).slice(2, 10)

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
export const same = (a, b, tol = 1) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol
export const round = (v, step) => Math.round(v / step) * step

export function newLevel(name = 'Level 1', elevation = 0) {
  return { id: uid(), name, elevation, wallHeight: 3000, slab: 150, items: [], bg: null }
}

export function newPlan() {
  const level = newLevel()
  return { v: 1, name: 'Untitled layout', grid: 100, snap: true, levelId: level.id, levels: [level] }
}

export const activeLevel = plan => plan.levels.find(l => l.id === plan.levelId) || plan.levels[0]

export function updateLevel(plan, levelId, fn) {
  return { ...plan, levels: plan.levels.map(l => (l.id === levelId ? fn(l) : l)) }
}

export function updateItems(plan, fn) {
  const lv = activeLevel(plan)
  return updateLevel(plan, lv.id, l => ({ ...l, items: fn(l.items) }))
}

// Removing a wall removes the doors and windows in it.
export function removeItem(items, id) {
  return items.filter(i => i.id !== id && i.wallId !== id)
}

export function polyArea(pts) {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    s += p.x * q.y - q.x * p.y
  }
  return Math.abs(s) / 2
}

export function polyPerimeter(pts) {
  let s = 0
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length])
  return s
}

export function centroid(pts) {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    const f = p.x * q.y - q.x * p.y
    a += f; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f
  }
  if (Math.abs(a) < 1e-6) {
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

export function pointInPoly(p, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

// Nearest point on segment a-b to p. t is 0..1 along the segment.
export function projectOnSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  const pt = { x: a.x + dx * t, y: a.y + dy * t }
  return { t, pt, d: dist(p, pt) }
}

// Unit direction and left-hand normal of a wall.
export function wallAxes(w) {
  const len = dist(w.a, w.b) || 1
  const u = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len }
  return { len, u, n: { x: -u.y, y: u.x } }
}

// Four corners of a wall, optionally stretched at each end (so joined corners close up).
export function wallCorners(w, extA = 0, extB = 0) {
  const { u, n } = wallAxes(w)
  const h = w.thickness / 2
  const a = { x: w.a.x - u.x * extA, y: w.a.y - u.y * extA }
  const b = { x: w.b.x + u.x * extB, y: w.b.y + u.y * extB }
  return [
    { x: a.x + n.x * h, y: a.y + n.y * h },
    { x: b.x + n.x * h, y: b.y + n.y * h },
    { x: b.x - n.x * h, y: b.y - n.y * h },
    { x: a.x - n.x * h, y: a.y - n.y * h },
  ]
}

// Point along a wall, `along` mm from its start and `across` mm to its left.
export function onWall(w, along, across = 0) {
  const { u, n } = wallAxes(w)
  return { x: w.a.x + u.x * along + n.x * across, y: w.a.y + u.y * along + n.y * across }
}

export const clampOpening = (o, wall) => {
  const len = dist(wall.a, wall.b)
  const width = Math.min(o.width, len)
  return { ...o, width, offset: Math.max(width / 2, Math.min(len - width / 2, o.offset)) }
}

// Every point worth snapping to on a level.
export function snapPoints(items) {
  const out = []
  for (const it of items) {
    if (it.type === 'wall' || it.type === 'dim') out.push(it.a, it.b)
    else if (it.type === 'room') out.push(...it.pts)
    else if (it.type === 'column') out.push({ x: it.x, y: it.y })
    else if (it.type === 'beam') out.push(it.a, it.b)
    else if (it.type === 'grid') for (let i = 0; i <= it.xs.length; i++) for (let j = 0; j <= it.ys.length; j++) out.push(gridNode(it, i, j))
  }
  return out
}

export function itemPoints(it, items) {
  switch (it.type) {
    case 'wall': return wallCorners(it)
    case 'room': return it.pts
    case 'dim': case 'beam': return [it.a, it.b]
    case 'grid': return [{ x: it.x - 2000, y: it.y - 2000 }, gridNode(it, it.xs.length, it.ys.length)]
    case 'column': return [{ x: it.x - it.w / 2, y: it.y - it.d / 2 }, { x: it.x + it.w / 2, y: it.y + it.d / 2 }]
    case 'label': return [{ x: it.x, y: it.y }]
    case 'opening': {
      const w = items.find(i => i.id === it.wallId)
      return w ? [onWall(w, it.offset)] : []
    }
    default: return []
  }
}

export function bounds(level) {
  const pts = level.items.flatMap(it => itemPoints(it, level.items))
  if (level.bg?.show) {
    const b = level.bg
    pts.push({ x: b.x, y: b.y }, { x: b.x + b.w * b.mmPerPx, y: b.y + b.h * b.mmPerPx })
  }
  if (!pts.length) return null
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

// Moves an item by dx, dy. Openings move with their wall, so they are left alone.
export function moveItem(it, dx, dy) {
  const mv = p => ({ x: p.x + dx, y: p.y + dy })
  switch (it.type) {
    case 'wall': case 'dim': return { ...it, a: mv(it.a), b: mv(it.b) }
    case 'beam': return { ...it, a: mv(it.a), b: mv(it.b), ga: undefined, gb: undefined }
    case 'grid': return { ...it, x: it.x + dx, y: it.y + dy }
    case 'column': return { ...it, x: it.x + dx, y: it.y + dy, grid: undefined }
    case 'room': return { ...it, pts: it.pts.map(mv) }
    case 'label': return { ...it, x: it.x + dx, y: it.y + dy }
    default: return it
  }
}

// Copies an item (and, for a wall, its doors and windows) with new ids.
export function cloneItems(it, items, dx, dy) {
  const copy = { ...moveItem(it, dx, dy), id: uid() }
  if (it.type === 'grid') {
    const members = items.filter(m => m.grid?.g === it.id || (m.ga?.g === it.id && m.gb?.g === it.id))
    const link = r => r && { ...r, g: copy.id }
    return [copy, ...syncGrid([copy, ...members.map(m => ({ ...m, id: uid(), grid: link(m.grid), ga: link(m.ga), gb: link(m.gb) }))]).slice(1)]
  }
  if (it.type !== 'wall') return it.type === 'opening' ? [] : [copy]
  return [copy, ...items.filter(o => o.wallId === it.id).map(o => ({ ...o, id: uid(), wallId: copy.id }))]
}

// ── Structural grid ─────────────────────────────────────────
// grid { x, y (where gridline 1 meets A), xs: [bay widths →], ys: [bay depths ↓] }
// Columns linked to a grid carry grid: { g, i, j }; beams carry ga / gb for each end.
// syncGrid puts linked items back on their gridline intersections after any grid change.
const sum = (arr, n) => arr.slice(0, n).reduce((s, v) => s + v, 0)
export const gridNode = (g, i, j) => ({ x: g.x + sum(g.xs, i), y: g.y + sum(g.ys, j) })
export const colName = i => String(i + 1)
export const rowName = j => {
  let s = '', n = j
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}
export const nodeName = r => `${rowName(r.j)}/${colName(r.i)}`

export function syncGrid(items) {
  const grids = new Map(items.filter(i => i.type === 'grid').map(g => [g.id, g]))
  // null = grid gone (unlink), false = intersection no longer exists (remove), else the point
  const node = r => {
    const g = grids.get(r.g)
    if (!g) return null
    if (r.i > g.xs.length || r.j > g.ys.length) return false
    return gridNode(g, r.i, r.j)
  }
  const out = []
  for (const it of items) {
    if (it.type === 'column' && it.grid) {
      const p = node(it.grid)
      if (p === false) continue
      out.push(p ? (p.x === it.x && p.y === it.y ? it : { ...it, x: p.x, y: p.y }) : { ...it, grid: undefined })
    } else if (it.type === 'beam' && (it.ga || it.gb)) {
      let b = it, drop = false
      for (const [ref, key] of [['ga', 'a'], ['gb', 'b']]) {
        if (!it[ref]) continue
        const p = node(it[ref])
        if (p === false) drop = true
        else if (p === null) b = { ...b, [ref]: undefined }
        else if (!same(p, b[key], 0)) b = { ...b, [key]: p }
      }
      if (!drop) out.push(b)
    } else out.push(it)
  }
  return out
}

// The gridline intersection at p, if there is one.
export function findNode(items, p) {
  for (const g of items) {
    if (g.type !== 'grid') continue
    for (let i = 0; i <= g.xs.length; i++) for (let j = 0; j <= g.ys.length; j++) {
      if (same(gridNode(g, i, j), p)) return { g: g.id, i, j }
    }
  }
  return undefined
}

// Accepts "8000, 8000, 6000", "3x8000, 6000" or "3@8000".
export function parseSpacings(text) {
  const out = []
  for (const part of String(text).split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[x×@*]\s*(\d+(?:\.\d+)?)$/i)
    if (m) { for (let k = 0; k < +m[1]; k++) out.push(+m[2]) } else if (+part > 0) out.push(+part)
    else return null
  }
  return out.length && out.length <= 60 ? out : null
}

// Columns at every intersection and beams along every gridline bay, skipping ones already there.
export function gridMembers(g, items, { columns, beams, col, beam, height }) {
  const out = []
  const hasCol = (i, j) => items.some(c => c.type === 'column' && c.grid?.g === g.id && c.grid.i === i && c.grid.j === j)
  const key = (r1, r2) => [`${r1.i},${r1.j}`, `${r2.i},${r2.j}`].sort().join('|')
  const beamKeys = new Set(items.filter(b => b.type === 'beam' && b.ga?.g === g.id && b.gb?.g === g.id).map(b => key(b.ga, b.gb)))
  if (columns) {
    for (let i = 0; i <= g.xs.length; i++) for (let j = 0; j <= g.ys.length; j++) {
      if (hasCol(i, j)) continue
      const p = gridNode(g, i, j)
      out.push({ id: uid(), type: 'column', shape: 'rect', x: p.x, y: p.y, w: col.w, d: col.d, height, grid: { g: g.id, i, j } })
    }
  }
  if (beams) {
    const add = (r1, r2) => {
      if (beamKeys.has(key(r1, r2))) return
      out.push({ id: uid(), type: 'beam', a: gridNode(g, r1.i, r1.j), b: gridNode(g, r2.i, r2.j), width: beam.w, depth: beam.d,
        ga: { g: g.id, ...r1 }, gb: { g: g.id, ...r2 } })
    }
    for (let j = 0; j <= g.ys.length; j++) for (let i = 0; i < g.xs.length; i++) add({ i, j }, { i: i + 1, j })
    for (let i = 0; i <= g.xs.length; i++) for (let j = 0; j < g.ys.length; j++) add({ i, j }, { i, j: j + 1 })
  }
  return out
}

export const fmtMm = mm => `${Math.round(mm).toLocaleString('en-MY')}`
export const fmtArea = mm2 => `${(mm2 / 1e6).toFixed(2)} m²`

export function planStats(plan) {
  let walls = 0, area = 0
  for (const l of plan.levels) for (const it of l.items) {
    if (it.type === 'wall') walls++
    if (it.type === 'room') area += polyArea(it.pts)
  }
  return { levels: plan.levels.length, walls, area: area / 1e6 }
}
