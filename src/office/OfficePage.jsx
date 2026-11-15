import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { createOffice, PANEL_W } from './engine'
import { useOfficeData } from './useOfficeData'
import OfficePanel from './panels'
import './office.css'

// The 3D virtual office home screen (/), shown full screen without the app's sidebar.
// A welcome card greets the person once per visit; click anywhere to enter.
// Click an object → the camera moves to it and a panel opens with a short summary and a link to its page.

const MENU = [
  ['Room', [['dashboard', 'Dashboard', 'wall TV'], ['sites', 'Sites', 'frame 1'], ['schedule', 'Schedule', 'frame 2'], ['team', 'Team', 'frame 3']]],
  ['Office', [['feed', 'Feed', 'notice board'], ['tasks', 'Tasks', 'whiteboard'], ['files', 'Claims & reports', 'cabinet'], ['library', 'Library', 'bookshelf']]],
  ['Crew', [['crew', 'Crew today', 'desks']]],
  ['Break', [['games', 'Games', 'green book'], ['pantry', 'Lunch & split bill', 'pantry']]],
  ['Programs', [['city', 'All programs', 'model table'], ['pt', 'PT Mapper', 'city'], ['scan', 'Scan Points', 'city'], ['layout', 'Site Layouts', 'city'], ['pdf', 'PDF Tools', 'city']]],
]
const TZ = 'Asia/Kuala_Lumpur'
const stored = k => { try { return localStorage.getItem(k) } catch { return null } }
const welcomed = () => { try { return sessionStorage.getItem('xyte-welcomed') === '1' } catch { return false } }
const touch = () => window.matchMedia?.('(pointer: coarse)').matches
const PROG_TITLES = {
  pt: { title: 'PT Mapper', sub: 'Post-tension cable mapping' }, scan: { title: 'Scan Points', sub: 'Mark drill points before drilling' },
  layout: { title: 'Site Layouts', sub: 'Structural layouts, sections, loads' }, pdf: { title: 'PDF Tools', sub: 'Merge, split, rotate, compress' },
}
const nowText = () => {
  const d = new Date()
  return { t: d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }), d: d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }) }
}

