// Loads: takedown from slabs to beams, columns and walls, level by level to the ground,
// and checks of equipment / debris on slabs. For planning only — not a structural design.
//
// How the model stacks up (same as the 3D view): the slab of a level sits on the beams,
// RC walls and columns of the level below (the level whose top is this floor). A level
// with nothing below it sits on the ground.
//
// plan.loads = { code: 'EC' | 'BS', density (kN/m³), grade ('C25/30'…), fy, masonry (kN/m³), sdl (kPa) }
// level.loads = { use, sdl?, qk? }
// item 'load' = { x, y, w, d (mm footprint), kn, name, kind: 'equipment' | 'debris' }
// item 'footing' (on the lowest level) = { x, y, w, d, h, top (depth below floor to its top), rot, kind: 'pad' | 'pile', piles, pileCap (kN) }
// Columns and RC walls of the lowest level stand on the footing under them.
import { dist, polyArea, pointInPoly, projectOnSeg, beamAxis, nodeName, slabNetArea, columnCorners } from './geometry'
import { slabMRd, beamCapacity, columnNRd, footingMRd } from './capacity'
import { withRebar, markOf } from './rebar'

export const CODES = {
  EC: { id: 'EC', name: 'MS EN 1990 / 1991 / 1992 (Eurocode)', short: 'MS EN', gG: 1.35, gQ: 1.5, density: 25, fy: 500 },
  BS: { id: 'BS', name: 'BS 8110 / BS 6399', short: 'BS', gG: 1.4, gQ: 1.6, density: 24, fy: 460 },
}

// Typical imposed (live) loads, kPa
export const USES = [
  { id: 'residential', label: 'Residential', EC: 1.5, BS: 1.5 },
  { id: 'office', label: 'Office', EC: 2.5, BS: 2.5 },
  { id: 'retail', label: 'Shop / retail', EC: 4.0, BS: 4.0 },
  { id: 'assembly', label: 'Assembly / crowds', EC: 5.0, BS: 5.0 },
  { id: 'carpark', label: 'Car park (cars)', EC: 2.5, BS: 2.5 },
  { id: 'storage', label: 'Storage / plant room', EC: 7.5, BS: 7.5 },
  { id: 'roof', label: 'Roof, maintenance only', EC: 0.6, BS: 0.75 },
  { id: 'roofaccess', label: 'Roof, accessible', EC: 1.5, BS: 1.5 },
]

export const GRADES = [
  { id: 'C20/25', fck: 20, fcu: 25 }, { id: 'C25/30', fck: 25, fcu: 30 }, { id: 'C28/35', fck: 28, fcu: 35 },
  { id: 'C30/37', fck: 30, fcu: 37 }, { id: 'C32/40', fck: 32, fcu: 40 }, { id: 'C35/45', fck: 35, fcu: 45 }, { id: 'C40/50', fck: 40, fcu: 50 },
]

// Site equipment and debris, weight in tonnes and footprint in mm (typical figures; check the actual machine)
export const PRESETS = [
  { name: 'Mini excavator 1.5 t', t: 1.6, w: 1000, d: 1500, kind: 'equipment' },
  { name: 'Mini excavator 3 t', t: 3.2, w: 1500, d: 2000, kind: 'equipment' },
  { name: 'Brokk 110', t: 1.0, w: 780, d: 1600, kind: 'equipment' },
  { name: 'Brokk 170', t: 1.6, w: 780, d: 1800, kind: 'equipment' },
  { name: 'Brokk 300', t: 3.1, w: 1200, d: 2200, kind: 'equipment' },
  { name: 'Wire saw unit', t: 0.35, w: 800, d: 1200, kind: 'equipment' },
  { name: 'Wall / floor saw', t: 0.25, w: 700, d: 1000, kind: 'equipment' },
  { name: 'Core drill rig', t: 0.1, w: 500, d: 600, kind: 'equipment' },
  { name: 'Hydraulic power pack', t: 0.6, w: 800, d: 1300, kind: 'equipment' },
  { name: 'Debris pile', t: 0, w: 2000, d: 2000, kind: 'debris', h: 500 },
]
export const DEBRIS_DENSITY = 16      // kN/m³, loose broken concrete

