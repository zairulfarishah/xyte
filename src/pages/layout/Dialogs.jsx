import { useEffect, useState } from 'react'
import { Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../supabase'
import { undoableDelete } from '../../utils/toast'
import { TABLE, BUCKET, SELECT, who, when } from './store'
import { parseSpacings, colName, rowName } from './geometry'
import { detailGroups } from './details'


export function Modal({ title, onClose, wide, children }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div style={S.scrim} onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ ...S.dlg, maxWidth: wide ? '560px' : '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>{title}</h2>
          <button onClick={onClose} style={S.icon} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// A one-field question, e.g. the real distance when setting a drawing's scale.
export function AskDialog({ ask, onDone }) {
  const [value, setValue] = useState(ask.value || '')
  const [error, setError] = useState('')
  const ok = () => {
    if (ask.numeric && !(ask.optional && !value.trim()) && !(parseFloat(value) > 0)) { setError(ask.optional ? 'Type a number above 0, or leave it empty.' : 'Type a number above 0.'); return }
    onDone(value)
  }
  return (
    <Modal title={ask.title} onClose={() => onDone(null)}>
      <label style={S.label}>
        {ask.label}
        <input autoFocus value={value} inputMode={ask.numeric ? 'decimal' : undefined} placeholder={ask.placeholder}
          onChange={e => { setValue(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && ok()} style={S.input} />
      </label>
      <div style={S.actions}>
        {error && <span style={S.err}>{error}</span>}
        <button style={S.btn} onClick={() => onDone(null)}>Cancel</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={ok}>OK</button>
      </div>
    </Modal>
  )
}

// New column grid: spacings across and down, how the lines are named, and whether to
// put columns, beams and slabs on it.
export function GridDialog({ plan, onCreate, onClose }) {
  const [xsText, setXs] = useState('3x8000')
  const [ysText, setYs] = useState('2x8000')
  const [naming, setNaming] = useState('num')     // 'num' = 1, 2, 3 across and A, B, C down; 'alpha' = the other way round
  const [angle, setAngle] = useState('0')
  const [columns, setColumns] = useState(true)
  const [beams, setBeams] = useState(true)
  const [slabs, setSlabs] = useState(true)
  const [col, setCol] = useState({ w: '400', d: '400' })
  const [beam, setBeam] = useState({ w: String(plan.beamWidth || 300), d: String(plan.beamDepth || 600) })
  const [error, setError] = useState('')
  const xs = parseSpacings(xsText), ys = parseSpacings(ysText)
  const nameX = naming === 'num' ? colName : rowName, nameY = naming === 'num' ? rowName : colName
  const total = a => (a ? a.reduce((s, v) => s + v, 0).toLocaleString('en-MY') : '–')
  const lines = (a, name) => (a ? `${a.length + 1} gridlines (${name(0)}–${name(a.length)}), ${total(a)} mm overall` : 'Not understood')
  const names = (a, name) => Array.from({ length: a.length + 1 }, (_, k) => name(k))

  function ok() {
    if (!xs || !ys) { setError('Check the spacings, e.g. 8000, 8000 or 3x8000.'); return }
    const n = v => parseFloat(v)
    if ((columns && !(n(col.w) > 0 && n(col.d) > 0)) || (beams && !(n(beam.w) > 0 && n(beam.d) > 0))) { setError('Sizes must be above 0.'); return }
    if (!Number.isFinite(parseFloat(angle || '0'))) { setError('Angle must be a number of degrees.'); return }
    onCreate({ xs, ys, xl: names(xs, nameX), yl: names(ys, nameY), rot: parseFloat(angle || '0') || 0, columns, beams, slabs, col: { w: n(col.w), d: n(col.d) }, beam: { w: n(beam.w), d: n(beam.d) } })
  }
  const pair = (v, set, a, b) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <input value={v.w} inputMode="decimal" onChange={e => { set({ ...v, w: e.target.value }); setError('') }} style={{ ...S.input, width: '80px' }} aria-label={a} />
      ×
      <input value={v.d} inputMode="decimal" onChange={e => { set({ ...v, d: e.target.value }); setError('') }} style={{ ...S.input, width: '80px' }} aria-label={b} />
      <span style={S.note}>mm</span>
    </span>
  )
  return (
    <Modal title="New column grid" onClose={onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '10px' }}>
        <label style={S.label}>
          Gridline names
          <select value={naming} onChange={e => setNaming(e.target.value)} style={S.input}>
            <option value="num">1, 2, 3 across · A, B, C down</option>
            <option value="alpha">A, B, C across · 1, 2, 3 down</option>
          </select>
        </label>
        <label style={S.label}>
          Angle (°)
          <input value={angle} inputMode="decimal" onChange={e => { setAngle(e.target.value); setError('') }} style={S.input} title="Turn the grid clockwise, for buildings set at an angle" />
        </label>
      </div>
      <label style={S.label}>
        Spacing across (gridlines {nameX(0)}, {nameX(1)}, {nameX(2)}…), mm
        <input autoFocus value={xsText} onChange={e => { setXs(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && ok()} style={S.input} />
        <span style={{ ...S.note, fontWeight: 400, color: xs ? '#64748b' : '#dc2626' }}>{lines(xs, nameX)}</span>
      </label>
      <label style={S.label}>
        Spacing down (gridlines {nameY(0)}, {nameY(1)}, {nameY(2)}…), mm
        <input value={ysText} onChange={e => { setYs(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && ok()} style={S.input} />
        <span style={{ ...S.note, fontWeight: 400, color: ys ? '#64748b' : '#dc2626' }}>{lines(ys, nameY)}</span>
      </label>
      <p style={S.note}>Separate bays with commas. 3x8000 means three bays of 8000. Later you can change any spacing, rename lines (e.g. to match the client's drawing), and add lines like 2a.</p>
      <div style={{ display: 'grid', gap: '8px' }}>
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span><input type="checkbox" checked={columns} onChange={e => setColumns(e.target.checked)} /> Columns at every intersection</span>
          {columns && pair(col, setCol, 'Column width', 'Column depth')}
        </label>
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span><input type="checkbox" checked={beams} onChange={e => setBeams(e.target.checked)} /> Beams along every gridline (width × depth)</span>
          {beams && pair(beam, setBeam, 'Beam width', 'Beam depth')}
        </label>
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input type="checkbox" checked={slabs} onChange={e => setSlabs(e.target.checked)} /> Slab in every bay (this level's slab thickness)
        </label>
      </div>
      <div style={S.actions}>
        {error && <span style={S.err}>{error}</span>}
        <button style={S.btn} onClick={onClose}>Cancel</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={ok}>Create grid</button>
      </div>
    </Modal>
  )
}

// Pick a Scan Marker project to show on this level.
export function ScanProjectPicker({ onPick, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    supabase.from('scan_projects').select('id, name, pdf_path, pdf_name, updated_at, scan_points(count)').order('updated_at', { ascending: false })
      .then(({ data, error }) => { if (error) setError(error.message); else setRows(data) })
  }, [])
  const shown = (rows || []).filter(r => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Modal title="Link a Scan Marker project" onClose={onClose} wide>
      <p style={S.note}>Its drawing becomes this level's underlay, and its scan points (with their live status) sit on it. Set the scale and line it up with your gridlines once; the points follow.</p>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search scan project" style={{ ...S.input, paddingLeft: '30px' }} />
      </div>
      {error && <p style={{ ...S.note, color: '#dc2626' }}>Couldn't load scan projects: {error}{/scan_projects/.test(error) ? ' Run sql/setup-scan-marker.sql in Supabase first.' : ''}</p>}
      {!rows && !error && <p style={S.note}>Loading…</p>}
      {rows && !shown.length && <p style={S.note}>{rows.length ? 'No project matches.' : 'No scan projects yet. Make one in Scanning Point Marker.'}</p>}
      <div style={{ display: 'grid', gap: '6px', maxHeight: '55vh', overflowY: 'auto' }}>
        {shown.map(r => (
          <button key={r.id} onClick={() => onPick(r)} style={{ ...S.row, ...S.rowMain, border: '1px solid #e2e8f0' }}>
            <b style={{ fontSize: '14px', color: '#0f172a' }}>{r.name}</b>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{r.scan_points?.[0]?.count ?? 0} points · {r.pdf_name} · {when(r.updated_at)}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

// CAD export: the level on screen, or every level side by side in one file.
export function ExportDialog({ plan, levelId, onExport, onClose }) {
  const [which, setWhich] = useState('one')
  const nDetails = detailGroups(plan).length
  const [details, setDetails] = useState(nDetails > 0)
  const level = plan.levels.find(l => l.id === levelId)
  return (
    <Modal title="Export to CAD (DXF)" onClose={onClose}>
      <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
        <input type="radio" name="which" checked={which === 'one'} onChange={() => setWhich('one')} /> This level only ({level?.name})
      </label>
      <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
        <input type="radio" name="which" checked={which === 'all'} onChange={() => setWhich('all')} /> All {plan.levels.length} levels, side by side
      </label>
      <p style={S.note}>
        Opens in AutoCAD, BricsCAD, ZWCAD and other CAD programs. Drawn full size in millimetres, with gridlines, columns,
        beams, slabs, walls, doors, windows, rooms, dimensions and labels each on their own layer (S-GRID, S-COLS, S-BEAM, S-SLAB, A-WALL…).
        The imported drawing underlay is not included.
      </p>
      <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
        <input type="checkbox" checked={details} disabled={!nDetails} onChange={e => setDetails(e.target.checked)} />
        {nDetails ? `Add reinforcement details beside the plan: length view and cross-section of each bar type (${nDetails})` : 'Reinforcement details (enter bars on a beam, column, slab or footing first)'}
      </label>
      <div style={S.actions}>
        <button style={S.btn} onClick={onClose}>Cancel</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={() => onExport(which === 'all' ? plan.levels.map(l => l.id) : [levelId], which === 'all', details && nDetails > 0)}>Download DXF</button>
      </div>
    </Modal>
  )
}

export function NameDialog({ dlg, busy, onChange, onSave, onClose }) {
  return (
    <Modal title="Save to Xyte" onClose={onClose}>
      <label style={S.label}>
        Layout name
        <input autoFocus value={dlg.name} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSave()}
          placeholder="Menara ABC Level 3" style={S.input} />
      </label>
      <p style={S.note}>Everyone in the team can open, change and save this layout from Layouts.</p>
      <div style={S.actions}>
        {dlg.error && <span style={S.err}>{dlg.error}</span>}
        <button style={S.btn} onClick={onClose}>Cancel</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={onSave} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

export function ProjectList({ current, busy, onOpen, onClose, onDeleted }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from(TABLE).select(SELECT).order('updated_at', { ascending: false }).then(({ data, error }) => {
      if (error) setError(error.message); else setRows(data)
    })
  }, [])

  function del(row) {
    if (!confirm(`Delete "${row.name}" for everyone?`)) return
    undoableDelete({
      label: `"${row.name}"`,
      hide: () => setRows(list => list.filter(r => r.id !== row.id)),
      restore: () => setRows(list => [row, ...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at))),
      commit: async () => {
        const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
        if (error) throw error
        // the plan file, its note photos and its revision copies
        const listed = await Promise.all([`photos/${row.id}`, `revisions/${row.id}`].map(dir =>
          supabase.storage.from(BUCKET).list(dir, { limit: 1000 }).then(({ data }) => (data || []).map(f => `${dir}/${f.name}`))))
        await supabase.storage.from(BUCKET).remove([row.file_path, ...listed.flat()])
        onDeleted(row.id)
      },
    })
  }

  const shown = (rows || []).filter(r => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Modal title="Layouts" onClose={onClose} wide>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search layout name" style={{ ...S.input, paddingLeft: '30px' }} />
      </div>
      {error && <p style={{ ...S.note, color: '#dc2626' }}>
        Couldn't load layouts: {error}{/layout_plans/.test(error) ? ' Run sql/setup-layouts.sql in Supabase first.' : ''}
      </p>}
      {!rows && !error && <p style={S.note}>Loading…</p>}
      {rows && !shown.length && <p style={S.note}>{rows.length ? 'No layout matches.' : 'No layouts yet. Use Save to add the one you are drawing.'}</p>}
      <div style={{ display: 'grid', gap: '6px', maxHeight: '60vh', overflowY: 'auto' }}>
        {shown.map(r => (
          <div key={r.id} style={{ ...S.row, ...(r.id === current ? { border: '1px solid #2563eb', background: '#eff6ff' } : null) }}>
            <button onClick={() => onOpen(r)} disabled={busy} style={S.rowMain}>
              <b style={{ fontSize: '14px', color: '#0f172a' }}>{r.name}{r.id === current ? ' · open' : ''}</b>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {r.levels} level{r.levels === 1 ? '' : 's'} · {Number(r.area_m2 || 0).toFixed(1)} m² · saved {when(r.updated_at)} by {who(r.updater)}
              </span>
            </button>
            <button onClick={() => del(r)} style={S.icon} title="Delete layout" aria-label={`Delete ${r.name}`}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

const S = {
  scrim: { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,6,23,.45)', display: 'grid', placeItems: 'center', padding: '16px' },
  dlg: { width: '100%', background: '#fff', borderRadius: '12px', padding: '16px', display: 'grid', gap: '12px', boxShadow: '0 20px 50px rgba(0,0,0,.3)' },
  label: { display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155' },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', background: '#fff' },
  note: { margin: 0, fontSize: '12.5px', color: '#64748b' },
  actions: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' },
  err: { color: '#dc2626', fontSize: '13px', marginRight: 'auto' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '13px', fontWeight: 600, borderRadius: '7px',
    border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' },
  primary: { background: '#2563eb', border: '1px solid #2563eb', color: '#fff' },
  row: { display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', paddingRight: '4px' },
  rowMain: { flex: 1, minWidth: 0, display: 'grid', gap: '2px', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 0, cursor: 'pointer' },
  icon: { display: 'inline-flex', padding: '6px', background: 'transparent', border: 0, color: '#64748b', cursor: 'pointer', borderRadius: '6px' },
}