export default function OfficePage({ onSignOut, onMenu, menuOpen }) {
  const { isZairul, firstName } = useAuth()
  const { data, error, reload } = useOfficeData()
  const wrapRef = useRef(null), canvasRef = useRef(null), labelsRef = useRef(null), tipRef = useRef(null)
  const engineRef = useRef(null)
  const [focus, setFocus] = useState({ key: null, open: false })
  const [menu, setMenu] = useState(false)
  const [labelsOn, setLabelsOn] = useState(() => stored('xyte-labels') !== 'off')
  const [welcome, setWelcome] = useState(() => (welcomed() ? 'off' : 'on'))
  const [people, setPeople] = useState(() => (stored('xyte-people') === 'toon' ? 'toon' : 'model'))
  const [model, setModel] = useState('loading')
  const [hint, setHint] = useState('')
  const [doing, setDoing] = useState({})
  const [clock, setClock] = useState(nowText)
  const crewCount = data?.crew.length ?? -1

  // Fill the space under the top bar and above the phone bottom bar
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return
    const fit = () => { el.style.height = `${Math.max(320, window.innerHeight - el.getBoundingClientRect().top - (document.querySelector('.xt-bnav')?.offsetHeight || 0))}px` }
    fit(); window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => { const t = setInterval(() => setClock(nowText()), 15000); return () => clearInterval(t) }, [])

  // Build the scene once the crew is known (rebuilt only if the number of desks changes)
  useEffect(() => {
    if (crewCount < 0) return undefined
    const engine = createOffice({
      container: wrapRef.current, canvas: canvasRef.current, labelsEl: labelsRef.current, tipEl: tipRef.current,
      crew: data.crew,
      onFocus: (key, open) => setFocus({ key, open }),
      onHint: setHint, onPeople: setPeople, onModel: setModel,
      onDoing: (i, text) => setDoing(prev => (prev[i] === text ? prev : { ...prev, [i]: text })),
    })
    engineRef.current = engine
    engine.setTVData({ sites: data.todaySites, approvals: data.approvals })
    return () => { engine.dispose(); engineRef.current = null; setFocus({ key: null, open: false }) }
    // data is read once here; later updates go through setCrew / setTVData below
  }, [crewCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live data → desks, labels and TV
  useEffect(() => {
    const e = engineRef.current
    if (!e || !data) return
    e.setCrew(data.crew)
    e.setTVData({ sites: data.todaySites, approvals: data.approvals })
  }, [data])

  const go = useCallback(k => { setMenu(false); engineRef.current?.go(k) }, [])
  const goHome = useCallback(() => engineRef.current?.goHome(), [])
  const toggleLabels = useCallback(() => { const e = engineRef.current; if (!e) return; e.setLabels(!e.labels); setLabelsOn(e.labels) }, [])
  const togglePeople = useCallback(() => { const e = engineRef.current; if (!e) return; e.setPeopleMode(e.people === 'model' ? 'toon' : 'model') }, [])
  const enter = useCallback(() => {
    try { sessionStorage.setItem('xyte-welcomed', '1') } catch { /* storage blocked */ }
    setWelcome(w => (w === 'on' ? 'out' : w))
    setTimeout(() => setWelcome('off'), 600)
  }, [])

  useEffect(() => {
    const onKey = e => {
      if (welcome === 'on') { enter(); return }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return
      if (e.key === 'Escape') { if (menu) setMenu(false); else if (engineRef.current?.focused) goHome() }
      else if (e.key === 'm' || e.key === 'M') setMenu(m => !m)
      else if (e.key === 'l' || e.key === 'L') toggleLabels()
      else if (e.key === 'p' || e.key === 'P') togglePeople()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, goHome, toggleLabels, togglePeople, welcome, enter])

  const panel = !!(focus.open && focus.key && data)

  return (
    <div className="of" ref={wrapRef} style={{ '--panel-w': `${PANEL_W}px` }}>
      <canvas ref={canvasRef} className="of-canvas" tabIndex={0} aria-label="3D office. Use the All pages menu (M) to open any page." />
      <div ref={labelsRef} className={`of-labels${panel ? ' with-panel' : ''}`} aria-hidden="true" />

      <div className="of-top">
        <button className="of-brand" onClick={onMenu} aria-expanded={!!menuOpen} aria-label="Open the Xyte menu" title="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M5 13a6 6 0 0 1 6 6" stroke="#4fd36f" /><path d="M5 8a11 11 0 0 1 11 11" stroke="#38cc8a" /><path d="M5 3a16 16 0 0 1 16 16" stroke="#27c4a8" />
          </svg>
          <b>Xradar Office</b>
        </button>
        <div className="of-clock"><b>{clock.t}</b><span>{clock.d}</span></div>
      </div>

      {focus.key && <button className="of-btn of-back" onClick={goHome}><ArrowLeft size={14} /> Back to room <kbd>Esc</kbd></button>}

      <div className="of-bottom">
        <button className="of-btn" onClick={() => setMenu(m => !m)} aria-expanded={menu}>All pages <kbd>M</kbd></button>
        <button className="of-btn" onClick={toggleLabels} aria-pressed={labelsOn}>Labels: {labelsOn ? 'on' : 'off'} <kbd>L</kbd></button>
        {model !== 'none' && (
          <button className="of-btn" onClick={togglePeople} disabled={model === 'failed'} title={model === 'failed' ? 'The 3D people could not load; showing the built-in people' : ''}>
            People: {model === 'failed' || people === 'toon' ? 'cartoon' : '3D model'} <kbd>P</kbd>
          </button>
        )}
        {hint && !focus.key && <span className="of-hint">{hint}</span>}
      </div>

      {menu && (
        <nav className="of-menu" aria-label="All pages">
          {MENU.map(([h, items]) => (
            <div key={h}><h6>{h}</h6>{items.map(([k, l, w]) => <button key={k} onClick={() => go(k)}>{l}<span>{w}</span></button>)}</div>
          ))}
          <div><h6>Pages</h6><Link to="/dashboard">Dashboard page<span>classic view</span></Link>
            {onSignOut && <button onClick={onSignOut}><span className="of-out"><LogOut size={13} /> Sign out</span><span /></button>}
          </div>
        </nav>
      )}

      <div ref={tipRef} className="of-tip"><b /><span /></div>

      <aside className={`of-panel${panel ? ' open' : ''}`} aria-hidden={!panel}>
        {panel && <OfficePanel k={focus.key} onClose={goHome}
          ctx={{ data, crew: data.crew.slice(0, 12), doing, isZairul, go, hotspotTitle: k => PROG_TITLES[k] }} />}
      </aside>

      {welcome !== 'off' && <Welcome name={firstName} data={data} out={welcome === 'out'} onEnter={enter} />}
      {!data && !error && <div className="of-loader"><div>Opening the office<i><b /></i></div></div>}
      {error && !data && (
        <div className="of-loader"><div className="of-fail">
          <b>Couldn't load the office.</b><span>{error}</span>
          <div><button className="of-btn primary" onClick={reload}>Try again</button><Link className="of-btn" to="/dashboard">Open the dashboard</Link></div>
        </div></div>
      )}
    </div>
  )
}

export function Welcome({ name, data, out, onEnter }) {
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
    <div className={`of-welcome${out ? ' out' : ''}`} onPointerDown={onEnter} role="button" tabIndex={0} aria-label="Enter the office">
      <div className="of-welcome-in">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M5 13a6 6 0 0 1 6 6" stroke="#4fd36f" /><path d="M5 8a11 11 0 0 1 11 11" stroke="#38cc8a" /><path d="M5 3a16 16 0 0 1 16 16" stroke="#27c4a8" />
        </svg>
        <p className="of-welcome-k">{part}</p>
        <h1>Welcome, {name}</h1>
        <p className="of-welcome-d">{now.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        {facts && <div className="of-welcome-f">{facts.map(([n, l]) => <span key={l}><b>{n}</b>{l}</span>)}</div>}
      </div>
      <p className="of-welcome-h">{touch() ? 'Tap' : 'Click'} anywhere to enter</p>
    </div>
  )
}
