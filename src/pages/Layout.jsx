import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppWindow, BrickWall, Copy, DoorOpen, FilePlus2, FolderOpen, Hand, Maximize, MousePointer2, Plus, Redo2, Ruler, Save,
  Square, SquareDashed, Trash2, Type, Undo2, Grid3x3, RectangleHorizontal,
} from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../utils/toast'
import Canvas2D from './layout/Canvas2D'
import Inspector from './layout/Inspector'
import { AskDialog, GridDialog, NameDialog, ProjectList } from './layout/Dialogs'
import { TABLE, BUCKET, SELECT, who, when } from './layout/store'
import { newPlan, newLevel, activeLevel, updateLevel, updateItems, uid, planStats, gridMembers } from './layout/geometry'

// Layout: draw a floor plan in 2D (walls, rooms/slabs, columns, doors, windows,
// dimensions, labels) over a blank grid or an imported PDF/image. Work in progress
// is kept in this browser; Save puts it in Xyte for the team (sql/setup-layouts.sql).
const DRAFT_KEY = 'xyte.layout.draft'   // { plan, link } — the layout open in this browser

const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') } catch { return null } }

const TOOLS = [
  { id: 'select', label: 'Select', key: 'V', Icon: MousePointer2, hint: 'Click to select, drag to move. Drag empty space to pan.' },
  { id: 'pan', label: 'Pan', key: 'H', Icon: Hand, hint: 'Drag to move around. Scroll to zoom.' },
  { id: 'wall', label: 'Wall', key: 'W', Icon: BrickWall, hint: 'Click point to point. Type a length + Enter for exact walls. Shift = straight. Esc or right-click to stop.' },
  { id: 'room', label: 'Room', key: 'R', Icon: SquareDashed, hint: 'Click each corner, then click the first corner (or Enter) to close.' },
  { id: 'grid', label: 'Grid', key: 'G', Icon: Grid3x3, hint: 'Click where gridline A/1 goes, then enter the column-to-column spacings.' },
  { id: 'column', label: 'Column', key: 'C', Icon: Square, hint: 'Click to place a column. Change its size on the right.' },
  { id: 'beam', label: 'Beam', key: 'B', Icon: RectangleHorizontal, hint: 'Click column to column. Keeps going from the last point; Esc or right-click to stop. Type a length + Enter for exact.' },
  { id: 'door', label: 'Door', key: 'D', Icon: DoorOpen, hint: 'Click on a wall to put a door in it.' },
  { id: 'window', label: 'Window', key: 'N', Icon: AppWindow, hint: 'Click on a wall to put a window in it.' },
  { id: 'dim', label: 'Dimension', key: 'M', Icon: Ruler, hint: 'Click two points to measure. Type a length + Enter for exact.' },
  { id: 'label', label: 'Label', key: 'T', Icon: Type, hint: 'Click where the text goes.' },
]
const EXTRA_HINTS = {
  calibrate: 'Set scale: click two points on the drawing whose real distance you know.',
  movebg: 'Drag the drawing to line it up with your plan. Esc when done.',
}

