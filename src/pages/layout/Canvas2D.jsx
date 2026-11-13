import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  activeLevel, updateItems, updateLevel, removeItem, uid, dist, same, round, snapPoints, projectOnSeg,
  wallCorners, wallAxes, onWall, clampOpening, centroid, polyArea, moveItem, cloneItems, bounds, fmtMm, fmtArea,
  syncGrid, findNode, gridNode, colName, rowName,
} from './geometry'

const DRAW_TOOLS = new Set(['wall', 'room', 'dim', 'beam', 'calibrate'])
const OPENING = {
  door: { width: 900, height: 2100, sill: 0 },
  window: { width: 1200, height: 1200, sill: 900 },
}
const C = {
  paper: '#f8fafc', gridMinor: '#e2e8f0', gridMajor: '#cbd5e1', wall: '#475569', wallEdge: '#0f172a',
  sel: '#2563eb', room: 'rgba(37,99,235,0.06)', roomEdge: '#93c5fd', text: '#0f172a', muted: '#64748b', draft: '#2563eb',
}

const isTyping = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable

export default function Canvas2D({ plan, tool, setTool, sel, setSel, update, undo, redo, fitSignal, ask, onGridAt }) {
  const svgRef = useRef(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState({ ox: -1000, oy: -1000, z: 0.05 })   // screen = (world - o) * z
  const [draft, setDraft] = useState(null)       // { pts: [p] } while drawing walls / rooms / dims / calibration
  const [cursor, setCursor] = useState(null)     // snapped world point under the pointer
  const [typed, setTyped] = useState('')         // length typed while drawing
  const drag = useRef(null)
  const spaceDown = useRef(false)
  const shiftDown = useRef(false)

  const level = activeLevel(plan)
  const items = level.items
  const below = useMemo(() => {
    const lower = plan.levels.filter(l => l.elevation < level.elevation).sort((a, b) => b.elevation - a.elevation)
    return lower[0] || null
  }, [plan.levels, level.elevation])
  const thickness = plan.wallThickness || 200

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
    const b = bounds(level) || { x0: 0, y0: 0, x1: 20000, y1: 12000 }
    const bw = Math.max(b.x1 - b.x0, 2000), bh = Math.max(b.y1 - b.y0, 2000)
    const z = Math.min(w / bw, h / bh) * 0.85
    setView({ z, ox: (b.x0 + b.x1) / 2 - w / 2 / z, oy: (b.y0 + b.y1) / 2 - h / 2 / z })
  }, [level])

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
  const pts = useMemo(() => snapPoints(items), [items])

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
    } else if (tool === 'room') {
      if (!draft) { setDraft({ pts: [p] }); return }
      const closing = (draft.pts.length >= 3 && same(p, draft.pts[0], 1)) || same(p, last)
      if (closing) {
        if (draft.pts.length >= 3) {
          const id = uid()
          const n = items.filter(i => i.type === 'room').length + 1
          add({ id, type: 'room', pts: draft.pts, name: `Room ${n}`, slab: level.slab })
          setSel(id)
        }
        finishDraft()
        return
      }
      setDraft({ pts: [...draft.pts, p] })
    } else if (tool === 'dim') {
      if (!draft) { setDraft({ pts: [p] }); return }
      if (!same(p, last)) add({ id: uid(), type: 'dim', a: last, b: p })
      finishDraft()
    } else if (tool === 'beam') {
      if (!draft) { setDraft({ pts: [p] }); return }
      if (same(p, last)) { finishDraft(); return }
      add({ id: uid(), type: 'beam', a: last, b: p, width: plan.beamWidth || 300, depth: plan.beamDepth || 600,
        ga: findNode(items, last), gb: findNode(items, p) })
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
  }, [tool, draft, add, thickness, level, items, setSel, finishDraft, ask, update, setTool, plan.beamWidth, plan.beamDepth])

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
      if (mod && e.key.toLowerCase() === 'd' && sel) {
        e.preventDefault()
        const it = items.find(i => i.id === sel)
        if (!it) return
        const copies = cloneItems(it, items, 500, 500)
        if (copies.length) { add(...copies); setSel(copies[0].id) }
        return
      }
      if (draft && (DRAW_TOOLS.has(tool))) {
        if (/^[0-9.]$/.test(e.key)) { setTyped(t => t + e.key); e.preventDefault(); return }
        if (e.key === 'Backspace' && typed) { setTyped(t => t.slice(0, -1)); e.preventDefault(); return }
        if (e.key === 'Enter') {
          e.preventDefault()
          if (typed) applyTyped()
          else if (tool === 'room' && draft.pts.length >= 3) placePoint(draft.pts[draft.pts.length - 1])
          else finishDraft()
          return
        }
      }
      if (e.key === 'Escape') {
        if (draft) finishDraft()
        else if (sel) setSel(null)
        else setTool('select')
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        update(p => updateItems(p, list => syncGrid(removeItem(list, sel))))
        setSel(null)
        return
      }
      if (mod || e.altKey) return
      const keys = { v: 'select', h: 'pan', w: 'wall', r: 'room', c: 'column', d: 'door', n: 'window', m: 'dim', t: 'label', b: 'beam', g: 'grid' }
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
  }, [draft, tool, typed, sel, items, add, undo, redo, update, setSel, setTool, finishDraft, placePoint, applyTyped])

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
    if (e.button === 1 || e.button === 2 || spaceDown.current || tool === 'pan') {
      if (e.button === 2 && draft) { finishDraft(); return }
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view }
      return
    }
    if (e.button !== 0) return

    if (tool === 'select') {
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
        setSel(id)
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

    const last = draft?.pts[draft.pts.length - 1]
    const p = snap(raw, last, { extra: draft?.pts || [] })

    if (DRAW_TOOLS.has(tool)) { placePoint(tool === 'calibrate' ? raw : p); return }

    if (tool === 'grid') { onGridAt(p); return }
    if (tool === 'column') {
      const id = uid()
      add({ id, type: 'column', shape: 'rect', x: p.x, y: p.y, w: 400, d: 400, height: level.wallHeight })
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
      else if (tool !== 'select' && tool !== 'pan' && tool !== 'movebg') {
        const last = draft?.pts[draft.pts.length - 1]
        setCursor(snap(raw, last, { extra: draft?.pts || [] }))
      } else if (cursor) setCursor(null)
      return
    }
    if (d.kind === 'pan') {
      setView({ ...d.view, ox: d.view.ox - (e.clientX - d.sx) / d.view.z, oy: d.view.oy - (e.clientY - d.sy) / d.view.z })
      return
    }
    const push = !d.pushed
    if (d.kind === 'move') {
      let dx = raw.x - d.start.x, dy = raw.y - d.start.y
      if (plan.snap) { dx = round(dx, plan.grid); dy = round(dy, plan.grid) }
      if (!dx && !dy && !d.pushed) return
      const it = d.orig.find(i => i.id === d.id)
      const ends = it.type === 'wall' ? [it.a, it.b] : []
      update(p => updateItems(p, () => syncGrid(d.orig.map(i => {
        if (i.id === d.id) return moveItem(i, dx, dy)
        if (i.type === 'wall' && ends.length) {
          const mv = q => (ends.some(e2 => same(e2, q)) ? { x: q.x + dx, y: q.y + dy } : q)
          const a = mv(i.a), b = mv(i.b)
          return a !== i.a || b !== i.b ? { ...i, a, b } : i
        }
        return i
      }))), push)
      d.pushed = true
    } else if (d.kind === 'handle') {
      const it = d.orig.find(i => i.id === d.id)
      const other = it.type === 'room'
        ? it.pts[(+d.key + it.pts.length - 1) % it.pts.length]
        : d.key === 'a' ? it.b : it.a
      const p = snap(raw, other, { exclude: d.origPt })
      update(pl => updateItems(pl, () => d.orig.map(i => {
        if (i.id === d.id) {
          if (i.type === 'room') return { ...i, pts: i.pts.map((q, k) => (k === +d.key ? { x: p.x, y: p.y } : q)) }
          if (i.type === 'beam') return { ...i, [d.key]: { x: p.x, y: p.y }, [d.key === 'a' ? 'ga' : 'gb']: findNode(d.orig, p) }
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
    }
  }

  function onPointerUp() { drag.current = null }

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
  const cursorStyle = tool === 'pan' || tool === 'movebg' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'

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
      <g transform={`matrix(${z} 0 0 ${z} ${-ox * z} ${-oy * z})`}>
        <path d={grid.minor} stroke={C.gridMinor} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
        <path d={grid.maj} stroke={C.gridMajor} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />

        {level.bg?.show && (
          <image href={level.bg.src} x={level.bg.x} y={level.bg.y} width={level.bg.w * level.bg.mmPerPx} height={level.bg.h * level.bg.mmPerPx}
            opacity={level.bg.opacity} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />
        )}

        {items.filter(i => i.type === 'grid').map(g => <Grid key={g.id} g={g} px={px} selected={g.id === sel} />)}

        {below && below.items.filter(i => i.type === 'wall').map(w => (
          <polygon key={`b${w.id}`} points={poly(wallCorners(w))} fill="none" stroke="#94a3b8" strokeDasharray="4 3"
            strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        ))}

        {items.filter(i => i.type === 'room').map(r => {
          const c = centroid(r.pts)
          return (
            <g key={r.id} data-id={r.id}>
              <polygon points={poly(r.pts)} fill={C.room} stroke={r.id === sel ? C.sel : C.roomEdge}
                strokeWidth={r.id === sel ? 2 : 1} vectorEffect="non-scaling-stroke" />
              <text x={c.x} y={c.y} fontSize={px(13)} textAnchor="middle" fill={C.text} fontWeight="600" style={{ pointerEvents: 'none' }}>{r.name}</text>
              <text x={c.x} y={c.y + px(15)} fontSize={px(11)} textAnchor="middle" fill={C.muted} style={{ pointerEvents: 'none' }}>{fmtArea(polyArea(r.pts))}</text>
            </g>
          )
        })}

        {wallPolys.map(({ w, pts: p }) => (
          <polygon key={`o${w.id}`} points={poly(p)} fill={C.wall} stroke={C.wallEdge} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
        {wallPolys.map(({ w, pts: p }) => (
          <polygon key={w.id} data-id={w.id} points={poly(p)} fill={w.id === sel ? '#3b82f6' : C.wall} />
        ))}

        {items.filter(i => i.type === 'opening').map(o => {
          const w = items.find(i => i.id === o.wallId)
          return w ? <Opening key={o.id} o={o} w={w} selected={o.id === sel} /> : null
        })}

        {items.filter(i => i.type === 'beam').map(b => <Beam key={b.id} b={b} px={px} selected={b.id === sel} />)}

        {items.filter(i => i.type === 'column').map(c => (
          c.shape === 'round'
            ? <circle key={c.id} data-id={c.id} cx={c.x} cy={c.y} r={c.w / 2} fill={c.id === sel ? '#3b82f6' : '#334155'}
                stroke={C.wallEdge} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            : <rect key={c.id} data-id={c.id} x={c.x - c.w / 2} y={c.y - c.d / 2} width={c.w} height={c.d} fill={c.id === sel ? '#3b82f6' : '#334155'}
                stroke={C.wallEdge} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}

        {items.filter(i => i.type === 'dim').map(d => <Dim key={d.id} d={d} px={px} selected={d.id === sel} />)}

        {items.filter(i => i.type === 'label').map(l => (
          <text key={l.id} data-id={l.id} x={l.x} y={l.y} fontSize={l.size} textAnchor="middle" dominantBaseline="middle"
            fill={l.id === sel ? C.sel : C.text} fontWeight="600">{l.text}</text>
        ))}

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
        {draft && (tool === 'room') && (
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
  if (it.type === 'room') return it.pts.map((p, k) => [String(k), p])
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

// Structural grid: dash-dot gridlines, numbered/lettered bubbles and the bay spacings.
function Grid({ g, px, selected }) {
  const n = g.xs.length, m = g.ys.length
  const p0 = gridNode(g, 0, 0), p1 = gridNode(g, n, m)
  const over = px(64), r = px(11), tail = px(24), dimAt = px(30), t = px(5)
  const col = selected ? '#2563eb' : '#dc2626'
  const stroke = { stroke: col, strokeWidth: selected ? 1.4 : 1, vectorEffect: 'non-scaling-stroke' }
  const halo = { paintOrder: 'stroke', stroke: '#f8fafc', strokeWidth: px(4) }
  const xs = Array.from({ length: n + 1 }, (_, i) => gridNode(g, i, 0).x)
  const ys = Array.from({ length: m + 1 }, (_, j) => gridNode(g, 0, j).y)
  const bubble = (x, y, label, k) => (
    <g key={k}>
      <circle cx={x} cy={y} r={r} fill="#fff" {...stroke} />
      <text x={x} y={y} fontSize={px(11)} textAnchor="middle" dominantBaseline="central" fill={col} fontWeight="700">{label}</text>
    </g>
  )
  return (
    <g data-id={g.id}>
      {xs.map((x, i) => (
        <g key={`x${i}`}>
          <line x1={x} y1={p0.y - over + r} x2={x} y2={p1.y + tail} {...stroke} strokeDasharray="14 4 2 4" />
          <line x1={x} y1={p0.y - over} x2={x} y2={p1.y + tail} stroke="transparent" strokeWidth={px(8)} />
          {bubble(x, p0.y - over, colName(i), `bx${i}`)}
        </g>
      ))}
      {ys.map((y, j) => (
        <g key={`y${j}`}>
          <line x1={p0.x - over + r} y1={y} x2={p1.x + tail} y2={y} {...stroke} strokeDasharray="14 4 2 4" />
          <line x1={p0.x - over} y1={y} x2={p1.x + tail} y2={y} stroke="transparent" strokeWidth={px(8)} />
          {bubble(p0.x - over, y, rowName(j), `by${j}`)}
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
function Beam({ b, px, selected }) {
  const len = dist(b.a, b.b)
  if (len < 1) return null
  const pts = wallCorners({ a: b.a, b: b.b, thickness: b.width })
  const u = { x: (b.b.x - b.a.x) / len, y: (b.b.y - b.a.y) / len }
  let ang = Math.atan2(u.y, u.x) * 180 / Math.PI
  if (ang > 90 || ang < -90) ang += 180
  const m = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 }
  const col = selected ? '#2563eb' : '#ea580c'
  return (
    <g data-id={b.id}>
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill={selected ? 'rgba(37,99,235,.15)' : 'rgba(234,88,12,.08)'}
        stroke={col} strokeWidth={selected ? 1.8 : 1.2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" />
      {len > px(90) && (
        <text x={m.x} y={m.y} fontSize={px(10.5)} textAnchor="middle" dominantBaseline="central" fill={col} fontWeight="700"
          transform={`rotate(${ang} ${m.x} ${m.y})`} style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#f8fafc', strokeWidth: px(3) }}>
          {b.width}×{b.depth}
        </text>
      )}
    </g>
  )
}
