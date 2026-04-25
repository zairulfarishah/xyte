import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CheckCircle, Plus, Pencil, Calendar, Sparkles } from 'lucide-react'
import { calculateWorkload } from '../utils/workload'
import { notify } from '../utils/notify'
import PlaceSearchBox from '../components/PlaceSearchBox'
import 'leaflet/dist/leaflet.css'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const STATUS_COLORS = {
  upcoming: { bg: '#fef3c7', text: '#92400e', border: '#facc15' },
  ongoing: { bg: '#ffedd5', text: '#9a3412', border: '#fb923c' },
  completed: { bg: '#dcfce7', text: '#166534', border: '#4ade80' },
  cancelled: { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  postponed: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
}

const REPORT_COLORS = {
  pending: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  in_progress: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  submitted: { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
  approved: { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
}

const MAP_COLORS = {
  upcoming: '#f59e0b',
  ongoing: '#2563eb',
  completed: '#22c55e',
  cancelled: '#ef4444',
  postponed: '#94a3b8',
}

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626']

const SITE_TYPES = [
  { value: 'site_scanning', label: 'Site Scanning' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'meeting', label: 'Meeting' },
]

const TYPE_COLORS = {
  site_scanning: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  site_visit: { bg: '#f0fdf4', text: '#166534', border: '#4ade80' },
  meeting: { bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd' },
}

const EMPTY_FORM = {
  site_type: 'site_scanning',
  site_name: '',
  location: '',
  latitude: '',
  longitude: '',
  scheduled_date: '',
  site_status: 'upcoming',
  report_status: 'pending',
  site_duration_days: '1',
  report_duration_days: '0.5',
  notes: '',
  pic_id: '',
  crew_ids: [],
}

function MapClickHandler({ onPick }) {
  useMapEvents({ click: event => onPick(event.latlng.lat, event.latlng.lng) })
  return null
}

function LocationPicker({ lat, lng, onPick, mapKey }) {
  const hasPin = lat !== '' && lng !== ''
  const center = hasPin ? [parseFloat(lat), parseFloat(lng)] : [3.1390, 101.6869]

  return (
    <MapContainer
      key={mapKey}
      center={center}
      zoom={hasPin ? 13 : 10}
      style={{ height: '180px', borderRadius: '12px', cursor: 'crosshair' }}
      zoomControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" />
      <MapClickHandler onPick={onPick} />
      {hasPin && (
        <CircleMarker
          center={[parseFloat(lat), parseFloat(lng)]}
          radius={9}
          pathOptions={{ color: 'white', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }}
        />
      )}
    </MapContainer>
  )
}

function Avatar({ name, size = 36, index = 0 }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: AVATAR_COLORS[index % AVATAR_COLORS.length],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: '700',
        fontSize: size * 0.35,
        flexShrink: 0,
        boxShadow: '0 12px 24px rgba(15,23,42,0.12)',
      }}
    >
      {initials}
    </div>
  )
}

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.postponed

  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        padding: '5px 9px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: '800',
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

function buildMemberRecord(member, sites) {
  const assignments = sites.flatMap(site =>
    (site.site_assignments || [])
      .filter(a => a.member_id === member.id)
      .map(a => ({ ...a, site }))
  )

  const picCount = assignments.filter(a => String(a.assignment_role || '').toLowerCase() === 'pic').length
  const crewCount = assignments.filter(a => String(a.assignment_role || '').toLowerCase() === 'crew').length

  return {
    ...member,
    pic_count: picCount,
    crew_count: crewCount,
    workload: calculateWorkload(assignments),
  }
}

function formatShortDate(date) {
  return new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
}

function formatLongDate(date) {
  return new Date(date).toLocaleDateString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getTrendText(value, kind = 'default') {
  if (kind === 'alert') return value === 0 ? 'No backlog' : `${value} needs action`
  if (kind === 'sites') return value > 0 ? `+${value} this week` : 'No change this week'
  if (kind === 'upcoming') return value > 1 ? `${value - 1} near deadline` : 'Next site scheduled'
  if (kind === 'team') return value > 0 ? 'Active team' : 'No members'
  return value > 0 ? 'Healthy activity' : 'All clear'
}

export default function Dashboard() {
  const [members, setMembers] = useState([])
  const [sites, setSites] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [updateSite, setUpdateSite] = useState(null)
  const [mapFilter, setMapFilter] = useState('all')
  const [mapQuery, setMapQuery] = useState('')
  const [mapSearchResult, setMapSearchResult] = useState(null)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)

    const { data: memberData } = await supabase
      .from('team_members')
      .select('*')
      .order('full_name')

    const { data: allSites } = await supabase
      .from('sites')
      .select('*, site_assignments(assignment_role, member_id, team_members(id, full_name))')
      .order('scheduled_date', { ascending: true })

    const siteList = allSites || []
    const memberRecords = (memberData || []).map(member => buildMemberRecord(member, siteList))

    const today = new Date().toISOString().split('T')[0]
    const in14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const upcomingSites = siteList.filter(site =>
      ['upcoming', 'ongoing'].includes(site.site_status) &&
      site.scheduled_date >= today &&
      site.scheduled_date <= in14
    )

    setMembers(memberRecords)
    setSites(siteList)
    setUpcoming(upcomingSites)
    setLoading(false)
  }

  async function handleAddSave() {
    if (!form.site_name || !form.location || !form.scheduled_date) return
    setSaving(true)

    const isSiteVisit = form.site_type === 'site_visit'
    const isMeeting = form.site_type === 'meeting'
    const payload = {
      site_type: form.site_type,
      site_name: form.site_name,
      location: form.location,
      latitude: form.latitude !== '' ? parseFloat(form.latitude) : null,
      longitude: form.longitude !== '' ? parseFloat(form.longitude) : null,
      scheduled_date: form.scheduled_date,
      site_status: form.site_status,
      site_duration_days: isSiteVisit ? 0.5 : (parseFloat(form.site_duration_days) || 1),
      report_duration_days: isSiteVisit || isMeeting ? 0 : (parseFloat(form.report_duration_days) || 0.5),
      report_status: isSiteVisit || isMeeting ? 'pending' : form.report_status,
      notes: form.notes,
    }

    const { data } = await supabase.from('sites').insert(payload).select().single()

    if (data?.id) {
      const assignments = []
      if (form.pic_id) assignments.push({ site_id: data.id, member_id: form.pic_id, assignment_role: 'PIC' })
      form.crew_ids.forEach(id => {
        if (id !== form.pic_id) assignments.push({ site_id: data.id, member_id: id, assignment_role: 'crew' })
      })
      if (assignments.length > 0) await supabase.from('site_assignments').insert(assignments)
    }

    await notify(`Added new site: ${form.site_name}`)
    setSaving(false)
    setShowAdd(false)
    setForm(EMPTY_FORM)
    fetchAll()
  }

  async function handleStatusSave() {
    if (!updateSite) return
    setSaving(true)

    await supabase
      .from('sites')
      .update({
        site_status: updateSite.site_status,
        report_status: updateSite.report_status,
      })
      .eq('id', updateSite.id)

    await notify(`Updated ${updateSite.site_name} -> ${updateSite.site_status}`)
    setSaving(false)
    setUpdateSite(null)
    fetchAll()
  }

  const totalSites = sites.length
  const activeSites = sites.filter(site => site.site_status === 'ongoing').length
  const completedSites = sites.filter(site => site.site_status === 'completed').length
  const upcomingSitesCount = sites.filter(site => site.site_status === 'upcoming').length
  const pendingReports = sites.filter(site => ['pending', 'in_progress'].includes(site.report_status) && site.site_type === 'site_scanning')
  const withCoords = sites.filter(site => site.latitude && site.longitude)
  const mapCenter = withCoords.length > 0 ? [withCoords[0].latitude, withCoords[0].longitude] : [3.1390, 101.6869]
  const filteredMapSites = withCoords.filter(site => {
    if (mapFilter === 'upcoming') return site.site_status === 'upcoming'
    if (mapFilter === 'completed') return site.site_status === 'completed'
    return true
  })
  const activeMapCenter = mapSearchResult
    ? [mapSearchResult.latitude, mapSearchResult.longitude]
    : mapCenter
  const activeMapKey = mapSearchResult
    ? `search-${mapSearchResult.latitude}-${mapSearchResult.longitude}-${mapFilter}`
    : `default-${mapCenter[0]}-${mapCenter[1]}-${mapFilter}`

  const noPicSites = sites.filter(site => !site.site_assignments?.some(a => a.assignment_role === 'PIC') && !['completed', 'cancelled'].includes(site.site_status))
  const soonSites = sites.filter(site => {
    const diff = (new Date(site.scheduled_date) - new Date()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 2 && site.site_status === 'upcoming'
  })
  const overloaded = members.filter(member => member.workload.workload_percentage > 80)
  const allClear = noPicSites.length === 0 && soonSites.length === 0 && pendingReports.length === 0 && overloaded.length === 0

  const teamAverage = members.length > 0
    ? Math.round(members.reduce((sum, member) => sum + member.workload.workload_percentage, 0) / members.length)
    : 0

  const busiestMember = useMemo(
    () => [...members].sort((a, b) => b.workload.workload_percentage - a.workload.workload_percentage)[0] || null,
    [members]
  )

  const supportCandidates = useMemo(
    () => [...members]
      .sort((a, b) => a.workload.workload_percentage - b.workload.workload_percentage)
      .slice(0, 2),
    [members]
  )

  const focusSite = useMemo(() => {
    if (soonSites[0]) return soonSites[0]
    if (upcoming[0]) return upcoming[0]
    if (sites[0]) return sites[0]
    return null
  }, [sites, soonSites, upcoming])

  const reportSummary = useMemo(() => ({
    pending: sites.filter(site => site.report_status === 'pending').length,
    in_progress: sites.filter(site => site.report_status === 'in_progress').length,
    submitted: sites.filter(site => site.report_status === 'submitted').length,
    approved: sites.filter(site => site.report_status === 'approved').length,
  }), [sites])

  const progressSites = useMemo(
    () => sites.filter(site => ['upcoming', 'ongoing', 'completed'].includes(site.site_status)).slice(0, 3),
    [sites]
  )

  const timelineSites = useMemo(
    () => [...upcoming].slice(0, 3),
    [upcoming]
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#64748b' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#eef3f8',
        color: '#0b1220',
      }}
    >
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(circle at 18% 5%, rgba(59,130,246,.22), transparent 26%), radial-gradient(circle at 70% 0%, rgba(14,165,233,.12), transparent 30%), linear-gradient(180deg, #071226 0 220px, #eef3f8 220px 100%)',
        }}
      >
        <main style={{ maxWidth: '1540px', margin: '0 auto', padding: '30px 30px 36px' }}>
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 500px',
              gap: '24px',
              marginBottom: '28px',
              alignItems: 'center',
            }}
          >
            <div style={{ color: 'white', padding: '6px 0 4px' }}>
              <h1 style={{ margin: 0, fontSize: '30px', letterSpacing: '-.05em', fontWeight: '850' }}>
                {getGreeting()}, Zairul!
              </h1>
              <p style={{ margin: '8px 0 0', color: '#b8c7dd', fontSize: '14px', lineHeight: 1.55 }}>
                {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Team command center
              </p>
            </div>

            <div
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.06))',
                color: 'white',
                borderRadius: '24px',
                padding: '18px 18px',
                border: '1px solid rgba(148, 163, 184, .28)',
                boxShadow: '0 20px 40px rgba(2,8,23,.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                backdropFilter: 'blur(18px)',
                minHeight: '94px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <small style={{ fontSize: '12px', fontWeight: '800', color: '#b8c7dd' }}>Today</small>
                <h2 style={{ margin: '6px 0 0', fontSize: '15px', fontWeight: '750', color: 'white', lineHeight: 1.45 }}>
                  {focusSite ? `${focusSite.site_name} · ${formatShortDate(focusSite.scheduled_date)} · ${pendingReports.length} report${pendingReports.length === 1 ? '' : 's'} pending` : 'No active focus today'}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <div style={{ padding: '8px 12px', borderRadius: '999px', background: 'rgba(255,255,255,.10)', fontSize: '12px', fontWeight: '800', color: '#eaf1ff', border: '1px solid rgba(255,255,255,.06)' }}>
                  {teamAverage}% load
                </div>
                <div style={{ padding: '8px 12px', borderRadius: '999px', background: 'rgba(255,255,255,.10)', fontSize: '12px', fontWeight: '800', color: '#eaf1ff', border: '1px solid rgba(255,255,255,.06)' }}>
                  {upcoming.length} tasks
                </div>
              </div>
            </div>
          </section>

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              gap: '14px',
              marginBottom: '24px',
            }}
          >
            {[
              { label: 'Total Sites', value: totalSites, trend: getTrendText(upcoming.length, 'sites'), icon: '▦', color: '#3b82f6', gradient: 'linear-gradient(135deg,#3b82f6,#2563eb)' },
              { label: 'Upcoming', value: upcomingSitesCount, trend: getTrendText(upcomingSitesCount, 'upcoming'), icon: '▣', color: '#f59e0b', gradient: 'linear-gradient(135deg,#fbbf24,#f97316)' },
              { label: 'Ongoing', value: activeSites, trend: activeSites === 0 ? 'All clear' : `${activeSites} active now`, icon: '◷', color: '#f59e0b', gradient: 'linear-gradient(135deg,#fde047,#f59e0b)' },
              { label: 'Completed', value: completedSites, trend: completedSites > 0 ? `${Math.round((completedSites / Math.max(totalSites, 1)) * 100)}% completion` : 'No completions yet', icon: '✓', color: '#22c55e', gradient: 'linear-gradient(135deg,#4ade80,#16a34a)' },
              { label: 'Team Members', value: members.length, trend: getTrendText(members.length, 'team'), icon: '♟', color: '#8b5cf6', gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
              { label: 'Pending Reports', value: pendingReports.length, trend: getTrendText(pendingReports.length, 'alert'), icon: '▤', color: '#ef4444', gradient: 'linear-gradient(135deg,#fb7185,#ef4444)' },
            ].map(card => (
              <div
                key={card.label}
                style={{
                  background: 'rgba(255,255,255,.96)',
                  border: '1px solid rgba(203,213,225,.75)',
                  borderRadius: '16px',
                  padding: '18px',
                  boxShadow: '0 18px 45px rgba(15,23,42,.08)',
                  display: 'grid',
                  gridTemplateColumns: '44px 1fr',
                  columnGap: '14px',
                  alignItems: 'center',
                  minHeight: '108px',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'white',
                    fontSize: '20px',
                    fontWeight: '900',
                    boxShadow: '0 12px 26px rgba(15,23,42,.12)',
                    gridRow: '1 / span 2',
                    background: card.gradient,
                  }}
                >
                  {card.icon}
                </div>
                <div>
                  <div style={{ color: '#334155', fontSize: '13px', fontWeight: '700' }}>{card.label}</div>
                  <div style={{ marginTop: '5px', fontSize: '26px', fontWeight: '850', letterSpacing: '-.04em', color: '#0f172a' }}>{card.value}</div>
                </div>
                <div style={{ marginTop: '7px', fontSize: '11px', color: card.color, fontWeight: '800', gridColumn: 2, lineHeight: 1.4 }}>{card.trend}</div>
              </div>
            ))}
          </section>

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: '340px minmax(0, 1fr) 320px',
              gap: '16px',
              alignItems: 'start',
            }}
          >
            <aside
              style={{
                background: 'rgba(255,255,255,.96)',
                border: '1px solid rgba(203,213,225,.85)',
                borderRadius: '16px',
                boxShadow: '0 18px 45px rgba(15,23,42,.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '16px 18px',
                  borderBottom: '1px solid rgba(226,232,240,.9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '16px' }}>Team Workload</h3>
                <span style={{ color: '#2563eb', fontSize: '13px', fontWeight: '700' }}>This week</span>
              </div>

              <div style={{ padding: '16px 18px 18px' }}>
                {busiestMember && (
                  <div
                    style={{
                      display: 'block',
                      margin: '4px 0 14px',
                      padding: '10px 12px',
                      borderRadius: '12px',
                      background: '#fff7ed',
                      border: '1px solid #fed7aa',
                      color: '#9a3412',
                      fontSize: '12px',
                      fontWeight: '700',
                    }}
                  >
                    <b style={{ display: 'block', color: '#7c2d12', marginBottom: '4px' }}>
                      <Sparkles size={12} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                      Smart insight
                    </b>
                    {busiestMember.full_name.split(' ')[0]} is highest loaded. Suggested support: {supportCandidates.map(member => member.full_name.split(' ')[0]).join(' or ')}.
                  </div>
                )}

                {members.map((member, index) => (
                  <div key={member.id} style={{ padding: '14px 0', borderBottom: index === members.length - 1 ? 0 : '1px solid #e5eaf2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Avatar name={member.full_name} size={36} index={index} />
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: '14px' }}>{member.full_name}</b>
                        <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '12px' }}>{member.role}</p>
                      </div>
                      <div style={{ fontWeight: '850', fontSize: '13px', color: member.workload.workload_percentage > 60 ? '#f59e0b' : '#22c55e' }}>
                        {member.workload.workload_percentage}%
                      </div>
                    </div>
                    <div style={{ marginTop: '9px', height: '8px', background: '#edf2f7', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(member.workload.workload_percentage, 100)}%`, background: member.workload.status_colors.bar, borderRadius: '999px' }} />
                    </div>
                  </div>
                ))}

                <button
                  style={{
                    marginTop: '14px',
                    width: '100%',
                    border: 0,
                    background: '#0f172a',
                    color: 'white',
                    borderRadius: '13px',
                    padding: '12px 14px',
                    fontWeight: '850',
                    boxShadow: '0 12px 28px rgba(15,23,42,.18)',
                    cursor: 'pointer',
                  }}
                >
                  Quick Assign →
                </button>
              </div>
            </aside>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
              <section
                style={{
                  background: 'rgba(255,255,255,.96)',
                  border: '1px solid rgba(203,213,225,.85)',
                  borderRadius: '16px',
                  boxShadow: '0 18px 45px rgba(15,23,42,.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '16px 18px',
                    borderBottom: '1px solid rgba(226,232,240,.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Site Map</h3>
                  <Link to="/map" style={{ color: '#2563eb', fontSize: '13px', fontWeight: '700', textDecoration: 'none', display: 'flex', gap: '4px', alignItems: 'center' }}>
                    Full map <ArrowUpRight size={13} />
                  </Link>
                </div>

                <div style={{ position: 'relative', height: '350px' }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: '16px',
                      left: '16px',
                      right: '16px',
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(240px, 320px)',
                      gap: '12px',
                      alignItems: 'start',
                      zIndex: 500,
                    }}
                  >
                    <div
                      style={{
                        background: 'rgba(255,255,255,.9)',
                        backdropFilter: 'blur(12px)',
                        padding: '7px',
                        borderRadius: '999px',
                        display: 'flex',
                        gap: '6px',
                        boxShadow: '0 12px 30px rgba(15,23,42,.14)',
                      }}
                    >
                      {[
                        { label: 'All', value: 'all' },
                        { label: 'Upcoming', value: 'upcoming' },
                        { label: 'Completed', value: 'completed' },
                      ].map(item => (
                        <button
                          key={item.value}
                          onClick={() => setMapFilter(item.value)}
                          style={{
                            border: 0,
                            background: mapFilter === item.value ? '#0f172a' : 'transparent',
                            color: mapFilter === item.value ? 'white' : '#475569',
                            padding: '8px 12px',
                            borderRadius: '999px',
                            fontWeight: '750',
                            cursor: 'pointer',
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div
                      style={{
                        background: 'rgba(255,255,255,.9)',
                        backdropFilter: 'blur(12px)',
                        padding: '10px',
                        borderRadius: '16px',
                        boxShadow: '0 12px 30px rgba(15,23,42,.14)',
                      }}
                    >
                      <PlaceSearchBox
                        value={mapQuery}
                        onChange={setMapQuery}
                        onSelect={result => {
                          setMapQuery(result.label)
                          setMapSearchResult(result)
                        }}
                        placeholder="Find a place on map..."
                      />
                    </div>
                  </div>

                  <MapContainer key={activeMapKey} center={activeMapCenter} zoom={mapSearchResult ? 14 : 10} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {filteredMapSites.map(site => (
                      <CircleMarker
                        key={site.id}
                        center={[site.latitude, site.longitude]}
                        radius={9}
                        pathOptions={{
                          color: 'white',
                          weight: 3,
                          fillColor: MAP_COLORS[site.site_status] || '#2563eb',
                          fillOpacity: 0.95,
                        }}
                      >
                        <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                          <div style={{ minWidth: '180px' }}>
                            <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>{site.site_name}</div>
                            <div style={{ marginTop: '4px', fontSize: '11px', color: '#475569' }}>{site.location}</div>
                            <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b' }}>
                              Status: {site.site_status}
                              <br />
                              PIC: {site.site_assignments?.find(a => a.assignment_role === 'PIC')?.team_members?.full_name || 'No PIC'}
                              <br />
                              Visit: {formatLongDate(site.scheduled_date)}
                            </div>
                          </div>
                        </Tooltip>
                      </CircleMarker>
                    ))}
                    {mapSearchResult && (
                      <CircleMarker
                        center={[mapSearchResult.latitude, mapSearchResult.longitude]}
                        radius={10}
                        pathOptions={{ color: '#0f172a', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
                      >
                        <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                          <div style={{ minWidth: '180px' }}>
                            <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>Selected Location</div>
                            <div style={{ marginTop: '4px', fontSize: '11px', color: '#475569', lineHeight: 1.5 }}>{mapSearchResult.label}</div>
                          </div>
                        </Tooltip>
                      </CircleMarker>
                    )}
                  </MapContainer>
                </div>
              </section>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <section
                  style={{
                    background: 'rgba(255,255,255,.96)',
                    border: '1px solid rgba(203,213,225,.85)',
                    borderRadius: '16px',
                    boxShadow: '0 18px 45px rgba(15,23,42,.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(226,232,240,.9)' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Site Progress</h3>
                  </div>
                  <div style={{ padding: '14px 18px 16px', minHeight: '216px' }}>
                    {progressSites.map(site => {
                      const progress = site.site_status === 'completed'
                        ? 100
                        : site.site_status === 'ongoing'
                          ? 60
                          : site.report_status === 'submitted'
                            ? 85
                            : site.report_status === 'in_progress'
                              ? 50
                              : 25

                      return (
                        <div key={site.id} style={{ padding: '12px 0', borderBottom: '1px solid #eef2f7' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: '800', fontSize: '13px' }}>
                            {site.site_name}
                            <span style={{ color: '#64748b', fontSize: '12px' }}>{progress}%</span>
                          </div>
                          <div style={{ marginTop: '10px', height: '8px', background: '#edf2f7', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ width: `${progress}%`, height: '100%', background: progress >= 80 ? '#22c55e' : progress >= 50 ? '#2563eb' : '#f59e0b', borderRadius: '999px' }} />
                          </div>
                          <div style={{ marginTop: '9px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ borderRadius: '999px', padding: '5px 8px', background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: '800' }}>Scan</span>
                            <span style={{ borderRadius: '999px', padding: '5px 8px', background: site.site_status === 'completed' || site.report_status !== 'pending' ? '#dcfce7' : '#f1f5f9', color: site.site_status === 'completed' || site.report_status !== 'pending' ? '#166534' : '#475569', fontSize: '11px', fontWeight: '800' }}>Data</span>
                            <span style={{ borderRadius: '999px', padding: '5px 8px', background: site.report_status === 'approved' ? '#dcfce7' : '#fee2e2', color: site.report_status === 'approved' ? '#166534' : '#991b1b', fontSize: '11px', fontWeight: '800' }}>Report</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section
                  style={{
                    background: 'rgba(255,255,255,.96)',
                    border: '1px solid rgba(203,213,225,.85)',
                    borderRadius: '16px',
                    boxShadow: '0 18px 45px rgba(15,23,42,.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '16px 18px',
                      borderBottom: '1px solid rgba(226,232,240,.9)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Mini Gantt</h3>
                    <span style={{ color: '#2563eb', fontSize: '13px', fontWeight: '700' }}>7 days</span>
                  </div>
                  <div style={{ padding: '14px 18px 16px', minHeight: '216px' }}>
                    <div style={{ display: 'grid', gap: '14px' }}>
                      {timelineSites.map((site, index) => (
                        <div key={site.id} style={{ display: 'grid', gridTemplateColumns: '74px 1fr', alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight: '800', color: '#334155' }}>
                          <span>{site.site_name}</span>
                          <div style={{ height: '12px', background: '#edf2f7', borderRadius: '999px', position: 'relative', overflow: 'hidden' }}>
                            <div
                              style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: `${index * 20 + 5}%`,
                                width: `${Math.max(24, (Number(site.site_duration_days) || 1) * 16)}%`,
                                borderRadius: '999px',
                                background: 'linear-gradient(90deg,#2563eb,#38bdf8)',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <aside style={{ display: 'grid', gap: '16px' }}>
              <section
                style={{
                  background: 'rgba(255,255,255,.96)',
                  border: '1px solid rgba(203,213,225,.85)',
                  borderRadius: '16px',
                  boxShadow: '0 18px 45px rgba(15,23,42,.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '16px 18px',
                    borderBottom: '1px solid rgba(226,232,240,.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Upcoming</h3>
                  <Link to="/sites" style={{ color: '#2563eb', fontSize: '13px', fontWeight: '700', textDecoration: 'none' }}>All ↗</Link>
                </div>
                <div style={{ padding: '14px 18px 16px' }}>
                  {upcoming.length === 0 ? (
                    <div style={{ marginTop: '20px', textAlign: 'center', color: '#16a34a', fontWeight: '800', fontSize: '13px', padding: '18px' }}>
                      No upcoming sites in the next 14 days
                    </div>
                  ) : upcoming.map(site => {
                    const pic = site.site_assignments?.find(a => a.assignment_role === 'PIC')
                    const urgent = soonSites.some(item => item.id === site.id)

                    return (
                      <div key={site.id} style={{ padding: '13px 0', borderBottom: '1px solid #eef2f7' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                          <b style={{ fontSize: '14px' }}>{site.site_name}</b>
                          <span
                            style={{
                              padding: '5px 9px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: '800',
                              background: urgent ? '#fee2e2' : STATUS_COLORS[site.site_status]?.bg || '#fef3c7',
                              color: urgent ? '#991b1b' : STATUS_COLORS[site.site_status]?.text || '#92400e',
                              border: `1px solid ${urgent ? '#fecaca' : STATUS_COLORS[site.site_status]?.border || '#facc15'}`,
                            }}
                          >
                            {urgent ? 'Urgent' : site.site_status}
                          </span>
                        </div>
                        <p style={{ margin: '7px 0 10px', color: '#64748b', fontSize: '12px', lineHeight: 1.5 }}>
                          {formatShortDate(site.scheduled_date)} · PIC: {pic?.team_members?.full_name || 'No PIC'}
                        </p>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0 10px' }}>
                          {(site.site_assignments || []).slice(0, 3).map((assignment, index) => (
                            <span
                              key={`${site.id}-${index}`}
                              style={{
                                height: '24px',
                                minWidth: '24px',
                                padding: '0 7px',
                                borderRadius: '999px',
                                display: 'inline-grid',
                                placeItems: 'center',
                                background: '#e0f2fe',
                                color: '#075985',
                                fontSize: '10px',
                                fontWeight: '900',
                                border: '1px solid #bae6fd',
                              }}
                            >
                              {assignment.team_members?.full_name?.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || '--'}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => setUpdateSite({ id: site.id, site_name: site.site_name, site_status: site.site_status, report_status: site.report_status, site_type: site.site_type || 'site_scanning' })}
                          style={{
                            border: 0,
                            background: '#f1f5f9',
                            color: '#334155',
                            borderRadius: '9px',
                            padding: '8px 10px',
                            fontWeight: '750',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Pencil size={12} />
                          Update
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section
                style={{
                  background: 'rgba(255,255,255,.96)',
                  border: '1px solid rgba(203,213,225,.85)',
                  borderRadius: '16px',
                  boxShadow: '0 18px 45px rgba(15,23,42,.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '16px 18px',
                    borderBottom: '1px solid rgba(226,232,240,.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Reports</h3>
                  <span style={{ color: '#2563eb', fontSize: '13px', fontWeight: '700' }}>Status</span>
                </div>
                <div style={{ padding: '14px 18px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '12px', textAlign: 'center' }}>
                      <b style={{ display: 'block', fontSize: '22px', letterSpacing: '-.04em', color: '#ef4444' }}>{reportSummary.pending}</b>
                      <span style={{ display: 'block', marginTop: '3px', color: '#64748b', fontSize: '11px', fontWeight: '800' }}>Pending</span>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '12px', textAlign: 'center' }}>
                      <b style={{ display: 'block', fontSize: '22px', letterSpacing: '-.04em', color: '#f59e0b' }}>{reportSummary.in_progress}</b>
                      <span style={{ display: 'block', marginTop: '3px', color: '#64748b', fontSize: '11px', fontWeight: '800' }}>Draft</span>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '12px', textAlign: 'center' }}>
                      <b style={{ display: 'block', fontSize: '22px', letterSpacing: '-.04em', color: '#22c55e' }}>{reportSummary.approved + reportSummary.submitted}</b>
                      <span style={{ display: 'block', marginTop: '3px', color: '#64748b', fontSize: '11px', fontWeight: '800' }}>Done</span>
                    </div>
                  </div>
                </div>
              </section>

              <section
                style={{
                  background: 'rgba(255,255,255,.96)',
                  border: '1px solid rgba(203,213,225,.85)',
                  borderRadius: '16px',
                  boxShadow: '0 18px 45px rgba(15,23,42,.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '16px 18px',
                    borderBottom: '1px solid rgba(226,232,240,.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Alerts</h3>
                  <span style={{ color: '#2563eb', fontSize: '13px', fontWeight: '700' }}>Priority</span>
                </div>
                <div style={{ padding: '14px 18px 16px' }}>
                  {!allClear && noPicSites[0] && (
                    <div style={{ borderRadius: '18px', padding: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: '800', fontSize: '14px', marginBottom: '12px' }}>
                      No PIC assigned for {noPicSites[0].site_name}
                    </div>
                  )}

                  {pendingReports.slice(0, 2).map(site => (
                    <div key={site.id} style={{ padding: '10px 0', borderBottom: '1px solid #eef2f7', fontSize: '12px', color: '#475569' }}>
                      <b style={{ color: '#0f172a' }}>{site.site_name}</b>
                      <div style={{ marginTop: '4px' }}>Report still {site.report_status.replace('_', ' ')}</div>
                    </div>
                  ))}

                  {overloaded.slice(0, 2).map(member => (
                    <div key={member.id} style={{ padding: '10px 0', borderBottom: '1px solid #eef2f7', fontSize: '12px', color: '#475569' }}>
                      <b style={{ color: '#0f172a' }}>{member.full_name}</b>
                      <div style={{ marginTop: '4px' }}>Load is at {member.workload.workload_percentage}% this week</div>
                    </div>
                  ))}

                  {allClear && (
                    <div style={{ marginTop: '20px', textAlign: 'center', color: '#16a34a', fontWeight: '800', fontSize: '13px', padding: '18px' }}>
                      <CheckCircle size={16} color="#16a34a" style={{ marginBottom: '4px' }} />
                      <div>All clear</div>
                    </div>
                  )}
                </div>
              </section>
            </aside>
          </section>
        </main>

        <button
          onClick={() => {
            setForm(EMPTY_FORM)
            setShowAdd(true)
          }}
          style={{
            position: 'fixed',
            right: '28px',
            bottom: '28px',
            background: '#2563eb',
            color: 'white',
            border: 0,
            borderRadius: '15px',
            padding: '14px 18px',
            fontWeight: '850',
            boxShadow: '0 18px 35px rgba(37,99,235,.35)',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          + Add Site
        </button>
      </div>

      {showAdd && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={event => event.target === event.currentTarget && setShowAdd(false)}
        >
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '92vh', overflowY: 'auto', padding: '30px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>Add New Site</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '6px' }}>Site Type *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {SITE_TYPES.map(({ value, label }) => {
                    const active = form.site_type === value
                    const tc = TYPE_COLORS[value]
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, site_type: value, site_duration_days: value === 'site_visit' ? '0.5' : f.site_duration_days }))}
                        style={{
                          flex: 1,
                          padding: '8px 6px',
                          borderRadius: '8px',
                          border: `1px solid ${active ? tc.border : '#e2e8f0'}`,
                          background: active ? tc.bg : 'white',
                          color: active ? tc.text : '#64748b',
                          fontSize: '12px',
                          fontWeight: active ? '600' : '400',
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Site Name *</label>
                <input
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                  value={form.site_name}
                  placeholder="e.g. Jalan Ampang Survey"
                  onChange={event => setForm(f => ({ ...f, site_name: event.target.value }))}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Location *</label>
                <PlaceSearchBox
                  value={form.location}
                  onChange={value => setForm(f => ({ ...f, location: value, latitude: '', longitude: '' }))}
                  onSelect={result => setForm(f => ({
                    ...f,
                    location: result.label,
                    latitude: result.latitude,
                    longitude: result.longitude,
                  }))}
                  placeholder="Search and choose a location..."
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '8px' }}>Accurate Location Pin</label>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px' }}>
                  <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', lineHeight: 1.5 }}>
                    Click the map to drop the exact site pin. This saves the real coordinates for the dashboard map and site records.
                  </p>

                  {form.latitude !== '' && form.longitude !== '' && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        marginBottom: '10px',
                        padding: '9px 10px',
                        borderRadius: '10px',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#1d4ed8' }}>Pinned Coordinates</div>
                        <div style={{ fontSize: '12px', color: '#1e40af', marginTop: '2px' }}>
                          {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, latitude: '', longitude: '' }))}
                        style={{
                          border: 'none',
                          background: '#dbeafe',
                          color: '#1d4ed8',
                          borderRadius: '8px',
                          padding: '7px 10px',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        Clear Pin
                      </button>
                    </div>
                  )}

                  <LocationPicker
                    lat={form.latitude}
                    lng={form.longitude}
                    onPick={(lat, lng) => setForm(f => ({ ...f, latitude: lat, longitude: lng }))}
                    mapKey={`${form.latitude}-${form.longitude}`}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Scheduled Date *</label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                  value={form.scheduled_date}
                  onChange={event => setForm(f => ({ ...f, scheduled_date: event.target.value }))}
                />
              </div>

              {form.site_type === 'site_scanning' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[{ label: 'Site Duration (Days)', key: 'site_duration_days' }, { label: 'Report Duration (Days)', key: 'report_duration_days' }].map(({ label, key }) => (
                    <div key={key}>
                      <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>{label}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                        value={form[key]}
                        onChange={event => setForm(f => ({ ...f, [key]: event.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {form.site_type === 'site_visit' && (
                <div style={{ background: '#f0fdf4', border: '1px solid #4ade80', borderRadius: '8px', padding: '10px 14px' }}>
                  <p style={{ fontSize: '12px', color: '#166534', fontWeight: '500' }}>Duration: Half Day (0.5) - fixed for site visits</p>
                </div>
              )}

              {form.site_type === 'meeting' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Meeting Duration</label>
                  <select
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a' }}
                    value={form.site_duration_days}
                    onChange={event => setForm(f => ({ ...f, site_duration_days: event.target.value }))}
                  >
                    <option value="0.25">2 Hours</option>
                    <option value="0.5">Half Day</option>
                    <option value="1">Full Day</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>{form.site_type === 'meeting' ? 'Organizer' : 'PIC'}</label>
                <select
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a' }}
                  value={form.pic_id}
                  onChange={event => setForm(f => ({ ...f, pic_id: event.target.value }))}
                >
                  <option value="">{form.site_type === 'meeting' ? '- Select Organizer -' : '- Select PIC -'}</option>
                  {members.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '8px' }}>{form.site_type === 'meeting' ? 'Attendees' : 'Crew'}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {members.map(member => (
                    <label key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.crew_ids.includes(member.id)}
                        onChange={() => setForm(f => ({
                          ...f,
                          crew_ids: f.crew_ids.includes(member.id)
                            ? f.crew_ids.filter(id => id !== member.id)
                            : [...f.crew_ids, member.id],
                        }))}
                        style={{ accentColor: '#2563eb', width: '15px', height: '15px' }}
                      />
                      <span style={{ fontSize: '13px', color: '#0f172a' }}>{member.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button
                  onClick={handleAddSave}
                  disabled={saving}
                  style={{ flex: 1, background: '#2563eb', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Saving...' : 'Add Site'}
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  style={{ flex: 1, background: '#f1f5f9', color: '#0f172a', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {updateSite && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={event => event.target === event.currentTarget && setUpdateSite(null)}
        >
          <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>Update Site Status</h3>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>{updateSite.site_name}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Site Status</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {['upcoming', 'ongoing', 'completed', 'cancelled', 'postponed'].map(option => {
                    const active = updateSite.site_status === option
                    const colors = { upcoming: '#d97706', ongoing: '#ea580c', completed: '#16a34a', cancelled: '#dc2626', postponed: '#64748b' }

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setUpdateSite(site => ({ ...site, site_status: option }))}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '99px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          border: `1.5px solid ${active ? colors[option] : '#e2e8f0'}`,
                          background: active ? colors[option] : 'white',
                          color: active ? 'white' : '#64748b',
                          transition: 'all 0.15s',
                        }}
                      >
                        {option.replace('_', ' ')}
                      </button>
                    )
                  })}
                </div>
              </div>

              {updateSite.site_type === 'site_scanning' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Report Status</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {['pending', 'in_progress', 'submitted', 'approved'].map(option => {
                      const active = updateSite.report_status === option
                      const colors = { pending: '#64748b', in_progress: '#2563eb', submitted: '#7c3aed', approved: '#16a34a' }

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setUpdateSite(site => ({ ...site, report_status: option }))}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '99px',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            border: `1.5px solid ${active ? colors[option] : '#e2e8f0'}`,
                            background: active ? colors[option] : 'white',
                            color: active ? 'white' : '#64748b',
                            transition: 'all 0.15s',
                          }}
                        >
                          {option.replace('_', ' ')}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', paddingTop: '8px' }}>
                <button
                  onClick={handleStatusSave}
                  disabled={saving}
                  style={{ flex: 1, background: '#2563eb', color: 'white', border: 'none', padding: '11px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setUpdateSite(null)}
                  style={{ flex: 1, background: '#f1f5f9', color: '#374151', border: 'none', padding: '11px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
