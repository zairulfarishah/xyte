// Layout plan model and geometry. All lengths are millimetres, plan coordinates
// have x to the right and y downwards (same as the screen).
//
// plan = { v, name, grid, snap, levelId, levels: [level], grids: [grid] }
// level = { id, name, elevation, wallHeight (floor to floor), slab, items: [item], bg }
// grids are building-wide: the same gridlines on every level (see syncGrid).
//   grid    { x, y, xs, ys, xl?, yl? }  structural gridlines; xl / yl are the line names
// item types:
//   wall    { a, b, thickness, height, kind? }  kind 'rc' = concrete (structural / core) wall
//   room    { pts: [p], name, slab }
//   slab    { pts: [p], thickness, drop?, bay? }  structural slab; drop = mm below floor level; bay { g, i, j } keeps it on a grid bay
//   void    { pts: [p], name }  opening through the slab (lift, stair, shaft)
//   column  { shape: 'rect'|'round', x, y, w, d, height, rot?, grid?, ex?, ey? }  ex / ey = offset from the grid point
//   beam    { a, b, width, depth, off?, ga?, gb? }  off = sideways shift from its line (edge beams)  (depth is overall, measured down from the top of the slab above)
//   opening { kind: 'door'|'window', wallId, offset (centre, from wall start), width, height, sill, flip, side }
//   dim     { a, b }
//   label   { x, y, text, size }
//   load    { x, y, w, d, kn | h, name, kind: 'equipment' | 'debris' }  equipment or debris on the slab (see loads.js)
//   note    { x, y, text, photos: [{ path, name }] }  site note pinned on the plan, photos in the layouts bucket
//   footing { x, y, w, d, h, top, rot?, grid?, ex?, ey?, kind: 'pad'|'pile', piles?, pileCap? }  under a column of the lowest level; top = depth below the floor
// slab, beam, column and footing may carry rebar or design (a shared design type, plan.designs): see rebar.js
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
  return { v: 2, name: 'Untitled layout', grid: 100, snap: true, levelId: level.id, levels: [level], grids: [] }
}

// Older saves kept a copy of the grid on each level. Move them to plan.grids,
// merging copies that are the same grid, and point columns / beams at the merged one.
export function migratePlan(p) {
  if (!p || Array.isArray(p.grids)) return p
  const grids = [], alias = new Map(), byKey = new Map()
  for (const l of p.levels) for (const g of l.items) {
    if (g.type !== 'grid') continue
    const k = JSON.stringify([g.x, g.y, g.xs, g.ys])
    if (byKey.has(k)) alias.set(g.id, byKey.get(k))
    else { byKey.set(k, g.id); grids.push(g) }
  }
  const re = r => r && { ...r, g: alias.get(r.g) || r.g }
  const levels = p.levels.map(l => ({
    ...l,
    items: l.items.filter(i => i.type !== 'grid').map(i => (i.grid || i.ga || i.gb
      ? { ...i, ...(i.grid ? { grid: re(i.grid) } : null), ...(i.ga ? { ga: re(i.ga) } : null), ...(i.gb ? { gb: re(i.gb) } : null) }
      : i)),
  }))
  return { ...p, v: 2, grids, levels }
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
export function snapPoints(items, grids = []) {
  const out = []
  for (const it of items) {
    if (it.type === 'wall' || it.type === 'dim') out.push(it.a, it.b)
    else if (it.pts) out.push(...it.pts)   // room, slab, void
    else if (it.type === 'column' || it.type === 'footing') out.push({ x: it.x, y: it.y })
    else if (it.type === 'beam') out.push(it.a, it.b)
  }
  for (const g of grids) for (let i = 0; i <= g.xs.length; i++) for (let j = 0; j <= g.ys.length; j++) out.push(gridNode(g, i, j))
  return out
}

export function itemPoints(it, items) {
  switch (it.type) {
    case 'wall': return wallCorners(it)
    case 'room': case 'slab': case 'void': return it.pts
    case 'dim': case 'beam': return [it.a, it.b]
    case 'grid': {
      const W = it.xs.reduce((s, v) => s + v, 0), H = it.ys.reduce((s, v) => s + v, 0)
      return [gridPoint(it, -2500, -2500), gridPoint(it, W + 1000, -2500), gridPoint(it, -2500, H + 1000), gridPoint(it, W + 1000, H + 1000)]
    }
    case 'column': case 'footing': return [{ x: it.x - it.w / 2, y: it.y - it.d / 2 }, { x: it.x + it.w / 2, y: it.y + it.d / 2 }]
    case 'label': case 'note': return [{ x: it.x, y: it.y }]
    case 'load': return [{ x: it.x - it.w / 2, y: it.y - it.d / 2 }, { x: it.x + it.w / 2, y: it.y + it.d / 2 }]
    case 'opening': {
      const w = items.find(i => i.id === it.wallId)
      return w ? [onWall(w, it.offset)] : []
    }
    default: return []
  }
}

// Corners of a column, turned by its rot (degrees clockwise).
export function columnCorners(c) {
  const r = (c.rot || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const lx = a * c.w / 2, ly = b * c.d / 2
    return { x: c.x + lx * cs - ly * sn, y: c.y + lx * sn + ly * cs }
  })
}

