import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Newspaper, FileText, MapPin, CalendarDays, Users, BarChart3, BookOpen, Coffee, Layers, Wrench, Crosshair, UserRound,
  Search, LayoutGrid, Home, Clock, Settings, Box, X, ChevronRight, LogOut,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useOfficeData } from './useOfficeData'
import Welcome from './Welcome'
import './photo.css'

// Home page (/): the office photo with live pins on the objects they stand for, a "Today" card,
// search, and a bottom bar. The live 3D office is one click away (/office).
// Numbers come from useOfficeData; when a query fails the pin shows a plain subtitle, never a made-up number.

const TZ = 'Asia/Kuala_Lumpur'
const IMG = { src: '/office/office-day.webp', w: 1672, h: 941 }
const stored = k => { try { return localStorage.getItem(k) } catch { return null } }
const keep = (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } }
const nowText = () => {
  const d = new Date()
  return { t: d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }), d: d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }) }
}
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const names = list => list.length <= 2 ? list.join(', ') : `${list.slice(0, 2).join(', ')} +${list.length - 2}`

// x / y = % of the picture, on the object. v = icon above the label (picture frames).
function pinsFor(d, feedUnread) {
  const crew = d?.crew || []
  const onSite = crew.filter(c => c.status === 'site')
  const inOffice = crew.filter(c => c.status === 'office')
  const allOff = d && crew.length > 0 && crew.every(c => c.status === 'off')
  const siteDays = d?.weekGrid ? d.weekGrid.reduce((n, r) => n + r.days.filter(x => x === 's').length, 0) : null
  return [
    { k: 'feed', title: 'Feed', to: '/feed', Icon: Newspaper, x: 9, y: 46, dot: feedUnread > 0,
      sub: feedUnread > 0 ? <><em>{feedUnread}</em> unread</> : 'Latest updates' },
    { k: 'claims', title: 'Claims & Reports', to: '/claim', Icon: FileText, x: 32, y: 33,
      sub: d?.approvals > 0 ? <><em>{d.approvals}</em> waiting</> : 'Claims and reports' },
    { k: 'sites', title: 'Sites', to: '/sites', Icon: MapPin, x: 42.2, y: 21, v: true,
      sub: d ? <><em>{d.todaySites.length}</em> today</> : 'Project sites' },
    { k: 'schedule', title: 'Schedule', to: '/timecard', Icon: CalendarDays, x: 51.9, y: 20.5, v: true,
      sub: siteDays != null ? <><em>{siteDays}</em> site days this week</> : 'View schedules' },
    { k: 'team', title: 'Team', to: '/team', Icon: Users, x: 63.4, y: 19.5, v: true,
      sub: d ? <><em>{onSite.length}</em> on site</> : 'Our people' },
    { k: 'dashboard', title: 'Dashboard', to: '/dashboard', Icon: BarChart3, x: 56.5, y: 42, sub: 'Operations overview' },
    { k: 'crew', title: 'Crew today', to: '/team', Icon: UserRound, x: 39.5, y: 55,
      sub: !d ? 'Who is where' : allOff ? 'Day off' : onSite.length ? `${names(onSite.map(c => c.name))} on site` : `${plural(inOffice.length, 'person', 'people')} in office` },
    { k: 'break', title: 'Break Room', to: '/break-room', Icon: Coffee, x: 69.5, y: 40,
      sub: d?.lunch?.status === 'open' ? <>Lunch round <em>open</em></> : d?.unpaidShares > 0 ? <><em>{d.unpaidShares}</em> unpaid shares</> : 'Relax & recharge' },
    { k: 'library', title: 'Library', to: '/library', Icon: BookOpen, x: 82.5, y: 20.5,
      sub: d?.library?.expiring > 0 ? <><em>{d.library.expiring}</em> cert expiring</> : 'Resources & docs' },
    { k: 'layout', title: 'Site Layouts', to: '/layout', Icon: Layers, x: 50.5, y: 60.5, sub: 'Structural layouts' },
    { k: 'pdf', title: 'PDF Tools', to: '/tools', Icon: Wrench, x: 17.5, y: 70, sub: 'Merge, split, compress' },
    { k: 'scan', title: 'Scan Points', to: '/scan-points', Icon: Crosshair, x: 86.5, y: 64,
      sub: d?.scanProjects > 0 ? <><em>{d.scanProjects}</em> projects</> : 'Mark drill points' },
  ]
}

