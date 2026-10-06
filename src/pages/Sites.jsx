import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'
import { supabase } from '../supabase'
import {
  Pencil, Trash2, Search, ArrowUpRight, MapPin, MessageCircle, X, Camera,
  Calendar, Clock, CheckCircle, SlidersHorizontal,
} from 'lucide-react'
import { memberSchedule, notify, notifyMany, notifyScheduleChanges, siteRoleIds } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import PlaceSearchBox from '../components/PlaceSearchBox'
import { getSiteHeaderImage } from '../utils/siteHeader'
import { mergeCompletionMeta, parseCompletionMeta, validateCompletionRequirement } from '../utils/completionMeta'
import { fetchTeamLeaves, getLeaveSessionLabel, getLeaveSummary, getMemberLeaveOnDate } from '../utils/teamLeaves'
import { useViewport } from '../utils/useViewport'
import { buildAssignmentMessage, openWhatsApp, shortNameOf } from '../utils/whatsapp'
import { getSiteTitle } from '../utils/siteTitle'
import {
  assignmentMemberId, assignmentsForDate, crewForDate, getSiteDates, hasDailyCrew,
  isPic, picForDate, siteCrew, sitePic, uniqueAssignments,
} from '../utils/siteDays'
import 'leaflet/dist/leaflet.css'
import './Sites.css'

/* ── Design tokens (Dashboard light-mode parity) ── */
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
  site_scanning: 'rgba(37,99,235,.45)',
  site_visit:    'rgba(13,148,136,.4)',
  meeting:       'rgba(124,58,237,.4)',
}
// Soft tones for the card pills and the quick-update chips
const STATUS_TONE = {
  upcoming:  { text:'#b45309', bg:'#fffbeb', dot:'#f59e0b' },
  ongoing:   { text:'#c2410c', bg:'#fff7ed', dot:'#f97316' },
  completed: { text:'#15803d', bg:'#f0fdf4', dot:'#22c55e' },
  cancelled: { text:'#b91c1c', bg:'#fef2f2', dot:'#ef4444' },
  postponed: { text:'#475569', bg:'#f8fafc', dot:'#94a3b8' },
}
const REPORT_TONE = {
  pending:        { text:'#b91c1c', bg:'#fef2f2', dot:'#ef4444' },
  in_progress:    { text:'#b45309', bg:'#fffbeb', dot:'#f59e0b' },
  submitted:      { text:'#1d4ed8', bg:'#eff6ff', dot:'#3b82f6' },
  approved:       { text:'#15803d', bg:'#f0fdf4', dot:'#22c55e' },
  not_applicable: { text:'#64748b', bg:'#f1f5f9', dot:'#94a3b8' },
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
const SALESPERSONS = ['GH Tan','Chong Jie Yan','Jasmin','Darren','Wendy','Zairul','Reekha','Ryan']
const TABS         = ['All','Upcoming','Ongoing','Completed','Cancelled','Postponed']
const EMPTY = {
  site_type:'site_scanning', site_name:'', location:'', latitude:'', longitude:'',
  client_company_name:'', client_name:'', client_number:'', scope_of_work:'',
  salesperson:'', scheduled_date:'', end_date:'', site_session:'', site_status:'upcoming', report_status:'pending',
  site_duration_days:'1', report_duration_days:'0.5', notes:'', pic_id:'', crew_ids:[],
  assign_mode:'same', daily_assignments:{},
  delivery_order_number:'', completion_reason:'',
  site_photo:null, site_photo_preview:null, site_photo_url:'',
}

function MemberAvatar({ member, index = 0, className = '' }) {
  const name = member?.full_name || '?'
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0,2).toUpperCase() || '?'
  return (
    <span className={`ss-av ${className}`} title={name} style={{ '--c':AVATAR_COLORS[Math.max(0, index) % AVATAR_COLORS.length] }}>
      {member?.avatar_url ? <img src={member.avatar_url} alt={name} /> : initials}
    </span>
  )
}

// Compact page list: first, last, current ± siblingCount, '…' for the rest.
function getPageNumbers(current, total, siblingCount = 1) {
  const totalSlots = siblingCount * 2 + 5
  if (totalSlots >= total) return Array.from({ length: total }, (_, i) => i + 1)

  const left  = Math.max(current - siblingCount, 1)
  const right = Math.min(current + siblingCount, total)
  const showLeftGap  = left > 2
  const showRightGap = right < total - 1

  if (!showLeftGap && showRightGap) {
    const end = 3 + siblingCount * 2
    return [...Array.from({ length: end }, (_, i) => i + 1), '…', total]
  }
  if (showLeftGap && !showRightGap) {
    const start = total - (3 + siblingCount * 2) + 1
    return [1, '…', ...Array.from({ length: total - start + 1 }, (_, i) => start + i)]
  }
  return [1, '…', ...Array.from({ length: right - left + 1 }, (_, i) => left + i), '…', total]
}

// Phone photos are often several MB; scale down to 1600px JPEG so the upload is quick.
async function shrinkPhoto(file, maxSide = 1600) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 400 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

async function uploadSitePhoto(original) {
  const file = await shrinkPhoto(original)
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
      style={{ height:'160px', borderRadius:'10px', cursor:'crosshair' }} zoomControl={false} scrollWheelZoom={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" />
      <MapClickHandler onPick={onPick} />
      {hasPin && <CircleMarker center={[parseFloat(lat), parseFloat(lng)]} radius={9}
        pathOptions={{ color:'white', fillColor:'#2563eb', fillOpacity:1, weight:3 }} />}
    </MapContainer>
  )
}

