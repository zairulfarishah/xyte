// Reinforcement details: for each bar design (a type such as B1, or an element's own bars)
// a length / side view (elevation) and a cross-section showing the bars, drawn full size in mm
// with the same sink as the plan (see drawing.js), so they go to both CAD and PDF.
//   beam    elevation between its supports + section 1-1
//   column  elevation floor to floor (with lap above) + section A-A
//   slab    section across the short span + plan of the bar layout
//   footing plan with both layers of bars + section A-A (side view) with the column starters
// sink.disc(layer, c, r), if there, draws a filled bar; otherwise a circle is drawn.
import { dist, beamAxis, levelAbove, pointInPoly, columnCorners, pileLayout, nodeName, bayName, polyArea } from './geometry'
import { rebarOf, designOf, barText, DESIGN_KINDS, COVER } from './rebar'

const CON = 'S-DETAIL', HID = 'S-DETAIL-HID', BAR = 'S-REBAR', BAR2 = 'S-REBAR-TOP', TXT = 'S-DETAIL-TEXT', DIM = 'A-DIMS', TTL = 'TITLE', CUT = 'S-SECTION'
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const tw = (s, h) => String(s).length * h * 0.6           // rough width of a line of text
const ORDER = ['beam', 'column', 'slab', 'footing']

const sizeKey = it => (it.type === 'beam' ? `${it.width} x ${it.depth}`
  : it.type === 'column' ? (it.shape === 'round' ? `DIA ${it.w}` : `${it.w} x ${it.d}`)
  : it.type === 'slab' ? `${it.thickness} THK`
  : `${it.w} x ${it.d} x ${it.h}${it.kind === 'pile' ? ` / ${it.piles || 4} piles` : ''}`)

// Elements with bars, grouped by design type (or own bars) and size: one detail per group.
export function detailGroups(plan) {
  const groups = new Map()
  for (const lv of [...plan.levels].sort((a, b) => a.elevation - b.elevation)) {
    for (const it of lv.items) {
      if (!DESIGN_KINDS[it.type]) continue
      const r = rebarOf(it, plan), txt = barText(it.type, r)
      if (!txt) continue
      const d = designOf(it, plan), size = sizeKey(it)
      const key = `${it.type}|${d ? d.id : `own ${txt}`}|${size}`
      if (!groups.has(key)) groups.set(key, { key, type: it.type, mark: d?.mark || '', size, r, txt, items: [] })
      groups.get(key).items.push({ it, lv })
    }
  }
  return [...groups.values()].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || (a.mark || '~').localeCompare(b.mark || '~', undefined, { numeric: true }) || a.size.localeCompare(b.size))
}

export const groupTitle = g => `${g.mark ? `${g.mark} - ` : ''}${g.type === 'footing' && g.items[0].it.kind === 'pile' ? 'PILE CAP' : g.type === 'footing' ? 'PAD FOOTING' : DESIGN_KINDS[g.type].label.toUpperCase()} ${g.size}`

// Where the elements of a group are, e.g. "Level 1: A/1-A/2, B/1-B/2".
function refs(g, plan) {
  const ref = ({ it }) => (it.type === 'beam' ? `${it.ga ? nodeName(it.ga, plan.grids) : '?'}-${it.gb ? nodeName(it.gb, plan.grids) : '?'}`
    : it.type === 'slab' ? (it.bay ? bayName(it.bay, plan.grids).replace(/–/g, '-') : 'free')
    : it.grid ? nodeName(it.grid, plan.grids) : 'free')
  const by = new Map()
  for (const x of g.items) { if (!by.has(x.lv.name)) by.set(x.lv.name, []); by.get(x.lv.name).push(ref(x)) }
  const s = [...by].map(([n, rs]) => `${n}: ${rs.join(', ')}`).join('; ')
  return s.length > 150 ? `${s.slice(0, 147)}...` : s
}

