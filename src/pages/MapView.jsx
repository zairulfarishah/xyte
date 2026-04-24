import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { supabase } from '../supabase'
import 'leaflet/dist/leaflet.css'

const STATUS_COLORS = {
  upcoming:  '#EAB308',
  ongoing:   '#F97316',
  completed: '#22C55E',
  cancelled: '#EF4444',
  postponed: '#6B7280',
}

const STATUS_BADGE = {
  upcoming:  'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  ongoing:   'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  completed: 'bg-green-500/20 text-green-400 border border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border border-red-500/30',
  postponed: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
}

export default function MapView() {
  const [sites, setSites]         = useState([])
  const [selected, setSelected]   = useState(null)
  const [filter, setFilter]       = useState('all')
  const [loading, setLoading]     = useState(true)

  useEffect(() => { fetchSites() }, [])

  async function fetchSites() {
    setLoading(true)
    const { data } = await supabase
      .from('sites')
      .select(`*, site_assignments(assignment_role, team_members(full_name))`)
      .order('scheduled_date', { ascending: true })
    setSites(data || [])
    setLoading(false)
  }

  const filtered = filter === 'all'
    ? sites
    : sites.filter(s => s.site_status === filter)

  const withCoords = filtered.filter(s => s.latitude && s.longitude)

  const center = withCoords.length > 0
    ? [withCoords[0].latitude, withCoords[0].longitude]
    : [3.1390, 101.6869]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500">Loading map...</p>
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Map</h2>
        <p className="text-gray-400 text-sm mt-1">All site locations</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all','upcoming','ongoing','completed','cancelled','postponed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
              filter === s
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-400 capitalize">{status}</span>
          </div>
        ))}
      </div>

      {/* Main layout */}
      <div className="flex gap-4 h-[600px]">

        {/* Site list — left panel */}
        <div className="w-64 flex-shrink-0 bg-gray-900 border border-gray-800 rounded-xl overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-gray-500 text-sm p-4">No sites found.</p>
          ) : filtered.map(site => (
            <div
              key={site.id}
              onClick={() => setSelected(site)}
              className={`p-3 border-b border-gray-800 cursor-pointer transition-colors hover:bg-gray-800 ${
                selected?.id === site.id ? 'bg-gray-800 border-l-2 border-l-blue-500' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{site.site_name}</p>
                  <p className="text-gray-500 text-xs truncate mt-0.5">{site.location}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    {new Date(site.scheduled_date).toLocaleDateString('en-MY', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </p>
                </div>
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                  style={{ backgroundColor: STATUS_COLORS[site.site_status] }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Map — right panel */}
        <div className="flex-1 rounded-xl overflow-hidden border border-gray-800">
          <MapContainer
            center={center}
            zoom={10}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {withCoords.map(site => {
              const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
              const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew')
              return (
                <CircleMarker
                  key={site.id}
                  center={[site.latitude, site.longitude]}
                  radius={selected?.id === site.id ? 14 : 10}
                  pathOptions={{
                    color:       STATUS_COLORS[site.site_status],
                    fillColor:   STATUS_COLORS[site.site_status],
                    fillOpacity: 0.8,
                    weight:      selected?.id === site.id ? 3 : 1.5,
                  }}
                  eventHandlers={{ click: () => setSelected(site) }}
                >
                  <Popup>
                    <div style={{ minWidth: '160px' }}>
                      <p style={{ fontWeight: 600, marginBottom: 4 }}>{site.site_name}</p>
                      <p style={{ color: '#6b7280', fontSize: 12 }}>{site.location}</p>
                      <p style={{ fontSize: 12, marginTop: 4 }}>
                        {new Date(site.scheduled_date).toLocaleDateString('en-MY', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                      <p style={{ fontSize: 12, marginTop: 4 }}>
                        <span style={{ color: '#6b7280' }}>PIC: </span>
                        {pic?.team_members?.full_name || '—'}
                      </p>
                      {crew?.length > 0 && (
                        <p style={{ fontSize: 12 }}>
                          <span style={{ color: '#6b7280' }}>Crew: </span>
                          {crew.map(c => c.team_members?.full_name).join(', ')}
                        </p>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>
      </div>

      {/* Selected site detail */}
      {selected && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-white font-semibold">{selected.site_name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[selected.site_status]}`}>
                  {selected.site_status}
                </span>
              </div>
              <p className="text-gray-400 text-sm">{selected.location}</p>
              <div className="mt-3 flex gap-6 text-sm">
                <div>
                  <p className="text-gray-500 text-xs mb-1">Date</p>
                  <p className="text-white">
                    {new Date(selected.scheduled_date).toLocaleDateString('en-MY', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">PIC</p>
                  <p className="text-blue-400">
                    {selected.site_assignments?.find(a => a.assignment_role === 'PIC')?.team_members?.full_name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Crew</p>
                  <p className="text-gray-300">
                    {selected.site_assignments
                      ?.filter(a => a.assignment_role === 'crew')
                      ?.map(c => c.team_members?.full_name)
                      ?.join(', ') || '—'}
                  </p>
                </div>
                {selected.notes && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Notes</p>
                    <p className="text-gray-300">{selected.notes}</p>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-600 hover:text-white text-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}