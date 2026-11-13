import { useEffect, useState } from 'react'
import { Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../supabase'
import { undoableDelete } from '../../utils/toast'
import { TABLE, BUCKET, SELECT, who, when } from './store'
import { parseSpacings, colName, rowName } from './geometry'


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
    if (ask.numeric && !(parseFloat(value) > 0)) { setError('Type a number above 0.'); return }
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

// New column grid: spacings across and down, and whether to put columns and beams on it.
export function GridDialog({ plan, onCreate, onClose }) {
  const [xsText, setXs] = useState('3x8000')
  const [ysText, setYs] = useState('2x8000')
  const [columns, setColumns] = useState(true)
  const [beams, setBeams] = useState(true)
  const [col, setCol] = useState({ w: '400', d: '400' })
  const [beam, setBeam] = useState({ w: String(plan.beamWidth || 300), d: String(plan.beamDepth || 600) })
  const [error, setError] = useState('')
  const xs = parseSpacings(xsText), ys = parseSpacings(ysText)
  const total = a => (a ? a.reduce((s, v) => s + v, 0).toLocaleString('en-MY') : '–')
  const lines = (a, name) => (a ? `${a.length + 1} gridlines (${name(0)}–${name(a.length)}), ${total(a)} mm overall` : 'Not understood')

  function ok() {
    if (!xs || !ys) { setError('Check the spacings, e.g. 8000, 8000 or 3x8000.'); return }
    const n = v => parseFloat(v)
    if ((columns && !(n(col.w) > 0 && n(col.d) > 0)) || (beams && !(n(beam.w) > 0 && n(beam.d) > 0))) { setError('Sizes must be above 0.'); return }
    onCreate({ xs, ys, columns, beams, col: { w: n(col.w), d: n(col.d) }, beam: { w: n(beam.w), d: n(beam.d) } })
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
      <label style={S.label}>
        Spacing across (gridlines 1, 2, 3…), mm
        <input autoFocus value={xsText} onChange={e => { setXs(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && ok()} style={S.input} />
        <span style={{ ...S.note, fontWeight: 400, color: xs ? '#64748b' : '#dc2626' }}>{lines(xs, colName)}</span>
      </label>
      <label style={S.label}>
        Spacing down (gridlines A, B, C…), mm
        <input value={ysText} onChange={e => { setYs(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && ok()} style={S.input} />
        <span style={{ ...S.note, fontWeight: 400, color: ys ? '#64748b' : '#dc2626' }}>{lines(ys, rowName)}</span>
      </label>
      <p style={S.note}>Separate bays with commas. 3x8000 means three bays of 8000. You can change any bay later.</p>
      <div style={{ display: 'grid', gap: '8px' }}>
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span><input type="checkbox" checked={columns} onChange={e => setColumns(e.target.checked)} /> Columns at every intersection</span>
          {columns && pair(col, setCol, 'Column width', 'Column depth')}
        </label>
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span><input type="checkbox" checked={beams} onChange={e => setBeams(e.target.checked)} /> Beams along every gridline (width × depth)</span>
          {beams && pair(beam, setBeam, 'Beam width', 'Beam depth')}
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
        await supabase.storage.from(BUCKET).remove([row.file_path])
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
