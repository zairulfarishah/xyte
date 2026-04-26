import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'
import { supabase } from '../supabase'
import {
  Plus, Pencil, Trash2, Search, ArrowUpRight, MapPin, X, Camera,
  Calendar, Clock, CheckCircle,
} from 'lucide-react'
import { notify } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import PlaceSearchBox from '../components/PlaceSearchBox'
import { getSiteHeaderImage } from '../utils/siteHeader'
import 'leaflet/dist/leaflet.css'

const STATUS_COLORS = {
  upcoming:  { bg:'rgba(234,179,8,.14)',   text:'#fbbf24', border:'rgba(234,179,8,.3)'   },
  ongoing:   { bg:'rgba(249,115,22,.14)',  text:'#fb923c', border:'rgba(249,115,22,.3)'  },
  completed: { bg:'rgba(34,197,94,.14)',   text:'#4ade80', border:'rgba(34,197,94,.3)'   },
  cancelled: { bg:'rgba(239,68,68,.14)',   text:'#f87171', border:'rgba(239,68,68,.3)'   },
  postponed: { bg:'rgba(148,163,184,.12)', text:'#94a3b8', border:'rgba(148,163,184,.25)' },
}
const REPORT_COLORS = {
  pending:        { bg:'rgba(148,163,184,.1)',  text:'#94a3b8', border:'rgba(148,163,184,.2)'  },
  in_progress:    { bg:'rgba(59,130,246,.14)',  text:'#60a5fa', border:'rgba(59,130,246,.3)'   },
  submitted:      { bg:'rgba(167,139,250,.14)', text:'#a78bfa', border:'rgba(167,139,250,.3)'  },
  approved:       { bg:'rgba(52,211,153,.14)',  text:'#34d399', border:'rgba(52,211,153,.3)'   },
  not_applicable: { bg:'rgba(148,163,184,.07)', text:'#64748b', border:'rgba(148,163,184,.15)' },
}
const CARD_GRADIENTS = {
  site_scanning: 'linear-gradient(135deg,#0f2460 0%,#1a4b8c 55%,#0891b2 100%)',
  site_visit:    'linear-gradient(135deg,#042f2e 0%,#065f46 55%,#0d9488 100%)',
  meeting:       'linear-gradient(135deg,#1e0a3c 0%,#4c1d95 55%,#7c3aed 100%)',
}
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#1d4ed8,#0891b2)',
  'linear-gradient(135deg,#6d28d9,#7c3aed)',
  'linear-gradient(135deg,#be185d,#db2777)',
  'linear-gradient(135deg,#047857,#059669)',
  'linear-gradient(135deg,#b45309,#d97706)',
  'linear-gradient(135deg,#991b1b,#dc2626)',
]
const TYPE_META = {
  site_scanning: { label:'Site Scanning', color:'#60a5fa', chipBg:'rgba(59,130,246,0.12)' },
  site_visit:    { label:'Site Visit',    color:'#2dd4bf', chipBg:'rgba(13,148,136,0.12)'  },
  meeting:       { label:'Meeting',       color:'#a78bfa', chipBg:'rgba(124,58,237,0.12)'  },
}
const SITE_TYPES   = [
  { value:'site_scanning', label:'Site Scanning' },
  { value:'site_visit',    label:'Site Visit'    },
  { value:'meeting',       label:'Meeting'       },
]
const SALESPERSONS = ['GH Tan','Chong Jie Yan','Jasmin','Darren','Wendy','Zairul']
const TABS         = ['All','Upcoming','Ongoing','Completed','Cancelled','Postponed']
const EMPTY = {
  site_type:'site_scanning', site_name:'', location:'', latitude:'', longitude:'',
  client_company_name:'', client_name:'', client_number:'', scope_of_work:'',
  salesperson:'', scheduled_date:'', site_status:'upcoming', report_status:'pending',
  site_duration_days:'1', report_duration_days:'0.5', notes:'', pic_id:'', crew_ids:[],
  site_photo:null, site_photo_preview:null, site_photo_url:'',
}

function Avatar({ name, size = 26, index = 0, avatarUrl = null }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() || '?'
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0, overflow:'hidden',
      background: avatarUrl ? '#0f172a' : AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length],
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'white', fontWeight:'700', fontSize:size * .36,
      border:'2px solid rgba(255,255,255,0.12)',
    }}>
      {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initials}
    </div>
  )
}

function Pill({ status, colors }) {
  const c = colors[status] || colors[Object.keys(colors)[0]]
  const done = status === 'completed' || status === 'approved'
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:'4px',
      background:c.bg, color:c.text, border:`1px solid ${c.border}`,
      padding:'3px 9px', borderRadius:'99px', fontSize:'10px',
      fontWeight:'700', textTransform:'capitalize', whiteSpace:'nowrap', flexShrink:0,
    }}>
      {status?.replace(/_/g,' ')}
      {done && <CheckCircle size={9} />}
    </span>
  )
}

