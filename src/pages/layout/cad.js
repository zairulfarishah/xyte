// Client CAD drawing (DXF) as a vector underlay you can snap to.
// Everything is flattened to straight segments in plan millimetres (y down), per layer:
// level.cad = { name, layers: [{ name, segs: [x1, y1, x2, y2, …] }], texts: [{ x, y, h, r, s }],
//               hidden: [layer names], x, y (offset mm), opacity, show }

const UNITS = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }     // $INSUNITS → mm
export const UNIT_NAMES = { 1: 'millimetres', 10: 'centimetres', 1000: 'metres', 25.4: 'inches', 304.8: 'feet' }
const MAX_SEGS = 250000, MAX_TEXTS = 8000, MAX_DEPTH = 8

// 2D affine transform [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const apply = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })

// points along an arc, enough to look smooth at drawing scale
function arcPts(c, r, a0, a1) {
  let sweep = a1 - a0
  while (sweep <= 0) sweep += Math.PI * 2
  const n = Math.max(4, Math.min(72, Math.ceil(sweep / (Math.PI / 24))))
  return Array.from({ length: n + 1 }, (_, k) => ({ x: c.x + r * Math.cos(a0 + sweep * k / n), y: c.y + r * Math.sin(a0 + sweep * k / n) }))
}

// polyline vertices with bulges (arc segments) → points
function bulgePts(verts, closed) {
  const out = []
  const n = verts.length
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const p = verts[k], q = verts[(k + 1) % n]
    out.push(p)
    if (p.bulge) {
      const th = 4 * Math.atan(p.bulge), d = Math.hypot(q.x - p.x, q.y - p.y)
      if (d < 1e-9) continue
      const r = d / (2 * Math.sin(th / 2))
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
      const h = r * Math.cos(th / 2)           // signed distance from chord middle to centre
      const nx = -(q.y - p.y) / d, ny = (q.x - p.x) / d
      const c = { x: m.x + nx * h, y: m.y + ny * h }
      const a0 = Math.atan2(p.y - c.y, p.x - c.x), a1 = Math.atan2(q.y - c.y, q.x - c.x)
      const pts = th > 0 ? arcPts(c, Math.abs(r), a0, a1) : arcPts(c, Math.abs(r), a1, a0).reverse()
      out.push(...pts.slice(1, -1))
    }
  }
  if (closed) out.push(verts[0]); else out.push(verts[n - 1])
  return out
}

const stripMtext = s => String(s || '')
  .replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/\\[A-Za-z]/g, '').replace(/[{}]/g, '').trim()

export async function parseDxf(text) {
  const { default: DxfParser } = await import('dxf-parser')
  const dxf = new DxfParser().parseSync(text)
  if (!dxf) throw new Error('This file could not be read as DXF.')
  const unit = UNITS[dxf.header?.$INSUNITS] ?? 1
  return { dxf, unit }
}

