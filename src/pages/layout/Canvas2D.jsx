import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  activeLevel, updateItems, updateLevel, removeItem, uid, dist, same, round, snapPoints, projectOnSeg,
  wallCorners, wallAxes, onWall, clampOpening, centroid, polyArea, moveItem, cloneItems, bounds, fmtMm, fmtArea,
  syncGrid, findNode, gridNode, gridLabels, setGrid, removeGrid, moveLine, gridAxis, columnCorners, beamCorners, beamAxis, nextLabel,
  pointInPoly, itemPoints, pileLayout,
} from './geometry'
import { markOf } from './rebar'
import { SCAN_STATUS, scanToPlan } from './scan'
import { cadSnapPoints } from './cad'
import { loadKN, level3, footingSide } from './loads'

const STRUCT = new Set(['column', 'beam', 'slab', 'wall', 'footing'])
const DRAW_TOOLS = new Set(['wall', 'room', 'slab', 'void', 'dim', 'beam', 'section', 'calibrate'])
const POLY_TOOLS = new Set(['room', 'slab', 'void'])
const OPENING = {
  door: { width: 900, height: 2100, sill: 0 },
  window: { width: 1200, height: 1200, sill: 900 },
}
const C = {
  paper: '#f8fafc', gridMinor: '#e2e8f0', gridMajor: '#cbd5e1', wall: '#475569', wallEdge: '#0f172a',
  sel: '#2563eb', rc: '#0f172a', room: 'rgba(37,99,235,0.06)', roomEdge: '#93c5fd', text: '#0f172a', muted: '#64748b', draft: '#2563eb',
}

const isTyping = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable

