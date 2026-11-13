// Excel schedule of the structure, level by level, from the same data as the drawing.
import { dist, polyArea, nodeName, bayName, slabNetArea, schedule, levelAbove } from './geometry'
import { SCAN_STATUS } from './scan'
import { DISCLAIMER } from './loads'
import { DESIGN_KINDS, designsOf, designUse, rebarOf, markOf, barText, barCells } from './rebar'

const sizeOf = c => (c.shape === 'round' ? `Ø${c.w}` : `${c.w} x ${c.d}`)

// Column sizes at each grid point on each level (the "column schedule").
export function columnMatrix(plan) {
  const levels = [...plan.levels].sort((a, b) => b.elevation - a.elevation)
  const rows = new Map()            // grid ref → { ref, order, sizes: { levelId: size } }
  for (const lv of levels) {
    for (const c of lv.items.filter(i => i.type === 'column')) {
      const ref = c.grid ? nodeName(c.grid, plan.grids) : `Free @ ${Math.round(c.x)}, ${Math.round(c.y)}`
      const order = c.grid ? `0 ${c.grid.g} ${String(c.grid.j).padStart(3, '0')} ${String(c.grid.i).padStart(3, '0')}` : `1 ${ref}`
      const r = rows.get(ref) || { ref, order, sizes: {} }
      r.sizes[lv.id] = sizeOf(c) + (c.ex || c.ey ? ' *' : '')
      rows.set(ref, r)
    }
  }
  return { levels, rows: [...rows.values()].sort((a, b) => a.order.localeCompare(b.order)) }
}