// drawing helpers in the detail's own frame (origin O, y down, mm)
function kit(sink, O) {
  const P = (x, y) => ({ x: O.x + x, y: O.y + y })
  const ln = (layer, x1, y1, x2, y2) => sink.line(layer, P(x1, y1), P(x2, y2))
  const pl = (layer, pts, closed = false) => sink.pline(layer, pts.map(([x, y]) => P(x, y)), closed)
  const rect = (layer, x0, y0, x1, y1) => pl(layer, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true)
  const bar = (x, y, d) => (sink.disc ? sink.disc(BAR, P(x, y), Math.max(d / 2, 3)) : sink.circle(BAR, P(x, y), Math.max(d / 2, 3)))
  const circle = (layer, x, y, r) => sink.circle(layer, P(x, y), r)
  const text = (layer, x, y, h, s, rot) => sink.label(layer, P(x, y), h, s, rot)
  const textL = (layer, x, y, h, s) => text(layer, x + tw(s, h) / 2, y, h, s)        // starts at x
  // leader from a bar to its note
  const leader = (x0, y0, x1, y1, h, s, left = false) => {
    ln(TXT, x0, y0, x1, y1)
    const x2 = x1 + (left ? -h : h)
    ln(TXT, x1, y1, x2, y1)
    if (left) text(TXT, x2 - h * 0.4 - tw(s, h) / 2, y1, h, s); else textL(TXT, x2 + h * 0.4, y1, h, s)
    circle(TXT, x0, y0, h * 0.12)
  }
  const tick = (x, y, t) => ln(DIM, x - t, y + t, x + t, y - t)
  const dimX = (x0, x1, y, h, s) => {
    ln(DIM, x0, y, x1, y); tick(x0, y, h * 0.4); tick(x1, y, h * 0.4)
    text(DIM, (x0 + x1) / 2, y - h * 0.9, h, s ?? String(Math.round(x1 - x0)))
  }
  const dimY = (x, y0, y1, h, s) => {
    ln(DIM, x, y0, x, y1); tick(x, y0, h * 0.4); tick(x, y1, h * 0.4)
    text(DIM, x - h * 0.9, (y0 + y1) / 2, h, s ?? String(Math.round(y1 - y0)), -90)
  }
  // section cut mark: short thick lines either side with the letter
  const cutV = (x, yTop, yBot, h, name) => {
    ln(CUT, x, yTop - h * 2.4, x, yTop - h * 0.6); ln(CUT, x, yBot + h * 0.6, x, yBot + h * 2.4)
    text(CUT, x, yTop - h * 3.2, h * 1.2, name); text(CUT, x, yBot + h * 3.2, h * 1.2, name)
  }
  const cutH = (y, xL, xR, h, name) => {
    ln(CUT, xL - h * 2.4, y, xL - h * 0.6, y); ln(CUT, xR + h * 0.6, y, xR + h * 2.4, y)
    text(CUT, xL - h * 3.3, y, h * 1.2, name); text(CUT, xR + h * 3.3, y, h * 1.2, name)
  }
  return { ln, pl, rect, bar, circle, text, textL, leader, dimX, dimY, cutV, cutH }
}

const linkText = r => `${r.lt === 'R' ? 'R' : 'T'}${r.ln}@${r.lsp}`
// evenly spaced bar positions between a and b
const spread = (n, a, b) => (n <= 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, k) => a + (b - a) * k / (n - 1)))

function heading(K, g, plan, h) {
  K.textL(TTL, 0, 0, h * 1.6, groupTitle(g))
  K.textL(TXT, 0, h * 2.3, h * 0.85, `${g.items.length} no. - ${refs(g, plan)}`)
  K.textL(TXT, 0, h * 3.6, h * 0.85, g.txt)
}

// Sections are drawn enlarged (E times) so the bars can be read next to a long elevation;
// their dimensions still give the real sizes.
const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
const niceFloor = v => NICE.filter(n => n <= v).pop() || 1
const enlarged = (name, E) => (E > 1 ? `${name} (DRAWN x${E})` : name)