export function bounds(level, grids = []) {
  const pts = [...level.items, ...grids].flatMap(it => itemPoints(it, level.items))
  if (level.cad?.show) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const l of level.cad.layers) for (let i = 0; i < l.segs.length; i += 2) {
      const x = l.segs[i], y = l.segs[i + 1]
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
    if (Number.isFinite(x0)) pts.push({ x: x0 + level.cad.x, y: y0 + level.cad.y }, { x: x1 + level.cad.x, y: y1 + level.cad.y })
  }
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
    // a column on the grid stays on it, offset from its gridline intersection
    case 'column': case 'footing': return it.grid
      ? { ...it, x: it.x + dx, y: it.y + dy, ex: (it.ex || 0) + dx, ey: (it.ey || 0) + dy }
      : { ...it, x: it.x + dx, y: it.y + dy }
    case 'room': return { ...it, pts: it.pts.map(mv) }
    case 'slab': return { ...it, pts: it.pts.map(mv), bay: undefined }
    case 'void': return { ...it, pts: it.pts.map(mv) }
    case 'label': case 'note': case 'load': return { ...it, x: it.x + dx, y: it.y + dy }
    default: return it
  }
}

// Copies an item (and, for a wall, its doors and windows) with new ids.
export function cloneItems(it, items, dx, dy) {
  if (it.type === 'grid' || it.type === 'opening') return []
  const copy = { ...moveItem(it, dx, dy), id: uid() }
  if (it.type === 'column' || it.type === 'footing') { copy.grid = undefined; copy.ex = undefined; copy.ey = undefined }
  if (it.type !== 'wall') return [copy]
  return [copy, ...items.filter(o => o.wallId === it.id).map(o => ({ ...o, id: uid(), wallId: copy.id }))]
}

// ── Structural grid ─────────────────────────────────────────
// grid { x, y (where the first lines meet), xs: [bay widths →], ys: [bay depths ↓], xl / yl: line names }
// Columns linked to a grid carry grid: { g, i, j } (+ ex / ey offset); beams carry ga / gb for each end;
// slabs carry bay: { g, i, j } for the bay between lines i..i+1 and j..j+1.
// Grids live on the plan and are shared by every level. syncGrid puts linked items
// back on the grid after any grid change.
// A grid can be turned (g.rot, degrees clockwise on the plan) about its first intersection.
const sum = (arr, n) => arr.slice(0, n).reduce((s, v) => s + v, 0)
export function gridPoint(g, lx, ly) {
  if (!g.rot) return { x: g.x + lx, y: g.y + ly }
  const r = g.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
  const r3 = v => Math.round(v * 1000) / 1000     // no 4.9e-13 leftovers at 90°
  return { x: r3(g.x + lx * c - ly * s), y: r3(g.y + lx * s + ly * c) }
}
// unit vector along which line positions run: 'x' = the across direction, 'y' = down
export function gridAxis(g, axis) {
  const r = (g.rot || 0) * Math.PI / 180
  return axis === 'x' ? { x: Math.cos(r), y: Math.sin(r) } : { x: -Math.sin(r), y: Math.cos(r) }
}
export const gridNode = (g, i, j) => gridPoint(g, sum(g.xs, i), sum(g.ys, j))
export const bayPts = (g, i, j) => [gridNode(g, i, j), gridNode(g, i + 1, j), gridNode(g, i + 1, j + 1), gridNode(g, i, j + 1)]
export const colName = i => String(i + 1)
export const rowName = j => {
  let s = '', n = j
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}