// Flattens the drawing. k = mm per drawing unit.
export function flattenDxf(dxf, k, name) {
  const layers = new Map(), texts = []
  let segs = 0, cut = false
  const S = [k, 0, 0, -k, 0, 0]               // drawing units → mm, y flipped
  const seg = (layer, a, b) => {
    if (segs >= MAX_SEGS) { cut = true; return }
    let l = layers.get(layer)
    if (!l) { l = []; layers.set(layer, l) }
    l.push(+a.x.toFixed(1), +a.y.toFixed(1), +b.x.toFixed(1), +b.y.toFixed(1))
    segs++
  }
  const path = (layer, m, pts) => { for (let i = 1; i < pts.length; i++) seg(layer, apply(m, pts[i - 1]), apply(m, pts[i])) }

  function walk(entities, m, inherit, depth) {
    for (const e of entities || []) {
      if (e.inPaperSpace || e.visible === false) continue
      const layer = e.layer === '0' && inherit ? inherit : e.layer || '0'
      switch (e.type) {
        case 'LINE': path(layer, m, e.vertices); break
        case 'LWPOLYLINE': case 'POLYLINE':
          if (e.vertices?.length > 1 && !e.isPolyfaceMesh && !e.is3dPolygonMesh) path(layer, m, bulgePts(e.vertices, e.shape))
          break
        case 'CIRCLE': path(layer, m, arcPts(e.center, e.radius, 0, Math.PI * 2)); break
        case 'ARC': path(layer, m, arcPts(e.center, e.radius, e.startAngle, e.endAngle)); break
        case 'ELLIPSE': {
          const c = e.center, ma = e.majorAxisEndPoint, R = Math.hypot(ma.x, ma.y), rot = Math.atan2(ma.y, ma.x)
          const r2 = R * e.axisRatio
          let a0 = e.startAngle ?? 0, a1 = e.endAngle ?? Math.PI * 2
          if (a1 <= a0) a1 += Math.PI * 2
          const n = 48, pts = []
          for (let i = 0; i <= n; i++) {
            const t = a0 + (a1 - a0) * i / n, x = R * Math.cos(t), y = r2 * Math.sin(t)
            pts.push({ x: c.x + x * Math.cos(rot) - y * Math.sin(rot), y: c.y + x * Math.sin(rot) + y * Math.cos(rot) })
          }
          path(layer, m, pts)
          break
        }
        case 'SPLINE': { const pts = e.fitPoints?.length > 1 ? e.fitPoints : e.controlPoints; if (pts?.length > 1) path(layer, m, pts); break }
        case 'SOLID': case '3DFACE': {
          const pts = (e.points || e.vertices || []).filter(Boolean)
          if (pts.length > 2) path(layer, m, [...pts, pts[0]])
          break
        }
        case 'TEXT': case 'MTEXT': case 'ATTDEF': {
          if (texts.length >= MAX_TEXTS || e.type === 'ATTDEF') break
          const p = e.type === 'MTEXT' ? e.position : (e.halign || e.valign) && e.endPoint ? e.endPoint : e.startPoint
          const s = e.type === 'MTEXT' ? stripMtext(e.text) : String(e.text || '').trim()
          if (!p || !s) break
          const q = apply(m, p), h = (e.type === 'MTEXT' ? e.height : e.textHeight) || 2.5
          const sc = Math.hypot(m[0], m[1])
          // rotation on screen (clockwise degrees) of the text after the block transform
          const ang = (e.rotation || 0) * Math.PI / 180
          const dir = { x: m[0] * Math.cos(ang) + m[2] * Math.sin(ang), y: m[1] * Math.cos(ang) + m[3] * Math.sin(ang) }
          texts.push({ x: +q.x.toFixed(1), y: +q.y.toFixed(1), h: +(h * sc).toFixed(1), r: +(Math.atan2(dir.y, dir.x) * 180 / Math.PI).toFixed(1), s: s.slice(0, 80) })
          break
        }
        case 'INSERT': case 'DIMENSION': {
          if (depth >= MAX_DEPTH) break
          const blk = dxf.blocks?.[e.type === 'INSERT' ? e.name : e.block]
          if (!blk?.entities) break
          if (e.type === 'DIMENSION') { walk(blk.entities, m, layer, depth + 1); break }
          const base = blk.position || { x: 0, y: 0 }
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, r = (e.rotation || 0) * Math.PI / 180
          const cols = Math.max(1, e.columnCount || 1), rows = Math.max(1, e.rowCount || 1)
          for (let ci = 0; ci < cols; ci++) for (let ri = 0; ri < rows; ri++) {
            const ox = ci * (e.columnSpacing || 0), oy = ri * (e.rowSpacing || 0)
            // insert point · rotation · array offset · scale · minus block base point
            let t = [1, 0, 0, 1, e.position.x, e.position.y]
            t = mul(t, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0])
            t = mul(t, [1, 0, 0, 1, ox, oy])
            t = mul(t, [sx, 0, 0, sy, 0, 0])
            t = mul(t, [1, 0, 0, 1, -base.x, -base.y])
            walk(blk.entities, mul(m, t), layer, depth + 1)
          }
          break
        }
        default: break
      }
    }
  }
  walk(dxf.entities, S, null, 0)

  const out = [...layers].map(([n, s]) => ({ name: n, segs: s })).sort((a, b) => a.name.localeCompare(b.name))
  // put the drawing's corner at 0,0 so it lands near the plan
  let x0 = Infinity, y0 = Infinity
  for (const l of out) for (let i = 0; i < l.segs.length; i += 2) { if (l.segs[i] < x0) x0 = l.segs[i]; if (l.segs[i + 1] < y0) y0 = l.segs[i + 1] }
  if (!Number.isFinite(x0)) throw new Error('No lines found in the model space of this drawing.')
  for (const l of out) for (let i = 0; i < l.segs.length; i += 2) { l.segs[i] = +(l.segs[i] - x0).toFixed(1); l.segs[i + 1] = +(l.segs[i + 1] - y0).toFixed(1) }
  for (const t of texts) { t.x = +(t.x - x0).toFixed(1); t.y = +(t.y - y0).toFixed(1) }
  return { cad: { name, layers: out, texts, hidden: [], x: 0, y: 0, opacity: 0.7, show: true }, segs, cut }
}

export function cadBounds(cad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const l of cad.layers) for (let i = 0; i < l.segs.length; i += 2) {
    const x = l.segs[i], y = l.segs[i + 1]
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return Number.isFinite(x0) ? { x0: x0 + cad.x, y0: y0 + cad.y, x1: x1 + cad.x, y1: y1 + cad.y } : null
}

// Segment ends of the visible layers, for snapping (one per spot, capped).
export function cadSnapPoints(cad, cap = 60000) {
  if (!cad?.show) return []
  const seen = new Set(), out = []
  const hidden = new Set(cad.hidden || [])
  for (const l of cad.layers) {
    if (hidden.has(l.name)) continue
    for (let i = 0; i < l.segs.length && out.length < cap; i += 2) {
      const x = l.segs[i] + cad.x, y = l.segs[i + 1] + cad.y
      const key = `${Math.round(x)},${Math.round(y)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ x, y })
    }
  }
  return out
}
