import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MapPin, Map, Users, BookOpen,
  FileText, Settings, X
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import MapView from './pages/MapView'
import Team from './pages/Team'
import Library from './pages/Library'
import Reports from './pages/Reports'
import SettingsPage from './pages/SettingsPage'

const NAV = [
  { to: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sites',    label: 'Sites',     icon: MapPin          },
  { to: '/map',      label: 'Map',       icon: Map             },
  { to: '/team',     label: 'Team',      icon: Users           },
  { to: '/library',  label: 'Library',   icon: BookOpen        },
  { to: '/reports',  label: 'Reports',   icon: FileText        },
  { to: '/settings', label: 'Settings',  icon: Settings        },
]

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>

        {/* Sidebar */}
        <aside style={{
          width: '220px', flexShrink: 0, background: '#0f172a',
          display: 'flex', flexDirection: 'column', padding: '0',
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto'
        }}>
          {/* Logo */}
          <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px', height: '32px', background: '#2563eb',
                borderRadius: '8px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'white', fontWeight: '700',
                fontSize: '16px'
              }}>X</div>
              <div>
                <div style={{ color: 'white', fontWeight: '700', fontSize: '16px', lineHeight: 1 }}>Xyte</div>
                <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>GPR Team Manager</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ padding: '12px 10px', flex: 1 }}>
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '8px', marginBottom: '2px',
                  textDecoration: 'none', fontSize: '13.5px', fontWeight: '500',
                  transition: 'all 0.15s',
                  background: isActive ? '#2563eb' : 'transparent',
                  color: isActive ? 'white' : '#94a3b8',
                })}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={16} color={isActive ? 'white' : '#64748b'} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Bottom user */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#1d4ed8', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'white', fontWeight: '600',
                fontSize: '13px', flexShrink: 0
              }}>ZF</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'white', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Zairul Farishah</div>
                <div style={{ color: '#64748b', fontSize: '11px' }}>Team Leader</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
          <Routes>
            <Route path="/"         element={<Dashboard />}    />
            <Route path="/sites"    element={<Sites />}        />
            <Route path="/map"      element={<MapView />}      />
            <Route path="/team"     element={<Team />}         />
            <Route path="/library"  element={<Library />}      />
            <Route path="/reports"  element={<Reports />}      />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>

      </div>
    </BrowserRouter>
  )
}