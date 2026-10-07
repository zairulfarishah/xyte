import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  Pencil, Trash2, Search, ArrowUpRight, MapPin, MessageCircle, X, Camera,
  Calendar, Check, CheckCircle, SlidersHorizontal, MoreHorizontal, Copy,
  AlertTriangle, FileWarning, Filter, Plus, CheckSquare, Square, Layers, EyeOff, Eye,
} from 'lucide-react'
import { memberSchedule, notify, notifyMany, notifyScheduleChanges, siteRoleIds } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import PlaceSearchBox from '../components/PlaceSearchBox'
import LocationPicker from '../components/LazyLocationPicker'
import SitesViewSwitch from '../components/SitesViewSwitch'
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

const SORTS = [
  { value:'newest',  label:'Newest first'  },
  { value:'soonest', label:'Soonest first' },
  { value:'oldest',  label:'Oldest first'  },
  { value:'name',    label:'Name A–Z'      },
]
const REPORT_FILTERS = [
  { value:'pending',     label:'Pending'            },
  { value:'in_progress', label:'In progress'        },
  { value:'submitted',   label:'Awaiting approval'  },
  { value:'approved',    label:'Approved'           },
]
const BULK_STATUSES = ['upcoming','ongoing','completed','postponed','cancelled']
// A report is overdue this many days after the site's last day (plus its planned report time)
const REPORT_GRACE_DAYS = 3
const GROUP_ORDER = ['Today','This week','Later','Past']
const UNDO_MS = 6000

const DAY_MS = 86400000
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function dayDiff(from, to) {
  return Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY_MS)
}
function siteStart(site) { return String(site.scheduled_date || '').slice(0, 10) }
function siteEnd(site)   { return String(site.end_date || site.scheduled_date || '').slice(0, 10) }

