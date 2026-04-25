import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { Search, Bell, X, MapPin, Users, Plus, LogOut } from 'lucide-react'
import { supabase } from './supabase'
import { AuthProvider, useAuth } from './context/AuthContext'

const LoginPage = lazy(() => import('./pages/LoginPage'))

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Sites = lazy(() => import('./pages/Sites'))
const SiteDetail = lazy(() => import('./pages/SiteDetail'))
const MapView = lazy(() => import('./pages/MapView'))
const Team = lazy(() => import('./pages/Team'))
const Library = lazy(() => import('./pages/Library'))
const Reports = lazy(() => import('./pages/Reports'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

const NAV = [
  { to: '/',         label: 'Dashboard', end: true  },
  { to: '/sites',    label: 'Sites',     end: false },
  { to: '/map',      label: 'Map',       end: false },
  { to: '/team',     label: 'Team',      end: false },
  { to: '/library',  label: 'Library',   end: false },
  { to: '/reports',  label: 'Reports',   end: false },
  { to: '/settings', label: 'Settings',  end: false },
]

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr)
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function SearchOverlay({ onClose }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState({ sites: [], members: [] })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setResults({ sites: [], members: [] }); return }
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

  function go(path) { navigate(path); onClose() }

  const STATUS_DOT = {
    upcoming: '#eab308', ongoing: '#f97316', completed: '#22c55e',
    cancelled: '#ef4444', postponed: '#94a3b8',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '80px' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '560px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
        {/* Input */}
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

        {/* Results */}
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
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: ['#2563eb','#7c3aed','#db2777','#059669'][i % 4], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={14} /></button>
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
  const { user, loading: authLoading, fullName } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen]   = useState(false)
  const [notifs, setNotifs]         = useState([])
  const [lastSeen, setLastSeen]     = useState(() => localStorage.getItem('xyte_notif_seen') || '1970-01-01')
  const [avatarOpen, setAvatarOpen] = useState(false)
  const notifRef  = useRef(null)
  const avatarRef = useRef(null)

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

  useEffect(() => {
    fetchNotifs()
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, ({ new: n }) => {
        setNotifs(prev => [n, ...prev].slice(0, 30))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    function handle(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function fetchNotifs() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f1f5f9' }}>

      {/* Top Navbar */}
      <nav style={{
        background: '#0f172a', height: '54px', flexShrink: 0,
        display: 'flex', alignItems: 'center', padding: '0 28px',
        position: 'sticky', top: 0, zIndex: 100,
        borderBottom: '1px solid #1e293b',
      }}>
        {/* Logo */}
        <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <div style={{ width: '30px', height: '30px', background: '#2563eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '15px' }}>X</div>
          <span style={{ color: 'white', fontWeight: '700', fontSize: '15px' }}>Xyte</span>
        </NavLink>

        {/* Nav links — centered floating pill */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '99px', padding: '3px' }}>
            {NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
                padding: '5px 14px', borderRadius: '99px', textDecoration: 'none',
                fontSize: '13px', fontWeight: '500', transition: 'all 0.15s',
                background: isActive ? '#2563eb' : 'transparent',
                color: isActive ? 'white' : '#94a3b8',
                whiteSpace: 'nowrap',
              })}>{label}</NavLink>
            ))}
          </div>
        </div>

        {/* Right icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: 'auto' }}>
          <button
            onClick={() => navigate('/sites', { state: { openAdd: true } })}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#2563eb', border: 'none', cursor: 'pointer', color: 'white', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
            onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}
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
            <button onClick={() => setAvatarOpen(o => !o)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1d4ed8', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}>
              {fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
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
      </nav>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"          element={<Dashboard />}    />
            <Route path="/sites"     element={<Sites />}        />
            <Route path="/sites/:id" element={<SiteDetail />}   />
            <Route path="/map"       element={<MapView />}      />
            <Route path="/team"      element={<Team />}         />
            <Route path="/library"   element={<Library />}      />
            <Route path="/reports"   element={<Reports />}      />
            <Route path="/settings"  element={<SettingsPage />} />
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
