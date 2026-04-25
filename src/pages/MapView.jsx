import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { supabase } from '../supabase'
import { Search } from 'lucide-react'
import PlaceSearchBox from '../components/PlaceSearchBox'
import 'leaflet/dist/leaflet.css'

const STATUS_COLORS = {
  upcoming:  { dot: '#eab308', bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  ongoing:   { dot: '#f97316', bg: '#ffedd5', text: '#9a3412', border: '#fb923c' },
  completed: { dot: '#22c55e', bg: '#dcfce7', text: '#166534', border: '#4ade80' },
  cancelled: { dot: '#ef4444', bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  postponed: { dot: '#94a3b8', bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
}

const TABS = ['All','Upcoming','Ongoing','Completed','Cancelled','Postponed']

export default function MapView() {
  const [sites, setSites]       = useState([])
  const [selected, setSelected] = useState(null)
  const [tab, setTab]           = useState('All')
  const [search, setSearch]     = useState('')
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResult, setPlaceResult] = useState(null)
  const [loading, setLoading]   = useState(true)

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

  const filtered = sites
    .filter(s => tab === 'All' || s.site_status === tab.toLowerCase())
    .filter(s => !search || s.site_name.toLowerCase().includes(search.toLowerCase()) || s.location.toLowerCase().includes(search.toLowerCase()))

  const withCoords = filtered.filter(s => s.latitude && s.longitude)
  const center = withCoords.length > 0
    ? [withCoords[0].latitude, withCoords[0].longitude]
    : [3.1390, 101.6869]
  const activeCenter = placeResult ? [placeResult.latitude, placeResult.longitude] : center
  const activeMapKey = placeResult
    ? `search-${placeResult.latitude}-${placeResult.longitude}-${tab}`
    : `default-${center[0]}-${center[1]}-${tab}`

  const counts = Object.keys(STATUS_COLORS).reduce((acc, k) => {
    acc[k] = sites.filter(s => s.site_status === k).length
    return acc
  }, {})

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: '#64748b' }}>Loading map...</div>
    </div>
  )

  return (
    <div style={{ padding: '16px 20px', height: 'calc(100vh - 54px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ marginBottom: '12px', flexShrink: 0 }}>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>Map</h1>
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '1px' }}>All site locations</p>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>

        {/* Left panel */}
        <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Search */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                placeholder="Search sites..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', color: '#0f172a' }}
              />
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px' }}>
            <p style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Find Place</p>
            <PlaceSearchBox
              value={placeQuery}
              onChange={setPlaceQuery}
              onSelect={result => setPlaceResult(result)}
              placeholder="Search a place on the map..."
            />
          </div>

          {/* Filter tabs */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px' }}>
            <p style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Filters</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {TABS.map(t => {
                const key = t.toLowerCase()
                const c   = STATUS_COLORS[key]
                const isActive = tab === t
                return (
                  <button key={t} onClick={() => setTab(t)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: isActive ? '#eff6ff' : 'transparent',
                    transition: 'all 0.15s'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {t !== 'All' && (
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c?.dot || '#94a3b8' }} />
                      )}
                      <span style={{ fontSize: '13px', fontWeight: isActive ? '600' : '400', color: isActive ? '#1d4ed8' : '#64748b' }}>{t}</span>
                    </div>
                    {t !== 'All' && (
                      <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#64748b', padding: '1px 7px', borderRadius: '99px' }}>
                        {counts[key] || 0}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Summary */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px' }}>
            <p style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Summary</p>
            {Object.entries(STATUS_COLORS).map(([key, c]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: c.dot }} />
                  <span style={{ fontSize: '13px', color: '#475569', textTransform: 'capitalize' }}>{key}</span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{counts[key] || 0}</span>
              </div>
            ))}
          </div>

          {/* Site list */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Sites ({filtered.length})
              </p>
            </div>
            {filtered.length === 0 ? (
              <p style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No sites found.</p>
            ) : filtered.map(site => {
              const c = STATUS_COLORS[site.site_status]
              const isSelected = selected?.id === site.id
              return (
                <div key={site.id} onClick={() => setSelected(isSelected ? null : site)} style={{
                  padding: '12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  background: isSelected ? '#eff6ff' : 'white',
                  borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                  transition: 'all 0.15s'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.site_name}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.location}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        {new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c?.dot, flexShrink: 0, marginTop: '4px' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Map */}
        <div style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <MapContainer key={activeMapKey} center={activeCenter} zoom={placeResult ? 14 : 10} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {withCoords.map(site => {
              const c   = STATUS_COLORS[site.site_status]
              const pic = site.site_assignments?.find(a => a.assignment_role === 'PIC')
              const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []
              const isSelected = selected?.id === site.id
              return (
                <CircleMarker
                  key={site.id}
                  center={[site.latitude, site.longitude]}
                  radius={isSelected ? 14 : 10}
                  pathOptions={{
                    color: isSelected ? '#2563eb' : c?.dot,
                    fillColor: c?.dot,
                    fillOpacity: 0.85,
                    weight: isSelected ? 3 : 2,
                  }}
                  eventHandlers={{ click: () => setSelected(site) }}
                >
                  <Popup>
                    <div style={{ minWidth: '180px', fontFamily: 'Inter, sans-serif' }}>
                      <p style={{ fontWeight: '700', fontSize: '14px', marginBottom: '4px', color: '#0f172a' }}>{site.site_name}</p>
                      <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{site.location}</p>
                      <div style={{ display: 'inline-block', background: c?.bg, color: c?.text, border: `1px solid ${c?.border}`, padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '500', marginBottom: '8px', textTransform: 'capitalize' }}>{site.site_status}</div>
                      <p style={{ fontSize: '12px', color: '#475569', marginBottom: '2px' }}>
                        <span style={{ color: '#94a3b8' }}>Date: </span>
                        {new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p style={{ fontSize: '12px', color: '#475569', marginBottom: '2px' }}>
                        <span style={{ color: '#94a3b8' }}>PIC: </span>
                        {pic?.team_members?.full_name || '—'}
                      </p>
                      {crew.length > 0 && (
                        <p style={{ fontSize: '12px', color: '#475569' }}>
                          <span style={{ color: '#94a3b8' }}>Crew: </span>
                          {crew.map(c => c.team_members?.full_name).join(', ')}
                        </p>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
            {placeResult && (
              <CircleMarker
                center={[placeResult.latitude, placeResult.longitude]}
                radius={10}
                pathOptions={{ color: '#0f172a', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }}
              >
                <Popup>
                  <div style={{ minWidth: '180px', fontFamily: 'Inter, sans-serif' }}>
                    <p style={{ fontWeight: '700', fontSize: '14px', marginBottom: '4px', color: '#0f172a' }}>Selected Location</p>
                    <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{placeResult.label}</p>
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  )
}