// ── beam ────────────────────────────────────────────────────
function beamDetail(K, plan, g) {
  const { it, lv } = g.items.reduce((m, x) => (dist(x.it.a, x.it.b) > dist(m.it.a, m.it.b) ? x : m))
  const r = g.r, b = it.width, D = it.depth
  const ax = beamAxis(it), L = Math.round(dist(ax.a, ax.b))
  const hs = Math.min(levelAbove(plan, lv)?.slab ?? 0, D)
  const sup = p => { const c = lv.items.find(o => o.type === 'column' && dist(o, p) <= Math.max(300, Math.max(o.w, o.d) / 2 + 50)); return c ? Math.max(c.w, c.d) : 300 }
  const swa = sup(ax.a), swb = sup(ax.b)
  const cover = r.cover ?? COVER.beam, lk = r.ln > 0 ? r.ln : 0
  const ext = Math.max(600, D)
  const h = clamp((L + swa + swb + 2 * ext) * 0.009, 40, 250)
  heading(K, g, plan, h)

  const y0 = h * 9
  const xs0 = -swa / 2, xs1 = L + swb / 2
  // supports (columns) above and below, slab, beam soffit
  for (const [cx, sw] of [[0, swa], [L, swb]]) for (const x of [cx - sw / 2, cx + sw / 2]) K.ln(CON, x, y0 - D * 0.7, x, y0 + D + D * 0.7)
  K.ln(CON, xs0 - ext, y0, xs1 + ext, y0)
  if (hs > 0) {
    K.ln(CON, xs0 - ext, y0 + hs, xs0, y0 + hs); K.ln(CON, xs1, y0 + hs, xs1 + ext, y0 + hs)
    K.ln(HID, swa / 2, y0 + hs, L - swb / 2, y0 + hs)
  }
  K.ln(CON, swa / 2, y0 + D, L - swb / 2, y0 + D)
  // bars: full length, anchored into the supports with a bend
  const tY = y0 + cover + lk + (r.tdia || 0) / 2, bY = y0 + D - cover - lk - (r.dia || 0) / 2
  const bx0 = xs0 + cover, bx1 = xs1 - cover
  if (r.tn > 0 && r.tdia > 0) { const hk = Math.min(12 * r.tdia, D - 2 * cover); K.pl(BAR, [[bx0, tY + hk], [bx0, tY], [bx1, tY], [bx1, tY + hk]]) }
  if (r.n > 0 && r.dia > 0) { const hk = Math.min(12 * r.dia, D - 2 * cover); K.pl(BAR, [[bx0, bY - hk], [bx0, bY], [bx1, bY], [bx1, bY - hk]]) }
  let firstLink = null
  if (lk && r.lsp > 0) {
    const n = Math.min(500, Math.floor((L - swa / 2 - swb / 2 - 100) / r.lsp) + 1)
    for (let k = 0; k < n; k++) { const x = swa / 2 + 50 + k * r.lsp; firstLink ??= x; K.ln(BAR, x, y0 + cover, x, y0 + D - cover) }
  }
  // notes
  if (r.tn > 0 && r.tdia > 0) K.leader(L * 0.28, tY, L * 0.28 + h * 2, y0 - h * 2.6, h, `${r.tn}T${r.tdia} TOP`)
  if (r.n > 0 && r.dia > 0) K.leader(L * 0.72, bY, L * 0.72 + h * 2, y0 + D + h * 2.6, h, `${r.n}T${r.dia} BOTTOM`)
  if (firstLink != null) K.leader(firstLink + r.lsp * 2, y0 + D * 0.55, swa / 2 + h * 2, y0 + D + h * 5, h, `${linkText(r)} LINKS${r.legs > 2 ? ` (${r.legs} LEGS)` : ''}`)
  K.cutV(L / 2, y0, y0 + D, h, '1')
  K.dimX(0, L, y0 + D + h * 8.5, h, `${L} c/c of supports`)
  K.dimY(xs0 - ext - h * 1.2, y0, y0 + D, h, String(D))
  K.text(TTL, L / 2, y0 + D + h * 11.5, h * 1.2, 'ELEVATION (LENGTH VIEW)')

  // section 1-1, enlarged, under the middle of the elevation
  const E = niceFloor(clamp(L * 0.3 / Math.max(b, D), 1, 10))
  beamSection(K, L / 2 - b * E / 2, y0 + D + h * 17, b, D, hs, r, cover, lk, h, E)
}

function beamSection(K, sx, sy, b, D, hs, r, cover, lk, h, E) {
  const X = x => sx + x * E, Y = y => sy + y * E
  const fl = Math.min(400, b * 1.2)
  if (hs > 0) K.pl(CON, [[X(-fl), Y(0)], [X(b + fl), Y(0)], [X(b + fl), Y(hs)], [X(b), Y(hs)], [X(b), Y(D)], [X(0), Y(D)], [X(0), Y(hs)], [X(-fl), Y(hs)]], true)
  else K.rect(CON, X(0), Y(0), X(b), Y(D))
  if (lk) {
    const c = cover + lk / 2
    K.rect(BAR, X(c), Y(c), X(b - c), Y(D - c))
    K.ln(BAR, X(c), Y(c), X(c + 6 * lk), Y(c + 6 * lk))          // 135° hook
  }
  const row = (n, d, y) => {
    const e = cover + lk + d / 2
    const xs = spread(n, e, b - e)
    for (const x of xs) K.bar(X(x), Y(y), d * E)
    return xs
  }
  const right = X(b + fl) + h
  if (r.tn > 0 && r.tdia > 0) {
    const y = cover + lk + r.tdia / 2, xs = row(r.tn, r.tdia, y)
    K.leader(X(xs[xs.length - 1]), Y(y), right, Y(0) - h * 1.6, h, `${r.tn}T${r.tdia}`)
  }
  if (r.n > 0 && r.dia > 0) {
    const y = D - cover - lk - r.dia / 2, xs = row(r.n, r.dia, y)
    K.leader(X(xs[xs.length - 1]), Y(y), right, Y(D) + h * 1.6, h, `${r.n}T${r.dia}`)
  }
  if (lk) K.leader(X(b - cover - lk / 2), Y(D / 2), right, Y(D / 2), h, linkText(r))
  K.dimX(X(0), X(b), Y(D) + h * 4, h, String(b))
  K.dimY(X(-fl) - h * 1.5, Y(0), Y(D), h, String(D))
  if (hs > 0) K.text(TXT, X(-fl / 2), Y(0) - h * 0.9, h * 0.8, `SLAB ${hs}`)
  K.text(TTL, X(b / 2), Y(D) + h * 7, h * 1.2, enlarged('SECTION 1-1', E))
  K.text(TXT, X(b / 2), Y(D) + h * 8.8, h * 0.8, `COVER ${cover}`)
}

