import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crosshair, ExternalLink, Eye, EyeOff, FlipHorizontal2, Link2Off, Move, Plus, ScanLine, Trash2, Upload, X } from 'lucide-react'
import { SCAN_STATUS, openInScanMarker } from './scan'
import NoteBody from './NoteBody'
import {
  activeLevel, updateItems, updateLevel, removeItem, dist, same, wallAxes, clampOpening,
  polyArea, polyPerimeter, fmtMm, fmtArea, planStats, syncGrid, gridMembers, nodeName, bayName,
  gridLabels, setGrid, removeGrid, insertLine, deleteLine, levelAbove, schedule, slabNetArea,
} from './geometry'

// Number box that only applies on Enter or when it loses focus, so one edit is one undo step.
function Num({ label, value, onChange, min = 0, step = 10, suffix = 'mm', disabled }) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100))
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setText(String(Math.round(value * 100) / 100)) }
  const commit = () => {
    const v = parseFloat(text)
    if (Number.isFinite(v) && v >= min && v !== value) onChange(v)
    else setText(String(Math.round(value * 100) / 100))
  }
  return (
    <label style={S.field}>
      <span style={S.lab}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input type="number" value={text} step={step} min={min} disabled={disabled} onChange={e => setText(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur() } }} style={S.input} />
        {suffix && <span style={S.suffix}>{suffix}</span>}
      </span>
    </label>
  )
}

function Text({ label, value, onChange, placeholder }) {
  const [text, setText] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setText(value) }
  const commit = () => { if (text !== value) onChange(text) }
  return (
    <label style={S.field}>
      <span style={S.lab}>{label}</span>
      <input value={text} placeholder={placeholder} onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur() } }} style={S.input} />
    </label>
  )
}

// Bare input with the same apply-on-Enter/blur rule, for the compact gridline rows.
function Cell({ value, onChange, numeric, width, title, min = 100 }) {
  const shown = numeric ? String(Math.round(value * 100) / 100) : value
  const [text, setText] = useState(shown)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setText(shown) }
  const commit = () => {
    if (numeric) {
      const v = parseFloat(text)
      if (Number.isFinite(v) && v >= min && v !== value) onChange(v); else setText(shown)
    } else {
      const v = text.trim()
      if (v && v !== value) onChange(v); else setText(shown)
    }
  }
  return (
    <input value={text} title={title} aria-label={title} inputMode={numeric ? 'decimal' : undefined}
      onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur() } }}
      style={{ ...S.input, width, padding: '4px 6px', textAlign: numeric ? 'right' : 'center', fontWeight: numeric ? 400 : 700 }} />
  )
}

// Whether this size was measured on site (vs. taken from the client's drawing).
const Verified = ({ it, set }) => (
  <label style={{ ...S.field, cursor: 'pointer', padding: '6px 8px', borderRadius: '8px', background: it.verified ? '#f0fdf4' : '#fffbeb', border: `1px solid ${it.verified ? '#bbf7d0' : '#fde68a'}` }}>
    <span style={{ ...S.lab, color: it.verified ? '#166534' : '#92400e', fontWeight: 600 }}>{it.verified ? '✓ Measured on site' : 'Not measured on site yet'}</span>
    <input type="checkbox" checked={!!it.verified} onChange={e => set({ verified: e.target.checked || undefined })} />
  </label>
)

const Info = ({ label, value }) => (
  <div style={{ ...S.field, alignItems: 'baseline' }}><span style={S.lab}>{label}</span><b style={{ fontSize: '13px', color: '#0f172a' }}>{value}</b></div>
)