// The name after s: 7 → 8, C → D, Z → AA, anything else gets a prime.
export function nextLabel(s) {
  if (/^\d+$/.test(s)) return String(+s + 1)
  if (/^[A-Z]+$/.test(s)) {
    const a = s.split('')
    let k = a.length - 1
    while (k >= 0 && a[k] === 'Z') { a[k] = 'A'; k-- }
    if (k < 0) a.unshift('A'); else a[k] = String.fromCharCode(a[k].charCodeAt(0) + 1)
    return a.join('')
  }
  return `${s}'`
}

// Names of every line on one axis ('x' = the lines across, 'y' = the lines down).
export function gridLabels(g, axis) {
  const n = (axis === 'x' ? g.xs : g.ys).length + 1
  const given = (axis === 'x' ? g.xl : g.yl) || []
  const out = []
  for (let k = 0; k < n; k++) out.push(given[k] || (k ? nextLabel(out[k - 1]) : axis === 'x' ? '1' : 'A'))
  return out
}

export function nodeName(r, grids) {
  const g = grids?.find(x => x.id === r.g)
  return g ? `${gridLabels(g, 'y')[r.j]}/${gridLabels(g, 'x')[r.i]}` : '?'
}

export function bayName(r, grids) {
  const g = grids?.find(x => x.id === r.g)
  if (!g) return '?'
  const xl = gridLabels(g, 'x'), yl = gridLabels(g, 'y')
  return `${yl[r.j]}–${yl[r.j + 1]} / ${xl[r.i]}–${xl[r.i + 1]}`
}

export function syncGrid(items, grids = []) {
  const map = new Map(grids.map(g => [g.id, g]))
  // null = grid gone (unlink), false = intersection no longer exists (remove), else the point
  const node = r => {
    const g = map.get(r.g)
    if (!g) return null
    if (r.i > g.xs.length || r.j > g.ys.length) return false
    return gridNode(g, r.i, r.j)
  }
  const out = []
  for (const it of items) {
    if ((it.type === 'column' || it.type === 'footing') && it.grid) {
      const p = node(it.grid)
      if (p === false) continue
      if (!p) { out.push({ ...it, grid: undefined, ex: undefined, ey: undefined }); continue }
      const x = p.x + (it.ex || 0), y = p.y + (it.ey || 0), rot = map.get(it.grid.g).rot || 0
      out.push(x === it.x && y === it.y && (it.rot || 0) === rot ? it : { ...it, x, y, rot })
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
    } else if (it.type === 'slab' && it.bay) {
      const g = map.get(it.bay.g)
      if (!g) { out.push({ ...it, bay: undefined }); continue }
      if (it.bay.i >= g.xs.length || it.bay.j >= g.ys.length) continue
      const pts = bayPts(g, it.bay.i, it.bay.j)
      out.push(pts.every((q, k) => it.pts[k] && same(q, it.pts[k], 0)) ? it : { ...it, pts })
    } else out.push(it)
  }
  return out
}

// Re-fit every level's linked items to the plan's grids.
export const syncPlan = plan => ({ ...plan, levels: plan.levels.map(l => ({ ...l, items: syncGrid(l.items, plan.grids) })) })

// Change one grid; columns, beams and slabs on every level follow.
export const setGrid = (plan, gid, fn) => syncPlan({ ...plan, grids: plan.grids.map(g => (g.id === gid ? fn(g) : g)) })

// Deleting a grid keeps its columns, beams and slabs where they are.
export const removeGrid = (plan, gid) => syncPlan({ ...plan, grids: plan.grids.filter(g => g.id !== gid) })

