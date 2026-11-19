import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { REPORT_STATUS, statusInfo } from '../../components/ui/status'
import ReportBadge from './ReportBadge'
import { badgeTone } from './reportUtils'
import './Badges.css'

// Reports as ID badges hanging from a rail. Moving the cursor across a badge pushes it
// (it swings the way you moved, then settles); clicking turns it over; Esc turns it back.

const STRAPS = [48, 80, 40, 100, 64, 88, 56]   // lanyard lengths, repeating — a staggered wall
// Small, quick swing that settles fast (stiffness 1/s², damping 1/s, max swing deg) — kept light so it never lags
const STIFF = 60, DAMP = 9, MAX = 5

// Scroll position that lines a badge up with the wall's snap point (start on desktop, centre on phones)
function slotLeft(el, slot) {
  const cs = getComputedStyle(slot)
  if (cs.scrollSnapAlign.includes('center')) return slot.offsetLeft + slot.offsetWidth / 2 - el.clientWidth / 2
  return slot.offsetLeft - (parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0)
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const easeOut = t => 1 - Math.pow(1 - t, 3)

export default function BadgeWall({ sites, today, isZairul, updating, onStatus, onOpen }) {
  const [flipped, setFlipped] = useState(null)
  const [active, setActive] = useState(0)
  const trackRef = useRef(null)
  const hangRefs = useRef(new Map())      // id -> swinging element
  const phys = useRef(new Map())          // id -> { a: angle, v: speed }
  const wind = useRef(0)                  // lean of every badge while the wall is dragged
  const dragging = useRef(false)
  const raf = useRef(null)
  const lastT = useRef(0)
  const last = useRef(null)               // last pointer { x, t, v }
  const near = useRef(new Set())          // ids of badges on (or just off) screen — the only ones animated

  // Only badges near the screen get a GPU layer and take part in the drag lean
  useEffect(() => {
    const root = trackRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        const hang = en.target.firstElementChild
        const id = hang?.dataset.hang
        if (!id) continue
        if (en.isIntersecting) { near.current.add(id); hang.classList.add('near') }
        else { near.current.delete(id); hang.classList.remove('near') }
      }
    }, { root, rootMargin: '0px 240px' })
    root.querySelectorAll('.bw-slot').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [sites])

  // ── swing physics: a damped spring per badge, real frame time, one loop for all ──
  const tickRef = useRef(null)
  const tick = useCallback(now => {
    const dt = Math.min(0.034, lastT.current ? (now - lastT.current) / 1000 : 1 / 60)
    lastT.current = now
    if (!dragging.current) wind.current *= Math.pow(0.04, dt)     // the lean fades out smoothly
    let moving = Math.abs(wind.current) > 0.02
    if (moving || dragging.current) for (const id of near.current) if (!phys.current.has(id)) phys.current.set(id, { a: 0, v: 0 })
    for (const [id, p] of phys.current) {
      for (let k = 0; k < 2; k++) {                                // two half-steps keep it silky
        const h = dt / 2
        p.v += (-STIFF * (p.a - wind.current) - DAMP * p.v) * h
        p.a = Math.max(-MAX, Math.min(MAX, p.a + p.v * h))
      }
      const el = hangRefs.current.get(id)
      if (Math.abs(p.a) < 0.02 && Math.abs(p.v) < 0.04 && Math.abs(wind.current) < 0.02) {
        p.a = 0; p.v = 0; phys.current.delete(id)                  // at rest: stop simulating it
        if (el) el.style.transform = ''
        continue
      }
      moving = true
      // written straight to transform (no CSS variable), so only the compositor works
      if (el) el.style.transform = `rotate(${p.a.toFixed(2)}deg)`
    }
    if (moving || dragging.current) raf.current = requestAnimationFrame(tickRef.current)
    else { raf.current = null; lastT.current = 0 }
  }, [])
  useEffect(() => { tickRef.current = tick }, [tick])
  const wake = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(tick) }, [tick])
  const kick = useCallback((id, dv) => {
    const p = phys.current.get(id) || { a: 0, v: 0 }
    p.v = Math.max(-30, Math.min(30, p.v + Math.max(-10, Math.min(10, dv))))
    phys.current.set(id, p)
    wake()
  }, [wake])
  useEffect(() => () => { cancelAnimationFrame(raf.current); cancelAnimationFrame(scrollAnim.current); cancelAnimationFrame(scrollRaf.current) }, [])

  // ── smooth scrolling of the rail (our own easing, so drag, glide and arrows all feel the same) ──
  const scrollAnim = useRef(null)
  function animateTo(to, ms = 380) {
    const el = trackRef.current
    if (!el) return
    cancelAnimationFrame(scrollAnim.current)
    const max = el.scrollWidth - el.clientWidth
    to = Math.max(0, Math.min(max, to))
    if (reduceMotion()) { el.scrollLeft = to; el.classList.remove('gliding'); return }
    const from = el.scrollLeft, start = performance.now()
    el.classList.add('gliding')
    const step = now => {
      const t = Math.min(1, (now - start) / ms)
      el.scrollLeft = from + (to - from) * easeOut(t)
      if (t < 1) scrollAnim.current = requestAnimationFrame(step)
      else el.classList.remove('gliding')
    }
    scrollAnim.current = requestAnimationFrame(step)
  }
  function nearestTo(pos) {
    const el = trackRef.current
    let best = 0, dist = Infinity
    ;[...el.querySelectorAll('.bw-slot')].forEach((s, i) => { const d = Math.abs(slotLeft(el, s) - pos); if (d < dist) { dist = d; best = i } })
    return best
  }

  // ── click-and-drag to slide the wall (mouse; touch already swipes natively) ──
  const drag = useRef(null)               // { x, left, moved, v, lx, lt }
  const justDragged = useRef(false)       // the click that ends a drag doesn't flip a badge

  function onPointerDown(e) {
    justDragged.current = false
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('select, button, a')) return
    cancelAnimationFrame(scrollAnim.current)
    trackRef.current.classList.remove('gliding')
    drag.current = { x: e.clientX, left: trackRef.current.scrollLeft, moved: false, v: 0, lx: e.clientX, lt: performance.now() }
  }

  function endDrag() {
    const d = drag.current
    drag.current = null
    dragging.current = false
    const el = trackRef.current
    if (!d?.moved || !el) return
    justDragged.current = true
    el.classList.remove('dragging')
    // A fling carries on (further for a faster flick), then eases onto the nearest badge
    const fresh = performance.now() - d.lt < 60 ? d.v : 0
    const aim = el.scrollLeft - fresh * 200
    const i = nearestTo(aim)
    const dist = Math.abs(slotLeft(el, el.querySelectorAll('.bw-slot')[i]) - el.scrollLeft)
    go(i, Math.max(260, Math.min(520, 220 + dist * 0.6)))
  }
  useEffect(() => {
    const up = () => endDrag()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  })

  function onPointerMove(e) {
    const now = performance.now()
    const d = drag.current
    if (d && e.pointerType === 'mouse') {
      const dx = e.clientX - d.x
      if (!d.moved && Math.abs(dx) > 5) { d.moved = true; trackRef.current.classList.add('dragging') }
      if (d.moved) {
        trackRef.current.scrollLeft = d.left - dx
        const v = (e.clientX - d.lx) / Math.max(8, now - d.lt)
        d.v = d.v * 0.7 + v * 0.3
        d.lx = e.clientX; d.lt = now
        last.current = null
        return
      }
    }
    if (e.pointerType === 'touch' || reduceMotion()) return
    const prev = last.current
    if (!prev || now - prev.t > 80) { last.current = { x: e.clientX, t: now, v: 0 }; return }
    const raw = (e.clientX - prev.x) / Math.max(8, now - prev.t)   // px per ms
    const vx = prev.v * 0.5 + raw * 0.5                              // smoothed, so pushes aren't jerky
    last.current = { x: e.clientX, t: now, v: vx }
    if (Math.abs(vx) < 0.04) return
    // Push whichever badge the cursor is over: moving right swings its bottom right
    const card = e.target.closest?.('[data-badge]')
    if (card) kick(card.dataset.badge, -vx * 14)
  }

  // A tap on a badge: it nudges, then turns over
  function toggle(id) {
    if (justDragged.current) return
    if (!reduceMotion()) kick(id, flipped === id ? 6 : -6)
    setFlipped(f => (f === id ? null : id))
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setFlipped(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The badge nearest the middle is "active" (dots + caption)
  // (worked out once per frame from the slot spacing, not by measuring every badge)
  const scrollRaf = useRef(null)
  function onScroll() {
    if (scrollRaf.current) return
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null
      const el = trackRef.current
      const a = el?.querySelector('.bw-slot')
      if (!a) return
      const pitch = a.nextElementSibling ? a.nextElementSibling.offsetLeft - a.offsetLeft : 1
      const mid = el.scrollLeft + el.clientWidth / 2
      const i = Math.round((mid - a.offsetLeft - a.offsetWidth / 2) / pitch)
      setActive(Math.max(0, Math.min(sites.length - 1, i)))
    })
  }
  function go(i, ms) {
    const el = trackRef.current
    const slot = el?.querySelectorAll('.bw-slot')[i]
    if (slot) animateTo(slotLeft(el, slot), ms)
  }

  const cur = sites[Math.min(active, sites.length - 1)]
  const flippedSite = sites.find(s => s.id === flipped)

  return (
    <div className="bw" onPointerMove={onPointerMove} onPointerDown={onPointerDown}>
      <div className="bw-rail" aria-hidden="true" />
      <button type="button" className="bw-arrow l" onClick={() => go(Math.max(0, active - 1))} disabled={active === 0} aria-label="Previous report"><ChevronLeft /></button>
      <button type="button" className="bw-arrow r" onClick={() => go(Math.min(sites.length - 1, active + 1))} disabled={active >= sites.length - 1} aria-label="Next report"><ChevronRight /></button>

      <div className="bw-track" ref={trackRef} onScroll={onScroll}>
        {sites.map((site, i) => (
          <div key={site.id} className={`bw-slot t-${badgeTone(site, today)}`}>
            <div className="bw-hang" data-hang={site.id} ref={el => { if (el) hangRefs.current.set(String(site.id), el); else hangRefs.current.delete(String(site.id)) }}>
              <i className="bw-hook" />
              <i className="bw-strap" style={{ height: STRAPS[i % STRAPS.length] }} />
              <i className="bw-ring" />
              <i className="bw-clip" />
              <div className="bw-card" data-badge={site.id} role="button" tabIndex={0}
                aria-pressed={flipped === site.id}
                aria-label={`${site.site_name}, report ${statusInfo(REPORT_STATUS, site.report_status).label}. ${flipped === site.id ? 'Showing details' : 'Press to see details'}`}
                onClick={e => { if (!e.target.closest('select, button')) toggle(site.id) }}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); toggle(site.id) } }}>
                <ReportBadge site={site} today={today} flipped={flipped === site.id} isZairul={isZairul}
                  updating={updating === site.id} onStatus={onStatus} onOpen={onOpen} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bw-foot">
        {sites.length <= 14 ? (
          <div className="bw-dots" role="tablist" aria-label="Reports">
            {sites.map((s, i) => <button key={s.id} type="button" role="tab" aria-selected={i === active} aria-label={s.site_name} className={i === active ? 'on' : ''} onClick={() => go(i)} />)}
          </div>
        ) : (
          <div className="bw-count">{active + 1} <span>/ {sites.length}</span></div>
        )}
        {cur && (
          <p className="bw-cap">
            <b>{(flippedSite || cur).site_name}</b> — {statusInfo(REPORT_STATUS, (flippedSite || cur).report_status).label}
            <small>{flipped ? 'Click again or press Esc to turn it back' : 'Click a badge to turn it over'}</small>
          </p>
        )}
      </div>
    </div>
  )
}
