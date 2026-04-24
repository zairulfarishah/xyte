import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-white flex">

        {/* Sidebar */}
        <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-4 gap-2">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Xyte</h1>
            <p className="text-xs text-gray-500">GPR Team Manager</p>
          </div>
          <NavLink
            to="/"
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            Dashboard
          </NavLink>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
          </Routes>
        </main>

      </div>
    </BrowserRouter>
  )
}

export default App