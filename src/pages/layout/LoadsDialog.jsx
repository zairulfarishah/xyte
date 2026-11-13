import { useState } from 'react'
import { AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { Modal } from './Dialogs'
import { CODES, USES, GRADES, loadSettings, levelLoad, level3, DISCLAIMER, TONE } from './loads'

// Load settings (code, materials, floor loads per level) and the takedown results.

export const Util = ({ r }) => {
  const t = TONE[level3(r)]
  if (!t) return <span style={{ color: '#94a3b8' }}>–</span>
  return <span style={{ padding: '1px 7px', borderRadius: '999px', background: t.bg, color: t.fg, fontWeight: 700, fontSize: '12px' }}>{Math.round(r * 100)}%</span>
}

const S = {
  label: { display: 'grid', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: '#334155' },
  input: { width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '7px', color: '#0f172a', background: '#fff' },
  note: { margin: 0, fontSize: '12.5px', color: '#64748b', lineHeight: 1.5 },
  th: { position: 'sticky', top: 0, background: '#f1f5f9', color: '#334155', padding: '6px 8px', fontSize: '12px', textAlign: 'left', whiteSpace: 'nowrap' },
  td: { padding: '5px 8px', fontSize: '12.5px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer' },
  tab: on => ({ padding: '6px 2px', marginRight: '18px', border: 0, borderBottom: `2px solid ${on ? '#2563eb' : 'transparent'}`, background: 'none', fontSize: '13px', fontWeight: 600, color: on ? '#0f172a' : '#64748b', cursor: 'pointer' }),
}

export default function LoadsDialog({ plan, td, update, onExcel, busy, onClose }) {
  const [tab, setTab] = useState('settings')
  const set = loadSettings(plan)
  const setL = patch => update(p => ({ ...p, loads: { ...p.loads, ...patch } }))
  const setLv = (id, patch) => update(p => ({ ...p, levels: p.levels.map(l => (l.id === id ? { ...l, loads: { ...l.loads, ...patch } } : l)) }))
  const levels = [...plan.levels].sort((a, b) => b.elevation - a.elevation)
  const num = (v, f) => { const n = parseFloat(v); return Number.isFinite(n) ? f(n) : undefined }

  const warnings = levels.flatMap(l => (td?.levels[l.id]?.warnings || []).map(w => `${l.name}: ${w}`))
  const cols = td ? Object.values(td.cols) : []
  const beams = td ? Object.values(td.beams) : []
  const foots = td ? Object.values(td.foots || {}) : []
  const lvName = id => plan.levels.find(l => l.id === id)?.name
  const ground = td ? levels.reduce((s, l) => s + td.levels[l.id].ground.G + td.levels[l.id].ground.Q, 0) : 0

  return (
    <Modal title="Loads" onClose={onClose} wide>
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
        <button style={S.tab(tab === 'settings')} onClick={() => setTab('settings')}>Settings</button>
        <button style={S.tab(tab === 'columns')} onClick={() => setTab('columns')}>Columns ({cols.length})</button>
        <button style={S.tab(tab === 'beams')} onClick={() => setTab('beams')}>Beams ({beams.length})</button>
        {foots.length > 0 && <button style={S.tab(tab === 'foots')} onClick={() => setTab('foots')}>Footings ({foots.length})</button>}
        <button style={S.tab(tab === 'warn')} onClick={() => setTab('warn')}>Warnings ({warnings.length})</button>
      </div>

      {tab === 'settings' && <>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: '10px' }}>
          <label style={S.label}>Code
            <select value={set.code} onChange={e => setL({ code: e.target.value, density: undefined, fy: undefined })} style={S.input}>
              {Object.values(CODES).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={S.label}>Concrete grade
            <select value={set.grade} onChange={e => setL({ grade: e.target.value })} style={S.input}>
              {GRADES.map(g => <option key={g.id} value={g.id}>{g.id}{set.code === 'BS' ? ` (fcu ${g.fcu})` : ` (fck ${g.fck})`}</option>)}
            </select>
          </label>
          <label style={S.label}>Steel {set.code === 'BS' ? 'fy' : 'fyk'} (MPa)
            <select value={set.fy} onChange={e => setL({ fy: +e.target.value })} style={S.input}>
              {[250, 410, 460, 500].map(v => <option key={v} value={v}>{v}{v === 250 ? ' (mild steel)' : ''}</option>)}
            </select>
          </label>
          <label style={S.label}>Concrete density (kN/m³)<input defaultValue={set.density} onBlur={e => num(e.target.value, n => setL({ density: n }))} style={S.input} /></label>
          <label style={S.label}>Brick / block walls (kN/m³)<input defaultValue={set.masonry} onBlur={e => num(e.target.value, n => setL({ masonry: n }))} style={S.input} /></label>
          <label style={S.label}>Load factors<input value={`${set.c.gG} dead + ${set.c.gQ} live`} readOnly style={{ ...S.input, background: '#f8fafc' }} /></label>
          <label style={S.label}>Allowable soil bearing (kPa)<input defaultValue={set.bearing} onBlur={e => num(e.target.value, n => n > 0 && setL({ bearing: n }))} style={S.input} /></label>
          <label style={S.label}>Soil over footings (kN/m³)<input defaultValue={set.soil} onBlur={e => num(e.target.value, n => setL({ soil: n }))} style={S.input} /></label>
        </div>

        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '.04em' }}>Floor loads per level</div>
        <div style={{ overflow: 'auto', maxHeight: '32vh', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={S.th}>Level</th><th style={S.th}>Use</th><th style={S.th}>Finishes + services (kPa)</th><th style={S.th}>Live load (kPa)</th></tr></thead>
            <tbody>
              {levels.map(l => {
                const LL = levelLoad(l, set)
                return (
                  <tr key={l.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{l.name}</td>
                    <td style={S.td}>
                      <select value={LL.use} onChange={e => setLv(l.id, { use: e.target.value, qk: undefined })} style={{ ...S.input, width: '190px' }}>
                        {USES.map(u => <option key={u.id} value={u.id}>{u.label} ({u[set.code]})</option>)}
                      </select>
                    </td>
                    <td style={S.td}><input key={`s${l.id}${LL.sdl}`} defaultValue={LL.sdl} onBlur={e => num(e.target.value, n => setLv(l.id, { sdl: n }))} style={{ ...S.input, width: '80px' }} /></td>
                    <td style={S.td}>
                      <input key={`q${l.id}${LL.qk}`} defaultValue={LL.qk} onBlur={e => num(e.target.value, n => setLv(l.id, { qk: n === LL.qkDefault ? undefined : n }))} style={{ ...S.input, width: '80px' }} />
                      {LL.qk !== LL.qkDefault && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#b45309' }}>(code {LL.qkDefault})</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={S.note}>Slab self-weight comes from each slab's thickness. Finishes + services is typically 1.0–2.0 kPa. Live loads are typical code values for the use; change them where the client's design brief says otherwise.
          {' '}To check capacity, enter the bars of a slab, beam or column on the right when it's selected; scan results can fill in slab cover and spacing.</p>
        {td && <p style={{ ...S.note, color: '#334155' }}>Total down to the ground: <b>{Math.round(ground).toLocaleString()} kN</b> characteristic ({Math.round(ground / 9.81).toLocaleString()} t).</p>}
      </>}

      {tab === 'columns' && (
        <div style={{ overflow: 'auto', maxHeight: '52vh', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Level', 'Grid', 'Size', 'Dead (kN)', 'Live (kN)', 'Service (kN)', 'Design N (kN)', 'Capacity (kN)', 'Use'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {cols.sort((a, b) => b.N - a.N).map(c => (
                <tr key={c.id}>
                  <td style={S.td}>{lvName(c.level)}</td><td style={{ ...S.td, fontWeight: 600 }}>{c.ref}</td><td style={S.td}>{c.size}</td>
                  <td style={S.td}>{c.G.toFixed(0)}</td><td style={S.td}>{c.Q.toFixed(0)}</td><td style={S.td}>{c.NSLS.toFixed(0)}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{c.N.toFixed(0)}</td><td style={S.td}>{c.NRd ? c.NRd.toFixed(0) : '–'}</td>
                  <td style={S.td}><Util r={c.util} />{c.slender && <span title="Slender column: capacity overestimated" style={{ marginLeft: '4px', color: '#b45309' }}>!</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'beams' && (
        <div style={{ overflow: 'auto', maxHeight: '52vh', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Level', 'Beam', 'Size', 'Span (m)', 'Design load (kN/m)', 'M (kN·m)', 'V (kN)', 'MRd', 'VRd', 'Use'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {beams.sort((a, b) => b.M - a.M).map(b => (
                <tr key={b.id}>
                  <td style={S.td}>{lvName(b.level)}</td><td style={{ ...S.td, fontWeight: 600 }}>{b.ref}</td><td style={S.td}>{b.size}</td><td style={S.td}>{b.span.toFixed(2)}</td>
                  <td style={S.td}>{b.wULS.toFixed(1)}</td><td style={{ ...S.td, fontWeight: 600 }}>{b.M.toFixed(0)}</td><td style={S.td}>{b.V.toFixed(0)}</td>
                  <td style={S.td}>{b.MRd ? b.MRd.toFixed(0) : '–'}</td><td style={S.td}>{b.VRd ? b.VRd.toFixed(0) : '–'}</td><td style={S.td}><Util r={b.util} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'foots' && (
        <div style={{ overflow: 'auto', maxHeight: '52vh', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Level', 'Footing', 'Column load (kN)', 'Footing + soil (kN)', 'Soil pressure (kPa)', 'Per pile (kN)', 'Soil / piles', 'Bars'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {foots.sort((a, b) => b.SLS - a.SLS).map(f => (
                <tr key={f.id}>
                  <td style={S.td}>{lvName(f.level)}</td><td style={{ ...S.td, fontWeight: 600 }}>{f.ref}</td><td style={S.td}>{f.NcolSLS.toFixed(0)}</td>
                  <td style={S.td}>{(f.self + f.soil).toFixed(0)}</td><td style={S.td}>{f.pressure != null ? f.pressure.toFixed(0) : '–'}</td>
                  <td style={S.td}>{f.perPile != null ? f.perPile.toFixed(0) : '–'}</td><td style={S.td}><Util r={f.utilSoil} /></td><td style={S.td}><Util r={f.utilBend} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'warn' && (
        <div style={{ display: 'grid', gap: '6px', maxHeight: '52vh', overflowY: 'auto' }}>
          {!warnings.length && <p style={S.note}>No warnings. Every beam end lands on a column or beam, and every column has one under it.</p>}
          {warnings.map((w, k) => <div key={k} style={{ display: 'flex', gap: '8px', fontSize: '12.5px', color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '7px 10px' }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />{w}</div>)}
        </div>
      )}

      <p style={{ ...S.note, fontSize: '11.5px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>{DISCLAIMER}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button style={S.btn} onClick={onExcel} disabled={busy}><FileSpreadsheet size={14} /> {busy ? 'Making file…' : 'Excel with loads'}</button>
        <button style={{ ...S.btn, background: '#2563eb', borderColor: '#2563eb', color: '#fff' }} onClick={onClose}>Done</button>
      </div>
    </Modal>
  )
}

// Equipment / debris placed on a slab: pick a preset or type the weight and footprint.
export function LoadItemDialog({ presets, onAdd, onClose }) {
  const [p, setP] = useState(presets[0])
  const [t, setT] = useState(String(presets[0].t))
  const [w, setW] = useState(String(presets[0].w))
  const [d, setD] = useState(String(presets[0].d))
  const [h, setH] = useState('500')
  const [name, setName] = useState(presets[0].name)
  const pick = x => { setP(x); setT(String(x.t)); setW(String(x.w)); setD(String(x.d)); setName(x.name); if (x.h) setH(String(x.h)) }
  const debris = p.kind === 'debris'
  const ok = () => {
    const W = parseFloat(w), D = parseFloat(d), T = parseFloat(t), H = parseFloat(h)
    if (!(W > 0 && D > 0) || (debris ? !(H > 0) : !(T > 0))) return
    onAdd({ name: name.trim() || p.name, kind: p.kind, w: W, d: D, ...(debris ? { h: H } : { kn: T * 9.81 }) })
  }
  return (
    <Modal title="Equipment or debris" onClose={onClose} wide>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {presets.map(x => (
          <button key={x.name} onClick={() => pick(x)} style={{ ...S.btn, padding: '4px 10px', fontSize: '12.5px', ...(x === p ? { background: '#eff6ff', borderColor: '#2563eb', color: '#1d4ed8' } : null) }}>{x.name}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: '10px' }}>
        <label style={S.label}>Name<input value={name} onChange={e => setName(e.target.value)} style={S.input} /></label>
        {debris
          ? <label style={S.label}>Pile height (mm)<input value={h} onChange={e => setH(e.target.value)} style={S.input} /></label>
          : <label style={S.label}>Weight (tonnes)<input value={t} onChange={e => setT(e.target.value)} style={S.input} /></label>}
        <label style={S.label}>Length (mm)<input value={d} onChange={e => setD(e.target.value)} style={S.input} /></label>
        <label style={S.label}>Width (mm)<input value={w} onChange={e => setW(e.target.value)} style={S.input} /></label>
      </div>
      <p style={S.note}>{debris ? 'Debris is taken as loose broken concrete, about 1.6 t/m³.' : 'Use the operating weight, including attachments. Footprint is the tracks or outriggers area.'} The figures in the presets are typical; check the actual machine.</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button style={S.btn} onClick={onClose}>Cancel</button>
        <button style={{ ...S.btn, background: '#2563eb', borderColor: '#2563eb', color: '#fff' }} onClick={ok}>Place on plan</button>
      </div>
    </Modal>
  )
}
