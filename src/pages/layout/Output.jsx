import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet, History, Printer, Search } from 'lucide-react'
import { supabase } from '../../supabase'
import { Modal } from './Dialogs'
import { SHEETS } from './pdf'
import { columnMatrix } from './excel'
import { nextLabel } from './geometry'
import { detailGroups } from './details'
import { when } from './store'

const S = {
  label: { display: 'grid', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: '#334155' },
  input: { width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: '13.5px', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', background: '#fff' },
  note: { margin: 0, fontSize: '12.5px', color: '#64748b' },
  actions: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' },
  primary: { background: '#2563eb', border: '1px solid #2563eb', color: '#fff' },
  check: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155', cursor: 'pointer' },
  two: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
}

// Print to PDF: sheet size, scale, which levels, and the title block.
export function PrintDialog({ plan, levelId, defaults, busy, onPrint, onClose }) {
  const [sheet, setSheet] = useState(plan.print?.sheet || 'A3')
  const [scale, setScale] = useState(plan.print?.scale || 'auto')
  const [which, setWhich] = useState('one')
  const [underlay, setUnderlay] = useState(!!plan.print?.underlay)
  const [sections, setSections] = useState((plan.sections || []).length > 0)
  const nDetails = detailGroups(plan).length
  const [details, setDetails] = useState(nDetails > 0)
  const [tb, setTb] = useState({ company: 'Sonicon', companyLine: 'Structural survey layout', project: plan.name, ...defaults, ...plan.titleBlock })
  const set = k => e => setTb(t => ({ ...t, [k]: e.target.value }))
  const level = plan.levels.find(l => l.id === levelId)
  const field = (k, label, ph) => <label style={S.label}>{label}<input value={tb[k] || ''} onChange={set(k)} placeholder={ph} style={S.input} /></label>
  return (
    <Modal title="Print to PDF" onClose={onClose} wide>
      <div style={S.two}>
        <label style={S.label}>Sheet
          <select value={sheet} onChange={e => setSheet(e.target.value)} style={S.input}>
            {Object.keys(SHEETS).map(k => <option key={k} value={k}>{k} landscape</option>)}
          </select>
        </label>
        <label style={S.label}>Scale
          <select value={scale} onChange={e => setScale(e.target.value)} style={S.input}>
            <option value="auto">Fit the sheet (nearest standard scale)</option>
            {[50, 75, 100, 150, 200, 250, 500, 1000].map(n => <option key={n} value={String(n)}>1:{n}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'grid', gap: '6px' }}>
        <label style={S.check}><input type="radio" checked={which === 'one'} onChange={() => setWhich('one')} /> This level only ({level?.name})</label>
        <label style={S.check}><input type="radio" checked={which === 'all'} onChange={() => setWhich('all')} /> All {plan.levels.length} levels, one sheet each</label>
        {(plan.sections || []).length > 0 && <label style={S.check}><input type="checkbox" checked={sections} onChange={e => setSections(e.target.checked)} /> Add a sheet for each section ({plan.sections.map(s => s.name).join(', ')})</label>}
        {nDetails > 0 && <label style={S.check}><input type="checkbox" checked={details} onChange={e => setDetails(e.target.checked)} /> Add reinforcement details: length view and section of each bar type ({nDetails} sheet{nDetails > 1 ? 's' : ''})</label>}
        <label style={S.check}><input type="checkbox" checked={underlay} onChange={e => setUnderlay(e.target.checked)} /> Include the client's drawing underneath (faint)</label>
      </div>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '.04em', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>Title block</div>
      <div style={S.two}>
        {field('company', 'Company')}
        {field('client', 'Client', 'e.g. main contractor')}
        {field('project', 'Project')}
        {field('drawingNo', 'Drawing no.', 'e.g. SON-2611-L')}
        {field('drawnBy', 'Drawn by')}
        {field('checkedBy', 'Checked by')}
      </div>
      <p style={S.note}>Revision comes from Revisions ({plan.titleBlock?.rev || 'none issued yet'}). Each sheet gets the drawing no. plus its sheet number.</p>
      <div style={S.actions}>
        <button style={S.btn} onClick={onClose}>Cancel</button>
        <button style={{ ...S.btn, ...S.primary }} disabled={busy}
          onClick={() => onPrint({ levelIds: which === 'all' ? plan.levels.map(l => l.id) : [levelId], sheet, scale, underlay, sections, details, tb: { ...tb, rev: plan.titleBlock?.rev } }, which === 'all')}>
          <Printer size={14} /> {busy ? 'Making PDF…' : 'Download PDF'}
        </button>
      </div>
    </Modal>
  )
}

// Structure schedule: column sizes at every grid point on every level.
export function ScheduleDialog({ plan, busy, onExcel, onClose }) {
  const { levels, rows } = columnMatrix(plan)
  const th = { position: 'sticky', top: 0, background: '#1e293b', color: '#fff', padding: '6px 8px', fontSize: '12px', textAlign: 'left', whiteSpace: 'nowrap' }
  const td = { padding: '5px 8px', fontSize: '12.5px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }
  return (
    <Modal title="Column schedule" onClose={onClose} wide>
      {!rows.length
        ? <p style={S.note}>No columns yet.</p>
        : <div style={{ overflow: 'auto', maxHeight: '58vh', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={th}>Grid</th>{levels.map(l => <th key={l.id} style={th}>{l.name}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.ref}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.ref}</td>
                    {levels.map((l, k) => {
                      const cur = r.sizes[l.id], prev = k ? r.sizes[levels[k - 1].id] : undefined
                      return <td key={l.id} style={{ ...td, background: cur && prev && cur !== prev ? '#fef3c7' : undefined, color: cur ? '#0f172a' : '#cbd5e1' }}>{cur || '–'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      <p style={S.note}>Width × depth in mm. * = off its gridline. Yellow = the size changes from the level above. The Excel file also has beams, slabs, openings, RC walls, site notes and scan points.</p>
      <div style={S.actions}>
        <button style={S.btn} onClick={onClose}>Close</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={onExcel} disabled={busy}><FileSpreadsheet size={14} /> {busy ? 'Making file…' : 'Download Excel'}</button>
      </div>
    </Modal>
  )
}

// Issue a revision (A, B, C…) and open earlier ones.
export function RevisionsDialog({ plan, link, busy, onIssue, onOpenRev, onClose }) {
  const revs = plan.revisions || []
  const next = revs.length ? nextLabel(revs[revs.length - 1].rev) : 'A'
  const [rev, setRev] = useState(next)
  const [note, setNote] = useState(revs.length ? '' : 'First issue')
  return (
    <Modal title="Revisions" onClose={onClose} wide>
      {!link && <p style={{ ...S.note, color: '#b45309' }}>Save the layout to Xyte first. Revisions are kept with the saved layout.</p>}
      {link && <>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '10px' }}>
          <label style={S.label}>Revision<input value={rev} onChange={e => setRev(e.target.value.toUpperCase().slice(0, 4))} style={S.input} /></label>
          <label style={S.label}>What changed<input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Level 3 beams measured on site" style={S.input} /></label>
        </div>
        <p style={S.note}>Issuing saves the layout and keeps a copy of it as Rev {rev || '?'}. The revision shows in the PDF title block.</p>
        <div style={S.actions}>
          <button style={{ ...S.btn, ...S.primary }} disabled={busy || !rev.trim() || revs.some(r => r.rev === rev.trim())}
            onClick={() => onIssue({ rev: rev.trim(), note: note.trim() })}><History size={14} /> {busy ? 'Saving…' : `Issue Rev ${rev || ''}`}</button>
        </div>
      </>}
      <div style={{ display: 'grid', gap: '6px', maxHeight: '40vh', overflowY: 'auto' }}>
        {[...revs].reverse().map(r => (
          <div key={r.rev} style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px' }}>
            <b style={{ fontSize: '15px', width: '34px' }}>{r.rev}</b>
            <span style={{ flex: 1, minWidth: 0, fontSize: '12.5px', color: '#334155' }}>{r.note || '–'}<br /><span style={{ color: '#64748b' }}>{when(r.date)} · {r.by || 'someone'}</span></span>
            {link && <button style={S.btn} onClick={() => onOpenRev(r)} disabled={busy}>Open copy</button>}
          </div>
        ))}
        {!revs.length && <p style={S.note}>No revisions issued yet.</p>}
      </div>
    </Modal>
  )
}

// Link the layout to a site / project in Xyte.
export function SitePicker({ current, onPick, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    supabase.from('sites').select('id, site_name, client_company_name, location, scheduled_date').eq('is_hidden', false).order('scheduled_date', { ascending: false }).limit(500)
      .then(({ data, error }) => { if (error) setError(error.message); else setRows(data) })
  }, [])
  const t = q.trim().toLowerCase()
  const shown = (rows || []).filter(r => !t || [r.site_name, r.client_company_name, r.location].some(v => v?.toLowerCase().includes(t)))
  return (
    <Modal title="Link to a site" onClose={onClose} wide>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search site, client or location" style={{ ...S.input, paddingLeft: '30px' }} />
      </div>
      {error && <p style={{ ...S.note, color: '#dc2626' }}>Couldn't load sites: {error}</p>}
      {!rows && !error && <p style={S.note}>Loading…</p>}
      <div style={{ display: 'grid', gap: '6px', maxHeight: '55vh', overflowY: 'auto' }}>
        {current && <button style={{ ...S.btn, color: '#dc2626', justifyContent: 'center' }} onClick={() => onPick(null)}>Unlink from {current.name}</button>}
        {shown.map(r => (
          <button key={r.id} onClick={() => onPick({ id: r.id, name: r.site_name })}
            style={{ textAlign: 'left', display: 'grid', gap: '2px', padding: '8px 10px', border: `1px solid ${current?.id === r.id ? '#2563eb' : '#e2e8f0'}`, borderRadius: '8px', background: current?.id === r.id ? '#eff6ff' : '#fff', cursor: 'pointer' }}>
            <b style={{ fontSize: '14px', color: '#0f172a' }}>{r.site_name}</b>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{[r.client_company_name, r.location, r.scheduled_date && new Date(r.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function ExportMenu({ onPrint, onSchedule, onCad, onClose }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const item = (Icon, label, sub, fn) => (
    <button onClick={() => { onClose(); fn() }} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', textAlign: 'left', padding: '8px 10px', border: 0, background: 'transparent', borderRadius: '8px', cursor: 'pointer', width: '100%' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <Icon size={16} style={{ marginTop: '2px', color: '#2563eb' }} />
      <span><b style={{ fontSize: '13px', color: '#0f172a' }}>{label}</b><br /><span style={{ fontSize: '12px', color: '#64748b' }}>{sub}</span></span>
    </button>
  )
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 2999 }} onPointerDown={onClose} />
      <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 3000, width: '270px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 12px 30px rgba(0,0,0,.15)', padding: '4px' }}>
        {item(Printer, 'Print / PDF', 'Sheets to scale with a title block', onPrint)}
        {item(FileSpreadsheet, 'Schedule / Excel', 'Columns by level, beams, slabs, scan points', onSchedule)}
        {item(Download, 'CAD (DXF)', 'For AutoCAD and other CAD programs', onCad)}
      </div>
    </>
  )
}
