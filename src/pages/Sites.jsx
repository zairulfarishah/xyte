import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'
import { supabase } from '../supabase'
import {
  Pencil, Trash2, Search, ArrowUpRight, MapPin, X, Camera,
  Calendar, Clock, CheckCircle,
} from 'lucide-react'
import { notify, notifyMany } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import PlaceSearchBox from '../components/PlaceSearchBox'
import { getSiteHeaderImage } from '../utils/siteHeader'
import { mergeCompletionMeta, parseCompletionMeta, validateCompletionRequirement } from '../utils/completionMeta'
import 'leaflet/dist/leaflet.css'

/* ── Design tokens (Dashboard light-mode parity) ── */
const STATUS_COLORS = {
  upcoming:  { bg:'#fef3c7', text:'#92400e', border:'#facc15' },
  ongoing:   { bg:'#ffedd5', text:'#9a3412', border:'#fb923c' },
  completed: { bg:'#dcfce7', text:'#166534', border:'#4ade80' },
  cancelled: { bg:'#fee2e2', text:'#991b1b', border:'#f87171' },
  postponed: { bg:'#f1f5f9', text:'#475569', border:'#cbd5e1' },
}
const REPORT_COLORS = {
  pending:        { bg:'#fee2e2', text:'#991b1b', border:'#fecaca'  },
  in_progress:    { bg:'#fef3c7', text:'#92400e', border:'#fde68a'  },
  submitted:      { bg:'#dbeafe', text:'#1d4ed8', border:'#bfdbfe'  },
  approved:       { bg:'#dcfce7', text:'#166534', border:'#bbf7d0'  },
  not_applicable: { bg:'#f1f5f9', text:'#475569', border:'#cbd5e1'  },
}
const TYPE_META = {
  site_scanning: { label:'Site Scanning', color:'#1d4ed8', chipBg:'#eff6ff', chipBorder:'#93c5fd' },
  site_visit:    { label:'Site Visit',    color:'#166534', chipBg:'#f0fdf4', chipBorder:'#4ade80'  },
  meeting:       { label:'Meeting',       color:'#6d28d9', chipBg:'#faf5ff', chipBorder:'#c4b5fd'  },
}
const CARD_GRADIENTS = {
  site_scanning: 'linear-gradient(135deg,#0f2460 0%,#1a4b8c 55%,#0891b2 100%)',
  site_visit:    'linear-gradient(135deg,#042f2e 0%,#065f46 55%,#0d9488 100%)',
  meeting:       'linear-gradient(135deg,#1e0a3c 0%,#4c1d95 55%,#7c3aed 100%)',
}
const CARD_GLOW = {
  site_scanning: 'rgba(37,99,235,.18)',
  site_visit:    'rgba(13,148,136,.15)',
  meeting:       'rgba(124,58,237,.15)',
}
const SITE_PROGRESS = {
  upcoming:  { pct:15,  color:'#f59e0b' },
  ongoing:   { pct:55,  color:'#2563eb' },
  completed: { pct:100, color:'#16a34a' },
  cancelled: { pct:0,   color:'#ef4444' },
  postponed: { pct:25,  color:'#94a3b8' },
}
const REPORT_PROGRESS = {
  pending:        { pct:10,  color:'#ef4444' },
  in_progress:    { pct:40,  color:'#f59e0b' },
  submitted:      { pct:75,  color:'#7c3aed' },
  approved:       { pct:100, color:'#16a34a' },
  not_applicable: { pct:0,   color:'#cbd5e1' },
}
const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626']
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
  delivery_order_number:'', completion_reason:'',
  site_photo:null, site_photo_preview:null, site_photo_url:'',
}

