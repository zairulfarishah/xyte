import { useEffect, useRef, useState } from 'react'

const SECONDS = 30
const PENALTY_MS = 2000
const COLOURS = [
  { name: 'RED', ink: '#f87171' }, { name: 'BLUE', ink: '#60a5fa' }, { name: 'GREEN', ink: '#4ade80' },
  { name: 'YELLOW', ink: '#facc15' }, { name: 'PURPLE', ink: '#c084fc' }, { name: 'ORANGE', ink: '#fb923c' },
]
const pick = n => Math.floor(Math.random() * n)

// Usually the word and its ink disagree — that's the trap
function card() {
  const word = pick(COLOURS.length)
  let ink = pick(COLOURS.length)
  if (Math.random() < 0.8) while (ink === word) ink = pick(COLOURS.length)
  return { word, ink }
}

// Tap the colour of the ink, not what the word says. A wrong tap costs 2 seconds.
// Score = correct taps in 30 seconds.
export default function ColourTrap({ onGameOver }) {
  const [phase, setPhase] = useState('idle') // idle | play | done
  const [c, setC] = useState(card)
  const [score, setScore] = useState(0)
  const [left, setLeft] = useState(SECONDS)
  const [flash, setFlash] = useState(null) // 'ok' | 'bad'
  const run = useRef({ endAt: 0, score: 0 })

  useEffect(() => {
    if (phase !== 'play') return undefined
    const t = setInterval(() => {
      const remaining = Math.max(0, run.current.endAt - Date.now())
      setLeft(Math.ceil(remaining / 1000))
      if (remaining === 0) { setPhase('done'); onGameOver?.(run.current.score) }
    }, 100)
    return () => clearInterval(t)
  }, [phase, onGameOver])

  function start() {
    run.current = { endAt: Date.now() + SECONDS * 1000, score: 0 }
    setScore(0); setLeft(SECONDS); setC(card()); setPhase('play')
  }

  function answer(i) {
    if (phase !== 'play') return
    if (i === c.ink) {
      run.current.score += 1
      setScore(run.current.score)
      setFlash('ok')
    } else {
      run.current.endAt -= PENALTY_MS
      setFlash('bad')
    }
    setTimeout(() => setFlash(null), 150)
    setC(card())
  }

  if (phase !== 'play') {
    return (
      <div className="gm-react" style={{ background: '#0f172a', cursor: 'pointer' }} onClick={start}>
        <b>{phase === 'done' ? `${score} correct` : <>🎨 <span style={{ color: '#60a5fa' }}>RED</span></>}</b>
        <span>{phase === 'done' ? 'Time! Tap to play again.' : `Tap the colour of the INK, not the word (that one is blue). Wrong taps cost 2 seconds. ${SECONDS} seconds — tap to start.`}</span>
      </div>
    )
  }

  return (
    <div className="gm-colour">
      <div className="gm-bar">
        <div className="gm-stat dark"><small>Time</small><b style={{ color: left <= 5 ? '#fca5a5' : undefined }}>{left}s</b></div>
        <div className="gm-stat dark"><small>Correct</small><b>{score}</b></div>
      </div>
      <div className={`gm-word-card ${flash || ''}`}>
        <b style={{ color: COLOURS[c.ink].ink }}>{COLOURS[c.word].name}</b>
        <small>Tap the ink colour</small>
      </div>
      <div className="gm-swatches">
        {COLOURS.map((col, i) => (
          <button key={col.name} style={{ background: col.ink }} onPointerDown={e => { e.preventDefault(); answer(i) }}>{col.name}</button>
        ))}
      </div>
    </div>
  )
}
