import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Users, MapPin, CheckCircle, Clock } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

const STATUS_COLORS = {
  upcoming:  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  ongoing:   { bg: '#ffedd5', text: '#9a3412', border: '#fb923c' },
  completed: { bg: '#dcfce7', text: '#166534', border: '#4ade80' },
  cancelled: { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  postponed: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
}

const MAP_COLORS = {
  upcoming:  '#eab308',
  ongoing:   '#f97316',
  completed: '#22c55e',
  cancelled: '#ef4444',
  postponed: '#94a3b8',
}

const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626']

function Avatar({ name, size = 36, index = 0 }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: AVATAR_COLORS[index % AVATAR_COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: '600', fontSize: size * 0.35, flexShrink: 0
    }}>{initials}</div>
  )
}

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.postponed
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      padding: '2px 10px', borderRadius: '99px', fontSize: '11px',
      fontWeight: '500', textTransform: 'capitalize', whiteSpace: 'nowrap'
    }}>{status}</span>
  )
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'white', borderRadius: '12px',
      border: '1px solid #e2e8f0', padding: '20px', ...style
    }}>{children}</div>
  )
}

export default function Dashboard() {
  const [workload, setWorkload] = useState([])
  const [sites, setSites]       = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: wl } = await supabase
      .from('member_workload_summary').select('*')

    const { data: allSites } = await supabase
      .from('sites')
      .select(`*, site_assignments(assignment_role, team_members(id, full_name))`)
      .order('scheduled_date', { ascending: true })

    const today = new Date().toISOString().split('T')[0]
    const in14  = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const up    = (allSites || []).filter(s =>
      ['upcoming','ongoing'].includes(s.site_status) &&
      s.scheduled_date >= today && s.scheduled_date <= in14
    )

    setWorkload(wl || [])
    setSites(allSites || [])
    setUpcoming(up)
    setLoading(false)
  }

  const totalSites  = sites.length
  const activeSites = sites.filter(s => s.site_status === 'ongoing').length
  const completedS  = sites.filter(s => s.site_status === 'completed').length
  const upcomingS   = sites.filter(s => s.site_status === 'upcoming').length
  const maxPoints   = Math.max(...workload.map(m => m.total_points), 1)
  const withCoords  = sites.filter(s => s.latitude && s.longitude)
  const mapCenter   = withCoords.length > 0
    ? [withCoords[0].latitude, withCoords[0].longitude]
    : [3.1390, 101.6869]

  // Alert calculations
  const noPicSites     = sites.filter(s => !s.site_assignments?.some(a => a.assignment_role === 'PIC') && !['completed','cancelled'].includes(s.site_status))
  const soonSites      = sites.filter(s => { const diff = (new Date(s.scheduled_date) - new Date()) / (1000 * 60 * 60 * 24); return diff >= 0 && diff <= 2 && s.site_status === 'upcoming' })
  const postponedSites = sites.filter(s => s.site_status === 'postponed')
  const pendingReports = sites.filter(s => s.site_status === 'completed' && s.report_status === 'pending')
  const overloaded     = workload.filter(m => m.total_points >= 15)
  const allClear       = noPicSites.length === 0 && postponedSites.length === 0 && pendingReports.length === 0 && overloaded.length === 0

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: '#64748b' }}>Loading...</div>
    </div>
  )

  return (
    <div style={{ padding: '28px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Dashboard</h1>
        <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>
          {new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Sites',  value: totalSites,      icon: MapPin,      color: '#2563eb', bg: '#eff6ff' },
          { label: 'Upcoming',     value: upcomingS,       icon: Clock,       color: '#d97706', bg: '#fffbeb' },
          { label: 'Completed',    value: completedS,      icon: CheckCircle, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Team Members', value: workload.length, icon: Users,       color: '#7c3aed', bg: '#faf5ff' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: '#64748b', fontSize: '12px', fontWeight: '500', marginBottom: '8px' }}>{label}</p>
                <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a' }}>{value}</p>
              </div>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} color={color} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Middle row — Workload + Map + Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', gap: '20px', marginBottom: '24px' }}>

        {/* Workload */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>Team Workload</h2>
            <span style={{ fontSize: '12px', color: '#64748b' }}>This week</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {workload.map((m, i) => (
              <div key={m.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar name={m.full_name} size={32} index={i} />
                    <div>
                      <p style={{ fontWeight: '500', fontSize: '13px', color: '#0f172a' }}>{m.full_name}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8' }}>{m.role}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '99px' }}>PIC: {m.pic_count}</span>
                    <span style={{ fontSize: '11px', background: '#f8fafc', color: '#475569', padding: '2px 8px', borderRadius: '99px', border: '1px solid #e2e8f0' }}>Crew: {m.crew_count}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', minWidth: '40px', textAlign: 'right' }}>{m.total_points} pts</span>
                  </div>
                </div>
                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '99px',
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                    width: `${(m.total_points / maxPoints) * 100}%`,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Mini Map */}
        <Card style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>Site Overview (Map)</h2>
            <Link to="/map" style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              View All <ArrowUpRight size={13} />
            </Link>
          </div>
          <div style={{ height: '340px' }}>
            <MapContainer center={mapCenter} zoom={10} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {withCoords.map(site => (
                <CircleMarker
                  key={site.id}
                  center={[site.latitude, site.longitude]}
                  radius={8}
                  pathOptions={{ color: MAP_COLORS[site.site_status], fillColor: MAP_COLORS[site.site_status], fillOpacity: 0.85, weight: 2 }}
                >
                  <Popup><b>{site.site_name}</b><br />{site.location}</Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </Card>

        {/* Alerts */}
        <Card style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>Alerts & Notices</h2>
          </div>
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>

            {noPicSites.map(site => (
              <div key={site.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f97316', marginTop: '5px', flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#9a3412' }}>No PIC assigned</p>
                  <p style={{ fontSize: '11px', color: '#c2410c', marginTop: '1px' }}>{site.site_name}</p>
                </div>
              </div>
            ))}

            {soonSites.map(site => (
              <div key={site.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563eb', marginTop: '5px', flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#1d4ed8' }}>Site in 2 days</p>
                  <p style={{ fontSize: '11px', color: '#1d4ed8', marginTop: '1px' }}>{site.site_name}</p>
                </div>
              </div>
            ))}

            {postponedSites.map(site => (
              <div key={site.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8', marginTop: '5px', flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Site postponed</p>
                  <p style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{site.site_name}</p>
                </div>
              </div>
            ))}

            {pendingReports.map(site => (
              <div key={site.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: '#fef9c3', borderRadius: '8px', border: '1px solid #fde047' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#eab308', marginTop: '5px', flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#854d0e' }}>Report pending</p>
                  <p style={{ fontSize: '11px', color: '#854d0e', marginTop: '1px' }}>{site.site_name}</p>
                </div>
              </div>
            ))}

            {overloaded.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', marginTop: '5px', flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#991b1b' }}>High workload</p>
                  <p style={{ fontSize: '11px', color: '#b91c1c', marginTop: '1px' }}>{m.full_name} · {m.total_points} pts</p>
                </div>
              </div>
            ))}

            {allClear && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: '8px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle size={18} color="#16a34a" />
                </div>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>All clear!</p>
                <p style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>No alerts at this time</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Upcoming Sites Table */}
      <Card style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>Upcoming Sites</h2>
          <Link to="/sites" style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            View All <ArrowUpRight size={13} />
          </Link>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Site Name','Location','Date','PIC','Crew','Status','Report'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No upcoming sites in the next 14 days.</td></tr>
            ) : upcoming.map((site, i) => {
              const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
              const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []
              return (
                <tr key={site.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '500', color: '#0f172a' }}>{site.site_name}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{site.location}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {pic && <Avatar name={pic.team_members.full_name} size={24} index={0} />}
                      <span style={{ color: '#2563eb', fontSize: '13px' }}>{pic?.team_members?.full_name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex' }}>
                      {crew.slice(0, 3).map((c, ci) => (
                        <div key={ci} title={c.team_members?.full_name} style={{ marginLeft: ci > 0 ? '-6px' : 0, border: '2px solid white', borderRadius: '50%' }}>
                          <Avatar name={c.team_members?.full_name || '?'} size={24} index={ci + 1} />
                        </div>
                      ))}
                      {crew.length > 3 && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px', alignSelf: 'center' }}>+{crew.length - 3}</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><StatusPill status={site.site_status} /></td>
                  <td style={{ padding: '12px 16px' }}><StatusPill status={site.report_status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}