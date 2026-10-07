import { NavLink } from 'react-router-dom'
import { LayoutGrid, CalendarDays, Map } from 'lucide-react'

// Sites, Calendar and Map are three ways of looking at the same sites
const VIEWS = [
  { to: '/sites',    label: 'Cards',    Icon: LayoutGrid },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { to: '/map',      label: 'Map',      Icon: Map },
]

export default function SitesViewSwitch({ style }) {
  return (
    <nav className="xt-views" aria-label="Sites view" style={style}>
      {VIEWS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? 'on' : '')}>
          <Icon size={13} /> {label}
        </NavLink>
      ))}
    </nav>
  )
}
