import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'
import { supabase } from '../supabase'
import { Plus, Pencil, Trash2, Search, ArrowUpRight, MapPin, Users, Activity, X, Camera } from 'lucide-react'
import { notify } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import PlaceSearchBox from '../components/PlaceSearchBox'
import { getSiteHeaderImage } from '../utils/siteHeader'
import 'leaflet/dist/leaflet.css'

const CARD_GRADIENTS = {
  site_scanning: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
  site_visit:    'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
  meeting:       'linear-gradient(135deg, #3b0764 0%, #7c3aed 100%)',
}

function getCardIcon(type) {
  if (type === 'site_visit') return MapPin
  if (type === 'meeting') return Users
  return Activity
}

const STATUS_COLORS = {
  upcoming:  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  ongoing:   { bg: '#ffedd5', text: '#9a3412', border: '#fb923c' },
  completed: { bg: '#dcfce7', text: '#166534', border: '#4ade80' },
  cancelled: { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  postponed: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
}

const REPORT_COLORS = {
  pending:     { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  in_progress: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  submitted:   { bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd' },
  approved:    { bg: '#dcfce7', text: '#166534', border: '#4ade80' },
}

const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626']

const SITE_TYPES = [
  { value: 'site_scanning', label: 'Site Scanning' },
  { value: 'site_visit',    label: 'Site Visit'     },
  { value: 'meeting',       label: 'Meeting'        },
]

const TYPE_COLORS = {
  site_scanning: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  site_visit:    { bg: '#f0fdf4', text: '#166534', border: '#4ade80' },
  meeting:       { bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd' },
}

const SALESPERSONS = ['GH Tan', 'Chong Jie Yan', 'Jasmin', 'Darren', 'Wendy', 'Zairul']

function MapClickHandler({ onPick }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

function LocationPicker({ lat, lng, onPick, mapKey }) {
  const hasPin = lat !== '' && lng !== ''
  const center = hasPin ? [parseFloat(lat), parseFloat(lng)] : [3.1390, 101.6869]
  return (
    <MapContainer key={mapKey} center={center} zoom={hasPin ? 13 : 10}
      style={{ height: '160px', borderRadius: '8px', cursor: 'crosshair' }}
      zoomControl={false}>
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

function Avatar({ name, size = 28, index = 0, avatarUrl = null }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: avatarUrl ? '#0f172a' : AVATAR_COLORS[index % AVATAR_COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: '600', fontSize: size * 0.36,
    }}>
      {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </div>
  )
}

function StatusPill({ status, colors }) {
  const c = colors[status] || colors[Object.keys(colors)[0]]
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      padding: '3px 10px', borderRadius: '99px', fontSize: '11px',
      fontWeight: '500', textTransform: 'capitalize', whiteSpace: 'nowrap'
    }}>{status?.replace('_', ' ')}</span>
  )
}

const EMPTY = {
  site_type: 'site_scanning',
  site_name: '', location: '', latitude: '', longitude: '',
  client_company_name: '',
  client_name: '', client_number: '', scope_of_work: '', salesperson: '',
  scheduled_date: '', site_status: 'upcoming', report_status: 'pending',
  site_duration_days: '1', report_duration_days: '0.5',
  notes: '', pic_id: '', crew_ids: [],
  site_photo: null, site_photo_preview: null, site_photo_url: '',
}

async function uploadSitePhoto(file) {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('site-photos').upload(path, file)
  if (error) {
    console.error('Photo upload error:', error.message)
    return { url: null, error: error.message }
  }
  const { data: { publicUrl } } = supabase.storage.from('site-photos').getPublicUrl(path)
  return { url: publicUrl, error: null }
}

const TABS = ['All', 'Upcoming', 'Ongoing', 'Completed', 'Cancelled', 'Postponed']

export default function Sites() {
  const { fullName, isZairul } = useAuth()
  const [sites, setSites]       = useState([])
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('All')
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editSite, setEditSite] = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [page, setPage]             = useState(1)
  const [expandedCard, setExpandedCard] = useState(null)
  const [quickSaving, setQuickSaving]   = useState(null)
  const photoInputRef = useRef(null)
  const PER_PAGE = 6

  const location = useLocation()
  useEffect(() => { fetchAll() }, [])
  useEffect(() => { if (location.state?.openAdd) openAdd() }, [location.state])
  useEffect(() => {
    function handleOpenAdd() {
      openAdd()
    }

    window.addEventListener('xyte:open-add-site', handleOpenAdd)
    return () => window.removeEventListener('xyte:open-add-site', handleOpenAdd)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: s } = await supabase
      .from('sites')
      .select(`*, site_assignments(assignment_role, team_members(id, full_name, avatar_url))`)
      .order('scheduled_date', { ascending: true })
    const { data: m } = await supabase
      .from('team_members').select('*').order('full_name')
    setSites(s || [])
    setMembers(m || [])
    setLoading(false)
  }

  async function handleQuickUpdate(siteId, field, value) {
    if (field === 'report_status' && value === 'approved' && !isZairul) return
    setQuickSaving(`${siteId}-${field}`)
    await supabase.from('sites').update({ [field]: value }).eq('id', siteId)
    setSites(prev => prev.map(s => s.id === siteId ? { ...s, [field]: value } : s))
    setQuickSaving(null)
    if (field === 'report_status') {
      const siteName = sites.find(s => s.id === siteId)?.site_name || 'site'
      if (value === 'submitted') await notify(`Report for "${siteName}" has been submitted — ready for review`)
      if (value === 'approved') await notify(`Report for "${siteName}" has been approved by Zairul`)
    }
  }

  function openAdd() { setForm(EMPTY); setEditSite(null); setShowForm(true) }

  function openEdit(site) {
    const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
    const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew')
    setForm({
      site_type: site.site_type || 'site_scanning',
      site_name: site.site_name, location: site.location,
      latitude: site.latitude || '', longitude: site.longitude || '',
      client_company_name: site.client_company_name || '',
      client_name: site.client_name || '',
      client_number: site.client_number || '',
      scope_of_work: site.scope_of_work || '',
      salesperson: site.salesperson || '',
      scheduled_date: site.scheduled_date, site_status: site.site_status,
      site_duration_days: site.site_duration_days?.toString() || '1',
      report_duration_days: site.report_duration_days?.toString() || '0.5',
      report_status: site.report_status, notes: site.notes || '',
      pic_id: pic?.team_members?.id || '',
      crew_ids: crew?.map(c => c.team_members?.id) || [],
      site_photo: null,
      site_photo_preview: site.site_photo_url || null,
      site_photo_url: site.site_photo_url || '',
    })
    setEditSite(site)
    setShowForm(true)
  }

  function toggleCrew(id) {
    setForm(f => ({
      ...f,
      crew_ids: f.crew_ids.includes(id)
        ? f.crew_ids.filter(x => x !== id)
        : [...f.crew_ids, id]
    }))
  }

  async function handleSave() {
    if (!form.site_name || !form.location || !form.scheduled_date) return
    setSaving(true)
    setUploadError(null)
    let photoUrl = form.site_photo_url
    if (form.site_photo) {
      const result = await uploadSitePhoto(form.site_photo)
      if (result.error) {
        setUploadError(result.error)
        setSaving(false)
        return
      }
      photoUrl = result.url
    }
    const isSiteVisit = form.site_type === 'site_visit'
    const isMeeting   = form.site_type === 'meeting'
    const payload = {
      site_type: form.site_type,
      site_name: form.site_name, location: form.location,
      latitude:  form.latitude  !== '' ? parseFloat(form.latitude)  : null,
      longitude: form.longitude !== '' ? parseFloat(form.longitude) : null,
      client_company_name: form.client_company_name || null,
      client_name: form.client_name || null,
      client_number: form.client_number || null,
      scope_of_work: form.scope_of_work || null,
      salesperson: form.salesperson || null,
      site_photo_url: photoUrl || null,
      scheduled_date: form.scheduled_date, site_status: form.site_status,
      site_duration_days: isSiteVisit ? 0.5 : (form.site_duration_days ? parseFloat(form.site_duration_days) : 0),
      report_duration_days: isSiteVisit || isMeeting ? 0 : (form.report_duration_days ? parseFloat(form.report_duration_days) : 0),
      report_status: isSiteVisit || isMeeting ? 'pending' : form.report_status,
      notes: form.notes,
    }
    let siteId = editSite?.id
    if (editSite) {
      await supabase.from('sites').update(payload).eq('id', siteId)
      await supabase.from('site_assignments').delete().eq('site_id', siteId)
      await supabase.from('workload_log').delete().eq('site_id', siteId)
    } else {
      const { data } = await supabase.from('sites').insert(payload).select().single()
      siteId = data.id
    }
    const assignments = []
    if (form.pic_id) assignments.push({ site_id: siteId, member_id: form.pic_id, assignment_role: 'PIC' })
    form.crew_ids.forEach(id => {
      if (id !== form.pic_id) assignments.push({ site_id: siteId, member_id: id, assignment_role: 'crew' })
    })
    if (assignments.length > 0) await supabase.from('site_assignments').insert(assignments)
    setSaving(false)
    setShowForm(false)
    fetchAll()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this site?')) return
    await supabase.from('sites').delete().eq('id', id)
    fetchAll()
  }

  const filtered = sites
    .filter(s => tab === 'All' || s.site_status === tab.toLowerCase())
    .filter(s => !search || s.site_name.toLowerCase().includes(search.toLowerCase()) || s.location.toLowerCase().includes(search.toLowerCase()))

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none',
    background: 'white', color: '#0f172a'
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: '#64748b' }}>Loading sites...</div>
    </div>
  )

  return (
    <div style={{ height: 'calc(100vh - 54px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '14px 20px', gap: '0' }}>

      {/* Header */}
      <div style={{ marginBottom: '10px', flexShrink: 0 }}>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>Sites</h1>
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '1px' }}>{sites.length} total sites</p>
      </div>

      {/* Search + Tabs */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '10px 14px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '280px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Search sites..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{ ...inputStyle, paddingLeft: '32px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setPage(1) }} style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
              fontWeight: '500', cursor: 'pointer', border: 'none',
              background: tab === t ? '#2563eb' : 'transparent',
              color: tab === t ? 'white' : '#64748b',
              transition: 'all 0.15s'
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Card Grid */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {paginated.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '48px', textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>No sites found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {paginated.map(site => {
            const pic    = site.site_assignments?.find(a => a.assignment_role === 'PIC')
            const crew   = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []
            const TypeIcon = getCardIcon(site.site_type)
            const typeLabel = SITE_TYPES.find(t => t.value === site.site_type)?.label || 'Site Scanning'
            return (
              <div key={site.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
              >
                {/* Banner */}
                <div style={{ height: '64px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: CARD_GRADIENTS[site.site_type] || CARD_GRADIENTS.site_scanning }}>
                  <img src={site.site_photo_url || getSiteHeaderImage(site.site_type)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.22)' }} />
                  {!site.site_photo_url && <TypeIcon size={22} color="rgba(255,255,255,0.55)" />}
                  <div style={{ position: 'absolute', bottom: '7px', left: '10px', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 1 }}>
                    <MapPin size={10} color="rgba(255,255,255,0.6)" />
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.location}</span>
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', marginBottom: '2px' }}>
                    <h3 style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', margin: 0, lineHeight: 1.3 }}>{site.site_name}</h3>
                    <StatusPill status={site.site_status} colors={STATUS_COLORS} />
                  </div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '8px' }}>Type: {typeLabel}</p>

                  {/* Date + Duration */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #f1f5f9', borderRadius: '7px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div style={{ padding: '6px 10px', borderRight: '1px solid #f1f5f9' }}>
                      <p style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '1px', fontWeight: '500' }}>Scheduled</p>
                      <p style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>
                        {new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div style={{ padding: '6px 10px' }}>
                      <p style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '1px', fontWeight: '500' }}>Duration</p>
                      <p style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>{site.site_duration_days}d</p>
                    </div>
                  </div>

                  {/* PIC + Report */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {pic
                        ? <Avatar name={pic.team_members?.full_name} size={20} index={0} avatarUrl={pic.team_members?.avatar_url} />
                        : <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#e2e8f0' }} />
                      }
                      <span style={{ fontSize: '11px', color: '#0f172a', fontWeight: '500' }}>{pic?.team_members?.full_name || '—'}</span>
                      {pic && <span style={{ fontSize: '9px', background: '#eff6ff', color: '#1d4ed8', padding: '1px 5px', borderRadius: '99px', fontWeight: '600' }}>PIC</span>}
                    </div>
                    <StatusPill status={site.report_status} colors={REPORT_COLORS} />
                  </div>

                  {/* Crew avatars */}
                  {crew.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                      {crew.slice(0, 4).map((c, ci) => (
                        <div key={ci} title={c.team_members?.full_name} style={{ marginLeft: ci > 0 ? '-5px' : 0, border: '2px solid white', borderRadius: '50%' }}>
                          <Avatar name={c.team_members?.full_name || '?'} size={20} index={ci + 1} avatarUrl={c.team_members?.avatar_url} />
                        </div>
                      ))}
                      {crew.length > 4 && <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '5px' }}>+{crew.length - 4}</span>}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                    <Link to={`/sites/${site.id}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: '#0f172a', color: 'white', textDecoration: 'none', padding: '6px', borderRadius: '7px', fontSize: '11px', fontWeight: '600', border: 'none' }}>
                      View Details <ArrowUpRight size={11} />
                    </Link>
                    <button
                      onClick={() => setExpandedCard(expandedCard === site.id ? null : site.id)}
                      style={{ flex: 1, height: '30px', background: expandedCard === site.id ? '#2563eb' : '#e0edff', border: 'none', borderRadius: '7px', cursor: 'pointer', color: expandedCard === site.id ? 'white' : '#2563eb', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <Pencil size={10} /> Update
                    </button>
                    <button onClick={() => openEdit(site)} title="Edit site" style={{ width: '30px', height: '30px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => handleDelete(site.id)} style={{ width: '30px', height: '30px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '7px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Inline progress update panel */}
                  {expandedCard === site.id && (
                    <div style={{ marginTop: '10px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Site Status</p>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        {['upcoming','ongoing','completed','cancelled','postponed'].map(s => {
                          const c = STATUS_COLORS[s]
                          const active = site.site_status === s
                          const isLoading = quickSaving === `${site.id}-site_status`
                          return (
                            <button key={s} disabled={!!quickSaving} onClick={() => handleQuickUpdate(site.id, 'site_status', s)} style={{
                              padding: '4px 9px', borderRadius: '99px', fontSize: '10px', fontWeight: '600', cursor: quickSaving ? 'wait' : 'pointer', border: `1px solid ${active ? c.border : '#e2e8f0'}`,
                              background: active ? c.bg : 'white', color: active ? c.text : '#94a3b8',
                              opacity: isLoading && !active ? 0.5 : 1, transition: 'all 0.12s',
                            }}>{s}</button>
                          )
                        })}
                      </div>
                      {site.site_type === 'site_scanning' && (
                        <>
                          <p style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Report Status</p>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {['pending','in_progress','submitted','approved'].map(s => {
                              const c = REPORT_COLORS[s]
                              const active = site.report_status === s
                              const isLoading = quickSaving === `${site.id}-report_status`
                              const locked = s === 'approved' && !isZairul
                              return (
                                <button key={s} disabled={!!quickSaving || locked} onClick={() => !locked && handleQuickUpdate(site.id, 'report_status', s)} title={locked ? 'Only Zairul can approve' : undefined} style={{
                                  padding: '4px 9px', borderRadius: '99px', fontSize: '10px', fontWeight: '600',
                                  cursor: locked ? 'not-allowed' : quickSaving ? 'wait' : 'pointer',
                                  border: `1px solid ${active ? c.border : '#e2e8f0'}`,
                                  background: active ? c.bg : 'white', color: active ? c.text : locked ? '#cbd5e1' : '#94a3b8',
                                  opacity: locked ? 0.45 : isLoading && !active ? 0.5 : 1, transition: 'all 0.12s',
                                }}>{s.replace('_', ' ')}</button>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#cbd5e1' : '#0f172a', fontSize: '12px' }}>Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: page === p ? '#2563eb' : 'white', color: page === p ? 'white' : '#0f172a', cursor: 'pointer', fontSize: '12px' }}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#cbd5e1' : '#0f172a', fontSize: '12px' }}>Next</button>
          </div>
        </div>
      )}
      </div>{/* end flex:1 scroll wrapper */}

      {/* Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '92vh', overflowY: 'auto', padding: '30px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>
              {editSite ? 'Edit Site' : 'Add New Site'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* Photo upload */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '6px' }}>Cover Photo</label>
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                  const file = e.target.files[0]
                  if (!file) return
                  setUploadError(null)
                  setForm(f => ({ ...f, site_photo: file, site_photo_preview: URL.createObjectURL(file) }))
                  e.target.value = ''
                }} />
                {form.site_photo_preview ? (
                  <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
                    <img src={form.site_photo_preview} alt="preview" style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: 0, transition: 'opacity 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = 0}
                    >
                      <button type="button" onClick={() => photoInputRef.current?.click()} style={{ background: 'white', color: '#0f172a', border: 'none', padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Change</button>
                      <button type="button" onClick={() => setForm(f => ({ ...f, site_photo: null, site_photo_preview: null, site_photo_url: '' }))} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Remove</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => photoInputRef.current?.click()} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '2px dashed #e2e8f0', borderRadius: '10px', padding: '28px', cursor: 'pointer', background: '#f8fafc', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                  >
                    <Camera size={22} color="#94a3b8" />
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Click to upload a cover photo</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>JPG, PNG, WEBP</span>
                  </button>
                )}
                {uploadError && (
                  <p style={{ marginTop: '6px', fontSize: '11px', color: '#ef4444', fontWeight: '500' }}>Upload failed: {uploadError}</p>
                )}
              </div>

              {/* Site Type */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '6px' }}>Site Type *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {SITE_TYPES.map(({ value, label }) => {
                    const active = form.site_type === value
                    const tc = TYPE_COLORS[value]
                    return (
                      <button key={value} type="button" onClick={() => setForm(f => ({
                        ...f,
                        site_type: value,
                        site_duration_days: value === 'site_visit' ? '0.5' : f.site_duration_days,
                      }))} style={{
                        flex: 1, padding: '8px 6px', borderRadius: '8px',
                        border: `1px solid ${active ? tc.border : '#e2e8f0'}`,
                        background: active ? tc.bg : 'white',
                        color: active ? tc.text : '#64748b',
                        fontSize: '12px', fontWeight: active ? '600' : '400',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>{label}</button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Site Name *</label>
                <input
                  style={inputStyle}
                  value={form.site_name}
                  placeholder="e.g. Jalan Ampang Survey"
                  onChange={e => setForm(f => ({ ...f, site_name: e.target.value }))}
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

              {/* Map pin picker */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b' }}>
                    Pin on Map <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '400' }}>(click to place marker)</span>
                  </label>
                  {form.latitude !== '' && form.longitude !== '' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <MapPin size={11} color="#2563eb" />
                      <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: '500' }}>
                        {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}
                      </span>
                      <button onClick={() => setForm(f => ({ ...f, latitude: '', longitude: '' }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}>
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
                <LocationPicker
                  lat={form.latitude}
                  lng={form.longitude}
                  onPick={(lat, lng) => setForm(f => ({ ...f, latitude: lat, longitude: lng }))}
                  mapKey={editSite?.id || 'new'}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Client Company Name</label>
                  <input style={inputStyle} value={form.client_company_name} placeholder="e.g. XRadar Asia Sdn Bhd" onChange={e => setForm(f => ({ ...f, client_company_name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Client Name</label>
                  <input style={inputStyle} value={form.client_name} placeholder="e.g. TNB Bhd" onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Client Number</label>
                  <input style={inputStyle} value={form.client_number} placeholder="e.g. PO-12345" onChange={e => setForm(f => ({ ...f, client_number: e.target.value }))} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Scope of Work</label>
                <textarea style={{ ...inputStyle, resize: 'none' }} rows={2} value={form.scope_of_work} placeholder="Describe the scope of work..." onChange={e => setForm(f => ({ ...f, scope_of_work: e.target.value }))} />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Salesperson</label>
                <select style={inputStyle} value={form.salesperson} onChange={e => setForm(f => ({ ...f, salesperson: e.target.value }))}>
                  <option value="">— Select Salesperson —</option>
                  {SALESPERSONS.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Scheduled Date *</label>
                <input type="date" style={inputStyle} value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
              </div>
              {/* Duration — conditional per site type */}
              {form.site_type === 'site_scanning' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Site Duration (Days)</label>
                    <input type="number" min="0" step="0.5" style={inputStyle} value={form.site_duration_days} placeholder="e.g. 1 or 2" onChange={e => setForm(f => ({ ...f, site_duration_days: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Report Duration (Days)</label>
                    <input type="number" min="0" step="0.5" style={inputStyle} value={form.report_duration_days} placeholder="e.g. 0.5 or 1" onChange={e => setForm(f => ({ ...f, report_duration_days: e.target.value }))} />
                  </div>
                </div>
              )}
              {form.site_type === 'site_visit' && (
                <div style={{ background: '#f0fdf4', border: '1px solid #4ade80', borderRadius: '8px', padding: '10px 14px' }}>
                  <p style={{ fontSize: '12px', color: '#166534', fontWeight: '500' }}>Duration: Half Day (0.5) — fixed for site visits</p>
                </div>
              )}
              {form.site_type === 'meeting' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Meeting Duration</label>
                  <select style={inputStyle} value={form.site_duration_days} onChange={e => setForm(f => ({ ...f, site_duration_days: e.target.value }))}>
                    <option value="0.25">2 Hours</option>
                    <option value="0.5">Half Day</option>
                    <option value="1">Full Day</option>
                  </select>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: form.site_type === 'site_scanning' ? '1fr 1fr' : '1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Site Status</label>
                  <select style={inputStyle} value={form.site_status} onChange={e => setForm(f => ({ ...f, site_status: e.target.value }))}>
                    {['upcoming','ongoing','completed','cancelled','postponed'].map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                  </select>
                </div>
                {form.site_type === 'site_scanning' && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Report Status</label>
                    <select style={inputStyle} value={form.report_status} onChange={e => setForm(f => ({ ...f, report_status: e.target.value }))}>
                      {['pending','in_progress','submitted','approved'].map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                  {form.site_type === 'meeting' ? 'Organizer' : 'PIC'}
                </label>
                <select style={inputStyle} value={form.pic_id} onChange={e => setForm(f => ({ ...f, pic_id: e.target.value }))}>
                  <option value="">{form.site_type === 'meeting' ? '— Select Organizer —' : '— Select PIC —'}</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '8px' }}>
                  {form.site_type === 'meeting' ? 'Attendees' : 'Crew'}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {members.map(m => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.crew_ids.includes(m.id)} onChange={() => toggleCrew(m.id)} style={{ accentColor: '#2563eb', width: '15px', height: '15px' }} />
                      <span style={{ fontSize: '13px', color: '#0f172a' }}>{m.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Notes</label>
                <textarea style={{ ...inputStyle, resize: 'none' }} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
              </div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={handleSave} disabled={saving} style={{ flex: 1, background: '#2563eb', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving...' : editSite ? 'Save Changes' : 'Add Site'}
                </button>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, background: '#f1f5f9', color: '#0f172a', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
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
