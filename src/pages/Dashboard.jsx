import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { MapContainer, TileLayer, Marker, Tooltip, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CheckCircle, Plus, Pencil, Sparkles, Camera } from 'lucide-react'
import { calculateWorkload } from '../utils/workload'
import { notify } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import PlaceSearchBox from '../components/PlaceSearchBox'
import { mergeCompletionMeta, parseCompletionMeta, validateCompletionRequirement } from '../utils/completionMeta'
import { useViewport } from '../utils/useViewport'
import 'leaflet/dist/leaflet.css'

function xIcon(color, selected = false) {
  const size = selected ? 22 : 16
  return L.divIcon({
    html: `<div style="font-family:Inter,Arial,sans-serif;font-size:${size}px;font-weight:900;color:${color};line-height:1;letter-spacing:-0.03em;-webkit-text-stroke:2px #111827;paint-order:stroke fill;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;">X</div>`,
    className: '',
    iconSize:      [size, size],
    iconAnchor:    [size / 2, size / 2],
    tooltipAnchor: [0, -(size / 2) - 4],
  })
}

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
  not_applicable: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
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

const SALESPERSONS = ['GH Tan', 'Chong Jie Yan', 'Jasmin', 'Darren', 'Wendy', 'Zairul']

const EMPTY_FORM = {
  site_type: 'site_scanning',
  site_name: '',
  location: '',
  latitude: '',
  longitude: '',
  client_company_name: '',
  client_name: '',
  client_number: '',
  scope_of_work: '',
  salesperson: '',
  scheduled_date: '',
  site_status: 'upcoming',
  report_status: 'pending',
  site_duration_days: '1',
  report_duration_days: '0.5',
  notes: '',
  pic_id: '',
  crew_ids: [],
  site_photo: null,
  site_photo_preview: null,
  site_photo_url: '',
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
      scrollWheelZoom={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" />
      <MapClickHandler onPick={onPick} />
      {hasPin && (
        <Marker
          position={[parseFloat(lat), parseFloat(lng)]}
          icon={xIcon('#2563eb', true)}
        />
      )}
    </MapContainer>
  )
}

