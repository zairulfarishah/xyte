import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'
import { supabase } from '../supabase'
import { Plus, Pencil, Trash2, Search, ArrowUpRight, MapPin, Users, Activity, X, Camera, SlidersHorizontal } from 'lucide-react'
import { notify } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import PlaceSearchBox from '../components/PlaceSearchBox'
import { getSiteHeaderImage } from '../utils/siteHeader'
import 'leaflet/dist/leaflet.css'

// ── colour tokens (dark mode) ──────────────────────────────────────
const STATUS_COLORS = {
  upcoming:  { bg: 'rgba(234,179,8,.15)',   text: '#fbbf24', border: 'rgba(234,179,8,.35)'   },
  ongoing:   { bg: 'rgba(249,115,22,.15)',  text: '#fb923c', border: 'rgba(249,115,22,.35)'  },
  completed: { bg: 'rgba(34,197,94,.15)',   text: '#4ade80', border: 'rgba(34,197,94,.35)'   },
  cancelled: { bg: 'rgba(239,68,68,.15)',   text: '#f87171', border: 'rgba(239,68,68,.35)'   },
  postponed: { bg: 'rgba(148,163,184,.12)', text: '#94a3b8', border: 'rgba(148,163,184,.25)' },
}

const REPORT_COLORS = {
  pending:        { bg: 'rgba(148,163,184,.1)',  text: '#94a3b8', border: 'rgba(148,163,184,.2)'  },
  in_progress:    { bg: 'rgba(59,130,246,.13)',  text: '#60a5fa', border: 'rgba(59,130,246,.3)'   },
  submitted:      { bg: 'rgba(167,139,250,.13)', text: '#a78bfa', border: 'rgba(167,139,250,.3)'  },
  approved:       { bg: 'rgba(52,211,153,.13)',  text: '#34d399', border: 'rgba(52,211,153,.3)'   },
  not_applicable: { bg: 'rgba(148,163,184,.08)', text: '#64748b', border: 'rgba(148,163,184,.15)' },
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
  site_scanning: { label: 'Site Scanning', dot: '#3b82f6' },
  site_visit:    { label: 'Site Visit',    dot: '#0d9488' },
  meeting:       { label: 'Meeting',       dot: '#7c3aed' },
}

const SITE_TYPES  = [
  { value: 'site_scanning', label: 'Site Scanning' },
  { value: 'site_visit',    label: 'Site Visit'     },
  { value: 'meeting',       label: 'Meeting'        },
]
const SALESPERSONS = ['GH Tan','Chong Jie Yan','Jasmin','Darren','Wendy','Zairul']
const TABS = ['All','Upcoming','Ongoing','Completed','Cancelled','Postponed']

const EMPTY = {
  site_type:'site_scanning', site_name:'', location:'', latitude:'', longitude:'',
  client_company_name:'', client_name:'', client_number:'', scope_of_work:'',
  salesperson:'', scheduled_date:'', site_status:'upcoming', report_status:'pending',
  site_duration_days:'1', report_duration_days:'0.5', notes:'', pic_id:'', crew_ids:[],
  site_photo:null, site_photo_preview:null, site_photo_url:'',
}

// ── helpers ────────────────────────────────────────────────────────
function Avatar({ name, size = 28, index = 0, avatarUrl = null }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() || '?'
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0, overflow:'hidden',
      background: avatarUrl ? '#0f172a' : AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length],
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'white', fontWeight:'700', fontSize:size*.36,
      border:'2px solid rgba(255,255,255,0.08)',
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        : initials}
    </div>
  )
}

function Pill({ status, colors, small = false }) {
  const c = colors[status] || colors[Object.keys(colors)[0]]
  return (
    <span style={{
      background:c.bg, color:c.text, border:`1px solid ${c.border}`,
      padding: small ? '2px 8px' : '3px 10px',
      borderRadius:'99px', fontSize: small ? '10px' : '11px',
      fontWeight:'600', textTransform:'capitalize', whiteSpace:'nowrap',
      letterSpacing:'0.01em',
    }}>{status?.replace(/_/g,' ')}</span>
  )
}