export default function Canvas2D({ plan, tool, setTool, sel, setSel, picked = [], setPicked, update, undo, redo, fitSignal, ask, onGridAt, onLoadAt, td, scanPts = [] }) {
  const svgRef = useRef(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState({ ox: -1000, oy: -1000, z: 0.05 })   // screen = (world - o) * z
  const [draft, setDraft] = useState(null)       // { pts: [p] } while drawing walls / rooms / dims / calibration
  const [cursor, setCursor] = useState(null)     // snapped world point under the pointer
  const [typed, setTyped] = useState('')         // length typed while drawing
  const drag = useRef(null)
  const [box, setBox] = useState(null)           // { a, b } while Ctrl+dragging a selection box
  const spaceDown = useRef(false)
  const shiftDown = useRef(false)

  const level = activeLevel(plan)
  const items = level.items
  const grids = useMemo(() => plan.grids || [], [plan.grids])
  const below = useMemo(() => {
    const lower = plan.levels.filter(l => l.elevation < level.elevation).sort((a, b) => b.elevation - a.elevation)
    return lower[0] || null
  }, [plan.levels, level.elevation])
  const thickness = plan.wallThickness || 200

  // ── selection: one item (sel) or several (picked) ────────
  const pickedSet = useMemo(() => new Set(picked.length ? picked : sel && items.some(i => i.id === sel) ? [sel] : []), [picked, sel, items])
  const isOn = id => id === sel || pickedSet.has(id)
  const choose = useCallback(ids => {
    const arr = [...new Set(ids)].filter(id => items.some(i => i.id === id))
    if (!arr.length) setSel(null)
    else if (arr.length === 1) setSel(arr[0])
    else setPicked(arr)
  }, [items, setSel, setPicked])
  const togglePick = useCallback(id => {
    const cur = new Set(pickedSet)
    if (cur.has(id)) cur.delete(id); else cur.add(id)
    choose([...cur])
  }, [pickedSet, choose])

  // ── size and view ────────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const el = svgRef.current
    if (!el) return
    const w = el.clientWidth || 800, h = el.clientHeight || 600
    const b = bounds(level, grids) || { x0: 0, y0: 0, x1: 20000, y1: 12000 }
    const bw = Math.max(b.x1 - b.x0, 2000), bh = Math.max(b.y1 - b.y0, 2000)
    const z = Math.min(w / bw, h / bh) * 0.85
    setView({ z, ox: (b.x0 + b.x1) / 2 - w / 2 / z, oy: (b.y0 + b.y1) / 2 - h / 2 / z })
  }, [level, grids])

  const fitRef = useRef(fit)
  useLayoutEffect(() => { fitRef.current = fit }, [fit])
  useEffect(() => { fitRef.current() }, [fitSignal])

  useEffect(() => {
    const el = svgRef.current
    function onWheel(e) {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const sx = e.clientX - r.left, sy = e.clientY - r.top
      setView(v => {
        const z = Math.min(5, Math.max(0.002, v.z * Math.pow(1.0015, -e.deltaY)))
        const wx = sx / v.z + v.ox, wy = sy / v.z + v.oy
        return { z, ox: wx - sx / z, oy: wy - sy / z }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const toWorld = useCallback(e => {
    const r = svgRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / view.z + view.ox, y: (e.clientY - r.top) / view.z + view.oy }
  }, [view])

  // ── snapping ─────────────────────────────────────────────
  const cadPts = useMemo(() => cadSnapPoints(level.cad), [level.cad])
  const pts = useMemo(() => [...snapPoints(items, grids), ...cadPts], [items, grids, cadPts])
  // the client's CAD drawing, one path per visible layer
  const cadPaths = useMemo(() => {
    const cad = level.cad
    if (!cad?.show) return []
    const hidden = new Set(cad.hidden || [])
    return cad.layers.filter(l => !hidden.has(l.name)).map(l => {
      let d = ''
      for (let i = 0; i < l.segs.length; i += 4) d += `M${l.segs[i]} ${l.segs[i + 1]}L${l.segs[i + 2]} ${l.segs[i + 3]}`
      return { name: l.name, d }
    })
  }, [level.cad])

  const snap = useCallback((p, from, { exclude, extra = [] } = {}) => {
    const tol = 10 / view.z
    let best = null, bd = tol
    for (const q of [...pts, ...extra]) {
      if (exclude && same(q, exclude)) continue
      const d = dist(p, q)
      if (d < bd) { bd = d; best = q }
    }
    if (best) return { x: best.x, y: best.y, snapped: true }
    const r = { x: p.x, y: p.y }
    let lockX = false, lockY = false
    if (from) {
      if (shiftDown.current) {
        if (Math.abs(p.x - from.x) > Math.abs(p.y - from.y)) { r.y = from.y; lockY = true } else { r.x = from.x; lockX = true }
      } else if (Math.abs(p.y - from.y) < tol) { r.y = from.y; lockY = true }
      else if (Math.abs(p.x - from.x) < tol) { r.x = from.x; lockX = true }
    }
    if (plan.snap) {
      if (!lockX) r.x = round(r.x, plan.grid)
      if (!lockY) r.y = round(r.y, plan.grid)
    }
    return r
  }, [pts, view.z, plan.snap, plan.grid])

  // ── creating things ──────────────────────────────────────
  const add = useCallback((...news) => update(p => updateItems(p, list => [...list, ...news])), [update])

  const finishDraft = useCallback(() => { setDraft(null); setTyped('') }, [])

  const placePoint = useCallback(async p => {
    const last = draft?.pts[draft.pts.length - 1]
    if (tool === 'wall') {
      if (!draft) { setDraft({ pts: [p] }); return }
      if (same(p, last)) { finishDraft(); return }
      add({ id: uid(), type: 'wall', a: last, b: p, thickness, height: level.wallHeight })
      if (draft.pts.length > 1 && same(p, draft.pts[0])) finishDraft()
      else setDraft({ pts: [...draft.pts, p] })
      setTyped('')
    } else if (POLY_TOOLS.has(tool)) {
      if (!draft) { setDraft({ pts: [p] }); return }
      const closing = (draft.pts.length >= 3 && same(p, draft.pts[0], 1)) || same(p, last)
      if (closing) {
        if (draft.pts.length >= 3) {
          const id = uid()
          const n = items.filter(i => i.type === 'room').length + 1
          add(tool === 'room' ? { id, type: 'room', pts: draft.pts, name: `Room ${n}`, slab: level.slab }
            : tool === 'void' ? { id, type: 'void', pts: draft.pts, name: 'Opening' }
            : { id, type: 'slab', pts: draft.pts, thickness: level.slab })
          setSel(id)
        }
        finishDraft()
        return
      }
      setDraft({ pts: [...draft.pts, p] })
    } else if (tool === 'section') {
      if (!draft) { setDraft({ pts: [p] }); return }
      finishDraft()
      if (dist(last, p) < 500) return
      // next free letter: A, B, C…
      const used = new Set((plan.sections || []).map(x => x.name))
      let name = 'A'
      while (used.has(name)) name = nextLabel(name)
      const id = uid()
      update(pl => ({ ...pl, sections: [...(pl.sections || []), { id, name, a: last, b: p }] }))
      setSel(id)
    } else if (tool === 'dim') {
      if (!draft) { setDraft({ pts: [p] }); return }
      if (!same(p, last)) add({ id: uid(), type: 'dim', a: last, b: p })
      finishDraft()
    } else if (tool === 'beam') {
      if (!draft) { setDraft({ pts: [p] }); return }
      if (same(p, last)) { finishDraft(); return }
      add({ id: uid(), type: 'beam', a: last, b: p, width: plan.beamWidth || 300, depth: plan.beamDepth || 600,
        ga: findNode(grids, last), gb: findNode(grids, p) })
      setDraft({ pts: [p] })
      setTyped('')
    } else if (tool === 'calibrate') {
      if (!draft) { setDraft({ pts: [p] }); return }
      const a = draft.pts[0], measured = dist(a, p)
      finishDraft()
      if (measured < 1) return
      const ans = await ask({ title: 'Set drawing scale', label: 'Real distance between the two points (mm)', value: '', placeholder: 'e.g. 6000', numeric: true })
      const real = parseFloat(ans)
      if (!(real > 0)) return
      const k = real / measured
      update(pl => updateLevel(pl, level.id, l => l.bg ? ({
        ...l, bg: { ...l.bg, mmPerPx: l.bg.mmPerPx * k, x: a.x - (a.x - l.bg.x) * k, y: a.y - (a.y - l.bg.y) * k },
      }) : l))
      setTool('select')
      setTimeout(() => fitRef.current(), 0)
    }
  }, [tool, draft, add, thickness, level, items, grids, plan.sections, setSel, finishDraft, ask, update, setTool, plan.beamWidth, plan.beamDepth])

  // Typed length: the next point goes that far from the last one, towards the pointer.
  const applyTyped = useCallback(() => {
    const len = parseFloat(typed)
    const last = draft?.pts[draft.pts.length - 1]
    if (!(len > 0) || !last) return
    const c = cursor || { x: last.x + 1, y: last.y }
    const d = dist(last, c) || 1
    const dx = d > 0.001 ? (c.x - last.x) / d : 1, dy = d > 0.001 ? (c.y - last.y) / d : 0
    placePoint({ x: Math.round(last.x + dx * len), y: Math.round(last.y + dy * len) })
  }, [typed, draft, cursor, placePoint])

  // ── keyboard ─────────────────────────────────────────────
  useEffect(() => {
    function down(e) {
      if (e.key === 'Shift') shiftDown.current = true
      if (isTyping(e)) return
      if (e.key === ' ') { spaceDown.current = true; e.preventDefault(); return }
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (mod && e.key.toLowerCase() === 'a' && tool === 'select') {
        e.preventDefault()
        choose(items.filter(i => i.type !== 'opening').map(i => i.id))
        return
      }
      if (mod && e.key.toLowerCase() === 'd' && pickedSet.size) {
        e.preventDefault()
        const copies = items.filter(i => pickedSet.has(i.id)).flatMap(it => cloneItems(it, items, 500, 500))
        if (copies.length) { add(...copies); choose(copies.filter(c => c.type !== 'opening').map(c => c.id)) }
        return
      }
      if (draft && (DRAW_TOOLS.has(tool))) {
        if (/^[0-9.]$/.test(e.key)) { setTyped(t => t + e.key); e.preventDefault(); return }
        if (e.key === 'Backspace' && typed) { setTyped(t => t.slice(0, -1)); e.preventDefault(); return }
        if (e.key === 'Enter') {
          e.preventDefault()
          if (typed) applyTyped()
          else if (POLY_TOOLS.has(tool) && draft.pts.length >= 3) placePoint(draft.pts[draft.pts.length - 1])
          else finishDraft()
          return
        }
      }
      if (e.key === 'Escape') {
        if (draft) finishDraft()
        else if (sel || picked.length) setSel(null)
        else setTool('select')
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && picked.length > 1) {
        e.preventDefault()
        const ids = new Set(picked)
        update(p => updateItems(p, list => syncGrid(list.filter(i => !ids.has(i.id) && !ids.has(i.wallId)), p.grids)))
        setSel(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        if (sel.startsWith('scan:')) return     // scan points are changed in Scan Marker
        if ((plan.sections || []).some(x => x.id === sel)) {
          update(p => ({ ...p, sections: p.sections.filter(x => x.id !== sel) }))
        } else if (grids.some(g => g.id === sel)) {
          if (!confirm('Delete this grid? Its columns, beams and slabs stay where they are.')) return
          update(p => removeGrid(p, sel))
        } else update(p => updateItems(p, list => syncGrid(removeItem(list, sel), p.grids)))
        setSel(null)
        return
      }
      if (mod || e.altKey) return
      const keys = { v: 'select', h: 'pan', w: 'wall', r: 'room', s: 'slab', o: 'void', x: 'section', c: 'column', f: 'footing', d: 'door', n: 'window', m: 'dim', t: 'label', b: 'beam', g: 'grid', p: 'note', l: 'load' }
      const k = keys[e.key.toLowerCase()]
      if (k) { setTool(k); finishDraft() }
    }
    function up(e) {
      if (e.key === 'Shift') shiftDown.current = false
      if (e.key === ' ') spaceDown.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [draft, tool, typed, sel, picked, pickedSet, choose, items, grids, plan.sections, add, undo, redo, update, setSel, setTool, finishDraft, placePoint, applyTyped])

  // Changing tool or level drops a half-drawn shape.
  const draftKey = `${tool}|${level.id}`
  const [draftFor, setDraftFor] = useState(draftKey)
  if (draftFor !== draftKey) { setDraftFor(draftKey); setDraft(null); setTyped('') }

  // ── pointer ──────────────────────────────────────────────
  function nearestWall(p) {
    let best = null
    for (const w of items) {
      if (w.type !== 'wall') continue
      const pr = projectOnSeg(p, w.a, w.b)
      const reach = Math.max(w.thickness / 2 + 4 / view.z, 12 / view.z)
      if (pr.d <= reach && (!best || pr.d < best.d)) best = { wall: w, ...pr }
    }
    return best
  }

  function onPointerDown(e) {
    const svg = svgRef.current
    svg.setPointerCapture(e.pointerId)
    shiftDown.current = e.shiftKey
    const raw = toWorld(e)
    const mod = e.ctrlKey || e.metaKey
    // Ctrl + right-click adds / removes an item from the selection
    if (e.button === 2 && mod && !draft) {
      const hit = e.target.closest('[data-id]')
      if (hit && items.some(i => i.id === hit.dataset.id)) { togglePick(hit.dataset.id); return }
    }
    if (e.button === 1 || e.button === 2 || spaceDown.current || tool === 'pan') {
      if (e.button === 2 && draft) { finishDraft(); return }
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view }
      return
    }
    if (e.button !== 0) return

    if (tool === 'select') {
      // Ctrl / Shift + click adds or removes; on empty space it drags a selection box
      if (mod || e.shiftKey) {
        const hit = e.target.closest('[data-id]')
        if (hit && items.some(i => i.id === hit.dataset.id)) { togglePick(hit.dataset.id); return }
        if (!hit && !e.target.closest('[data-gline]')) { drag.current = { kind: 'box', a: raw, base: [...pickedSet] }; setBox({ a: raw, b: raw }); return }
      }
      // dragging a gridline (or its bubble) moves just that line
      const gl = e.target.closest('[data-gline]')
      if (gl) {
        const [gid, axis, k] = gl.dataset.gline.split(':')
        const g = grids.find(x => x.id === gid)
        if (g) {
          setSel(gid)
          drag.current = { kind: 'gline', gid, axis, k: +k, start: raw, origGrid: g, pushed: false }
          return
        }
      }
      const h = e.target.closest('[data-handle]')
      if (h && sel) {
        const it = items.find(i => i.id === sel)
        const key = h.dataset.handle
        const origPt = key === 'a' || key === 'b' ? it[key] : it.pts[+key]
        drag.current = { kind: 'handle', id: sel, key, origPt, orig: items, pushed: false }
        return
      }
      const hit = e.target.closest('[data-id]')
      if (hit) {
        const id = hit.dataset.id
        // dragging one of several selected moves them all
        if (pickedSet.size > 1 && pickedSet.has(id)) {
          drag.current = { kind: 'move', id, ids: new Set(pickedSet), start: raw, orig: items, pushed: false }
          return
        }
        setSel(id)
        if (!items.some(i => i.id === id)) return      // scan points and sections are not dragged
        const it = items.find(i => i.id === id)
        drag.current = it?.type === 'opening'
          ? { kind: 'opening', id, orig: items, pushed: false }
          : { kind: 'move', id, start: raw, orig: items, pushed: false }
        return
      }
      setSel(null)
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view }
      return
    }

    if (tool === 'movebg') {
      if (level.bg) drag.current = { kind: 'bg', start: raw, orig: level.bg, pushed: false }
      return
    }
    if (tool === 'movecad') {
      if (level.cad) drag.current = { kind: 'cad', start: raw, orig: level.cad, pushed: false }
      return
    }

    const last = draft?.pts[draft.pts.length - 1]
    const p = snap(raw, last, { extra: draft?.pts || [] })

    if (DRAW_TOOLS.has(tool)) { placePoint(tool === 'calibrate' ? raw : p); return }

    if (tool === 'grid') { onGridAt(p); return }
    if (tool === 'load') { onLoadAt(p); return }
    if (tool === 'column') {
      const id = uid()
      add({ id, type: 'column', shape: 'rect', x: p.x, y: p.y, w: 400, d: 400, height: level.wallHeight })
      return
    }
    if (tool === 'footing') {
      // on a column: centred under it (and on its grid point); sized for its load when loads are on
      const col = items.find(c => c.type === 'column' && (c.shape === 'round' ? dist(c, raw) <= c.w / 2 : pointInPoly(raw, columnCorners(c))))
      const at = col || p
      const base = { h: 500, top: 1000 }
      const N = col && td?.cols[col.id]?.NSLS
      const side = (N && footingSide(N, base, td.set)) || 1500
      const id = uid()
      const grid = col ? col.grid : findNode(grids, p)
      add({
        id, type: 'footing', kind: 'pad', x: at.x, y: at.y, w: Math.max(side, 600), d: Math.max(side, 600), ...base,
        ...(col?.rot ? { rot: col.rot } : null),
        ...(grid ? { grid, ex: col?.ex, ey: col?.ey } : null),
      })
      setSel(id)
      return
    }
    if (tool === 'door' || tool === 'window') {
      const hit = nearestWall(raw)
      if (!hit) { setCursor({ ...raw, miss: true }); return }
      const len = dist(hit.wall.a, hit.wall.b)
      const o = clampOpening({
        id: uid(), type: 'opening', kind: tool, wallId: hit.wall.id, offset: round(hit.t * len, 50),
        ...OPENING[tool], flip: false, side: 1,
      }, hit.wall)
      add(o)
      setSel(o.id)
      return
    }
    if (tool === 'note') {
      ask({ title: 'Site note', label: 'Note (you can add photos after)', value: '', placeholder: 'e.g. Crack at beam soffit, 2 m from B/3' }).then(text => {
        if (text == null) return
        const id = uid()
        add({ id, type: 'note', x: p.x, y: p.y, text: text.trim(), photos: [] })
        setSel(id)
        setTool('select')
      })
      return
    }
    if (tool === 'label') {
      ask({ title: 'Add label', label: 'Text', value: '', placeholder: 'e.g. LIFT LOBBY' }).then(text => {
        if (!text?.trim()) return
        const id = uid()
        add({ id, type: 'label', x: p.x, y: p.y, text: text.trim(), size: 300 })
        setSel(id)
      })
    }
  }

  function onPointerMove(e) {
    shiftDown.current = e.shiftKey
    const d = drag.current
    const raw = toWorld(e)
    if (!d) {
      if (tool === 'calibrate') setCursor(raw)
      else if (tool !== 'select' && tool !== 'pan' && tool !== 'movebg' && tool !== 'movecad') {
        const last = draft?.pts[draft.pts.length - 1]
        setCursor(snap(raw, last, { extra: draft?.pts || [] }))
      } else if (cursor) setCursor(null)
      return
    }
    if (d.kind === 'pan') {
      setView({ ...d.view, ox: d.view.ox - (e.clientX - d.sx) / d.view.z, oy: d.view.oy - (e.clientY - d.sy) / d.view.z })
      return
    }
    if (d.kind === 'box') { setBox({ a: d.a, b: raw }); return }
    const push = !d.pushed
    if (d.kind === 'gline') {
      // distance moved along the grid's own direction (grids can be turned);
      // the line catches on drawing points (e.g. a gridline in the client's CAD) near the pointer
      const u = gridAxis(d.origGrid, d.axis)
      const tol = 10 / view.z
      let hitPt = null, bd = tol
      for (const q of cadPts) { const dq = dist(raw, q); if (dq < bd) { bd = dq; hitPt = q } }
      const base = (raw.x - d.start.x) * u.x + (raw.y - d.start.y) * u.y
      const on = d.axis === 'x' ? gridNode(d.origGrid, d.k, 0) : gridNode(d.origGrid, 0, d.k)   // a point on the line before the drag
      const dd = hitPt ? Math.round((hitPt.x - on.x) * u.x + (hitPt.y - on.y) * u.y)
        : plan.snap ? round(base, Math.min(plan.grid, 50)) : Math.round(base)
      if (!dd && !d.pushed) return
      update(pl => setGrid(pl, d.gid, () => moveLine(d.origGrid, d.axis, d.k, dd)), push)
      d.pushed = true
    } else if (d.kind === 'move') {
      let dx = raw.x - d.start.x, dy = raw.y - d.start.y
      if (plan.snap) { dx = round(dx, plan.grid); dy = round(dy, plan.grid) }
      if (!dx && !dy && !d.pushed) return
      const it = d.orig.find(i => i.id === d.id)
      const ends = it.type === 'wall' && !d.ids ? [it.a, it.b] : []
      update(p => updateItems(p, () => syncGrid(d.orig.map(i => {
        if (d.ids ? d.ids.has(i.id) : i.id === d.id) return moveItem(i, dx, dy)
        if (i.type === 'wall' && ends.length) {
          const mv = q => (ends.some(e2 => same(e2, q)) ? { x: q.x + dx, y: q.y + dy } : q)
          const a = mv(i.a), b = mv(i.b)
          return a !== i.a || b !== i.b ? { ...i, a, b } : i
        }
        return i
      }), p.grids)), push)
      d.pushed = true
    } else if (d.kind === 'handle') {
      const it = d.orig.find(i => i.id === d.id)
      const other = it.pts
        ? it.pts[(+d.key + it.pts.length - 1) % it.pts.length]
        : d.key === 'a' ? it.b : it.a
      const p = snap(raw, other, { exclude: d.origPt })
      update(pl => updateItems(pl, () => d.orig.map(i => {
        if (i.id === d.id) {
          // reshaping a grid-bay slab by hand unlinks it from the bay
          if (i.pts) return { ...i, pts: i.pts.map((q, k) => (k === +d.key ? { x: p.x, y: p.y } : q)), ...(i.bay ? { bay: undefined } : null) }
          if (i.type === 'beam') return { ...i, [d.key]: { x: p.x, y: p.y }, [d.key === 'a' ? 'ga' : 'gb']: findNode(grids, p) }
          return { ...i, [d.key]: { x: p.x, y: p.y } }
        }
        if (it.type === 'wall' && i.type === 'wall') {
          const a = same(i.a, d.origPt) ? { x: p.x, y: p.y } : i.a
          const b = same(i.b, d.origPt) ? { x: p.x, y: p.y } : i.b
          return a !== i.a || b !== i.b ? { ...i, a, b } : i
        }
        return i
      })), push)
      d.pushed = true
    } else if (d.kind === 'opening') {
      const o = d.orig.find(i => i.id === d.id)
      const w = d.orig.find(i => i.id === o.wallId)
      if (!w) return
      const pr = projectOnSeg(raw, w.a, w.b)
      const offset = round(pr.t * dist(w.a, w.b), plan.snap ? 50 : 1)
      update(pl => updateItems(pl, () => d.orig.map(i => (i.id === d.id ? clampOpening({ ...i, offset }, w) : i))), push)
      d.pushed = true
    } else if (d.kind === 'bg') {
      const dx = raw.x - d.start.x, dy = raw.y - d.start.y
      update(pl => updateLevel(pl, level.id, l => ({ ...l, bg: { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy } })), push)
      d.pushed = true
    } else if (d.kind === 'cad') {
      const dx = Math.round(raw.x - d.start.x), dy = Math.round(raw.y - d.start.y)
      update(pl => updateLevel(pl, level.id, l => ({ ...l, cad: { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy } })), push)
      d.pushed = true
    }
  }

  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'box' && box) {
      // everything wholly inside the box joins the selection
      const x0 = Math.min(box.a.x, box.b.x), x1 = Math.max(box.a.x, box.b.x), y0 = Math.min(box.a.y, box.b.y), y1 = Math.max(box.a.y, box.b.y)
      const inside = items.filter(i => {
        if (i.type === 'opening') return false
        const ps = itemPoints(i, items)
        return ps.length && ps.every(q => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1)
      }).map(i => i.id)
      setBox(null)
      if (x1 - x0 > 1 || y1 - y0 > 1) choose([...d.base, ...inside])
    }
  }

  // ── drawing ──────────────────────────────────────────────
  const { z, ox, oy } = view
  const px = n => n / z      // screen pixels → mm at this zoom

  const grid = useMemo(() => {
    let step = plan.grid
    while (step * z < 8) step *= 10
    const major = step * 10
    const x0 = Math.floor(ox / step) * step, x1 = ox + size.w / z
    const y0 = Math.floor(oy / step) * step, y1 = oy + size.h / z
    let minor = '', maj = ''
    for (let x = x0; x <= x1; x += step) {
      const s = `M${x} ${oy}V${y1}`
      if (Math.abs(x / major - Math.round(x / major)) < 1e-6) maj += s; else minor += s
    }
    for (let y = y0; y <= y1; y += step) {
      const s = `M${ox} ${y}H${x1}`
      if (Math.abs(y / major - Math.round(y / major)) < 1e-6) maj += s; else minor += s
    }
    return { minor, maj }
  }, [plan.grid, z, ox, oy, size])

  const walls = items.filter(i => i.type === 'wall')
  const wallPolys = walls.map(w => {
    const joined = end => walls.some(o => o.id !== w.id && (same(o.a, end) || same(o.b, end)))
    const ext = w.thickness / 2
    return { w, pts: wallCorners(w, joined(w.a) ? ext : 0, joined(w.b) ? ext : 0) }
  })
  const poly = pts => pts.map(p => `${p.x},${p.y}`).join(' ')
  const selItem = items.find(i => i.id === sel)
  const last = draft?.pts[draft.pts.length - 1]
  const cursorStyle = tool === 'pan' || tool === 'movebg' || tool === 'movecad' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'

  return (
    <svg
      ref={svgRef}
      width="100%" height="100%"
      style={{ display: 'block', background: C.paper, cursor: cursorStyle, touchAction: 'none', userSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => !drag.current && setCursor(null)}
      onContextMenu={e => e.preventDefault()}
    >
      <defs>
        <pattern id="slabHatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform={`scale(${1 / z}) rotate(45)`}>
          <rect width="10" height="10" fill="rgba(100,116,139,.07)" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(100,116,139,.28)" strokeWidth="1" />
        </pattern>
      </defs>
      <g transform={`matrix(${z} 0 0 ${z} ${-ox * z} ${-oy * z})`}>
        <path d={grid.minor} stroke={C.gridMinor} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
        <path d={grid.maj} stroke={C.gridMajor} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />

        {level.bg?.show && (
          <image href={level.bg.src} x={level.bg.x} y={level.bg.y} width={level.bg.w * level.bg.mmPerPx} height={level.bg.h * level.bg.mmPerPx}
            opacity={level.bg.opacity} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />
        )}

        {cadPaths.length > 0 && (
          <g transform={`translate(${level.cad.x} ${level.cad.y})`} opacity={level.cad.opacity ?? 0.7} style={{ pointerEvents: 'none' }}>
            {cadPaths.map(l => <path key={l.name} d={l.d} stroke="#475569" strokeWidth={0.8} vectorEffect="non-scaling-stroke" fill="none" />)}
            {level.cad.texts.map((t, k) => (t.h * z >= 5 ? (
              <text key={k} x={t.x} y={t.y} fontSize={t.h} fill="#475569" transform={t.r ? `rotate(${t.r} ${t.x} ${t.y})` : undefined}>{t.s}</text>
            ) : null))}
          </g>
        )}

        {/* slabs: structural floor panels, under everything else */}
        {items.filter(i => i.type === 'slab').map(s => {
          const c = centroid(s.pts)
          const on = isOn(s.id)
          return (
            <g key={s.id} data-id={s.id}>
              <polygon points={poly(s.pts)} fill={on ? 'rgba(37,99,235,.14)' : 'url(#slabHatch)'} stroke={on ? C.sel : '#94a3b8'}
                strokeWidth={on ? 2 : 1} vectorEffect="non-scaling-stroke" />
              {polyArea(s.pts) * z * z > 3000 && (
                <text x={c.x} y={c.y} fontSize={px(11)} textAnchor="middle" dominantBaseline="central" fill="#475569" fontWeight="600"
                  style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#f8fafc', strokeWidth: px(3) }}>{markOf(s, plan) ? `${markOf(s, plan)} · ` : 'S '}{s.thickness}{s.drop ? ` (−${s.drop})` : ''}</text>
              )}
            </g>
          )
        })}

        {/* voids: openings through the slab, shown with a cross */}
        {items.filter(i => i.type === 'void').map(o => {
          const on = isOn(o.id)
          const xs = o.pts.map(q => q.x), ys = o.pts.map(q => q.y)
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
          const c = centroid(o.pts)
          return (
            <g key={o.id} data-id={o.id}>
              <polygon points={poly(o.pts)} fill={on ? '#dbeafe' : '#fff'} stroke={on ? C.sel : '#0f172a'} strokeWidth={on ? 2 : 1.2} vectorEffect="non-scaling-stroke" />
              <clipPath id={`vc${o.id}`}><polygon points={poly(o.pts)} /></clipPath>
              <path d={`M${x0} ${y0}L${x1} ${y1}M${x1} ${y0}L${x0} ${y1}`} clipPath={`url(#vc${o.id})`} stroke={on ? C.sel : '#0f172a'} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              {polyArea(o.pts) * z * z > 2500 && (
                <text x={c.x} y={c.y} fontSize={px(10.5)} textAnchor="middle" dominantBaseline="central" fill="#0f172a" fontWeight="600"
                  style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#fff', strokeWidth: px(3) }}>{o.name}</text>
              )}
            </g>
          )
        })}

        {/* footings and pile caps: below the floor, dashed */}
        {items.filter(i => i.type === 'footing').map(f => {
          const on = isOn(f.id)
          const col = on ? C.sel : '#92400e'
          const mk = markOf(f, plan)
          const r = td?.foots[f.id]
          const tone = { ok: '#3F6B3A', near: '#8A6528', over: '#9A3B2A' }[level3(r?.util)]
          return (
            <g key={f.id} data-id={f.id}>
              <polygon points={poly(columnCorners(f))} fill={on ? 'rgba(37,99,235,.10)' : 'rgba(146,64,14,.05)'} stroke={col}
                strokeWidth={on ? 2 : 1.3} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />
              {f.kind === 'pile' && pileLayout(f).map((q, k) => (
                <circle key={k} cx={q.x} cy={q.y} r={(f.pileDia || 300) / 2} fill="none" stroke={col} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              ))}
              {Math.min(f.w, f.d) * z > 40 && (
                <text x={f.x} y={f.y + f.d / 2 - px(9)} fontSize={px(10)} textAnchor="middle" fill={tone || col} fontWeight="700"
                  style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#f8fafc', strokeWidth: px(3) }}>
                  {mk ? `${mk} · ` : ''}{f.w}×{f.d}{r?.util != null ? ` · ${Math.round(r.util * 100)}%` : ''}
                </text>
              )}
            </g>
          )
        })}

        {grids.map(g => <Grid key={g.id} g={g} px={px} selected={g.id === sel} />)}

        {below && below.items.filter(i => i.type === 'wall').map(w => (
          <polygon key={`b${w.id}`} points={poly(wallCorners(w))} fill="none" stroke="#94a3b8" strokeDasharray="4 3"
            strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        ))}
        {/* columns on the level below, to check they line up */}
        {below && below.items.filter(i => i.type === 'column').map(c => (
          c.shape === 'round'
            ? <circle key={`b${c.id}`} cx={c.x} cy={c.y} r={c.w / 2} fill="none" stroke="#94a3b8" strokeDasharray="3 2"
                strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
            : <polygon key={`b${c.id}`} points={poly(columnCorners(c))} fill="none" stroke="#94a3b8" strokeDasharray="3 2"
                strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        ))}

        {items.filter(i => i.type === 'room').map(r => {
          const c = centroid(r.pts)
          return (
            <g key={r.id} data-id={r.id}>
              <polygon points={poly(r.pts)} fill={C.room} stroke={isOn(r.id) ? C.sel : C.roomEdge}
                strokeWidth={isOn(r.id) ? 2 : 1} vectorEffect="non-scaling-stroke" />
              <text x={c.x} y={c.y} fontSize={px(13)} textAnchor="middle" fill={C.text} fontWeight="600" style={{ pointerEvents: 'none' }}>{r.name}</text>
              <text x={c.x} y={c.y + px(15)} fontSize={px(11)} textAnchor="middle" fill={C.muted} style={{ pointerEvents: 'none' }}>{fmtArea(polyArea(r.pts))}</text>
            </g>
          )
        })}

        {wallPolys.map(({ w, pts: p }) => (
          <polygon key={`o${w.id}`} points={poly(p)} fill={C.wall} stroke={C.wallEdge} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
        {wallPolys.map(({ w, pts: p }) => (
          <polygon key={w.id} data-id={w.id} points={poly(p)} fill={isOn(w.id) ? '#3b82f6' : w.kind === 'rc' ? C.rc : C.wall} />
        ))}

        {items.filter(i => i.type === 'opening').map(o => {
          const w = items.find(i => i.id === o.wallId)
          return w ? <Opening key={o.id} o={o} w={w} selected={isOn(o.id)} /> : null
        })}

        {items.filter(i => i.type === 'beam').map(b => <Beam key={b.id} b={b} px={px} selected={isOn(b.id)} mark={markOf(b, plan)} />)}

        {items.filter(i => i.type === 'column').map(c => (
          c.shape === 'round'
            ? <circle key={c.id} data-id={c.id} cx={c.x} cy={c.y} r={c.w / 2} fill={isOn(c.id) ? '#3b82f6' : '#334155'}
                stroke={C.wallEdge} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            : <polygon key={c.id} data-id={c.id} points={poly(columnCorners(c))} fill={isOn(c.id) ? '#3b82f6' : '#334155'}
                stroke={C.wallEdge} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
        {/* design type marks (C1, C2…) beside the columns */}
        {!td && items.filter(i => i.type === 'column' && i.design).map(c => {
          const mk = markOf(c, plan)
          return mk ? (
            <text key={`m${c.id}`} x={c.x + Math.max(c.w, c.d) / 2 + px(4)} y={c.y - Math.max(c.w, c.d) / 2 - px(3)} fontSize={px(10)} fill="#1e3a8a" fontWeight="800"
              style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#f8fafc', strokeWidth: px(3) }}>{mk}</text>
          ) : null
        })}

        {/* structure not yet measured on site, outlined in amber */}
        {plan.showUnverified && items.filter(i => STRUCT.has(i.type) && !i.verified).map(i => {
          const shape = i.type === 'column' || i.type === 'footing' ? (i.shape === 'round' ? null : columnCorners(i))
            : i.type === 'beam' ? beamCorners(i)
            : i.type === 'wall' ? wallCorners(i) : i.pts
          return shape
            ? <polygon key={`u${i.id}`} points={poly(shape)} fill="none" stroke="#f59e0b" strokeWidth={3} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
            : <circle key={`u${i.id}`} cx={i.x} cy={i.y} r={i.w / 2} fill="none" stroke="#f59e0b" strokeWidth={3} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        })}

        {items.filter(i => i.type === 'dim').map(d => <Dim key={d.id} d={d} px={px} selected={isOn(d.id)} />)}

        {/* equipment and debris on the slab */}
        {items.filter(i => i.type === 'load').map(ld => {
          const on = isOn(ld.id)
          const r = td?.loads[ld.id]
          const tone = { ok: '#3F6B3A', near: '#8A6528', over: '#9A3B2A' }[level3(r?.util ?? r?.vsDesign)] || '#8A6528'
          return (
            <g key={ld.id} data-id={ld.id} style={{ cursor: 'pointer' }}>
              <rect x={ld.x - ld.w / 2} y={ld.y - ld.d / 2} width={ld.w} height={ld.d} fill={on ? 'rgba(37,99,235,.18)' : 'rgba(217,119,6,.16)'}
                stroke={on ? C.sel : tone} strokeWidth={on ? 2 : 1.5} strokeDasharray={ld.kind === 'debris' ? '4 3' : undefined} vectorEffect="non-scaling-stroke" />
              <text x={ld.x} y={ld.y} fontSize={px(10.5)} textAnchor="middle" dominantBaseline="central" fill={on ? C.sel : tone} fontWeight="700"
                style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#fff', strokeWidth: px(3) }}>
                {ld.name} · {(loadKN(ld) / 9.81).toFixed(1)} t
              </text>
            </g>
          )
        })}

        {/* load takedown: design loads on beams and columns of this level */}
        {td && items.filter(i => i.type === 'beam').map(b => {
          const r = td.beams[b.id]
          const ax = beamAxis(b), L = dist(ax.a, ax.b)
          if (!r || L * z < 70) return null
          let ang = Math.atan2(ax.b.y - ax.a.y, ax.b.x - ax.a.x) * 180 / Math.PI
          if (ang > 90 || ang < -90) ang += 180
          const m = { x: (ax.a.x + ax.b.x) / 2, y: (ax.a.y + ax.b.y) / 2 }
          const col = { ok: '#3F6B3A', near: '#8A6528', over: '#9A3B2A' }[level3(r.util)] || '#1e3a8a'
          return (
            <text key={`lb${b.id}`} x={m.x} y={m.y} dy={px(-11)} fontSize={px(10)} textAnchor="middle" fill={col} fontWeight="700" transform={`rotate(${ang} ${m.x} ${m.y})`}
              style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#fff', strokeWidth: px(3) }}>
              {r.wULS.toFixed(1)} kN/m · M {r.M.toFixed(0)}{r.util != null ? ` · ${Math.round(r.util * 100)}%` : ''}
            </text>
          )
        })}
        {td && items.filter(i => i.type === 'column').map(c => {
          const r = td.cols[c.id]
          if (!r) return null
          const col = { ok: '#3F6B3A', near: '#8A6528', over: '#9A3B2A' }[level3(r.util)] || '#1e3a8a'
          const tx = c.x + Math.max(c.w, c.d) / 2 + px(5), ty = c.y - Math.max(c.w, c.d) / 2 - px(5)
          return (
            <g key={`lc${c.id}`} style={{ pointerEvents: 'none' }}>
              {r.util != null && <circle cx={c.x} cy={c.y} r={Math.max(c.w, c.d) * 0.75} fill="none" stroke={col} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
              <text x={tx} y={ty} fontSize={px(10.5)} fill={col} fontWeight="800" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: px(3) }}>
                N {Math.round(r.N)} kN{r.util != null ? ` · ${Math.round(r.util * 100)}%` : ''}
              </text>
            </g>
          )
        })}

        {/* site notes: numbered pins */}
        {items.filter(i => i.type === 'note').map((nt, k) => {
          const on = isOn(nt.id)
          return (
            <g key={nt.id} data-id={nt.id} style={{ cursor: 'pointer' }}>
              <path d={`M${nt.x} ${nt.y}l${-px(7)} ${-px(12)}a${px(8)} ${px(8)} 0 1 1 ${px(14)} 0z`} fill={on ? C.sel : '#f59e0b'} stroke="#78350f" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={nt.x} y={nt.y - px(15)} fontSize={px(10)} fontWeight="800" fill="#fff" textAnchor="middle" dominantBaseline="central">{k + 1}</text>
              {nt.photos?.length > 0 && <text x={nt.x + px(10)} y={nt.y - px(20)} fontSize={px(9)} fill="#78350f" fontWeight="700">📷{nt.photos.length}</text>}
            </g>
          )
        })}

        {/* scan points from the linked Scan Marker project, coloured by status */}
        {level.bg && scanPts.map(sp => {
          const p = scanToPlan(sp, level.bg)
          if (!p) return null
          const on = sel === `scan:${sp.id}`
          const st = SCAN_STATUS[sp.status] || SCAN_STATUS.marked
          return (
            <g key={sp.id} data-id={`scan:${sp.id}`} style={{ cursor: 'pointer' }}>
              <circle cx={p.x} cy={p.y} r={px(on ? 8 : 6)} fill={st.color} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {on && <circle cx={p.x} cy={p.y} r={px(12)} fill="none" stroke={C.sel} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
              <text x={p.x + px(9)} y={p.y - px(7)} fontSize={px(10.5)} fill={st.color} fontWeight="700"
                style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: px(3) }}>{sp.label}</text>
            </g>
          )
        })}

        {items.filter(i => i.type === 'label').map(l => (
          <text key={l.id} data-id={l.id} x={l.x} y={l.y} fontSize={l.size} textAnchor="middle" dominantBaseline="middle"
            fill={isOn(l.id) ? C.sel : C.text} fontWeight="600">{l.text}</text>
        ))}

        {/* section cut lines, shown on every level */}
        {(plan.sections || []).map(sc => <SectionMark key={sc.id} sc={sc} px={px} selected={sc.id === sel} />)}
        {draft && cursor && tool === 'section' && <SectionMark sc={{ a: last, b: cursor, name: '?' }} px={px} />}

        {box && (
          <rect x={Math.min(box.a.x, box.b.x)} y={Math.min(box.a.y, box.b.y)} width={Math.abs(box.b.x - box.a.x)} height={Math.abs(box.b.y - box.a.y)}
            fill="rgba(37,99,235,.08)" stroke={C.sel} strokeDasharray="5 3" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        )}

        {/* handles for the selected item */}
        {selItem && tool === 'select' && handlePoints(selItem).map(([key, p]) => (
          <rect key={key} data-handle={key} x={p.x - px(5)} y={p.y - px(5)} width={px(10)} height={px(10)}
            fill="#fff" stroke={C.sel} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: 'move' }} />
        ))}
        {selItem?.type === 'wall' && (
          <WallLength w={selItem} px={px} />
        )}

        {/* drawing in progress */}
        {draft && cursor && tool === 'wall' && (
          <>
            <polygon points={poly(wallCorners({ a: last, b: cursor, thickness }))} fill="rgba(37,99,235,0.25)" stroke={C.draft}
              strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
            <WallLength w={{ a: last, b: cursor, thickness }} px={px} />
          </>
        )}
        {draft && POLY_TOOLS.has(tool) && (
          <polyline points={poly(cursor ? [...draft.pts, cursor] : draft.pts)} fill="rgba(37,99,235,0.08)" stroke={C.draft}
            strokeDasharray="5 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        )}
        {draft && cursor && tool === 'beam' && (
          <Beam b={{ a: last, b: cursor, width: plan.beamWidth || 300, depth: plan.beamDepth || 600 }} px={px} />
        )}
        {draft && cursor && (tool === 'dim' || tool === 'calibrate') && (
          tool === 'dim'
            ? <Dim d={{ a: last, b: cursor }} px={px} />
            : <line x1={last.x} y1={last.y} x2={cursor.x} y2={cursor.y} stroke="#dc2626" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
        {draft?.pts.map((p, k) => (
          <circle key={k} cx={p.x} cy={p.y} r={px(3.5)} fill={C.draft} style={{ pointerEvents: 'none' }} />
        ))}
        {cursor && tool !== 'select' && (
          cursor.snapped
            ? <rect x={cursor.x - px(6)} y={cursor.y - px(6)} width={px(12)} height={px(12)} fill="none" stroke="#16a34a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            : <circle cx={cursor.x} cy={cursor.y} r={px(3)} fill={cursor.miss ? '#dc2626' : C.draft} />
        )}
        {typed && cursor && (
          <text x={cursor.x + px(14)} y={cursor.y - px(14)} fontSize={px(13)} fill="#fff" fontWeight="700"
            style={{ paintOrder: 'stroke', stroke: C.draft, strokeWidth: px(6) }}>{typed} mm ⏎</text>
        )}
      </g>
    </svg>
  )
}

function handlePoints(it) {
  if (it.type === 'wall' || it.type === 'dim' || it.type === 'beam') return [['a', it.a], ['b', it.b]]
  if (it.pts) return it.pts.map((p, k) => [String(k), p])
  return []
}

function WallLength({ w, px }) {
  const { len, u, n } = wallAxes(w)
  if (len < 1) return null
  const off = w.thickness / 2 + px(14)
  const m = onWall(w, len / 2, off)
  let ang = Math.atan2(u.y, u.x) * 180 / Math.PI
  if (ang > 90 || ang < -90) ang += 180
  void n
  return (
    <text x={m.x} y={m.y} fontSize={px(12)} textAnchor="middle" dominantBaseline="middle" fill="#1d4ed8" fontWeight="700"
      transform={`rotate(${ang} ${m.x} ${m.y})`} style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#fff', strokeWidth: px(4) }}>
      {fmtMm(len)}
    </text>
  )
}

function Dim({ d, px, selected }) {
  const len = dist(d.a, d.b)
  if (len < 1) return null
  const u = { x: (d.b.x - d.a.x) / len, y: (d.b.y - d.a.y) / len }
  const n = { x: -u.y, y: u.x }
  const t = px(6)
  const tick = p => `M${p.x - (u.x + n.x) * t} ${p.y - (u.y + n.y) * t}L${p.x + (u.x + n.x) * t} ${p.y + (u.y + n.y) * t}`
  const m = { x: (d.a.x + d.b.x) / 2 - n.x * px(9), y: (d.a.y + d.b.y) / 2 - n.y * px(9) }
  let ang = Math.atan2(u.y, u.x) * 180 / Math.PI
  if (ang > 90 || ang < -90) ang += 180
  const col = selected ? '#2563eb' : '#b45309'
  return (
    <g data-id={d.id}>
      <path d={`M${d.a.x} ${d.a.y}L${d.b.x} ${d.b.y}${tick(d.a)}${tick(d.b)}`} stroke={col} strokeWidth={selected ? 2 : 1.2} vectorEffect="non-scaling-stroke" />
      {/* wider invisible line so it is easy to click */}
      <path d={`M${d.a.x} ${d.a.y}L${d.b.x} ${d.b.y}`} stroke="transparent" strokeWidth={px(10)} />
      <text x={m.x} y={m.y} fontSize={px(12)} textAnchor="middle" fill={col} fontWeight="700" transform={`rotate(${ang} ${m.x} ${m.y})`}
        style={{ paintOrder: 'stroke', stroke: '#f8fafc', strokeWidth: px(4) }}>{fmtMm(len)}</text>
    </g>
  )
}

function Opening({ o, w, selected }) {
  const h = w.thickness / 2
  const s0 = o.offset - o.width / 2, s1 = o.offset + o.width / 2
  const gap = [onWall(w, s0, h + 1), onWall(w, s1, h + 1), onWall(w, s1, -h - 1), onWall(w, s0, -h - 1)]
  const pts = gap.map(p => `${p.x},${p.y}`).join(' ')
  const col = selected ? '#2563eb' : '#0f172a'
  const line = (a, b, k, extra) => <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={1.2} vectorEffect="non-scaling-stroke" {...extra} />
  let body
  if (o.kind === 'door') {
    const side = o.side || 1
    const hingeAt = o.flip ? s1 : s0, freeAt = o.flip ? s0 : s1
    const hinge = onWall(w, hingeAt, side * h)
    const shut = onWall(w, freeAt, side * h)
    const { n } = wallAxes(w)
    const open = { x: hinge.x + n.x * side * o.width, y: hinge.y + n.y * side * o.width }
    const cross = (open.x - hinge.x) * (shut.y - hinge.y) - (open.y - hinge.y) * (shut.x - hinge.x)
    body = (
      <>
        {line(hinge, open, 'leaf', { strokeWidth: 2 })}
        <path d={`M${open.x} ${open.y}A${o.width} ${o.width} 0 0 ${cross > 0 ? 1 : 0} ${shut.x} ${shut.y}`} fill="none" stroke={col}
          strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      </>
    )
  } else {
    body = [-h, 0, h].map((a, k) => line(onWall(w, s0, a), onWall(w, s1, a), k))
  }
  return (
    <g data-id={o.id}>
      <polygon points={pts} fill={selected ? '#dbeafe' : '#f8fafc'} />
      {line(onWall(w, s0, h), onWall(w, s0, -h), 'j0')}
      {line(onWall(w, s1, h), onWall(w, s1, -h), 'j1')}
      {body}
    </g>
  )
}

// Structural grid: dash-dot gridlines, named bubbles and the bay spacings.
// Each line (and its bubble) can be dragged on its own.
function Grid({ g: grid, px, selected }) {
  // drawn square in the grid's own frame, then turned by its angle
  const g = grid.rot ? { ...grid, rot: 0 } : grid
  const n = g.xs.length, m = g.ys.length
  const p0 = gridNode(g, 0, 0), p1 = gridNode(g, n, m)
  const over = px(64), r = px(11), tail = px(24), dimAt = px(30), t = px(5)
  const col = selected ? '#2563eb' : '#dc2626'
  const stroke = { stroke: col, strokeWidth: selected ? 1.4 : 1, vectorEffect: 'non-scaling-stroke' }
  const halo = { paintOrder: 'stroke', stroke: '#f8fafc', strokeWidth: px(4) }
  const xs = Array.from({ length: n + 1 }, (_, i) => gridNode(g, i, 0).x)
  const ys = Array.from({ length: m + 1 }, (_, j) => gridNode(g, 0, j).y)
  const xl = gridLabels(g, 'x'), yl = gridLabels(g, 'y')
  const bubble = (x, y, label, k) => (
    <g key={k}>
      <circle cx={x} cy={y} r={r} fill="#fff" {...stroke} />
      <text x={x} y={y} fontSize={px(label.length > 2 ? 8.5 : 11)} textAnchor="middle" dominantBaseline="central" fill={col} fontWeight="700">{label}</text>
    </g>
  )
  return (
    <g transform={grid.rot ? `rotate(${grid.rot} ${g.x} ${g.y})` : undefined}>
      {xs.map((x, i) => (
        <g key={`x${i}`} data-gline={`${g.id}:x:${i}`} style={{ cursor: 'ew-resize' }}>
          <line x1={x} y1={p0.y - over + r} x2={x} y2={p1.y + tail} {...stroke} strokeDasharray="14 4 2 4" />
          <line x1={x} y1={p0.y - over} x2={x} y2={p1.y + tail} stroke="transparent" strokeWidth={px(8)} />
          {bubble(x, p0.y - over, xl[i], `bx${i}`)}
        </g>
      ))}
      {ys.map((y, j) => (
        <g key={`y${j}`} data-gline={`${g.id}:y:${j}`} style={{ cursor: 'ns-resize' }}>
          <line x1={p0.x - over + r} y1={y} x2={p1.x + tail} y2={y} {...stroke} strokeDasharray="14 4 2 4" />
          <line x1={p0.x - over} y1={y} x2={p1.x + tail} y2={y} stroke="transparent" strokeWidth={px(8)} />
          {bubble(p0.x - over, y, yl[j], `by${j}`)}
        </g>
      ))}
      {/* bay spacings along the top and down the left */}
      {g.xs.map((s, i) => {
        const y = p0.y - dimAt, a = xs[i], b = xs[i + 1], mx = (a + b) / 2
        return (
          <g key={`dx${i}`}>
            <path d={`M${a} ${y}H${b}M${a - t} ${y + t}L${a + t} ${y - t}M${b - t} ${y + t}L${b + t} ${y - t}`} {...stroke} />
            <text x={mx} y={y - px(5)} fontSize={px(11)} textAnchor="middle" fill={col} fontWeight="700" style={halo}>{fmtMm(s)}</text>
          </g>
        )
      })}
      {g.ys.map((s, j) => {
        const x = p0.x - dimAt, a = ys[j], b = ys[j + 1], my = (a + b) / 2
        return (
          <g key={`dy${j}`}>
            <path d={`M${x} ${a}V${b}M${x - t} ${a + t}L${x + t} ${a - t}M${x - t} ${b + t}L${x + t} ${b - t}`} {...stroke} />
            <text x={x - px(5)} y={my} fontSize={px(11)} textAnchor="middle" fill={col} fontWeight="700" style={halo}
              transform={`rotate(-90 ${x - px(5)} ${my})`}>{fmtMm(s)}</text>
          </g>
        )
      })}
    </g>
  )
}

// Beams sit above the floor, so they are drawn dashed (hidden line), with their size.
function Beam({ b, px, selected, mark }) {
  const len = dist(b.a, b.b)
  if (len < 1) return null
  const pts = beamCorners(b)
  const ax = beamAxis(b)
  const u = { x: (b.b.x - b.a.x) / len, y: (b.b.y - b.a.y) / len }
  let ang = Math.atan2(u.y, u.x) * 180 / Math.PI
  if (ang > 90 || ang < -90) ang += 180
  const m = { x: (ax.a.x + ax.b.x) / 2, y: (ax.a.y + ax.b.y) / 2 }
  const col = selected ? '#2563eb' : '#ea580c'
  return (
    <g data-id={b.id}>
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill={selected ? 'rgba(37,99,235,.15)' : 'rgba(234,88,12,.08)'}
        stroke={col} strokeWidth={selected ? 1.8 : 1.2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" />
      {len > px(90) && (
        <text x={m.x} y={m.y} fontSize={px(10.5)} textAnchor="middle" dominantBaseline="central" fill={col} fontWeight="700"
          transform={`rotate(${ang} ${m.x} ${m.y})`} style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#f8fafc', strokeWidth: px(3) }}>
          {mark ? `${mark} · ` : ''}{b.width}×{b.depth}
        </text>
      )}
    </g>
  )
}

// Section cut line: thick dash-dot line with the section letter and a view arrow at each end.
function SectionMark({ sc, px, selected }) {
  const L = dist(sc.a, sc.b)
  if (L < 1) return null
  const u = { x: (sc.b.x - sc.a.x) / L, y: (sc.b.y - sc.a.y) / L }
  const n = { x: -u.y, y: u.x }          // looking direction (to the left of a → b)
  const col = selected ? '#2563eb' : '#7c3aed'
  const end = (p, k) => {
    const tip = { x: p.x + n.x * px(22), y: p.y + n.y * px(22) }
    const t = { x: p.x - u.x * px(16) * (k ? -1 : 1), y: p.y - u.y * px(16) * (k ? -1 : 1) }
    return (
      <g key={k}>
        <line x1={p.x} y1={p.y} x2={tip.x} y2={tip.y} stroke={col} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path d={`M${tip.x + n.x * px(6)} ${tip.y + n.y * px(6)}L${tip.x + u.x * px(5)} ${tip.y + u.y * px(5)}L${tip.x - u.x * px(5)} ${tip.y - u.y * px(5)}Z`} fill={col} />
        <text x={t.x} y={t.y} fontSize={px(14)} fontWeight="800" fill={col} textAnchor="middle" dominantBaseline="central"
          style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: px(3) }}>{sc.name}</text>
      </g>
    )
  }
  return (
    <g data-id={sc.id} style={{ cursor: 'pointer' }}>
      <line x1={sc.a.x} y1={sc.a.y} x2={sc.b.x} y2={sc.b.y} stroke={col} strokeWidth={selected ? 2.4 : 1.8} strokeDasharray="16 4 3 4" vectorEffect="non-scaling-stroke" />
      <line x1={sc.a.x} y1={sc.a.y} x2={sc.b.x} y2={sc.b.y} stroke="transparent" strokeWidth={px(10)} />
      {end(sc.a, 0)}
      {end(sc.b, 1)}
    </g>
  )
}
