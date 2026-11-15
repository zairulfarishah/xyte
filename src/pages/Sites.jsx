import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  Pencil, Trash2, Search, ArrowUpRight, MapPin, MessageCircle, X,
  Calendar, Check, CheckCircle, SlidersHorizontal, MoreHorizontal, Copy,
  AlertTriangle, FileWarning, Filter, Plus, CheckSquare, Square, Layers, EyeOff, Eye,
} from 'lucide-react'
import { notifyMany, siteRoleIds } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import SiteForm from '../components/siteForm/SiteForm'
import { EMPTY_SITE_FORM, duplicateForm, formFromSite } from '../components/siteForm/siteFormModel'
import SitesViewSwitch from '../components/SitesViewSwitch'
import { getSiteHeaderImage } from '../utils/siteHeader'
import { mergeCompletionMeta, parseCompletionMeta, validateCompletionRequirement } from '../utils/completionMeta'
import { fetchTeamLeaves } from '../utils/teamLeaves'
import { useViewport } from '../utils/useViewport'
import { buildAssignmentMessage, buildSitesBrief, openWhatsApp, openWhatsAppShare, shortNameOf } from '../utils/whatsapp'
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

// Who works each day, in short names — only for sites that run a different crew per day
function dayRosterOf(site) {
  const assignments = site.site_assignments || []
  if (!hasDailyCrew(assignments)) return []
  return getSiteDates(site).map(date => ({
    date,
    picName: shortNameOf(picForDate(assignments, date)?.team_members),
    crewNames: crewForDate(assignments, date).map(c => shortNameOf(c.team_members)).filter(Boolean),
  }))
}

// One site's part of the multi-site WhatsApp brief
function siteBriefEntry(site) {
  return {
    site,
    picName: shortNameOf(sitePic(site)?.team_members),
    crewNames: [...new Set(siteCrew(site).map(c => shortNameOf(c.team_members)).filter(Boolean))],
    dayRoster: dayRosterOf(site),
  }
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
      {member?.avatar_url ? <img src={member.avatar_url} alt={name} loading="lazy" decoding="async" /> : initials}
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
  const [formInit, setFormInit]       = useState(EMPTY_SITE_FORM)
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
  const [brief, setBrief]               = useState(null)   // { text, people } for the multi-site WhatsApp brief
  const pendingDeletes = useRef(new Map())
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

  // One WhatsApp message for every selected site, earliest first. Anyone assigned
  // to one of them with a phone number can be sent it directly (PICs first).
  function openBrief() {
    const picked = sites.filter(s => selected.has(s.id)).sort((a, b) => siteStart(a).localeCompare(siteStart(b)))
    if (!picked.length) return
    const people = new Map()
    picked.forEach(s => uniqueAssignments(s.site_assignments || []).forEach(a => {
      const m = a.team_members
      if (!m?.phone) return
      people.set(m.id, { member: m, pic: people.get(m.id)?.pic || isPic(a) })
    }))
    setBrief({
      text: buildSitesBrief(picked.map(siteBriefEntry)),
      people: [...people.values()].sort((a, b) => b.pic - a.pic || a.member.full_name.localeCompare(b.member.full_name)),
    })
  }

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(brief.text)
      toast('Copied. Paste it into any chat')
    } catch {
      toast('Could not copy. Select the text and copy it instead', { tone:'err' })
    }
  }

  function toggleSelected(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function startForm(initial, site, title) {
    setFormInit(initial); setEditSite(site); setFormTitle(title); setShowForm(true)
  }
  function openAdd() { startForm(EMPTY_SITE_FORM, null, 'Add New Site') }
  function openDuplicate(site) { startForm(duplicateForm(site), null, `Duplicate · ${site.site_name}`) }
  function openEdit(site) { startForm(formFromSite(site), site, 'Edit Site') }
  function handleFormSaved({ name }) {
    toast(editSite ? `"${name}" saved` : `"${name}" added`)
    setShowForm(false); setEditSite(null); fetchAll()
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
              const dayRoster = dayRosterOf(site)
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
          <button className="wa" disabled={!selected.size} onClick={openBrief} title="One WhatsApp message with every selected site">
            <MessageCircle size={14} /> WhatsApp
          </button>
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

      {/* ── WHATSAPP BRIEF ── */}
      {brief && (
        <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:3200, padding:'16px', background:'rgba(0,0,0,0.4)' }}
          onClick={e => e.target===e.currentTarget && setBrief(null)}>
          <div style={{ width:'100%', maxWidth:'560px', maxHeight:'92vh', borderRadius:'20px', background:'white', boxShadow:'0 24px 64px rgba(15,23,42,.18)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:isMobile ? '16px 18px' : '20px 28px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <h3 style={{ margin:0, fontSize:'17px', fontWeight:'800', color:'#0f172a' }}>WhatsApp brief</h3>
              <button onClick={() => setBrief(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={18} /></button>
            </div>
            <div style={{ overflowY:'auto', padding:isMobile ? '16px 18px' : '20px 28px', display:'flex', flexDirection:'column', gap:'16px' }}>
              <div>
                <label style={lLabel}>Message. Edit anything before sending</label>
                <textarea style={{ ...lightInput, minHeight:'260px', resize:'vertical', lineHeight:1.5, fontFamily:'inherit' }}
                  value={brief.text} onChange={e => setBrief(b => ({ ...b, text:e.target.value }))} />
              </div>
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                <button onClick={() => openWhatsAppShare(brief.text)}
                  style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 16px', borderRadius:'10px', border:'none', background:'#16a34a', color:'white', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>
                  <MessageCircle size={14} /> Send to a chat or group
                </button>
                <button onClick={copyBrief}
                  style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 16px', borderRadius:'10px', border:'1px solid #e2e8f0', background:'white', color:'#0f172a', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>
                  <Copy size={14} /> Copy
                </button>
              </div>
              {brief.people.length > 0 && (
                <div>
                  <label style={lLabel}>Or send straight to someone on these sites</label>
                  <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                    {brief.people.map(({ member, pic }) => (
                      <button key={member.id} onClick={() => openWhatsApp(member.phone, brief.text)}
                        style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'999px', border:'1px solid #bbf7d0', background:'#f0fdf4', color:'#166534', fontSize:'12px', fontWeight:'650', cursor:'pointer' }}>
                        {shortNameOf(member)}{pic && <em style={{ fontStyle:'normal', fontSize:'9px', fontWeight:'800', color:'#92400e' }}>PIC</em>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <SiteForm
          key={formTitle + (editSite?.id || '')}
          title={formTitle || (editSite ? 'Edit Site' : 'Add New Site')}
          initial={formInit}
          editSite={editSite}
          members={members}
          leaves={leaves}
          sites={sites}
          fullName={fullName}
          memberId={memberId}
          onClose={() => setShowForm(false)}
          onSaved={handleFormSaved}
        />
      )}

    </div>
  )
}
