import { useState } from 'react'
import { ScanLine, Trash2 } from 'lucide-react'
import { equipmentCheck, loadKN, loadSettings, levelLoad, footingSide, DISCLAIMER } from './loads'
import { Util } from './LoadsDialog'
import { pointInPoly, updateItems } from './geometry'
import { scanToPlan } from './scan'
import { DESIGN_KINDS, COVER, designOf, designsOf, rebarOf, newDesign, setDesign, removeDesign, designUse, barText } from './rebar'

// Load results and bar (reinforcement) design shown in the inspector.
const S = {
  field: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  lab: { fontSize: '12.5px', color: '#475569' },
  input: { width: '78px', boxSizing: 'border-box', padding: '4px 6px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', background: '#fff', textAlign: 'right' },
  mini: { width: '44px', boxSizing: 'border-box', padding: '3px 5px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', background: '#fff', textAlign: 'right' },
  sub: { fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' },
  hint: { margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.45 },
  row: { display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px', color: '#334155' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 9px', fontSize: '12px', fontWeight: 600, borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer' },
  sel: { boxSizing: 'border-box', padding: '4px 6px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', background: '#fff' },
  card: { display: 'grid', gap: '6px', padding: '8px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' },
  x: { fontSize: '12px', color: '#94a3b8' },
}

// small number box that applies on Enter / blur; empty clears
function N({ label, value, onChange, suffix = 'mm', placeholder }) {
  const [text, setText] = useState(value ?? '')
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setText(value ?? '') }
  const commit = () => {
    const v = text === '' ? undefined : parseFloat(text)
    if (v === undefined || (Number.isFinite(v) && v > 0)) { if (v !== value) onChange(v) } else setText(value ?? '')
  }
  return (
    <label style={S.field}>
      <span style={S.lab}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input value={text} placeholder={placeholder} inputMode="decimal" onChange={e => setText(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur() } }} style={S.input} />
        <span style={{ fontSize: '11px', color: '#94a3b8', width: '22px' }}>{suffix}</span>
      </span>
    </label>
  )
}

// compact box for one figure in a bar line ("3 × T20")
function Mini({ value, onChange, placeholder, title, whole }) {
  const [text, setText] = useState(value ?? '')
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setText(value ?? '') }
  const commit = () => {
    let v = text === '' ? undefined : parseFloat(text)
    if (v !== undefined && whole) v = Math.round(v)
    if (v === undefined || (Number.isFinite(v) && v > 0)) { if (v !== value) onChange(v) } else setText(value ?? '')
  }
  return (
    <input value={text} placeholder={placeholder} title={title} aria-label={title} inputMode="decimal" onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur() } }} style={S.mini} />
  )
}

const Line = ({ label, children }) => (
  <div style={S.field}><span style={S.lab}>{label}</span><span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>{children}</span></div>
)
const Row = ({ a, b }) => <div style={S.row}><span>{a}</span><b style={{ color: '#0f172a', fontWeight: 600 }}>{b}</b></div>