export default function Inspector({ plan, sel, setSel, update, tool, setTool, onImport, importing, scanPts = [], scanError, onLinkScan, onViewSection, layoutId }) {
  const navigate = useNavigate()
  const level = activeLevel(plan)
  const items = level.items
  const grids = plan.grids || []

  if (sel?.startsWith('scan:')) {
    const sp = scanPts.find(p => `scan:${p.id}` === sel)
    if (sp) return <ScanPointPanel sp={sp} level={level} onClose={() => setSel(null)} navigate={navigate} />
  }
  const sections = plan.sections || []
  const it = items.find(i => i.id === sel) || grids.find(g => g.id === sel) || sections.find(x => x.id === sel)

  const set = patch => update(p => updateItems(p, list => list.map(i => (i.id === sel ? { ...i, ...patch } : i))))
  // for changes that move an item on the grid (column offsets)
  const setSynced = patch => update(p => updateItems(p, list => syncGrid(list.map(i => (i.id === sel ? { ...i, ...patch } : i)), p.grids)))
  const del = () => {
    if (sections.some(x => x.id === sel)) {
      update(p => ({ ...p, sections: p.sections.filter(x => x.id !== sel) }))
    } else if (it.type === 'grid') {
      if (!confirm('Delete this grid? Its columns, beams and slabs stay where they are.')) return
      update(p => removeGrid(p, sel))
    } else update(p => updateItems(p, list => syncGrid(removeItem(list, sel), p.grids)))
    setSel(null)
  }

  if (!it) return <LevelPanel plan={plan} level={level} update={update} tool={tool} setTool={setTool} onImport={onImport} importing={importing}
    scanPts={scanPts} scanError={scanError} onLinkScan={onLinkScan} navigate={navigate} />

  if (sections.some(x => x.id === sel)) {
    const sc = it
    const setSc = patch => update(p => ({ ...p, sections: p.sections.map(x => (x.id === sc.id ? { ...x, ...patch } : x)) }))
    return (
      <div style={S.panel}>
        <div style={S.head}>
          <b>Section {sc.name}–{sc.name}</b>
          <button onClick={del} style={S.iconBtn} title="Delete (Del)" aria-label="Delete"><Trash2 size={15} /></button>
        </div>
        <Text label="Name" value={sc.name} onChange={v => setSc({ name: v })} />
        <Info label="Length" value={`${fmtMm(dist(sc.a, sc.b))} mm`} />
        <button style={{ ...S.btn, ...S.on, justifyContent: 'center' }} onClick={() => onViewSection(sc)}>View section</button>
        <p style={S.hint}>Cuts through every level along this line, looking the way the arrows point. To move it, delete it and draw it again with the Section tool (X).</p>
      </div>
    )
  }

  const title = { note: 'Site note', wall: 'Wall', void: 'Slab opening', room: 'Room', slab: 'Slab', column: 'Column', opening: it.kind === 'door' ? 'Door' : 'Window', dim: 'Dimension', label: 'Label', beam: 'Beam', grid: 'Column grid' }[it.type]
  let body = null

  if (it.type === 'wall') {
    const { len, u } = wallAxes(it)
    const angle = ((Math.atan2(-u.y, u.x) * 180 / Math.PI) + 360) % 360
    // Changing the length keeps the start point and moves the end (and any wall joined to it).
    const setLength = v => update(p => updateItems(p, list => {
      const b = { x: Math.round(it.a.x + u.x * v), y: Math.round(it.a.y + u.y * v) }
      return list.map(i => {
        if (i.id === it.id) return { ...i, b }
        if (i.type === 'wall') return { ...i, a: same(i.a, it.b) ? b : i.a, b: same(i.b, it.b) ? b : i.b }
        if (i.type === 'opening' && i.wallId === it.id) return clampOpening(i, { ...it, b })
        return i
      })
    }))
    body = (
      <>
        <label style={S.field}>
          <span style={S.lab}>Type</span>
          <select value={it.kind || 'brick'} onChange={e => set({ kind: e.target.value === 'rc' ? 'rc' : undefined })} style={S.input}>
            <option value="brick">Brick / block</option>
            <option value="rc">RC (concrete)</option>
          </select>
        </label>
        <Num label="Length" value={len} onChange={setLength} min={10} />
        <Num label="Thickness" value={it.thickness} onChange={v => set({ thickness: v })} min={10} />
        <Num label="Height" value={it.height} onChange={v => set({ height: v })} min={10} step={50} />
        <Info label="Angle" value={`${Math.round(angle * 10) / 10}°`} />
        <Info label="Doors / windows" value={items.filter(i => i.wallId === it.id).length} />
        <p style={S.hint}>Drag the square ends to reshape. Joined walls follow. Use the Door or Window tool and click on this wall to add an opening.</p>
      </>
    )
  } else if (it.type === 'opening') {
    const wall = items.find(i => i.id === it.wallId)
    const setO = patch => update(p => updateItems(p, list => list.map(i => (i.id === sel ? clampOpening({ ...i, ...patch }, wall) : i))))
    body = (
      <>
        <label style={S.field}>
          <span style={S.lab}>Type</span>
          <select value={it.kind} onChange={e => setO({ kind: e.target.value })} style={S.input}>
            <option value="door">Door</option>
            <option value="window">Window</option>
          </select>
        </label>
        <Num label="Width" value={it.width} onChange={v => setO({ width: v })} min={100} step={50} />
        <Num label="Height" value={it.height} onChange={v => setO({ height: v })} min={100} step={50} />
        <Num label="Sill height" value={it.sill} onChange={v => setO({ sill: v })} step={50} />
        <Num label="From wall start" value={it.offset - it.width / 2} onChange={v => setO({ offset: v + it.width / 2 })} step={50} />
        {it.kind === 'door' && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={S.btn} onClick={() => setO({ flip: !it.flip })}><FlipHorizontal2 size={13} /> Hinge side</button>
            <button style={S.btn} onClick={() => setO({ side: -(it.side || 1) })}><FlipHorizontal2 size={13} style={{ transform: 'rotate(90deg)' }} /> Swing</button>
          </div>
        )}
        <p style={S.hint}>Drag it along the wall to move it.</p>
      </>
    )
  } else if (it.type === 'room') {
    body = (
      <>
        <Text label="Name" value={it.name} onChange={v => set({ name: v })} />
        <Info label="Area" value={fmtArea(polyArea(it.pts))} />
        <Info label="Perimeter" value={`${fmtMm(polyPerimeter(it.pts))} mm`} />
        <Num label="Slab thickness" value={it.slab} onChange={v => set({ slab: v })} min={0} />
        <p style={S.hint}>Drag the square corners to reshape.</p>
      </>
    )
  } else if (it.type === 'slab') {
    const A = slabNetArea(it, items)
    body = (
      <>
        <Num label="Thickness" value={it.thickness} onChange={v => set({ thickness: v })} min={10} step={25} />
        <Num label="Drop below FFL" value={it.drop || 0} onChange={v => set({ drop: v || undefined })} min={-5000} step={25} />
        <Info label="Area (less openings)" value={fmtArea(A)} />
        <Info label="Concrete" value={`${(A * it.thickness / 1e9).toFixed(2)} m³`} />
        {it.bay
          ? <><Info label="Grid bay" value={bayName(it.bay, grids)} /><p style={S.hint}>Follows the grid. Dragging a corner unlinks it so you can shape it by hand. Delete it where the slab has a void (lift, stair).</p></>
          : <p style={S.hint}>Drag the square corners to reshape.</p>}
      </>
    )
  } else if (it.type === 'note') {
    body = <NoteBody it={it} set={set} layoutId={layoutId} n={items.filter(i => i.type === 'note').indexOf(it) + 1} />
  } else if (it.type === 'void') {
    body = (
      <>
        <Text label="Name" value={it.name} onChange={v => set({ name: v })} placeholder="Lift, stair, shaft…" />
        <Info label="Size" value={(() => { const xs = it.pts.map(q => q.x), ys = it.pts.map(q => q.y); return `${fmtMm(Math.max(...xs) - Math.min(...xs))} × ${fmtMm(Math.max(...ys) - Math.min(...ys))}` })()} />
        <Info label="Area" value={fmtArea(polyArea(it.pts))} />
        <p style={S.hint}>A hole through the slab it sits in: taken off the slab area and concrete, and left open in 3D and sections. Drag the corners to reshape.</p>
      </>
    )
  } else if (it.type === 'column') {
    body = (
      <>
        <label style={S.field}>
          <span style={S.lab}>Shape</span>
          <select value={it.shape} onChange={e => set({ shape: e.target.value })} style={S.input}>
            <option value="rect">Rectangular</option>
            <option value="round">Round</option>
          </select>
        </label>
        {it.shape === 'round'
          ? <Num label="Diameter" value={it.w} onChange={v => set({ w: v, d: v })} min={10} />
          : <>
              <Num label="Width (X)" value={it.w} onChange={v => set({ w: v })} min={10} />
              <Num label="Depth (Y)" value={it.d} onChange={v => set({ d: v })} min={10} />
            </>}
        <Num label="Height" value={it.height} onChange={v => set({ height: v })} min={10} step={50} />
        {it.grid
          ? <>
              <Info label="On grid" value={nodeName(it.grid, grids)} />
              <Num label="Off grid X" value={it.ex || 0} onChange={v => setSynced({ ex: v })} min={-1e6} step={25} />
              <Num label="Off grid Y" value={it.ey || 0} onChange={v => setSynced({ ey: v })} min={-1e6} step={25} />
              <p style={S.hint}>Moves with the grid. If the column is not centred on the gridlines, drag it or type how far off it is (+X right, +Y down).</p>
              <button style={S.btn} onClick={() => set({ grid: undefined, ex: undefined, ey: undefined })}><Link2Off size={13} /> Unlink from grid</button>
            </>
          : <>
              <Num label="Centre X" value={it.x} onChange={v => set({ x: v })} min={-1e9} />
              <Num label="Centre Y" value={it.y} onChange={v => set({ y: v })} min={-1e9} />
              {it.shape !== 'round' && <Num label="Angle" value={it.rot || 0} onChange={v => set({ rot: v })} min={-360} step={1} suffix="°" />}
            </>}
      </>
    )
  } else if (it.type === 'beam') {
    const end = r => (r ? nodeName(r, grids) : 'free')
    const above = levelAbove(plan, level)
    const slabAbove = above ? above.slab : 0
    body = (
      <>
        <Num label="Width" value={it.width} onChange={v => set({ width: v })} min={10} step={25} />
        <Num label="Depth (overall)" value={it.depth} onChange={v => set({ depth: v })} min={10} step={25} />
        {slabAbove > 0 && <Num label="Below slab" value={Math.max(0, it.depth - slabAbove)} onChange={v => set({ depth: v + slabAbove })} min={0} step={25} />}
        <Num label="Shift sideways" value={it.off || 0} onChange={v => set({ off: v || undefined })} min={-1e5} step={25} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
          <button style={S.btn} title="Line up one face of the beam with its line (edge beam)" onClick={() => set({ off: it.width / 2 })}>Flush ◀</button>
          <button style={S.btn} onClick={() => set({ off: undefined })}>Centre</button>
          <button style={S.btn} title="Line up the other face with its line" onClick={() => set({ off: -it.width / 2 })}>Flush ▶</button>
        </div>
        <Info label="Length (c/c)" value={`${fmtMm(dist(it.a, it.b))} mm`} />
        <Info label="Ends" value={`${end(it.ga)} → ${end(it.gb)}`} />
        <p style={S.hint}>Depth is overall, from the top of the slab above.{slabAbove > 0 ? ` On site you usually measure the drop below the slab soffit; type it in "Below slab" (slab above is ${slabAbove} mm).` : ''} Ends on a gridline intersection move with the grid.</p>
      </>
    )
  } else if (it.type === 'grid') {
    body = <GridBody g={it} items={items} level={level} update={update} plan={plan} />
  } else if (it.type === 'dim') {
    body = <Info label="Length" value={`${fmtMm(dist(it.a, it.b))} mm`} />
  } else if (it.type === 'label') {
    body = (
      <>
        <Text label="Text" value={it.text} onChange={v => set({ text: v })} />
        <Num label="Text height" value={it.size} onChange={v => set({ size: v })} min={10} step={50} />
      </>
    )
  }

  return (
    <div style={S.panel}>
      <div style={S.head}>
        <b>{title}</b>
        <button onClick={del} style={S.iconBtn} title="Delete (Del)" aria-label="Delete"><Trash2 size={15} /></button>
      </div>
      {['column', 'beam', 'slab', 'wall'].includes(it.type) && <Verified it={it} set={set} />}
      {body}
      <p style={S.hint}>{it.type === 'grid' ? 'Del deletes · Esc deselects' : 'Ctrl+D duplicates · Del deletes · Esc deselects'}</p>
    </div>
  )
}