function Avatar({ name, size = 36, index = 0, avatarUrl = null }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: avatarUrl ? '#0f172a' : AVATAR_COLORS[index % AVATAR_COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: '700', fontSize: size * 0.35,
      boxShadow: '0 12px 24px rgba(15,23,42,0.12)',
    }}>
      {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
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
  const { fullName, firstName, isZairul } = useAuth()
  const { isMobile, isTablet } = useViewport()
  const [members, setMembers] = useState([])
  const [sites, setSites] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const photoInputRef = useRef(null)
  const [updateSite, setUpdateSite] = useState(null)
  const [quickAssign, setQuickAssign] = useState(null)
  const [quickAssignSaving, setQuickAssignSaving] = useState(false)
  const [mapFilter, setMapFilter] = useState('all')

  useEffect(() => {
    fetchAll()
  }, [])

  useEffect(() => {
    function handleOpenAdd() {
      setForm(EMPTY_FORM)
      setShowAdd(true)
    }

    window.addEventListener('xyte:open-add-site', handleOpenAdd)
    return () => window.removeEventListener('xyte:open-add-site', handleOpenAdd)
  }, [])

  async function fetchAll() {
    setLoading(true)

    const { data: memberData } = await supabase
      .from('team_members')
      .select('*')
      .order('full_name')

    const { data: allSites } = await supabase
      .from('sites')
      .select('*, site_assignments(assignment_role, member_id, team_members(id, full_name, avatar_url))')
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
    const isMeeting = form.site_type === 'meeting'
    const payload = {
      site_type: form.site_type,
      site_name: form.site_name,
      location: form.location,
      latitude: form.latitude !== '' ? parseFloat(form.latitude) : null,
      longitude: form.longitude !== '' ? parseFloat(form.longitude) : null,
      client_company_name: form.client_company_name || null,
      client_name: form.client_name || null,
      client_number: form.client_number || null,
      scope_of_work: form.scope_of_work || null,
      salesperson: form.salesperson || null,
      site_photo_url: photoUrl || null,
      scheduled_date: form.scheduled_date,
      site_status: form.site_status,
      site_duration_days: isSiteVisit ? 0.5 : (parseFloat(form.site_duration_days) || 1),
      report_duration_days: isSiteVisit || isMeeting ? 0 : (parseFloat(form.report_duration_days) || 0.5),
      report_status: isSiteVisit || isMeeting ? 'not_applicable' : form.report_status,
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

    await notify(`Added new site: ${form.site_name}`, fullName)
    setSaving(false)
    setShowAdd(false)
    setForm(EMPTY_FORM)
    fetchAll()
  }

  async function handleStatusSave() {
    if (!updateSite) return
    if (updateSite.report_status === 'approved' && !isZairul) return
    const completionError = validateCompletionRequirement(
      updateSite.site_status,
      updateSite.delivery_order_number,
      updateSite.completion_reason
    )
    if (completionError) {
      alert(completionError)
      return
    }
    setSaving(true)

    const original = sites.find(s => s.id === updateSite.id)
    const mergedNotes = mergeCompletionMeta(original?.notes || '', {
      deliveryOrderNumber: updateSite.delivery_order_number,
      completionReason: updateSite.completion_reason,
    })

    const { error } = await supabase
      .from('sites')
      .update({
        site_status: updateSite.site_status,
        report_status: updateSite.report_status,
        notes: mergedNotes,
      })
      .eq('id', updateSite.id)

    if (error) {
      console.error('Failed to save status:', error.message)
      setSaving(false)
      return
    }

    await notify(`Updated ${updateSite.site_name} → ${updateSite.site_status}`, fullName)

    if (original?.report_status !== updateSite.report_status) {
      if (updateSite.report_status === 'submitted')
        await notify(`Report for "${updateSite.site_name}" has been submitted — ready for review`)
      if (updateSite.report_status === 'approved')
        await notify(`Report for "${updateSite.site_name}" has been approved by Zairul`)
    }

    setSaving(false)
    setUpdateSite(null)
    fetchAll()
  }

  function openQuickAssign(site = null) {
    const targetSite = site
      || noPicSites[0]
      || soonSites[0]
      || upcoming[0]
      || sites.find(item => !['completed', 'cancelled'].includes(item.site_status))

    if (!targetSite) {
      setForm(EMPTY_FORM)
      setShowAdd(true)
      return
    }

    const assignments = targetSite.site_assignments || []
    const currentPic = assignments.find(item => String(item.assignment_role).toLowerCase() === 'pic')?.member_id || ''
    const currentCrew = assignments
      .filter(item => String(item.assignment_role).toLowerCase() === 'crew')
      .map(item => item.member_id)

    setQuickAssign({
      siteId: targetSite.id,
      picId: currentPic,
      crewIds: currentCrew,
    })
  }

  async function handleQuickAssignSave() {
    if (!quickAssign?.siteId) return
    setQuickAssignSaving(true)

    await supabase
      .from('site_assignments')
      .delete()
      .eq('site_id', quickAssign.siteId)

    const assignments = []
    if (quickAssign.picId) {
      assignments.push({ site_id: quickAssign.siteId, member_id: quickAssign.picId, assignment_role: 'PIC' })
    }
    quickAssign.crewIds.forEach(memberId => {
      if (memberId !== quickAssign.picId) {
        assignments.push({ site_id: quickAssign.siteId, member_id: memberId, assignment_role: 'crew' })
      }
    })

    if (assignments.length > 0) {
      await supabase.from('site_assignments').insert(assignments)
    }

    const targetSite = sites.find(site => site.id === quickAssign.siteId)
    await notify(`Updated assignments for ${targetSite?.site_name || 'site'}`, fullName)
    setQuickAssignSaving(false)
    setQuickAssign(null)
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

  const smartInsight = useMemo(() => {
    const shortestName = person => person?.full_name?.split(' ')[0] || 'Team member'
    const primarySupport = supportCandidates.map(shortestName).join(' or ')
    const topPendingReport = pendingReports[0]
    const nearestSite = soonSites[0]

    if (overloaded[0] && busiestMember) {
      return {
        tone: {
          bg: '#fff7ed',
          border: '#fed7aa',
          title: '#7c2d12',
          text: '#9a3412',
          pillBg: '#ffedd5',
          pillText: '#9a3412',
        },
        badge: 'Capacity Risk',
        title: `${shortestName(busiestMember)} is carrying the heaviest load this week`,
        body: `${busiestMember.workload.workload_percentage}% workload is starting to crowd the schedule. Shift prep or crew support to ${primarySupport || 'the lowest-load engineer'} to keep delivery stable.`,
      }
    }

    if (nearestSite) {
      const picName = shortestName(nearestSite.site_assignments?.find(a => a.assignment_role === 'PIC')?.team_members)
      return {
        tone: {
          bg: '#eff6ff',
          border: '#bfdbfe',
          title: '#1d4ed8',
          text: '#1e40af',
          pillBg: '#dbeafe',
          pillText: '#1d4ed8',
        },
        badge: 'Upcoming Visit',
        title: `${nearestSite.site_name} needs final readiness check`,
        body: `${formatShortDate(nearestSite.scheduled_date)} is coming up soon. Confirm PIC ${picName}, crew availability, and exact location pin before the visit window closes.`,
      }
    }

    if (topPendingReport) {
      return {
        tone: {
          bg: '#fefce8',
          border: '#fde68a',
          title: '#854d0e',
          text: '#a16207',
          pillBg: '#fef3c7',
          pillText: '#92400e',
        },
        badge: 'Report Queue',
        title: `${pendingReports.length} report${pendingReports.length === 1 ? '' : 's'} still need attention`,
        body: `${topPendingReport.site_name} is the next reporting priority. Clearing the oldest draft first will reduce backlog and keep approvals moving.`,
      }
    }

    if (noPicSites[0]) {
      return {
        tone: {
          bg: '#fef2f2',
          border: '#fecaca',
          title: '#991b1b',
          text: '#b91c1c',
          pillBg: '#fee2e2',
          pillText: '#991b1b',
        },
        badge: 'Ownership Gap',
        title: `${noPicSites[0].site_name} does not have a PIC yet`,
        body: 'Assigning one owner now will make the rest of the workflow clearer for crew planning, status updates, and report handoff.',
      }
    }

    return {
      tone: {
        bg: '#f0fdf4',
        border: '#bbf7d0',
        title: '#166534',
        text: '#15803d',
        pillBg: '#dcfce7',
        pillText: '#166534',
      },
      badge: 'All Clear',
      title: 'The dashboard is in a healthy state today',
      body: `No urgent deadline, overload, or ownership gap is standing out right now. Team average load is ${teamAverage}% with ${upcoming.length} upcoming task${upcoming.length === 1 ? '' : 's'} in view.`,
    }
  }, [busiestMember, noPicSites, overloaded, pendingReports, soonSites, supportCandidates, teamAverage, upcoming])

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
    not_applicable: sites.filter(site => site.report_status === 'not_applicable').length,
  }), [sites])

  const assignableSites = useMemo(
    () => sites.filter(site => !['completed', 'cancelled'].includes(site.site_status)),
    [sites]
  )

  const progressSites = useMemo(
    () => sites.filter(site => ['upcoming', 'ongoing', 'completed'].includes(site.site_status)).slice(0, 3),
    [sites]
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
        <main style={{ maxWidth: '1720px', margin: '0 auto', padding: isMobile ? '16px 14px 28px' : isTablet ? '24px 16px 32px' : '30px 18px 36px' }}>
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1fr) 500px',
              gap: '24px',
              marginBottom: '28px',
              alignItems: 'center',
            }}
          >
            <div style={{ color: 'white', padding: '6px 0 4px' }}>
              <h1 style={{ margin: 0, fontSize: '30px', letterSpacing: '-.05em', fontWeight: '850' }}>
                {getGreeting()}, {firstName}!
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
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : isTablet ? 'repeat(3, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))',
              gap: '12px',
              marginBottom: '24px',
            }}
          >
            {[
              { label: 'Total Sites',     value: totalSites,           trend: getTrendText(upcoming.length, 'sites'),   icon: '▦', color: '#2563eb', tint: 'rgba(37,99,235,.08)',   gradient: 'linear-gradient(135deg,#60a5fa,#2563eb)',  glow: 'rgba(37,99,235,.22)'  },
              { label: 'Upcoming',        value: upcomingSitesCount,   trend: getTrendText(upcomingSitesCount,'upcoming'),icon: '▣', color: '#d97706', tint: 'rgba(217,119,6,.08)',   gradient: 'linear-gradient(135deg,#fbbf24,#f97316)',  glow: 'rgba(217,119,6,.22)'  },
              { label: 'Ongoing',         value: activeSites,          trend: activeSites === 0 ? 'All clear' : `${activeSites} active now`, icon: '◉', color: '#ea580c', tint: 'rgba(234,88,12,.08)', gradient: 'linear-gradient(135deg,#fb923c,#dc2626)', glow: 'rgba(234,88,12,.22)' },
              { label: 'Completed',       value: completedSites,       trend: completedSites > 0 ? `${Math.round((completedSites/Math.max(totalSites,1))*100)}% done` : 'None yet', icon: '✓', color: '#16a34a', tint: 'rgba(22,163,74,.08)', gradient: 'linear-gradient(135deg,#4ade80,#16a34a)', glow: 'rgba(22,163,74,.22)' },
              { label: 'Team Members',    value: members.length,       trend: getTrendText(members.length,'team'),      icon: '◈', color: '#7c3aed', tint: 'rgba(124,58,237,.08)',  gradient: 'linear-gradient(135deg,#a78bfa,#6d28d9)',  glow: 'rgba(124,58,237,.22)' },
              { label: 'Pending Reports', value: pendingReports.length,trend: getTrendText(pendingReports.length,'alert'),icon: '▤', color: '#dc2626', tint: 'rgba(220,38,38,.08)',  gradient: 'linear-gradient(135deg,#f87171,#dc2626)',  glow: 'rgba(220,38,38,.22)'  },
            ].map(card => (
              <div
                key={card.label}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 12px 32px ${card.glow}, 0 2px 8px rgba(0,0,0,.06)` }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,.06), 0 4px 16px rgba(15,23,42,.06)' }}
                style={{
                  background: 'white',
                  border: '1px solid rgba(226,232,240,.9)',
                  borderRadius: '16px',
                  padding: '16px 18px 14px',
                  boxShadow: '0 1px 4px rgba(15,23,42,.06), 0 4px 16px rgba(15,23,42,.06)',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'default',
                  transition: 'transform .18s, box-shadow .18s',
                }}
              >
                {/* tinted top bar */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: card.gradient }} />

                {/* faint background glow blob */}
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: card.tint, filter: 'blur(16px)', pointerEvents: 'none' }} />

                {/* icon badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>{card.label}</span>
                  <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: card.gradient, display: 'grid', placeItems: 'center', color: 'white', fontSize: '13px', fontWeight: '900', boxShadow: `0 4px 10px ${card.glow}`, flexShrink: 0 }}>
                    {card.icon}
                  </div>
                </div>

                {/* value */}
                <div style={{ fontSize: '38px', fontWeight: '850', letterSpacing: '-.05em', color: '#0f172a', lineHeight: 1 }}>
                  {card.value}
                </div>

                {/* divider */}
                <div style={{ height: '1px', background: 'rgba(226,232,240,.7)', margin: '10px 0 8px' }} />

                {/* trend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: card.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', fontWeight: '700', color: card.color }}>{card.trend}</span>
                </div>
              </div>
            ))}
          </section>

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: isTablet ? '1fr' : '340px minmax(0, 1fr) 320px',
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
                {smartInsight && (
                  <div
                    style={{
                      display: 'block',
                      margin: '4px 0 14px',
                      padding: '12px 12px 13px',
                      borderRadius: '14px',
                      background: smartInsight.tone.bg,
                      border: `1px solid ${smartInsight.tone.border}`,
                      color: smartInsight.tone.text,
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                      <b style={{ display: 'flex', alignItems: 'center', gap: '6px', color: smartInsight.tone.title, fontSize: '12px' }}>
                        <Sparkles size={12} />
                        Smart insight
                      </b>
                      <span
                        style={{
                          padding: '5px 8px',
                          borderRadius: '999px',
                          background: smartInsight.tone.pillBg,
                          color: smartInsight.tone.pillText,
                          fontSize: '10px',
                          fontWeight: '800',
                          letterSpacing: '.02em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {smartInsight.badge}
                      </span>
                    </div>
                    <div style={{ color: smartInsight.tone.title, fontSize: '13px', fontWeight: '800', lineHeight: 1.4 }}>
                      {smartInsight.title}
                    </div>
                    <div style={{ marginTop: '5px', color: smartInsight.tone.text, fontSize: '12px', lineHeight: 1.6, fontWeight: '600' }}>
                      {smartInsight.body}
                    </div>
                  </div>
                )}

                {members.map((member, index) => (
                  <div key={member.id} style={{ padding: '14px 0', borderBottom: index === members.length - 1 ? 0 : '1px solid #e5eaf2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Avatar name={member.full_name} size={36} index={index} avatarUrl={member.avatar_url} />
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
                  onClick={() => openQuickAssign()}
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
                  position: 'relative',
                  zIndex: 0,
                  isolation: 'isolate',
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
                      display: 'flex',
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
                  </div>

                  <MapContainer
                    key={`dashboard-map-${mapCenter[0]}-${mapCenter[1]}-${mapFilter}`}
                    center={mapCenter}
                    zoom={10}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                    scrollWheelZoom={false}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {filteredMapSites.map(site => (
                      <Marker
                        key={site.id}
                        position={[site.latitude, site.longitude]}
                        icon={xIcon(MAP_COLORS[site.site_status] || '#2563eb')}
                      >
                        <Tooltip direction="top" offset={[0, -4]} opacity={1}>
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
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </section>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
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
                            <span style={{ borderRadius: '999px', padding: '5px 8px', background: site.report_status === 'approved' ? '#dcfce7' : site.report_status === 'not_applicable' ? '#f1f5f9' : '#fee2e2', color: site.report_status === 'approved' ? '#166534' : site.report_status === 'not_applicable' ? '#475569' : '#991b1b', fontSize: '11px', fontWeight: '800' }}>Report</span>
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
                  <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(226,232,240,.9)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Alerts</h3>
                    <span style={{ color: '#2563eb', fontSize: '13px', fontWeight: '700' }}>Priority</span>
                  </div>
                  <div style={{ padding: '14px 18px 16px', minHeight: '216px' }}>
                    {allClear ? (
                      <div style={{ minHeight: '186px', display: 'grid', placeItems: 'center', textAlign: 'center', color: '#16a34a', fontWeight: '800', fontSize: '13px', padding: '18px' }}>
                        <CheckCircle size={20} color="#16a34a" style={{ marginBottom: '6px' }} />
                        <div>All clear — no issues detected</div>
                      </div>
                    ) : (
                      <div>
                        {noPicSites.map(site => (
                          <div key={site.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb', flexShrink: 0, marginTop: '4px' }} />
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}>No PIC assigned</div>
                              <div style={{ fontSize: '12px', color: '#1e40af', marginTop: '1px' }}>{site.site_name}</div>
                            </div>
                          </div>
                        ))}
                        {soonSites.map(site => (
                          <div key={site.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '10px', background: '#fefce8', border: '1px solid #fde68a', marginBottom: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0, marginTop: '4px' }} />
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '700', color: '#854d0e' }}>Site in {Math.round((new Date(site.scheduled_date) - new Date()) / 86400000)}d</div>
                              <div style={{ fontSize: '12px', color: '#a16207', marginTop: '1px' }}>{site.site_name} — confirm readiness</div>
                            </div>
                          </div>
                        ))}
                        {pendingReports.slice(0, 3).map(site => (
                          <div key={site.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', marginBottom: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', flexShrink: 0, marginTop: '4px' }} />
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '700', color: '#991b1b' }}>Report {site.report_status.replace('_', ' ')}</div>
                              <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '1px' }}>{site.site_name}</div>
                            </div>
                          </div>
                        ))}
                        {overloaded.map(member => (
                          <div key={member.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '10px', background: '#fff7ed', border: '1px solid #fed7aa', marginBottom: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f97316', flexShrink: 0, marginTop: '4px' }} />
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '700', color: '#7c2d12' }}>Overloaded — {member.workload.workload_percentage}%</div>
                              <div style={{ fontSize: '12px', color: '#9a3412', marginTop: '1px' }}>{member.full_name}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {upcoming.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#16a34a', fontWeight: '800', fontSize: '13px', padding: '24px 18px' }}>
                      No upcoming sites in the next 14 days
                    </div>
                  ) : upcoming.map(site => {
                    const pic = site.site_assignments?.find(a => a.assignment_role === 'PIC')
                    const urgent = soonSites.some(item => item.id === site.id)
                    const accentColor = urgent ? '#dc2626' : site.site_status === 'ongoing' ? '#ea580c' : '#d97706'

                    return (
                      <div key={site.id} style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        borderLeft: `3px solid ${accentColor}`,
                        padding: '12px 14px',
                        transition: 'background .15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                      >
                        {/* top row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '5px' }}>
                          <b style={{ fontSize: '13px', color: '#0f172a', lineHeight: 1.3 }}>{site.site_name}</b>
                          <span style={{
                            padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', whiteSpace: 'nowrap', flexShrink: 0,
                            background: urgent ? '#fee2e2' : STATUS_COLORS[site.site_status]?.bg || '#fef3c7',
                            color: urgent ? '#991b1b' : STATUS_COLORS[site.site_status]?.text || '#92400e',
                            border: `1px solid ${urgent ? '#fecaca' : STATUS_COLORS[site.site_status]?.border || '#facc15'}`,
                          }}>
                            {urgent ? 'Urgent' : site.site_status}
                          </span>
                        </div>

                        {/* meta */}
                        <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: '11px' }}>
                          {formatShortDate(site.scheduled_date)} · PIC: {pic?.team_members?.full_name || 'No PIC'}
                        </p>

                        {/* bottom row: avatars + button */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {(site.site_assignments || []).slice(0, 4).map((assignment, idx) => (
                              <div key={`${site.id}-${idx}`} title={assignment.team_members?.full_name} style={{ marginLeft: idx > 0 ? '-5px' : 0, borderRadius: '50%', border: '2px solid white', overflow: 'hidden', flexShrink: 0 }}>
                                <Avatar name={assignment.team_members?.full_name || '?'} size={22} index={idx} avatarUrl={assignment.team_members?.avatar_url} />
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => {
                              const completionMeta = parseCompletionMeta(site.notes || '')
                              setUpdateSite({
                                id: site.id,
                                site_name: site.site_name,
                                site_status: site.site_status,
                                report_status: site.report_status,
                                site_type: site.site_type || 'site_scanning',
                                delivery_order_number: completionMeta.deliveryOrderNumber,
                                completion_reason: completionMeta.completionReason,
                              })
                            }}
                            style={{
                              border: 'none', background: '#2563eb', color: 'white',
                              borderRadius: '7px', padding: '5px 10px', fontWeight: '600',
                              fontSize: '11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
                            }}
                          >
                            <Pencil size={11} /> Update
                          </button>
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
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Reports</h3>
                  <span style={{ color: '#2563eb', fontSize: '13px', fontWeight: '700' }}>Status</span>
                </div>
                <div style={{ padding: '14px 18px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '8px' }}>
                    {[
                      { label: 'Pending',   value: reportSummary.pending,     color: '#ef4444' },
                      { label: 'Draft',     value: reportSummary.in_progress, color: '#f59e0b' },
                      { label: 'Submitted', value: reportSummary.submitted,   color: '#7c3aed' },
                      { label: 'Approved',  value: reportSummary.approved,    color: '#16a34a' },
                      { label: 'N/A',       value: reportSummary.not_applicable, color: '#64748b' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                        <b style={{ display: 'block', fontSize: '22px', letterSpacing: '-.04em', color }}>{value}</b>
                        <span style={{ display: 'block', marginTop: '3px', color: '#64748b', fontSize: '11px', fontWeight: '800' }}>{label}</span>
                      </div>
                    ))}
                  </div>
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
            right: isMobile ? '14px' : '28px',
            bottom: isMobile ? '14px' : '28px',
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
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '92vh', overflowY: 'auto', padding: isMobile ? '18px' : '30px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>Add New Site</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* Photo upload */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '6px' }}>Cover Photo</label>
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={event => {
                  const file = event.target.files[0]
                  if (!file) return
                  setUploadError(null)
                  setForm(f => ({ ...f, site_photo: file, site_photo_preview: URL.createObjectURL(file) }))
                  event.target.value = ''
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

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Client Company Name</label>
                  <input
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                    value={form.client_company_name}
                    placeholder="e.g. XRadar Asia Sdn Bhd"
                    onChange={event => setForm(f => ({ ...f, client_company_name: event.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Client Name</label>
                  <input
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                    value={form.client_name}
                    placeholder="e.g. TNB Bhd"
                    onChange={event => setForm(f => ({ ...f, client_name: event.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Client Number</label>
                  <input
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                    value={form.client_number}
                    placeholder="e.g. PO-12345"
                    onChange={event => setForm(f => ({ ...f, client_number: event.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Scope of Work</label>
                <textarea
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box', resize: 'none' }}
                  rows={2}
                  value={form.scope_of_work}
                  placeholder="Describe the scope of work..."
                  onChange={event => setForm(f => ({ ...f, scope_of_work: event.target.value }))}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Salesperson</label>
                <select
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a' }}
                  value={form.salesperson}
                  onChange={event => setForm(f => ({ ...f, salesperson: event.target.value }))}
                >
                  <option value="">— Select Salesperson —</option>
                  {SALESPERSONS.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                </select>
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
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
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
                    {['pending', 'in_progress', 'submitted', 'approved', 'not_applicable'].map(option => {
                      const active = updateSite.report_status === option
                      const colors = { pending: '#64748b', in_progress: '#2563eb', submitted: '#7c3aed', approved: '#16a34a', not_applicable: '#94a3b8' }
                      const locked = option === 'approved' && !isZairul

                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={locked}
                          title={locked ? 'Only Zairul can approve' : undefined}
                          onClick={() => !locked && setUpdateSite(site => ({ ...site, report_status: option }))}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '99px',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: locked ? 'not-allowed' : 'pointer',
                            border: `1.5px solid ${active ? colors[option] : '#e2e8f0'}`,
                            background: active ? colors[option] : 'white',
                            color: active ? 'white' : locked ? '#cbd5e1' : '#64748b',
                            opacity: locked ? 0.45 : 1,
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

              {updateSite.site_status === 'completed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Delivery Order Number
                    </label>
                    <input
                      value={updateSite.delivery_order_number || ''}
                      onChange={event => setUpdateSite(site => ({ ...site, delivery_order_number: event.target.value }))}
                      placeholder="Key in DO number"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#0f172a' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Reason If No DO
                    </label>
                    <textarea
                      value={updateSite.completion_reason || ''}
                      onChange={event => setUpdateSite(site => ({ ...site, completion_reason: event.target.value }))}
                      placeholder="State the reason if there is no delivery order number"
                      rows={3}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#0f172a', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                    Completed status requires either a delivery order number or a stated reason.
                  </p>
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

      {quickAssign && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={event => event.target === event.currentTarget && setQuickAssign(null)}
        >
          <div style={{ background: 'white', borderRadius: '18px', width: '100%', maxWidth: '540px', padding: '26px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ marginBottom: '22px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Quick Assign</h3>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '5px' }}>Assign PIC and crew for an active site directly from the dashboard.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '6px' }}>Site</label>
                <select
                  value={quickAssign.siteId}
                  onChange={event => openQuickAssign(assignableSites.find(site => site.id === event.target.value))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', color: '#0f172a' }}
                >
                  {assignableSites.map(site => (
                    <option key={site.id} value={site.id}>
                      {site.site_name} · {formatShortDate(site.scheduled_date)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '6px' }}>PIC</label>
                <select
                  value={quickAssign.picId}
                  onChange={event => setQuickAssign(current => ({ ...current, picId: event.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', color: '#0f172a' }}
                >
                  <option value="">- Select PIC -</option>
                  {members.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.full_name} · {member.workload.workload_percentage}% load
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '8px' }}>Crew</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '190px', overflowY: 'auto', paddingRight: '4px' }}>
                  {members.map(member => (
                    <label key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '9px 10px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{member.full_name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{member.role} · {member.workload.workload_percentage}% load</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={quickAssign.crewIds.includes(member.id)}
                        onChange={() => setQuickAssign(current => ({
                          ...current,
                          crewIds: current.crewIds.includes(member.id)
                            ? current.crewIds.filter(id => id !== member.id)
                            : [...current.crewIds, member.id],
                        }))}
                        style={{ accentColor: '#2563eb', width: '16px', height: '16px', flexShrink: 0 }}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button
                  onClick={handleQuickAssignSave}
                  disabled={quickAssignSaving}
                  style={{ flex: 1, background: '#2563eb', color: 'white', border: 'none', padding: '11px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: quickAssignSaving ? 'not-allowed' : 'pointer', opacity: quickAssignSaving ? 0.7 : 1 }}
                >
                  {quickAssignSaving ? 'Saving...' : 'Save Assignment'}
                </button>
                <button
                  onClick={() => setQuickAssign(null)}
                  style={{ flex: 1, background: '#f1f5f9', color: '#0f172a', border: 'none', padding: '11px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
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
