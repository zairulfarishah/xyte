import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Search, Bell, X, MapPin, Users, Plus, LogOut, Menu } from 'lucide-react'
import { supabase } from './supabase'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useViewport } from './utils/useViewport'

const LoginPage = lazy(() => import('./pages/LoginPage'))

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Sites = lazy(() => import('./pages/Sites'))
const SiteDetail = lazy(() => import('./pages/SiteDetail'))
const MapView = lazy(() => import('./pages/MapView'))
const Team = lazy(() => import('./pages/Team'))
const CalendarPage = lazy(() => import('./pages/Calendar'))
const Library = lazy(() => import('./pages/Library'))
const Reports = lazy(() => import('./pages/Reports'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sites', label: 'Sites', end: false },
  { to: '/map', label: 'Map', end: false },
  { to: '/team', label: 'Team', end: false },
  { to: '/calendar', label: 'Calendar', end: false },
  { to: '/library', label: 'Library', end: false },
  { to: '/reports', label: 'Reports', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function SearchOverlay({ onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ sites: [], members: [] })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults({ sites: [], members: [] })
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      const [{ data: sites }, { data: members }] = await Promise.all([
        supabase.from('sites')
          .select('id, site_name, location, site_status, site_type')
          .ilike('site_name', `%${query}%`)
          .limit(6),
        supabase.from('team_members')
          .select('id, full_name, role')
          .ilike('full_name', `%${query}%`)
          .limit(4),
      ])
      setResults({ sites: sites || [], members: members || [] })
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  function go(path) {
    navigate(path)
    onClose()
  }

  const STATUS_DOT = {
    upcoming: '#eab308',
    ongoing: '#f97316',
    completed: '#22c55e',
    cancelled: '#ef4444',
    postponed: '#94a3b8',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '80px' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '560px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <Search size={18} color="#94a3b8" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onClose()}
            placeholder="Search sites, team members..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px', color: '#0f172a', background: 'none' }}
          />
          {loading && <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.6s linear infinite' }} />}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        {results.sites.length > 0 || results.members.length > 0 ? (
          <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
            {results.sites.length > 0 && (
              <>
                <p style={{ padding: '10px 20px 4px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sites</p>
                {results.sites.map(site => (
                  <div
                    key={site.id}
                    onClick={() => go(`/sites/${site.id}`)}
                    style={{ padding: '10px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MapPin size={14} color="#2563eb" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.site_name}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{site.location}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: STATUS_DOT[site.site_status] || '#94a3b8' }} />
                      <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'capitalize' }}>{site.site_status}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
            {results.members.length > 0 && (
              <>
                <p style={{ padding: '10px 20px 4px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team</p>
                {results.members.map((m, i) => (
                  <div
                    key={m.id}
                    onClick={() => go('/team')}
                    style={{ padding: '10px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: ['#2563eb', '#7c3aed', '#db2777', '#059669'][i % 4], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Users size={14} color="white" />
                    </div>
                    <div>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>{m.full_name}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{m.role}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : query.trim() && !loading ? (
          <p style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No results for "{query}"</p>
        ) : !query.trim() ? (
          <p style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Type to search sites or team members...</p>
        ) : null}
      </div>
    </div>
  )
}

function NotifDropdown({ notifs, lastSeen, onClose }) {
  return (
    <div style={{ position: 'absolute', right: 0, top: '46px', width: '320px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 12px 40px rgba(0,0,0,0.18)', zIndex: 1100, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a' }}>Notifications</p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {notifs.length === 0 ? (
          <p style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No activity yet.</p>
        ) : notifs.map(n => {
          const isNew = new Date(n.created_at) > new Date(lastSeen)
          return (
            <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f8fafc', background: isNew ? '#f0f9ff' : 'white', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isNew ? '#2563eb' : '#e2e8f0', flexShrink: 0, marginTop: '4px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>{n.actor}</p>
                <p style={{ fontSize: '12px', color: '#475569', marginTop: '2px', lineHeight: 1.4 }}>{n.message}</p>
                <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>{timeAgo(n.created_at)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div style={{ minHeight: 'calc(100vh - 54px)', display: 'grid', placeItems: 'center', padding: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#475569', fontSize: '14px', fontWeight: '600' }}>
        <div
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            border: '2px solid #dbeafe',
            borderTopColor: '#2563eb',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        Loading page...
      </div>
    </div>
  )
}

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, fullName, avatarUrl, memberId } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [lastSeen, setLastSeen] = useState(() => localStorage.getItem('xyte_notif_seen') || '1970-01-01')
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const notifRef = useRef(null)
  const avatarRef = useRef(null)
  const { isMobile, isTablet } = useViewport()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function handle(e) {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  function handleOpenAddSite() {
    if (location.pathname === '/' || location.pathname === '/sites') {
      window.dispatchEvent(new CustomEvent('xyte:open-add-site'))
      return
    }
    navigate('/sites', { state: { openAdd: true } })
  }

  useEffect(() => {
    if (user) fetchNotifs()
  }, [user, memberId])

  useEffect(() => {
    if (!user) return undefined
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, ({ new: n }) => {
        if (!n.recipient_id || !memberId || n.recipient_id === memberId) {
          setNotifs(prev => [n, ...prev].slice(0, 30))
        }
      })
      .subscribe()
    const onSaved = () => fetchNotifs()
    window.addEventListener('xyte:site-saved', onSaved)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('xyte:site-saved', onSaved)
    }
  }, [user, memberId])

  useEffect(() => {
    function handle(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function fetchNotifs() {
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    if (memberId) {
      query = query.or(`recipient_id.is.null,recipient_id.eq.${memberId}`)
    }
    const { data, error } = await query
    if (error) console.error('fetchNotifs error:', error)
    setNotifs(data || [])
  }

  function handleBell() {
    const wasOpen = notifOpen
    setNotifOpen(o => !o)
    if (!wasOpen) {
      const now = new Date().toISOString()
      setLastSeen(now)
      localStorage.setItem('xyte_notif_seen', now)
    }
  }

  const unread = notifs.filter(n => new Date(n.created_at) > new Date(lastSeen)).length

  const desktopNavStyle = ({ isActive }) => ({
    padding: '8px 14px',
    borderRadius: '999px',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.15s',
    background: isActive ? '#2563eb' : 'transparent',
    color: isActive ? 'white' : '#94a3b8',
    whiteSpace: 'nowrap',
    boxShadow: isActive ? '0 8px 18px rgba(37,99,235,0.28)' : 'none',
  })

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a' }}>
      <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #1e3a8a', borderTopColor: '#2563eb', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (!user) return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f1f5f9' }}>
      <nav style={{
        background: '#0f172a',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '8px' : '0',
        padding: isMobile ? '8px 12px' : isTablet ? '12px 18px' : '14px 28px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        borderBottom: '1px solid #1e293b',
      }}>
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', minHeight: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <button
                onClick={() => setMobileMenuOpen(open => !open)}
                style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
              </button>

              <NavLink to="/" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
                  <span style={{ fontSize: '18px', fontWeight: '900', color: '#22c55e', letterSpacing: '-0.03em', lineHeight: 1, textShadow: '0 0 12px rgba(34,197,94,0.5), 0 0 32px rgba(34,197,94,0.15)' }}>X</span>
                  <span style={{ fontSize: '18px', fontWeight: '200', color: 'rgba(255,255,255,0.88)', letterSpacing: '0.02em', lineHeight: 1 }}>yte</span>
                </div>
              </NavLink>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => setSearchOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 0, transition: 'color 0.15s' }}>
                <Search size={17} />
              </button>

              <div ref={notifRef} style={{ position: 'relative' }}>
                <button onClick={handleBell} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 0, position: 'relative', transition: 'color 0.15s' }}>
                  <Bell size={17} />
                  {unread > 0 && (
                    <span style={{ position: 'absolute', top: '-5px', right: '-5px', width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444', color: 'white', fontSize: '9px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0f172a' }}>
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                {notifOpen && <NotifDropdown notifs={notifs} lastSeen={lastSeen} onClose={() => setNotifOpen(false)} />}
              </div>

              <div ref={avatarRef} style={{ position: 'relative' }}>
                <button onClick={() => setAvatarOpen(o => !o)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1d4ed8', border: 'none', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                  }
                </button>
                {avatarOpen && (
                  <div style={{ position: 'absolute', right: 0, top: '42px', width: '200px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 12px 40px rgba(0,0,0,0.18)', zIndex: 1100, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
                    </div>
                    <button onClick={handleSignOut} style={{ width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '13px', fontWeight: '500' }}>
                      <LogOut size={14} /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isMobile && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isTablet ? '1fr' : 'minmax(160px,220px) minmax(0,1fr) minmax(220px,280px)',
            alignItems: 'center',
            gap: isTablet ? '12px' : '18px',
            minHeight: isTablet ? 'auto' : '72px',
            width: '100%',
          }}>
            <NavLink to="/" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: isTablet ? 'center' : 'flex-start', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
                <span style={{ fontSize: '20px', fontWeight: '900', color: '#22c55e', letterSpacing: '-0.03em', lineHeight: 1, textShadow: '0 0 12px rgba(34,197,94,0.5), 0 0 32px rgba(34,197,94,0.15)' }}>X</span>
                <span style={{ fontSize: '20px', fontWeight: '200', color: 'rgba(255,255,255,0.88)', letterSpacing: '0.02em', lineHeight: 1 }}>yte</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                <div style={{ height: '1.5px', width: '44px', borderRadius: '99px', background: 'linear-gradient(90deg,#22c55e,rgba(34,197,94,0))', opacity: 0.95 }} />
                <div style={{ height: '1.5px', width: '28px', borderRadius: '99px', background: 'linear-gradient(90deg,#22c55e,rgba(34,197,94,0))', opacity: 0.55 }} />
                <div style={{ height: '1.5px', width: '14px', borderRadius: '99px', background: 'linear-gradient(90deg,#22c55e,rgba(34,197,94,0))', opacity: 0.28 }} />
              </div>
            </NavLink>

            <div style={{ width: '100%', overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '999px', padding: '4px', width: 'max-content', maxWidth: '100%' }}>
                {NAV.map(({ to, label, end }) => (
                  <NavLink key={to} to={to} end={end} style={desktopNavStyle}>
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: isTablet ? 'center' : 'flex-end', minWidth: 0 }}>
              <button
                onClick={handleOpenAddSite}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', border: 'none', cursor: 'pointer', color: 'white', padding: '10px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', transition: 'background 0.15s, transform 0.15s', boxShadow: '0 10px 25px rgba(37,99,235,0.28)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#1d4ed8'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#2563eb'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <Plus size={13} /> Add Site
              </button>

              <button onClick={() => setSearchOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 0, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'white'}
                onMouseLeave={e => e.currentTarget.style.color = '#64748b'}>
                <Search size={17} />
              </button>

              <div ref={notifRef} style={{ position: 'relative' }}>
                <button onClick={handleBell} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 0, position: 'relative', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'white'}
                  onMouseLeave={e => e.currentTarget.style.color = '#64748b'}>
                  <Bell size={17} />
                  {unread > 0 && (
                    <span style={{ position: 'absolute', top: '-5px', right: '-5px', width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444', color: 'white', fontSize: '9px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0f172a' }}>
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                {notifOpen && <NotifDropdown notifs={notifs} lastSeen={lastSeen} onClose={() => setNotifOpen(false)} />}
              </div>

              <div ref={avatarRef} style={{ position: 'relative' }}>
                <button onClick={() => setAvatarOpen(o => !o)} style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#1d4ed8', border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '11px', cursor: 'pointer', boxShadow: '0 8px 18px rgba(15,23,42,0.3)' }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                  }
                </button>
                {avatarOpen && (
                  <div style={{ position: 'absolute', right: 0, top: '42px', width: '200px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 12px 40px rgba(0,0,0,0.18)', zIndex: 1100, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
                    </div>
                    <button onClick={handleSignOut} style={{ width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '13px', fontWeight: '500' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fff1f2'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <LogOut size={14} /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isMobile && mobileMenuOpen && (
          <div style={{ background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(148,163,184,0.12)', borderRadius: '18px', padding: '12px', display: 'grid', gap: '8px' }}>
            <button
              onClick={() => {
                handleOpenAddSite()
                setMobileMenuOpen(false)
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#2563eb', border: 'none', cursor: 'pointer', color: 'white', padding: '10px 12px', borderRadius: '12px', fontSize: '13px', fontWeight: '700' }}
            >
              <Plus size={14} /> Add Site
            </button>

            <div style={{ display: 'grid', gap: '6px' }}>
              {NAV.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMobileMenuOpen(false)}
                  style={({ isActive }) => ({
                    padding: '11px 12px',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    background: isActive ? '#2563eb' : 'rgba(255,255,255,0.04)',
                    color: isActive ? 'white' : '#cbd5e1',
                    border: isActive ? '1px solid #3b82f6' : '1px solid rgba(148,163,184,0.08)',
                  })}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </nav>

      <main style={{ flex: 1, minWidth: 0 }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sites" element={<Sites />} />
            <Route path="/sites/:id" element={<SiteDetail />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/team" element={<Team />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/library" element={<Library />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </main>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}
