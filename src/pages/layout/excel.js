// Excel schedule of the structure, level by level, from the same data as the drawing.
import { dist, polyArea, nodeName, bayName, slabNetArea, schedule, levelAbove } from './geometry'
import { SCAN_STATUS } from './scan'

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

export async function downloadExcel(plan, fileName, scanBy = {}) {
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
  head(cs, [['Level', 'level', 16], ['Grid', 'ref', 10], ['Shape', 'shape', 12], ['Size (mm)', 'size', 12], ['Height (mm)', 'h', 12], ['Off grid X', 'ex', 11], ['Off grid Y', 'ey', 11], ['Angle (°)', 'rot', 10], ['Measured on site', 'ver', 16]])
  for (const lv of levels) for (const c of lv.items.filter(i => i.type === 'column')) {
    cs.addRow({ level: lv.name, ref: c.grid ? nodeName(c.grid, plan.grids) : 'Free', shape: c.shape === 'round' ? 'Round' : 'Rectangular', size: sizeOf(c), h: c.height, ex: c.ex || 0, ey: c.ey || 0, rot: c.rot || 0, ver: yes(c.verified) })
  }

  // Beams
  const bs = wb.addWorksheet('Beams')
  head(bs, [['Level', 'level', 16], ['From', 'from', 10], ['To', 'to', 10], ['Width (mm)', 'w', 11], ['Depth overall (mm)', 'd', 17], ['Below slab (mm)', 'bs', 15], ['Length c/c (m)', 'len', 14], ['Shifted (mm)', 'off', 12], ['Measured on site', 'ver', 16]])
  for (const lv of levels) {
    const above = levelAbove(plan, lv)
    for (const b of lv.items.filter(i => i.type === 'beam')) {
      bs.addRow({ level: lv.name, from: b.ga ? nodeName(b.ga, plan.grids) : 'Free', to: b.gb ? nodeName(b.gb, plan.grids) : 'Free', w: b.width, d: b.depth,
        bs: above ? Math.max(0, b.depth - above.slab) : '', len: +(dist(b.a, b.b) / 1000).toFixed(3), off: b.off || 0, ver: yes(b.verified) })
    }
  }

  // Slabs and openings
  const ss = wb.addWorksheet('Slabs')
  head(ss, [['Level', 'level', 16], ['Bay', 'bay', 16], ['Thickness (mm)', 't', 14], ['Drop below FFL (mm)', 'drop', 18], ['Area, net (m²)', 'a', 14], ['Concrete (m³)', 'v', 13], ['Measured on site', 'ver', 16]])
  for (const lv of levels) for (const s of lv.items.filter(i => i.type === 'slab')) {
    const A = slabNetArea(s, lv.items)
    ss.addRow({ level: lv.name, bay: s.bay ? bayName(s.bay, plan.grids) : 'Drawn by hand', t: s.thickness, drop: s.drop || 0, a: +(A / 1e6).toFixed(3), v: +(A * s.thickness / 1e9).toFixed(3), ver: yes(s.verified) })
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

  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, '-')}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