export function loadSettings(plan) {
  const s = plan.loads || {}
  const code = s.code === 'BS' ? 'BS' : 'EC'
  const g = GRADES.find(x => x.id === s.grade) || GRADES[1]
  const fy = s.fy ?? CODES[code].fy
  return {
    code, c: CODES[code], grade: g.id, fck: g.fck, fcu: g.fcu, fy, fyLink: s.fyLink ?? fy,
    density: s.density ?? CODES[code].density, masonry: s.masonry ?? 20, sdl: s.sdl ?? 1.5,
    bearing: s.bearing ?? 150, soil: s.soil ?? 18,
  }
}

export function levelLoad(lv, set) {
  const u = USES.find(x => x.id === lv.loads?.use) || USES[1]
  return { use: u.id, label: u.label, sdl: lv.loads?.sdl ?? set.sdl, qk: lv.loads?.qk ?? u[set.code], qkDefault: u[set.code] }
}

export const uls = (G, Q, set) => G * set.c.gG + Q * set.c.gQ
const BINS = 40

// Weight of a load item (kN): equipment from tonnes, debris from its pile height.
export const loadKN = it => (it.kind === 'debris' ? (it.w / 1000) * (it.d / 1000) * ((it.h || 0) / 1000) * DEBRIS_DENSITY : it.kn || 0)

