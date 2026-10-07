import { useCallback, useEffect, useRef, useState } from 'react'

const N = 4
const COLORS = {
  2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#fff'], 16: ['#f59563', '#fff'],
  32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'], 128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'],
  512: ['#edc850', '#fff'], 1024: ['#edc53f', '#fff'], 2048: ['#edc22e', '#fff'],
}

function addTile(board) {
  const empty = []
  board.forEach((v, i) => { if (!v) empty.push(i) })
  if (!empty.length) return board
  const next = [...board]
  next[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4
  return next
}
const fresh = () => addTile(addTile(Array(N * N).fill(0)))

// Slide one line toward index 0, merging equal neighbours once
function slideLine(line) {
  const nums = line.filter(Boolean)
  const out = []
  let gained = 0
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === nums[i + 1]) { out.push(nums[i] * 2); gained += nums[i] * 2; i++ } else out.push(nums[i])
  }
  while (out.length < N) out.push(0)
  return { out, gained }
}

// dir: 'left' | 'right' | 'up' | 'down'
function move(board, dir) {
  const next = Array(N * N).fill(0)
  let gained = 0
  for (let k = 0; k < N; k++) {
    const idx = Array.from({ length: N }, (_, j) => {
      if (dir === 'left') return k * N + j
      if (dir === 'right') return k * N + (N - 1 - j)
      if (dir === 'up') return j * N + k
      return (N - 1 - j) * N + k
    })
    const r = slideLine(idx.map(i => board[i]))
    gained += r.gained
    idx.forEach((i, j) => { next[i] = r.out[j] })
  }
  return { board: next, gained, moved: next.some((v, i) => v !== board[i]) }
}
const canMove = board => ['left', 'right', 'up', 'down'].some(d => move(board, d).moved)

export default function Game2048({ onGameOver }) {
  const [board, setBoard] = useState(fresh)
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [saved, setSaved] = useState(false)
  const start = useRef(null)

  const finish = useCallback(finalScore => {
    setOver(true)
    if (!saved && finalScore > 0) { setSaved(true); onGameOver?.(finalScore) }
  }, [saved, onGameOver])

  const go = useCallback(dir => {
    if (over) return
    const r = move(board, dir)
    if (!r.moved) return
    const next = addTile(r.board)
    const total = score + r.gained
    setBoard(next)
    setScore(total)
    if (!canMove(next)) finish(total)
  }, [board, score, over, finish])

  useEffect(() => {
    const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }
    const onKey = e => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      const dir = keys[e.key]
      if (dir) { e.preventDefault(); go(dir) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const restart = () => { setBoard(fresh()); setScore(0); setOver(false); setSaved(false) }
  const best = Math.max(...board)

  return (
    <div className="gm-2048">
      <div className="gm-bar">
        <div className="gm-stat"><small>Score</small><b>{score}</b></div>
        <div className="gm-stat"><small>Best tile</small><b>{best}</b></div>
        <span style={{ flex: 1 }} />
        {!over && score > 0 && <button className="mk-btn ghost sm" onClick={() => finish(score)}>End &amp; save</button>}
        <button className="mk-btn sm" onClick={restart}>New game</button>
      </div>
      <div className="gm-grid"
        onPointerDown={e => { start.current = { x: e.clientX, y: e.clientY } }}
        onPointerUp={e => {
          if (!start.current) return
          const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y
          start.current = null
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
          go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
        }}>
        {board.map((v, i) => {
          const [bg, fg] = COLORS[v] || ['#3c3a32', '#fff']
          return (
            <div key={i} className={`gm-tile${v ? ' on' : ''}`} style={v ? { background: bg, color: fg, fontSize: v >= 1024 ? 22 : v >= 128 ? 26 : 30 } : undefined}>
              {v || ''}
            </div>
          )
        })}
        {over && (
          <div className="gm-over">
            <b>{best >= 2048 ? '🎉 2048!' : 'No more moves'}</b>
            <span>Score {score}</span>
            <button className="mk-btn" onClick={restart}>Play again</button>
          </div>
        )}
      </div>
      <p className="mk-sub" style={{ textAlign: 'center' }}>Swipe on the board, or use the arrow keys.</p>
    </div>
  )
}
