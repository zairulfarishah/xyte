import { useEffect, useRef, useState } from 'react'

const SECONDS = 60
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1))

// Sums get a little bigger as the score climbs
function question(level) {
  const big = Math.min(20 + level * 6, 99)
  const op = ['+', '−', '×'][rand(0, 2)]
  if (op === '×') { const a = rand(2, Math.min(6 + level, 12)), b = rand(2, 12); return { text: `${a} × ${b}`, answer: a * b } }
  const a = rand(2, big), b = rand(2, big)
  if (op === '+') return { text: `${a} + ${b}`, answer: a + b }
  return { text: `${Math.max(a, b)} − ${Math.min(a, b)}`, answer: Math.max(a, b) - Math.min(a, b) }
}

// 60 seconds of mental sums. Typing the right answer moves on by itself; score = correct answers.
export default function QuickMath({ onGameOver }) {
  const [phase, setPhase] = useState('idle') // idle | play | done
  const [q, setQ] = useState(() => question(0))
  const [input, setInput] = useState('')
  const [correct, setCorrect] = useState(0)
  const [left, setLeft] = useState(SECONDS)
  const [flash, setFlash] = useState(false)
  const endAt = useRef(0)
  const score = useRef(0)

  useEffect(() => {
    if (phase !== 'play') return undefined
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000))
      setLeft(remaining)
      if (remaining === 0) { setPhase('done'); onGameOver?.(score.current) }
    }, 200)
    return () => clearInterval(t)
  }, [phase, onGameOver])

  function start() {
    score.current = 0
    endAt.current = Date.now() + SECONDS * 1000
    setCorrect(0); setLeft(SECONDS); setInput(''); setQ(question(0)); setPhase('play')
  }

  function type(key) {
    if (phase !== 'play') return
    const next = key === 'del' ? input.slice(0, -1) : (input + key).slice(0, 4)
    if (next !== '' && Number(next) === q.answer) {
      score.current += 1
      setCorrect(score.current)
      setInput('')
      setQ(question(score.current))
      setFlash(true); setTimeout(() => setFlash(false), 150)
    } else setInput(next)
  }
  const skip = () => { setInput(''); setQ(question(score.current)) }

  useEffect(() => {
    const onKey = e => {
      if (phase !== 'play') return
      if (/^\d$/.test(e.key)) type(e.key)
      else if (e.key === 'Backspace') type('del')
      else if (e.key === 'Enter') skip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase !== 'play') {
    return (
      <div className="gm-react" style={{ background: '#0f766e', cursor: 'pointer' }} onClick={start}>
        <b>{phase === 'done' ? `${correct} correct` : '🧮 Quick Math'}</b>
        <span>{phase === 'done' ? 'Time! Tap to play again.' : `+ − × sums, ${SECONDS} seconds. Type the answer — it moves on by itself. Tap to start.`}</span>
      </div>
    )
  }

  return (
    <div className="gm-math">
      <div className="gm-bar">
        <div className="gm-stat dark"><small>Time</small><b style={{ color: left <= 10 ? '#fca5a5' : undefined }}>{left}s</b></div>
        <div className="gm-stat dark"><small>Correct</small><b>{correct}</b></div>
        <span style={{ flex: 1 }} />
        <button className="mk-btn ghost sm" onClick={skip}>Skip</button>
      </div>
      <div className={`gm-q ${flash ? 'ok' : ''}`}>
        <span>{q.text} =</span>
        <b>{input || '?'}</b>
      </div>
      <div className="gm-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0'].map(k => (
          <button key={k} className={k === 'del' ? 'del' : ''} onPointerDown={e => { e.preventDefault(); type(k) }}>{k === 'del' ? '⌫' : k}</button>
        ))}
      </div>
    </div>
  )
}