async function uploadSitePhoto(file) {
  const ext  = file.name.split('.').pop()
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

// ── main component ─────────────────────────────────────────────────
export default function Sites() {
  const { fullName, isZairul } = useAuth()
  const [sites, setSites]           = useState([])
  const [members, setMembers]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('All')
  const [search, setSearch]         = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editSite, setEditSite]     = useState(null)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [page, setPage]             = useState(1)
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
      const origA = editSite?.site_assignments||[]
      const origPic = origA.find(a => a.assignment_role==='PIC')?.team_members?.id||''
      const origCrew = origA.filter(a => a.assignment_role==='crew').map(a => a.team_members?.id).filter(Boolean).sort()
      const nextCrew = [...form.crew_ids].sort()
      const changed = !editSite || origPic!==form.pic_id || origCrew.length!==nextCrew.length || origCrew.some((id,i) => id!==nextCrew[i])
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

  // ── shared input style for form ──
  const darkInput = {
    width:'100%', padding:'9px 12px', borderRadius:'10px',
    border:'1px solid rgba(255,255,255,0.1)', fontSize:'13px', outline:'none',
    background:'rgba(255,255,255,0.05)', color:'#f1f5f9', fontFamily:'inherit',
  }

  if (loading) return (
    <div className="flex items-center justify-center h-[calc(100vh-54px)] bg-[#060b14]">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 rounded-full border-2 border-blue-800 border-t-blue-500 animate-spin" />
        Loading sites...
      </div>
    </div>
  )

  return (
    <div className="relative bg-[#060b14] overflow-hidden" style={{ height:'calc(100vh - 54px)' }}>

      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0" style={{
        background:'radial-gradient(ellipse 60% 50% at 20% 15%, rgba(59,130,246,0.1) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 80% 5%, rgba(6,182,212,0.07) 0%, transparent 55%), radial-gradient(ellipse 40% 30% at 65% 85%, rgba(99,102,241,0.06) 0%, transparent 50%)',
      }} />
      <div className="pointer-events-none absolute inset-0" style={{
        backgroundImage:'linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)',
        backgroundSize:'40px 40px',
      }} />

      {/* Content wrapper */}
      <div className="relative z-10 flex flex-col h-full">

        {/* ── HEADER ── */}
        <div className="flex-shrink-0 px-7 pt-5 pb-0">
          <div className="flex items-start justify-between gap-4">

            {/* Left */}
            <div>
              <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">Sites</h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {[
                  { label:`${counts.All} total`,     color:'rgba(148,163,184,0.12)', text:'#94a3b8', dot:null },
                  { label:`${counts.Upcoming} upcoming`, color:'rgba(234,179,8,0.12)', text:'#fbbf24', dot:'#f59e0b' },
                  { label:`${counts.Ongoing} ongoing`,   color:'rgba(249,115,22,0.12)', text:'#fb923c', dot:'#f97316' },
                  { label:`${counts.Completed} done`,    color:'rgba(34,197,94,0.12)',  text:'#4ade80', dot:'#22c55e' },
                ].map(({ label, color, text, dot }) => (
                  <span key={label} style={{ background:color, color:text, border:`1px solid ${color}` }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold">
                    {dot && <span style={{ background:dot }} className="w-1.5 h-1.5 rounded-full flex-shrink-0" />}
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  placeholder="Search sites..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1) }}
                  className="bg-white/5 border border-white/10 rounded-xl text-slate-200 placeholder-slate-500 text-[13px] outline-none pl-8 pr-4 py-2 w-52 focus:border-blue-500/50 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all"
                />
              </div>
              {/* Filter btn */}
              <button className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-all">
                <SlidersHorizontal size={14} />
              </button>
              {/* Add site */}
              <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-[13px] font-semibold transition-all hover:-translate-y-px"
                style={{ background:'linear-gradient(135deg,#2563eb,#0891b2)', boxShadow:'0 0 20px rgba(59,130,246,0.35),0 4px 12px rgba(0,0,0,0.3)' }}>
                <Plus size={13} /> Add Site
              </button>
            </div>
          </div>
        </div>

        {/* ── FILTER TABS ── */}
        <div className="flex-shrink-0 px-7 pt-3 pb-2.5">
          <div className="flex items-center gap-2">
            {TABS.map(t => {
              const active = tab === t
              return (
                <button key={t} onClick={() => { setTab(t); setPage(1) }}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all border"
                  style={{
                    background: active ? 'linear-gradient(135deg,rgba(37,99,235,0.25),rgba(8,145,178,0.2))' : 'transparent',
                    borderColor: active ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)',
                    color: active ? '#60a5fa' : '#64748b',
                    boxShadow: active ? '0 0 14px rgba(59,130,246,0.2)' : 'none',
                  }}>
                  {t}
                  <span className="px-1.5 py-px rounded-full text-[10px] font-bold"
                    style={{
                      background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                      color: active ? '#93c5fd' : '#475569',
                    }}>
                    {counts[t]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── CARDS GRID ── */}
        <div className="flex-1 overflow-y-auto px-7 pb-5 min-h-0" style={{ scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,0.1) transparent' }}>

          {paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 rounded-2xl border border-white/8 bg-white/3 text-slate-500">
              <MapPin size={28} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No sites found</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {paginated.map(site => {
                const pic      = site.site_assignments?.find(a => a.assignment_role==='PIC')
                const crew     = site.site_assignments?.filter(a => a.assignment_role==='crew')||[]
                const typeMeta = TYPE_META[site.site_type] || TYPE_META.site_scanning
                const memberIdx = members.findIndex(m => m.id===pic?.team_members?.id)
                const isExpanded = expandedCard === site.id

                return (
                  <div key={site.id}
                    className="group rounded-2xl border overflow-hidden transition-all duration-200 cursor-pointer"
                    style={{
                      background:'rgba(15,23,42,0.6)',
                      backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
                      borderColor: isExpanded ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)',
                      boxShadow: isExpanded ? '0 0 0 1px rgba(59,130,246,0.2),0 8px 32px rgba(0,0,0,0.4)' : 'none',
                    }}
                    onMouseEnter={e => {
                      if (!isExpanded) {
                        e.currentTarget.style.transform = 'translateY(-3px)'
                        e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.5),0 0 0 1px rgba(59,130,246,0.18),0 0 28px rgba(59,130,246,0.07)'
                        e.currentTarget.style.borderColor = 'rgba(59,130,246,0.25)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isExpanded) {
                        e.currentTarget.style.transform = 'none'
                        e.currentTarget.style.boxShadow = 'none'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                      }
                    }}
                  >
                    {/* Banner */}
                    <div className="relative h-[108px] overflow-hidden" style={{ background:CARD_GRADIENTS[site.site_type]||CARD_GRADIENTS.site_scanning }}>
                      {(site.site_photo_url || getSiteHeaderImage(site.site_type)) && (
                        <img src={site.site_photo_url||getSiteHeaderImage(site.site_type)} alt=""
                          className="absolute inset-0 w-full h-full object-cover opacity-40" />
                      )}
                      <div className="absolute inset-0" style={{ background:'linear-gradient(to bottom,rgba(0,0,0,0.05) 0%,rgba(0,0,0,0.55) 100%)' }} />
                      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-3 z-10">
                        <span className="flex items-center gap-1.5 text-[10px] text-white/80 font-medium px-2.5 py-1 rounded-full min-w-0"
                          style={{ background:'rgba(0,0,0,0.35)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.12)', maxWidth:'60%' }}>
                          <MapPin size={8} className="flex-shrink-0" />
                          <span className="truncate">{site.location}</span>
                        </span>
                        <Pill status={site.site_status} colors={STATUS_COLORS} small />
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-4">

                      {/* Name + type */}
                      <h3 className="text-[14px] font-bold text-slate-100 leading-snug mb-1.5">{site.site_name}</h3>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-4">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:typeMeta.dot }} />
                        {typeMeta.label}
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 rounded-xl overflow-hidden mb-4" style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
                        <div className="px-3 py-3" style={{ borderRight:'1px solid rgba(255,255,255,0.07)' }}>
                          <p className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold mb-1">Scheduled</p>
                          <p className="text-[12px] font-semibold text-slate-200">
                            {new Date(site.scheduled_date).toLocaleDateString('en-MY',{day:'numeric',month:'short',year:'numeric'})}
                          </p>
                        </div>
                        <div className="px-3 py-3">
                          <p className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold mb-1">Duration</p>
                          <p className="text-[12px] font-semibold text-slate-200">{site.site_duration_days}d</p>
                        </div>
                      </div>

                      {/* PIC + report status */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {pic
                            ? <Avatar name={pic.team_members?.full_name} size={26} index={memberIdx>=0?memberIdx:0} avatarUrl={pic.team_members?.avatar_url} />
                            : <div className="w-[26px] h-[26px] rounded-full" style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)' }} />
                          }
                          <span className="text-[12px] text-slate-300 font-semibold">{pic?.team_members?.full_name||'—'}</span>
                          {pic && <span className="text-[9px] font-bold px-1.5 py-px rounded-full" style={{ background:'rgba(59,130,246,0.15)', color:'#60a5fa', border:'1px solid rgba(59,130,246,0.25)' }}>PIC</span>}
                        </div>
                        <Pill status={site.report_status} colors={REPORT_COLORS} small />
                      </div>

                      {/* Crew row */}
                      {crew.length > 0 && (
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex">
                            {crew.slice(0,4).map((c,ci) => (
                              <div key={ci} title={c.team_members?.full_name} style={{ marginLeft:ci>0?'-7px':0 }}>
                                <Avatar name={c.team_members?.full_name||'?'} size={24} index={ci+1} avatarUrl={c.team_members?.avatar_url} />
                              </div>
                            ))}
                            {crew.length > 4 && (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-slate-400" style={{ marginLeft:'-7px', background:'rgba(255,255,255,0.08)', border:'2px solid rgba(255,255,255,0.08)' }}>
                                +{crew.length-4}
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-600">{crew.length} crew</span>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-3" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                        <Link to={`/sites/${site.id}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold text-blue-400 transition-all hover:text-blue-300"
                          style={{ background:'rgba(37,99,235,0.12)', border:'1px solid rgba(59,130,246,0.2)' }}
                          onMouseEnter={e => { e.currentTarget.style.background='rgba(37,99,235,0.22)'; e.currentTarget.style.boxShadow='0 0 12px rgba(59,130,246,0.15)' }}
                          onMouseLeave={e => { e.currentTarget.style.background='rgba(37,99,235,0.12)'; e.currentTarget.style.boxShadow='none' }}>
                          <ArrowUpRight size={12} /> View Details
                        </Link>
                        <button
                          onClick={() => {
                            if (isExpanded) { setExpandedCard(null); setDraftStatus(null) }
                            else { setExpandedCard(site.id); setDraftStatus({ site_status:site.site_status, report_status:site.report_status }) }
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-all"
                          style={{
                            background: isExpanded ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${isExpanded ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            color: isExpanded ? '#60a5fa' : '#94a3b8',
                          }}>
                          <Pencil size={11} /> Update
                        </button>
                        <button onClick={() => openEdit(site)}
                          className="w-[34px] flex items-center justify-center rounded-xl transition-all text-slate-500 hover:text-slate-300"
                          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDelete(site.id)}
                          className="w-[34px] flex items-center justify-center rounded-xl transition-all"
                          style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)', color:'rgba(239,68,68,0.6)' }}
                          onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.35)'; e.currentTarget.style.color='#f87171' }}
                          onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.06)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.15)'; e.currentTarget.style.color='rgba(239,68,68,0.6)' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* ── Inline update panel ── */}
                      {isExpanded && draftStatus && (
                        <div className="mt-3 p-3 rounded-xl" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>

                          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Site Status</p>
                          <div className="flex gap-1.5 flex-wrap mb-3">
                            {['upcoming','ongoing','completed','cancelled','postponed'].map(s => {
                              const c = STATUS_COLORS[s]; const active = draftStatus.site_status===s
                              return (
                                <button key={s} onClick={() => setDraftStatus(d => ({...d, site_status:s}))}
                                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold cursor-pointer transition-all capitalize"
                                  style={{ border:`1px solid ${active?c.border:'rgba(255,255,255,0.08)'}`, background:active?c.bg:'transparent', color:active?c.text:'#64748b' }}>
                                  {s}
                                </button>
                              )
                            })}
                          </div>

                          {(site.site_type==='site_scanning'||site.site_type==='site_visit') && (<>
                            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Report Status</p>
                            <div className="flex gap-1.5 flex-wrap mb-3">
                              {['pending','in_progress','submitted','approved','not_applicable'].map(s => {
                                const c = REPORT_COLORS[s]; const active = draftStatus.report_status===s
                                const locked = s==='approved' && !isZairul
                                return (
                                  <button key={s} disabled={locked} onClick={() => !locked && setDraftStatus(d => ({...d, report_status:s}))}
                                    title={locked?'Only Zairul can approve':undefined}
                                    className="px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all capitalize"
                                    style={{
                                      border:`1px solid ${active?c.border:'rgba(255,255,255,0.08)'}`,
                                      background:active?c.bg:'transparent',
                                      color:active?c.text:locked?'#334155':'#64748b',
                                      opacity:locked?0.4:1, cursor:locked?'not-allowed':'pointer',
                                    }}>
                                    {s.replace(/_/g,' ')}
                                  </button>
                                )
                              })}
                            </div>
                          </>)}

                          <div className="flex gap-2 pt-2" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                            <button onClick={() => handleQuickSave(site)} disabled={!!quickSaving}
                              className="flex-1 py-1.5 rounded-xl text-[11px] font-semibold text-white transition-all"
                              style={{ background:'linear-gradient(135deg,#2563eb,#0891b2)', opacity:quickSaving?0.6:1 }}>
                              {quickSaving===site.id ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => { setExpandedCard(null); setDraftStatus(null) }}
                              className="flex-1 py-1.5 rounded-xl text-[11px] font-semibold text-slate-400 transition-all hover:text-slate-300"
                              style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-slate-600">
                Showing {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1.5">
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:page===1?'#334155':'#94a3b8' }}>
                  Prev
                </button>
                {Array.from({length:totalPages},(_,i) => i+1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background:page===p?'#2563eb':'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:page===p?'white':'#94a3b8' }}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:page===totalPages?'#334155':'#94a3b8' }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL ── */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background:'rgba(0,0,0,0.7)', backdropFilter:'blur(6px)' }}
          onClick={e => e.target===e.currentTarget && setShowForm(false)}>
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl"
            style={{ background:'rgba(10,16,30,0.95)', border:'1px solid rgba(255,255,255,0.1)', backdropFilter:'blur(24px)' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
              <h3 className="text-lg font-bold text-slate-100">{editSite ? 'Edit Site' : 'Add New Site'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="px-7 py-5 flex flex-col gap-5">

              {/* Photo upload */}
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

              {/* Site type */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Site Type</label>
                <div className="flex gap-2">
                  {SITE_TYPES.map(({value,label}) => {
                    const active = form.site_type===value
                    const dot = TYPE_META[value]?.dot||'#3b82f6'
                    return (
                      <button key={value} type="button" onClick={() => setForm(f => ({...f, site_type:value, site_duration_days:value==='site_visit'?'0.5':f.site_duration_days}))}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={{
                          background:active?`rgba(${dot==='#3b82f6'?'59,130,246':dot==='#0d9488'?'13,148,136':'124,58,237'},.15)`:'rgba(255,255,255,0.04)',
                          border:`1px solid ${active?dot+'66':'rgba(255,255,255,0.08)'}`,
                          color:active?dot:'#64748b',
                        }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Site name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Site Name *</label>
                <input style={darkInput} value={form.site_name} placeholder="e.g. Jalan Ampang Survey" onChange={e => setForm(f => ({...f, site_name:e.target.value}))} />
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Location *</label>
                <PlaceSearchBox
                  value={form.location}
                  onChange={v => setForm(f => ({...f, location:v, latitude:'', longitude:''}))}
                  onSelect={r => setForm(f => ({...f, location:r.label, latitude:r.latitude, longitude:r.longitude}))}
                  placeholder="Search and choose a location..."
                />
              </div>

              {/* Map picker */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Pin on Map <span className="text-slate-700 text-[10px] normal-case tracking-normal">(click to place)</span>
                  </label>
                  {form.latitude!=='' && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={10} className="text-blue-400" />
                      <span className="text-[11px] text-blue-400 font-medium">{Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}</span>
                      <button onClick={() => setForm(f => ({...f, latitude:'', longitude:''}))} className="text-slate-600 hover:text-slate-400">
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>
                <LocationPicker lat={form.latitude} lng={form.longitude} onPick={(lat,lng) => setForm(f => ({...f, latitude:lat, longitude:lng}))} mapKey={editSite?.id||'new'} />
              </div>

              {/* Client fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Client Company</label>
                  <input style={darkInput} value={form.client_company_name} placeholder="Company name" onChange={e => setForm(f => ({...f, client_company_name:e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Client Name</label>
                  <input style={darkInput} value={form.client_name} placeholder="Contact name" onChange={e => setForm(f => ({...f, client_name:e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Client Number</label>
                  <input style={darkInput} value={form.client_number} placeholder="PO-12345" onChange={e => setForm(f => ({...f, client_number:e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Salesperson</label>
                  <select style={darkInput} value={form.salesperson} onChange={e => setForm(f => ({...f, salesperson:e.target.value}))}>
                    <option value="">— Select —</option>
                    {SALESPERSONS.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Scope of Work</label>
                <textarea style={{...darkInput, resize:'none'}} rows={2} value={form.scope_of_work} placeholder="Describe scope…" onChange={e => setForm(f => ({...f, scope_of_work:e.target.value}))} />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Scheduled Date *</label>
                <input type="date" style={darkInput} value={form.scheduled_date} onChange={e => setForm(f => ({...f, scheduled_date:e.target.value}))} />
              </div>

              {/* Duration */}
              {form.site_type==='site_scanning' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Site Duration (Days)</label>
                    <input type="number" min="0" step="0.5" style={darkInput} value={form.site_duration_days} onChange={e => setForm(f => ({...f, site_duration_days:e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Report Duration (Days)</label>
                    <input type="number" min="0" step="0.5" style={darkInput} value={form.report_duration_days} onChange={e => setForm(f => ({...f, report_duration_days:e.target.value}))} />
                  </div>
                </div>
              )}
              {form.site_type==='site_visit' && (
                <div className="px-4 py-3 rounded-xl text-xs font-medium text-teal-400" style={{ background:'rgba(13,148,136,0.1)', border:'1px solid rgba(13,148,136,0.25)' }}>
                  Duration: Half Day (0.5) — fixed for site visits
                </div>
              )}
              {form.site_type==='meeting' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Meeting Duration</label>
                  <select style={darkInput} value={form.site_duration_days} onChange={e => setForm(f => ({...f, site_duration_days:e.target.value}))}>
                    <option value="0.25">2 Hours</option>
                    <option value="0.5">Half Day</option>
                    <option value="1">Full Day</option>
                  </select>
                </div>
              )}

              {/* Status selects */}
              <div className={`grid gap-3 ${form.site_type==='site_scanning'?'grid-cols-2':'grid-cols-1'}`}>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Site Status</label>
                  <select style={darkInput} value={form.site_status} onChange={e => setForm(f => ({...f, site_status:e.target.value}))}>
                    {['upcoming','ongoing','completed','cancelled','postponed'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {form.site_type==='site_scanning' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Report Status</label>
                    <select style={darkInput} value={form.report_status} onChange={e => setForm(f => ({...f, report_status:e.target.value}))}>
                      {['pending','in_progress','submitted','approved','not_applicable'].map(o => <option key={o} value={o}>{o.replace('_',' ')}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* PIC */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">{form.site_type==='meeting'?'Organizer':'PIC'}</label>
                <select style={darkInput} value={form.pic_id} onChange={e => setForm(f => ({...f, pic_id:e.target.value}))}>
                  <option value="">— Select —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>

              {/* Crew */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">{form.site_type==='meeting'?'Attendees':'Crew'}</label>
                <div className="flex flex-col gap-2">
                  {members.map(m => (
                    <label key={m.id} className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" checked={form.crew_ids.includes(m.id)} onChange={() => toggleCrew(m.id)}
                        className="w-4 h-4 rounded accent-blue-500" />
                      <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">{m.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Notes</label>
                <textarea style={{...darkInput, resize:'none'}} rows={3} value={form.notes} placeholder="Optional notes…" onChange={e => setForm(f => ({...f, notes:e.target.value}))} />
              </div>

              {/* Modal actions */}
              <div className="flex gap-3 pt-1" style={{ borderTop:'1px solid rgba(255,255,255,0.07)' }}>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background:'linear-gradient(135deg,#2563eb,#0891b2)', opacity:saving?0.6:1, boxShadow:'0 0 16px rgba(59,130,246,0.3)' }}>
                  {saving ? 'Saving…' : editSite ? 'Save Changes' : 'Add Site'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 transition-all"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}>
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