export function takedown(plan) {
  const set = loadSettings(plan)
  const rho = set.density
  const tol = 60
  const below = lv => plan.levels.find(o => o.id !== lv.id && Math.abs(o.elevation + o.wallHeight - lv.elevation) <= tol) || null
  const above = lv => plan.levels.find(o => o.id !== lv.id && Math.abs(lv.elevation + lv.wallHeight - o.elevation) <= tol) || null
  const levels = [...plan.levels].sort((a, b) => b.elevation - a.elevation)      // top down

  const R = { set, levels: {}, beams: {}, cols: {}, walls: {}, slabs: {}, loads: {}, foots: {}, warnings: [] }
  const beamAcc = new Map(), colAcc = new Map(), wallAcc = new Map(), footAcc = new Map()
  for (const lv of plan.levels) {
    R.levels[lv.id] = { ground: { G: 0, Q: 0 }, lost: { G: 0, Q: 0 }, warnings: [] }
    for (const it of lv.items) {
      if (it.type === 'beam') beamAcc.set(it.id, { it, lv, bins: Array.from({ length: BINS }, () => ({ G: 0, Q: 0 })) })
      if (it.type === 'column') colAcc.set(it.id, { it, lv, G: 0, Q: 0, beams: { G: 0, Q: 0 }, above: { G: 0, Q: 0 }, slab: { G: 0, Q: 0 } })
      if (it.type === 'wall' && it.kind === 'rc') wallAcc.set(it.id, { it, lv, G: 0, Q: 0 })
      if (it.type === 'footing') footAcc.set(it.id, { it, lv, G: 0, Q: 0, cols: [] })
    }
  }
  const warn = (lv, msg) => R.levels[lv.id].warnings.push(msg)
  const withMark = (it, s) => { const mk = markOf(it, plan); return mk ? `${mk} ${s}` : s }
  const beamRef = b => withMark(b, `${b.ga ? nodeName(b.ga, plan.grids) : 'free'} – ${b.gb ? nodeName(b.gb, plan.grids) : 'free'}`)
  const colRef = c => withMark(c, c.grid ? nodeName(c.grid, plan.grids) : `at ${Math.round(c.x)}, ${Math.round(c.y)}`)
  // footing under a point of the lowest level
  const footAt = (lv, p) => lv.items.find(f => f.type === 'footing' && (pointInPoly(p, columnCorners(f)) || dist(f, p) < 1))

  const supportsCache = new Map()
  const supportsOf = lv => {
    if (supportsCache.has(lv.id)) return supportsCache.get(lv.id)
    const s = below(lv)
    const v = s && {
      lv: s,
      beams: s.items.filter(i => i.type === 'beam').map(b => ({ b, ax: beamAxis(b) })),
      walls: s.items.filter(i => i.type === 'wall' && i.kind === 'rc'),
      cols: s.items.filter(i => i.type === 'column'),
    }
    const out = v && (v.beams.length || v.walls.length || v.cols.length) ? v : null
    supportsCache.set(lv.id, out)
    return out
  }

  const addBeam = (id, t, G, Q) => {
    const k = Math.min(BINS - 1, Math.max(0, Math.floor(t * BINS)))
    const bin = beamAcc.get(id).bins[k]
    bin.G += G; bin.Q += Q
  }

  // A load at point p on floor lv goes to the nearest support below (beam, RC wall or column).
  const place = (lv, p, G, Q, preferCol = false, toFoot = preferCol, from = null) => {
    const sup = supportsOf(lv)
    if (!sup) {
      const f = toFoot && footAt(lv, p)
      if (f) { const a = footAcc.get(f.id); a.G += G; a.Q += Q; if (from && !a.cols.includes(from)) a.cols.push(from); return }
      const g = R.levels[lv.id].ground; g.G += G; g.Q += Q; return
    }
    if (preferCol) {
      const c = sup.cols.find(c => dist(c, p) <= Math.max(300, Math.max(c.w, c.d) / 2))
      if (c) { const a = colAcc.get(c.id); a.above.G += G; a.above.Q += Q; return }
    }
    // nearest support; points the same distance from several (e.g. on a panel diagonal) are shared
    const cand = []
    for (const { b, ax } of sup.beams) { const pr = projectOnSeg(p, ax.a, ax.b); cand.push({ d: pr.d, k: 'beam', id: b.id, t: pr.t }) }
    for (const w of sup.walls) cand.push({ d: projectOnSeg(p, w.a, w.b).d, k: 'wall', id: w.id })
    for (const c of sup.cols) cand.push({ d: dist(p, c), k: 'col', id: c.id })
    const bd = Math.min(...cand.map(c => c.d))
    // a column sitting on a beam line is the same support as the beam: let the beam take it
    const near = cand.filter(c => c.d <= bd + 1)
    const pick = near.some(c => c.k !== 'col') ? near.filter(c => c.k !== 'col') : near
    const f = 1 / pick.length
    for (const best of pick) {
      if (best.k === 'beam') addBeam(best.id, best.t, G * f, Q * f)
      else if (best.k === 'wall') { const w = wallAcc.get(best.id); w.G += G * f; w.Q += Q * f }
      else { const c = colAcc.get(best.id); c.slab.G += G * f; c.slab.Q += Q * f }
    }
  }

  for (const lv of levels) {
    const L = R.levels[lv.id]
    const up = above(lv)
    const slabAbove = up ? up.slab : 0

    // ── (a) beams on this level carry the floor above ──
    const lvBeams = lv.items.filter(i => i.type === 'beam')
    const lvCols = lv.items.filter(i => i.type === 'column')
    if (!up && (lvBeams.length || lvCols.length)) {
      warn(lv, `Beams and columns on ${lv.name} hold up the floor above it, and there is no level above. To load them, add the level above (Copy level makes one with the same structure), or add a roof level.`)
    }
    for (const b of lvBeams) {
      const ax = beamAxis(b), Lm = dist(ax.a, ax.b) / 1000
      const g = (b.width / 1000) * (Math.max(0, b.depth - slabAbove) / 1000) * rho      // kN/m, below the slab
      const acc = beamAcc.get(b.id)
      acc.self = g
      for (const bin of acc.bins) bin.G += g * Lm / BINS
    }
    // where each beam end goes: a column, or another beam (a secondary beam), or nowhere
    const endTarget = (b, p) => {
      const c = lvCols.find(c => dist(c, p) <= Math.max(300, Math.max(c.w, c.d) / 2 + 50))
      if (c) return { k: 'col', id: c.id }
      let best = null, bd = Infinity
      for (const o of lvBeams) {
        if (o.id === b.id) continue
        const ax = beamAxis(o), pr = projectOnSeg(p, ax.a, ax.b)
        if (pr.d <= o.width / 2 + 150 && pr.d < bd) { bd = pr.d; best = { k: 'beam', id: o.id, t: pr.t } }
      }
      return best
    }
    const targets = new Map(lvBeams.map(b => { const ax = beamAxis(b); return [b.id, [endTarget(b, ax.a), endTarget(b, ax.b)]] }))
    // secondary beams first: a beam is done once every beam resting on it is done
    const waiting = new Map(lvBeams.map(b => [b.id, 0]))
    for (const [, ts] of targets) for (const t of ts) if (t?.k === 'beam') waiting.set(t.id, waiting.get(t.id) + 1)
    const ready = lvBeams.filter(b => !waiting.get(b.id)).map(b => b.id)
    const done = new Set()
    const resolve = id => {
      done.add(id)
      const acc = beamAcc.get(id), b = acc.it, ax = beamAxis(b), Lm = dist(ax.a, ax.b) / 1000
      let RaG = 0, RaQ = 0, RbG = 0, RbQ = 0, G = 0, Q = 0
      acc.bins.forEach((bin, k) => {
        const t = (k + 0.5) / BINS
        RaG += bin.G * (1 - t); RaQ += bin.Q * (1 - t); RbG += bin.G * t; RbQ += bin.Q * t
        G += bin.G; Q += bin.Q
      })
      // ULS bending moment along the beam, simply supported
      let M = 0
      const Ra = uls(RaG, RaQ, set)
      for (let j = 1; j < BINS; j++) {
        const x = j / BINS
        let m = Ra * x * Lm
        for (let k = 0; k < j; k++) { const t = (k + 0.5) / BINS; m -= uls(acc.bins[k].G, acc.bins[k].Q, set) * (x - t) * Lm }
        M = Math.max(M, m)
      }
      const res = {
        id, ref: beamRef(b), size: `${b.width} x ${b.depth}`, span: Lm, level: lv.id, self: acc.self,
        G, Q, wULS: Lm ? uls(G, Q, set) / Lm : 0, wSLS: Lm ? (G + Q) / Lm : 0,
        Ra: Ra, Rb: uls(RbG, RbQ, set), M, V: Math.max(Ra, uls(RbG, RbQ, set)),
      }
      const cap = beamCapacity(withRebar(b, plan), set)
      if (cap) { res.MRd = cap.M; res.VRd = cap.V; res.MRdTop = cap.Mtop; res.util = Math.max(M / cap.M, res.V / cap.V); res.overReinforced = cap.overReinforced }
      R.beams[id] = res
      const send = (t, RG, RQ, end) => {
        if (!t) { warn(lv, `Beam ${res.ref}: ${end} end is not on a column or beam, ${uls(RG, RQ, set).toFixed(0)} kN not carried down.`); L.lost.G += RG; L.lost.Q += RQ; return }
        if (t.k === 'col') { const c = colAcc.get(t.id); c.beams.G += RG; c.beams.Q += RQ }
        else addBeam(t.id, t.t, RG, RQ)
      }
      const [ta, tb] = targets.get(id)
      send(ta, RaG, RaQ, 'one'); send(tb, RbG, RbQ, 'other')
      for (const t of [ta, tb]) if (t?.k === 'beam') { waiting.set(t.id, waiting.get(t.id) - 1); if (!waiting.get(t.id) && !done.has(t.id)) ready.push(t.id) }
    }
    while (ready.length) resolve(ready.shift())
    const stuck = lvBeams.filter(b => !done.has(b.id))
    if (stuck.length) { warn(lv, `${stuck.length} beams rest on each other in a loop; their loads are approximate.`); for (const b of stuck) if (!done.has(b.id)) resolve(b.id) }

    // ── (b) RC walls on this level: own weight plus what they carry, down to the floor below ──
    for (const w of lv.items.filter(i => i.type === 'wall' && i.kind === 'rc')) {
      const acc = wallAcc.get(w.id), Lm = dist(w.a, w.b) / 1000
      const self = Lm * (w.thickness / 1000) * (w.height / 1000) * rho
      const G = acc.G + self, Q = acc.Q
      R.walls[w.id] = { id: w.id, level: lv.id, len: Lm, G, Q, self, wULS: Lm ? uls(G, Q, set) / Lm : 0 }
      const n = Math.max(2, Math.ceil(Lm / 0.5))
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n
        place(lv, { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }, G / n, Q / n, false, true)
      }
    }

    // ── (c) columns on this level: beams + slab + column above + own weight, down to below ──
    for (const c of lvCols) {
      const acc = colAcc.get(c.id)
      const Ac = c.shape === 'round' ? Math.PI * (c.w / 2000) ** 2 : (c.w / 1000) * (c.d / 1000)
      const self = Ac * (c.height / 1000) * rho
      const G = acc.beams.G + acc.slab.G + acc.above.G + self, Q = acc.beams.Q + acc.slab.Q + acc.above.Q
      const res = { id: c.id, ref: colRef(c), size: c.shape === 'round' ? `Ø${c.w}` : `${c.w} x ${c.d}`, level: lv.id, self, G, Q, NSLS: G + Q, N: uls(G, Q, set), fromAbove: uls(acc.above.G, acc.above.Q, set) }
      const cap = columnNRd(withRebar(c, plan), set)
      if (cap) { res.NRd = cap.N; res.util = res.N / cap.N; res.slender = cap.slender }
      R.cols[c.id] = res
      const sup = supportsOf(lv)
      if (sup && !sup.cols.some(o => dist(o, c) <= Math.max(300, Math.max(o.w, o.d) / 2))) {
        warn(lv, `Column ${res.ref} has no column under it on ${sup.lv.name}; its load goes into the beam or slab below.`)
      }
      if (!sup && hasFootings(lv) && !footAt(lv, c)) warn(lv, `Column ${res.ref} has no footing drawn under it.`)
      place(lv, c, G, Q, true, true, c)
    }

    // ── (d) what stands on this floor: slab, brick walls, equipment and debris ──
    const LL = levelLoad(lv, set)
    const voids = lv.items.filter(i => i.type === 'void')
    const slabs = lv.items.filter(i => i.type === 'slab')
    const floors = slabs.length ? slabs : lv.items.filter(i => i.type === 'room').map(r => ({ ...r, thickness: r.slab ?? lv.slab }))
    for (const s of floors) {
      const A = polyArea(s.pts) / 1e6
      if (A <= 0) continue
      const gk = (s.thickness / 1000) * rho + LL.sdl, qk = LL.qk
      // sample points in an even grid that exactly covers the slab's box
      const step = Math.max(150, Math.sqrt(A * 1e6 / 700))
      const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y)
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
      const nx = Math.max(1, Math.round((x1 - x0) / step)), ny = Math.max(1, Math.round((y1 - y0) / step))
      const sx = (x1 - x0) / nx, sy = (y1 - y0) / ny
      const dA = (sx / 1000) * (sy / 1000)
      let G = 0, Q = 0
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const p = { x: x0 + (i + 0.5) * sx, y: y0 + (j + 0.5) * sy }
        if (!pointInPoly(p, s.pts) || voids.some(o => pointInPoly(p, o.pts))) continue
        place(lv, p, gk * dA, qk * dA)
        G += gk * dA; Q += qk * dA
      }
      R.slabs[s.id] = { id: s.id, level: lv.id, area: s.type === 'slab' ? slabNetArea(s, lv.items) / 1e6 : A, gk, qk, G, Q, wULS: uls(gk, qk, set) }
    }
    for (const w of lv.items.filter(i => i.type === 'wall' && i.kind !== 'rc')) {
      const Lm = dist(w.a, w.b) / 1000
      if (Lm <= 0) continue
      const openA = lv.items.filter(o => o.type === 'opening' && o.wallId === w.id).reduce((s, o) => s + (o.width / 1000) * (o.height / 1000), 0)
      const G = Math.max(0, Lm * (w.height / 1000) - openA) * (w.thickness / 1000) * set.masonry
      const n = Math.max(2, Math.ceil(Lm / 0.5))
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n
        place(lv, { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }, G / n, 0)
      }
    }
    for (const it of lv.items.filter(i => i.type === 'load')) {
      const P = loadKN(it), n = 5
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        place(lv, { x: it.x - it.w / 2 + it.w * (i + 0.5) / n, y: it.y - it.d / 2 + it.d * (j + 0.5) / n }, 0, P / (n * n))
      }
      R.loads[it.id] = equipmentCheck(plan, lv, it, set)
    }
  }

  // slab capacity (if bars are known) against the floor's own design load
  for (const lv of plan.levels) for (const s of lv.items.filter(i => i.type === 'slab')) {
    const r = R.slabs[s.id]
    if (!r) continue
    const span = shortSpan(s, plan)
    const cap = slabMRd(s.thickness, withRebar(s, plan).rebar, set)
    r.span = span / 1000
    r.M = r.wULS * r.span ** 2 / 8
    if (cap) { r.MRd = cap.M; r.util = r.M / cap.M }
  }
  // footings: what the columns bring down, plus the footing and the soil on it
  for (const [id, a] of footAcc) {
    const f = a.it, lv = a.lv
    const A = (f.w / 1000) * (f.d / 1000)
    const self = A * (f.h / 1000) * rho, soil = A * Math.max(0, (f.top ?? 0) / 1000) * set.soil
    const G = a.G + self + soil, Q = a.Q
    const res = {
      id, ref: markOf(f, plan) || (f.grid ? nodeName(f.grid, plan.grids) : 'Footing'), level: lv.id, area: A, self, soil,
      NcolSLS: a.G + a.Q, NcolULS: uls(a.G, a.Q, set), SLS: G + Q,
    }
    if (below(lv)) warn(lv, `Footing ${res.ref} is on ${lv.name}, which has a level below it. Footings belong on the lowest level.`)
    else if (!a.G && !a.Q) warn(lv, `Footing ${res.ref} has no column or RC wall standing on it.`)
    if (f.kind === 'pile') {
      res.piles = Math.max(1, f.piles || 1)
      res.perPile = res.SLS / res.piles
      if (f.pileCap > 0) res.utilSoil = res.perPile / f.pileCap
    } else {
      res.pressure = res.SLS / A
      res.utilSoil = res.pressure / set.bearing
      // bending: net upward pressure from the column load, on the part past the column face
      const c = a.cols[0] || null
      const cx = c ? c.w : 0, cy = c ? (c.shape === 'round' ? c.w : c.d) : 0
      const qu = res.NcolULS / A
      const ax = Math.max(0, (f.w - cx) / 2000), ay = Math.max(0, (f.d - cy) / 2000)
      res.qu = qu
      res.Mx = qu * ax * ax / 2       // kN·m per m, bars along X
      res.My = qu * ay * ay / 2       // bars along Y
      const cap = footingMRd(withRebar(f, plan), set)
      if (cap) {
        res.MRdx = cap.Mx; res.MRdy = cap.My
        const us = [cap.Mx ? res.Mx / cap.Mx : null, cap.My ? res.My / cap.My : null].filter(v => v != null)
        if (us.length) res.utilBend = Math.max(...us)
      }
    }
    const us = [res.utilSoil, res.utilBend].filter(v => v != null)
    res.util = us.length ? Math.max(...us) : null
    R.foots[id] = res
  }
  return R
}

