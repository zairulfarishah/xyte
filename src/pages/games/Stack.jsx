import { useEffect, useRef, useState } from 'react'

// Positions and widths are % of the play area
const BASE = { x: 20, w: 60 }
const ROW = 24        // px per block
const SHOWN = 14      // rows kept on screen; older ones scroll away
const colorOf = i => `hsl(${(200 + i * 14) % 360} 75% 55%)`

// A block slides back and forth; tap to drop it. Only the part over the block below stays.
// Miss completely and the tower is done. Score = blocks stacked.
export default function Stack({ onGameOver }) {
  const [phase, setPhase] = useState('idle') // idle | play | done
  const [tower, setTower] = useState([BASE])
  const [mover, setMover] = useState({ x: 0, w: BASE.w })
  const live = useRef({ x: 0, w: BASE.w, dir: 1, speed: 0.045 }) // speed in % per ms
  const frame = useRef(null)

  useEffect(() => {
    if (phase !== 'play') return undefined
    let last = performance.now()
    const step = t => {
      const m = live.current
      m.x += m.dir * m.speed * (t - last)
      last = t
      if (m.x <= 0) { m.x = 0; m.dir = 1 }
      if (m.x + m.w >= 100) { m.x = 100 - m.w; m.dir = -1 }
      setMover({ x: m.x, w: m.w })
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [phase])

  function start() {
    live.current = { x: 0, w: BASE.w, dir: 1, speed: 0.045 }
    setTower([BASE]); setMover({ x: 0, w: BASE.w }); setPhase('play')
  }

  function drop() {
    if (phase !== 'play') { start(); return }
    const m = live.current
    const below = tower[tower.length - 1]
    const left = Math.max(m.x, below.x)
    const right = Math.min(m.x + m.w, below.x + below.w)
    if (right - left < 0.5) {
      setPhase('done')
      onGameOver?.(tower.length - 1)
      return
    }
    // Close enough counts as perfect, so the tower doesn't shrink on a near-miss
    const perfect = Math.abs(m.x - below.x) < 1.2
    const placed = perfect ? { ...below } : { x: left, w: right - left }
    setTower(t => [...t, placed])
    const fromLeft = tower.length % 2 === 0
    live.current = { x: fromLeft ? 0 : 100 - placed.w, w: placed.w, dir: fromLeft ? 1 : -1, speed: Math.min(m.speed * 1.05, 0.14) }
  }

  useEffect(() => {
    const onKey = e => { if (e.code === 'Space') { e.preventDefault(); drop() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const score = tower.length - 1
  const firstShown = Math.max(0, tower.length - SHOWN)

  return (
    <div className="gm-stack" onPointerDown={e => { e.preventDefault(); drop() }}>
      <div className="score">{score}</div>
      {tower.slice(firstShown).map((b, i) => (
        <div key={firstShown + i} className="blk" style={{ left: `${b.x}%`, width: `${b.w}%`, bottom: i * ROW, background: colorOf(firstShown + i) }} />
      ))}
      {phase === 'play' && (
        <div className="blk" style={{ left: `${mover.x}%`, width: `${mover.w}%`, bottom: (tower.length - firstShown) * ROW, background: colorOf(tower.length) }} />
      )}
      {phase !== 'play' && (
        <div className="msg">
          <b>{phase === 'done' ? `${score} blocks` : '🏗️ Stack Tower'}</b>
          <span>{phase === 'done' ? 'Missed! Tap to build again.' : 'Tap (or Space) to drop each block. Line it up — the overhang falls off. Tap to start.'}</span>
        </div>
      )}
    </div>
  )
}