// ── column ──────────────────────────────────────────────────
// bar positions around a column section (local, from its top-left corner)
export function columnBars(w, d, n, inset, round) {
  if (round) {
    const R = w / 2 - inset
    return Array.from({ length: n }, (_, k) => { const a = 2 * Math.PI * k / n - Math.PI / 2; return [w / 2 + R * Math.cos(a), w / 2 + R * Math.sin(a)] })
  }
  const x0 = inset, x1 = w - inset, y0 = inset, y1 = d - inset
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  if (n <= 4) return corners.slice(0, n)
  const extra = n - 4, half = Math.floor(extra / 2)
  const nx = Math.round(half * w / (w + d)), ny = half - nx
  const top = nx + (extra % 2)
  const mid = (k, a, b) => spread(k + 2, a, b).slice(1, -1)
  return [
    ...corners,
    ...mid(top, x0, x1).map(x => [x, y0]), ...mid(nx, x0, x1).map(x => [x, y1]),
    ...mid(ny, y0, y1).map(y => [x0, y]), ...mid(ny, y0, y1).map(y => [x1, y]),
  ]
}

function columnDetail(K, plan, g) {
  const { it, lv } = g.items.reduce((m, x) => (x.it.height > m.it.height ? x : m))
  const r = g.r, round = it.shape === 'round', w = it.w, dd = round ? it.w : it.d, H = it.height
  const hs = levelAbove(plan, lv)?.slab ?? 0, hb = lv.slab || 0
  const cover = r.cover ?? COVER.column, lk = r.ln > 0 ? r.ln : 0, dia = r.dia || 0
  const lap = Math.round(40 * dia / 50) * 50
  const h = clamp((H + lap + 1200) * 0.012, 40, 220)
  heading(K, g, plan, h)

  const y0 = h * 9 + lap + 300, yF = y0 + H                 // y0: top of the floor above, yF: this floor
  const ext = Math.max(800, w * 2)
  // floor above and this floor, column faces, column continuing above and below
  for (const [ya, yb] of [[y0, y0 + hs], [yF, yF + hb]]) { K.ln(CON, -ext, ya, w + ext, ya); if (yb > ya) { K.ln(CON, -ext, yb, 0, yb); K.ln(CON, w, yb, w + ext, yb) } }
  for (const x of [0, w]) { K.ln(CON, x, y0 + hs, x, yF); K.ln(HID, x, y0 - lap - 200, x, y0); K.ln(HID, x, yF + hb, x, yF + hb + 600) }
  // main bars seen in elevation (the ones along the front face), lapped above the floor above
  const inset = cover + lk + dia / 2
  const pts = r.n > 0 && dia > 0 ? columnBars(w, dd, r.n, inset, round) : []
  const xs = [...new Set(pts.map(([x]) => Math.round(x)))].sort((a, b) => a - b)
  for (const x of xs) K.ln(BAR, x, yF + hb + 400, x, y0 - lap)
  let link0 = null
  if (lk && r.lsp > 0) {
    const n = Math.min(500, Math.floor((H - hs - 100) / r.lsp) + 1)
    for (let k = 0; k < n; k++) { const y = y0 + hs + 50 + k * r.lsp; link0 ??= y; K.ln(BAR, cover, y, w - cover, y) }
  }
  const noteX = w + ext * 0.6
  if (xs.length) K.leader(xs[xs.length - 1], y0 + H * 0.3, noteX, y0 + H * 0.3 - h * 2, h, `${r.n}T${dia} MAIN BARS`)
  if (link0 != null) K.leader(w / 2, link0 + r.lsp * 3, noteX, y0 + H * 0.5, h, `${linkText(r)} LINKS`)
  if (lap) K.dimY(w + h * 2, y0 - lap, y0, h, `LAP ${lap} (40d)`)
  K.dimY(-ext - h * 1.2, y0, yF, h, `${H} FLOOR TO FLOOR`)
  K.textL(TXT, -ext, y0 - h * 0.9, h * 0.8, `FLOOR ABOVE (${hs})`)
  K.textL(TXT, -ext, yF - h * 0.9, h * 0.8, `${lv.name.toUpperCase()} FFL`)
  const ym = y0 + hs + (H - hs) * 0.75
  K.cutH(ym, 0, w, h, 'A')
  K.dimX(0, w, yF + hb + 600 + h * 2, h, String(w))
  K.text(TTL, w / 2, yF + hb + 600 + h * 5, h * 1.2, 'ELEVATION (SIDE VIEW)')

  // section A-A, enlarged, to the right
  const E = niceFloor(clamp(H * 0.35 / Math.max(w, dd), 1, 10))
  const sx = noteX + h * 2 + tw(`${r.n}T${dia} MAIN BARS`, h) + h * 4, sy = y0 + H * 0.2
  const X = x => sx + x * E, Y = y => sy + y * E
  if (round) {
    K.circle(CON, X(w / 2), Y(w / 2), w / 2 * E)
    if (lk) K.circle(BAR, X(w / 2), Y(w / 2), (w / 2 - cover - lk / 2) * E)
  } else {
    K.rect(CON, X(0), Y(0), X(w), Y(dd))
    if (lk) { const c = cover + lk / 2; K.rect(BAR, X(c), Y(c), X(w - c), Y(dd - c)); K.ln(BAR, X(c), Y(c), X(c + 6 * lk), Y(c + 6 * lk)) }
  }
  for (const [x, y] of pts) K.bar(X(x), Y(y), dia * E)
  if (pts.length) { const [x, y] = pts[1] || pts[0]; K.leader(X(x), Y(y), X(w) + h * 2, Y(0) - h * 1.6, h, `${r.n}T${dia}`) }
  if (lk) K.leader(X(w - cover - lk / 2), Y(dd / 2), X(w) + h * 2, Y(dd / 2), h, linkText(r))
  K.dimX(X(0), X(w), Y(dd) + h * 4, h, String(w))
  if (!round) K.dimY(X(0) - h * 2, Y(0), Y(dd), h, String(dd))
  K.text(TTL, X(w / 2), Y(dd) + h * 7, h * 1.2, enlarged('SECTION A-A', E))
  K.text(TXT, X(w / 2), Y(dd) + h * 8.8, h * 0.8, `COVER ${cover}`)
}