export default function PhotoHome({ nav = [], badges = {}, onSignOut, onMenu, menuOpen }) {
  const navigate = useNavigate()
  const { firstName, fullName, avatarUrl, user } = useAuth()
  const { data, error } = useOfficeData()
  const viewRef = useRef(null), sceneRef = useRef(null), searchRef = useRef(null)
  const [clock, setClock] = useState(nowText)
  const [todayOpen, setTodayOpen] = useState(() => stored('xyte-today') !== 'closed')
  const [sheet, setSheet] = useState(false)
  const [avatarMenu, setAvatarMenu] = useState(false)
  const [q, setQ] = useState('')
  const [hit, setHit] = useState(0)

  const pins = useMemo(() => pinsFor(data, badges['/feed'] || 0), [data, badges])

  useEffect(() => { const t = setInterval(() => setClock(nowText()), 15000); return () => clearInterval(t) }, [])

  // The picture covers the screen. On narrow screens it is wider than the screen and scrolls sideways.
  useLayoutEffect(() => {
    const view = viewRef.current, scene = sceneRef.current
    if (!view || !scene) return undefined
    const fit = () => {
      const vw = view.clientWidth, vh = view.clientHeight, s = Math.max(vw / IMG.w, vh / IMG.h, 760 / IMG.w)
      scene.style.width = `${IMG.w * s}px`; scene.style.height = `${Math.max(vh, IMG.h * s)}px`
      view.scrollLeft = (IMG.w * s - vw) / 2
    }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(view)
    return () => ro.disconnect()
  }, [])

  // Drag sideways with the mouse (touch scrolls natively)
  useEffect(() => {
    const view = viewRef.current; if (!view) return undefined
    let drag = null
    const down = e => { if (e.pointerType === 'mouse' && e.button === 0 && !e.target.closest('a, button')) drag = { x: e.clientX, l: view.scrollLeft } }
    const move = e => { if (drag) view.scrollLeft = drag.l - (e.clientX - drag.x) }
    const up = () => { drag = null }
    view.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { view.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  // Search: pages, today's sites, people
  const pages = useMemo(() => {
    const flat = nav.flatMap(i => i.items ? i.items.map(x => ({ ...x, group: i.label })) : [i]).filter(i => i.to && i.to !== '/')
    const extra = [{ to: '/office', label: 'Live 3D office', group: 'Home' }, { to: '/tools', label: 'PDF Tools', group: 'Program' }, { to: '/calendar', label: 'Calendar', group: 'Sites' }, { to: '/map', label: 'Map', group: 'Sites' }]
    const seen = new Set()
    return [...flat, ...extra].filter(p => !seen.has(p.to) && seen.add(p.to))
  }, [nav])
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    const out = [
      ...pages.filter(p => p.label.toLowerCase().includes(t)).map(p => ({ key: 'p' + p.to, label: p.label, meta: p.group || 'Page', to: p.to })),
      ...(data?.todaySites || []).filter(s => `${s.name} ${s.place || ''}`.toLowerCase().includes(t)).map(s => ({ key: 's' + s.id, label: s.name, meta: `Site today${s.place ? ` · ${s.place}` : ''}`, to: `/sites/${s.id}` })),
      ...(data?.crew || []).filter(c => `${c.name} ${c.fullName || ''}`.toLowerCase().includes(t)).map(c => ({ key: 'c' + c.id, label: c.fullName || c.name, meta: c.status === 'site' ? `On site · ${c.site}` : c.status === 'leave' ? 'On leave' : c.status === 'off' ? 'Off today' : 'In office', to: c.siteIds?.[0] ? `/sites/${c.siteIds[0]}` : '/team' })),
    ]
    return out.slice(0, 8)
  }, [q, pages, data])
  const openResult = r => { if (r) { setQ(''); navigate(r.to) } }

  // Keys: "/" focuses search, Esc closes things
  useEffect(() => {
    const onKey = e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape') { setSheet(false); setAvatarMenu(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleToday = () => setTodayOpen(o => { keep('xyte-today', o ? 'closed' : 'open'); return !o })
  const crew = data?.crew || []
  const sites = data?.todaySites || []
  const outCount = crew.filter(c => c.status === 'site' || c.status === 'leave').length
  const initials = (fullName || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const groups = [
    ['Pages', nav.filter(i => !i.items && i.to !== '/')],
    ...nav.filter(i => i.items).map(g => [g.label, g.items]),
    ['More', [{ to: '/tools', label: 'PDF Tools', Icon: Wrench }, { to: '/office', label: 'Live 3D office', Icon: Box }]],
  ]

  return (
    <div className="ph">
      <div className="ph-view" ref={viewRef}>
        <div className="ph-scene" ref={sceneRef} style={{ backgroundImage: `url(${IMG.src})` }}>
          <div className="ph-shade" />
          {pins.map(p => (
            <Link key={p.k} to={p.to} className={`ph-pin${p.v ? ' v' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <span className="ph-ring"><p.Icon size={20} strokeWidth={1.8} />{p.dot && <span className="ph-dot" />}</span>
              <span className="ph-chip"><span><b>{p.title}</b><small>{p.sub}</small></span><ChevronRight size={16} className="ph-chev" /></span>
            </Link>
          ))}
        </div>
      </div>

      <header className="ph-top">
        <button className="ph-brand" onClick={onMenu} aria-expanded={!!menuOpen} aria-label="Open the Xyte menu" title="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M5 13a6 6 0 0 1 6 6" stroke="#4fd36f" /><path d="M5 8a11 11 0 0 1 11 11" stroke="#38cc8a" /><path d="M5 3a16 16 0 0 1 16 16" stroke="#27c4a8" />
          </svg>
          <b>Xyte</b><span>XRADAR OFFICE</span>
        </button>

        <div className="ph-search">
          <Search size={17} />
          <input ref={searchRef} value={q} placeholder="Search pages, sites, people…" aria-label="Search" autoComplete="off"
            onChange={e => { setQ(e.target.value); setHit(0) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHit(h => Math.min(h + 1, results.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHit(h => Math.max(h - 1, 0)) }
              else if (e.key === 'Enter') openResult(results[hit])
              else if (e.key === 'Escape') { setQ(''); e.currentTarget.blur() }
            }} />
          {q.trim() && (
            <div className="ph-results" role="listbox">
              {results.length ? results.map((r, i) => (
                <button key={r.key} className={i === hit ? 'on' : ''} onMouseDown={e => { e.preventDefault(); openResult(r) }} role="option" aria-selected={i === hit}>
                  {r.label}<span>{r.meta}</span>
                </button>
              )) : <p>No match</p>}
            </div>
          )}
        </div>

        <div className="ph-right">
          <div className="ph-clock"><b>{clock.t}</b><small>{clock.d}</small></div>
          <div className="ph-me">
            <button className="ph-avatar" onClick={() => setAvatarMenu(o => !o)} aria-expanded={avatarMenu} aria-label="Account">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
            </button>
            {avatarMenu && (
              <div className="ph-menu">
                <p><b>{fullName}</b><span>{user?.email}</span></p>
                <button onClick={() => { setAvatarMenu(false); onMenu?.() }}><LayoutGrid size={14} /> Open menu</button>
                {onSignOut && <button className="out" onClick={onSignOut}><LogOut size={14} /> Sign out</button>}
              </div>
            )}
          </div>
        </div>
      </header>

      <section className={`ph-today${todayOpen ? '' : ' closed'}`} aria-label="Today">
        <button className="ph-fold" onClick={toggleToday} aria-expanded={todayOpen} aria-label={todayOpen ? 'Hide today' : 'Show today'}>{todayOpen ? '–' : '+'}</button>
        <h3>TODAY <span>{data ? `${plural(sites.length, 'site')} · ${outCount} out` : error ? '' : 'Loading…'}</span></h3>
        {todayOpen && (<>
          {!data && error && <p className="ph-empty">Couldn't load today's sites.</p>}
          {data && !sites.length && <p className="ph-empty">No site work today.</p>}
          {sites.slice(0, 4).map(s => (
            <Link key={s.id} to={`/sites/${s.id}`} className="ph-site">
              <b>{s.name}</b><time>{s.day}</time>
              <small>{[s.place, s.pic ? `${s.pic} (PIC)` : null, ...s.people.filter(p => p !== s.pic)].filter(Boolean).join(' · ') || 'No crew yet'}</small>
            </Link>
          ))}
          {sites.length > 4 && <Link className="ph-more" to="/sites">{sites.length - 4} more today →</Link>}
          <Link className="ph-more" to="/timecard">This week's schedule →</Link>
        </>)}
      </section>

      <footer className="ph-bottom">
        <button className="ph-pill" onClick={() => setSheet(true)}><LayoutGrid size={18} /><span>All Modules</span></button>
        <nav className="ph-nav" aria-label="Main">
          <Link to="/" className="on"><Home size={20} />Home</Link>
          <Link to="/sites"><MapPin size={20} />Sites</Link>
          <Link to="/timecard"><Clock size={20} />Timecard</Link>
          <Link to="/reports"><FileText size={20} />Reports</Link>
          <Link to="/settings" className="ph-set"><Settings size={20} />Settings</Link>
        </nav>
        <div className="ph-live">
          <small>Xradar Asia Sdn Bhd</small>
          <Link className="ph-pill" to="/office"><Box size={18} /><span>Live 3D office</span></Link>
        </div>
      </footer>

      {sheet && (
        <div className="ph-sheet" role="dialog" aria-label="All modules" onClick={e => { if (e.target === e.currentTarget) setSheet(false) }}>
          <div className="ph-box">
            <h2>All modules <button onClick={() => setSheet(false)} aria-label="Close"><X size={18} /></button></h2>
            {groups.filter(([, items]) => items.length).map(([h, items]) => (
              <div key={h}>
                <h6>{h}</h6>
                <div className="ph-grid">
                  {items.map(it => (
                    <Link key={it.to} to={it.to} onClick={() => setSheet(false)}>
                      {it.Icon && <it.Icon size={18} />}{it.label}
                      {badges[it.to] > 0 && <span className="ph-badge">{badges[it.to] > 9 ? '9+' : badges[it.to]}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Welcome name={firstName} data={data} />
    </div>
  )
}
