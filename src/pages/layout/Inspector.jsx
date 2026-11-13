import { useState } from 'react'
import { Crosshair, Eye, EyeOff, FlipHorizontal2, Minus, Move, Plus, Trash2, Upload } from 'lucide-react'
import {
  activeLevel, updateItems, updateLevel, removeItem, dist, same, wallAxes, clampOpening,
  polyArea, polyPerimeter, fmtMm, fmtArea, planStats, syncGrid, gridMembers, colName, rowName, nodeName,
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

const Info = ({ label, value }) => (
  <div style={{ ...S.field, alignItems: 'baseline' }}><span style={S.lab}>{label}</span><b style={{ fontSize: '13px', color: '#0f172a' }}>{value}</b></div>
)

export default function Inspector({ plan, sel, setSel, update, tool, setTool, onImport, importing }) {
  const level = activeLevel(plan)
  const items = level.items
  const it = items.find(i => i.id === sel)

  const set = patch => update(p => updateItems(p, list => list.map(i => (i.id === sel ? { ...i, ...patch } : i))))
  const del = () => { update(p => updateItems(p, list => syncGrid(removeItem(list, sel)))); setSel(null) }

  if (!it) return <LevelPanel plan={plan} level={level} update={update} tool={tool} setTool={setTool} onImport={onImport} importing={importing} />

  const title = { wall: 'Wall', room: 'Room / slab', column: 'Column', opening: it.kind === 'door' ? 'Door' : 'Window', dim: 'Dimension', label: 'Label', beam: 'Beam', grid: 'Column grid' }[it.type]
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
          ? <><Info label="On grid" value={nodeName(it.grid)} /><p style={S.hint}>Moves with the grid. Dragging it unlinks it from the grid.</p></>
          : <>
              <Num label="Centre X" value={it.x} onChange={v => set({ x: v })} min={-1e9} />
              <Num label="Centre Y" value={it.y} onChange={v => set({ y: v })} min={-1e9} />
            </>}
      </>
    )
  } else if (it.type === 'beam') {
    const end = r => (r ? nodeName(r) : 'free')
    body = (
      <>
        <Num label="Width" value={it.width} onChange={v => set({ width: v })} min={10} step={25} />
        <Num label="Depth" value={it.depth} onChange={v => set({ depth: v })} min={10} step={25} />
        <Info label="Length (c/c)" value={`${fmtMm(dist(it.a, it.b))} mm`} />
        <Info label="Ends" value={`${end(it.ga)} → ${end(it.gb)}`} />
        <p style={S.hint}>Depth is measured down from the slab above. Ends on a gridline intersection move with the grid.</p>
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
      {body}
      <p style={S.hint}>Ctrl+D duplicates · Del deletes · Esc deselects</p>
    </div>
  )
}

function LevelPanel({ plan, level, update, tool, setTool, onImport, importing }) {
  const setLv = patch => update(p => updateLevel(p, level.id, l => ({ ...l, ...patch })))
  const setBg = patch => update(p => updateLevel(p, level.id, l => ({ ...l, bg: { ...l.bg, ...patch } })))
  const stats = planStats(plan)
  const lvArea = level.items.filter(i => i.type === 'room').reduce((s, r) => s + polyArea(r.pts), 0)
  const bg = level.bg

  return (
    <div style={S.panel}>
      <div style={S.head}><b>Level</b></div>
      <Text label="Name" value={level.name} onChange={v => setLv({ name: v || level.name })} />
      <Num label="Floor level" value={level.elevation} onChange={v => setLv({ elevation: v })} min={-1e6} step={100} />
      <Num label="Wall height" value={level.wallHeight} onChange={v => setLv({ wallHeight: v })} min={100} step={50} />
      <Num label="Slab thickness" value={level.slab} onChange={v => setLv({ slab: v })} />
      <Info label="Room area" value={fmtArea(lvArea)} />

      <div style={{ ...S.head, marginTop: '10px' }}><b>Drawing underlay</b></div>
      {!bg && (
        <>
          <label style={{ ...S.btn, justifyContent: 'center', opacity: importing ? 0.6 : 1 }}>
            <Upload size={14} /> {importing ? 'Loading…' : 'Import PDF or image'}
            <input type="file" accept="application/pdf,image/*" hidden disabled={importing}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f) }} />
          </label>
          <p style={S.hint}>Trace over an architect's drawing. You set its scale after importing.</p>
        </>
      )}
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
            <button style={{ ...S.btn, color: '#dc2626' }} onClick={() => confirm('Remove the drawing underlay from this level?') && setLv({ bg: null })}>
              <Trash2 size={13} /> Remove
            </button>
          </div>
          {tool === 'calibrate' && <p style={{ ...S.hint, color: '#b45309' }}>Click two points on the drawing whose real distance you know, e.g. two gridlines.</p>}
          {tool === 'movebg' && <p style={{ ...S.hint, color: '#b45309' }}>Drag the drawing to line it up. Esc when done.</p>}
        </>
      )}

      <div style={{ ...S.head, marginTop: '10px' }}><b>Plan</b></div>
      <Num label="Grid" value={plan.grid} onChange={v => update(p => ({ ...p, grid: v }))} min={10} step={50} />
      <Num label="New wall thickness" value={plan.wallThickness || 200} onChange={v => update(p => ({ ...p, wallThickness: v }))} min={10} />
      <Num label="New beam width" value={plan.beamWidth || 300} onChange={v => update(p => ({ ...p, beamWidth: v }))} min={10} step={25} />
      <Num label="New beam depth" value={plan.beamDepth || 600} onChange={v => update(p => ({ ...p, beamDepth: v }))} min={10} step={25} />
      <label style={{ ...S.field, cursor: 'pointer' }}>
        <span style={S.lab}>Snap to grid</span>
        <input type="checkbox" checked={plan.snap} onChange={e => update(p => ({ ...p, snap: e.target.checked }))} />
      </label>
      <p style={S.hint}>{stats.levels} level{stats.levels === 1 ? '' : 's'} · {stats.walls} wall{stats.walls === 1 ? '' : 's'} · {stats.area.toFixed(2)} m² of rooms</p>
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
}