async function uploadSitePhoto(file) {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('site-photos').upload(path, file)
  if (error) return { url:null, error:error.message }
  const { data:{ publicUrl } } = supabase.storage.from('site-photos').getPublicUrl(path)
  return { url:publicUrl, error:null }
}

function MapClickHandler({ onPick }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}
function LocationPicker({ lat, lng, onPick, mapKey }) {
  const hasPin = lat !== '' && lng !== ''
  const center = hasPin ? [parseFloat(lat), parseFloat(lng)] : [3.139, 101.6869]
  return (
    <MapContainer key={mapKey} center={center} zoom={hasPin ? 13 : 10}
      style={{ height:'160px', borderRadius:'10px', cursor:'crosshair' }} zoomControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" />
      <MapClickHandler onPick={onPick} />
      {hasPin && <CircleMarker center={[parseFloat(lat), parseFloat(lng)]} radius={9}
        pathOptions={{ color:'white', fillColor:'#2563eb', fillOpacity:1, weight:3 }} />}
    </MapContainer>
  )
}

export default function Sites() {
  const { fullName, isZairul } = useAuth()
  const [sites, setSites]             = useState([])
  const [members, setMembers]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('All')
  const [search, setSearch]           = useState('')
  const [showForm, setShowForm]       = useState(false)
  const [editSite, setEditSite]       = useState(null)
  const [form, setForm]               = useState(EMPTY)
  const [saving, setSaving]           = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [page, setPage]               = useState(1)
  const [expandedCard, setExpandedCard] = useState(null)
  const [quickSaving, setQuickSaving]   = useState(null)
  const [draftStatus, setDraftStatus]   = useState(null)
  const photoInputRef = useRef(null)
  const PER_PAGE = 6

  const location = useLocation()
  useEffect(() => { fetchAll() }, [])
  useEffect(() => { if (location.state?.openAdd) openAdd() }, [location.state])
  useEffect(() => {
    const h = () => openAdd()
    window.addEventListener('xyte:open-add-site', h)
    return () => window.removeEventListener('xyte:open-add-site', h)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data:s } = await supabase
      .from('sites')
      .select(`*, site_assignments(assignment_role, team_members(id, full_name, avatar_url))`)
      .order('scheduled_date', { ascending:true })
    const { data:m } = await supabase.from('team_members').select('*').order('full_name')
    setSites(s || [])
    setMembers(m || [])
    setLoading(false)
  }

  async function handleQuickSave(site) {
    if (!draftStatus) return
    const updates = {}
    if (draftStatus.site_status   !== site.site_status)   updates.site_status   = draftStatus.site_status
    if (draftStatus.report_status !== site.report_status) updates.report_status = draftStatus.report_status
    if (Object.keys(updates).length > 0) {
      setQuickSaving(site.id)
      const { error } = await supabase.from('sites').update(updates).eq('id', site.id)
      if (error) { setQuickSaving(null); return }
      setSites(prev => prev.map(s => s.id === site.id ? { ...s, ...updates } : s))
      if (updates.report_status === 'submitted') await notify(`Report for "${site.site_name}" has been submitted — ready for review`, fullName)
      if (updates.report_status === 'approved')  await notify(`Report for "${site.site_name}" has been approved by Zairul`, fullName)
      setQuickSaving(null)
    }
    setExpandedCard(null); setDraftStatus(null)
  }

  function openAdd() { setForm(EMPTY); setEditSite(null); setShowForm(true) }
  function openEdit(site) {
    const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
    const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew')
    setForm({
      site_type: site.site_type || 'site_scanning',
      site_name:site.site_name, location:site.location,
      latitude:site.latitude||'', longitude:site.longitude||'',
      client_company_name:site.client_company_name||'', client_name:site.client_name||'',
      client_number:site.client_number||'', scope_of_work:site.scope_of_work||'',
      salesperson:site.salesperson||'', scheduled_date:site.scheduled_date,
      site_status:site.site_status,
      site_duration_days:site.site_duration_days?.toString()||'1',
      report_duration_days:site.report_duration_days?.toString()||'0.5',
      report_status:site.report_status, notes:site.notes||'',
      pic_id:pic?.team_members?.id||'',
      crew_ids:crew?.map(c => c.team_members?.id)||[],
      site_photo:null, site_photo_preview:site.site_photo_url||null, site_photo_url:site.site_photo_url||'',
    })
    setEditSite(site); setShowForm(true)
  }
  function toggleCrew(id) {
    setForm(f => ({ ...f, crew_ids: f.crew_ids.includes(id) ? f.crew_ids.filter(x => x!==id) : [...f.crew_ids, id] }))
  }

  async function handleSave() {
    if (!form.site_name || !form.location || !form.scheduled_date) return
    setSaving(true); setUploadError(null)
    try {
      let photoUrl = form.site_photo_url
      if (form.site_photo) {
        const r = await uploadSitePhoto(form.site_photo)
        if (r.error) throw new Error(r.error)
        photoUrl = r.url
      }
      const isSiteVisit = form.site_type === 'site_visit'
      const isMeeting   = form.site_type === 'meeting'
      const payload = {
        site_type:form.site_type, site_name:form.site_name, location:form.location,
        latitude:form.latitude!=='' ? parseFloat(form.latitude) : null,
        longitude:form.longitude!=='' ? parseFloat(form.longitude) : null,
        client_company_name:form.client_company_name||null, client_name:form.client_name||null,
        client_number:form.client_number||null, scope_of_work:form.scope_of_work||null,
        salesperson:form.salesperson||null, site_photo_url:photoUrl||null,
        scheduled_date:form.scheduled_date, site_status:form.site_status,
        site_duration_days:isSiteVisit ? 0.5 : (parseFloat(form.site_duration_days)||0),
        report_duration_days:isSiteVisit||isMeeting ? 0 : (parseFloat(form.report_duration_days)||0),
        report_status:isSiteVisit||isMeeting ? 'not_applicable' : form.report_status,
        notes:form.notes,
      }
      let siteId = editSite?.id
      const origA    = editSite?.site_assignments||[]
      const origPic  = origA.find(a => a.assignment_role==='PIC')?.team_members?.id||''
      const origCrew = origA.filter(a => a.assignment_role==='crew').map(a => a.team_members?.id).filter(Boolean).sort()
      const nextCrew = [...form.crew_ids].sort()
      const changed  = !editSite || origPic!==form.pic_id || origCrew.length!==nextCrew.length || origCrew.some((id,i) => id!==nextCrew[i])
      if (editSite) {
        const { error } = await supabase.from('sites').update(payload).eq('id', siteId)
        if (error) throw new Error(error.message)
        if (changed) {
          await supabase.from('site_assignments').delete().eq('site_id', siteId)
          await supabase.from('workload_log').delete().eq('site_id', siteId)
        }
      } else {
        const { data, error } = await supabase.from('sites').insert(payload).select().single()
        if (error) throw new Error(error.message)
        siteId = data.id
      }
      if (changed) {
        const assignments = []
        if (form.pic_id) assignments.push({ site_id:siteId, member_id:form.pic_id, assignment_role:'PIC' })
        form.crew_ids.forEach(id => { if (id!==form.pic_id) assignments.push({ site_id:siteId, member_id:id, assignment_role:'crew' }) })
        if (assignments.length > 0) await supabase.from('site_assignments').insert(assignments)
      }
      await notify(`${editSite?'Updated':'Added'} site: ${form.site_name}`, fullName)
      setShowForm(false); setEditSite(null); fetchAll()
    } catch (err) {
      setUploadError(err.message||'Unable to save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this site?')) return
    await supabase.from('sites').delete().eq('id', id)
    fetchAll()
  }

  const counts = TABS.reduce((acc, t) => {
    acc[t] = t === 'All' ? sites.length : sites.filter(s => s.site_status === t.toLowerCase()).length
    return acc
  }, {})

  const filtered = sites
    .filter(s => tab==='All' || s.site_status===tab.toLowerCase())
    .filter(s => !search || s.site_name.toLowerCase().includes(search.toLowerCase()) || s.location.toLowerCase().includes(search.toLowerCase()))

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated  = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)

  const pendingReports = sites.filter(s => s.report_status === 'in_progress' || s.report_status === 'pending').length
  const approvedReports = sites.filter(s => s.report_status === 'approved').length

  const darkInput = {
    width:'100%', padding:'9px 12px', borderRadius:'10px',
    border:'1px solid rgba(255,255,255,0.1)', fontSize:'13px', outline:'none',
    background:'rgba(255,255,255,0.05)', color:'#f1f5f9', fontFamily:'inherit',
  }

  if (loading) return (
    <div className="flex items-center justify-center bg-[#06090f]" style={{ height:'calc(100vh - 54px)' }}>
      <div className="flex items-center gap-3 text-slate-400 text-sm">
        <div className="w-4 h-4 rounded-full border-2 border-blue-800 border-t-blue-500 animate-spin" />
        Loading sites…
      </div>
    </div>
  )

  return (
    <div className="bg-[#06090f]" style={{ minHeight:'calc(100vh - 54px)', overflowY:'auto' }}>

      {/* fixed bg */}
      <div className="pointer-events-none fixed inset-0" style={{
        zIndex:0,
        background:'radial-gradient(ellipse 55% 50% at 15% 20%,rgba(59,130,246,0.08) 0%,transparent 60%),radial-gradient(ellipse 40% 35% at 85% 10%,rgba(6,182,212,0.05) 0%,transparent 55%)',
      }} />
      <div className="pointer-events-none fixed inset-0" style={{
        zIndex:0,
        backgroundImage:'linear-gradient(rgba(255,255,255,0.016) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.016) 1px,transparent 1px)',
        backgroundSize:'44px 44px',
      }} />

      <div className="relative px-10" style={{ zIndex:1 }}>

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between gap-4 pt-6 pb-5">
          <div>
            <h1 className="text-[22px] font-extrabold text-slate-100 tracking-tight leading-none">Sites</h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">Manage and track all site activities</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                placeholder="Search sites…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                style={{
                  background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)',
                  borderRadius:'10px', fontSize:'13px', fontFamily:'inherit',
                  padding:'8px 14px 8px 32px', width:'210px', color:'#e2e8f0', outline:'none',
                }}
                onFocus={e => e.target.style.borderColor='rgba(59,130,246,0.5)'}
                onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.09)'}
              />
            </div>
            <button onClick={openAdd}
              className="flex items-center gap-2 text-white font-bold transition-all hover:-translate-y-px"
              style={{
                padding:'9px 18px', borderRadius:'10px', fontSize:'13px', fontFamily:'inherit', border:'none', cursor:'pointer',
                background:'linear-gradient(135deg,#2563eb,#0ea5e9)',
                boxShadow:'0 0 20px rgba(37,99,235,0.35),0 4px 14px rgba(0,0,0,0.3)',
              }}>
              <Plus size={14} /> Add Site
            </button>
          </div>
        </div>

        {/* ── STATS STRIP ── */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          {[
            { label:'Total Sites',     value:sites.length,                    color:'#f1f5f9' },
            { label:'Ongoing',         value:counts.Ongoing,                  color:'#fb923c' },
            { label:'Completed',       value:counts.Completed,                color:'#4ade80' },
            { label:'Pending Reports', value:pendingReports,                  color:'#60a5fa' },
            { label:'Approved',        value:approvedReports,                 color:'#34d399' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              padding:'14px 18px', borderRadius:'14px',
              border:'1px solid rgba(255,255,255,0.07)',
              background:'rgba(255,255,255,0.03)',
            }}>
              <p style={{ fontSize:'10px', color:'#475569', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:'600', marginBottom:'8px' }}>{label}</p>
              <p style={{ fontSize:'24px', fontWeight:'800', color, letterSpacing:'-0.02em', lineHeight:1 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── TABS ── */}
        <div className="flex items-center gap-1.5 mb-5">
          {TABS.map(t => {
            const active = tab === t
            return (
              <button key={t} onClick={() => { setTab(t); setPage(1) }}
                style={{
                  padding:'6px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:'600',
                  border:`1px solid ${active ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  background: active ? 'rgba(37,99,235,0.18)' : 'transparent',
                  color: active ? '#60a5fa' : '#475569',
                  cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
                }}>
                {t} ({counts[t]})
              </button>
            )
          })}
        </div>

        {/* ── CARDS ── */}
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl text-slate-500 mb-10"
            style={{ height:200, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.02)' }}>
            <MapPin size={28} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No sites found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5 pb-6">
            {paginated.map(site => {
              const pic       = site.site_assignments?.find(a => a.assignment_role === 'PIC')
              const crew      = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []
              const typeMeta  = TYPE_META[site.site_type] || TYPE_META.site_scanning
              const memberIdx = members.findIndex(m => m.id === pic?.team_members?.id)
              const isExpanded = expandedCard === site.id

              return (
                <div key={site.id}
                  className="rounded-2xl overflow-hidden transition-all duration-200"
                  style={{
                    border:`1px solid ${isExpanded ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    background:'rgba(10,17,32,0.9)',
                    boxShadow: isExpanded ? '0 0 0 1px rgba(59,130,246,0.15),0 8px 32px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.3)',
                  }}
                  onMouseEnter={e => {
                    if (isExpanded) return
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.borderColor = 'rgba(59,130,246,0.22)'
                    e.currentTarget.style.boxShadow = '0 20px 48px rgba(0,0,0,0.55),0 0 0 1px rgba(59,130,246,0.12)'
                  }}
                  onMouseLeave={e => {
                    if (isExpanded) return
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'
                  }}
                >
                  {/* Banner */}
                  <div className="relative overflow-hidden" style={{ height:140, background:CARD_GRADIENTS[site.site_type]||CARD_GRADIENTS.site_scanning }}>
                    {(site.site_photo_url || getSiteHeaderImage(site.site_type)) && (
                      <img src={site.site_photo_url||getSiteHeaderImage(site.site_type)} alt=""
                        className="absolute inset-0 w-full h-full object-cover" style={{ opacity:0.4 }} />
                    )}
                    <div className="absolute inset-0" style={{ background:'linear-gradient(160deg,rgba(0,0,0,0.05) 0%,rgba(5,10,22,0.82) 100%)' }} />
                    <div className="absolute inset-0 flex flex-col justify-between" style={{ padding:'12px 14px' }}>
                      {/* top: location + status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0"
                          style={{
                            background:'rgba(0,0,0,0.45)', backdropFilter:'blur(8px)',
                            border:'1px solid rgba(255,255,255,0.14)',
                            padding:'4px 10px', borderRadius:'99px',
                            fontSize:'10px', color:'rgba(255,255,255,0.82)', fontWeight:'500',
                            maxWidth:'60%',
                          }}>
                          <MapPin size={9} style={{ flexShrink:0 }} />
                          <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{site.location}</span>
                        </div>
                        <Pill status={site.site_status} colors={STATUS_COLORS} />
                      </div>
                      {/* bottom: site name */}
                      <p style={{ fontSize:'15px', fontWeight:'800', color:'white', letterSpacing:'-0.02em', textShadow:'0 2px 8px rgba(0,0,0,0.6)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {site.site_name}
                      </p>
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding:'14px 16px' }}>

                    {/* Type chip + report status */}
                    <div className="flex items-center gap-2 mb-3">
                      <span style={{ fontSize:'10px', fontWeight:'600', padding:'3px 9px', borderRadius:'6px', background:typeMeta.chipBg, color:typeMeta.color }}>
                        {typeMeta.label}
                      </span>
                      <Pill status={site.report_status} colors={REPORT_COLORS} />
                    </div>

                    {/* Info bar: date + duration */}
                    <div className="flex items-center gap-4 mb-3 pb-3" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center gap-1.5">
                        <Calendar size={11} color="#475569" />
                        <span style={{ fontSize:'11px', color:'#94a3b8', fontWeight:'500' }}>
                          {new Date(site.scheduled_date).toLocaleDateString('en-MY',{ day:'numeric', month:'short', year:'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={11} color="#475569" />
                        <span style={{ fontSize:'11px', color:'#94a3b8', fontWeight:'500' }}>{site.site_duration_days}d</span>
                      </div>
                    </div>

                    {/* PIC row */}
                    <div className="flex items-center gap-2 mb-3">
                      {pic
                        ? <Avatar name={pic.team_members?.full_name} size={26} index={memberIdx>=0?memberIdx:0} avatarUrl={pic.team_members?.avatar_url} />
                        : <div style={{ width:26, height:26, borderRadius:'50%', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', flexShrink:0 }} />
                      }
                      <span style={{ fontSize:'12px', fontWeight:'500', color:'#cbd5e1', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1, minWidth:0 }}>
                        {pic?.team_members?.full_name || '—'}
                      </span>
                      {pic && (
                        <span style={{ fontSize:'9px', fontWeight:'700', padding:'2px 7px', borderRadius:'6px', background:'rgba(59,130,246,0.14)', color:'#60a5fa', border:'1px solid rgba(59,130,246,0.22)', flexShrink:0 }}>PIC</span>
                      )}
                      {/* crew stacked */}
                      {crew.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="flex">
                            {crew.slice(0,3).map((c,ci) => (
                              <div key={ci} title={c.team_members?.full_name} style={{ marginLeft:ci>0?'-5px':0 }}>
                                <Avatar name={c.team_members?.full_name||'?'} size={20} index={ci+1} avatarUrl={c.team_members?.avatar_url} />
                              </div>
                            ))}
                            {crew.length > 3 && (
                              <div style={{ width:20,height:20,borderRadius:'50%',marginLeft:'-5px',background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(255,255,255,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'7px',fontWeight:'700',color:'#64748b' }}>
                                +{crew.length-3}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link to={`/sites/${site.id}`}
                        className="flex items-center justify-center gap-1.5 transition-all"
                        style={{ flex:1, padding:'8px 0', borderRadius:'9px', fontSize:'11px', fontWeight:'700', color:'#60a5fa', background:'rgba(37,99,235,0.1)', border:'1px solid rgba(59,130,246,0.2)', textDecoration:'none' }}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(37,99,235,0.22)'}
                        onMouseLeave={e => e.currentTarget.style.background='rgba(37,99,235,0.1)'}>
                        <ArrowUpRight size={12} /> View Details
                      </Link>
                      <button
                        onClick={() => {
                          if (isExpanded) { setExpandedCard(null); setDraftStatus(null) }
                          else { setExpandedCard(site.id); setDraftStatus({ site_status:site.site_status, report_status:site.report_status }) }
                        }}
                        className="flex items-center justify-center gap-1.5 transition-all"
                        style={{
                          flex:1, padding:'8px 0', borderRadius:'9px', fontSize:'11px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit',
                          background: isExpanded ? 'rgba(37,99,235,0.2)' : 'rgba(255,255,255,0.05)',
                          border:`1px solid ${isExpanded ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.09)'}`,
                          color: isExpanded ? '#60a5fa' : '#94a3b8',
                        }}>
                        <Pencil size={10} /> Update
                      </button>
                      <button onClick={() => openEdit(site)}
                        className="flex items-center justify-center transition-all"
                        style={{ width:33,height:33,borderRadius:'9px',cursor:'pointer',flexShrink:0,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.09)',color:'#64748b' }}
                        onMouseEnter={e => { e.currentTarget.style.color='#cbd5e1'; e.currentTarget.style.background='rgba(255,255,255,0.1)' }}
                        onMouseLeave={e => { e.currentTarget.style.color='#64748b'; e.currentTarget.style.background='rgba(255,255,255,0.05)' }}>
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => handleDelete(site.id)}
                        className="flex items-center justify-center transition-all"
                        style={{ width:33,height:33,borderRadius:'9px',cursor:'pointer',flexShrink:0,background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.15)',color:'rgba(239,68,68,0.6)' }}
                        onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.16)'; e.currentTarget.style.color='#f87171' }}
                        onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.06)'; e.currentTarget.style.color='rgba(239,68,68,0.6)' }}>
                        <Trash2 size={11} />
                      </button>
                    </div>

                    {/* Inline update panel */}
                    {isExpanded && draftStatus && (
                      <div style={{ marginTop:'12px', padding:'14px', borderRadius:'12px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
                        <p style={{ fontSize:'9px', fontWeight:'700', color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Site Status</p>
                        <div className="flex flex-wrap gap-1.5" style={{ marginBottom:'12px' }}>
                          {['upcoming','ongoing','completed','cancelled','postponed'].map(s => {
                            const c = STATUS_COLORS[s]; const active = draftStatus.site_status === s
                            return (
                              <button key={s} onClick={() => setDraftStatus(d => ({...d, site_status:s}))}
                                style={{ padding:'4px 10px', borderRadius:'99px', fontSize:'10px', fontWeight:'600', cursor:'pointer', textTransform:'capitalize', fontFamily:'inherit', border:`1px solid ${active?c.border:'rgba(255,255,255,0.08)'}`, background:active?c.bg:'transparent', color:active?c.text:'#64748b' }}>
                                {s}
                              </button>
                            )
                          })}
                        </div>
                        {(site.site_type === 'site_scanning' || site.site_type === 'site_visit') && (<>
                          <p style={{ fontSize:'9px', fontWeight:'700', color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Report Status</p>
                          <div className="flex flex-wrap gap-1.5" style={{ marginBottom:'12px' }}>
                            {['pending','in_progress','submitted','approved','not_applicable'].map(s => {
                              const c = REPORT_COLORS[s]; const active = draftStatus.report_status === s
                              const locked = s === 'approved' && !isZairul
                              return (
                                <button key={s} disabled={locked} onClick={() => !locked && setDraftStatus(d => ({...d, report_status:s}))} title={locked?'Only Zairul can approve':undefined}
                                  style={{ padding:'4px 10px', borderRadius:'99px', fontSize:'10px', fontWeight:'600', cursor:locked?'not-allowed':'pointer', textTransform:'capitalize', fontFamily:'inherit', border:`1px solid ${active?c.border:'rgba(255,255,255,0.08)'}`, background:active?c.bg:'transparent', color:active?c.text:locked?'#334155':'#64748b', opacity:locked?0.4:1 }}>
                                  {s.replace(/_/g,' ')}
                                </button>
                              )
                            })}
                          </div>
                        </>)}
                        <div className="flex gap-2" style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'10px' }}>
                          <button onClick={() => handleQuickSave(site)} disabled={!!quickSaving}
                            style={{ flex:1, padding:'8px 0', borderRadius:'10px', fontSize:'12px', fontWeight:'700', color:'white', cursor:'pointer', border:'none', fontFamily:'inherit', background:'linear-gradient(135deg,#2563eb,#0ea5e9)', opacity:quickSaving?0.6:1 }}>
                            {quickSaving === site.id ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => { setExpandedCard(null); setDraftStatus(null) }}
                            style={{ flex:1, padding:'8px 0', borderRadius:'10px', fontSize:'12px', fontWeight:'600', color:'#94a3b8', cursor:'pointer', fontFamily:'inherit', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── PAGINATION ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pb-8">
            <span style={{ fontSize:'12px', color:'#475569' }}>
              Showing {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length} sites
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                style={{ padding:'6px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:'500', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)', color:page===1?'#334155':'#94a3b8', cursor:page===1?'default':'pointer', fontFamily:'inherit' }}>‹</button>
              {Array.from({ length:totalPages }, (_,i) => i+1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  style={{ padding:'6px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:'600', background:page===p?'#2563eb':'rgba(255,255,255,0.05)', border:`1px solid ${page===p?'#2563eb':'rgba(255,255,255,0.09)'}`, color:page===p?'white':'#94a3b8', cursor:'pointer', fontFamily:'inherit' }}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                style={{ padding:'6px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:'500', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)', color:page===totalPages?'#334155':'#94a3b8', cursor:page===totalPages?'default':'pointer', fontFamily:'inherit' }}>›</button>
            </div>
          </div>
        )}

      </div>

      {/* ── MODAL ── */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)' }}
          onClick={e => e.target===e.currentTarget && setShowForm(false)}>
          <div className="w-full max-w-2xl overflow-y-auto rounded-2xl" style={{ maxHeight:'92vh', background:'rgba(10,16,30,0.96)', border:'1px solid rgba(255,255,255,0.1)', backdropFilter:'blur(24px)' }}>
            <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
              <h3 className="text-lg font-bold text-slate-100">{editSite ? 'Edit Site' : 'Add New Site'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={18} /></button>
            </div>
            <div className="px-7 py-5 flex flex-col gap-5">

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Cover Photo</label>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                  const file = e.target.files[0]; if (!file) return
                  setUploadError(null)
                  setForm(f => ({...f, site_photo:file, site_photo_preview:URL.createObjectURL(file)}))
                  e.target.value = ''
                }} />
                {form.site_photo_preview ? (
                  <div className="relative rounded-xl overflow-hidden">
                    <img src={form.site_photo_preview} alt="preview" className="w-full h-36 object-cover" />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-3 opacity-0 hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => photoInputRef.current?.click()} className="px-3 py-1.5 bg-white text-slate-900 rounded-lg text-xs font-semibold">Change</button>
                      <button type="button" onClick={() => setForm(f => ({...f, site_photo:null, site_photo_preview:null, site_photo_url:''}))} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold">Remove</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => photoInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-7 rounded-xl cursor-pointer transition-all"
                    style={{ border:'2px dashed rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor='rgba(59,130,246,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'}>
                    <Camera size={20} className="text-slate-600" />
                    <span className="text-xs text-slate-500 font-medium">Click to upload a cover photo</span>
                    <span className="text-[11px] text-slate-700">JPG, PNG, WEBP</span>
                  </button>
                )}
                {uploadError && <p className="mt-2 text-xs text-red-400 font-medium">{uploadError}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Site Type</label>
                <div className="flex gap-2">
                  {SITE_TYPES.map(({value,label}) => {
                    const active = form.site_type === value
                    const meta = TYPE_META[value]
                    return (
                      <button key={value} type="button"
                        onClick={() => setForm(f => ({...f, site_type:value, site_duration_days:value==='site_visit'?'0.5':f.site_duration_days}))}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={{ background:active?meta.chipBg:'rgba(255,255,255,0.04)', border:`1px solid ${active?meta.color+'55':'rgba(255,255,255,0.08)'}`, color:active?meta.color:'#64748b', fontFamily:'inherit', cursor:'pointer' }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Site Name *</label>
                <input style={darkInput} value={form.site_name} placeholder="e.g. Jalan Ampang Survey" onChange={e => setForm(f => ({...f, site_name:e.target.value}))} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Location *</label>
                <PlaceSearchBox value={form.location} onChange={v => setForm(f => ({...f, location:v, latitude:'', longitude:''}))} onSelect={r => setForm(f => ({...f, location:r.label, latitude:r.latitude, longitude:r.longitude}))} placeholder="Search and choose a location..." />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pin on Map <span className="text-slate-700 text-[10px] normal-case tracking-normal">(click to place)</span></label>
                  {form.latitude !== '' && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={10} className="text-blue-400" />
                      <span className="text-[11px] text-blue-400 font-medium">{Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}</span>
                      <button onClick={() => setForm(f => ({...f, latitude:'', longitude:''}))} className="text-slate-600 hover:text-slate-400"><X size={11} /></button>
                    </div>
                  )}
                </div>
                <LocationPicker lat={form.latitude} lng={form.longitude} onPick={(lat,lng) => setForm(f => ({...f, latitude:lat, longitude:lng}))} mapKey={editSite?.id||'new'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Client Company</label><input style={darkInput} value={form.client_company_name} placeholder="Company name" onChange={e => setForm(f => ({...f, client_company_name:e.target.value}))} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Client Name</label><input style={darkInput} value={form.client_name} placeholder="Contact name" onChange={e => setForm(f => ({...f, client_name:e.target.value}))} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Client Number</label><input style={darkInput} value={form.client_number} placeholder="PO-12345" onChange={e => setForm(f => ({...f, client_number:e.target.value}))} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Salesperson</label>
                  <select style={darkInput} value={form.salesperson} onChange={e => setForm(f => ({...f, salesperson:e.target.value}))}>
                    <option value="">— Select —</option>
                    {SALESPERSONS.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              </div>

              <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Scope of Work</label><textarea style={{...darkInput, resize:'none'}} rows={2} value={form.scope_of_work} placeholder="Describe scope…" onChange={e => setForm(f => ({...f, scope_of_work:e.target.value}))} /></div>
              <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Scheduled Date *</label><input type="date" style={darkInput} value={form.scheduled_date} onChange={e => setForm(f => ({...f, scheduled_date:e.target.value}))} /></div>

              {form.site_type === 'site_scanning' && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Site Duration (Days)</label><input type="number" min="0" step="0.5" style={darkInput} value={form.site_duration_days} onChange={e => setForm(f => ({...f, site_duration_days:e.target.value}))} /></div>
                  <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Report Duration (Days)</label><input type="number" min="0" step="0.5" style={darkInput} value={form.report_duration_days} onChange={e => setForm(f => ({...f, report_duration_days:e.target.value}))} /></div>
                </div>
              )}
              {form.site_type === 'site_visit' && <div className="px-4 py-3 rounded-xl text-xs font-medium text-teal-400" style={{ background:'rgba(13,148,136,0.1)', border:'1px solid rgba(13,148,136,0.25)' }}>Duration: Half Day (0.5) — fixed for site visits</div>}
              {form.site_type === 'meeting' && (
                <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Meeting Duration</label>
                  <select style={darkInput} value={form.site_duration_days} onChange={e => setForm(f => ({...f, site_duration_days:e.target.value}))}>
                    <option value="0.25">2 Hours</option><option value="0.5">Half Day</option><option value="1">Full Day</option>
                  </select>
                </div>
              )}

              <div className={`grid gap-3 ${form.site_type==='site_scanning'?'grid-cols-2':'grid-cols-1'}`}>
                <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Site Status</label>
                  <select style={darkInput} value={form.site_status} onChange={e => setForm(f => ({...f, site_status:e.target.value}))}>
                    {['upcoming','ongoing','completed','cancelled','postponed'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {form.site_type === 'site_scanning' && (
                  <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Report Status</label>
                    <select style={darkInput} value={form.report_status} onChange={e => setForm(f => ({...f, report_status:e.target.value}))}>
                      {['pending','in_progress','submitted','approved','not_applicable'].map(o => <option key={o} value={o}>{o.replace('_',' ')}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">{form.site_type==='meeting'?'Organizer':'PIC'}</label>
                <select style={darkInput} value={form.pic_id} onChange={e => setForm(f => ({...f, pic_id:e.target.value}))}>
                  <option value="">— Select —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>

              <div><label className="block text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">{form.site_type==='meeting'?'Attendees':'Crew'}</label>
                <div className="flex flex-col gap-2">
                  {members.map(m => (
                    <label key={m.id} className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" checked={form.crew_ids.includes(m.id)} onChange={() => toggleCrew(m.id)} className="w-4 h-4 rounded accent-blue-500" />
                      <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">{m.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div><label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Notes</label><textarea style={{...darkInput, resize:'none'}} rows={3} value={form.notes} placeholder="Optional notes…" onChange={e => setForm(f => ({...f, notes:e.target.value}))} /></div>

              <div className="flex gap-3 pt-1" style={{ borderTop:'1px solid rgba(255,255,255,0.07)' }}>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                  style={{ background:'linear-gradient(135deg,#2563eb,#0ea5e9)', opacity:saving?0.6:1, boxShadow:'0 0 16px rgba(59,130,246,0.3)', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                  {saving ? 'Saving…' : editSite ? 'Save Changes' : 'Add Site'}
                </button>
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 transition-all"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', fontFamily:'inherit' }}>
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