// Moves line k on one axis by d mm, keeping every other line where it is.
export function moveLine(g, axis, k, d) {
  const key = axis === 'x' ? 'xs' : 'ys', s = [...g[key]], n = s.length, MIN = 100
  if (k === 0) {
    d = Math.min(d, s[0] - MIN); s[0] -= d
    const u = gridAxis(g, axis)
    return { ...g, x: g.x + u.x * d, y: g.y + u.y * d, [key]: s }
  }
  if (k === n) { d = Math.max(d, MIN - s[n - 1]); s[n - 1] += d; return { ...g, [key]: s } }
  d = Math.max(MIN - s[k - 1], Math.min(d, s[k] - MIN))
  s[k - 1] += d; s[k] -= d
  return { ...g, [key]: s }
}

// Renumbers grid references on every level after lines are added or removed.
// line(i) → new index or null (remove the item); bay(i) → new index, null (remove) or [indices] (split).
function remapGrid(plan, gid, axis, ng, line, bay) {
  const ik = axis === 'x' ? 'i' : 'j'
  const ref = r => (r && r.g === gid ? (line(r[ik]) == null ? null : { ...r, [ik]: line(r[ik]) }) : r)
  const levels = plan.levels.map(l => ({
    ...l,
    items: l.items.flatMap(it => {
      if (it.type === 'slab' && it.bay?.g === gid) {
        const b = bay(it.bay[ik])
        if (b == null) return []
        return (Array.isArray(b) ? b : [b]).map((n, k) => ({ ...it, id: k ? uid() : it.id, bay: { ...it.bay, [ik]: n } }))
      }
      if ((it.type === 'column' || it.type === 'footing') && it.grid?.g === gid) {
        const r = ref(it.grid)
        return r ? [{ ...it, grid: r }] : []
      }
      if (it.type === 'beam' && (it.ga?.g === gid || it.gb?.g === gid)) {
        const ga = ref(it.ga), gb = ref(it.gb)
        return ga === null || gb === null ? [] : [{ ...it, ga, gb }]
      }
      return [it]
    }),
  }))
  return syncPlan({ ...plan, grids: plan.grids.map(g => (g.id === gid ? ng : g)), levels })
}

// Adds a line inside bay k (between lines k and k+1), `at` mm from line k (default: the middle).
// It is named after line k with an "a" (2 → 2a). A slab in that bay is split in two.
export function insertLine(plan, gid, axis, k, at) {
  const g = plan.grids.find(x => x.id === gid)
  const key = axis === 'x' ? 'xs' : 'ys', lk = axis === 'x' ? 'xl' : 'yl'
  const s = g[key]
  if (s[k] < 200) return plan
  const a = Math.max(100, Math.min(s[k] - 100, at ?? Math.round(s[k] / 2)))
  const labels = gridLabels(g, axis)
  const ng = { ...g, [key]: [...s.slice(0, k), a, s[k] - a, ...s.slice(k + 1)], [lk]: [...labels.slice(0, k + 1), `${labels[k]}a`, ...labels.slice(k + 1)] }
  return remapGrid(plan, gid, axis, ng, i => (i > k ? i + 1 : i), b => (b > k ? b + 1 : b === k ? [k, k + 1] : b))
}

// Removes line k. Columns and beams on it are removed; the slabs either side become one bay.
export function deleteLine(plan, gid, axis, k) {
  const g = plan.grids.find(x => x.id === gid)
  const key = axis === 'x' ? 'xs' : 'ys', lk = axis === 'x' ? 'xl' : 'yl'
  const s = g[key], n = s.length
  if (n < 2) return plan
  let ns, shift = 0
  if (k === 0) { shift = s[0]; ns = s.slice(1) }
  else if (k === n) ns = s.slice(0, -1)
  else ns = [...s.slice(0, k - 1), s[k - 1] + s[k], ...s.slice(k + 1)]
  const labels = gridLabels(g, axis).filter((_, m) => m !== k)
  const u = gridAxis(g, axis)
  const ng = { ...g, x: g.x + u.x * shift, y: g.y + u.y * shift, [key]: ns, [lk]: labels }
  const gone = k === n ? n - 1 : k     // the bay that disappears
  return remapGrid(plan, gid, axis, ng, i => (i === k ? null : i > k ? i - 1 : i), b => (b === gone ? null : b > gone ? b - 1 : b))
}

