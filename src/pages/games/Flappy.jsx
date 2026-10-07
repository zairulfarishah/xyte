import { useEffect, useRef } from 'react'

const W = 360, H = 560, GROUND = 70
const BIRD_X = 96, R = 14
const GRAVITY = 0.42, FLAP = -7.4
const PIPE_W = 62, GAP = 152, SPACING = 215

function newState() {
  return { mode: 'ready', y: H / 2 - 40, vy: 0, pipes: [], score: 0, speed: 2.4, t: 0, overAt: 0 }
}

// Tap / click / Space to flap. Score = pipes passed.
export default function Flappy({ onGameOver }) {
  const canvasRef = useRef(null)
  const s = useRef(newState())
  const report = useRef(onGameOver)
  useEffect(() => { report.current = onGameOver }, [onGameOver])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const addPipe = x => {
      const top = 60 + Math.random() * (H - GROUND - GAP - 120)
      s.current.pipes.push({ x, top, passed: false })
    }

    const flap = () => {
      const g = s.current
      if (g.mode === 'over') {
        if (performance.now() - g.overAt < 700) return // don't restart from the tap that killed you
        s.current = newState()
        return
      }
      if (g.mode === 'ready') { g.mode = 'play'; addPipe(W + 40); addPipe(W + 40 + SPACING) }
      g.vy = FLAP
    }

    const die = () => {
      const g = s.current
      if (g.mode === 'over') return
      g.mode = 'over'
      g.overAt = performance.now()
      report.current?.(g.score)
    }

    let last = performance.now()
    let raf
    const frame = now => {
      const k = Math.min(2.5, (now - last) / (1000 / 60)) // frame-rate independent
      last = now
      const g = s.current
      g.t += k

      if (g.mode === 'ready') g.y = H / 2 - 40 + Math.sin(g.t / 10) * 6
      if (g.mode === 'play' || (g.mode === 'over' && g.y < H - GROUND - R)) {
        g.vy += GRAVITY * k
        g.y += g.vy * k
      }
      if (g.mode === 'play') {
        for (const p of g.pipes) {
          p.x -= g.speed * k
          if (!p.passed && p.x + PIPE_W < BIRD_X - R) { p.passed = true; g.score += 1; g.speed = Math.min(4.2, 2.4 + g.score * 0.05) }
          const inX = BIRD_X + R > p.x && BIRD_X - R < p.x + PIPE_W
          const inGap = g.y - R > p.top && g.y + R < p.top + GAP
          if (inX && !inGap) die()
        }
        if (g.pipes.length && g.pipes[0].x < -PIPE_W) g.pipes.shift()
        const lastPipe = g.pipes[g.pipes.length - 1]
        if (lastPipe && lastPipe.x < W - SPACING) addPipe(lastPipe.x + SPACING)
        if (g.y + R >= H - GROUND || g.y - R <= 0) die()
      }
      g.y = Math.min(g.y, H - GROUND - R)

      // ── draw ──
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#7dd3fc'); sky.addColorStop(1, '#e0f2fe')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(255,255,255,.8)'
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 130 - g.t * 0.4) % (W + 120) + W + 120) % (W + 120) - 60
        ctx.beginPath(); ctx.ellipse(cx, 70 + i * 38, 34, 13, 0, 0, Math.PI * 2); ctx.fill()
      }
      for (const p of g.pipes) {
        ctx.fillStyle = '#22c55e'
        ctx.fillRect(p.x, 0, PIPE_W, p.top)
        ctx.fillRect(p.x, p.top + GAP, PIPE_W, H - GROUND - p.top - GAP)
        ctx.fillStyle = '#15803d'
        ctx.fillRect(p.x - 4, p.top - 22, PIPE_W + 8, 22)
        ctx.fillRect(p.x - 4, p.top + GAP, PIPE_W + 8, 22)
      }
      ctx.fillStyle = '#ddd6a5'; ctx.fillRect(0, H - GROUND, W, GROUND)
      ctx.fillStyle = '#84cc16'; ctx.fillRect(0, H - GROUND, W, 12)

      const tilt = Math.max(-0.5, Math.min(1.2, g.vy / 10))
      ctx.save(); ctx.translate(BIRD_X, g.y); ctx.rotate(g.mode === 'ready' ? 0 : tilt)
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.ellipse(-4, 4, 8, 5, 0.3, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -5, 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(7.5, -5, 2.2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(21, 3); ctx.lineTo(11, 7); ctx.fill()
      ctx.restore()

      ctx.textAlign = 'center'
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(15,23,42,.55)'; ctx.fillStyle = '#fff'
      ctx.font = '900 46px Inter, system-ui, sans-serif'
      if (g.mode !== 'ready') { ctx.strokeText(g.score, W / 2, 80); ctx.fillText(g.score, W / 2, 80) }
      ctx.font = '800 20px Inter, system-ui, sans-serif'
      if (g.mode === 'ready') { ctx.strokeText('Tap to fly', W / 2, H / 2 + 50); ctx.fillText('Tap to fly', W / 2, H / 2 + 50) }
      if (g.mode === 'over') {
        ctx.fillStyle = 'rgba(15,23,42,.45)'; ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#fff'; ctx.font = '900 34px Inter, system-ui, sans-serif'
        ctx.fillText('Game over', W / 2, H / 2 - 30)
        ctx.font = '700 18px Inter, system-ui, sans-serif'
        ctx.fillText(`Score ${g.score}`, W / 2, H / 2 + 6)
        if (performance.now() - g.overAt > 700) ctx.fillText('Tap to play again', W / 2, H / 2 + 44)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onKey = e => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap() }
    }
    const onDown = e => { e.preventDefault(); flap() }
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return <canvas ref={canvasRef} className="gm-canvas" style={{ aspectRatio: `${W} / ${H}` }} />
}
