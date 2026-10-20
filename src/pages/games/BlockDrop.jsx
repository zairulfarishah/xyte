import { useEffect, useReducer, useRef } from 'react'
import { ArrowDown, ChevronLeft, ChevronRight, ChevronsDown, RotateCw } from 'lucide-react'

const W = 10
const H = 20
const PIECES = {
  I: { shape: [[1, 1, 1, 1]], color: '#06b6d4' },
  O: { shape: [[1, 1], [1, 1]], color: '#eab308' },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: '#a855f7' },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: '#22c55e' },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: '#ef4444' },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: '#3b82f6' },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: '#f97316' },
}
const KEYS = Object.keys(PIECES)
const randomKey = () => KEYS[Math.floor(Math.random() * KEYS.length)]
const rotate = m => m[0].map((_, c) => m.map(row => row[c]).reverse())
const emptyBoard = () => Array.from({ length: H }, () => Array(W).fill(null))

function fits(board, shape, x, y) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue
      const nx = x + c, ny = y + r
      if (nx < 0 || nx >= W || ny >= H) return false
      if (ny >= 0 && board[ny][nx]) return false
    }
  }
  return true
}

function spawn(s) {
  const p = PIECES[s.next]
  const x = Math.floor((W - p.shape[0].length) / 2)
  const next = { ...s, shape: p.shape, color: p.color, x, y: 0, next: randomKey() }
  return fits(s.board, p.shape, x, 0) ? next : { ...next, over: true }
}

function lock(s) {
  const board = s.board.map(row => [...row])
  let toppedOut = false
  s.shape.forEach((row, r) => row.forEach((v, c) => {
    if (!v) return
    if (s.y + r < 0) toppedOut = true
    else board[s.y + r][s.x + c] = s.color
  }))
  if (toppedOut) return { ...s, board, over: true }
  const kept = board.filter(row => row.some(cell => !cell))
  const cleared = H - kept.length
  const full = [...Array.from({ length: cleared }, () => Array(W).fill(null)), ...kept]
  return spawn({ ...s, board: full, lines: s.lines + cleared })
}

const fresh = () => spawn({ board: emptyBoard(), next: randomKey(), lines: 0, over: false, started: true })

function reducer(s, action) {
  if (action === 'start') return fresh()
  if (!s.started || s.over) return s
  switch (action) {
    case 'left': return fits(s.board, s.shape, s.x - 1, s.y) ? { ...s, x: s.x - 1 } : s
    case 'right': return fits(s.board, s.shape, s.x + 1, s.y) ? { ...s, x: s.x + 1 } : s
    case 'rotate': {
      const r = rotate(s.shape)
      for (const kick of [0, -1, 1, -2, 2]) if (fits(s.board, r, s.x + kick, s.y)) return { ...s, shape: r, x: s.x + kick }
      return s
    }
    case 'down': return fits(s.board, s.shape, s.x, s.y + 1) ? { ...s, y: s.y + 1 } : lock(s)
    case 'drop': {
      let y = s.y
      while (fits(s.board, s.shape, s.x, y + 1)) y++
      return lock({ ...s, y })
    }
    default: return s
  }
}

// Tetris-style. Tap the board to rotate, swipe left/right to move, swipe down to drop.
// Speeds up every 10 lines. Score = lines cleared.
export default function BlockDrop({ onGameOver }) {
  const [s, act] = useReducer(reducer, { board: emptyBoard(), lines: 0, over: false, started: false })
  const touch = useRef(null)
  const level = Math.floor(s.lines / 10)

  useEffect(() => {
    if (!s.started || s.over) return undefined
    const t = setInterval(() => act('down'), Math.max(110, 700 - level * 65))
    return () => clearInterval(t)
  }, [s.started, s.over, level])

  useEffect(() => { if (s.over) onGameOver?.(s.lines) }, [s.over]) // eslint-disable-line react-hooks/exhaustive-deps -- report once per game

  useEffect(() => {
    const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', ' ': 'drop' }
    const onKey = e => {
      const a = keys[e.key]
      if (!a) return
      e.preventDefault()
      act(!s.started || s.over ? 'start' : a)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s.started, s.over])

  // Board with the falling piece drawn in
  const cells = s.board.map(row => [...row])
  if (s.started && !s.over) {
    s.shape.forEach((row, r) => row.forEach((v, c) => { if (v && s.y + r >= 0) cells[s.y + r][s.x + c] = s.color }))
  }

  const tap = a => e => { e.preventDefault(); act(a) }

  return (
    <div className="gm-blocks">
      <div className="gm-bar">
        <div className="gm-stat dark"><small>Lines</small><b>{s.lines}</b></div>
        <div className="gm-stat dark"><small>Level</small><b>{level + 1}</b></div>
        <span style={{ flex: 1 }} />
        {s.next && s.started && (
          <div className="gm-next" aria-label="Next piece">
            {PIECES[s.next].shape.map((row, r) => (
              <div key={r}>{row.map((v, c) => <i key={c} style={v ? { background: PIECES[s.next].color } : undefined} />)}</div>
            ))}
          </div>
        )}
      </div>
      <div className="gm-well"
        onPointerDown={e => { touch.current = { x: e.clientX, y: e.clientY } }}
        onPointerUp={e => {
          if (!touch.current) return
          const dx = e.clientX - touch.current.x, dy = e.clientY - touch.current.y
          touch.current = null
          if (!s.started || s.over) { act('start'); return }
          if (Math.abs(dx) < 20 && Math.abs(dy) < 20) act('rotate')
          else if (Math.abs(dx) > Math.abs(dy)) {
            const steps = Math.max(1, Math.round(Math.abs(dx) / 28))
            for (let i = 0; i < steps; i++) act(dx > 0 ? 'right' : 'left')
          } else if (dy > 0) act('drop')
        }}>
        {cells.map((row, r) => row.map((color, c) => (
          <i key={`${r}-${c}`} style={color ? { background: color } : undefined} className={color ? 'on' : ''} />
        )))}
        {(!s.started || s.over) && (
          <div className="msg">
            <b>{s.over ? `${s.lines} lines` : '🧱 Block Drop'}</b>
            <span>{s.over ? 'Topped out! Tap to play again.' : 'Tap to rotate · swipe ← → to move · swipe ↓ to drop. Tap to start.'}</span>
          </div>
        )}
      </div>
      <div className="gm-ctrl">
        <button onPointerDown={tap('left')} aria-label="Left"><ChevronLeft size={22} /></button>
        <button onPointerDown={tap('rotate')} aria-label="Rotate"><RotateCw size={20} /></button>
        <button onPointerDown={tap('right')} aria-label="Right"><ChevronRight size={22} /></button>
        <button onPointerDown={tap('down')} aria-label="Down"><ArrowDown size={20} /></button>
        <button onPointerDown={tap('drop')} aria-label="Drop"><ChevronsDown size={22} /></button>
      </div>
    </div>
  )
}
