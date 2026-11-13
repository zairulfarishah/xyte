import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  AppWindow, BrickWall, Copy, Download, DoorOpen, FilePlus2, FolderOpen, Hand, Maximize, MousePointer2, Plus, Redo2, Ruler, Save,
  Square, SquareDashed, Trash2, Type, Undo2, Grid3x3, RectangleHorizontal, Box, Layers, SquareX, Slice, History, MapPin, StickyNote,
} from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../utils/toast'
import Canvas2D from './layout/Canvas2D'
import Inspector from './layout/Inspector'
import { AskDialog, ExportDialog, GridDialog, NameDialog, ProjectList, ScanProjectPicker } from './layout/Dialogs'
import { downloadDxf } from './layout/dxf'
import { useScanPoints, fetchScanPoints } from './layout/scan'
import { ExportMenu, PrintDialog, RevisionsDialog, ScheduleDialog, SitePicker } from './layout/Output'
import { useSearchParams } from 'react-router-dom'
import { TABLE, BUCKET, SELECT, who, when } from './layout/store'
import { newPlan, newLevel, activeLevel, updateLevel, updateItems, uid, planStats, gridMembers, migratePlan } from './layout/geometry'

// Layout: draw an existing building's structure (gridlines, columns, beams, slabs) and
// its floor plan (walls, rooms, doors, windows, dimensions, labels), level by level, over a
// blank grid or an imported PDF/image of the client's drawing. Work in progress
// is kept in this browser; Save puts it in Xyte for the team (sql/setup-layouts.sql).
const View3D = lazy(() => import('./layout/View3D'))   // three.js loads only when 3D is opened
const SectionView = lazy(() => import('./layout/SectionView'))
const DRAFT_KEY = 'xyte.layout.draft'   // { plan, link } — the layout open in this browser

const readDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    return d && { ...d, plan: migratePlan(d.plan) }
  } catch { return null }
}
const hasWork = p => p.grids?.length || p.levels.some(l => l.items.length || l.bg || l.cad)

// Structure first, then architecture.
const TOOLS = [
  { id: 'select', label: 'Select', key: 'V', Icon: MousePointer2, hint: 'Click to select, drag to move. Drag a gridline to move it. Drag empty space to pan.' },
  { id: 'pan', label: 'Pan', key: 'H', Icon: Hand, hint: 'Drag to move around. Scroll to zoom.' },
  { id: 'grid', label: 'Grid', key: 'G', Icon: Grid3x3, hint: 'Click where the first gridlines cross (e.g. A/1), then enter the spacings. The grid is shared by every level.' },
  { id: 'column', label: 'Column', key: 'C', Icon: Square, hint: 'Click to place a column. Change its size on the right.' },
  { id: 'beam', label: 'Beam', key: 'B', Icon: RectangleHorizontal, hint: 'Click column to column. Keeps going from the last point; Esc or right-click to stop. Type a length + Enter for exact.' },
  { id: 'slab', label: 'Slab', key: 'S', Icon: Layers, hint: 'Click each corner of the slab, then the first corner (or Enter) to close. For a grid, select it and use "Slabs in all bays".' },
  { id: 'void', label: 'Opening', key: 'O', Icon: SquareX, hint: 'Slab opening (lift, stair, shaft): click each corner, then the first corner (or Enter) to close.' },
  { id: 'section', label: 'Section', key: 'X', Icon: Slice, hint: 'Click two points to cut a section through the building. It looks to the left of the line you draw.' },
  { id: 'wall', label: 'Wall', key: 'W', Icon: BrickWall, hint: 'Click point to point. Type a length + Enter for exact walls. Shift = straight. Esc or right-click to stop. Set RC (concrete) walls on the right.' },
  { id: 'room', label: 'Room', key: 'R', Icon: SquareDashed, hint: 'Click each corner, then click the first corner (or Enter) to close.' },
  { id: 'door', label: 'Door', key: 'D', Icon: DoorOpen, hint: 'Click on a wall to put a door in it.' },
  { id: 'window', label: 'Window', key: 'N', Icon: AppWindow, hint: 'Click on a wall to put a window in it.' },
  { id: 'dim', label: 'Dimension', key: 'M', Icon: Ruler, hint: 'Click two points to measure. Type a length + Enter for exact.' },
  { id: 'label', label: 'Label', key: 'T', Icon: Type, hint: 'Click where the text goes.' },
  { id: 'note', label: 'Site note', key: 'P', Icon: StickyNote, hint: 'Click to pin a site note, then add text and photos on the right.' },
]
// headings shown above these tools in the tool bar
const GROUPS = { grid: 'Structure', wall: 'Plan', dim: 'Notes' }