// Last loaded data, kept for the session so coming back to Sites shows the list
// straight away while a fresh copy loads in the background.
let sitesCache = null

export default function Sites() {
  const { fullName, isZairul, memberId } = useAuth()
  const { width, isMobile } = useViewport()
  const [sites, setSites]             = useState(() => sitesCache?.sites || [])
  const [members, setMembers]         = useState(() => sitesCache?.members || [])
  const [loading, setLoading]         = useState(!sitesCache)
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
  const [leaves, setLeaves]             = useState(() => sitesCache?.leaves || [])
  const [waMenu, setWaMenu]             = useState(null)
  const photoInputRef = useRef(null)
  const searchRef = useRef(null)
  // Always three rows: columns follow the Sites.css grid breakpoints; one column on phones shows 8
  const columns = width >= 1600 ? 5 : width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 640 ? 2 : 1
  const perPage = columns === 1 ? 8 : columns * 3

  // Keep the first card on screen in view when the column count changes
  const prevPerPage = useRef(perPage)
  useEffect(() => {
    if (prevPerPage.current === perPage) return
    const from = prevPerPage.current
    setPage(p => Math.floor(((p - 1) * from) / perPage) + 1)
    prevPerPage.current = perPage
  }, [perPage])

  // '/' jumps to search, Esc closes the update panel
  useEffect(() => {
    const onKey = e => {
      const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape') { setExpandedCard(null); setDraftStatus(null); setPanelAnchor(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const location = useLocation()
  useEffect(() => { fetchAll() }, [])

  // Close the WhatsApp picker on any outside click
  useEffect(() => {
    if (!waMenu) return
    const close = () => setWaMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [waMenu])
  useEffect(() => { if (location.state?.openAdd) openAdd() }, [location.state])
  useEffect(() => {
    const h = () => openAdd()
    window.addEventListener('xyte:open-add-site', h)
    return () => window.removeEventListener('xyte:open-add-site', h)
  }, [])
  useEffect(() => {
    const h = () => fetchAll()
    window.addEventListener('xyte:leaves-updated', h)
    return () => window.removeEventListener('xyte:leaves-updated', h)
  }, [])

  // Only the first load shows the full-page spinner; refreshes after a save swap the data in quietly.
  async function fetchAll() {
    const [{ data:s }, { data:m }, leaveData] = await Promise.all([
      supabase
        .from('sites')
        .select(`*, site_assignments(assignment_role, work_date, member_id)`)
        .order('scheduled_date', { ascending:false }),
      supabase.from('team_members').select('*').order('full_name'),
      fetchTeamLeaves().catch(() => []),
    ])
    // Assignments come back with just member_id; attach the member from the team list
    // instead of having the server repeat it on every row.
    const byId = new Map((m || []).map(x => [x.id, x]))
    const withMembers = (s || []).map(site => ({
      ...site,
      site_assignments: (site.site_assignments || []).map(a => ({ ...a, team_members: byId.get(a.member_id) || null })),
    }))
    sitesCache = { sites: withMembers, members: m || [], leaves: leaveData || [] }
    setSites(sitesCache.sites)
    setMembers(sitesCache.members)
    setLeaves(sitesCache.leaves)
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

      // PICs and crew of this site hear about it under separate notification settings
      // (deduped — a per-day site can list the same person on several days).
      const { picIds, crewIds } = siteRoleIds(site)
      // Not awaited: the save is done, nobody should wait on notifications.
      const tell = msg => Promise.all([
        notifyMany(`${msg} (you are PIC)`, fullName, picIds.filter(id => id !== memberId), 'pic_update'),
        notifyMany(msg, fullName, crewIds.filter(id => id !== memberId), 'site_update'),
      ]).catch(err => console.warn('Notification failed:', err.message))

      if (updates.site_status) {
        tell(`Site "${site.site_name}" status changed to ${updates.site_status}`)
      }
      if (updates.report_status) {
        tell(updates.report_status === 'approved'
          ? `Report for "${site.site_name}" has been approved by Zairul`
          : updates.report_status === 'submitted'
          ? `Report for "${site.site_name}" has been submitted — awaiting review`
          : `Report for "${site.site_name}" status changed to ${updates.report_status.replace(/_/g, ' ')}`)
      }
      setQuickSaving(null)
    }
    setExpandedCard(null); setDraftStatus(null); setPanelAnchor(null)
  }

  function openAdd() { setForm(EMPTY); setEditSite(null); setShowForm(true) }
  function openEdit(site) {
    const assignments = site.site_assignments || []
    const isPerDay = assignments.some(a => a.work_date)
    const pic  = assignments.find(a => a.assignment_role === 'PIC' && !a.work_date)
    const crew = assignments.filter(a => a.assignment_role === 'crew' && !a.work_date)
    const dailyAssignments = {}
    if (isPerDay) {
      assignments.filter(a => a.work_date).forEach(a => {
        const d = dailyAssignments[a.work_date] || { pic_id:'', crew_ids:[] }
        if (a.assignment_role === 'PIC') d.pic_id = a.team_members?.id || ''
        else if (a.team_members?.id) d.crew_ids = [...d.crew_ids, a.team_members.id]
        dailyAssignments[a.work_date] = d
      })
    }
    const completionMeta = parseCompletionMeta(site.notes || '')
    setForm({
      site_type: site.site_type || 'site_scanning',
      site_name:site.site_name, location:site.location,
      latitude:site.latitude||'', longitude:site.longitude||'',
      client_company_name:site.client_company_name||'', client_name:site.client_name||'',
      client_number:site.client_number||'', scope_of_work:site.scope_of_work||'',
      salesperson:site.salesperson||'', scheduled_date:site.scheduled_date,
      end_date:site.end_date||site.scheduled_date||'', site_session:site.site_session||'',
      site_status:site.site_status,
      site_duration_days:site.site_duration_days?.toString()||'1',
      report_duration_days:site.report_duration_days?.toString()||'0.5',
      report_status:site.report_status, notes:completionMeta.baseNotes,
      pic_id:isPerDay ? '' : (pic?.team_members?.id||''),
      crew_ids:isPerDay ? [] : (crew?.map(c => c.team_members?.id)||[]),
      assign_mode: isPerDay ? 'per_day' : 'same',
      daily_assignments: dailyAssignments,
      delivery_order_number: completionMeta.deliveryOrderNumber,
      completion_reason: completionMeta.completionReason,
      site_photo:null, site_photo_preview:site.site_photo_url||null, site_photo_url:site.site_photo_url||'',
    })
    setEditSite(site); setShowForm(true)
  }
  function toggleCrew(id) {
    setForm(f => ({ ...f, crew_ids: f.crew_ids.includes(id) ? f.crew_ids.filter(x => x!==id) : [...f.crew_ids, id] }))
  }
  function datesInRange(start, end) {
    if (!start) return []
    const arr = []
    const cur = new Date(`${start}T00:00:00`)
    const last = new Date(`${end || start}T00:00:00`)
    while (cur <= last) {
      arr.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`)
      cur.setDate(cur.getDate() + 1)
    }
    return arr
  }
  function setDayPic(dateStr, picId) {
    setForm(f => ({
      ...f,
      daily_assignments: {
        ...f.daily_assignments,
        [dateStr]: { pic_id: picId, crew_ids: (f.daily_assignments[dateStr]?.crew_ids || []).filter(id => id !== picId) },
      },
    }))
  }
  function toggleDayCrew(dateStr, memberId) {
    setForm(f => {
      const cur = f.daily_assignments[dateStr] || { pic_id:'', crew_ids:[] }
      const has = cur.crew_ids.includes(memberId)
      return {
        ...f,
        daily_assignments: {
          ...f.daily_assignments,
          [dateStr]: { ...cur, crew_ids: has ? cur.crew_ids.filter(id => id!==memberId) : [...cur.crew_ids, memberId] },
        },
      }
    })
  }

  function getLeaveConflict(memberIds, date) {
    const conflicts = memberIds
      .map(memberId => {
        const member = members.find(item => item.id === memberId)
        const leave = getMemberLeaveOnDate(leaves, memberId, date)
        return leave && member ? { member, leave } : null
      })
      .filter(Boolean)

    if (conflicts.length === 0) return null
    return `These team members are on leave for ${date}: ${conflicts.map(({ member, leave }) => `${member.full_name} (${leave.leave_type}, ${getLeaveSessionLabel(leave.leave_session)})`).join(', ')}`
  }

  async function handleSave() {
    if (!form.site_name || !form.location || !form.scheduled_date) return
    if (form.assign_mode === 'per_day') {
      for (const [dateStr, day] of Object.entries(form.daily_assignments)) {
        const leaveError = getLeaveConflict([day.pic_id, ...day.crew_ids].filter(Boolean), dateStr)
        if (leaveError) {
          setUploadError(leaveError)
          return
        }
      }
    } else {
      const leaveError = getLeaveConflict([form.pic_id, ...form.crew_ids].filter(Boolean), form.scheduled_date)
      if (leaveError) {
        setUploadError(leaveError)
        return
      }
    }
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
        scheduled_date:form.scheduled_date,
        end_date:form.end_date || form.scheduled_date || null,
        site_session:(form.scheduled_date && form.end_date && form.scheduled_date === form.end_date) ? (form.site_session || null) : null,
        site_status:form.site_status,
        site_duration_days:isSiteVisit ? 0.5 : (() => {
          if (form.site_type === 'site_scanning') {
            const isSameDay = form.scheduled_date && form.end_date && form.scheduled_date === form.end_date
            if (isSameDay) return form.site_session === 'Full Day' ? 1 : 0.5
            if (form.scheduled_date && form.end_date) return Math.round((new Date(form.end_date) - new Date(form.scheduled_date)) / 86400000) + 1
          }
          return parseFloat(form.site_duration_days) || 1
        })(),
        report_duration_days:isSiteVisit||isMeeting ? 0 : (parseFloat(form.report_duration_days)||0),
        report_status:isSiteVisit||isMeeting ? 'not_applicable' : form.report_status,
        notes: mergeCompletionMeta(form.notes, {
          deliveryOrderNumber: form.delivery_order_number,
          completionReason: form.completion_reason,
        }),
      }
      let siteId = editSite?.id
      const assignments = []
      if (form.assign_mode === 'per_day') {
        Object.entries(form.daily_assignments).forEach(([dateStr, day]) => {
          if (day.pic_id) assignments.push({ member_id:day.pic_id, assignment_role:'PIC', work_date:dateStr })
          day.crew_ids.forEach(id => { if (id!==day.pic_id) assignments.push({ member_id:id, assignment_role:'crew', work_date:dateStr }) })
        })
      } else {
        if (form.pic_id) assignments.push({ member_id:form.pic_id, assignment_role:'PIC', work_date:null })
        form.crew_ids.forEach(id => { if (id!==form.pic_id) assignments.push({ member_id:id, assignment_role:'crew', work_date:null }) })
      }
      // Only rewrite assignments when the rows themselves differ
      const assignmentKeys = rows => rows.map(a => `${a.member_id || a.team_members?.id}|${a.assignment_role}|${a.work_date || ''}`).sort().join(',')
      const changed = !editSite || assignmentKeys(editSite.site_assignments || []) !== assignmentKeys(assignments)
      if (editSite) {
        const { error } = await supabase.from('sites').update(payload).eq('id', siteId)
        if (error) throw new Error(error.message)
        if (changed) {
          await Promise.all([
            supabase.from('site_assignments').delete().eq('site_id', siteId),
            supabase.from('workload_log').delete().eq('site_id', siteId),
          ])
        }
      } else {
        const { data, error } = await supabase.from('sites').insert(payload).select().single()
        if (error) throw new Error(error.message)
        siteId = data.id
      }
      if (changed && assignments.length > 0) {
        const rows = assignments.map(a => ({ ...a, site_id:siteId }))
        const { error: assignError } = await supabase.from('site_assignments').insert(rows)
        if (assignError) throw new Error(assignError.message)
      }
      // The site is saved — close the form now and let notifications go out in the background.
      sendSaveNotifications(form, editSite, assignments, payload)
        .catch(err => console.warn('Notification failed:', err.message))
      window.dispatchEvent(new CustomEvent('xyte:site-saved'))
      setShowForm(false); setEditSite(null); fetchAll()
    } catch (err) {
      setUploadError(err.message||'Unable to save.')
    } finally {
      setSaving(false)
    }
  }

  // Only people whose own schedule changed hear about it: new days, removed days, a new
  // role, or (for everyone still on the site) a change of session on the same day.
  async function sendSaveNotifications(form, editSite, assignments, savedSite) {
    const before = editSite ? memberSchedule(editSite.site_assignments || [], getSiteDates(editSite)) : new Map()
    const after  = memberSchedule(assignments, getSiteDates(savedSite))
    const sessionChanged = !!editSite && (editSite.site_session || null) !== (savedSite.site_session || null)
    const told = await notifyScheduleChanges({
      siteName: form.site_name,
      before,
      after,
      sessionNote: sessionChanged && savedSite.site_session ? `now ${savedSite.site_session}` : sessionChanged ? 'session updated' : null,
      actor: fullName,
      skipId: memberId,
    })

    const jobs = [notify(`${editSite?'Updated':'Added'} site: ${form.site_name}`, fullName, null, 'general')]
    if (editSite) {
      // PICs who weren't already told about their own schedule still hear the site was edited.
      const statusNote = editSite.site_status !== form.site_status ? ` — status: ${form.site_status}` : ''
      const stillPic = [...after].filter(([id, s]) => s.role === 'PIC' && id !== memberId && !told.has(id)).map(([id]) => id)
      jobs.push(notifyMany(`${fullName} updated site "${form.site_name}" (you are PIC)${statusNote}`, fullName, stillPic, 'pic_update'))
    }
    await Promise.all(jobs)
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
    .filter(s => {
      if (!search) return true
      const needle = search.toLowerCase()
      return [s.site_name, s.location, s.client_company_name]
        .some(field => String(field || '').toLowerCase().includes(needle))
    })

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated  = filtered.slice((page-1)*perPage, page*perPage)


  const lightInput = {
    width:'100%', padding:'8px 12px', borderRadius:'8px',
    border:'1px solid #e2e8f0', fontSize:'13px', outline:'none',
    background:'white', color:'#0f172a', fontFamily:'inherit', boxSizing:'border-box',
  }
  const lLabel = { display:'block', fontSize:'12px', fontWeight:'500', color:'#64748b', marginBottom:'6px' }
  const unavailableMembers = members.reduce((acc, member) => {
    const leave = getMemberLeaveOnDate(leaves, member.id, form.scheduled_date)
    if (leave) acc[member.id] = leave
    return acc
  }, {})

  if (loading) return (
    <div className="ss" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', color:'#94a3b8', fontSize:'14px', fontWeight:'600' }}>
        <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-blue-400 animate-spin" />
        Loading sites…
      </div>
    </div>
  )

  const closePanel = () => { setExpandedCard(null); setDraftStatus(null); setPanelAnchor(null) }
  const ongoingCount  = sites.filter(s => s.site_status === 'ongoing').length
  const upcomingCount = sites.filter(s => s.site_status === 'upcoming').length

  return (
    <div className="ss">
      <main className="ss-main">

        {/* ── HEADER ── */}
        <div className="ss-head">
          <div>
            <div className="ss-eyebrow">{new Date().toLocaleDateString('en-MY', { weekday:'long', day:'numeric', month:'long' })}</div>
            <h1>Sites</h1>
            <p className="ss-sub">Manage and track all site activities · <b>{ongoingCount}</b> ongoing · <b>{upcomingCount}</b> upcoming</p>
          </div>
          <label className="ss-search">
            <Search size={15} strokeWidth={2.2} />
            <input
              ref={searchRef}
              placeholder="Search sites…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
            <kbd>/</kbd>
          </label>
        </div>

        {/* ── FILTER TABS ── */}
        <div className="ss-tabs">
          {TABS.map(t => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setPage(1) }}>
              {t}<i>{counts[t]}</i>
            </button>
          ))}
        </div>

        {/* ── CARDS ── */}
        {paginated.length === 0 ? (
          <div className="ss-empty">
            <MapPin size={28} style={{ opacity:0.35 }} />
            No sites found
          </div>
        ) : (
          <div className="ss-grid">
            {paginated.map(site => {
              // On a per-day site the card speaks for today (or day one)
              const perDay    = hasDailyCrew(site.site_assignments || [])
              const siteDates = getSiteDates(site)
              const pic       = sitePic(site)
              // Deduped — a per-day site can list the same crew member across multiple day-specific rows
              const crew      = Array.from(
                new Map(siteCrew(site).map(a => [a.team_members?.id, a])).values()
              )
              const typeMeta  = TYPE_META[site.site_type] || TYPE_META.site_scanning
              const statusTone = STATUS_TONE[site.site_status] || STATUS_TONE.upcoming
              const reportTone = REPORT_TONE[site.report_status] || REPORT_TONE.pending
              const memberIdx = members.findIndex(m => m.id === pic?.team_members?.id)
              const isExpanded = expandedCard === site.id
              // Per-day rosters travel with the WhatsApp brief so everyone sees the rotation
              const dayRoster = perDay ? siteDates.map(date => ({
                date,
                picName: shortNameOf(picForDate(site.site_assignments || [], date)?.team_members),
                crewNames: crewForDate(site.site_assignments || [], date).map(c => shortNameOf(c.team_members)).filter(Boolean),
              })) : []
              const memberDatesOn = memberId => perDay
                ? siteDates.filter(date => assignmentsForDate(site.site_assignments || [], date).some(a => assignmentMemberId(a) === memberId))
                : siteDates
              // Assigned members reachable on WhatsApp — PIC first, each person once
              const waTargets = (perDay
                ? uniqueAssignments(site.site_assignments || []).map(a => ({ role: isPic(a) ? 'PIC' : 'crew', member: a.team_members }))
                : [
                    ...(pic ? [{ role: 'PIC', member: pic.team_members }] : []),
                    ...crew.map(c => ({ role: 'crew', member: c.team_members })),
                  ]
              ).filter(t => t.member?.phone)
              const waOpen = waMenu === site.id
              const sendBrief = ({ role, member }) => openWhatsApp(member.phone, buildAssignmentMessage({
                role, memberName: shortNameOf(member), site,
                pic: pic?.team_members, crew: crew.map(c => c.team_members),
                memberDates: memberDatesOn(member.id), dayRoster,
              }))
              const completionMeta = parseCompletionMeta(site.notes || '')
              const reportDone = site.report_status === 'approved'

              return (
                <div key={site.id} className={`ss-card${isExpanded ? ' on' : ''}`}
                  style={{ '--tg':CARD_GRADIENTS[site.site_type] || CARD_GRADIENTS.site_scanning, '--glow':CARD_GLOW[site.site_type] || CARD_GLOW.site_scanning, '--tt':typeMeta.chipBg, '--tc':typeMeta.color }}>

                  {/* ── Banner ── */}
                  <div className="ss-banner">
                    <img src={site.site_photo_url || getSiteHeaderImage(site.site_type)} alt="" loading="lazy" />
                    <div className="in">
                      <div className="row">
                        <span className="ss-loc"><MapPin size={10} strokeWidth={2.4} /><span>{site.location}</span></span>
                        <span className={`ss-status${site.site_status === 'ongoing' ? ' live' : ''}`} style={{ '--sc':statusTone.text }}>{site.site_status}</span>
                      </div>
                      <p className="ss-title" title={getSiteTitle(site)}>
                        {site.site_name}
                        {site.client_company_name && <small>{site.client_company_name}</small>}
                      </p>
                    </div>
                  </div>

                  {/* ── Body ── */}
                  <div className="ss-body">
                    <div className="ss-tags">
                      <span className="ss-type">{typeMeta.label}</span>
                      <span className="ss-rep" style={{ '--rc':reportTone.text, '--rb':reportTone.bg }}>
                        {site.report_status?.replace(/_/g,' ')}
                        {reportDone && <CheckCircle size={11} />}
                      </span>
                    </div>

                    <div className="ss-facts">
                      <div className="ss-fact">
                        <span className="ic"><Calendar size={13} /></span>
                        <div><small>Date</small><b>{new Date(site.scheduled_date).toLocaleDateString('en-MY',{ day:'numeric', month:'short', year:'numeric' })}</b></div>
                      </div>
                      <div className="ss-fact">
                        <span className="ic"><Clock size={13} /></span>
                        <div><small>Duration</small><b>{site.site_duration_days}d</b></div>
                      </div>
                      <div className="ss-fact do">
                        <div><small>DO</small><b className={completionMeta.deliveryOrderNumber ? '' : 'na'}>{completionMeta.deliveryOrderNumber || 'N/A'}</b></div>
                      </div>
                    </div>

                    {/* PIC + crew */}
                    <div className="ss-crew">
                      {pic
                        ? <MemberAvatar member={pic.team_members} index={memberIdx >= 0 ? memberIdx : 0} className="pic" />
                        : <span className="ss-av none" />}
                      <div className="ss-who">
                        {pic ? (<>
                          <b>{pic.team_members?.full_name}</b>
                          <small><em>PIC</em>{site.site_type === 'meeting' ? 'Organizer' : 'Person in charge'}{perDay ? ' · daily crew' : ''}</small>
                        </>) : (<>
                          <b className="na">No PIC assigned</b>
                          <small>Assign from Edit</small>
                        </>)}
                      </div>
                      {crew.length > 0 && (
                        <div className="ss-stack">
                          {crew.slice(0,3).map((c, ci) => <MemberAvatar key={ci} member={c.team_members} index={ci + 1} />)}
                          {crew.length > 3 && <span className="more">+{crew.length - 3}</span>}
                        </div>
                      )}
                    </div>

                    {/* Actions — pinned to bottom */}
                    <div className="ss-acts">
                      <Link to={`/sites/${site.id}`} className="ss-btn view">
                        <ArrowUpRight size={13} strokeWidth={2.4} /> View
                      </Link>
                      <button className="ss-btn upd"
                        onClick={() => {
                          if (isExpanded) { closePanel(); return }
                          setPanelAnchor({ open: true })
                          setExpandedCard(site.id)
                          setDraftStatus({
                            site_status: site.site_status,
                            report_status: site.report_status,
                            delivery_order_number: completionMeta.deliveryOrderNumber,
                            completion_reason: completionMeta.completionReason,
                          })
                        }}>
                        <Pencil size={13} /> Update
                      </button>
                      {waTargets.length > 0 && (
                        <div className="ss-wa">
                          <button className={`ss-ib wa${waOpen ? ' open' : ''}`}
                            title={waTargets.length === 1 ? `WhatsApp ${waTargets[0].member.full_name}` : 'WhatsApp the team'}
                            onClick={e => {
                              e.stopPropagation()
                              if (waTargets.length === 1) { sendBrief(waTargets[0]); return }
                              setWaMenu(waOpen ? null : site.id)
                            }}>
                            <MessageCircle size={14} />
                          </button>
                          {waOpen && (
                            <div className="ss-wa-menu">
                              <p>SEND BRIEF TO</p>
                              {waTargets.map(target => (
                                <button key={target.member.id}
                                  onClick={e => { e.stopPropagation(); sendBrief(target); setWaMenu(null) }}>
                                  <MemberAvatar member={target.member} index={members.findIndex(m => m.id === target.member.id)} />
                                  <span>{target.member.full_name}</span>
                                  <em className={target.role === 'PIC' ? 'pic' : ''}>{target.role === 'PIC' ? 'PIC' : 'CREW'}</em>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <button className="ss-ib ed" title="Edit site" onClick={() => openEdit(site)}>
                        <SlidersHorizontal size={14} />
                      </button>
                      <button className="ss-ib del" title="Delete site" onClick={() => handleDelete(site.id)}>
                        <Trash2 size={14} />
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
          <div className="ss-pager">
            <span>Showing <b>{(page-1)*perPage+1}–{Math.min(page*perPage, filtered.length)}</b> of <b>{filtered.length}</b> sites</span>
            <div className="ss-pages">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>‹</button>
              {getPageNumbers(page, totalPages).map((p, i) => (
                p === '…'
                  ? <span key={`gap-${i}`}>…</span>
                  : <button key={p} className={page===p ? 'on' : ''} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}>›</button>
            </div>
          </div>
        )}

      </main>

      {/* ── QUICK UPDATE PANEL ── */}
      {expandedCard && draftStatus && panelAnchor && (() => {
        const site = paginated.find(s => s.id === expandedCard)
        if (!site) return null
        return (
          <>
            <div className="ss-scrim" onClick={closePanel} />
            <div className="ss-panel" style={{ '--tg':CARD_GRADIENTS[site.site_type] || CARD_GRADIENTS.site_scanning }}>
              <div className="ss-p-head">
                <img className="thumb" src={site.site_photo_url || getSiteHeaderImage(site.site_type)} alt="" />
                <div>
                  <b title={getSiteTitle(site)}>{getSiteTitle(site)}</b>
                  <small>Update status</small>
                </div>
                <button className="x" onClick={closePanel}><X size={15} /></button>
              </div>

              <div className="ss-p-body">
                <div>
                  <label>Site status</label>
                  <div className="ss-chips">
                    {['upcoming','ongoing','completed','cancelled','postponed'].map(s => {
                      const c = STATUS_TONE[s]
                      return (
                        <button key={s} className={draftStatus.site_status === s ? 'on' : ''}
                          style={{ '--oc':c.dot, '--ot':c.text, '--ob':c.bg }}
                          onClick={() => setDraftStatus(d => ({...d, site_status:s}))}>
                          {s}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {(site.site_type === 'site_scanning' || site.site_type === 'site_visit') && (
                  <div>
                    <label>Report status</label>
                    <div className="ss-chips">
                      {['pending','in_progress','submitted','approved','not_applicable'].map(s => {
                        const c = REPORT_TONE[s]
                        const locked = s === 'approved' && !isZairul
                        return (
                          <button key={s} disabled={locked} title={locked ? 'Only Zairul can approve' : undefined}
                            className={draftStatus.report_status === s ? 'on' : ''}
                            style={{ '--oc':c.dot, '--ot':c.text, '--ob':c.bg }}
                            onClick={() => !locked && setDraftStatus(d => ({...d, report_status:s}))}>
                            {s.replace(/_/g,' ')}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {draftStatus.site_status === 'completed' && (<>
                  <div>
                    <label>Delivery order number</label>
                    <input
                      value={draftStatus.delivery_order_number || ''}
                      onChange={event => setDraftStatus(current => ({ ...current, delivery_order_number: event.target.value }))}
                      placeholder="Key in DO number"
                    />
                  </div>
                  <div>
                    <label>Reason if no DO</label>
                    <textarea
                      value={draftStatus.completion_reason || ''}
                      onChange={event => setDraftStatus(current => ({ ...current, completion_reason: event.target.value }))}
                      placeholder="State the reason if there is no delivery order number"
                      rows={3}
                    />
                  </div>
                  <p className="hint">Completed status requires either a delivery order number or a stated reason.</p>
                </>)}
              </div>

              <div className="ss-p-foot">
                <button className="save" onClick={() => handleQuickSave(site)} disabled={!!quickSaving}>
                  {quickSaving === site.id ? 'Saving…' : 'Save Changes'}
                </button>
                <button className="cancel" onClick={closePanel}>Cancel</button>
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
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:isMobile ? '16px 18px' : '20px 28px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <h3 style={{ margin:0, fontSize:'17px', fontWeight:'800', color:'#0f172a' }}>{editSite ? 'Edit Site' : 'Add New Site'}</h3>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={18} /></button>
            </div>
            <div style={{ overflowY:'auto', padding:isMobile ? '16px 18px' : '20px 28px', display:'flex', flexDirection:'column', gap:'20px' }}>

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

              <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                <div><label style={lLabel}>Client Company</label><input style={lightInput} value={form.client_company_name} placeholder="Company name" onChange={e => setForm(f => ({...f, client_company_name:e.target.value}))} /></div>
                <div><label style={lLabel}>Client Name</label><input style={lightInput} value={form.client_name} placeholder="Contact name" onChange={e => setForm(f => ({...f, client_name:e.target.value}))} /></div>
                <div><label style={lLabel}>Client Phone Number</label><input style={lightInput} value={form.client_number} placeholder="e.g. +60123456789" onChange={e => setForm(f => ({...f, client_number:e.target.value}))} /></div>
                <div>
                  <label style={lLabel}>Salesperson</label>
                  <select style={lightInput} value={form.salesperson} onChange={e => setForm(f => ({...f, salesperson:e.target.value}))}>
                    <option value="">— Select —</option>
                    {SALESPERSONS.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              </div>

              <div><label style={lLabel}>Scope of Work</label><textarea style={{...lightInput, resize:'none'}} rows={2} value={form.scope_of_work} placeholder="Describe scope…" onChange={e => setForm(f => ({...f, scope_of_work:e.target.value}))} /></div>
              <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                <div>
                  <label style={lLabel}>Start Date *</label>
                  <input type="date" style={lightInput} value={form.scheduled_date} onChange={e => setForm(f => ({...f, scheduled_date:e.target.value, end_date:f.end_date||e.target.value}))} />
                </div>
                <div>
                  <label style={lLabel}>End Date *</label>
                  <input type="date" style={lightInput} value={form.end_date} min={form.scheduled_date} onChange={e => setForm(f => ({...f, end_date:e.target.value}))} />
                </div>
              </div>

              {form.scheduled_date && form.end_date && form.scheduled_date === form.end_date && (
                <div>
                  <label style={lLabel}>Session (Same Day)</label>
                  <select style={lightInput} value={form.site_session} onChange={e => setForm(f => ({...f, site_session:e.target.value}))}>
                    <option value="">— Select Session —</option>
                    <option value="AM">AM (Morning)</option>
                    <option value="PM">PM (Afternoon)</option>
                    <option value="Night Work">Night Work</option>
                    <option value="Full Day">Full Day</option>
                  </select>
                </div>
              )}

              {form.site_type === 'site_scanning' && (() => {
                const isSameDay = form.scheduled_date && form.end_date && form.scheduled_date === form.end_date
                const diffDays = form.scheduled_date && form.end_date
                  ? Math.round((new Date(form.end_date) - new Date(form.scheduled_date)) / 86400000) + 1
                  : null
                const sameDayDuration = form.site_session === 'Full Day' ? 1 : 0.5
                const calcDuration = isSameDay ? sameDayDuration : diffDays
                return (
                  <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                    <div>
                      <label style={lLabel}>Site Duration (Days)</label>
                      <div style={{ ...lightInput, background:'#f8fafc', color:'#64748b' }}>
                        {calcDuration != null ? `${calcDuration} day${calcDuration !== 1 ? 's' : ''}${isSameDay ? ` (${form.site_session || 'half day'})` : ''}` : '—'}
                      </div>
                    </div>
                    <div><label style={lLabel}>Report Duration (Days)</label><input type="number" min="0" step="0.5" style={lightInput} value={form.report_duration_days} onChange={e => setForm(f => ({...f, report_duration_days:e.target.value}))} /></div>
                  </div>
                )
              })()}
              {form.site_type === 'site_visit' && <div style={{ padding:'12px 16px', borderRadius:'10px', fontSize:'12px', fontWeight:'600', color:'#0d9488', background:'#f0fdf4', border:'1px solid #6ee7b7' }}>Duration: Half Day (0.5) — fixed for site visits</div>}
              {form.site_type === 'meeting' && (
                <div><label style={lLabel}>Meeting Duration</label>
                  <select style={lightInput} value={form.site_duration_days} onChange={e => setForm(f => ({...f, site_duration_days:e.target.value}))}>
                    <option value="0.25">2 Hours</option><option value="0.5">Half Day</option><option value="1">Full Day</option>
                  </select>
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:form.site_type==='site_scanning' && !isMobile ? '1fr 1fr' : '1fr', gap:'12px' }}>
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

              {datesInRange(form.scheduled_date, form.end_date).length > 1 && (
                <div>
                  <label style={lLabel}>Crew Assignment</label>
                  <div style={{ display:'flex', gap:'8px' }}>
                    {[['same','Same crew every day'],['per_day','Different crew per day']].map(([val, label]) => (
                      <button
                        key={val} type="button"
                        onClick={() => setForm(f => ({ ...f, assign_mode: val }))}
                        style={{
                          flex:1, padding:'8px 10px', borderRadius:'8px', fontSize:'12px', fontWeight:'600', cursor:'pointer',
                          border: form.assign_mode===val ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                          background: form.assign_mode===val ? '#eff6ff' : 'white',
                          color: form.assign_mode===val ? '#1d4ed8' : '#64748b',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.assign_mode === 'per_day' && datesInRange(form.scheduled_date, form.end_date).length > 1 ? (
                <div style={{ display:'grid', gap:'12px' }}>
                  {datesInRange(form.scheduled_date, form.end_date).map((dateStr, i) => {
                    const day = form.daily_assignments[dateStr] || { pic_id:'', crew_ids:[] }
                    return (
                      <div key={dateStr} style={{ border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px' }}>
                        <p style={{ fontSize:'12px', fontWeight:'800', color:'#2563eb', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:'10px' }}>
                          Day {i+1} · {new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-MY', { weekday:'short', day:'numeric', month:'short' })}
                        </p>

                        <div style={{ marginBottom:'10px' }}>
                          <label style={lLabel}>{form.site_type==='meeting'?'Organizer':'PIC'}</label>
                          <select style={lightInput} value={day.pic_id} onChange={e => setDayPic(dateStr, e.target.value)}>
                            <option value="">— Select —</option>
                            {members.map(m => {
                              const leave = getMemberLeaveOnDate(leaves, m.id, dateStr)
                              return (
                                <option key={m.id} value={m.id} disabled={Boolean(leave)}>
                                  {m.full_name}{leave ? ` - On leave (${leave.leave_type})` : ''}
                                </option>
                              )
                            })}
                          </select>
                        </div>

                        <div>
                          <label style={{ ...lLabel, marginBottom:'8px' }}>{form.site_type==='meeting'?'Attendees':'Crew'}</label>
                          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                            {members.filter(m => m.id !== day.pic_id).map(m => {
                              const leave = getMemberLeaveOnDate(leaves, m.id, dateStr)
                              return (
                                <label key={m.id} style={{ display:'flex', alignItems:'center', gap:'10px', cursor: leave ? 'not-allowed' : 'pointer', opacity: leave ? 0.55 : 1 }}>
                                  <input type="checkbox" checked={day.crew_ids.includes(m.id)} disabled={Boolean(leave)} onChange={() => toggleDayCrew(dateStr, m.id)} style={{ width:'15px', height:'15px', accentColor:'#2563eb' }} />
                                  <span style={{ fontSize:'12px', color:'#0f172a' }}>
                                    {m.full_name}{leave ? ` - ${getLeaveSummary(leave)}` : ''}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <>
                  <div><label style={lLabel}>{form.site_type==='meeting'?'Organizer':'PIC'}</label>
                    <select style={lightInput} value={form.pic_id} onChange={e => {
                      const picId = e.target.value
                      setForm(f => ({ ...f, pic_id: picId, crew_ids: f.crew_ids.filter(id => id !== picId) }))
                    }}>
                      <option value="">— Select —</option>
                      {members.map(m => (
                        <option key={m.id} value={m.id} disabled={Boolean(unavailableMembers[m.id])}>
                          {m.full_name}{unavailableMembers[m.id] ? ` - On leave (${unavailableMembers[m.id].leave_type}, ${getLeaveSessionLabel(unavailableMembers[m.id].leave_session)})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div><label style={{ ...lLabel, marginBottom:'12px' }}>{form.site_type==='meeting'?'Attendees':'Crew'}</label>
                    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                      {members.filter(m => m.id !== form.pic_id).map(m => (
                        <label key={m.id} style={{ display:'flex', alignItems:'center', gap:'12px', cursor: unavailableMembers[m.id] ? 'not-allowed' : 'pointer', opacity: unavailableMembers[m.id] ? 0.55 : 1 }}>
                          <input type="checkbox" checked={form.crew_ids.includes(m.id)} disabled={Boolean(unavailableMembers[m.id])} onChange={() => toggleCrew(m.id)} style={{ width:'16px', height:'16px', accentColor:'#2563eb' }} />
                          <span style={{ fontSize:'13px', color:'#0f172a' }}>
                            {m.full_name}{unavailableMembers[m.id] ? ` - ${getLeaveSummary(unavailableMembers[m.id])}` : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div><label style={lLabel}>Notes</label><textarea style={{...lightInput, resize:'none'}} rows={3} value={form.notes} placeholder="Optional notes…" onChange={e => setForm(f => ({...f, notes:e.target.value}))} /></div>

              <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
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

              <div style={{ display:'flex', flexDirection:isMobile ? 'column' : 'row', gap:'12px', paddingTop:'4px', borderTop:'1px solid #f1f5f9' }}>
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