// "[n] × T[dia]"
const Bars = ({ label, r, set, n, d, pn, pd }) => (
  <Line label={label}>
    <Mini value={r[n]} onChange={v => set({ [n]: v })} placeholder={pn} title={`${label}: number of bars`} whole />
    <span style={S.x}>× T</span>
    <Mini value={r[d]} onChange={v => set({ [d]: v })} placeholder={pd} title={`${label}: bar size (mm)`} />
  </Line>
)
// "T[dia] @ [spacing]"
const Mesh = ({ label, r, set, d, s, pd, ps }) => (
  <Line label={label}>
    <span style={S.x}>T</span>
    <Mini value={r[d]} onChange={v => set({ [d]: v })} placeholder={pd} title={`${label}: bar size (mm)`} />
    <span style={S.x}>@</span>
    <Mini value={r[s]} onChange={v => set({ [s]: v })} placeholder={ps} title={`${label}: spacing (mm)`} />
  </Line>
)
const Links = ({ r, set, legs }) => (
  <>
    <Line label="Links">
      <select value={r.lt === 'R' ? 'R' : 'T'} onChange={e => set({ lt: e.target.value === 'R' ? 'R' : undefined })} style={{ ...S.sel, padding: '3px 2px' }} title="Link bar type: R mild steel, T high yield">
        <option value="T">T</option><option value="R">R</option>
      </select>
      <Mini value={r.ln} onChange={v => set({ ln: v })} placeholder="10" title="Link bar size (mm)" />
      <span style={S.x}>@</span>
      <Mini value={r.lsp} onChange={v => set({ lsp: v })} placeholder="200" title="Link spacing (mm)" />
    </Line>
    {legs && <Line label="Link legs"><Mini value={r.legs} onChange={v => set({ legs: v })} placeholder="2" title="Link legs" whole /></Line>}
  </>
)

function BarFields({ type, r, set }) {
  const cover = <Line label="Cover"><Mini value={r.cover} onChange={v => set({ cover: v })} placeholder={String(COVER[type])} title="Cover (mm)" /><span style={S.x}>mm</span></Line>
  if (type === 'beam') return <>
    <Bars label="Top bars" r={r} set={set} n="tn" d="tdia" pn="2" pd="16" />
    <Bars label="Bottom bars" r={r} set={set} n="n" d="dia" pn="3" pd="20" />
    <Links r={r} set={set} legs />
    {cover}
  </>
  if (type === 'column') return <>
    <Bars label="Main bars" r={r} set={set} n="n" d="dia" pn="4" pd="20" />
    <Links r={r} set={set} />
    {cover}
  </>
  if (type === 'slab') return <>
    <Mesh label="Bottom, short span" r={r} set={set} d="dia" s="sp" pd="10" ps="200" />
    <Mesh label="Bottom, long span" r={r} set={set} d="dia2" s="sp2" pd="10" ps="250" />
    <Mesh label="Top" r={r} set={set} d="tdia" s="tsp" pd="10" ps="200" />
    {cover}
  </>
  return <>
    <Mesh label="Bottom, along X" r={r} set={set} d="dia" s="sp" pd="12" ps="150" />
    <Mesh label="Bottom, along Y" r={r} set={set} d="dia2" s="sp2" pd="12" ps="150" />
    {cover}
  </>
}

// Bars of one element: its own, or a design type (B1, C1…) shared with others.
export function DesignBlock({ it, set, plan, update, children }) {
  const type = it.type
  const kind = DESIGN_KINDS[type]
  const d = designOf(it, plan)
  const r = rebarOf(it, plan)
  const types = designsOf(plan, type)
  const setR = patch => (d
    ? update(p => setDesign(p, d.id, x => ({ ...x, rebar: { ...x.rebar, ...patch } })))
    : set({ rebar: { ...r, ...patch } }))
  const choose = v => {
    if (v === '') set({ design: undefined, rebar: { ...r } })
    else if (v === '__new') {
      const nd = newDesign(plan, type, r)
      update(p => updateItems({ ...p, designs: [...(p.designs || []), nd] }, list => list.map(i => (i.id === it.id ? { ...i, design: nd.id } : i))))
    } else set({ design: v })
  }
  const used = d ? designUse(plan, d.id) : 0
  const text = barText(type, r)
  return (
    <>
      <div style={S.sub}>Design (bars)</div>
      <label style={S.field}>
        <span style={S.lab}>Type</span>
        <select value={d?.id || ''} onChange={e => choose(e.target.value)} style={{ ...S.sel, width: '150px' }}>
          <option value="">Own bars (this {kind.label.toLowerCase()} only)</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.mark}{barText(type, t.rebar) ? ` · ${barText(type, t.rebar)}` : ''}</option>)}
          <option value="__new">+ New type ({kind.prefix}{types.length + 1}…) from these bars</option>
        </select>
      </label>
      <div style={S.card}>
        {d && (
          <>
            <div style={{ ...S.field, gap: '6px' }}>
              <MarkName d={d} plan={plan} update={update} />
              <span style={{ fontSize: '11.5px', color: '#64748b', flex: 1 }}>used by {used} {used === 1 ? kind.label.toLowerCase() : kind.plural}</span>
              <button style={{ ...S.btn, padding: '4px', color: '#dc2626', border: 0, background: 'transparent' }} title={`Delete type ${d.mark} (its ${kind.plural} keep these bars)`} aria-label={`Delete type ${d.mark}`}
                onClick={() => confirm(`Delete type ${d.mark}? The ${used} ${kind.plural} using it keep these bars as their own.`) && update(p => removeDesign(p, d.id))}>
                <Trash2 size={13} />
              </button>
            </div>
            {used > 1 && <p style={{ ...S.hint, fontSize: '11.5px' }}>Changes here apply to all {used} {kind.plural} marked {d.mark}.</p>}
          </>
        )}
        <BarFields type={type} r={r} set={setR} />
        {text && <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e3a8a' }}>{d ? `${d.mark}: ` : ''}{text}</div>}
        {children?.(setR)}
      </div>
    </>
  )
}

