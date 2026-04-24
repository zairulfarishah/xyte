import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import MapView from './pages/MapView'
import Team from './pages/Team'
import Library from './pages/Library'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-white flex">

        {/* Sidebar */}
        <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-4 gap-1">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Xyte</h1>
            <p className="text-xs text-gray-500">GPR Team Manager</p>
          </div>

          {[
            { to: '/',         label: 'Dashboard' },
            { to: '/sites',    label: 'Sites'     },
            { to: '/map',      label: 'Map'       },
            { to: '/team',     label: 'Team'      },
            { to: '/library',  label: 'Library'   },
          ].map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8 overflow-auto">
          <Routes>
            <Route path="/"        element={<Dashboard />} />
            <Route path="/sites"   element={<Sites />}     />
            <Route path="/map"     element={<MapView />}   />
            <Route path="/team"    element={<Team />}      />
            <Route path="/library" element={<Library />}   />
          </Routes>
        </main>

      </div>
    </BrowserRouter>
  )
}

export default App