const EXTRA_HINTS = {
  calibrate: 'Set scale: click two points on the drawing whose real distance you know.',
  movebg: 'Drag the drawing to line it up with your plan. Esc when done.',
  movecad: 'Drag the CAD drawing to line it up with your plan. Esc when done.',
}

export default function Layout() {
  const { memberId, firstName } = useAuth()
  const [start] = useState(readDraft)
  const [hist, setHist] = useState(() => ({ past: [], present: start?.plan || newPlan(), future: [] }))
  const plan = hist.present
  const [link, setLink] = useState(start?.link || null)       // { id, name, updated_at, dirty } when saved in Xyte
  const cleanRef = useRef(plan)                                // the plan as last opened / saved
  const [tool, setTool] = useState('select')
  const [mode, setMode] = useState('2d')                       // '2d' drawing or '3d' view
  const [sel, setSel] = useState(null)
  const [fitSignal, setFitSignal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [nameDlg, setNameDlg] = useState(null)
  const [listOpen, setListOpen] = useState(false)
  const [askState, setAskState] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [scanPick, setScanPick] = useState(false)
  const [output, setOutput] = useState(null)                  // 'menu' | 'print' | 'schedule' | 'revs' | 'site'
  const [sectionId, setSectionId] = useState(null)
  const sectionShown = (plan.sections || []).find(x => x.id === sectionId)
  const [gridAt, setGridAt] = useState(null)                   // where a new column grid starts
  const boxRef = useRef(null)
  const [height, setHeight] = useState(null)

  const level = activeLevel(plan)
  const scan = useScanPoints(level.scan?.id)
  const scanPts = level.scan && level.bg?.ptScale ? scan.points.filter(p => p.page === level.scan.page) : []

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
    const warn = e => { if (link?.dirty || (!link && hasWork(plan))) { e.preventDefault(); e.returnValue = '' } }
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
      // new ids, keeping doors on their walls; columns, beams and slabs stay on the shared grid
      const ids = new Map(level.items.filter(i => i.type === 'wall').map(w => [w.id, uid()]))
      lv.items = level.items.map(i => ({
        ...i, id: ids.get(i.id) || uid(),
        ...(i.wallId ? { wallId: ids.get(i.wallId) } : null),
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
  // Renders one PDF page. pick(numPages) returns the 1-based page to use, or null to cancel.
  async function renderPdf(data, pick) {
    const MAX = 3500
    const [pdfjs, { default: workerSrc }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
    const doc = await pdfjs.getDocument({ data }).promise
    try {
      const n = doc.numPages > 1 ? await pick(doc.numPages) : 1
      if (n == null) return null
      const page = await doc.getPage(n)
      const v1 = page.getViewport({ scale: 1 })
      const ptScale = Math.min(5, MAX / Math.max(v1.width, v1.height))    // canvas px per PDF point
      const viewport = page.getViewport({ scale: ptScale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, canvas, viewport }).promise
      return { canvas, ptScale, page: n }
    } finally { doc.destroy() }
  }

  const askPage = (numPages, value = '1') => ask({ title: 'Which page?', label: `This PDF has ${numPages} pages. Page to use`, value, numeric: true })
    .then(ans => (ans == null ? null : Math.min(numPages, Math.max(1, Math.round(+ans)))))

  // Puts a rendered drawing under this level. A PDF drawn to scale can be sized straight
  // away from its scale (1:100 etc.); otherwise the user sets the scale by two points.
  async function placeBg(canvas, { ptScale, page, scan } = {}) {
    let mmPerPx = 30000 / canvas.width    // a first guess (30 m across) until the scale is set
    let scaled = false
    if (ptScale) {
      const ans = await ask({ title: 'Drawing scale', label: 'If the PDF is drawn to scale, type it (e.g. 100 for 1:100). Leave empty to set the scale by clicking two points.', value: '', placeholder: '100', numeric: true, optional: true })
      if (ans == null) return false
      if (parseFloat(ans) > 0) { mmPerPx = (25.4 / 72) * parseFloat(ans) / ptScale; scaled = true }
    }
    const src = canvas.toDataURL('image/jpeg', 0.85)
    update(p => updateLevel(p, level.id, l => ({
      ...l,
      bg: { src, w: canvas.width, h: canvas.height, x: 0, y: 0, mmPerPx, opacity: 0.5, show: true, ...(ptScale ? { ptScale, page: page - 1 } : null) },
      scan: scan || null,
    })))
    setSel(null)
    setFitSignal(n => n + 1)
    if (scaled) {
      setTool('movebg')
      toast('Drawing added at its scale. Drag it to line up with your gridlines, then Esc.', { ms: 7000 })
    } else {
      setTool('calibrate')
      toast('Drawing added. Now set its scale: click two points whose real distance you know.', { ms: 7000 })
    }
    return true
  }

  // Link a Scan Marker project: its drawing becomes this level's underlay and its points sit on it.
  async function linkScan(row) {
    if (level.bg && !confirm(`Replace this level's drawing underlay with the drawing from "${row.name}"?`)) return
    setScanPick(false)
    setImporting(true)
    try {
      const [{ data: file, error }, { data: pts }] = await Promise.all([
        supabase.storage.from('scan-drawings').download(row.pdf_path),
        supabase.from('scan_points').select('page').eq('project_id', row.id),
      ])
      if (error) throw error
      // suggest the page with the most points
      const per = {}
      for (const p of pts || []) per[p.page] = (per[p.page] || 0) + 1
      const best = Object.entries(per).sort((a, b) => b[1] - a[1])[0]
      const r = await renderPdf(new Uint8Array(await file.arrayBuffer()), n => askPage(n, best ? String(+best[0] + 1) : '1'))
      if (!r) return
      await placeBg(r.canvas, { ptScale: r.ptScale, page: r.page, scan: { id: row.id, name: row.name, page: r.page - 1, show: true } })
    } catch (err) {
      toast(`Couldn't link the scan project: ${err.message}`, { tone: 'err', ms: 7000 })
    } finally { setImporting(false) }
  }

  // Client CAD drawing: kept as lines you can snap to, not a picture.
  async function importCad(f) {
    const { parseDxf, flattenDxf, UNIT_NAMES } = await import('./layout/cad')
    const { dxf, unit } = await parseDxf(await f.text())
    const ans = await ask({
      title: 'Drawing units',
      label: `This drawing says its units are ${UNIT_NAMES[unit] || 'not set'}. How many mm is one drawing unit? (1 = mm, 10 = cm, 1000 = metres)`,
      value: String(unit), numeric: true,
    })
    if (ans == null) return
    const { cad, segs, cut } = flattenDxf(dxf, parseFloat(ans), f.name)
    if (level.cad && !confirm(`Replace the CAD drawing "${level.cad.name}" on this level?`)) return
    update(p => updateLevel(p, level.id, l => ({ ...l, cad })))
    setSel(null)
    setFitSignal(n => n + 1)
    toast(cut
      ? `Drawing is very large; the first ${segs.toLocaleString()} lines were kept. Hide layers you don't need.`
      : `CAD drawing added (${segs.toLocaleString()} lines). Your clicks snap to its line ends. Use Move to line it up.`, { ms: 7000, tone: cut ? 'err' : undefined })
  }

  async function importFile(f) {
    if (/\.dwg$/i.test(f.name)) { toast('DWG files can\'t be read directly. In your CAD program use Save As → DXF, then import the DXF.', { tone: 'err', ms: 8000 }); return }
    setImporting(true)
    try {
      if (/\.dxf$/i.test(f.name)) { await importCad(f); return }
      if (f.type === 'application/pdf') {
        const r = await renderPdf(new Uint8Array(await f.arrayBuffer()), n => askPage(n))
        if (r) await placeBg(r.canvas, { ptScale: r.ptScale, page: r.page })
        return
      }
      const canvas = document.createElement('canvas')
      const MAX = 3500
      {
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
      await placeBg(canvas)
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

  // Writes the row; if the database has no site_id column yet (older setup), saves without it.
  const siteWarned = useRef(false)
  async function writeRow(query, fields) {
    let res = await query({ ...fields, site_id: fields.site_id })
    if (res.error && /site_id/.test(res.error.message)) {
      if (!siteWarned.current) { siteWarned.current = true; toast('Saved, but the site link needs sql/setup-layouts.sql run again in Supabase.', { tone: 'err', ms: 8000 }) }
      const { site_id: _drop, ...rest } = fields
      void _drop
      res = await query(rest)
    }
    return res
  }

  // Saves `data` over the open layout. Returns true when saved.
  async function saveOver(data = plan, { quiet } = {}) {
    const { data: row, error } = await supabase.from(TABLE).select(SELECT).eq('id', link.id).maybeSingle()
    if (error) throw error
    if (!row) { setLink(null); setNameDlg({ name: link.name, error: 'This layout was deleted from Xyte. Save it again under a name.' }); return false }
    if (row.updated_at !== link.updated_at &&
        !confirm(`${who(row.updater)} saved "${row.name}" at ${when(row.updated_at)}, after you opened it.\n\nSave yours over it? Their changes will be lost.`)) return false
    data = { ...data, name: row.name }
    const st = planStats(data)
    const size = await upload(link.id, data)
    const { data: saved, error: e2 } = await writeRow(f => supabase.from(TABLE).update(f).eq('id', link.id).select('updated_at').single(),
      { levels: st.levels, area_m2: st.area, size_bytes: size, updated_by: memberId, updated_at: new Date().toISOString(), site_id: data.site?.id || null })
    if (e2) throw e2
    cleanRef.current = data
    setHist(h => (h.present === data ? h : { ...h, present: data }))
    setLink({ id: link.id, name: row.name, updated_at: saved.updated_at, dirty: false })
    if (!quiet) toast(`Saved "${row.name}" to Xyte`)
    return true
  }

  async function save() {
    if (!link) { setNameDlg({ name: plan.name === 'Untitled layout' ? '' : plan.name, error: '' }); return }
    setBusy(true)
    try { await saveOver(plan) } catch (err) {
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
      const { data: row, error } = await writeRow(f => supabase.from(TABLE).insert(f).select('updated_at').single(), {
        id, name, file_path: `${id}.json`, levels: st.levels, area_m2: st.area, size_bytes: size, created_by: memberId, updated_by: memberId, site_id: data.site?.id || null,
      })
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
    if (!link && hasWork(plan) && !confirm('The layout you are drawing is not saved to Xyte. Open another one and drop it?')) return
    setBusy(true)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(row.file_path)
      if (error) throw error
      const p = migratePlan(JSON.parse(await data.text()))
      reset(p)
      setLink({ id: row.id, name: row.name, updated_at: row.updated_at, dirty: false })
      setListOpen(false)
      toast(`Opened "${row.name}"`)
    } catch (err) {
      toast(`Couldn't open "${row.name}": ${err.message}`, { tone: 'err', ms: 7000 })
    } finally { setBusy(false) }
  }

  // Opened from a site page (/layout?open=<id>)
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  useEffect(() => {
    if (!openId) return
    setParams(p => { p.delete('open'); return p }, { replace: true })
    if (link?.id === openId) return
    supabase.from(TABLE).select(SELECT).eq('id', openId).maybeSingle().then(({ data }) => {
      if (data) open(data); else toast('That layout was not found.', { tone: 'err' })
    })
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps

  // scan points of every linked level among ids, for exports
  async function gatherScan(ids) {
    const scanBy = {}
    for (const l of plan.levels.filter(l => ids.includes(l.id) && l.scan && l.bg?.ptScale)) {
      scanBy[l.id] = l.id === level.id ? scanPts : (await fetchScanPoints(l.scan.id)).filter(p => p.page === l.scan.page)
    }
    return scanBy
  }
  const baseName = () => link?.name || plan.name || 'Layout'

  async function doPrint(opts, all) {
    setBusy(true)
    try {
      update(p => ({ ...p, titleBlock: { ...p.titleBlock, ...opts.tb }, print: { sheet: opts.sheet, scale: opts.scale, underlay: opts.underlay } }))
      const { downloadPdf } = await import('./layout/pdf')
      const sheets = await downloadPdf(plan, { ...opts, scanBy: await gatherScan(opts.levelIds) }, all ? `${baseName()} - all levels` : `${baseName()} - ${level.name}`)
      const over = sheets.filter(s => s.overflow)
      toast(over.length
        ? `PDF downloaded, but ${over.map(s => s.title.split(' - ')[0]).join(', ')} doesn't fit at 1:${over[0].scale} on ${opts.sheet}. Try a bigger sheet or "Fit the sheet".`
        : `PDF downloaded: ${sheets.length} sheet${sheets.length > 1 ? 's' : ''} (${[...new Set(sheets.map(s => `1:${s.scale}`))].join(', ')}).`, { tone: over.length ? 'err' : undefined, ms: 7000 })
      setOutput(null)
    } catch (err) { toast(`Couldn't make the PDF: ${err.message}`, { tone: 'err', ms: 7000 }) } finally { setBusy(false) }
  }

  async function doExcel() {
    setBusy(true)
    try {
      const { downloadExcel } = await import('./layout/excel')
      await downloadExcel(plan, `${baseName()} - schedule`, await gatherScan(plan.levels.map(l => l.id)))
      toast('Excel schedule downloaded.')
    } catch (err) { toast(`Couldn't make the Excel file: ${err.message}`, { tone: 'err', ms: 7000 }) } finally { setBusy(false) }
  }

  // Issue a revision: save, and keep a copy of the layout as it is now.
  async function issueRev({ rev, note }) {
    setBusy(true)
    try {
      const entry = { rev, note, date: new Date().toISOString(), by: firstName || 'someone' }
      const data = { ...plan, revisions: [...(plan.revisions || []), entry], titleBlock: { ...plan.titleBlock, rev } }
      if (!(await saveOver(data, { quiet: true }))) return
      const body = new Blob([JSON.stringify({ ...data, name: link.name })], { type: 'application/json' })
      const { error } = await supabase.storage.from(BUCKET).upload(`revisions/${link.id}/${rev}.json`, body, { upsert: true, contentType: 'application/json' })
      if (error) throw error
      toast(`Rev ${rev} issued and saved.`)
      setOutput(null)
    } catch (err) { toast(`Couldn't issue the revision: ${err.message}`, { tone: 'err', ms: 7000 }) } finally { setBusy(false) }
  }

  async function openRev(r) {
    if (link?.dirty && !confirm(`Your changes to "${link.name}" are not saved. Open Rev ${r.rev} as a copy anyway?`)) return
    setBusy(true)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(`revisions/${link.id}/${r.rev}.json`)
      if (error) throw error
      const p = migratePlan(JSON.parse(await data.text()))
      reset({ ...p, name: `${link.name} (Rev ${r.rev})` })
      setLink(null)
      setOutput(null)
      toast(`Opened Rev ${r.rev} as a copy. Save it under a new name to keep it, or open the current layout from Layouts.`, { ms: 8000 })
    } catch (err) { toast(`Couldn't open Rev ${r.rev}: ${err.message}`, { tone: 'err', ms: 7000 }) } finally { setBusy(false) }
  }

  async function pickSite(site) {
    update(p => ({ ...p, site: site || undefined }))
    setOutput(null)
    toast(site ? `Linked to ${site.name}. Save to keep it.` : 'Site link removed. Save to keep it.')
  }

  function startNew() {
    const unsaved = link ? link.dirty : hasWork(plan)
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
          {plan.titleBlock?.rev && <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', background: '#e2e8f0', borderRadius: '5px', padding: '1px 6px' }}>Rev {plan.titleBlock.rev}</span>}
          <span style={{ fontSize: '12px', color: link?.dirty ? '#b45309' : '#64748b', whiteSpace: 'nowrap' }}>{status}</span>
          <button onClick={() => setOutput('site')} title={plan.site ? 'Linked site (click to change)' : 'Link this layout to a site'}
            style={{ ...S.chip, ...(plan.site ? null : { color: '#64748b', borderStyle: 'dashed' }) }}>
            <MapPin size={12} /> {plan.site ? plan.site.name : 'Link to site'}
          </button>
        </div>
        <button style={S.btn} onClick={startNew} disabled={busy}><FilePlus2 size={14} /> New</button>
        <button style={S.btn} onClick={() => setListOpen(true)} disabled={busy}><FolderOpen size={14} /> Layouts</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={save} disabled={busy}><Save size={14} /> {busy ? 'Saving…' : 'Save'}</button>
        {link && <button style={S.btn} onClick={() => setNameDlg({ name: `${link.name} (copy)`, error: '' })} disabled={busy}>Save as new</button>}
        <button style={S.btn} onClick={() => setOutput('revs')} disabled={busy} title="Issue a revision, or open an earlier one"><History size={14} /> Revisions</button>
        <span style={{ position: 'relative' }}>
          <button style={S.btn} onClick={() => setOutput(o => (o === 'menu' ? null : 'menu'))} aria-haspopup="menu" aria-expanded={output === 'menu'}><Download size={14} /> Export ▾</button>
          {output === 'menu' && <ExportMenu onClose={() => setOutput(null)} onPrint={() => setOutput('print')} onSchedule={() => setOutput('schedule')} onCad={() => setExportOpen(true)} />}
        </span>
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
        {/* cross-sections: draw a new one, or open one already drawn */}
        <button style={{ ...S.btn, ...(tool === 'section' ? { background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8' } : null) }}
          onClick={() => { setMode('2d'); setSel(null); setTool('section') }} title="Draw a cross-section line (X)">
          <Slice size={14} /> New section
        </button>
        {(plan.sections || []).length > 0 && (
          <select value="" onChange={e => e.target.value && setSectionId(e.target.value)} style={S.select} aria-label="View a section">
            <option value="">View section…</option>
            {plan.sections.map(s => <option key={s.id} value={s.id}>Section {s.name}–{s.name}</option>)}
          </select>
        )}
        {mode === '2d' && <button style={S.btn} onClick={() => setFitSignal(n => n + 1)} title="Zoom to fit"><Maximize size={14} /> Fit</button>}
        <div style={S.seg} role="group" aria-label="View">
          <button style={{ ...S.segBtn, ...(mode === '2d' ? S.segOn : null) }} aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>2D</button>
          <button style={{ ...S.segBtn, ...(mode === '3d' ? S.segOn : null) }} aria-pressed={mode === '3d'} onClick={() => { setMode('3d'); setTool('select') }}>
            <Box size={14} /> 3D
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* tools */}
        {mode === '2d' && <div style={S.rail}>
          {TOOLS.map(t => (
            <div key={t.id} style={{ display: 'contents' }}>
              {GROUPS[t.id] && <div style={S.group}>{GROUPS[t.id]}</div>}
              <button onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={tool === t.id}
                style={{ ...S.tool, ...(tool === t.id ? S.toolOn : null) }}>
                <t.Icon size={16} />
                <span style={{ fontSize: '9.5px', lineHeight: 1.1 }}>{t.label}</span>
              </button>
            </div>
          ))}
        </div>}

        {/* canvas */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {mode === '2d' ? (
            <>
              <Canvas2D plan={plan} tool={tool} setTool={setTool} sel={sel} setSel={setSel} update={update} undo={undo} redo={redo}
                fitSignal={fitSignal} ask={ask} onGridAt={setGridAt} scanPts={level.scan?.show === false ? [] : scanPts} />
              {hint && <div style={S.hint}>{hint}</div>}
            </>
          ) : (
            <Suspense fallback={<div style={{ ...S.hint, top: '10px', bottom: 'auto' }}>Loading 3D…</div>}>
              <View3D plan={plan} />
            </Suspense>
          )}
        </div>

        {/* properties */}
        <div style={S.side}>
          <Inspector plan={plan} sel={sel} setSel={setSel} update={update} tool={tool} setTool={setTool} onImport={importFile} importing={importing}
            scanPts={scanPts} scanError={scan.error} onLinkScan={() => setScanPick(true)} onViewSection={sc => setSectionId(sc.id)} layoutId={link?.id} />
        </div>
      </div>

      {gridAt && <GridDialog plan={plan} onClose={() => setGridAt(null)} onCreate={opts => {
        const g = { id: uid(), type: 'grid', x: gridAt.x, y: gridAt.y, xs: opts.xs, ys: opts.ys, xl: opts.xl, yl: opts.yl, ...(opts.rot ? { rot: opts.rot } : null) }
        update(p => updateItems(
          { ...p, grids: [...(p.grids || []), g], beamWidth: opts.beam.w, beamDepth: opts.beam.d },
          list => [...list, ...gridMembers(g, list, { ...opts, slab: level.slab, height: level.wallHeight })],
        ))
        setGridAt(null)
        setTool('select')
        setSel(g.id)
        setFitSignal(n => n + 1)
      }} />}
      {exportOpen && <ExportDialog plan={plan} levelId={level.id} onClose={() => setExportOpen(false)} onExport={async (ids, all) => {
        const base = baseName()
        try {
          // scan points of every linked level go on their own layer
          downloadDxf(plan, ids, all ? `${base} - all levels` : `${base} - ${level.name}`, await gatherScan(ids))
          toast('DXF downloaded. Open it in AutoCAD or any CAD program.')
          setExportOpen(false)
        } catch (err) { toast(`Couldn't export: ${err.message}`, { tone: 'err', ms: 7000 }) }
      }} />}
      {scanPick && <ScanProjectPicker onPick={linkScan} onClose={() => setScanPick(false)} />}
      {output === 'print' && <PrintDialog plan={plan} levelId={level.id} busy={busy} defaults={{ drawnBy: firstName || '' }} onPrint={doPrint} onClose={() => setOutput(null)} />}
      {output === 'schedule' && <ScheduleDialog plan={plan} busy={busy} onExcel={doExcel} onClose={() => setOutput(null)} />}
      {output === 'revs' && <RevisionsDialog plan={plan} link={link} busy={busy} onIssue={issueRev} onOpenRev={openRev} onClose={() => setOutput(null)} />}
      {output === 'site' && <SitePicker current={plan.site} onPick={pickSite} onClose={() => setOutput(null)} />}
      {sectionShown && (
        <Suspense fallback={null}>
          <SectionView plan={plan} sec={sectionShown} onClose={() => setSectionId(null)} />
        </Suspense>
      )}
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
  primary: { background: '#2563eb', border: '1px solid #2563eb', color: '#fff' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: 600, borderRadius: '999px',
    border: '1px solid #cbd5e1', background: '#fff', color: '#1d4ed8', cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' },
  iconBtn: { display: 'inline-flex', padding: '6px', background: 'transparent', border: 0, color: '#334155', cursor: 'pointer', borderRadius: '6px' },
  sep: { width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' },
  select: { padding: '5px 8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '7px', background: '#fff', color: '#0f172a' },
  seg: { display: 'inline-flex', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' },
  segBtn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 14px', fontSize: '13px', fontWeight: 700, border: 0, background: 'transparent', color: '#475569', cursor: 'pointer' },
  segOn: { background: '#2563eb', color: '#fff' },
  rail: { width: '64px', flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 4px', overflowY: 'auto' },
  group: { fontSize: '8.5px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#94a3b8', textAlign: 'center', padding: '5px 0 1px', borderTop: '1px solid #e2e8f0', marginTop: '2px' },
  tool: { display: 'grid', justifyItems: 'center', gap: '1px', padding: '4px 2px', border: '1px solid transparent', flexShrink: 0, borderRadius: '8px', background: 'transparent', color: '#475569', cursor: 'pointer' },
  toolOn: { background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8' },
  side: { width: '270px', flexShrink: 0, borderLeft: '1px solid #e2e8f0', background: '#fff', overflowY: 'auto' },
  hint: { position: 'absolute', left: '10px', bottom: '10px', maxWidth: 'calc(100% - 20px)', padding: '6px 10px', fontSize: '12.5px', color: '#334155',
    background: 'rgba(255,255,255,.92)', border: '1px solid #e2e8f0', borderRadius: '8px', pointerEvents: 'none' },
}