// Column grid: every bay spacing is editable; linked columns and beams follow.
function GridBody({ g, items, level, update, plan }) {
  const setG = patch => update(p => updateItems(p, list => syncGrid(list.map(i => (i.id === g.id ? { ...i, ...patch } : i)))))
  const cols = items.filter(c => c.type === 'column' && c.grid?.g === g.id)
  const beams = items.filter(b => b.type === 'beam' && (b.ga?.g === g.id || b.gb?.g === g.id))
  const setAll = (list, patch) => {
    const ids = new Set(list.map(i => i.id))
    update(p => updateItems(p, all => all.map(i => (ids.has(i.id) ? { ...i, ...patch } : i))))
  }
  const addMissing = what => update(p => updateItems(p, all => [...all, ...gridMembers(g, all, {
    columns: what === 'columns', beams: what === 'beams',
    col: { w: cols[0]?.w || 400, d: cols[0]?.d || 400 },
    beam: { w: beams[0]?.width || plan.beamWidth || 300, d: beams[0]?.depth || plan.beamDepth || 600 },
    height: level.wallHeight,
  })]))
  const total = a => a.reduce((s, v) => s + v, 0)
  const bays = (key, name) => (
    <>
      {g[key].map((s, k) => (
        <Num key={`${key}${k}`} label={`${name(k)} – ${name(k + 1)}`} value={s} min={100} step={100}
          onChange={v => setG({ [key]: g[key].map((x, n) => (n === k ? v : x)) })} />
      ))}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button style={S.btn} onClick={() => setG({ [key]: [...g[key], g[key][g[key].length - 1]] })}><Plus size={13} /> Bay</button>
        <button style={{ ...S.btn, opacity: g[key].length < 2 ? 0.5 : 1 }} disabled={g[key].length < 2}
          onClick={() => confirm(`Remove the last bay? Columns and beams on gridline ${name(g[key].length)} are removed too.`) && setG({ [key]: g[key].slice(0, -1) })}>
          <Minus size={13} /> Bay
        </button>
      </div>
    </>
  )
  return (
    <>
      <p style={S.hint}>Change any spacing and the columns and beams on this grid move with it.</p>
      <div style={S.sub}>Across · gridlines 1, 2, 3…</div>
      {bays('xs', colName)}
      <div style={S.sub}>Down · gridlines A, B, C…</div>
      {bays('ys', rowName)}
      <Info label="Overall" value={`${fmtMm(total(g.xs))} × ${fmtMm(total(g.ys))}`} />
      <Num label="Gridline 1 at X" value={g.x} onChange={v => setG({ x: v })} min={-1e9} step={100} />
      <Num label="Gridline A at Y" value={g.y} onChange={v => setG({ y: v })} min={-1e9} step={100} />

      <div style={S.sub}>Columns on this grid ({cols.length})</div>
      {cols.length > 0 && <>
        <Num label="Width (X)" value={cols[0].w} onChange={v => setAll(cols, { w: v })} min={10} />
        <Num label="Depth (Y)" value={cols[0].d} onChange={v => setAll(cols, { d: v })} min={10} />
      </>}
      <div style={S.sub}>Beams on this grid ({beams.length})</div>
      {beams.length > 0 && <>
        <Num label="Width" value={beams[0].width} onChange={v => setAll(beams, { width: v })} min={10} step={25} />
        <Num label="Depth" value={beams[0].depth} onChange={v => setAll(beams, { depth: v })} min={10} step={25} />
      </>}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button style={S.btn} onClick={() => addMissing('columns')}><Plus size={13} /> Columns at all points</button>
        <button style={S.btn} onClick={() => addMissing('beams')}><Plus size={13} /> Beams on all lines</button>
      </div>
      <p style={S.hint}>Sizes here set all of them at once. Select a single column or beam to change just that one. Deleting the grid keeps its columns and beams.</p>
    </>
  )
}