export default function Layout() {
  const { memberId } = useAuth()
  const [start] = useState(readDraft)
  const [hist, setHist] = useState(() => ({ past: [], present: start?.plan || newPlan(), future: [] }))
  const plan = hist.present
  const [link, setLink] = useState(start?.link || null)       // { id, name, updated_at, dirty } when saved in Xyte
  const cleanRef = useRef(plan)                                // the plan as last opened / saved
  const [tool, setTool] = useState('select')
  const [sel, setSel] = useState(null)
  const [fitSignal, setFitSignal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [nameDlg, setNameDlg] = useState(null)
  const [listOpen, setListOpen] = useState(false)
  const [askState, setAskState] = useState(null)
  const [gridAt, setGridAt] = useState(null)                   // where a new column grid starts
  const boxRef = useRef(null)
  const [height, setHeight] = useState(null)

  const level = activeLevel(plan)

  // ── history ──────────────────────────────────────────────
  const update = useCallback((fn, push = true) => setHist(h => {
    const next = fn(h.present)
    if (next === h.present) return h
    return push ? { past: [...h.past.slice(-99), h.present], present: next, future: [] } : { ...h, present: next }
  }), [])
  const undo = useCallback(() => { setSel(null); setHist(h => h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h) }, [])
  const redo = useCallback(() => { setSel(null); setHist(h => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h) }, [])
  const reset = useCallback(p => { cleanRef.current = p; setHist({ past: [], present: p, future: [] }); setSel(null); setTool('select'); setFitSignal(n => n + 1) }, [])

  const ask = useCallback(opts => new Promise(resolve => setAskState({ ...opts, resolve })), [])

  // ── keep work in this browser, and track unsaved changes ──
  useEffect(() => {
    if (plan !== cleanRef.current) setLink(l => (l && !l.dirty ? { ...l, dirty: true } : l))
  }, [plan])

  const warnedRef = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ plan, link })) } catch {
        if (!warnedRef.current) { warnedRef.current = true; toast('This layout is too big to keep in the browser. Save it to Xyte so it is not lost.', { tone: 'err', ms: 7000 }) }
      }
    }, 500)
    return () => clearTimeout(t)
  }, [plan, link])

  useEffect(() => {
    const warn = e => { if (link?.dirty || (!link && plan.levels.some(l => l.items.length))) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [link, plan])

  // ── fill the space under the app header ──────────────────
  useEffect(() => {
    function fit() {
      const el = boxRef.current
      if (!el) return
      const main = el.closest('main')
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      setHeight(Math.max(520, window.innerHeight - el.getBoundingClientRect().top - bottom))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // ── levels ───────────────────────────────────────────────
  const top = () => plan.levels.reduce((a, b) => (b.elevation > a.elevation ? b : a))
  function addLevel(copy) {
    const t = top()
    const lv = newLevel(`Level ${plan.levels.length + 1}`, t.elevation + t.wallHeight)
    if (copy) {
      // new ids, keeping doors on their walls and columns/beams on their grid
      const ids = new Map(level.items.filter(i => i.type === 'wall' || i.type === 'grid').map(w => [w.id, uid()]))
      const relink = r => r && { ...r, g: ids.get(r.g) }
      lv.items = level.items.map(i => ({
        ...i, id: ids.get(i.id) || uid(),
        ...(i.wallId ? { wallId: ids.get(i.wallId) } : null),
        ...(i.grid ? { grid: relink(i.grid) } : null),
        ...(i.ga || i.gb ? { ga: relink(i.ga), gb: relink(i.gb) } : null),
      }))
      lv.wallHeight = level.wallHeight
      lv.slab = level.slab
    }
    update(p => ({ ...p, levels: [...p.levels, lv], levelId: lv.id }))
    setSel(null)
  }
  function deleteLevel() {
    if (plan.levels.length < 2) return
    if (level.items.length && !confirm(`Delete ${level.name} and everything drawn on it?`)) return
    update(p => {
      const levels = p.levels.filter(l => l.id !== level.id)
      return { ...p, levels, levelId: levels[0].id }
    })
    setSel(null)
  }
  const sortedLevels = [...plan.levels].sort((a, b) => b.elevation - a.elevation)

  // ── drawing underlay ─────────────────────────────────────
  async function importFile(f) {
    setImporting(true)
    try {
      const canvas = document.createElement('canvas')
      const MAX = 3500
      if (f.type === 'application/pdf') {
        const [pdfjs, { default: workerSrc }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise
        let n = 1
        if (doc.numPages > 1) {
          const ans = await ask({ title: 'Which page?', label: `This PDF has ${doc.numPages} pages. Page to use`, value: '1', numeric: true })
          if (ans == null) { doc.destroy(); return }
          n = Math.min(doc.numPages, Math.max(1, Math.round(+ans)))
        }
        const page = await doc.getPage(n)
        const v1 = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: Math.min(5, MAX / Math.max(v1.width, v1.height)) })
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, canvas, viewport }).promise
        doc.destroy()
      } else {
        const url = URL.createObjectURL(f)
        try {
          const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = url })
          const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
          canvas.width = Math.round(img.naturalWidth * k)
          canvas.height = Math.round(img.naturalHeight * k)
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        } finally { URL.revokeObjectURL(url) }
      }
      const src = canvas.toDataURL('image/jpeg', 0.85)
      const mmPerPx = 30000 / canvas.width    // a first guess (30 m across) until the scale is set
      update(p => updateLevel(p, level.id, l => ({ ...l, bg: { src, w: canvas.width, h: canvas.height, x: 0, y: 0, mmPerPx, opacity: 0.5, show: true } })))
      setSel(null)
      setFitSignal(n => n + 1)
      setTool('calibrate')
      toast('Drawing added. Now set its scale: click two points whose real distance you know.', { ms: 7000 })
    } catch (err) {
      toast(`Couldn't import: ${err.message}`, { tone: 'err', ms: 7000 })
    } finally { setImporting(false) }
  }

  // ── Xyte projects ────────────────────────────────────────
  async function upload(id, data) {
    const body = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const { error } = await supabase.storage.from(BUCKET).upload(`${id}.json`, body, { upsert: true, contentType: 'application/json' })
    if (error) throw error
    return body.size
  }

  async function save() {
    if (!link) { setNameDlg({ name: plan.name === 'Untitled layout' ? '' : plan.name, error: '' }); return }
    setBusy(true)
    try {
      const { data: row, error } = await supabase.from(TABLE).select(SELECT).eq('id', link.id).maybeSingle()
      if (error) throw error
      if (!row) { setLink(null); setNameDlg({ name: link.name, error: 'This layout was deleted from Xyte. Save it again under a name.' }); return }
      if (row.updated_at !== link.updated_at &&
          !confirm(`${who(row.updater)} saved "${row.name}" at ${when(row.updated_at)}, after you opened it.\n\nSave yours over it? Their changes will be lost.`)) return
      const data = { ...plan, name: row.name }
      const st = planStats(data)
      const size = await upload(link.id, data)
      const { data: saved, error: e2 } = await supabase.from(TABLE)
        .update({ levels: st.levels, area_m2: st.area, size_bytes: size, updated_by: memberId, updated_at: new Date().toISOString() })
        .eq('id', link.id).select('updated_at').single()
      if (e2) throw e2
      cleanRef.current = plan
      setLink({ id: link.id, name: row.name, updated_at: saved.updated_at, dirty: false })
      toast(`Saved "${row.name}" to Xyte`)
    } catch (err) {
      toast(`Couldn't save: ${err.message}`, { tone: 'err', ms: 7000 })
    } finally { setBusy(false) }
  }

  async function saveNew(name) {
    name = name.trim()
    if (!name) { setNameDlg({ name, error: 'Type a layout name.' }); return }
    setBusy(true)
    try {
      const { data: same, error: e0 } = await supabase.from(TABLE).select('id').ilike('name', name.replace(/[%_\\]/g, '\\$&')).limit(1)
      if (e0) throw e0
      if (same?.length) { setNameDlg({ name, error: 'A layout with this name already exists. Open it from Layouts, or use another name.' }); return }
      const id = crypto.randomUUID()
      const data = { ...plan, name }
      const st = planStats(data)
      const size = await upload(id, data)
      const { data: row, error } = await supabase.from(TABLE).insert({
        id, name, file_path: `${id}.json`, levels: st.levels, area_m2: st.area, size_bytes: size, created_by: memberId, updated_by: memberId,
      }).select('updated_at').single()
      if (error) { await supabase.storage.from(BUCKET).remove([`${id}.json`]); throw error }
      cleanRef.current = data
      setHist(h => ({ ...h, present: data }))
      setLink({ id, name, updated_at: row.updated_at, dirty: false })
      setNameDlg(null)
      toast(`"${name}" saved to Xyte. Everyone can open it from Layouts.`)
    } catch (err) {
      const msg = /layout_plans|layouts|bucket/i.test(err.message) ? `${err.message}. Run sql/setup-layouts.sql in Supabase first.` : err.message
      setNameDlg({ name, error: `Couldn't save: ${msg}` })
    } finally { setBusy(false) }
  }

  async function open(row) {
    if (link?.dirty && !confirm(link.id === row.id
      ? `Your changes to "${link.name}" are not saved to Xyte. Open the saved version and drop them?`
      : `"${link.name}" has changes that are not saved to Xyte. Open "${row.name}" anyway?`)) return
    if (!link && plan.levels.some(l => l.items.length) && !confirm('The layout you are drawing is not saved to Xyte. Open another one and drop it?')) return
    setBusy(true)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(row.file_path)
      if (error) throw error
      const p = JSON.parse(await data.text())
      reset(p)
      setLink({ id: row.id, name: row.name, updated_at: row.updated_at, dirty: false })
      setListOpen(false)
      toast(`Opened "${row.name}"`)
    } catch (err) {
      toast(`Couldn't open "${row.name}": ${err.message}`, { tone: 'err', ms: 7000 })
    } finally { setBusy(false) }
  }

  function startNew() {
    const unsaved = link ? link.dirty : plan.levels.some(l => l.items.length || l.bg)
    if (unsaved && !confirm('Start a new layout? Changes not saved to Xyte will be lost.')) return
    reset(newPlan())
    setLink(null)
  }

  const status = !link ? 'Not saved to Xyte' : link.dirty ? 'Unsaved changes' : `Saved ${when(link.updated_at)}`
  const hint = EXTRA_HINTS[tool] || TOOLS.find(t => t.id === tool)?.hint

  return (
    <div ref={boxRef} style={{ height: height ? `${height}px` : 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
      {/* top bar */}
      <div style={S.bar}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '8px', flex: 1 }}>
          <b style={S.name} title={link?.name}>{link ? link.name : 'Layout'}</b>
          <span style={{ fontSize: '12px', color: link?.dirty ? '#b45309' : '#64748b', whiteSpace: 'nowrap' }}>{status}</span>
        </div>
        <button style={S.btn} onClick={startNew} disabled={busy}><FilePlus2 size={14} /> New</button>
        <button style={S.btn} onClick={() => setListOpen(true)} disabled={busy}><FolderOpen size={14} /> Layouts</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={save} disabled={busy}><Save size={14} /> {busy ? 'Saving…' : 'Save'}</button>
        {link && <button style={S.btn} onClick={() => setNameDlg({ name: `${link.name} (copy)`, error: '' })} disabled={busy}>Save as new</button>}
      </div>

      {/* second bar: undo, levels, view */}
      <div style={{ ...S.bar, background: '#fff' }}>
        <button style={S.iconBtn} onClick={undo} disabled={!hist.past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={16} /></button>
        <button style={S.iconBtn} onClick={redo} disabled={!hist.future.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={16} /></button>
        <span style={S.sep} />
        <span style={{ fontSize: '12.5px', color: '#475569' }}>Level</span>
        <select value={level.id} onChange={e => { update(p => ({ ...p, levelId: e.target.value }), false); setSel(null) }} style={S.select}>
          {sortedLevels.map(l => <option key={l.id} value={l.id}>{l.name} ({l.elevation >= 0 ? '+' : ''}{l.elevation} mm)</option>)}
        </select>
        <button style={S.btn} onClick={() => addLevel(false)} title="Add an empty level on top"><Plus size={14} /> Level</button>
        <button style={S.btn} onClick={() => addLevel(true)} title="Add a level on top with a copy of everything on this one"><Copy size={14} /> Copy level</button>
        {plan.levels.length > 1 && <button style={{ ...S.iconBtn, color: '#dc2626' }} onClick={deleteLevel} title="Delete this level" aria-label="Delete level"><Trash2 size={15} /></button>}
        <span style={{ flex: 1 }} />
        <button style={S.btn} onClick={() => setFitSignal(n => n + 1)} title="Zoom to fit"><Maximize size={14} /> Fit</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* tools */}
        <div style={S.rail}>
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={tool === t.id}
              style={{ ...S.tool, ...(tool === t.id ? S.toolOn : null) }}>
              <t.Icon size={18} />
              <span style={{ fontSize: '10px' }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* canvas */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Canvas2D plan={plan} tool={tool} setTool={setTool} sel={sel} setSel={setSel} update={update} undo={undo} redo={redo}
            fitSignal={fitSignal} ask={ask} onGridAt={setGridAt} />
          {hint && <div style={S.hint}>{hint}</div>}
        </div>

        {/* properties */}
        <div style={S.side}>
          <Inspector plan={plan} sel={sel} setSel={setSel} update={update} tool={tool} setTool={setTool} onImport={importFile} importing={importing} />
        </div>
      </div>

      {gridAt && <GridDialog plan={plan} onClose={() => setGridAt(null)} onCreate={opts => {
        const g = { id: uid(), type: 'grid', x: gridAt.x, y: gridAt.y, xs: opts.xs, ys: opts.ys }
        update(p => updateItems(p, list => [...list, g, ...gridMembers(g, list, { ...opts, height: level.wallHeight })]))
        update(p => ({ ...p, beamWidth: opts.beam.w, beamDepth: opts.beam.d }), false)
        setGridAt(null)
        setTool('select')
        setSel(g.id)
        setFitSignal(n => n + 1)
      }} />}
      {askState && <AskDialog ask={askState} onDone={v => { askState.resolve(v); setAskState(null) }} />}
      {nameDlg && <NameDialog dlg={nameDlg} busy={busy} onChange={name => setNameDlg({ name, error: '' })} onSave={() => saveNew(nameDlg.name)} onClose={() => setNameDlg(null)} />}
      {listOpen && <ProjectList current={link?.id} busy={busy} onOpen={open} onClose={() => setListOpen(false)}
        onDeleted={id => { if (link?.id === id) setLink(null) }} />}
    </div>
  )
}

const S = {
  bar: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' },
  name: { fontSize: '14px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '13px', fontWeight: 600, borderRadius: '7px',
    border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' },
  primary: { background: '#2563eb', borderColor: '#2563eb', color: '#fff' },
  iconBtn: { display: 'inline-flex', padding: '6px', background: 'transparent', border: 0, color: '#334155', cursor: 'pointer', borderRadius: '6px' },
  sep: { width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' },
  select: { padding: '5px 8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '7px', background: '#fff', color: '#0f172a' },
  rail: { width: '64px', flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 4px', overflowY: 'auto' },
  tool: { display: 'grid', justifyItems: 'center', gap: '2px', padding: '7px 2px', border: '1px solid transparent', borderRadius: '8px', background: 'transparent', color: '#475569', cursor: 'pointer' },
  toolOn: { background: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8' },
  side: { width: '270px', flexShrink: 0, borderLeft: '1px solid #e2e8f0', background: '#fff', overflowY: 'auto' },
  hint: { position: 'absolute', left: '10px', bottom: '10px', maxWidth: 'calc(100% - 20px)', padding: '6px 10px', fontSize: '12.5px', color: '#334155',
    background: 'rgba(255,255,255,.92)', border: '1px solid #e2e8f0', borderRadius: '8px', pointerEvents: 'none' },
}