// The gridline intersection at p, if there is one.
export function findNode(grids, p) {
  for (const g of grids || []) {
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

// Columns at every intersection, beams along every gridline bay and slabs in every bay,
// skipping ones already there.
export function gridMembers(g, items, { columns, beams, slabs, col, beam, slab, height }) {
  const out = []
  const hasCol = (i, j) => items.some(c => c.type === 'column' && c.grid?.g === g.id && c.grid.i === i && c.grid.j === j)
  // a beam already runs over this bay, possibly as one longer beam
  const covered = (r1, r2) => items.some(b => {
    if (b.type !== 'beam' || b.ga?.g !== g.id || b.gb?.g !== g.id) return false
    if (r1.j === r2.j) return b.ga.j === r1.j && b.gb.j === r1.j && Math.min(b.ga.i, b.gb.i) <= r1.i && Math.max(b.ga.i, b.gb.i) >= r2.i
    return b.ga.i === r1.i && b.gb.i === r1.i && Math.min(b.ga.j, b.gb.j) <= r1.j && Math.max(b.ga.j, b.gb.j) >= r2.j
  })
  if (columns) {
    for (let i = 0; i <= g.xs.length; i++) for (let j = 0; j <= g.ys.length; j++) {
      if (hasCol(i, j)) continue
      const p = gridNode(g, i, j)
      out.push({ id: uid(), type: 'column', shape: 'rect', x: p.x, y: p.y, w: col.w, d: col.d, height, grid: { g: g.id, i, j } })
    }
  }
  if (beams) {
    const add = (r1, r2) => {
      if (covered(r1, r2)) return
      out.push({ id: uid(), type: 'beam', a: gridNode(g, r1.i, r1.j), b: gridNode(g, r2.i, r2.j), width: beam.w, depth: beam.d,
        ga: { g: g.id, ...r1 }, gb: { g: g.id, ...r2 } })
    }
    for (let j = 0; j <= g.ys.length; j++) for (let i = 0; i < g.xs.length; i++) add({ i, j }, { i: i + 1, j })
    for (let i = 0; i <= g.xs.length; i++) for (let j = 0; j < g.ys.length; j++) add({ i, j }, { i, j: j + 1 })
  }
  if (slabs) {
    const has = (i, j) => items.some(s => s.type === 'slab' && s.bay?.g === g.id && s.bay.i === i && s.bay.j === j)
    for (let i = 0; i < g.xs.length; i++) for (let j = 0; j < g.ys.length; j++) {
      if (!has(i, j)) out.push({ id: uid(), type: 'slab', pts: bayPts(g, i, j), thickness: slab, bay: { g: g.id, i, j } })
    }
  }
  return out
}

export const fmtMm = mm => `${Math.round(mm).toLocaleString('en-MY')}`
export const fmtArea = mm2 => `${(mm2 / 1e6).toFixed(2)} m²`

export function planStats(plan) {
  let walls = 0, rooms = 0, slabs = 0
  for (const l of plan.levels) for (const it of l.items) {
    if (it.type === 'wall') walls++
    if (it.type === 'room') rooms += polyArea(it.pts)
    if (it.type === 'slab') slabs += slabNetArea(it, l.items)
  }
  return { levels: plan.levels.length, walls, area: (rooms || slabs) / 1e6, slabArea: slabs / 1e6 }
}

// The next level above this one, if any.
export const levelAbove = (plan, level) => plan.levels
  .filter(l => l.elevation > level.elevation)
  .reduce((a, b) => (!a || b.elevation < a.elevation ? b : a), null)

// Structure on one level grouped by size, with rough concrete volumes (m³).
// Beam volume counts only the part below the slab above (slabAbove mm thick).
export function schedule(level, slabAbove = 0) {
  const group = (list, keyFn, add) => {
    const m = new Map()
    for (const x of list) {
      const k = keyFn(x)
      const v = m.get(k) || { key: k, n: 0, len: 0, area: 0, vol: 0 }
      add(v, x)
      m.set(k, v)
    }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }
  const items = level.items
  const cols = group(items.filter(i => i.type === 'column'), c => (c.shape === 'round' ? `Ø${c.w}` : `${c.w}×${c.d}`), (v, c) => {
    v.n++
    v.vol += (c.shape === 'round' ? Math.PI * (c.w / 2) ** 2 : c.w * c.d) * c.height / 1e9
  })
  const beams = group(items.filter(i => i.type === 'beam'), b => `${b.width}×${b.depth}`, (v, b) => {
    const L = dist(b.a, b.b)
    v.n++
    v.len += L / 1000
    v.vol += b.width * Math.max(0, b.depth - slabAbove) * L / 1e9
  })
  const slabs = group(items.filter(i => i.type === 'slab'), s => `${s.thickness} thk`, (v, s) => {
    const A = slabNetArea(s, items)
    v.n++
    v.area += A / 1e6
    v.vol += A * s.thickness / 1e9
  })
  const walls = group(items.filter(i => i.type === 'wall' && i.kind === 'rc'), w => `${w.thickness} thk`, (v, w) => {
    const L = dist(w.a, w.b)
    v.n++
    v.len += L / 1000
    v.vol += L * w.thickness * w.height / 1e9
  })
  const voids = items.filter(i => i.type === 'void').reduce((s, o) => s + polyArea(o.pts), 0) / 1e6
  return { cols, beams, slabs, walls, voids, vol: [...cols, ...beams, ...slabs, ...walls].reduce((s, v) => s + v.vol, 0) }
}

// Slab area less the voids (openings) whose middle falls inside it.
export function slabNetArea(s, items) {
  let A = polyArea(s.pts)
  for (const o of items) if (o.type === 'void' && pointInPoly(centroid(o.pts), s.pts)) A -= polyArea(o.pts)
  return Math.max(0, A)
}

// A beam's line after any sideways shift (off, mm to the left of a → b), e.g. an edge
// beam flush with the slab edge instead of centred on the gridline.
export function beamAxis(b) {
  if (!b.off) return { a: b.a, b: b.b }
  const L = dist(b.a, b.b) || 1
  const n = { x: -(b.b.y - b.a.y) / L, y: (b.b.x - b.a.x) / L }
  return { a: { x: b.a.x + n.x * b.off, y: b.a.y + n.y * b.off }, b: { x: b.b.x + n.x * b.off, y: b.b.y + n.y * b.off } }
}

export const beamCorners = b => { const ax = beamAxis(b); return wallCorners({ a: ax.a, b: ax.b, thickness: b.width }) }

// Parts of segment a-b inside a polygon, as [t0, t1] ranges along it (0..1).
export function segInPoly(a, b, pts) {
  const ts = [0, 1]
  const dx = b.x - a.x, dy = b.y - a.y
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    const ex = q.x - p.x, ey = q.y - p.y
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-12) continue
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den
    const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
  }
  ts.sort((x, y) => x - y)
  const out = []
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i], t1 = ts[i + 1]
    if (t1 - t0 < 1e-9) continue
    const m = (t0 + t1) / 2
    if (pointInPoly({ x: a.x + dx * m, y: a.y + dy * m }, pts)) {
      if (out.length && Math.abs(out[out.length - 1][1] - t0) < 1e-9) out[out.length - 1][1] = t1
      else out.push([t0, t1])
    }
  }
  return out
}


// Where the piles of a pile cap go, as plan points (n piles spread over the cap, turned with it).
export function pileLayout(f) {
  const n = Math.max(1, Math.round(f.piles || 4)), D = f.pileDia || 300
  const ex = Math.max(0, f.w / 2 - D / 2 - 150), ey = Math.max(0, f.d / 2 - D / 2 - 150)
  let loc
  if (n === 1) loc = [[0, 0]]
  else if (n === 2) loc = f.w >= f.d ? [[-ex, 0], [ex, 0]] : [[0, -ey], [0, ey]]
  else if (n === 3) loc = [[-ex, ey], [ex, ey], [0, -ey]]
  else {
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols)
    loc = []
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols && loc.length < n; i++) {
      loc.push([cols > 1 ? -ex + 2 * ex * i / (cols - 1) : 0, rows > 1 ? -ey + 2 * ey * j / (rows - 1) : 0])
    }
  }
  const r = (f.rot || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r)
  return loc.map(([lx, ly]) => ({ x: f.x + lx * cs - ly * sn, y: f.y + lx * sn + ly * cs }))
}