function CadPanel({ cad, setLv, tool, setTool }) {
  const [open, setOpen] = useState(false)
  const setCad = patch => setLv({ cad: { ...cad, ...patch } })
  const hidden = new Set(cad.hidden || [])
  const lines = cad.layers.reduce((s, l) => s + l.segs.length / 4, 0)
  return (
    <div style={{ display: 'grid', gap: '6px', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      <div style={{ fontSize: '12.5px', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cad.name}>
        <b>CAD:</b> {cad.name} · {lines.toLocaleString()} lines
      </div>
      <label style={S.field}>
        <span style={S.lab}>Opacity</span>
        <input type="range" min={0.1} max={1} step={0.05} value={cad.opacity ?? 0.7} onChange={e => setCad({ opacity: +e.target.value })} style={{ width: '120px' }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <button style={S.btn} onClick={() => setCad({ show: !cad.show })}>{cad.show ? <EyeOff size={13} /> : <Eye size={13} />} {cad.show ? 'Hide' : 'Show'}</button>
        <button style={{ ...S.btn, ...(tool === 'movecad' ? S.on : null) }} onClick={() => setTool(tool === 'movecad' ? 'select' : 'movecad')}><Move size={13} /> Move</button>
        <button style={S.btn} onClick={() => setOpen(o => !o)}>Layers ({cad.layers.length - hidden.size}/{cad.layers.length})</button>
        <button style={{ ...S.btn, color: '#dc2626' }} onClick={() => confirm('Remove the CAD drawing from this level?') && setLv({ cad: null })}><Trash2 size={13} /> Remove</button>
      </div>
      {open && (
        <div style={{ display: 'grid', gap: '2px', maxHeight: '220px', overflowY: 'auto', fontSize: '12px' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
            <button style={{ ...S.btn, padding: '3px 8px' }} onClick={() => setCad({ hidden: [] })}>All</button>
            <button style={{ ...S.btn, padding: '3px 8px' }} onClick={() => setCad({ hidden: cad.layers.map(l => l.name) })}>None</button>
          </div>
          {cad.layers.map(l => (
            <label key={l.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#334155' }}>
              <input type="checkbox" checked={!hidden.has(l.name)}
                onChange={e => setCad({ hidden: e.target.checked ? [...hidden].filter(n => n !== l.name) : [...hidden, l.name] })} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
              <span style={{ color: '#94a3b8' }}>{(l.segs.length / 4).toLocaleString()}</span>
            </label>
          ))}
        </div>
      )}
      <p style={S.hint}>Drawn at true size. Clicks snap to its line ends, and gridlines you drag catch on its lines. Hide layers like furniture and hatching to keep it clear.</p>
    </div>
  )
}

// A scan point from the linked Scan Marker project (read only here).
function ScanPointPanel({ sp, level, onClose, navigate }) {
  const st = SCAN_STATUS[sp.status] || SCAN_STATUS.marked
  const d = sp.d || {}
  const yn = (v, depth) => (v === 'yes' ? `Found${depth ? ` @ ${depth} mm` : ''}` : v === 'none' ? 'None' : '–')
  const mm = v => (v ? `${v} mm` : '–')
  return (
    <div style={S.panel}>
      <div style={S.head}>
        <b>Scan point {sp.label}</b>
        <button onClick={onClose} style={{ ...S.iconBtn, color: '#64748b' }} title="Close (Esc)" aria-label="Close"><X size={15} /></button>
      </div>
      <div style={{ display: 'inline-flex', alignSelf: 'start', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', background: st.color, color: '#fff', fontSize: '12.5px', fontWeight: 700, width: 'fit-content' }}>
        {st.label}
      </div>
      <Info label="Top cover @ spacing" value={d.topCover || d.topSp ? `${d.topCover || '?'} @ ${d.topSp || '?'}` : '–'} />
      <Info label="Bottom cover @ spacing" value={d.botCover || d.botSp ? `${d.botCover || '?'} @ ${d.botSp || '?'}` : '–'} />
      <Info label="Slab thickness" value={mm(d.thk)} />
      <Info label="Conduit" value={yn(d.conduit, d.conduitDepth)} />
      <Info label="PT cable" value={yn(d.pt, d.ptDepth)} />
      {sp.note && <p style={{ ...S.hint, color: '#334155' }}>{sp.note}</p>}
      <button style={S.btn} onClick={() => openInScanMarker(level.scan.id, navigate)}><ExternalLink size={13} /> Open in Scan Marker</button>
      <p style={S.hint}>From "{level.scan.name}". Points are added and recorded in Scan Marker; changes show here live.</p>
    </div>
  )
}

function LevelPanel({ plan, level, update, tool, setTool, onImport, importing, scanPts, scanError, onLinkScan, navigate }) {
  const setLv = patch => update(p => updateLevel(p, level.id, l => ({ ...l, ...patch })))
  const setBg = patch => update(p => updateLevel(p, level.id, l => ({ ...l, bg: { ...l.bg, ...patch } })))
  // Floor to floor: columns and walls that were full height stay full height.
  const setHeight = v => update(p => updateLevel(p, level.id, l => ({
    ...l, wallHeight: v,
    items: l.items.map(i => ((i.type === 'column' || i.type === 'wall') && i.height === l.wallHeight ? { ...i, height: v } : i)),
  })))
  // Default slab thickness: grid-bay slabs that used the old default follow.
  const setSlab = v => update(p => updateLevel(p, level.id, l => ({
    ...l, slab: v,
    items: l.items.map(i => (i.type === 'slab' && i.thickness === l.slab ? { ...i, thickness: v } : i)),
  })))
  const stats = planStats(plan)
  const lvArea = level.items.filter(i => i.type === 'room').reduce((s, r) => s + polyArea(r.pts), 0)
  const bg = level.bg
  const above = levelAbove(plan, level)
  const sch = schedule(level, above ? above.slab : 0)
  const row = (k, a, b) => (
    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px', color: '#334155' }}>
      <span>{a}</span><span style={{ color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>{b}</span>
    </div>
  )

  return (
    <div style={S.panel}>
      <div style={S.head}><b>Level</b></div>
      <Text label="Name" value={level.name} onChange={v => setLv({ name: v || level.name })} />
      <Num label="Floor level" value={level.elevation} onChange={v => setLv({ elevation: v })} min={-1e6} step={100} />
      <Num label="Floor to floor" value={level.wallHeight} onChange={setHeight} min={100} step={50} />
      <Num label="Slab thickness" value={level.slab} onChange={setSlab} />
      {lvArea > 0 && <Info label="Room area" value={fmtArea(lvArea)} />}

      <div style={{ ...S.head, marginTop: '10px' }}><b>Structure on this level</b></div>
      {!sch.cols.length && !sch.beams.length && !sch.slabs.length && !sch.walls.length
        ? <p style={S.hint}>Nothing yet. Use Grid (G) to set out the gridlines, columns, beams and slabs in one go.</p>
        : <>
            {sch.cols.map(c => row(`c${c.key}`, `Column ${c.key}`, `${c.n} no.`))}
            {sch.beams.map(b => row(`b${b.key}`, `Beam ${b.key}`, `${b.n} no. · ${b.len.toFixed(1)} m`))}
            {sch.slabs.map(s => row(`s${s.key}`, `Slab ${s.key}`, `${s.area.toFixed(1)} m²`))}
            {sch.walls.map(w => row(`w${w.key}`, `RC wall ${w.key}`, `${w.len.toFixed(1)} m`))}
            {sch.voids > 0 && row('voids', 'Slab openings', `${sch.voids.toFixed(1)} m²`)}
            {row('vol', 'Concrete (approx.)', `${sch.vol.toFixed(1)} m³`)}
          </>}
      {(() => {
        const st = level.items.filter(i => ['column', 'beam', 'slab', 'wall'].includes(i.type))
        if (!st.length) return null
        const done = st.filter(i => i.verified).length
        return (
          <>
            {row('ver', 'Measured on site', `${done} of ${st.length}`)}
            <label style={{ ...S.field, cursor: 'pointer' }}>
              <span style={S.lab}>Outline what is not measured yet</span>
              <input type="checkbox" checked={!!plan.showUnverified} onChange={e => update(p => ({ ...p, showUnverified: e.target.checked }), false)} />
            </label>
          </>
        )
      })()}

      <div style={{ ...S.head, marginTop: '10px' }}><b>Drawing underlay</b></div>
      {!bg && (
        <>
          <label style={{ ...S.btn, justifyContent: 'center', opacity: importing ? 0.6 : 1 }}>
            <Upload size={14} /> {importing ? 'Loading…' : 'Import PDF, image or DXF'}
            <input type="file" accept="application/pdf,image/*,.dxf,.dwg" hidden disabled={importing}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f) }} />
          </label>
          <p style={S.hint}>Trace over the client's drawing. A DXF comes in at true size as lines you can snap to; a PDF or image is scaled after importing.</p>
        </>
      )}
      {!level.scan && (
        <button style={{ ...S.btn, justifyContent: 'center', opacity: importing ? 0.6 : 1 }} disabled={importing} onClick={onLinkScan}>
          <ScanLine size={14} /> Link Scan Marker project
        </button>
      )}
      {level.scan && (() => {
        const n = k => scanPts.filter(p => p.status === k).length
        return (
          <div style={{ display: 'grid', gap: '6px', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ fontSize: '12.5px', color: '#334155' }}><ScanLine size={13} style={{ verticalAlign: '-2px' }} /> <b>{level.scan.name}</b> · page {level.scan.page + 1}</div>
            {scanError
              ? <p style={{ ...S.hint, color: '#dc2626' }}>Couldn't load scan points: {scanError}</p>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: '12px' }}>
                  {Object.entries(SCAN_STATUS).map(([k, s]) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#334155' }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: s.color }} />{s.label} {n(k)}
                    </span>
                  ))}
                </div>}
            <label style={{ ...S.field, cursor: 'pointer' }}>
              <span style={S.lab}>Show scan points ({scanPts.length})</span>
              <input type="checkbox" checked={level.scan.show !== false} onChange={e => setLv({ scan: { ...level.scan, show: e.target.checked } })} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button style={S.btn} onClick={() => openInScanMarker(level.scan.id, navigate)}><ExternalLink size={13} /> Open</button>
              <button style={{ ...S.btn, color: '#dc2626' }} onClick={() => confirm('Unlink the scan project? The drawing stays; the points are hidden.') && setLv({ scan: null })}>
                <Link2Off size={13} /> Unlink
              </button>
            </div>
          </div>
        )
      })()}
      {bg && (
        <>
          <label style={S.field}>
            <span style={S.lab}>Opacity</span>
            <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} onChange={e => setBg({ opacity: +e.target.value })} style={{ width: '120px' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button style={S.btn} onClick={() => setBg({ show: !bg.show })}>{bg.show ? <EyeOff size={13} /> : <Eye size={13} />} {bg.show ? 'Hide' : 'Show'}</button>
            <button style={{ ...S.btn, ...(tool === 'calibrate' ? S.on : null) }} onClick={() => setTool(tool === 'calibrate' ? 'select' : 'calibrate')}>
              <Crosshair size={13} /> Set scale
            </button>
            <button style={{ ...S.btn, ...(tool === 'movebg' ? S.on : null) }} onClick={() => setTool(tool === 'movebg' ? 'select' : 'movebg')}>
              <Move size={13} /> Move
            </button>
            <button style={{ ...S.btn, color: '#dc2626' }} onClick={() => confirm(level.scan ? 'Remove the drawing underlay from this level? The scan project is unlinked too.' : 'Remove the drawing underlay from this level?') && setLv({ bg: null, scan: null })}>
              <Trash2 size={13} /> Remove
            </button>
          </div>
          {tool === 'calibrate' && <p style={{ ...S.hint, color: '#b45309' }}>Click two points on the drawing whose real distance you know, e.g. two gridlines.</p>}
          {tool === 'movebg' && <p style={{ ...S.hint, color: '#b45309' }}>Drag the drawing to line it up. Esc when done.</p>}
        </>
      )}

      {/* the client's CAD drawing (DXF), as snap-able lines */}
      {bg && !level.cad && (
        <label style={{ ...S.btn, justifyContent: 'center', opacity: importing ? 0.6 : 1 }}>
          <Upload size={14} /> {importing ? 'Loading…' : 'Import client DXF'}
          <input type="file" accept=".dxf,.dwg" hidden disabled={importing}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f) }} />
        </label>
      )}
      {level.cad && <CadPanel cad={level.cad} setLv={setLv} tool={tool} setTool={setTool} />}

      <div style={{ ...S.head, marginTop: '10px' }}><b>Plan</b></div>
      <Num label="Grid" value={plan.grid} onChange={v => update(p => ({ ...p, grid: v }))} min={10} step={50} />
      <Num label="New wall thickness" value={plan.wallThickness || 200} onChange={v => update(p => ({ ...p, wallThickness: v }))} min={10} />
      <Num label="New beam width" value={plan.beamWidth || 300} onChange={v => update(p => ({ ...p, beamWidth: v }))} min={10} step={25} />
      <Num label="New beam depth" value={plan.beamDepth || 600} onChange={v => update(p => ({ ...p, beamDepth: v }))} min={10} step={25} />
      <label style={{ ...S.field, cursor: 'pointer' }}>
        <span style={S.lab}>Snap to grid</span>
        <input type="checkbox" checked={plan.snap} onChange={e => update(p => ({ ...p, snap: e.target.checked }))} />
      </label>
      <p style={S.hint}>{stats.levels} level{stats.levels === 1 ? '' : 's'} · {stats.slabArea.toFixed(1)} m² of slab · {stats.walls} wall{stats.walls === 1 ? '' : 's'}</p>
    </div>
  )
}

const S = {
  panel: { display: 'grid', gap: '8px', padding: '12px', alignContent: 'start' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '.03em' },
  field: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  lab: { fontSize: '12.5px', color: '#475569' },
  input: { width: '110px', boxSizing: 'border-box', padding: '5px 7px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', background: '#fff' },
  suffix: { fontSize: '11px', color: '#94a3b8', width: '22px' },
  sub: { fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' },
  hint: { margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.45 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 9px', fontSize: '12.5px', fontWeight: 600, borderRadius: '7px',
    border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer' },
  on: { background: '#eff6ff', border: '1px solid #2563eb', color: '#1d4ed8' },
  iconBtn: { display: 'inline-flex', padding: '5px', background: 'transparent', border: 0, color: '#dc2626', cursor: 'pointer', borderRadius: '6px' },
  lineRow: { display: 'flex', alignItems: 'center', gap: '4px' },
  gap: { fontSize: '11px', color: '#94a3b8', width: '12px', textAlign: 'center' },
  mini: { display: 'inline-flex', padding: '4px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', color: '#475569', cursor: 'pointer' },
}

// Column grid (shared by every level): rename, respace, add and remove gridlines.
// Columns, beams and slabs on the grid follow on every level.
function GridBody({ g, items, level, update, plan }) {
  const setG = fn => update(p => setGrid(p, g.id, fn))
  const cols = items.filter(c => c.type === 'column' && c.grid?.g === g.id)
  const beams = items.filter(b => b.type === 'beam' && (b.ga?.g === g.id || b.gb?.g === g.id))
  const slabs = items.filter(s => s.type === 'slab' && s.bay?.g === g.id)
  const setAll = (list, patch) => {
    const ids = new Set(list.map(i => i.id))
    update(p => updateItems(p, all => all.map(i => (ids.has(i.id) ? { ...i, ...patch } : i))))
  }
  const addMissing = what => update(p => updateItems(p, all => [...all, ...gridMembers(g, all, {
    columns: what === 'columns', beams: what === 'beams', slabs: what === 'slabs',
    col: { w: cols[0]?.w || 400, d: cols[0]?.d || 400 },
    beam: { w: beams[0]?.width || plan.beamWidth || 300, d: beams[0]?.depth || plan.beamDepth || 600 },
    slab: level.slab,
    height: level.wallHeight,
  })]))
  const total = a => a.reduce((s, v) => s + v, 0)

  // One row per gridline: its name, the spacing to the next line, split / delete.
  const lines = axis => {
    const key = axis === 'x' ? 'xs' : 'ys', lk = axis === 'x' ? 'xl' : 'yl'
    const labels = gridLabels(g, axis), s = g[key]
    const rename = (k, v) => setG(x => ({ ...x, [lk]: gridLabels(x, axis).map((l, n) => (n === k ? v : l)) }))
    const respace = (k, v) => setG(x => ({ ...x, [key]: x[key].map((q, n) => (n === k ? v : q)) }))
    return (
      <div style={{ display: 'grid', gap: '3px' }}>
        {labels.map((lab, k) => (
          <div key={k} style={{ display: 'grid', gap: '3px' }}>
            <div style={S.lineRow}>
              <Cell value={lab} onChange={v => rename(k, v)} width="52px" title={`Name of gridline ${lab}`} />
              <span style={{ flex: 1 }} />
              {s.length > 1 && (
                <button style={S.mini} title={`Delete gridline ${lab}`} aria-label={`Delete gridline ${lab}`}
                  onClick={() => confirm(`Delete gridline ${lab}? Columns and beams on it are removed on every level; slabs either side join up.`) && update(p => deleteLine(p, g.id, axis, k))}>
                  <X size={13} />
                </button>
              )}
            </div>
            {k < s.length && (
              <div style={{ ...S.lineRow, paddingLeft: '14px' }}>
                <span style={S.gap}>↕</span>
                <Cell value={s[k]} numeric onChange={v => respace(k, v)} width="76px" title={`Spacing ${lab} to ${labels[k + 1]} (mm)`} />
                <span style={S.suffix}>mm</span>
                <span style={{ flex: 1 }} />
                <button style={S.mini} title={`Add a gridline between ${lab} and ${labels[k + 1]}`} aria-label={`Add gridline between ${lab} and ${labels[k + 1]}`}
                  onClick={() => update(p => insertLine(p, g.id, axis, k))}>
                  <Plus size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
        <button style={{ ...S.btn, justifyContent: 'center' }} onClick={() => setG(x => ({ ...x, [key]: [...x[key], x[key][x[key].length - 1]] }))}>
          <Plus size={13} /> Gridline at the end
        </button>
      </div>
    )
  }

  const xl = gridLabels(g, 'x'), yl = gridLabels(g, 'y')
  return (
    <>
      <p style={S.hint}>Same gridlines on every level. Drag a gridline on the drawing, or type the spacings measured on site. Click a name to rename it to match the client's drawing.</p>
      <div style={S.sub}>Lines across · {xl[0]}…{xl[xl.length - 1]} ({fmtMm(total(g.xs))} mm)</div>
      {lines('x')}
      <div style={S.sub}>Lines down · {yl[0]}…{yl[yl.length - 1]} ({fmtMm(total(g.ys))} mm)</div>
      {lines('y')}
      <Num label={`${yl[0]}/${xl[0]} at X`} value={g.x} onChange={v => setG(x => ({ ...x, x: v }))} min={-1e9} step={100} />
      <Num label={`${yl[0]}/${xl[0]} at Y`} value={g.y} onChange={v => setG(x => ({ ...x, y: v }))} min={-1e9} step={100} />
      <Num label="Angle" value={g.rot || 0} onChange={v => setG(x => ({ ...x, rot: v }))} min={-360} step={1} suffix="°" />
      <p style={S.hint}>Angle turns the whole grid about {yl[0]}/{xl[0]} (clockwise), for buildings or wings set at an angle. Columns on it turn with it.</p>

      <div style={S.sub}>On this level: columns ({cols.length})</div>
      {cols.length > 0 && <>
        <Num label="Width (X)" value={cols[0].w} onChange={v => setAll(cols, { w: v })} min={10} />
        <Num label="Depth (Y)" value={cols[0].d} onChange={v => setAll(cols, { d: v })} min={10} />
      </>}
      <div style={S.sub}>Beams ({beams.length})</div>
      {beams.length > 0 && <>
        <Num label="Width" value={beams[0].width} onChange={v => setAll(beams, { width: v })} min={10} step={25} />
        <Num label="Depth" value={beams[0].depth} onChange={v => setAll(beams, { depth: v })} min={10} step={25} />
      </>}
      <div style={S.sub}>Slabs ({slabs.length})</div>
      {slabs.length > 0 && <Num label="Thickness" value={slabs[0].thickness} onChange={v => setAll(slabs, { thickness: v })} min={10} step={25} />}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button style={S.btn} onClick={() => addMissing('columns')}><Plus size={13} /> Columns at all points</button>
        <button style={S.btn} onClick={() => addMissing('beams')}><Plus size={13} /> Beams on all lines</button>
        <button style={S.btn} onClick={() => addMissing('slabs')}><Plus size={13} /> Slabs in all bays</button>
      </div>
      <p style={S.hint}>Sizes here set all of them on this level at once. Select a single column, beam or slab to change just that one. Deleting the grid keeps its columns, beams and slabs.</p>
    </>
  )
}
