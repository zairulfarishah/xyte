import { useCallback, useEffect, useState } from 'react'
import './welcome.css'

// "Welcome, {name}" card shown once per browser visit (session) on the home page.
// Click, tap or any key dismisses it. Shared by the photo home and the 3D office.

const TZ = 'Asia/Kuala_Lumpur'
const KEY = 'xyte-welcomed'
const seen = () => { try { return sessionStorage.getItem(KEY) === '1' } catch { return false } }
const touch = () => window.matchMedia?.('(pointer: coarse)').matches

export default function Welcome({ name, data }) {
  const [state, setState] = useState(() => (seen() ? 'off' : 'on'))

  const enter = useCallback(() => {
    try { sessionStorage.setItem(KEY, '1') } catch { /* storage blocked */ }
    setState(s => (s === 'on' ? 'out' : s))
  }, [])

  useEffect(() => {
    if (state !== 'on') return undefined
    // capture phase, so the keypress that dismisses the card doesn't also trigger page shortcuts
    const onKey = e => { e.stopImmediatePropagation(); enter() }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [state, enter])

  useEffect(() => {
    if (state !== 'out') return undefined
    const t = setTimeout(() => setState('off'), 600)
    return () => clearTimeout(t)
  }, [state])

  if (state === 'off') return null
  const now = new Date()
  const hr = Number(now.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }))
  const part = hr < 12 ? 'Good morning' : hr < 19 ? 'Good afternoon' : 'Good evening'
  const crew = data?.crew || []
  const facts = data ? [
    [data.todaySites?.length ?? 0, 'sites today'],
    [crew.filter(c => c.status === 'site').length, 'on site'],
    [crew.filter(c => c.status === 'office').length, 'in the office'],
    [crew.filter(c => c.status === 'leave').length, 'on leave'],
  ] : null

  return (
    <div className={`xw${state === 'out' ? ' out' : ''}`} onPointerDown={enter} role="button" tabIndex={0} aria-label="Enter Xyte">
      <div className="xw-in">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M5 13a6 6 0 0 1 6 6" stroke="#4fd36f" /><path d="M5 8a11 11 0 0 1 11 11" stroke="#38cc8a" /><path d="M5 3a16 16 0 0 1 16 16" stroke="#27c4a8" />
        </svg>
        <p className="xw-k">{part}</p>
        <h1>Welcome, {name}</h1>
        <p className="xw-d">{now.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        {facts && <div className="xw-f">{facts.map(([n, l]) => <span key={l}><b>{n}</b>{l}</span>)}</div>}
      </div>
      <p className="xw-h">{touch() ? 'Tap' : 'Click'} anywhere to enter</p>
    </div>
  )
}