// "6 Oct 2026", "6–8 Oct 2026", "28 Sep – 2 Oct 2026"
function formatRange(start, end) {
  if (!start) return '—'
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end || start}T00:00:00`)
  const full = d => d.toLocaleDateString('en-MY', { day:'numeric', month:'short', year:'numeric' })
  if (!end || end === start) return full(a)
  if (a.getFullYear() !== b.getFullYear()) return `${full(a)} – ${full(b)}`
  if (a.getMonth() !== b.getMonth()) return `${a.toLocaleDateString('en-MY', { day:'numeric', month:'short' })} – ${full(b)}`
  return `${a.getDate()}–${full(b)}`
}

// "Today", "Tomorrow", "In 3 days", "Day 2 of 4", "Yesterday", "5 days ago"
function relativeLabel(site, today) {
  const start = siteStart(site), end = siteEnd(site)
  if (!start) return null
  const toStart = dayDiff(today, start)
  const toEnd   = dayDiff(today, end)
  if (toStart <= 0 && toEnd >= 0) {
    const total = dayDiff(start, end) + 1
    return { text: total > 1 ? `Day ${1 - toStart} of ${total}` : 'Today', tone:'now' }
  }
  if (toStart === 1) return { text:'Tomorrow', tone:'soon' }
  if (toStart > 1)   return { text: toStart <= 30 ? `In ${toStart} days` : `In ${Math.round(toStart / 7)} wks`, tone: toStart <= 7 ? 'soon' : 'later' }
  if (toEnd === -1)  return { text:'Yesterday', tone:'past' }
  return { text: -toEnd <= 30 ? `${-toEnd} days ago` : `${Math.round(-toEnd / 7)} wks ago`, tone:'past' }
}

function timeGroup(site, today) {
  const toStart = dayDiff(today, siteStart(site))
  const toEnd   = dayDiff(today, siteEnd(site))
  if (toStart <= 0 && toEnd >= 0) return 'Today'
  if (toEnd < 0) return 'Past'
  return toStart <= 7 ? 'This week' : 'Later'
}

// Status that the calendar has overtaken: still "upcoming" after it started, or "ongoing" after it ended
function staleReason(site, today) {
  if (site.site_status === 'upcoming' && dayDiff(today, siteStart(site)) < 0) return 'Date passed — still upcoming'
  if (site.site_status === 'ongoing'  && dayDiff(today, siteEnd(site)) < 0)   return 'Ended — still ongoing'
  return null
}

function reportOverdueDays(site, today) {
  if (site.site_type !== 'site_scanning' || site.site_status !== 'completed') return 0
  if (!['pending','in_progress'].includes(site.report_status)) return 0
  const due = dayDiff(siteEnd(site), today) - Math.ceil(Number(site.report_duration_days) || 0) - REPORT_GRACE_DAYS
  return due > 0 ? due : 0
}

// Where the job is: Scheduled → On site → Report → Approved (no-report jobs: Scheduled → On site/Held → Done).
// cur is the step in progress; cur past the last step means everything is done.
function trackStage(site) {
  const noReport = site.report_status === 'not_applicable'
  const labels = noReport
    ? ['Scheduled', site.site_type === 'meeting' ? 'Held' : 'On site', 'Done']
    : ['Scheduled', 'On site', 'Report', 'Approved']
  let cur = 0
  if (site.site_status === 'ongoing') cur = 1
  else if (site.site_status === 'completed') {
    cur = noReport ? 3 : site.report_status === 'approved' ? 4 : site.report_status === 'submitted' ? 3 : 2
  }
  return { labels, cur }
}

// "Full day", "Half day · AM", "2 hours", "10 days"
function durationLabel(site) {
  const days = Number(site.site_duration_days) || 0
  if (days > 1) return `${days % 1 ? days : Math.round(days)} days`
  const base = days === 0.25 ? '2 hours' : days === 0.5 ? 'Half day' : 'Full day'
  return site.site_session && site.site_session !== 'Full Day' ? `${base} · ${site.site_session}` : base
}

// First two parts of the address — full one is on hover
function shortLocation(location) {
  return String(location || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 2).join(', ')
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


// Last loaded data, kept for the session so coming back to Sites shows the list
// straight away while a fresh copy loads in the background.
let sitesCache = null
// Last filter/search/page in the URL, so links back to /sites land on the same view
let lastSitesQuery = ''

export default function Sites() {
  const { fullName, isZairul, memberId } = useAuth()
  const { width, isMobile } = useViewport()
  const [sites, setSites]             = useState(() => sitesCache?.sites || [])
  const [members, setMembers]         = useState(() => sitesCache?.members || [])
  const [loading, setLoading]         = useState(!sitesCache)
  const [showForm, setShowForm]       = useState(false)
  const [editSite, setEditSite]       = useState(null)
  const [formTitle, setFormTitle]     = useState('')
  const [form, setForm]               = useState(EMPTY)
  const formInitial = useRef('')
  const [saving, setSaving]           = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [expandedCard, setExpandedCard] = useState(null)
  const [quickSaving, setQuickSaving]   = useState(null)
  const [draftStatus, setDraftStatus]   = useState(null)
  const [panelAnchor, setPanelAnchor]   = useState(null)
  const [leaves, setLeaves]             = useState(() => sitesCache?.leaves || [])
  const [waMenu, setWaMenu]             = useState(null)
  const [moreMenu, setMoreMenu]         = useState(null)
  const [showFilters, setShowFilters]   = useState(false)
  const [toasts, setToasts]             = useState([])
  const [selectMode, setSelectMode]     = useState(false)
  const [selected, setSelected]         = useState(() => new Set())
  const [bulkSaving, setBulkSaving]     = useState(false)
  const pendingDeletes = useRef(new Map())
  const photoInputRef = useRef(null)
  const searchRef = useRef(null)
  // Always three rows: columns follow the Sites.css grid breakpoints; one column on phones shows 8
  const columns = width >= 1600 ? 5 : width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 640 ? 2 : 1
  const perPage = columns === 1 ? 8 : columns * 3

  // ── View state lives in the URL (?tab=ongoing&q=ampang&page=2 …) ──
  const [params, setParams] = useSearchParams()
  const tab        = params.get('tab') || 'All'
  const search     = params.get('q') || ''
  const page       = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
  const mine       = params.get('mine') === '1'
  const attention  = params.get('attention') === '1'
  const typeFilter = params.get('type') || ''
  const repFilter  = params.get('report') || ''
  const spFilter   = params.get('sp') || ''
  const dateFrom   = params.get('from') || ''
  const dateTo     = params.get('to') || ''
  const grouped    = params.get('group') === '1'
  // Admin only: look at the hidden sites instead of the visible ones
  const showHidden = isZairul && params.get('hidden') === '1'
  const sort       = params.get('sort') || (tab === 'Upcoming' ? 'soonest' : 'newest')

  // Any change other than the page number goes back to page 1
  function setParam(updates, { replace = false } = {}) {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      Object.entries(updates).forEach(([k, v]) => {
        if (v === '' || v == null || v === false || (k === 'tab' && v === 'All') || (k === 'page' && v === 1)) next.delete(k)
        else next.set(k, v === true ? '1' : String(v))
      })
      if (!('page' in updates)) next.delete('page')
      return next
    }, { replace })
  }
  const setPage = p => setParam({ page: typeof p === 'function' ? p(page) : p })

  // Coming back to a bare /sites restores the last view; any query in the URL wins
  useEffect(() => {
    if (!params.toString() && lastSitesQuery) setParams(new URLSearchParams(lastSitesQuery), { replace:true })
  }, [])
  useEffect(() => { lastSitesQuery = params.toString() }, [params])

  // Keep the first card on screen in view when the column count changes
  const prevPerPage = useRef(perPage)
  useEffect(() => {
    if (prevPerPage.current === perPage) return
    const from = prevPerPage.current
    setParam({ page: Math.floor(((page - 1) * from) / perPage) + 1 }, { replace:true })
    prevPerPage.current = perPage
  }, [perPage])

  // '/' jumps to search, Esc closes the update panel and menus
  useEffect(() => {
    const onKey = e => {
      const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape') { setExpandedCard(null); setDraftStatus(null); setPanelAnchor(null); setMoreMenu(null); setWaMenu(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { fetchAll() }, [])

  // Leaving the page carries out any delete still waiting on its undo window
  useEffect(() => () => {
    pendingDeletes.current.forEach(({ timer, commit }) => { clearTimeout(timer); commit() })
  }, [])

  // Close the WhatsApp picker / more menu on any outside click
  useEffect(() => {
    if (!waMenu && !moreMenu) return
    const close = () => { setWaMenu(null); setMoreMenu(null) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [waMenu, moreMenu])

  function toast(msg, { tone = 'ok', action = null, ms = 4000 } = {}) {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, msg, tone, action }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ms)
    return id
  }
  const dismissToast = id => setToasts(t => t.filter(x => x.id !== id))
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
    setSites(sitesCache.sites.filter(x => !pendingDeletes.current.has(x.id)))
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
      toast(completionError, { tone:'err', ms:6000 })
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
      if (error) {
        setQuickSaving(null)
        toast(`Couldn't save: ${error.message}`, { tone:'err', ms:7000 })
        return
      }
      setSites(prev => prev.map(s => s.id === site.id ? { ...s, ...updates } : s))
      notifyStatusChange(site, updates)
      setQuickSaving(null)
      toast(`"${site.site_name}" updated`)
    }
    setExpandedCard(null); setDraftStatus(null); setPanelAnchor(null)
  }

  // PICs and crew of this site hear about it under separate notification settings
  // (deduped — a per-day site can list the same person on several days).
  // Not awaited: the save is done, nobody should wait on notifications.
  function notifyStatusChange(site, updates) {
    const { picIds, crewIds } = siteRoleIds(site)
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
  }

  // Set one status on every selected site. Completing needs a DO number or reason,
  // so sites without one are left as they are and counted as skipped.
  async function handleBulkStatus(status) {
    const targets = sites.filter(s => selected.has(s.id) && s.site_status !== status)
    const skipped = status === 'completed'
      ? targets.filter(s => {
          const meta = parseCompletionMeta(s.notes || '')
          return validateCompletionRequirement(status, meta.deliveryOrderNumber, meta.completionReason)
        })
      : []
    const ready = targets.filter(s => !skipped.includes(s))
    if (ready.length === 0) {
      toast(skipped.length ? `${skipped.length} site(s) need a DO number or reason before they can be completed — use Update on each.` : 'Nothing to change.', { tone: skipped.length ? 'err' : 'ok', ms:7000 })
      return
    }
    setBulkSaving(true)
    const { error } = await supabase.from('sites').update({ site_status: status }).in('id', ready.map(s => s.id))
    setBulkSaving(false)
    if (error) { toast(`Couldn't update: ${error.message}`, { tone:'err', ms:7000 }); return }
    const ids = new Set(ready.map(s => s.id))
    setSites(prev => prev.map(s => ids.has(s.id) ? { ...s, site_status: status } : s))
    ready.forEach(s => notifyStatusChange(s, { site_status: status }))
    toast(`${ready.length} site${ready.length > 1 ? 's' : ''} set to ${status}${skipped.length ? ` · ${skipped.length} skipped (no DO number or reason)` : ''}`, { tone: skipped.length ? 'warn' : 'ok', ms:6000 })
    setSelected(new Set()); setSelectMode(false)
  }

  function toggleSelected(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function startForm(nextForm, site, title) {
    formInitial.current = JSON.stringify(nextForm)
    setForm(nextForm); setEditSite(site); setFormTitle(title); setUploadError(null); setShowForm(true)
  }
  // Ask before throwing away edits (backdrop click, X, Cancel)
  function closeForm() {
    if (!saving && JSON.stringify(form) !== formInitial.current && !confirm('Discard your unsaved changes?')) return
    setShowForm(false)
  }

  function openAdd() { startForm(EMPTY, null, 'Add New Site') }
  // Same client, place, scope and team as an earlier site — just pick the new dates
  function openDuplicate(site) {
    const base = formFromSite(site)
    const { pic_id, crew_ids } = base.assign_mode === 'per_day'
      ? (() => {
          const p = sitePic(site), c = siteCrew(site)
          return { pic_id: p?.team_members?.id || '', crew_ids: c.map(x => x.team_members?.id).filter(id => id && id !== p?.team_members?.id) }
        })()
      : base
    startForm({
      ...base,
      scheduled_date:'', end_date:'', site_session:'',
      site_status:'upcoming', report_status:'pending',
      delivery_order_number:'', completion_reason:'',
      assign_mode:'same', daily_assignments:{}, pic_id, crew_ids: [...new Set(crew_ids)],
    }, null, `Duplicate · ${site.site_name}`)
  }
  function openEdit(site) { startForm(formFromSite(site), site, 'Edit Site') }
  function formFromSite(site) {
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
    return {
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
    }
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
      toast(editSite ? `"${form.site_name}" saved` : `"${form.site_name}" added`)
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

  // The card disappears straight away; the row is only deleted once the undo window closes
  function handleDelete(site) {
    setMoreMenu(null)
    setSites(prev => prev.filter(s => s.id !== site.id))
    const commit = async () => {
      pendingDeletes.current.delete(site.id)
      const { error } = await supabase.from('sites').delete().eq('id', site.id)
      if (error) {
        toast(`Couldn't delete "${site.site_name}": ${error.message}`, { tone:'err', ms:7000 })
        fetchAll()
      }
    }
    const toastId = toast(`Deleted "${site.site_name}"`, {
      ms: UNDO_MS,
      action: {
        label:'Undo',
        fn: () => {
          clearTimeout(pendingDeletes.current.get(site.id)?.timer)
          pendingDeletes.current.delete(site.id)
          setSites(prev => prev.some(s => s.id === site.id) ? prev : [...prev, site]
            .sort((a, b) => String(b.scheduled_date).localeCompare(String(a.scheduled_date))))
          dismissToast(toastId)
        },
      },
    })
    pendingDeletes.current.set(site.id, { timer: setTimeout(commit, UNDO_MS), commit })
  }

  // Admin hides a site from this page (any status), or brings it back
  async function handleHide(site, hide) {
    setMoreMenu(null)
    const { error } = await supabase.from('sites').update({ is_hidden: hide }).eq('id', site.id)
    if (error) { toast(`Couldn't ${hide ? 'hide' : 'unhide'}: ${error.message}`, { tone:'err', ms:7000 }); return }
    const patch = list => list.map(s => s.id === site.id ? { ...s, is_hidden: hide } : s)
    setSites(patch)
    if (sitesCache) sitesCache.sites = patch(sitesCache.sites)
    const toastId = toast(`${hide ? 'Hidden' : 'Unhid'} "${site.site_name}"`, {
      ms: UNDO_MS,
      action: { label:'Undo', fn: () => { dismissToast(toastId); handleHide(site, !hide) } },
    })
  }

  const today = todayStr()
  const needsAttention = s => !!staleReason(s, today) || reportOverdueDays(s, today) > 0
  const isMine = s => {
    if (!memberId) return false
    const { picIds, crewIds } = siteRoleIds(s)
    return picIds.includes(memberId) || crewIds.includes(memberId)
  }
  const doNumber = s => parseCompletionMeta(s.notes || '').deliveryOrderNumber

  // Everything except the status tab, so the tab counts follow the other filters
  const viewSites = sites.filter(s => !!s.is_hidden === showHidden)
  const hiddenCount = isZairul ? sites.filter(s => s.is_hidden).length : 0
  const baseFiltered = viewSites.filter(s => {
    if (mine && !isMine(s)) return false
    if (attention && !needsAttention(s)) return false
    if (typeFilter && s.site_type !== typeFilter) return false
    if (repFilter && s.report_status !== repFilter) return false
    if (spFilter && s.salesperson !== spFilter) return false
    if (dateFrom && siteEnd(s) < dateFrom) return false
    if (dateTo && siteStart(s) > dateTo) return false
    if (search) {
      const needle = search.toLowerCase()
      const people = (s.site_assignments || []).map(a => a.team_members?.full_name)
      const fields = [s.site_name, s.location, s.client_company_name, s.client_name, s.salesperson, s.scope_of_work, doNumber(s), ...people]
      if (!fields.some(field => String(field || '').toLowerCase().includes(needle))) return false
    }
    return true
  })

  const counts = TABS.reduce((acc, t) => {
    acc[t] = t === 'All' ? baseFiltered.length : baseFiltered.filter(s => s.site_status === t.toLowerCase()).length
    return acc
  }, {})

  // Soonest: what's running or coming next first (nearest date up), then the past (most recent first)
  const sorters = {
    newest:  (a, b) => siteStart(b).localeCompare(siteStart(a)),
    oldest:  (a, b) => siteStart(a).localeCompare(siteStart(b)),
    name:    (a, b) => String(a.site_name || '').localeCompare(String(b.site_name || '')),
    soonest: (a, b) => {
      const pa = siteEnd(a) < today, pb = siteEnd(b) < today
      if (pa !== pb) return pa ? 1 : -1
      return pa ? siteEnd(b).localeCompare(siteEnd(a)) : siteStart(a).localeCompare(siteStart(b))
    },
  }
  const filtered = baseFiltered
    .filter(s => tab==='All' || s.site_status===tab.toLowerCase())
    .sort(sorters[sort] || sorters.newest)

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated  = filtered.slice((page-1)*perPage, page*perPage)

  // A page past the end (fewer results after a filter or a delete) snaps back to the last one
  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) setParam({ page: totalPages }, { replace:true })
  }, [loading, page, totalPages])

  const filterCount = [mine, attention, typeFilter, repFilter, spFilter, dateFrom, dateTo].filter(Boolean).length
  const hasAnyFilter = filterCount > 0 || !!search || tab !== 'All'
  const clearFilters = () => setParam({ tab:'', q:'', mine:'', attention:'', type:'', report:'', sp:'', from:'', to:'' })
  const attentionCount = viewSites.filter(needsAttention).length
  const myCount = memberId ? viewSites.filter(isMine).length : 0


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

  // Skeleton cards in the real grid, so nothing jumps when the data lands
  if (loading) return (
    <div className="ss">
      <main className="ss-main">
        <div className="ss-top">
          <div className="ss-head">
            <div>
              <div className="ss-eyebrow">{new Date().toLocaleDateString('en-MY', { weekday:'long', day:'numeric', month:'long' })}</div>
              <h1>Sites</h1>
              <p className="ss-sub">Loading sites…</p>
            </div>
          </div>
          <div className="ss-bar"><div className="ss-tabs ss-sk-tabs"><span /><span /><span /><span /></div></div>
        </div>
        <div className="ss-grid">
          {Array.from({ length: perPage }, (_, i) => (
            <div key={i} className="ss-card ss-sk">
              <div className="ss-spacer" />
              <div className="ss-panel-g">
                <i style={{ width:'30%', height:'10px' }} /><i style={{ width:'75%', height:'18px', marginTop:'8px' }} />
                <i style={{ width:'50%', marginTop:'8px' }} /><i style={{ width:'85%', marginTop:'14px' }} />
                <i style={{ height:'34px', marginTop:'16px' }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )

  const closePanel = () => { setExpandedCard(null); setDraftStatus(null); setPanelAnchor(null) }
  const ongoingCount  = viewSites.filter(s => s.site_status === 'ongoing').length
  const upcomingCount = viewSites.filter(s => s.site_status === 'upcoming').length
  const openUpdate = site => {
    const completionMeta = parseCompletionMeta(site.notes || '')
    setPanelAnchor({ open: true })
    setExpandedCard(site.id)
    setDraftStatus({
      site_status: site.site_status,
      report_status: site.report_status,
      delivery_order_number: completionMeta.deliveryOrderNumber,
      completion_reason: completionMeta.completionReason,
    })
  }
  // Time-group headings only make sense when cards are in date order
  const showGroups = grouped && sort !== 'name'
  const groupedPage = showGroups
    ? paginated.reduce((acc, site) => {
        const g = timeGroup(site, today)
        const last = acc[acc.length - 1]
        if (last && last.group === g) last.sites.push(site); else acc.push({ group: g, sites: [site] })
        return acc
      }, [])
    : [{ group: null, sites: paginated }]
  const salespeople = [...new Set([...SALESPERSONS, ...sites.map(s => s.salesperson).filter(Boolean)])]

  return (
    <div className="ss">
      <main className="ss-main">

        {/* ── HEADER (the dark band grows with whatever is in here) ── */}
        <div className="ss-top">
        <div className="ss-head">
          <div>
            <div className="ss-eyebrow">{new Date().toLocaleDateString('en-MY', { weekday:'long', day:'numeric', month:'long' })}</div>
            <h1>Sites</h1>
            <p className="ss-sub">
              Manage and track all site activities · <b>{ongoingCount}</b> ongoing · <b>{upcomingCount}</b> upcoming
              {attentionCount > 0 && (
                <> · <button className={`ss-attn${attention ? ' on' : ''}`} onClick={() => setParam({ attention: !attention })}>
                  <AlertTriangle size={12} /> {attentionCount} need attention
                </button></>
              )}
            </p>
            <SitesViewSwitch style={{ marginTop:'12px' }} />
          </div>
          <label className="ss-search">
            <Search size={15} strokeWidth={2.2} />
            <input
              ref={searchRef}
              placeholder="Search sites, clients, people, DO…"
              value={search}
              onChange={e => setParam({ q: e.target.value }, { replace:true })}
            />
            {search
              ? <button className="clr" title="Clear search" onClick={() => setParam({ q:'' })}><X size={13} /></button>
              : <kbd>/</kbd>}
          </label>
        </div>

        {/* ── STATUS TABS + TOOLBAR ── */}
        <div className="ss-bar">
          <div className="ss-tabs">
            {TABS.map(t => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setParam({ tab: t })}>
                {t}<i>{counts[t]}</i>
              </button>
            ))}
          </div>
          <div className="ss-tools">
            {memberId && (
              <button className={`ss-tool${mine ? ' on' : ''}`} onClick={() => setParam({ mine: !mine })} title="Only sites where you are PIC or crew">
                My sites<i>{myCount}</i>
              </button>
            )}
            <button className={`ss-tool${showFilters || filterCount - (mine ? 1 : 0) > 0 ? ' on' : ''}`} onClick={() => setShowFilters(v => !v)}>
              <Filter size={13} /> Filters{filterCount - (mine ? 1 : 0) > 0 && <i>{filterCount - (mine ? 1 : 0)}</i>}
            </button>
            <select className="ss-tool sel" value={sort} onChange={e => setParam({ sort: e.target.value })} title="Sort">
              {SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className={`ss-tool${grouped ? ' on' : ''}`} onClick={() => setParam({ group: !grouped }, { replace:true })} title="Group by Today / This week / Later / Past">
              <Layers size={13} /> Group
            </button>
            <button className={`ss-tool${selectMode ? ' on' : ''}`} onClick={() => { setSelectMode(v => !v); setSelected(new Set()) }} title="Select several sites to update at once">
              <CheckSquare size={13} /> Select
            </button>
            {isZairul && (hiddenCount > 0 || showHidden) && (
              <button className={`ss-tool${showHidden ? ' on' : ''}`} onClick={() => setParam({ hidden: !showHidden })} title="Sites you've hidden from this page">
                <EyeOff size={13} /> Hidden<i>{hiddenCount}</i>
              </button>
            )}
          </div>
        </div>
        </div>

        {/* ── MORE FILTERS ── */}
        {showFilters && (
          <div className="ss-filters">
            <label>Type
              <select value={typeFilter} onChange={e => setParam({ type: e.target.value })}>
                <option value="">All types</option>
                {SITE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>Report
              <select value={repFilter} onChange={e => setParam({ report: e.target.value })}>
                <option value="">Any report status</option>
                {REPORT_FILTERS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label>Salesperson
              <select value={spFilter} onChange={e => setParam({ sp: e.target.value })}>
                <option value="">Anyone</option>
                {salespeople.map(sp => <option key={sp} value={sp}>{sp}</option>)}
              </select>
            </label>
            <label>From
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setParam({ from: e.target.value })} />
            </label>
            <label>To
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setParam({ to: e.target.value })} />
            </label>
            <label className="chk">
              <input type="checkbox" checked={attention} onChange={e => setParam({ attention: e.target.checked })} />
              Needs attention only
            </label>
            {hasAnyFilter && <button className="ss-clear" onClick={clearFilters}>Clear all</button>}
          </div>
        )}

        {/* ── CARDS ── */}
        {paginated.length === 0 ? (
          <div className="ss-empty">
            <MapPin size={28} style={{ opacity:0.35 }} />
            {showHidden && viewSites.length === 0 ? (<>
              <span>No hidden sites</span>
              <button className="ss-empty-btn" onClick={() => setParam({ hidden:'' })}>Back to sites</button>
            </>) : sites.length === 0 ? (<>
              <span>No sites yet</span>
              <button className="ss-empty-btn" onClick={openAdd}><Plus size={14} /> Add your first site</button>
            </>) : (<>
              <span>No sites match{search ? <> “<b>{search}</b>”</> : ''} with these filters</span>
              <button className="ss-empty-btn" onClick={clearFilters}>Clear filters</button>
            </>)}
          </div>
        ) : groupedPage.map(({ group, sites: groupSites }, gi) => (
          <section key={group || gi}>
            {group && <h2 className={`ss-group g-${GROUP_ORDER.indexOf(group)}`}>{group}<i>{groupSites.length}</i></h2>}
          <div className="ss-grid">
            {groupSites.map(site => {
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
              const doNo = completionMeta.deliveryOrderNumber
              const rel = relativeLabel(site, today)
              const stale = staleReason(site, today)
              const overdue = reportOverdueDays(site, today)
              const isSel = selected.has(site.id)
              const moreOpen = moreMenu === site.id
              const { labels: stepLabels, cur: stepCur } = trackStage(site)
              const halted = site.site_status === 'cancelled' || site.site_status === 'postponed'
              const stepColor = overdue > 0 ? '#dc2626' : stale ? '#d97706' : site.site_status === 'completed' ? '#2563eb' : statusTone.text
              // PIC first (ringed), then crew — each person once
              const team = [pic, ...crew].filter(a => a?.team_members)
              const picShort = pic?.team_members?.full_name?.split(' ').slice(0, 2).join(' ')
              const stopFix = e => { e.stopPropagation(); if (!selectMode) openUpdate(site) }

              return (
                <div key={site.id}
                  className={`ss-card${isExpanded ? ' on' : ''}${selectMode ? ' selecting' : ''}${isSel ? ' sel' : ''}`}
                  role="link" tabIndex={0} aria-label={`Open ${getSiteTitle(site)}`}
                  onClick={e => {
                    if (selectMode) { toggleSelected(site.id); return }
                    if (e.target.closest('button, a, .ss-wa-menu')) return
                    navigate(`/sites/${site.id}`)
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/sites/${site.id}`) }}
                  style={{ '--tg':CARD_GRADIENTS[site.site_type] || CARD_GRADIENTS.site_scanning, '--glow':CARD_GLOW[site.site_type] || CARD_GLOW.site_scanning, '--tc':typeMeta.color, '--sc2':stepColor }}>

                  {/* ── Full-bleed photo ── */}
                  <div className="ss-photo">
                    <img src={site.site_photo_url || getSiteHeaderImage(site.site_type)} alt="" loading="lazy" />
                  </div>

                  <div className="ss-top-row">
                    {selectMode && <span className="ss-check">{isSel ? <CheckSquare size={18} /> : <Square size={18} />}</span>}
                    <span className="ss-glass" title={site.location}><MapPin size={11} strokeWidth={2.4} /><span>{shortLocation(site.location)}</span></span>
                    <span className={`ss-status${site.site_status === 'ongoing' ? ' live' : ''}`} style={{ '--sc':statusTone.text }}>{site.site_status}</span>
                  </div>
                  {!selectMode && <span className="ss-open"><ArrowUpRight size={13} strokeWidth={2.4} /> Open</span>}
                  <div className="ss-spacer" />

                  {/* ── Progress tracker (dark glass on the photo) ── */}
                  <div className={`ss-track${halted ? ' halt' : ''}`}>
                    <div className="ss-steps">
                      {stepLabels.map((label, i) => (
                        <div key={label} className={`ss-step${i < stepCur ? ' done' : i === stepCur ? ` cur${site.site_status === 'ongoing' ? ' live' : ''}` : ''}`}>
                          <i>{i < stepCur && <Check size={11} strokeWidth={3.2} />}</i>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="ss-cap">
                      {overdue > 0 ? (
                        <button className="late" onClick={stopFix}><FileWarning size={13} /> Report overdue · {overdue}d <b>Fix →</b></button>
                      ) : stale ? (
                        <button className="stl" onClick={stopFix} title={stale}><AlertTriangle size={13} /> {stale.split(' — ')[0]} <b>Fix →</b></button>
                      ) : halted ? (
                        <span>{site.site_status === 'cancelled' ? 'Cancelled' : 'Postponed'}</span>
                      ) : site.report_status === 'not_applicable' ? (
                        <span>{site.site_status === 'completed' ? 'Done' : site.site_status === 'ongoing' ? `On site · ${rel?.text || ''}` : 'No report needed'}</span>
                      ) : (
                        <span><i className="dot" style={{ background:REPORT_TONE[site.report_status]?.dot }} />Report {site.report_status?.replace(/_/g, ' ')}</span>
                      )}
                      <span className={`do${doNo ? '' : ' na'}`}>{doNo ? `DO ${doNo}` : 'No DO yet'}</span>
                    </div>
                  </div>

                  {/* ── Glass panel ── */}
                  <div className="ss-panel-g">
                    <div className="ss-eb">{typeMeta.label}</div>
                    <h3 className="ss-name" title={getSiteTitle(site)}>{site.site_name}</h3>
                    {site.client_company_name && <p className="ss-client">{site.client_company_name}</p>}
                    <div className="ss-meta">
                      <Calendar size={13} />
                      <span title={formatRange(siteStart(site), siteEnd(site))}>{formatRange(siteStart(site), siteEnd(site))}</span>
                      <i>·</i><span>{durationLabel(site)}</span>
                      {rel && <><i>·</i><span className={`r ${rel.tone}`}>{rel.text}</span></>}
                    </div>

                    <div className="ss-foot">
                      <div className="ss-team" title={pic ? `${site.site_type === 'meeting' ? 'Organizer' : 'PIC'}: ${pic.team_members?.full_name}${perDay ? ' (daily crew)' : ''}${crew.length ? ` · Crew: ${crew.map(c => c.team_members?.full_name).join(', ')}` : ''}` : 'No PIC assigned'}>
                        {team.length > 0 ? (<>
                          <div className="ss-stack">
                            {team.slice(0, 3).map((a, ti) => (
                              <MemberAvatar key={a.team_members.id || ti} member={a.team_members}
                                index={Math.max(0, members.findIndex(m => m.id === a.team_members.id))}
                                className={a === pic ? 'pic' : ''} />
                            ))}
                            {team.length > 3 && <span className="more">+{team.length - 3}</span>}
                          </div>
                          <b className={pic ? '' : 'na'}>{pic ? picShort : 'No PIC'}</b>
                          {crew.length > 0 && <small>+{crew.length}</small>}
                        </>) : (<>
                          <span className="ss-av none" />
                          <b className="na">No team yet</b>
                        </>)}
                      </div>

                      <button className={`ss-ib up${isExpanded ? ' open' : ''}`} title="Update status"
                        onClick={e => { e.stopPropagation(); if (isExpanded) closePanel(); else openUpdate(site) }}>
                        <Pencil size={14} />
                      </button>
                      {waTargets.length > 0 && (
                        <div className="ss-wa">
                          <button className={`ss-ib wa${waOpen ? ' open' : ''}`}
                            title={waTargets.length === 1 ? `WhatsApp ${waTargets[0].member.full_name}` : 'WhatsApp the team'}
                            onClick={e => {
                              e.stopPropagation()
                              if (waTargets.length === 1) { sendBrief(waTargets[0]); return }
                              setMoreMenu(null)
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
                      <div className="ss-wa">
                        <button className={`ss-ib more${moreOpen ? ' open' : ''}`} title="More actions"
                          onClick={e => { e.stopPropagation(); setWaMenu(null); setMoreMenu(moreOpen ? null : site.id) }}>
                          <MoreHorizontal size={15} />
                        </button>
                        {moreOpen && (
                          <div className="ss-wa-menu ss-more-menu" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setMoreMenu(null); navigate(`/sites/${site.id}`) }}><ArrowUpRight size={14} /><span>Open site</span></button>
                            <button onClick={() => { setMoreMenu(null); openEdit(site) }}><SlidersHorizontal size={14} /><span>Edit site</span></button>
                            <button onClick={() => { setMoreMenu(null); openDuplicate(site) }}><Copy size={14} /><span>Duplicate</span></button>
                            {isZairul && (site.is_hidden
                              ? <button onClick={() => handleHide(site, false)}><Eye size={14} /><span>Unhide</span></button>
                              : <button onClick={() => handleHide(site, true)}><EyeOff size={14} /><span>Hide from Sites</span></button>)}
                            <hr />
                            <button className="danger" onClick={() => handleDelete(site)}><Trash2 size={14} /><span>Delete</span></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </section>
        ))}

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

      {/* ── BULK UPDATE BAR ── */}
      {selectMode && (
        <div className="ss-bulk">
          <div className="cnt">
            <b>{selected.size}</b> selected
            <button onClick={() => setSelected(new Set(paginated.map(s => s.id)))}>Select page</button>
            {selected.size > 0 && <button onClick={() => setSelected(new Set())}>Clear</button>}
          </div>
          <div className="acts">
            <span>Set status</span>
            {BULK_STATUSES.map(s => (
              <button key={s} disabled={!selected.size || bulkSaving}
                style={{ '--oc':STATUS_TONE[s].dot, '--ot':STATUS_TONE[s].text, '--ob':STATUS_TONE[s].bg }}
                onClick={() => handleBulkStatus(s)}>{s}</button>
            ))}
          </div>
          <button className="x" title="Done" onClick={() => { setSelectMode(false); setSelected(new Set()) }}><X size={16} /></button>
        </div>
      )}

      {/* ── TOASTS ── */}
      <div className={`ss-toasts${selectMode ? ' up' : ''}`}>
        {toasts.map(t => (
          <div key={t.id} className={`ss-toast ${t.tone}`}>
            {t.tone === 'err' || t.tone === 'warn' ? <AlertTriangle size={15} /> : <CheckCircle size={15} />}
            <span>{t.msg}</span>
            {t.action && <button className="act" onClick={t.action.fn}>{t.action.label}</button>}
            <button className="x" onClick={() => dismissToast(t.id)}><X size={13} /></button>
          </div>
        ))}
      </div>

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
          onClick={e => e.target===e.currentTarget && closeForm()}>
          <div style={{ width:'100%', maxWidth:'672px', maxHeight:'92vh', borderRadius:'20px', background:'white', boxShadow:'0 24px 64px rgba(15,23,42,.18)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:isMobile ? '16px 18px' : '20px 28px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <h3 style={{ margin:0, fontSize:'17px', fontWeight:'800', color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{formTitle || (editSite ? 'Edit Site' : 'Add New Site')}</h3>
              <button onClick={closeForm} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={18} /></button>
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
                <button onClick={closeForm} style={{ flex:1, padding:'11px', borderRadius:'10px', fontSize:'14px', fontWeight:'600', color:'#0f172a', cursor:'pointer', fontFamily:'inherit', background:'#f1f5f9', border:'1px solid #e2e8f0' }}>
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