export async function downloadExcel(plan, fileName, scanBy = {}, td = null) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Xyte'
  const levels = [...plan.levels].sort((a, b) => b.elevation - a.elevation)
  const head = (ws, cols) => {
    ws.columns = cols.map(([header, key, width]) => ({ header, key, width }))
    const r = ws.getRow(1)
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const yes = v => (v ? 'Yes' : '')

  // Summary
  const sum = wb.addWorksheet('Summary')
  head(sum, [['Level', 'level', 18], ['FFL (mm)', 'ffl', 10], ['Floor to floor (mm)', 'f2f', 16], ['Columns', 'cols', 10], ['Beams', 'beams', 9], ['Beam length (m)', 'blen', 15],
    ['Slab area, net (m²)', 'slab', 18], ['Openings (m²)', 'voids', 13], ['RC walls (m)', 'rc', 12], ['Concrete approx. (m³)', 'vol', 20], ['Measured on site', 'ver', 16]])
  for (const lv of levels) {
    const above = levelAbove(plan, lv)
    const s = schedule(lv, above ? above.slab : 0)
    const st = lv.items.filter(i => ['column', 'beam', 'slab', 'wall'].includes(i.type))
    sum.addRow({
      level: lv.name, ffl: lv.elevation, f2f: lv.wallHeight,
      cols: s.cols.reduce((a, c) => a + c.n, 0), beams: s.beams.reduce((a, c) => a + c.n, 0), blen: +s.beams.reduce((a, c) => a + c.len, 0).toFixed(2),
      slab: +s.slabs.reduce((a, c) => a + c.area, 0).toFixed(2), voids: +s.voids.toFixed(2), rc: +s.walls.reduce((a, c) => a + c.len, 0).toFixed(2),
      vol: +s.vol.toFixed(2), ver: st.length ? `${st.filter(i => i.verified).length} of ${st.length}` : '',
    })
  }

  // Column schedule: size at each grid point, level by level
  const { rows } = columnMatrix(plan)
  const cm = wb.addWorksheet('Column schedule')
  head(cm, [['Grid', 'ref', 16], ...levels.map(l => [l.name, l.id, 14])])
  for (const r of rows) {
    const row = cm.addRow({ ref: r.ref, ...r.sizes })
    // highlight where the size changes from the level above
    levels.forEach((l, k) => {
      const prev = k ? r.sizes[levels[k - 1].id] : undefined, cur = r.sizes[l.id]
      if (k && cur && prev && cur !== prev) row.getCell(l.id).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    })
  }
  cm.addRow({})
  cm.addRow({ ref: 'Sizes in mm (width x depth). * = off its gridline. Yellow = size changes from the level above.' })

  // Columns
  const cs = wb.addWorksheet('Columns')
  head(cs, [['Level', 'level', 16], ['Grid', 'ref', 10], ['Mark', 'mk', 8], ['Shape', 'shape', 12], ['Size (mm)', 'size', 12], ['Height (mm)', 'h', 12], ['Main bars', 'main', 11], ['Links', 'links', 12],
    ['Off grid X', 'ex', 11], ['Off grid Y', 'ey', 11], ['Angle (°)', 'rot', 10], ['Measured on site', 'ver', 16]])
  for (const lv of levels) for (const c of lv.items.filter(i => i.type === 'column')) {
    cs.addRow({ level: lv.name, ref: c.grid ? nodeName(c.grid, plan.grids) : 'Free', mk: markOf(c, plan), shape: c.shape === 'round' ? 'Round' : 'Rectangular', size: sizeOf(c), h: c.height,
      ...barCells('column', rebarOf(c, plan)), ex: c.ex || 0, ey: c.ey || 0, rot: c.rot || 0, ver: yes(c.verified) })
  }

  // Beams
  const bs = wb.addWorksheet('Beams')
  head(bs, [['Level', 'level', 16], ['From', 'from', 10], ['To', 'to', 10], ['Mark', 'mk', 8], ['Width (mm)', 'w', 11], ['Depth overall (mm)', 'd', 17], ['Below slab (mm)', 'bs', 15], ['Length c/c (m)', 'len', 14],
    ['Top bars', 'top', 10], ['Bottom bars', 'bottom', 12], ['Links', 'links', 14], ['Shifted (mm)', 'off', 12], ['Measured on site', 'ver', 16]])
  for (const lv of levels) {
    const above = levelAbove(plan, lv)
    for (const b of lv.items.filter(i => i.type === 'beam')) {
      bs.addRow({ level: lv.name, from: b.ga ? nodeName(b.ga, plan.grids) : 'Free', to: b.gb ? nodeName(b.gb, plan.grids) : 'Free', mk: markOf(b, plan), w: b.width, d: b.depth, ...barCells('beam', rebarOf(b, plan)),
        bs: above ? Math.max(0, b.depth - above.slab) : '', len: +(dist(b.a, b.b) / 1000).toFixed(3), off: b.off || 0, ver: yes(b.verified) })
    }
  }

  // Slabs and openings
  const ss = wb.addWorksheet('Slabs')
  head(ss, [['Level', 'level', 16], ['Bay', 'bay', 16], ['Mark', 'mk', 8], ['Thickness (mm)', 't', 14], ['Drop below FFL (mm)', 'drop', 18], ['Area, net (m²)', 'a', 14], ['Concrete (m³)', 'v', 13],
    ['Bottom, short span', 'bottom1', 17], ['Bottom, long span', 'bottom2', 17], ['Top', 'top', 11], ['Measured on site', 'ver', 16]])
  for (const lv of levels) for (const s of lv.items.filter(i => i.type === 'slab')) {
    const A = slabNetArea(s, lv.items)
    ss.addRow({ level: lv.name, bay: s.bay ? bayName(s.bay, plan.grids) : 'Drawn by hand', mk: markOf(s, plan), t: s.thickness, drop: s.drop || 0, a: +(A / 1e6).toFixed(3), v: +(A * s.thickness / 1e9).toFixed(3),
      ...barCells('slab', rebarOf(s, plan)), ver: yes(s.verified) })
  }

  // Footings and pile caps
  const foots = levels.flatMap(lv => lv.items.filter(i => i.type === 'footing').map(f => ({ lv, f })))
  if (foots.length) {
    const fs = wb.addWorksheet('Footings')
    head(fs, [['Level', 'level', 16], ['Grid', 'ref', 10], ['Mark', 'mk', 8], ['Type', 'kind', 10], ['Width X (mm)', 'w', 12], ['Length Y (mm)', 'd', 13], ['Thickness (mm)', 'h', 14], ['Top below floor (mm)', 'top', 19],
      ['Piles', 'piles', 7], ['Pile size (mm)', 'pd', 13], ['Concrete (m³)', 'v', 13], ['Bottom X', 'x', 11], ['Bottom Y', 'y', 11], ['Measured on site', 'ver', 16]])
    for (const { lv, f } of foots) {
      const pile = f.kind === 'pile'
      fs.addRow({ level: lv.name, ref: f.grid ? nodeName(f.grid, plan.grids) : 'Free', mk: markOf(f, plan), kind: pile ? 'Pile cap' : 'Pad', w: f.w, d: f.d, h: f.h, top: f.top ?? 0,
        piles: pile ? f.piles || 4 : '', pd: pile ? f.pileDia || 300 : '', v: +((f.w / 1000) * (f.d / 1000) * (f.h / 1000)).toFixed(3), ...barCells('footing', rebarOf(f, plan)), ver: yes(f.verified) })
    }
  }

  // Bar schedule: the design types and how many elements use each
  const types = Object.keys(DESIGN_KINDS).flatMap(t => designsOf(plan, t))
  if (types.length) {
    const bt = wb.addWorksheet('Bar schedule')
    head(bt, [['Mark', 'mk', 8], ['Element', 'el', 10], ['Bars', 'bars', 60], ['Cover (mm)', 'cv', 11], ['Number used', 'n', 12]])
    for (const d of types) bt.addRow({ mk: d.mark, el: DESIGN_KINDS[d.type].label, bars: barText(d.type, d.rebar), cv: d.rebar.cover ?? '', n: designUse(plan, d.id) })
    bt.addRow({})
    bt.addRow({ mk: 'T = high yield bar, R = mild steel bar; e.g. 3T20 = three 20 mm bars, T10@200 = 10 mm bars at 200 mm centres.' })
  }
  const os = wb.addWorksheet('Openings')
  head(os, [['Level', 'level', 16], ['Name', 'name', 20], ['Width (mm)', 'w', 12], ['Length (mm)', 'l', 12], ['Area (m²)', 'a', 11]])
  for (const lv of levels) for (const o of lv.items.filter(i => i.type === 'void')) {
    const xs = o.pts.map(q => q.x), ys = o.pts.map(q => q.y)
    os.addRow({ level: lv.name, name: o.name, w: Math.round(Math.max(...xs) - Math.min(...xs)), l: Math.round(Math.max(...ys) - Math.min(...ys)), a: +(polyArea(o.pts) / 1e6).toFixed(3) })
  }

  // RC walls
  const ws = wb.addWorksheet('RC walls')
  head(ws, [['Level', 'level', 16], ['Thickness (mm)', 't', 14], ['Height (mm)', 'h', 12], ['Length (m)', 'len', 11], ['Concrete (m³)', 'v', 13], ['Measured on site', 'ver', 16]])
  for (const lv of levels) for (const w of lv.items.filter(i => i.type === 'wall' && i.kind === 'rc')) {
    const L = dist(w.a, w.b)
    ws.addRow({ level: lv.name, t: w.thickness, h: w.height, len: +(L / 1000).toFixed(3), v: +(L * w.thickness * w.height / 1e9).toFixed(3), ver: yes(w.verified) })
  }

  // Site notes
  const notes = levels.flatMap(lv => lv.items.filter(i => i.type === 'note').map((n, k) => ({ lv, n, k })))
  if (notes.length) {
    const ns = wb.addWorksheet('Site notes')
    head(ns, [['Level', 'level', 16], ['No.', 'no', 6], ['Note', 'text', 60], ['Photos', 'ph', 8], ['X (mm)', 'x', 10], ['Y (mm)', 'y', 10]])
    for (const { lv, n, k } of notes) ns.addRow({ level: lv.name, no: k + 1, text: n.text, ph: n.photos?.length || 0, x: Math.round(n.x), y: Math.round(n.y) })
  }

  // Scan points from linked Scan Marker projects
  const scans = levels.filter(l => scanBy[l.id]?.length)
  if (scans.length) {
    const sp = wb.addWorksheet('Scan points')
    head(sp, [['Level', 'level', 16], ['Point', 'p', 8], ['Status', 'st', 14], ['Top cover', 'tc', 10], ['Top spacing', 'ts', 11], ['Bottom cover', 'bc', 12], ['Bottom spacing', 'bsp', 14],
      ['Slab thk', 'thk', 9], ['Conduit', 'cd', 12], ['PT cable', 'pt', 12], ['Note', 'note', 30]])
    for (const lv of scans) for (const p of [...scanBy[lv.id]].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))) {
      const d = p.d || {}
      const yn = (v, dep) => (v === 'yes' ? `Found${dep ? ` @${dep}` : ''}` : v === 'none' ? 'None' : '')
      sp.addRow({ level: lv.name, p: p.label, st: (SCAN_STATUS[p.status] || SCAN_STATUS.marked).label, tc: d.topCover, ts: d.topSp, bc: d.botCover, bsp: d.botSp, thk: d.thk, cd: yn(d.conduit, d.conduitDepth), pt: yn(d.pt, d.ptDepth), note: p.note })
    }
  }

  // Load takedown (planning figures)
  if (td) {
    const name = id => plan.levels.find(l => l.id === id)?.name
    const lc = wb.addWorksheet('Loads - columns')
    head(lc, [['Level', 'level', 16], ['Grid', 'ref', 10], ['Size', 'size', 12], ['Dead (kN)', 'g', 11], ['Live (kN)', 'q', 11], ['Service (kN)', 's', 13], ['Design N (kN)', 'n', 14], ['Capacity NRd (kN)', 'nrd', 17], ['Used (%)', 'u', 10]])
    for (const c of Object.values(td.cols).sort((a, b) => b.N - a.N)) {
      lc.addRow({ level: name(c.level), ref: c.ref, size: c.size, g: +c.G.toFixed(1), q: +c.Q.toFixed(1), s: +c.NSLS.toFixed(1), n: +c.N.toFixed(1), nrd: c.NRd ? +c.NRd.toFixed(0) : '', u: c.util != null ? Math.round(c.util * 100) : '' })
    }
    const lb = wb.addWorksheet('Loads - beams')
    head(lb, [['Level', 'level', 16], ['Beam', 'ref', 14], ['Size', 'size', 12], ['Span (m)', 'span', 10], ['Design load (kN/m)', 'w', 18], ['M (kN·m)', 'm', 11], ['V (kN)', 'v', 10], ['MRd', 'mrd', 9], ['VRd', 'vrd', 9], ['Used (%)', 'u', 10]])
    for (const b of Object.values(td.beams).sort((a, c) => c.M - a.M)) {
      lb.addRow({ level: name(b.level), ref: b.ref, size: b.size, span: +b.span.toFixed(2), w: +b.wULS.toFixed(2), m: +b.M.toFixed(1), v: +b.V.toFixed(1), mrd: b.MRd ? +b.MRd.toFixed(0) : '', vrd: b.VRd ? +b.VRd.toFixed(0) : '', u: b.util != null ? Math.round(b.util * 100) : '' })
    }
    const fl = Object.values(td.foots || {})
    if (fl.length) {
      const lf = wb.addWorksheet('Loads - footings')
      head(lf, [['Level', 'level', 16], ['Footing', 'ref', 12], ['Column load, service (kN)', 'n', 22], ['Footing + soil (kN)', 'w', 18], ['Total, service (kN)', 's', 18],
        ['Soil pressure (kPa)', 'p', 17], ['Per pile (kN)', 'pp', 13], ['Soil / pile used (%)', 'us', 18], ['Bars used (%)', 'ub', 13]])
      for (const f of fl) {
        lf.addRow({ level: name(f.level), ref: f.ref, n: +f.NcolSLS.toFixed(1), w: +(f.self + f.soil).toFixed(1), s: +f.SLS.toFixed(1), p: f.pressure != null ? +f.pressure.toFixed(0) : '',
          pp: f.perPile != null ? +f.perPile.toFixed(0) : '', us: f.utilSoil != null ? Math.round(f.utilSoil * 100) : '', ub: f.utilBend != null ? Math.round(f.utilBend * 100) : '' })
      }
    }
    const eq = Object.entries(td.loads)
    if (eq.length) {
      const le = wb.addWorksheet('Loads - equipment')
      head(le, [['Level', 'level', 16], ['Item', 'name', 22], ['Weight (t)', 't', 11], ['Pressure (kPa)', 'p', 14], ['Panel span (m)', 'span', 14], ['vs floor design (%)', 'vd', 18], ['vs capacity (%)', 'vc', 15]])
      for (const [id, r] of eq) {
        const lv = plan.levels.find(l => l.items.some(i => i.id === id))
        const it = lv?.items.find(i => i.id === id)
        le.addRow({ level: lv?.name, name: it?.name, t: +r.tonnes.toFixed(2), p: +r.pressure.toFixed(1), span: r.span ? +r.span.toFixed(2) : '', vd: r.vsDesign != null ? Math.round(r.vsDesign * 100) : r.note, vc: r.util != null ? Math.round(r.util * 100) : '' })
      }
    }
    const ln = wb.addWorksheet('Loads - notes')
    ln.getColumn(1).width = 110
    ln.addRow([`Code: ${td.set.c.name}. Load factors ${td.set.c.gG} dead, ${td.set.c.gQ} live. Concrete ${td.set.grade}, steel ${td.set.fy} MPa, concrete density ${td.set.density} kN/m³.`])
    ln.addRow([`Soil: allowable bearing ${td.set.bearing} kPa, soil over footings ${td.set.soil} kN/m³.`])
    ln.addRow([DISCLAIMER])
    for (const l of plan.levels) for (const w of td.levels[l.id].warnings) ln.addRow([`${l.name}: ${w}`])
  }

  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, '-')}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