function MarkName({ d, plan, update }) {
  const [text, setText] = useState(d.mark)
  const [prev, setPrev] = useState(d.mark)
  if (prev !== d.mark) { setPrev(d.mark); setText(d.mark) }
  const commit = () => {
    const v = text.trim()
    const taken = (plan.designs || []).some(x => x.id !== d.id && x.mark === v)
    if (v && v !== d.mark && !taken) update(p => setDesign(p, d.id, x => ({ ...x, mark: v })))
    else setText(d.mark)
  }
  return (
    <input value={text} onChange={e => setText(e.target.value)} onBlur={commit} title="Type mark" aria-label="Type mark"
      onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur() } }}
      style={{ ...S.mini, width: '56px', textAlign: 'center', fontWeight: 800, color: '#1e3a8a' }} />
  )
}

export function SlabLoads({ it, set, td, plan, update, level, scanPts }) {
  const res = td?.slabs[it.id]
  // average bottom cover / spacing from scan points inside this slab
  const inside = (scanPts || []).filter(sp => { const p = scanToPlan(sp, level.bg); return p && pointInPoly(p, it.pts) })
  const avg = k => { const v = inside.map(p => parseFloat(p.d?.[k])).filter(n => n > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null }
  const cov = avg('botCover'), sp = avg('botSp')
  const st = loadSettings(plan), LL = levelLoad(level, st)
  return (
    <>
      <div style={S.sub}>Loads</div>
      <Row a="Self-weight" b={`${(it.thickness / 1000 * st.density).toFixed(2)} kPa`} />
      <Row a={`Finishes + live (${LL.label})`} b={`${LL.sdl} + ${LL.qk} kPa`} />
      {res && <Row a="Design load" b={`${res.wULS.toFixed(2)} kPa`} />}
      {res?.M != null && <Row a={`Moment, ${res.span.toFixed(2)} m span`} b={`${res.M.toFixed(1)} kN·m/m`} />}
      <DesignBlock it={it} set={set} plan={plan} update={update}>
        {setR => (cov || sp) && (
          <button style={S.btn} onClick={() => setR({ ...(cov ? { cover: cov } : null), ...(sp ? { sp } : null) })}>
            <ScanLine size={13} /> Use scan: cover {cov ?? '?'} @ {sp ?? '?'} ({inside.length} points)
          </button>
        )}
      </DesignBlock>
      {res?.MRd != null && <><Row a="Capacity MRd (bottom, short span)" b={`${res.MRd.toFixed(1)} kN·m/m`} /><Row a="Used" b={<Util r={res.util} />} /></>}
      {res && res.MRd == null && <p style={S.hint}>Enter the bottom short-span bars to check capacity.</p>}
      {!res && <p style={S.hint}>Turn on Loads (above the drawing) to see results.</p>}
    </>
  )
}

export function BeamLoads({ it, set, td, plan, update }) {
  const res = td?.beams[it.id]
  return (
    <>
      <div style={S.sub}>Loads</div>
      {res ? <>
        <Row a="Design load" b={`${res.wULS.toFixed(1)} kN/m`} />
        <Row a="Moment M" b={`${res.M.toFixed(0)} kN·m`} />
        <Row a="Shear V" b={`${res.V.toFixed(0)} kN`} />
        <Row a="End reactions" b={`${res.Ra.toFixed(0)} / ${res.Rb.toFixed(0)} kN`} />
      </> : <p style={S.hint}>Turn on Loads (above the drawing) to see results.</p>}
      <DesignBlock it={it} set={set} plan={plan} update={update} />
      {res?.MRd != null && <>
        <Row a="Capacity MRd / VRd" b={`${res.MRd.toFixed(0)} kN·m / ${res.VRd.toFixed(0)} kN`} />
        {res.MRdTop != null && <Row a="Top bars, over supports" b={`${res.MRdTop.toFixed(0)} kN·m`} />}
        <Row a="Used" b={<Util r={res.util} />} />
        {res.overReinforced && <p style={{ ...S.hint, color: '#b45309' }}>Over-reinforced section: check the bar figures.</p>}
      </>}
      {res && res.MRd == null && <p style={S.hint}>Enter the bottom bars to check capacity.</p>}
      <p style={S.hint}>Checked as simply supported over its span. Continuous beams are usually better than this at midspan but need checking over supports (top bars).</p>
    </>
  )
}

export function ColumnLoads({ it, set, td, plan, update }) {
  const res = td?.cols[it.id]
  return (
    <>
      <div style={S.sub}>Loads</div>
      {res ? <>
        <Row a="Design load N" b={`${res.N.toFixed(0)} kN`} />
        <Row a="Service load" b={`${res.NSLS.toFixed(0)} kN (${(res.NSLS / 9.81).toFixed(1)} t)`} />
        <Row a="From columns above" b={`${res.fromAbove.toFixed(0)} kN`} />
      </> : <p style={S.hint}>Turn on Loads (above the drawing) to see results.</p>}
      <DesignBlock it={it} set={set} plan={plan} update={update} />
      {res?.NRd != null && <>
        <Row a="Capacity NRd" b={`${res.NRd.toFixed(0)} kN`} />
        <Row a="Used" b={<Util r={res.util} />} />
        {res.slender && <p style={{ ...S.hint, color: '#b45309' }}>Slender column (height over 15 × its size): real capacity is lower than shown.</p>}
      </>}
    </>
  )
}

export function FootingLoads({ it, set, td, plan, update }) {
  const res = td?.foots[it.id]
  const st = loadSettings(plan)
  const side = res && it.kind !== 'pile' ? footingSide(res.NcolSLS, it, st) : null
  const piles = res && it.kind === 'pile' && it.pileCap > 0 ? Math.ceil(res.SLS / it.pileCap) : null
  return (
    <>
      <div style={S.sub}>Loads</div>
      {res ? <>
        <Row a="From column(s), service" b={`${res.NcolSLS.toFixed(0)} kN (${(res.NcolSLS / 9.81).toFixed(1)} t)`} />
        <Row a="Footing + soil on it" b={`${(res.self + res.soil).toFixed(0)} kN`} />
        {it.kind === 'pile' ? <>
          <Row a={`Per pile (${res.piles})`} b={`${res.perPile.toFixed(0)} kN`} />
          {res.utilSoil != null ? <Row a="Against pile capacity" b={<Util r={res.utilSoil} />} /> : <p style={S.hint}>Enter the safe load of one pile to check it.</p>}
          {piles != null && piles !== res.piles && <button style={S.btn} onClick={() => set({ piles })}>Use {piles} piles</button>}
        </> : <>
          <Row a="Pressure on soil" b={`${res.pressure.toFixed(0)} kPa`} />
          <Row a={`Against allowable ${st.bearing} kPa`} b={<Util r={res.utilSoil} />} />
          {side && Math.abs(side - Math.max(it.w, it.d)) >= 100 && (
            <button style={S.btn} onClick={() => set({ w: side, d: side })}>Size it for this load: {side} × {side}</button>
          )}
          <Row a="Moment at column face (X / Y)" b={`${res.Mx.toFixed(0)} / ${res.My.toFixed(0)} kN·m/m`} />
        </>}
      </> : <p style={S.hint}>Turn on Loads (above the drawing) to see results.</p>}
      <DesignBlock it={it} set={set} plan={plan} update={update} />
      {res?.utilBend != null && <>
        <Row a="Capacity (X / Y)" b={`${res.MRdx?.toFixed(0) ?? '–'} / ${res.MRdy?.toFixed(0) ?? '–'} kN·m/m`} />
        <Row a="Bars used" b={<Util r={res.utilBend} />} />
      </>}
      <p style={S.hint}>
        {it.kind === 'pile'
          ? 'Pile cap: load shared equally by the piles. The cap itself (bending, punching) is not checked.'
          : `Pad on soil with allowable bearing ${st.bearing} kPa (change it in Load settings). Punching and shear are not checked.`}
      </p>
    </>
  )
}

// Equipment / debris item: its weight, footprint and the slab check.
export function LoadItemBody({ it, set, td, plan, level }) {
  const r = td?.loads[it.id] || equipmentCheck(plan, level, it)
  const st = loadSettings(plan)
  return (
    <>
      <label style={S.field}><span style={S.lab}>Name</span>
        <input defaultValue={it.name} key={it.name} onBlur={e => e.target.value !== it.name && set({ name: e.target.value })} style={{ ...S.input, width: '140px', textAlign: 'left' }} /></label>
      {it.kind === 'debris'
        ? <N label="Pile height" value={it.h} onChange={v => v && set({ h: v })} />
        : <N label="Weight" value={+(it.kn / 9.81).toFixed(3)} onChange={v => v && set({ kn: v * 9.81 })} suffix="t" />}
      <N label="Length" value={it.d} onChange={v => v && set({ d: v })} />
      <N label="Width" value={it.w} onChange={v => v && set({ w: v })} />
      <div style={S.sub}>Check on the slab</div>
      <Row a="Load" b={`${loadKN(it).toFixed(1)} kN (${(loadKN(it) / 9.81).toFixed(2)} t)`} />
      <Row a="Pressure under it" b={`${r.pressure.toFixed(1)} kPa`} />
      {r.note ? <p style={{ ...S.hint, color: '#b45309' }}>{r.note}: place it on a slab panel to check.</p> : <>
        <Row a="Same as spread over panel" b={`${r.qEq.toFixed(2)} kPa (floor live load ${r.qk})`} />
        <Row a={`Moment, ${r.span.toFixed(2)} m span`} b={`${r.M.toFixed(1)} kN·m/m`} />
        <Row a="Against floor's design load" b={<Util r={r.vsDesign} />} />
        {r.util != null && <Row a="Against slab capacity" b={<Util r={r.util} />} />}
        <p style={S.hint}>
          {r.vsDesign > 1
            ? 'More than the floor was designed for. Spread the load (mats, plates), move it near a beam, or prop the slab below.'
            : 'Within what the floor was designed for, assuming the rest of the panel is kept clear.'}
          {' '}{st.c.short} factors. Punching and local crushing under tracks are not checked.
        </p>
      </>}
      <p style={{ ...S.hint, fontSize: '11px' }}>{DISCLAIMER}</p>
    </>
  )
}