function Avatar({ name, size = 28, index = 0, avatarUrl = null }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() || '?'
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0, overflow:'hidden',
      background: avatarUrl ? '#e2e8f0' : AVATAR_COLORS[index % AVATAR_COLORS.length],
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'white', fontWeight:'700', fontSize:size * 0.35,
      boxShadow:'0 2px 6px rgba(15,23,42,.18)',
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
      padding:'4px 9px', borderRadius:'999px', fontSize:'10px',
      fontWeight:'800', textTransform:'capitalize', whiteSpace:'nowrap', flexShrink:0,
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
  const [panelAnchor, setPanelAnchor]   = useState(null)
  const photoInputRef = useRef(null)
  const PER_PAGE = 8

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
      .order('scheduled_date', { ascending:false })
    const { data:m } = await supabase.from('team_members').select('*').order('full_name')
    setSites(s || [])
    setMembers(m || [])
    setLoading(false)
  }

  async function handleQuickSave(site) {
    if (!draftStatus) return
    const completionError = validateCompletionRequirement(
      draftStatus.site_status,
      draftStatus.delivery_order_number,
      draftStatus.completion_reason
    )
    if (completionError) {
      alert(completionError)
      return
    }

    const mergedNotes = mergeCompletionMeta(site.notes || '', {
      deliveryOrderNumber: draftStatus.delivery_order_number,
      completionReason: draftStatus.completion_reason,
    })

    const updates = {}
    if (draftStatus.site_status   !== site.site_status)   updates.site_status   = draftStatus.site_status
    if (draftStatus.report_status !== site.report_status) updates.report_status = draftStatus.report_status
    if (mergedNotes !== (site.notes || '')) updates.notes = mergedNotes
    if (Object.keys(updates).length > 0) {
      setQuickSaving(site.id)
      const { error } = await supabase.from('sites').update(updates).eq('id', site.id)
      if (error) { setQuickSaving(null); return }
      setSites(prev => prev.map(s => s.id === site.id ? { ...s, ...updates } : s))

      // Collect all member IDs involved in this site
      const involvedIds = (site.site_assignments || [])
        .map(a => a.team_members?.id).filter(Boolean)

      if (updates.site_status) {
        await notifyMany(
          `Site "${site.site_name}" status changed to ${updates.site_status}`,
          fullName, involvedIds
        )
      }
      if (updates.report_status) {
        const msg = updates.report_status === 'approved'
          ? `Report for "${site.site_name}" has been approved by Zairul`
          : updates.report_status === 'submitted'
          ? `Report for "${site.site_name}" has been submitted — awaiting review`
          : `Report for "${site.site_name}" status changed to ${updates.report_status.replace(/_/g, ' ')}`
        await notifyMany(msg, fullName, involvedIds)
      }
      setQuickSaving(null)
    }
    setExpandedCard(null); setDraftStatus(null); setPanelAnchor(null)
  }

  function openAdd() { setForm(EMPTY); setEditSite(null); setShowForm(true) }
  function openEdit(site) {
    const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
    const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew')
    const completionMeta = parseCompletionMeta(site.notes || '')
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
      report_status:site.report_status, notes:completionMeta.baseNotes,
      pic_id:pic?.team_members?.id||'',
      crew_ids:crew?.map(c => c.team_members?.id)||[],
      delivery_order_number: completionMeta.deliveryOrderNumber,
      completion_reason: completionMeta.completionReason,
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
      const completionError = validateCompletionRequirement(
        form.site_status,
        form.delivery_order_number,
        form.completion_reason
      )
      if (completionError) throw new Error(completionError)
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
        notes: mergeCompletionMeta(form.notes, {
          deliveryOrderNumber: form.delivery_order_number,
          completionReason: form.completion_reason,
        }),
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

        // Notify PIC
        if (form.pic_id) {
          await notify(
            `You have been assigned as PIC for "${form.site_name}" on ${new Date(form.scheduled_date).toLocaleDateString('en-MY',{day:'numeric',month:'short',year:'numeric'})}`,
            fullName, form.pic_id
          )
        }
        // Notify crew
        const crewOnly = form.crew_ids.filter(id => id !== form.pic_id)
        if (crewOnly.length > 0) {
          await notifyMany(
            `You have been assigned as crew for "${form.site_name}" on ${new Date(form.scheduled_date).toLocaleDateString('en-MY',{day:'numeric',month:'short',year:'numeric'})}`,
            fullName, crewOnly
          )
        }
      }
      await notify(`${editSite?'Updated':'Added'} site: ${form.site_name}`, fullName)
      window.dispatchEvent(new CustomEvent('xyte:site-saved'))
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


  const lightInput = {
    width:'100%', padding:'8px 12px', borderRadius:'8px',
    border:'1px solid #e2e8f0', fontSize:'13px', outline:'none',
    background:'white', color:'#0f172a', fontFamily:'inherit', boxSizing:'border-box',
  }
  const lLabel = { display:'block', fontSize:'12px', fontWeight:'500', color:'#64748b', marginBottom:'6px' }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'calc(100vh - 54px)', background:'#eef3f8' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', color:'#64748b', fontSize:'14px', fontWeight:'600' }}>
        <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
        Loading sites…
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'calc(100vh - 54px)', overflowY:'auto', background:'radial-gradient(circle at 18% 5%,rgba(59,130,246,.18),transparent 26%),radial-gradient(circle at 70% 0%,rgba(14,165,233,.10),transparent 30%),linear-gradient(180deg,#071226 0 88px,#dde4ed 88px 100%)' }}>

      <main style={{ maxWidth:'1800px', margin:'0 auto', padding:'18px 40px 48px' }}>

        {/* ── HEADER ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', marginBottom:'14px' }}>
          <div style={{ color:'white' }}>
            <h1 style={{ margin:0, fontSize:'28px', fontWeight:'850', letterSpacing:'-.05em', lineHeight:1 }}>Sites</h1>
            <p style={{ margin:'7px 0 0', color:'#b8c7dd', fontSize:'14px', lineHeight:1.5 }}>Manage and track all site activities</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ position:'relative' }}>
              <Search size={13} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
              <input
                placeholder="Search sites…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                style={{
                  background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.18)',
                  borderRadius:'10px', fontSize:'13px', fontFamily:'inherit',
                  padding:'9px 14px 9px 34px', width:'220px', color:'white', outline:'none',
                }}
                onFocus={e => { e.target.style.background='rgba(255,255,255,.18)'; e.target.style.borderColor='rgba(255,255,255,.35)' }}
                onBlur={e => { e.target.style.background='rgba(255,255,255,.12)'; e.target.style.borderColor='rgba(255,255,255,.18)' }}
              />
            </div>
          </div>
        </div>


        {/* ── FILTER TABS ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px', marginTop:'28px' }}>
          <div style={{ display:'inline-flex', gap:'4px', padding:'5px', background:'rgba(255,255,255,.9)', backdropFilter:'blur(12px)', borderRadius:'999px', boxShadow:'0 1px 4px rgba(15,23,42,.08)', border:'1px solid rgba(226,232,240,.9)' }}>
            {TABS.map(t => {
              const active = tab === t
              return (
                <button key={t} onClick={() => { setTab(t); setPage(1) }}
                  style={{
                    border:0, background: active ? '#0f172a' : 'transparent',
                    color: active ? 'white' : '#64748b',
                    padding:'7px 14px', borderRadius:'999px', fontWeight:'750',
                    cursor:'pointer', fontSize:'12px', fontFamily:'inherit', transition:'all .15s',
                  }}>
                  {t} <span style={{ opacity:0.65, fontSize:'10px', marginLeft:'1px' }}>({counts[t]})</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── CARDS ── */}
        {paginated.length === 0 ? (
          <div style={{ height:200, border:'1px solid rgba(226,232,240,.9)', background:'white', borderRadius:'16px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#94a3b8', boxShadow:'0 1px 4px rgba(15,23,42,.06)' }}>
            <MapPin size={28} style={{ marginBottom:'12px', opacity:0.35 }} />
            <p style={{ margin:0, fontSize:'14px', fontWeight:'600', color:'#64748b' }}>No sites found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" style={{ gap:'16px', paddingBottom:'8px' }}>
            {paginated.map(site => {
              const pic       = site.site_assignments?.find(a => a.assignment_role === 'PIC')
              const crew      = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []
              const typeMeta  = TYPE_META[site.site_type] || TYPE_META.site_scanning
              const memberIdx = members.findIndex(m => m.id === pic?.team_members?.id)
              const isExpanded = expandedCard === site.id
              const glow = CARD_GLOW[site.site_type] || CARD_GLOW.site_scanning
              const completionMeta = parseCompletionMeta(site.notes || '')

              return (
                <div key={site.id}
                  style={{
                    background:'white', borderRadius:'16px', overflow:'hidden',
                    border: isExpanded ? '1px solid #93c5fd' : '1px solid rgba(203,213,225,.85)',
                    boxShadow: isExpanded ? `0 0 0 3px rgba(59,130,246,.12),0 8px 28px rgba(15,23,42,.12)` : '0 1px 4px rgba(15,23,42,.06),0 4px 16px rgba(15,23,42,.06)',
                    display:'flex', flexDirection:'column',
                    transition:'transform .18s ease,box-shadow .18s ease,border-color .18s ease',
                  }}
                  onMouseEnter={e => {
                    if (isExpanded) return
                    e.currentTarget.style.transform = 'translateY(-3px)'
                    e.currentTarget.style.boxShadow = `0 12px 32px ${glow},0 4px 12px rgba(15,23,42,.08)`
                  }}
                  onMouseLeave={e => {
                    if (isExpanded) return
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,.06),0 4px 16px rgba(15,23,42,.06)'
                  }}
                >
                  {/* ── Banner ── */}
                  <div style={{ height:130, flexShrink:0, position:'relative', overflow:'hidden', background:CARD_GRADIENTS[site.site_type]||CARD_GRADIENTS.site_scanning }}>
                    {(site.site_photo_url || getSiteHeaderImage(site.site_type)) && (
                      <img src={site.site_photo_url||getSiteHeaderImage(site.site_type)} alt=""
                        style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
                    )}
                    <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.62) 100%)' }} />
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'12px 14px' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px', background:'rgba(0,0,0,0.45)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,.18)', padding:'3px 9px', borderRadius:'999px', fontSize:'10px', color:'rgba(255,255,255,.92)', fontWeight:'500', maxWidth:'58%', minWidth:0 }}>
                          <MapPin size={9} style={{ flexShrink:0 }} />
                          <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{site.location}</span>
                        </div>
                        <Pill status={site.site_status} colors={STATUS_COLORS} />
                      </div>
                      <p style={{ margin:0, fontSize:'15px', fontWeight:'800', color:'white', letterSpacing:'-.02em', textShadow:'0 2px 10px rgba(0,0,0,.7)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:1.25 }}>
                        {site.site_name}
                      </p>
                    </div>
                  </div>

                  {/* ── Body ── */}
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', flex:1 }}>

                    {/* Type + report */}
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'12px' }}>
                      <span style={{ fontSize:'10px', fontWeight:'700', padding:'3px 9px', borderRadius:'6px', background:typeMeta.chipBg, color:typeMeta.color, border:`1px solid ${typeMeta.chipBorder}`, flexShrink:0 }}>
                        {typeMeta.label}
                      </span>
                      <Pill status={site.report_status} colors={REPORT_COLORS} />
                    </div>


                    {/* Info bar */}
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', marginBottom:'12px', paddingBottom:'12px', borderBottom:'1px solid #f1f5f9' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'16px', minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                          <Calendar size={12} color="#94a3b8" />
                          <span style={{ fontSize:'12px', color:'#64748b', fontWeight:'500' }}>
                            {new Date(site.scheduled_date).toLocaleDateString('en-MY',{ day:'numeric', month:'short', year:'numeric' })}
                          </span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                          <Clock size={12} color="#94a3b8" />
                          <span style={{ fontSize:'12px', color:'#64748b', fontWeight:'500' }}>{site.site_duration_days}d</span>
                        </div>
                      </div>

                      <div style={{ display:'flex', alignItems:'center', gap:'6px', minWidth:0, flexShrink:0, maxWidth:'140px' }}>
                        <span style={{ fontSize:'10px', fontWeight:'800', color:'#16a34a', textTransform:'uppercase', letterSpacing:'.06em', flexShrink:0 }}>DO :</span>
                        <span style={{ fontSize:'12px', color:completionMeta.deliveryOrderNumber ? '#0f172a' : '#94a3b8', fontWeight:'700', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {completionMeta.deliveryOrderNumber || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* PIC + crew */}
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
                      {pic
                        ? <Avatar name={pic.team_members?.full_name} size={28} index={memberIdx>=0?memberIdx:0} avatarUrl={pic.team_members?.avatar_url} />
                        : <div style={{ width:28, height:28, borderRadius:'50%', background:'#f1f5f9', border:'1px solid #e2e8f0', flexShrink:0 }} />
                      }
                      <div style={{ display:'flex', alignItems:'center', gap:'5px', flex:1, minWidth:0 }}>
                        <span style={{ fontSize:'13px', fontWeight:'700', color:'#0f172a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {pic?.team_members?.full_name || <span style={{ color:'#94a3b8', fontWeight:'500' }}>No PIC</span>}
                        </span>
                        {pic && (
                          <span style={{ fontSize:'9px', fontWeight:'800', padding:'2px 7px', borderRadius:'5px', background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe', flexShrink:0, letterSpacing:'.02em' }}>PIC</span>
                        )}
                      </div>
                      {crew.length > 0 && (
                        <div style={{ display:'flex', flexShrink:0 }}>
                          {crew.slice(0,3).map((c,ci) => (
                            <div key={ci} title={c.team_members?.full_name} style={{ marginLeft:ci>0?'-6px':0 }}>
                              <Avatar name={c.team_members?.full_name||'?'} size={22} index={ci+1} avatarUrl={c.team_members?.avatar_url} />
                            </div>
                          ))}
                          {crew.length > 3 && (
                            <div style={{ width:22,height:22,borderRadius:'50%',marginLeft:'-6px',background:'#f1f5f9',border:'2px solid white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:'800',color:'#64748b' }}>
                              +{crew.length-3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions — pinned to bottom */}
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'auto', paddingTop:'12px', borderTop:'1px solid #f1f5f9' }}>
                      <Link to={`/sites/${site.id}`}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'5px', padding:'8px 0', borderRadius:'8px', fontSize:'12px', fontWeight:'750', color:'white', background:'#2563eb', textDecoration:'none', boxShadow:'0 2px 8px rgba(37,99,235,.28)' }}
                        onMouseEnter={e => e.currentTarget.style.background='#1d4ed8'}
                        onMouseLeave={e => e.currentTarget.style.background='#2563eb'}>
                        <ArrowUpRight size={12} /> View
                      </Link>
                      <button
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedCard(null); setDraftStatus(null); setPanelAnchor(null)
                          } else {
                            setPanelAnchor({ open: true })
                            setExpandedCard(site.id)
                            const completionMeta = parseCompletionMeta(site.notes || '')
                            setDraftStatus({
                              site_status: site.site_status,
                              report_status: site.report_status,
                              delivery_order_number: completionMeta.deliveryOrderNumber,
                              completion_reason: completionMeta.completionReason,
                            })
                          }
                        }}
                        style={{
                          flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
                          padding:'8px 0', borderRadius:'8px', fontSize:'12px', fontWeight:'750', cursor:'pointer', fontFamily:'inherit',
                          background: isExpanded ? '#eff6ff' : '#0891b2',
                          border: `1px solid ${isExpanded ? '#bfdbfe' : '#0891b2'}`,
                          color: isExpanded ? '#2563eb' : 'white',
                          boxShadow: isExpanded ? 'none' : '0 2px 8px rgba(8,145,178,.28)',
                        }}>
                        <Pencil size={11} /> Update
                      </button>
                      <button onClick={() => openEdit(site)}
                        style={{ width:34,height:34,borderRadius:'8px',cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff7ed',border:'1px solid #fed7aa',color:'#d97706',transition:'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background='#ffedd5' }}
                        onMouseLeave={e => { e.currentTarget.style.background='#fff7ed' }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDelete(site.id)}
                        style={{ width:34,height:34,borderRadius:'8px',cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#fee2e2',border:'1px solid #fecaca',color:'#dc2626',transition:'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background='#fecaca' }}
                        onMouseLeave={e => { e.currentTarget.style.background='#fee2e2' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>


                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── PAGINATION ── */}
        {totalPages > 1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'24px' }}>
            <span style={{ fontSize:'12px', color:'#64748b', fontWeight:'600' }}>
              Showing {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length} sites
            </span>
            <div style={{ display:'flex', gap:'6px' }}>
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                style={{ padding:'6px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:'600', background:'white', border:'1px solid #e2e8f0', color:page===1?'#cbd5e1':'#64748b', cursor:page===1?'default':'pointer', fontFamily:'inherit' }}>‹</button>
              {Array.from({ length:totalPages }, (_,i) => i+1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  style={{ padding:'6px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:'700', background:page===p?'#0f172a':'white', border:`1px solid ${page===p?'#0f172a':'#e2e8f0'}`, color:page===p?'white':'#64748b', cursor:'pointer', fontFamily:'inherit' }}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                style={{ padding:'6px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:'600', background:'white', border:'1px solid #e2e8f0', color:page===totalPages?'#cbd5e1':'#64748b', cursor:page===totalPages?'default':'pointer', fontFamily:'inherit' }}>›</button>
            </div>
          </div>
        )}

      </main>

      {/* ── FLOATING UPDATE PANEL ── */}
      {expandedCard && draftStatus && panelAnchor && (() => {
        const site = paginated.find(s => s.id === expandedCard)
        if (!site) return null
        const close = () => { setExpandedCard(null); setDraftStatus(null); setPanelAnchor(null) }
        return (
          <>
            <div style={{ position:'fixed', inset:0, zIndex:49 }} onClick={close} />
            <div style={{
              position:'fixed', top:'50%', left:'50%', transform:'translate(-50%, -50%)',
              zIndex:50, width:'100%', maxWidth:'420px', maxHeight:'calc(100vh - 32px)',
              background:'white', border:'1px solid #e2e8f0', borderRadius:'16px',
              boxShadow:'0 24px 64px rgba(15,23,42,.18),0 4px 16px rgba(15,23,42,.08)',
              padding:'18px', overflowY:'auto',
              animation:'fadeSlideIn .15s ease',
            }}>
              <style>{`@keyframes fadeSlideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>

              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
                <div>
                  <p style={{ margin:0, fontSize:'13px', fontWeight:'800', color:'#0f172a', lineHeight:1.3 }}>{site.site_name}</p>
                  <p style={{ margin:'2px 0 0', fontSize:'11px', color:'#94a3b8', fontWeight:'500' }}>Update status</p>
                </div>
                <button onClick={close} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:'4px', borderRadius:'6px' }}>
                  <X size={14} />
                </button>
              </div>

              <p style={{ fontSize:'9px', fontWeight:'800', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', margin:'0 0 8px' }}>Site Status</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'14px' }}>
                {['upcoming','ongoing','completed','cancelled','postponed'].map(s => {
                  const c = STATUS_COLORS[s]; const active = draftStatus.site_status === s
                  return (
                    <button key={s} onClick={() => setDraftStatus(d => ({...d, site_status:s}))}
                      style={{ padding:'5px 11px', borderRadius:'999px', fontSize:'11px', fontWeight:'700', cursor:'pointer', textTransform:'capitalize', fontFamily:'inherit', border:`1px solid ${active?c.border:'#e2e8f0'}`, background:active?c.bg:'#f8fafc', color:active?c.text:'#64748b', transition:'all .12s' }}>
                      {s}
                    </button>
                  )
                })}
              </div>

              {(site.site_type === 'site_scanning' || site.site_type === 'site_visit') && (<>
                <p style={{ fontSize:'9px', fontWeight:'800', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', margin:'0 0 8px' }}>Report Status</p>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'14px' }}>
                  {['pending','in_progress','submitted','approved','not_applicable'].map(s => {
                    const c = REPORT_COLORS[s]; const active = draftStatus.report_status === s
                    const locked = s === 'approved' && !isZairul
                    return (
                      <button key={s} disabled={locked} onClick={() => !locked && setDraftStatus(d => ({...d, report_status:s}))} title={locked?'Only Zairul can approve':undefined}
                        style={{ padding:'5px 11px', borderRadius:'999px', fontSize:'11px', fontWeight:'700', cursor:locked?'not-allowed':'pointer', textTransform:'capitalize', fontFamily:'inherit', border:`1px solid ${active?c.border:'#e2e8f0'}`, background:active?c.bg:'#f8fafc', color:active?c.text:locked?'#cbd5e1':'#64748b', opacity:locked?0.5:1, transition:'all .12s' }}>
                        {s.replace(/_/g,' ')}
                      </button>
                    )
                  })}
                </div>
              </>)}

              {draftStatus.site_status === 'completed' && (
                <div style={{ display:'grid', gap:'10px', marginBottom:'14px' }}>
                  <div>
                    <label style={{ fontSize:'10px', fontWeight:'800', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:'6px' }}>
                      Delivery Order Number
                    </label>
                    <input
                      value={draftStatus.delivery_order_number || ''}
                      onChange={event => setDraftStatus(current => ({ ...current, delivery_order_number: event.target.value }))}
                      placeholder="Key in DO number"
                      style={{ width:'100%', padding:'9px 10px', borderRadius:'10px', border:'1px solid #e2e8f0', fontSize:'12px', color:'#0f172a', outline:'none', boxSizing:'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize:'10px', fontWeight:'800', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:'6px' }}>
                      Reason If No DO
                    </label>
                    <textarea
                      value={draftStatus.completion_reason || ''}
                      onChange={event => setDraftStatus(current => ({ ...current, completion_reason: event.target.value }))}
                      placeholder="State the reason if there is no delivery order number"
                      rows={3}
                      style={{ width:'100%', padding:'9px 10px', borderRadius:'10px', border:'1px solid #e2e8f0', fontSize:'12px', color:'#0f172a', outline:'none', boxSizing:'border-box', resize:'vertical', fontFamily:'inherit' }}
                    />
                  </div>
                  <p style={{ margin:0, fontSize:'11px', color:'#64748b', lineHeight:1.5 }}>
                    Completed status requires either a delivery order number or a stated reason.
                  </p>
                </div>
              )}

              <div style={{ display:'flex', gap:'8px', borderTop:'1px solid #f1f5f9', paddingTop:'14px' }}>
                <button onClick={() => handleQuickSave(site)} disabled={!!quickSaving}
                  style={{ flex:1, padding:'9px 0', borderRadius:'9px', fontSize:'13px', fontWeight:'750', color:'white', cursor:'pointer', border:'none', fontFamily:'inherit', background:'#0f172a', opacity:quickSaving?0.6:1 }}>
                  {quickSaving === site.id ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={close}
                  style={{ flex:1, padding:'9px 0', borderRadius:'9px', fontSize:'13px', fontWeight:'600', color:'#475569', cursor:'pointer', fontFamily:'inherit', background:'#f8fafc', border:'1px solid #e2e8f0' }}>
                  Cancel
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── MODAL ── */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'16px', background:'rgba(0,0,0,0.4)' }}
          onClick={e => e.target===e.currentTarget && setShowForm(false)}>
          <div style={{ width:'100%', maxWidth:'672px', maxHeight:'92vh', borderRadius:'20px', background:'white', boxShadow:'0 24px 64px rgba(15,23,42,.18)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 28px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <h3 style={{ margin:0, fontSize:'17px', fontWeight:'800', color:'#0f172a' }}>{editSite ? 'Edit Site' : 'Add New Site'}</h3>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={18} /></button>
            </div>
            <div style={{ overflowY:'auto', padding:'20px 28px', display:'flex', flexDirection:'column', gap:'20px' }}>

              <div>
                <label style={lLabel}>Cover Photo</label>
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                  const file = e.target.files[0]; if (!file) return
                  setUploadError(null)
                  setForm(f => ({...f, site_photo:file, site_photo_preview:URL.createObjectURL(file)}))
                  e.target.value = ''
                }} />
                {form.site_photo_preview ? (
                  <div style={{ position:'relative', borderRadius:'12px', overflow:'hidden' }}>
                    <img src={form.site_photo_preview} alt="preview" style={{ width:'100%', height:'144px', objectFit:'cover', display:'block' }} />
                    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', gap:'12px', opacity:0 }}
                      onMouseEnter={e => e.currentTarget.style.opacity=1}
                      onMouseLeave={e => e.currentTarget.style.opacity=0}>
                      <button type="button" onClick={() => photoInputRef.current?.click()} style={{ padding:'6px 14px', background:'white', color:'#0f172a', borderRadius:'8px', fontSize:'12px', fontWeight:'700', border:'none', cursor:'pointer' }}>Change</button>
                      <button type="button" onClick={() => setForm(f => ({...f, site_photo:null, site_photo_preview:null, site_photo_url:''}))} style={{ padding:'6px 14px', background:'#ef4444', color:'white', borderRadius:'8px', fontSize:'12px', fontWeight:'700', border:'none', cursor:'pointer' }}>Remove</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => photoInputRef.current?.click()}
                    style={{ width:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'8px', padding:'28px', borderRadius:'12px', cursor:'pointer', border:'2px dashed #e2e8f0', background:'#f8fafc', transition:'all .15s', boxSizing:'border-box' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor='#2563eb'}
                    onMouseLeave={e => e.currentTarget.style.borderColor='#e2e8f0'}>
                    <Camera size={20} style={{ color:'#94a3b8' }} />
                    <span style={{ fontSize:'12px', color:'#94a3b8', fontWeight:'600' }}>Click to upload a cover photo</span>
                    <span style={{ fontSize:'11px', color:'#cbd5e1' }}>JPG, PNG, WEBP</span>
                  </button>
                )}
                {uploadError && <p style={{ marginTop:'8px', fontSize:'12px', color:'#ef4444', fontWeight:'600' }}>{uploadError}</p>}
              </div>

              <div>
                <label style={lLabel}>Site Type</label>
                <div style={{ display:'flex', gap:'8px' }}>
                  {SITE_TYPES.map(({value,label}) => {
                    const active = form.site_type === value
                    const meta = TYPE_META[value]
                    return (
                      <button key={value} type="button"
                        onClick={() => setForm(f => ({...f, site_type:value, site_duration_days:value==='site_visit'?'0.5':f.site_duration_days}))}
                        style={{ flex:1, padding:'8px', borderRadius:'10px', fontSize:'12px', fontWeight:'700', fontFamily:'inherit', cursor:'pointer', transition:'all .15s', background:active?meta.chipBg:'white', border:`1px solid ${active?meta.chipBorder:'#e2e8f0'}`, color:active?meta.color:'#64748b' }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={lLabel}>Site Name *</label>
                <input style={lightInput} value={form.site_name} placeholder="e.g. Jalan Ampang Survey" onChange={e => setForm(f => ({...f, site_name:e.target.value}))} />
              </div>

              <div>
                <label style={lLabel}>Location *</label>
                <PlaceSearchBox value={form.location} onChange={v => setForm(f => ({...f, location:v, latitude:'', longitude:''}))} onSelect={r => setForm(f => ({...f, location:r.label, latitude:r.latitude, longitude:r.longitude}))} placeholder="Search and choose a location..." />
              </div>

              <div>
                <label style={{ ...lLabel, marginBottom:'8px' }}>Pin on Map <span style={{ fontSize:'11px', color:'#94a3b8', fontWeight:'400' }}>(click map to place)</span></label>
                {form.latitude !== '' && (
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', padding:'8px 12px', marginBottom:'8px' }}>
                    <MapPin size={12} style={{ color:'#2563eb', flexShrink:0 }} />
                    <span style={{ fontSize:'12px', color:'#1d4ed8', fontWeight:'600', flex:1 }}>{Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}</span>
                    <button onClick={() => setForm(f => ({...f, latitude:'', longitude:''}))} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'11px', color:'#2563eb', fontWeight:'600', fontFamily:'inherit', padding:0 }}>Clear Pin</button>
                  </div>
                )}
                <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'12px' }}>
                  <LocationPicker lat={form.latitude} lng={form.longitude} onPick={(lat,lng) => setForm(f => ({...f, latitude:lat, longitude:lng}))} mapKey={editSite?.id||'new'} />
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div><label style={lLabel}>Client Company</label><input style={lightInput} value={form.client_company_name} placeholder="Company name" onChange={e => setForm(f => ({...f, client_company_name:e.target.value}))} /></div>
                <div><label style={lLabel}>Client Name</label><input style={lightInput} value={form.client_name} placeholder="Contact name" onChange={e => setForm(f => ({...f, client_name:e.target.value}))} /></div>
                <div><label style={lLabel}>Client Number</label><input style={lightInput} value={form.client_number} placeholder="PO-12345" onChange={e => setForm(f => ({...f, client_number:e.target.value}))} /></div>
                <div>
                  <label style={lLabel}>Salesperson</label>
                  <select style={lightInput} value={form.salesperson} onChange={e => setForm(f => ({...f, salesperson:e.target.value}))}>
                    <option value="">— Select —</option>
                    {SALESPERSONS.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              </div>

              <div><label style={lLabel}>Scope of Work</label><textarea style={{...lightInput, resize:'none'}} rows={2} value={form.scope_of_work} placeholder="Describe scope…" onChange={e => setForm(f => ({...f, scope_of_work:e.target.value}))} /></div>
              <div><label style={lLabel}>Scheduled Date *</label><input type="date" style={lightInput} value={form.scheduled_date} onChange={e => setForm(f => ({...f, scheduled_date:e.target.value}))} /></div>

              {form.site_type === 'site_scanning' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                  <div><label style={lLabel}>Site Duration (Days)</label><input type="number" min="0" step="0.5" style={lightInput} value={form.site_duration_days} onChange={e => setForm(f => ({...f, site_duration_days:e.target.value}))} /></div>
                  <div><label style={lLabel}>Report Duration (Days)</label><input type="number" min="0" step="0.5" style={lightInput} value={form.report_duration_days} onChange={e => setForm(f => ({...f, report_duration_days:e.target.value}))} /></div>
                </div>
              )}
              {form.site_type === 'site_visit' && <div style={{ padding:'12px 16px', borderRadius:'10px', fontSize:'12px', fontWeight:'600', color:'#0d9488', background:'#f0fdf4', border:'1px solid #6ee7b7' }}>Duration: Half Day (0.5) — fixed for site visits</div>}
              {form.site_type === 'meeting' && (
                <div><label style={lLabel}>Meeting Duration</label>
                  <select style={lightInput} value={form.site_duration_days} onChange={e => setForm(f => ({...f, site_duration_days:e.target.value}))}>
                    <option value="0.25">2 Hours</option><option value="0.5">Half Day</option><option value="1">Full Day</option>
                  </select>
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:form.site_type==='site_scanning'?'1fr 1fr':'1fr', gap:'12px' }}>
                <div><label style={lLabel}>Site Status</label>
                  <select style={lightInput} value={form.site_status} onChange={e => setForm(f => ({...f, site_status:e.target.value}))}>
                    {['upcoming','ongoing','completed','cancelled','postponed'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {form.site_type === 'site_scanning' && (
                  <div><label style={lLabel}>Report Status</label>
                    <select style={lightInput} value={form.report_status} onChange={e => setForm(f => ({...f, report_status:e.target.value}))}>
                      {['pending','in_progress','submitted','approved','not_applicable'].map(o => <option key={o} value={o}>{o.replace('_',' ')}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div><label style={lLabel}>{form.site_type==='meeting'?'Organizer':'PIC'}</label>
                <select style={lightInput} value={form.pic_id} onChange={e => {
                  const picId = e.target.value
                  setForm(f => ({ ...f, pic_id: picId, crew_ids: f.crew_ids.filter(id => id !== picId) }))
                }}>
                  <option value="">— Select —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>

              <div><label style={{ ...lLabel, marginBottom:'12px' }}>{form.site_type==='meeting'?'Attendees':'Crew'}</label>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {members.filter(m => m.id !== form.pic_id).map(m => (
                    <label key={m.id} style={{ display:'flex', alignItems:'center', gap:'12px', cursor:'pointer' }}>
                      <input type="checkbox" checked={form.crew_ids.includes(m.id)} onChange={() => toggleCrew(m.id)} style={{ width:'16px', height:'16px', accentColor:'#2563eb' }} />
                      <span style={{ fontSize:'13px', color:'#0f172a' }}>{m.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div><label style={lLabel}>Notes</label><textarea style={{...lightInput, resize:'none'}} rows={3} value={form.notes} placeholder="Optional notes…" onChange={e => setForm(f => ({...f, notes:e.target.value}))} /></div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div>
                  <label style={lLabel}>Delivery Order Number</label>
                  <input
                    style={lightInput}
                    value={form.delivery_order_number}
                    placeholder="DO-12345"
                    onChange={e => setForm(f => ({ ...f, delivery_order_number: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={lLabel}>Reason If No DO</label>
                  <input
                    style={lightInput}
                    value={form.completion_reason}
                    placeholder="Why there is no DO"
                    onChange={e => setForm(f => ({ ...f, completion_reason: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display:'flex', gap:'12px', paddingTop:'4px', borderTop:'1px solid #f1f5f9' }}>
                <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:'10px', fontSize:'14px', fontWeight:'800', color:'white', border:'none', cursor:'pointer', fontFamily:'inherit', background:'#2563eb', opacity:saving?0.6:1, boxShadow:'0 2px 8px rgba(37,99,235,.28)' }}>
                  {saving ? 'Saving…' : editSite ? 'Save Changes' : 'Add Site'}
                </button>
                <button onClick={() => setShowForm(false)} style={{ flex:1, padding:'11px', borderRadius:'10px', fontSize:'14px', fontWeight:'600', color:'#0f172a', cursor:'pointer', fontFamily:'inherit', background:'#f1f5f9', border:'1px solid #e2e8f0' }}>
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
