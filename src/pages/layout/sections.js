// Cross-sections: cut the building along a line drawn on the plan.
// plan.sections = [{ id, name, a, b }] (drawn on any level, shown on all).
// The result is in section coordinates: s = mm along the line from a, z = mm above datum.
import {
  dist, segInPoly, columnCorners, wallCorners, beamAxis, gridNode, gridLabels, centroid, pointInPoly,
} from './geometry'

const circlePts = c => Array.from({ length: 24 }, (_, k) => ({ x: c.x + Math.cos(k * Math.PI / 12) * c.w / 2, y: c.y + Math.sin(k * Math.PI / 12) * c.w / 2 }))

export function computeSection(plan, sec) {
  const { a, b } = sec
  const L = dist(a, b)
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
  const along = p => (p.x - a.x) * u.x + (p.y - a.y) * u.y
  const across = p => -(p.x - a.x) * u.y + (p.y - a.y) * u.x
  const ranges = pts => segInPoly(a, b, pts).map(([t0, t1]) => [t0 * L, t1 * L])
  const parts = []        // { kind, s0, s1, z0, z1, label?, seen? }
  const levels = [...plan.levels].sort((x, y) => x.elevation - y.elevation)

  for (const lv of levels) {
    const E = lv.elevation, top = E + lv.wallHeight
    const items = lv.items
    const voids = items.filter(i => i.type === 'void')

    // slabs (and rooms used as slabs when there are no structural slabs on the level)
    const slabs = items.filter(i => i.type === 'slab')
    const floors = slabs.length ? slabs : items.filter(i => i.type === 'room').map(r => ({ ...r, thickness: r.slab ?? lv.slab }))
    for (const s of floors) {
      const zt = E - (s.drop || 0), t = s.thickness
      if (t <= 0) continue
      // cut out the voids that sit in this slab
      const holes = voids.filter(o => pointInPoly(centroid(o.pts), s.pts)).flatMap(o => ranges(o.pts))
      for (const [s0, s1] of ranges(s.pts)) {
        let pieces = [[s0, s1]]
        for (const [h0, h1] of holes) pieces = pieces.flatMap(([p0, p1]) => (h1 <= p0 || h0 >= p1 ? [[p0, p1]] : [[p0, Math.max(p0, h0)], [Math.min(p1, h1), p1]].filter(([x, y]) => y - x > 1)))
        for (const [p0, p1] of pieces) parts.push({ kind: 'slab', s0: p0, s1: p1, z0: zt - t, z1: zt, label: `S${t}` })
      }
    }

    // beams: cut ones show their cross-section; ones running along the line show their side
    for (const bm of items.filter(i => i.type === 'beam')) {
      const ax = beamAxis(bm)
      const z1 = top, z0 = top - bm.depth
      const da = across(ax.a), db = across(ax.b)
      const parallel = Math.abs(da - db) < 1e-6 || Math.abs(((ax.b.x - ax.a.x) * u.y - (ax.b.y - ax.a.y) * u.x) / (dist(ax.a, ax.b) || 1)) < 0.08
      if (parallel) {
        if (Math.abs((da + db) / 2) > bm.width / 2 + 600) continue          // too far behind or in front
        const s0 = Math.max(0, Math.min(along(ax.a), along(ax.b))), s1 = Math.min(L, Math.max(along(ax.a), along(ax.b)))
        if (s1 - s0 > 1) parts.push({ kind: 'beam', s0, s1, z0, z1, seen: Math.abs((da + db) / 2) > bm.width / 2, label: `B${bm.width}x${bm.depth}` })
        continue
      }
      for (const [s0, s1] of ranges(wallCorners({ a: ax.a, b: ax.b, thickness: bm.width }))) {
        parts.push({ kind: 'beam', s0, s1, z0, z1, cut: true, label: `${bm.width}x${bm.depth}` })
      }
    }

    // columns: cut through floor to underside of the slab above
    for (const c of items.filter(i => i.type === 'column')) {
      for (const [s0, s1] of ranges(c.shape === 'round' ? circlePts(c) : columnCorners(c))) {
        parts.push({ kind: 'column', s0, s1, z0: E, z1: E + c.height, label: c.shape === 'round' ? `Ø${c.w}` : `${c.w}x${c.d}` })
      }
    }

    // footings below the floor, with the column carried down to them
    for (const f of items.filter(i => i.type === 'footing')) {
      const top = E - (f.top ?? 0)
      for (const [s0, s1] of ranges(columnCorners(f))) parts.push({ kind: 'footing', s0, s1, z0: top - f.h, z1: top, label: `${f.w}x${f.d}x${f.h}` })
      const c = f.top > 0 && items.find(o => o.type === 'column' && pointInPoly(o, columnCorners(f)))
      if (c) for (const [s0, s1] of ranges(c.shape === 'round' ? circlePts(c) : columnCorners(c))) parts.push({ kind: 'column', s0, s1, z0: top, z1: E, label: '' })
    }

    // walls
    for (const w of items.filter(i => i.type === 'wall')) {
      for (const [s0, s1] of ranges(wallCorners(w))) {
        parts.push({ kind: w.kind === 'rc' ? 'rcwall' : 'wall', s0, s1, z0: E, z1: E + w.height })
      }
    }
  }

  // gridlines crossing the section line
  const grids = []
  for (const g of plan.grids || []) {
    const xl = gridLabels(g, 'x'), yl = gridLabels(g, 'y')
    const cross = (p, q, label) => {
      const ex = q.x - p.x, ey = q.y - p.y
      const den = (b.x - a.x) * ey - (b.y - a.y) * ex
      if (Math.abs(den) < 1e-9) return
      const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den
      if (t >= -0.001 && t <= 1.001) grids.push({ s: t * L, label })
    }
    for (let i = 0; i <= g.xs.length; i++) cross(gridNode(g, i, 0), gridNode(g, i, g.ys.length), xl[i])
    for (let j = 0; j <= g.ys.length; j++) cross(gridNode(g, 0, j), gridNode(g, g.xs.length, j), yl[j])
  }
  grids.sort((x, y) => x.s - y.s)

  return {
    L, parts, grids,
    levels: levels.map(l => ({ name: l.name, elevation: l.elevation, top: l.elevation + l.wallHeight })),
  }
}
