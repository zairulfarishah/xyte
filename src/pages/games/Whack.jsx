import { useEffect, useRef, useState } from 'react'

const SECONDS = 30
const HOLES = 9

// Moles pop up in a 3×3 field and duck back down; they come faster and stay shorter as time runs out.
// Score = moles hit.
export default function Whack({ onGameOver }) {
  const [phase, setPhase] = useState('idle') // idle | play | done
  const [moles, setMoles] = useState({})     // hole → time it ducks back down
  const [bonked, setBonked] = useState(null)
  const [hits, setHits] = useState(0)
  const [left, setLeft] = useState(SECONDS)
  const run = useRef({ endAt: 0, nextAt: 0, hits: 0, moles: {} })

  useEffect(() => {
    if (phase !== 'play') return undefined
    const t = setInterval(() => {
      const now = Date.now()
      const r = run.current
      const remaining = Math.max(0, r.endAt - now)
      setLeft(Math.ceil(remaining / 1000))
      if (remaining === 0) {
        setMoles({}); setPhase('done'); onGameOver?.(r.hits)
        return
      }
      const progress = 1 - remaining / (SECONDS * 1000)  // 0 → 1 over the game
      const next = Object.fromEntries(Object.entries(r.moles).filter(([, until]) => until > now))
      if (now >= r.nextAt) {
        const free = Array.from({ length: HOLES }, (_, i) => i).filter(i => !(i in next))
        if (free.length) next[free[Math.floor(Math.random() * free.length)]] = now + 1100 - progress * 550
        r.nextAt = now + 750 - progress * 380 + Math.random() * 200
      }
      r.moles = next
      setMoles(next)
    }, 60)
    return () => clearInterval(t)
  }, [phase, onGameOver])

  function start() {
    run.current = { endAt: Date.now() + SECONDS * 1000, nextAt: Date.now() + 400, hits: 0, moles: {} }
    setHits(0); setLeft(SECONDS); setMoles({}); setPhase('play')
  }

  function whack(i) {
    const r = run.current
    if (phase !== 'play' || !(i in r.moles)) return
    r.hits += 1
    setHits(r.hits)
    const next = { ...r.moles }
    delete next[i]
    r.moles = next
    setMoles(next)
    setBonked(i); setTimeout(() => setBonked(b => (b === i ? null : b)), 180)
  }

  if (phase !== 'play') {
    return (
      <div className="gm-react" style={{ background: '#92400e', cursor: 'pointer' }} onClick={start}>
        <b>{phase === 'done' ? `${hits} moles` : '🔨 Whack-a-Mole'}</b>
        <span>{phase === 'done' ? 'Time! Tap to play again.' : `Tap every mole before it hides. ${SECONDS} seconds. Tap to start.`}</span>
      </div>
    )
  }

  return (
    <div className="gm-whack">
      <div className="gm-bar">
        <div className="gm-stat dark"><small>Time</small><b style={{ color: left <= 5 ? '#fca5a5' : undefined }}>{left}s</b></div>
        <div className="gm-stat dark"><small>Hits</small><b>{hits}</b></div>
      </div>
      <div className="gm-field">
        {Array.from({ length: HOLES }, (_, i) => (
          <button key={i} className={`gm-hole ${i in moles ? 'up' : ''} ${bonked === i ? 'bonk' : ''}`}
            onPointerDown={e => { e.preventDefault(); whack(i) }} aria-label={i in moles ? 'Mole' : 'Empty hole'}>
            <span>{bonked === i ? '💥' : '🐹'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
