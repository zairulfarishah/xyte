import { useEffect, useRef, useState } from 'react'

const ROUNDS = 5

// Wait for green, then tap. Five rounds; score = average ms (lower is better).
// Tapping early just restarts that round.
export default function Reaction({ onGameOver }) {
  const [phase, setPhase] = useState('idle') // idle | wait | go | hit | early | done
  const [times, setTimes] = useState([])
  const goAt = useRef(0)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const arm = () => {
    setPhase('wait')
    timer.current = setTimeout(() => { goAt.current = performance.now(); setPhase('go') }, 1200 + Math.random() * 2800)
  }

  const tap = () => {
    if (phase === 'idle' || phase === 'done') { setTimes([]); arm(); return }
    if (phase === 'wait') { clearTimeout(timer.current); setPhase('early'); return }
    if (phase === 'early' || phase === 'hit') { arm(); return }
    if (phase === 'go') {
      const ms = Math.round(performance.now() - goAt.current)
      const next = [...times, ms]
      setTimes(next)
      if (next.length >= ROUNDS) {
        const avg = Math.round(next.reduce((a, b) => a + b, 0) / next.length)
        setPhase('done')
        onGameOver?.(avg)
      } else setPhase('hit')
    }
  }

  useEffect(() => {
    const onKey = e => { if (e.code === 'Space') { e.preventDefault(); tap() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const last = times[times.length - 1]
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
  const view = {
    idle:  { bg: '#1e3a8a', big: '⚡ Reaction time', small: `Tap when the screen turns green. ${ROUNDS} rounds. Tap to start.` },
    wait:  { bg: '#b91c1c', big: 'Wait for green…', small: 'Don’t tap yet' },
    go:    { bg: '#16a34a', big: 'TAP!', small: '' },
    hit:   { bg: '#1e293b', big: `${last} ms`, small: `Round ${times.length} of ${ROUNDS} · tap for the next one` },
    early: { bg: '#9a3412', big: 'Too soon!', small: 'That round doesn’t count — tap to try it again' },
    done:  { bg: '#0f172a', big: `${avg} ms average`, small: `${times.join(' · ')} ms — tap to play again` },
  }[phase]

  return (
    <div className="gm-react" style={{ background: view.bg }} onPointerDown={e => { e.preventDefault(); tap() }}>
      <b>{view.big}</b>
      {view.small && <span>{view.small}</span>}
      {times.length > 0 && phase !== 'done' && (
        <div className="dots">{Array.from({ length: ROUNDS }, (_, i) => <i key={i} className={i < times.length ? 'on' : ''} />)}</div>
      )}
    </div>
  )
}
