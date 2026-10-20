import { useEffect, useRef, useState } from 'react'

const PADS = [
  { base: '#15803d', lit: '#4ade80', hz: 392 },
  { base: '#b91c1c', lit: '#f87171', hz: 330 },
  { base: '#a16207', lit: '#facc15', hz: 262 },
  { base: '#1d4ed8', lit: '#60a5fa', hz: 196 },
]
const randomPad = () => Math.floor(Math.random() * PADS.length)

// One short tone per pad; silently skipped where audio isn't allowed
let audio = null
function beep(hz, ms = 220) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)()
    const osc = audio.createOscillator(), gain = audio.createGain()
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.12, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000)
    osc.connect(gain).connect(audio.destination)
    osc.start(); osc.stop(audio.currentTime + ms / 1000)
  } catch { /* no audio */ }
}

// Watch the sequence, then repeat it. Each round adds one step and plays a little faster.
// Score = longest sequence repeated correctly.
export default function Simon({ onGameOver }) {
  const [phase, setPhase] = useState('idle') // idle | show | input | over
  const [seq, setSeq] = useState([])
  const [pos, setPos] = useState(0)
  const [lit, setLit] = useState(null)
  const timers = useRef([])

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clearTimers, [])

  useEffect(() => {
    if (phase !== 'show') return undefined
    const gap = Math.max(260, 620 - seq.length * 25)
    seq.forEach((pad, i) => {
      timers.current.push(setTimeout(() => { setLit(pad); beep(PADS[pad].hz, gap * 0.55) }, 500 + i * gap))
      timers.current.push(setTimeout(() => setLit(null), 500 + i * gap + gap * 0.6))
    })
    timers.current.push(setTimeout(() => { setPos(0); setPhase('input') }, 500 + seq.length * gap))
    return clearTimers
  }, [phase, seq])

  function start() {
    clearTimers()
    setSeq([randomPad()]); setPos(0); setPhase('show')
  }

  function press(i) {
    if (phase !== 'input') return
    setLit(i); beep(PADS[i].hz, 160)
    timers.current.push(setTimeout(() => setLit(l => (l === i ? null : l)), 160))
    if (seq[pos] !== i) {
      beep(110, 500)
      setPhase('over')
      onGameOver?.(seq.length - 1)
      return
    }
    if (pos + 1 === seq.length) {
      setSeq(s => [...s, randomPad()])
      setPhase('show')
    } else setPos(p => p + 1)
  }

  const status = {
    idle: 'Tap Start, watch the pads, then repeat them in order',
    show: 'Watch…',
    input: `Your turn — ${pos} of ${seq.length}`,
    over: `Wrong pad! You reached ${seq.length - 1} step${seq.length - 1 === 1 ? '' : 's'}`,
  }[phase]

  return (
    <div className="gm-simon">
      <div className="gm-bar">
        <div className="gm-stat dark"><small>Round</small><b>{Math.max(seq.length, 0)}</b></div>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: phase === 'over' ? '#b91c1c' : '#475569' }}>{status}</span>
      </div>
      <div className="gm-pads">
        {PADS.map((p, i) => (
          <button key={i} style={{ background: lit === i ? p.lit : p.base, boxShadow: lit === i ? `0 0 28px ${p.lit}` : undefined }}
            onPointerDown={e => { e.preventDefault(); press(i) }} aria-label={`Pad ${i + 1}`} />
        ))}
        {(phase === 'idle' || phase === 'over') && (
          <button className="gm-simon-go" onClick={start}>{phase === 'over' ? 'Again' : 'Start'}</button>
        )}
      </div>
    </div>
  )
}