const hasFootings = lv => lv.items.some(i => i.type === 'footing')

// Side of a square pad (mm, rounded up to 100) for a column service load N (kN),
// allowing for the pad's own weight and the soil on it.
export function footingSide(N, f, set) {
  const net = set.bearing - (f.h / 1000) * set.density - Math.max(0, (f.top ?? 0) / 1000) * set.soil
  if (!(net > 0) || !(N > 0)) return null
  return Math.ceil(Math.sqrt(N / net) * 10) * 100
}

// Shorter side of a slab panel (mm): the grid bay, or the drawn outline's box.
function shortSpan(s, plan) {
  if (s.bay) {
    const g = plan.grids.find(x => x.id === s.bay.g)
    if (g) return Math.min(g.xs[s.bay.i] || Infinity, g.ys[s.bay.j] || Infinity)
  }
  const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y)
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

// Equipment or debris on a slab panel: bending in the panel's short span compared with what
// the floor was designed for (its own weight + finishes + the floor's live load), and with the
// slab's capacity when its bars are known. Assumes the rest of the panel is kept clear.
export function equipmentCheck(plan, lv, it, set = loadSettings(plan)) {
  const P = loadKN(it)
  const out = { P, tonnes: P / 9.81, pressure: P / ((it.w / 1000) * (it.d / 1000)) }
  const slab = lv.items.find(s => s.type === 'slab' && pointInPoly(it, s.pts))
  if (!slab) { out.note = 'Not on a slab'; return out }
  const LL = levelLoad(lv, set)
  const gk = (slab.thickness / 1000) * set.density + LL.sdl
  // panel frame: short span direction
  let span, along, across
  const g = slab.bay && plan.grids.find(x => x.id === slab.bay.g)
  if (g) {
    const r = (g.rot || 0) * Math.PI / 180, ux = { x: Math.cos(r), y: Math.sin(r) }, uy = { x: -Math.sin(r), y: Math.cos(r) }
    const sx = g.xs[slab.bay.i], sy = g.ys[slab.bay.j]
    const o = slab.pts[0]
    const lx = (it.x - o.x) * ux.x + (it.y - o.y) * ux.y, ly = (it.x - o.x) * uy.x + (it.y - o.y) * uy.y
    if (sx <= sy) { span = sx; along = lx; across = sy } else { span = sy; along = ly; across = sx }
  } else {
    const xs = slab.pts.map(p => p.x), ys = slab.pts.map(p => p.y)
    const W = Math.max(...xs) - Math.min(...xs), H = Math.max(...ys) - Math.min(...ys)
    if (W <= H) { span = W; along = it.x - Math.min(...xs); across = H } else { span = H; along = it.y - Math.min(...ys); across = W }
  }
  const Ls = span / 1000
  const a = Math.min(Math.max(along / 1000, 0.05), Ls - 0.05)                 // m from a support
  const loadW = Math.min(it.w, it.d) / 1000
  const bEff = Math.min(across / 1000, loadW + 2.4 * a * (1 - a / Ls))        // effective width (one-way slab, point load)
  const Mg = set.c.gG * gk * Ls * Ls / 8                                       // kN·m per m
  const Mp = set.c.gQ * (P * a * (Ls - a) / Ls) / Math.max(bEff, 0.3)
  const Mdesign = (set.c.gG * gk + set.c.gQ * LL.qk) * Ls * Ls / 8
  Object.assign(out, { slab: slab.id, span: Ls, a, bEff, M: Mg + Mp, Mdesign, vsDesign: (Mg + Mp) / Mdesign, qEq: P / ((span / 1000) * (across / 1000)), qk: LL.qk })
  const cap = slabMRd(slab.thickness, withRebar(slab, plan).rebar, set)
  if (cap) { out.MRd = cap.M; out.util = out.M / cap.M }
  return out
}

// Traffic-light level for a ratio (1 = at the limit).
export const level3 = r => (r == null ? null : r <= 0.8 ? 'ok' : r <= 1 ? 'near' : 'over')

export const DISCLAIMER = 'For planning only. These are simplified hand-calculation methods (simply supported beams and slabs, tributary areas, short braced columns). They are not a structural design: have a professional engineer check before acting on them.'

// soft tints for how much of a capacity is used
export const TONE = {
  ok: { bg: '#EEF3EC', fg: '#3F6B3A' },
  near: { bg: '#F8F1E4', fg: '#8A6528' },
  over: { bg: '#F6E4E0', fg: '#9A3B2A' },
}