// ── slab ────────────────────────────────────────────────────
function slabSpans(s, plan) {
  if (s.bay) {
    const gr = plan.grids.find(x => x.id === s.bay.g)
    if (gr) { const a = gr.xs[s.bay.i], b = gr.ys[s.bay.j]; return [Math.min(a, b), Math.max(a, b)] }
  }
  const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y)
  const a = Math.max(...xs) - Math.min(...xs), b = Math.max(...ys) - Math.min(...ys)
  return [Math.round(Math.min(a, b)), Math.round(Math.max(a, b))]
}

function slabDetail(K, plan, g) {
  const { it } = g.items.reduce((m, x) => (polyArea(x.it.pts) > polyArea(m.it.pts) ? x : m))
  const r = g.r, t = it.thickness, cover = r.cover ?? COVER.slab
  const [span, long] = slabSpans(it, plan)
  const h = clamp(span * 0.018, 40, 220)
  heading(K, g, plan, h)

  // section from a support to midspan (the other half is the same), enlarged
  const E = niceFloor(clamp(span * 0.065 / t, 1, 5))
  const bw = 300, bd = Math.max(300, t * 2), ext = 400, half = span / 2
  const y0 = h * 9
  const X = x => (x + bw / 2 + ext) * E, Y = y => y0 + y * E
  const zig = x => K.pl(CON, [[X(x), Y(-t * 0.3)], [X(x), Y(t * 0.25)], [X(x) - h * 0.4, Y(t * 0.4)], [X(x) + h * 0.4, Y(t * 0.6)], [X(x), Y(t * 0.75)], [X(x), Y(t * 1.3)]])
  K.ln(CON, X(-bw / 2 - ext), Y(0), X(half), Y(0))
  K.ln(CON, X(-bw / 2 - ext), Y(t), X(-bw / 2), Y(t)); K.ln(CON, X(bw / 2), Y(t), X(half), Y(t))
  K.pl(CON, [[X(-bw / 2), Y(t)], [X(-bw / 2), Y(t + bd)], [X(bw / 2), Y(t + bd)], [X(bw / 2), Y(t)]])
  zig(half)
  K.text(TXT, X(half), Y(t * 1.3) + h, h * 0.8, 'MIDSPAN')
  const notes = []
  if (r.dia > 0 && r.sp > 0) {
    const y = t - cover - r.dia / 2
    K.ln(BAR, X(-bw / 2 + 50), Y(y), X(half), Y(y))
    notes.push([X(half * 0.35), Y(y), `T${r.dia}@${r.sp} B1 (SHORT SPAN)`, 1])
  }
  if (r.dia2 > 0 && r.sp2 > 0) {
    const y = t - cover - (r.dia || 0) - r.dia2 / 2
    const n = Math.min(300, Math.floor((half - 50) / r.sp2) + 1)
    for (let k = 0; k < n; k++) K.bar(X(50 + k * r.sp2), Y(y), r.dia2 * E)
    notes.push([X(50 + Math.floor(n * 0.75) * r.sp2), Y(y), `T${r.dia2}@${r.sp2} B2 (LONG SPAN)`, 1])
  }
  if (r.tdia > 0 && r.tsp > 0) {
    const y = cover + r.tdia / 2
    K.ln(BAR, X(-bw / 2 - ext + 50), Y(y), X(half), Y(y))
    notes.push([X(half * 0.5), Y(y), `T${r.tdia}@${r.tsp} T1 (TOP)`, -1])
  }
  let below = 0
  for (const [x, y, s, dir] of notes) {
    if (dir > 0) { K.leader(x, y, x + h * 2, Y(t + bd) + h * (2 + below * 2.2), h, s); below++ } else K.leader(x, y, x + h * 2, Y(0) - h * 2.4, h, s)
  }
  K.dimX(X(0), X(half), Y(t + bd) + h * (3 + below * 2.2), h, `${Math.round(half)} (HALF SPAN, ${span} c/c)`)
  K.dimY(X(-bw / 2 - ext) - h * 1.2, Y(0), Y(t), h, String(t))
  const sBot = Y(t + bd) + h * (6 + below * 2.2)
  K.text(TTL, X(half / 2), sBot, h * 1.2, enlarged('SECTION ACROSS SHORT SPAN', E))
  K.text(TXT, X(half / 2), sBot + h * 1.8, h * 0.8, `COVER ${cover}`)

  // plan of the bar layout: one typical bar each way and the range it is spread over
  const px = X(half) + h * 10, py = y0
  const PX = x => px + x, PY = y => py + y
  K.rect(CON, PX(0), PY(0), PX(span), PY(long))
  const range = (horizontal, at, a, b) => {
    if (horizontal) { K.ln(TXT, PX(a), PY(at), PX(b), PY(at)); for (const x of [a, b]) K.ln(TXT, PX(x), PY(at) - h * 0.5, PX(x), PY(at) + h * 0.5) } else { K.ln(TXT, PX(at), PY(a), PX(at), PY(b)); for (const y of [a, b]) K.ln(TXT, PX(at) - h * 0.5, PY(y), PX(at) + h * 0.5, PY(y)) }
  }
  if (r.dia > 0 && r.sp > 0) {        // B1 across the short span (x), spread along y
    const y = long * 0.3
    K.ln(BAR, PX(50), PY(y), PX(span - 50), PY(y)); range(false, span * 0.3, 100, long - 100)
    K.textL(TXT, PX(span * 0.3) + h, PY(y) - h * 0.9, h, `T${r.dia}@${r.sp} B1`)
  }
  if (r.dia2 > 0 && r.sp2 > 0) {      // B2 along the long span (y), spread along x
    const x = span * 0.65
    K.ln(BAR, PX(x), PY(50), PX(x), PY(long - 50)); range(true, long * 0.62, 100, span - 100)
    K.textL(TXT, PX(x) + h, PY(long * 0.62) - h * 0.9, h, `T${r.dia2}@${r.sp2} B2`)
  }
  if (r.tdia > 0 && r.tsp > 0) {      // top bars, dashed
    const y = long * 0.85
    K.ln(BAR2, PX(50), PY(y), PX(span - 50), PY(y))
    K.textL(TXT, PX(span * 0.1), PY(y) - h * 0.9, h, `T${r.tdia}@${r.tsp} T1 (TOP, DASHED)`)
  }
  K.dimX(PX(0), PX(span), PY(long) + h * 3, h, String(span))
  K.dimY(PX(0) - h * 2, PY(0), PY(long), h, String(long))
  K.text(TTL, PX(span / 2), PY(long) + h * 6, h * 1.2, 'PLAN - BAR LAYOUT (TYPICAL PANEL)')
}

