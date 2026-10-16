import { useEffect, useRef, useState } from 'react'

const FACES = ['🍕', '🍔', '🍩', '🍉', '🍜', '☕', '🍟', '🧋']

function deal() {
  const cards = [...FACES, ...FACES].map((face, i) => ({ id: i, face }))
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

// 4×4 cards, 8 pairs. The clock starts on the first flip; score = seconds to clear (lower wins).
export default function Memory({ onGameOver }) {
  const [cards, setCards] = useState(deal)
  const [open, setOpen] = useState([])      // indexes face-up and not yet matched (max 2)
  const [matched, setMatched] = useState(new Set())
  const [moves, setMoves] = useState(0)
  const [startedAt, setStartedAt] = useState(null)
  const [now, setNow] = useState(0)
  const [doneIn, setDoneIn] = useState(null)
  const flipBack = useRef(null)

  useEffect(() => () => clearTimeout(flipBack.current), [])
  useEffect(() => {
    if (!startedAt || doneIn != null) return undefined
    const t = setInterval(() => setNow(performance.now()), 200)
    return () => clearInterval(t)
  }, [startedAt, doneIn])

  // at: the click's event time (same clock as performance.now)
  function flip(i, at) {
    if (doneIn != null || matched.has(cards[i].face) || open.includes(i) || open.length === 2) return
    if (!startedAt) { setStartedAt(at); setNow(at) }
    const next = [...open, i]
    setOpen(next)
    if (next.length < 2) return
    setMoves(m => m + 1)
    const [a, b] = next
    if (cards[a].face === cards[b].face) {
      const done = new Set(matched).add(cards[a].face)
      setMatched(done)
      setOpen([])
      if (done.size === FACES.length) {
        const secs = Math.max(1, Math.round((at - (startedAt ?? at)) / 1000))
        setDoneIn(secs)
        onGameOver?.(secs)
      }
    } else {
      flipBack.current = setTimeout(() => setOpen([]), 700)
    }
  }

  function restart() {
    clearTimeout(flipBack.current)
    setCards(deal()); setOpen([]); setMatched(new Set()); setMoves(0); setStartedAt(null); setDoneIn(null)
  }

  const secs = doneIn ?? (startedAt ? Math.floor((now - startedAt) / 1000) : 0)

  return (
    <div className="gm-memory">
      <div className="gm-bar">
        <div className="gm-stat dark"><small>Time</small><b>{secs}s</b></div>
        <div className="gm-stat dark"><small>Moves</small><b>{moves}</b></div>
        <div className="gm-stat dark"><small>Pairs</small><b>{matched.size}/{FACES.length}</b></div>
        <span style={{ flex: 1 }} />
        <button className="mk-btn sm" onClick={restart}>New game</button>
      </div>
      <div className="gm-cards">
        {cards.map((c, i) => {
          const up = open.includes(i) || matched.has(c.face)
          return (
            <button key={c.id} className={`gm-flip ${up ? 'up' : ''} ${matched.has(c.face) ? 'got' : ''}`} onClick={e => flip(i, e.timeStamp)} aria-label={up ? c.face : 'Hidden card'}>
              <span>{up ? c.face : '?'}</span>
            </button>
          )
        })}
        {doneIn != null && (
          <div className="gm-over">
            <b>🎉 {doneIn}s</b>
            <span>{moves} moves</span>
            <button className="mk-btn" onClick={restart}>Play again</button>
          </div>
        )}
      </div>
    </div>
  )
}
