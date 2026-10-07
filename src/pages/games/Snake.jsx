import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'

const CELLS = 18, SIZE = 20, W = CELLS * SIZE
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

function newState() {
  const mid = Math.floor(CELLS / 2)
  return { mode: 'ready', snake: [[mid, mid], [mid - 1, mid], [mid - 2, mid]], dir: 'right', queue: [], food: [mid + 4, mid], score: 0, overAt: 0 }
}
function placeFood(snake) {
  for (;;) {
    const f = [Math.floor(Math.random() * CELLS), Math.floor(Math.random() * CELLS)]
    if (!snake.some(([x, y]) => x === f[0] && y === f[1])) return f
  }
}

// Arrow keys, swipe or the on-screen pad. Score = food eaten.
export default function Snake({ onGameOver }) {
  const canvasRef = useRef(null)
  const s = useRef(newState())
  const report = useRef(onGameOver)
  const steer = useRef(() => {})
  useEffect(() => { report.current = onGameOver }, [onGameOver])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = W * dpr
    ctx.scale(dpr, dpr)

    steer.current = dir => {
      const g = s.current
      if (g.mode === 'over') {
        if (performance.now() - g.overAt < 600) return
        s.current = newState()
        return
      }
      if (g.mode === 'ready') g.mode = 'play'
      // Queue turns so two quick presses between ticks both count, but never a U-turn
      const lastDir = g.queue[g.queue.length - 1] || g.dir
      if (dir !== lastDir && dir !== OPPOSITE[lastDir] && g.queue.length < 3) g.queue.push(dir)
    }

    const draw = () => {
      const g = s.current
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, W)
      ctx.fillStyle = '#16213a'
      for (let x = 0; x < CELLS; x++) for (let y = 0; y < CELLS; y++) if ((x + y) % 2) ctx.fillRect(x * SIZE, y * SIZE, SIZE, SIZE)
      ctx.fillStyle = '#ef4444'
      ctx.beginPath(); ctx.arc(g.food[0] * SIZE + SIZE / 2, g.food[1] * SIZE + SIZE / 2, SIZE / 2 - 3, 0, Math.PI * 2); ctx.fill()
      g.snake.forEach(([x, y], i) => {
        ctx.fillStyle = i === 0 ? '#4ade80' : `hsl(142 70% ${Math.max(30, 48 - i * 0.8)}%)`
        ctx.beginPath(); ctx.roundRect(x * SIZE + 1.5, y * SIZE + 1.5, SIZE - 3, SIZE - 3, 5); ctx.fill()
      })
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'
      if (g.mode === 'ready') { ctx.font = '800 18px Inter, system-ui, sans-serif'; ctx.fillText('Press an arrow or swipe to start', W / 2, W / 2 + 60) }
      if (g.mode === 'over') {
        ctx.fillStyle = 'rgba(2,6,23,.6)'; ctx.fillRect(0, 0, W, W)
        ctx.fillStyle = '#fff'; ctx.font = '900 30px Inter, system-ui, sans-serif'; ctx.fillText('Game over', W / 2, W / 2 - 16)
        ctx.font = '700 16px Inter, system-ui, sans-serif'
        ctx.fillText(`Score ${g.score}`, W / 2, W / 2 + 14)
        ctx.fillText('Arrow / swipe to play again', W / 2, W / 2 + 42)
      }
    }

    let timer
    const tick = () => {
      const g = s.current
      if (g.mode === 'play') {
        if (g.queue.length) g.dir = g.queue.shift()
        const [dx, dy] = DIRS[g.dir]
        const head = [g.snake[0][0] + dx, g.snake[0][1] + dy]
        const eats = head[0] === g.food[0] && head[1] === g.food[1]
        const body = eats ? g.snake : g.snake.slice(0, -1)
        const hit = head[0] < 0 || head[1] < 0 || head[0] >= CELLS || head[1] >= CELLS || body.some(([x, y]) => x === head[0] && y === head[1])
        if (hit) {
          g.mode = 'over'
          g.overAt = performance.now()
          report.current?.(g.score)
        } else {
          g.snake = [head, ...body]
          if (eats) { g.score += 1; g.food = placeFood(g.snake) }
        }
      }
      draw()
      // Speeds up as the snake grows
      timer = setTimeout(tick, Math.max(65, 140 - s.current.score * 3))
    }
    tick()

    const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }
    const onKey = e => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      const dir = keys[e.key]
      if (dir) { e.preventDefault(); steer.current(dir) }
    }
    let start = null
    const onDown = e => { start = { x: e.clientX, y: e.clientY } }
    const onUp = e => {
      if (!start) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      start = null
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return
      steer.current(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
    }
    window.addEventListener('keydown', onKey)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
    }
  }, [])

  const pad = (dir, Icon, area) => (
    <button style={{ gridArea: area }} onPointerDown={e => { e.preventDefault(); steer.current(dir) }} aria-label={dir}><Icon size={20} /></button>
  )
  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
      <canvas ref={canvasRef} className="gm-canvas" style={{ aspectRatio: '1 / 1', touchAction: 'none' }} />
      <div className="gm-pad">
        {pad('up', ArrowUp, 'u')}{pad('left', ArrowLeft, 'l')}{pad('right', ArrowRight, 'r')}{pad('down', ArrowDown, 'd')}
      </div>
    </div>
  )
}