// ── footing ─────────────────────────────────────────────────
function footingDetail(K, plan, g) {
  const { it: f, lv } = g.items[0]
  const r = g.r, w = f.w, d = f.d, ft = f.h, top = f.top ?? 0, cover = r.cover ?? COVER.footing
  const col = lv.items.find(c => c.type === 'column' && pointInPoly(c, columnCorners(f)))
  const cw = col ? col.w : 400, cd = col ? (col.shape === 'round' ? col.w : col.d) : 400
  const pile = f.kind === 'pile'
  const h = clamp(Math.min(w, d) * 0.05, 40, 150)
  heading(K, g, plan, h)

  // plan
  const y0 = h * 9
  K.rect(CON, 0, y0, w, y0 + d)
  if (col?.shape === 'round') K.circle(CON, w / 2, y0 + d / 2, cw / 2); else K.rect(CON, (w - cw) / 2, y0 + (d - cd) / 2, (w + cw) / 2, y0 + (d + cd) / 2)
  const dia = r.dia || 0, sp = r.sp || 0, dia2 = r.dia2 ?? r.dia ?? 0, sp2 = r.sp2 ?? r.sp ?? 0
  if (dia > 0 && sp > 0) {            // X bars: run along X, spaced down Y
    const n = Math.min(200, Math.floor((d - 2 * cover) / sp) + 1)
    for (let k = 0; k < n; k++) { const y = y0 + cover + k * sp; K.ln(BAR, cover, y, w - cover, y) }
    K.leader(w * 0.2, y0 + cover + Math.floor(n * 0.25) * sp, w + h * 2, y0 + d * 0.25, h, `T${dia}@${sp} BOTTOM (X)`)
  }
  if (dia2 > 0 && sp2 > 0) {          // Y bars: run along Y, spaced along X
    const n = Math.min(200, Math.floor((w - 2 * cover) / sp2) + 1)
    for (let k = 0; k < n; k++) { const x = cover + k * sp2; K.ln(BAR, x, y0 + cover, x, y0 + d - cover) }
    K.leader(cover + Math.floor(n * 0.75) * sp2, y0 + d * 0.85, w + h * 2, y0 + d * 0.75, h, `T${dia2}@${sp2} BOTTOM (Y)`)
  }
  if (pile) for (const q of pileLayout({ ...f, x: w / 2, y: d / 2, rot: 0 })) K.circle(HID, q.x, y0 + q.y, (f.pileDia || 300) / 2)
  K.cutH(y0 + d / 2, 0, w, h, 'A')
  K.dimX(0, w, y0 + d + h * 3, h)
  K.dimY(-h * 4.5, y0, y0 + d, h)
  K.text(TTL, w / 2, y0 + d + h * 6, h * 1.2, 'PLAN')

  // section A-A (side view)
  const sx = w + h * 4 + tw(`T${dia}@${sp} BOTTOM (X)`, h) + Math.max(1500, w * 0.5), sy = y0
  const X = x => sx + x, Y = y => sy + y
  const fT = top, fB = top + ft
  K.ln(HID, X(-600), Y(0), X(w + 600), Y(0))
  K.textL(TXT, X(w + 600 + h * 0.5), Y(0), h * 0.8, 'FFL')
  const c0 = (w - cw) / 2, c1 = (w + cw) / 2
  K.ln(CON, X(c0), Y(-600), X(c0), Y(fT)); K.ln(CON, X(c1), Y(-600), X(c1), Y(fT))
  K.rect(CON, X(0), Y(fT), X(w), Y(fB))
  if (dia > 0 && sp > 0) {
    const yb = fB - cover - dia / 2
    K.pl(BAR, [[X(cover), Y(fT + cover)], [X(cover), Y(yb)], [X(w - cover), Y(yb)], [X(w - cover), Y(fT + cover)]])
    K.leader(X(w * 0.8), Y(yb), X(w + h * 2), Y(fB + h * 2), h, `T${dia}@${sp} (X)`)
  }
  if (dia2 > 0 && sp2 > 0) {
    const y = fB - cover - dia - dia2 / 2
    const n = Math.min(200, Math.floor((w - 2 * cover) / sp2) + 1)
    for (let k = 0; k < n; k++) K.bar(X(cover + k * sp2), Y(y), dia2)
  }
  // column starter bars, bent out on the bottom mat
  const cdia = col && rebarOf(col, plan).dia > 0 ? rebarOf(col, plan).dia : 0
  if (cdia) {
    const yb = fB - cover - dia - dia2 - cdia / 2, ins = 40 + cdia / 2
    K.pl(BAR, [[X(c0 + ins), Y(-600)], [X(c0 + ins), Y(yb)], [X(c0 + ins - 300), Y(yb)]])
    K.pl(BAR, [[X(c1 - ins), Y(-600)], [X(c1 - ins), Y(yb)], [X(c1 - ins + 300), Y(yb)]])
    K.leader(X(c1 - ins), Y(fT * 0.5 - 300), X(w + h * 2), Y(fT * 0.4 - 300), h, `COLUMN STARTERS T${cdia}`)
  }
  if (pile) {
    const D = f.pileDia || 300
    for (const x of [...new Set(pileLayout({ ...f, x: w / 2, y: d / 2, rot: 0 }).map(q => Math.round(q.x)))]) {
      K.pl(HID, [[X(x - D / 2), Y(fB)], [X(x - D / 2), Y(fB + 1200)], [X(x + D / 2), Y(fB + 1200)], [X(x + D / 2), Y(fB)]])
    }
    K.textL(TXT, X(w) + h, Y(fB + 700), h * 0.8, `${f.piles || 4} PILES DIA ${D}`)
  }
  K.dimY(X(-h * 2), Y(fT), Y(fB), h, String(ft))
  if (top > 0) K.dimY(X(-h * 2), Y(0), Y(fT), h, String(top))
  K.dimX(X(0), X(w), Y(fB + (pile ? 1200 + h * 3 : h * 3)), h)
  K.text(TTL, X(w / 2), Y(fB + (pile ? 1200 + h * 6 : h * 6)), h * 1.2, 'SECTION A-A (SIDE VIEW)')
  K.text(TXT, X(w / 2), Y(fB + (pile ? 1200 + h * 7.8 : h * 7.8)), h * 0.8, `COVER ${cover}`)
}

const DRAW = { beam: beamDetail, column: columnDetail, slab: slabDetail, footing: footingDetail }

// One detail with its top-left at O (as drawn; see groupBounds for its extent).
export function drawGroup(sink, plan, g, O = { x: 0, y: 0 }) {
  DRAW[g.type](kit(sink, O), plan, g)
}

// Extent of a detail drawn at the origin.
export function groupBounds(plan, g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const add = p => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y }
  const sink = {
    line: (_, a, b) => { add(a); add(b) },
    pline: (_, pts) => pts.forEach(add),
    circle: (_, c, r) => { add({ x: c.x - r, y: c.y - r }); add({ x: c.x + r, y: c.y + r }) },
    label: (_, p, h, s, rot) => { const w = tw(s, h) / 2; if (rot) { add({ x: p.x - h, y: p.y - w }); add({ x: p.x + h, y: p.y + w }) } else { add({ x: p.x - w, y: p.y - h }); add({ x: p.x + w, y: p.y + h }) } },
  }
  drawGroup(sink, plan, g)
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 1000, y1: 1000 }
}

// Every detail, stacked down the page from `at`. Returns the extent drawn, or null if no bars are entered.
export function drawDetails(sink, plan, at = { x: 0, y: 0 }) {
  const groups = detailGroups(plan)
  if (!groups.length) return null
  const bs = groups.map(g => groupBounds(plan, g))
  const width = Math.max(...bs.map(b => b.x1 - b.x0))
  const H = clamp(width * 0.012, 150, 500)
  sink.label(TTL, { x: at.x + tw('REINFORCEMENT DETAILS', H * 1.4) / 2, y: at.y }, H * 1.4, 'REINFORCEMENT DETAILS')
  const note = 'All dimensions in mm. T = high yield bar, R = mild steel bar. Bars as entered in the survey layout: verify on site before relying on them.'
  sink.label(TXT, { x: at.x + tw(note, H * 0.6) / 2, y: at.y + H * 1.6 }, H * 0.6, note)
  let y = at.y + H * 4
  groups.forEach((g, k) => {
    const b = bs[k]
    drawGroup(sink, plan, g, { x: at.x - b.x0, y: y - b.y0 })
    y += (b.y1 - b.y0) + Math.max(1500, (b.y1 - b.y0) * 0.15)
  })
  return { x0: at.x, y0: at.y - H, x1: at.x + width, y1: y }
}
