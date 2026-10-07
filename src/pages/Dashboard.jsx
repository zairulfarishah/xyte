import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { Camera } from 'lucide-react'
import { calculateWorkload } from '../utils/workload'
import { memberSchedule, notify, notifyAssignments, notifyMany, notifyScheduleChanges, siteRoleIds } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import PlaceSearchBox from '../components/PlaceSearchBox'
import { mergeCompletionMeta, parseCompletionMeta, validateCompletionRequirement } from '../utils/completionMeta'
import { useViewport } from '../utils/useViewport'
import { fetchTeamLeaves, getLeaveSessionLabel, getLeaveSummary, getMemberLeaveOnDate } from '../utils/teamLeaves'
import {
  assignmentMemberId, crewForDate, getSiteDates, isMissingPic, memberRoleOnSite, picForDate, representativeDate,
} from '../utils/siteDays'
import DashboardBento from './DashboardBento'
import LocationPicker from '../components/LazyLocationPicker'

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

const SALESPERSONS = ['GH Tan', 'Chong Jie Yan', 'Jasmin', 'Darren', 'Wendy', 'Zairul', 'Reekha', 'Ryan']

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
  end_date: '',
  site_session: '',
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


function buildMemberRecord(member, sites) {
  const assignments = sites.flatMap(site =>
    (site.site_assignments || [])
      .filter(a => a.member_id === member.id)
      .map(a => ({ ...a, site }))
  )

  // A rotating crew gives one row per day — count sites, not rows
  const roleBySite = new Map()
  assignments.forEach(a => {
    const role = memberRoleOnSite(a.site, member.id)
    if (role) roleBySite.set(a.site.id, role)
  })
  const roles = [...roleBySite.values()]
  const picCount = roles.filter(role => role === 'PIC').length
  const crewCount = roles.filter(role => role !== 'PIC').length

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

function getTrendText(value, kind = 'default') {
  if (kind === 'alert') return value === 0 ? 'No backlog' : `${value} needs action`
  if (kind === 'sites') return value > 0 ? `+${value} this week` : 'No change this week'
  if (kind === 'upcoming') return value > 1 ? `${value - 1} near deadline` : 'Next site scheduled'
  if (kind === 'team') return value > 0 ? 'Active team' : 'No members'
  return value > 0 ? 'Healthy activity' : 'All clear'
}

export default function Dashboard() {
  const { fullName, firstName, isZairul, memberId } = useAuth()
  const { isMobile } = useViewport()
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
  const [leaves, setLeaves] = useState([])

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

  useEffect(() => {
    const refreshLeaves = () => fetchAll()
    window.addEventListener('xyte:leaves-updated', refreshLeaves)
    return () => window.removeEventListener('xyte:leaves-updated', refreshLeaves)
  }, [])

  async function fetchAll() {
    setLoading(true)

    const { data: memberData } = await supabase
      .from('team_members')
      .select('*')
      .order('full_name')

    const [{ data: allSites }, leaveData] = await Promise.all([
      supabase
        .from('sites')
        .select('*, site_assignments(assignment_role, member_id, work_date, team_members(id, full_name, avatar_url))')
        .eq('is_hidden', false)
        .order('scheduled_date', { ascending: true }),
      fetchTeamLeaves().catch(() => []),
    ])

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
    setLeaves(leaveData || [])
    setLoading(false)
  }

  function getUnavailableAssignments(memberIds, date) {
    return memberIds
      .map(memberId => {
        const member = members.find(item => item.id === memberId)
        const leave = getMemberLeaveOnDate(leaves, memberId, date)
        return leave && member ? { member, leave } : null
      })
      .filter(Boolean)
  }

  function validateLeaveSelections(memberIds, date) {
    const conflicts = getUnavailableAssignments(memberIds, date)
    if (conflicts.length === 0) return null
    const summary = conflicts
      .map(({ member, leave }) => `${member.full_name} (${leave.leave_type}, ${getLeaveSessionLabel(leave.leave_session)})`)
      .join(', ')
    return `These team members are on leave for ${date}: ${summary}`
  }

  async function handleAddSave() {
    if (!form.site_name || !form.location || !form.scheduled_date) return
    const selectedIds = [form.pic_id, ...form.crew_ids].filter(Boolean)
    const leaveError = validateLeaveSelections(selectedIds, form.scheduled_date)
    if (leaveError) {
      alert(leaveError)
      return
    }
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
      end_date: form.end_date || form.scheduled_date || null,
      site_session: (form.scheduled_date && form.end_date && form.scheduled_date === form.end_date) ? (form.site_session || null) : null,
      site_status: form.site_status,
      site_duration_days: isSiteVisit ? 0.5 : (() => {
        if (form.site_type === 'site_scanning') {
          const isSameDay = form.scheduled_date && form.end_date && form.scheduled_date === form.end_date
          if (isSameDay) return form.site_session === 'Full Day' ? 1 : 0.5
          if (form.scheduled_date && form.end_date) return Math.round((new Date(form.end_date) - new Date(form.scheduled_date)) / 86400000) + 1
        }
        return parseFloat(form.site_duration_days) || 1
      })(),
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

      notifyAssignments({
        siteName: form.site_name,
        scheduledDate: form.scheduled_date,
        picId: form.pic_id,
        crewIds: form.crew_ids,
        actor: fullName,
      })
    }

    notify(`Added new site: ${form.site_name}`, fullName, null, 'general')
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

    notify(`Updated ${updateSite.site_name} → ${updateSite.site_status}`, fullName, null, 'general')

    const picIds = siteRoleIds(original).picIds.filter(id => id !== memberId)
    if (original?.site_status !== updateSite.site_status) {
      notifyMany(`Site "${updateSite.site_name}" status changed to ${updateSite.site_status} (you are PIC)`, fullName, picIds, 'pic_update')
    }

    if (original?.report_status !== updateSite.report_status) {
      if (updateSite.report_status === 'submitted')
        notify(`Report for "${updateSite.site_name}" has been submitted — ready for review`, 'System', null, 'general')
      if (updateSite.report_status === 'approved') {
        notify(`Report for "${updateSite.site_name}" has been approved by Zairul`, 'System', null, 'general')
        notifyMany(`Report for "${updateSite.site_name}" has been approved (you are PIC)`, fullName, picIds, 'pic_update')
      }
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

    // On a rotating crew, seed from the day the site is on now rather than
    // collecting every day's rows into one list
    const assignments = targetSite.site_assignments || []
    const day = representativeDate(targetSite)
    const currentPic = assignmentMemberId(picForDate(assignments, day)) || ''
    const currentCrew = [...new Set(crewForDate(assignments, day).map(assignmentMemberId).filter(Boolean))]

    setQuickAssign({
      siteId: targetSite.id,
      picId: currentPic,
      crewIds: currentCrew,
    })
  }

  async function handleQuickAssignSave() {
    if (!quickAssign?.siteId) return
    const assignedSite = sites.find(site => site.id === quickAssign.siteId)
    const leaveError = validateLeaveSelections(
      [quickAssign.picId, ...quickAssign.crewIds].filter(Boolean),
      assignedSite?.scheduled_date
    )
    if (leaveError) {
      alert(leaveError)
      return
    }
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

    // Only people whose own schedule changed hear about it
    const siteDates = getSiteDates(targetSite)
    notifyScheduleChanges({
      siteName: targetSite?.site_name || 'site',
      before: memberSchedule(targetSite?.site_assignments || [], siteDates),
      after: memberSchedule(assignments, siteDates),
      actor: fullName,
      skipId: memberId,
    }).catch(err => console.warn('Notification failed:', err.message))

    notify(`Updated assignments for ${targetSite?.site_name || 'site'}`, fullName, null, 'general')
    setQuickAssignSaving(false)
    setQuickAssign(null)
    fetchAll()
  }

  const totalSites = sites.length
  const activeSites = sites.filter(site => site.site_status === 'ongoing').length
  const completedSites = sites.filter(site => site.site_status === 'completed').length
  const upcomingSitesCount = sites.filter(site => site.site_status === 'upcoming').length
  const pendingReports = sites.filter(site => ['pending', 'in_progress'].includes(site.report_status) && site.site_type === 'site_scanning')
  // Any day of a multi-day site without a PIC counts as unassigned
  const noPicSites = sites.filter(site => isMissingPic(site) && !['completed', 'cancelled'].includes(site.site_status))
  const soonSites = sites.filter(site => {
    const diff = (new Date(site.scheduled_date) - new Date()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 2 && site.site_status === 'upcoming'
  })
  const addFormUnavailable = members
    .reduce((acc, member) => {
      const leave = getMemberLeaveOnDate(leaves, member.id, form.scheduled_date)
      if (leave) acc[member.id] = leave
      return acc
    }, {})

  const quickAssignSite = sites.find(site => site.id === quickAssign?.siteId)
  const quickAssignUnavailable = members
    .reduce((acc, member) => {
      const leave = getMemberLeaveOnDate(leaves, member.id, quickAssignSite?.scheduled_date)
      if (leave) acc[member.id] = leave
      return acc
    }, {})

  const assignableSites = useMemo(
    () => sites.filter(site => !['completed', 'cancelled'].includes(site.site_status)),
    [sites]
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#64748b' }}>Loading...</div>
      </div>
    )
  }

  const kpis = [
    { label: 'Total Sites',     value: totalSites,            trend: getTrendText(upcoming.length, 'sites'),        icon: '▦', color: '#2563eb', gradient: 'linear-gradient(135deg,#60a5fa,#2563eb)' },
    { label: 'Upcoming',        value: upcomingSitesCount,    trend: getTrendText(upcomingSitesCount, 'upcoming'),  icon: '▣', color: '#d97706', gradient: 'linear-gradient(135deg,#fbbf24,#f97316)' },
    { label: 'Ongoing',         value: activeSites,           trend: activeSites === 0 ? 'All clear' : `${activeSites} active now`, icon: '◉', color: '#ea580c', gradient: 'linear-gradient(135deg,#fb923c,#dc2626)' },
    { label: 'Completed',       value: completedSites,        trend: completedSites > 0 ? `${Math.round((completedSites / Math.max(totalSites, 1)) * 100)}% done` : 'None yet', icon: '✓', color: '#16a34a', gradient: 'linear-gradient(135deg,#4ade80,#16a34a)' },
    { label: 'Team Members',    value: members.length,        trend: getTrendText(members.length, 'team'),          icon: '◈', color: '#7c3aed', gradient: 'linear-gradient(135deg,#a78bfa,#6d28d9)' },
    { label: 'Pending Reports', value: pendingReports.length, trend: getTrendText(pendingReports.length, 'alert'),  icon: '▤', color: '#dc2626', gradient: 'linear-gradient(135deg,#f87171,#dc2626)' },
  ]

  function openStatusUpdate(site) {
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
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef3f8', color: '#0b1220' }}>
      <div>
        <DashboardBento
          sites={sites}
          members={members}
          leaves={leaves}
          kpis={kpis}
          firstName={firstName}
          memberId={memberId}
          isZairul={isZairul}
          onAssign={openQuickAssign}
          onUpdate={openStatusUpdate}
        />

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
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Client Phone Number</label>
                  <input
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                    value={form.client_number}
                    placeholder="e.g. +60123456789"
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

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Start Date *</label>
                  <input
                    type="date"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                    value={form.scheduled_date}
                    onChange={event => setForm(f => ({ ...f, scheduled_date: event.target.value, end_date: f.end_date || event.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>End Date *</label>
                  <input
                    type="date"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                    value={form.end_date}
                    min={form.scheduled_date}
                    onChange={event => setForm(f => ({ ...f, end_date: event.target.value }))}
                  />
                </div>
              </div>

              {form.scheduled_date && form.end_date && form.scheduled_date === form.end_date && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Session (Same Day)</label>
                  <select
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a' }}
                    value={form.site_session}
                    onChange={event => setForm(f => ({ ...f, site_session: event.target.value }))}
                  >
                    <option value="">— Select Session —</option>
                    <option value="AM">AM (Morning)</option>
                    <option value="PM">PM (Afternoon)</option>
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
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Site Duration (Days)</label>
                      <div style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#f8fafc', color: '#64748b', boxSizing: 'border-box' }}>
                        {calcDuration != null ? `${calcDuration} day${calcDuration !== 1 ? 's' : ''}${isSameDay ? ` (${form.site_session || 'half day'})` : ''}` : '—'}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Report Duration (Days)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box' }}
                        value={form.report_duration_days}
                        onChange={event => setForm(f => ({ ...f, report_duration_days: event.target.value }))}
                      />
                    </div>
                  </div>
                )
              })()}

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
                  {members.map(member => {
                    const leave = addFormUnavailable[member.id]
                    return (
                      <option key={member.id} value={member.id} disabled={Boolean(leave)}>
                        {member.full_name}{leave ? ` - ${getLeaveSummary(leave)}` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '8px' }}>{form.site_type === 'meeting' ? 'Attendees' : 'Crew'}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {members.map(member => {
                    const leave = addFormUnavailable[member.id]
                    return (
                    <label key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: leave ? 'not-allowed' : 'pointer', opacity: leave ? 0.55 : 1 }}>
                      <input
                        type="checkbox"
                        checked={form.crew_ids.includes(member.id)}
                        disabled={Boolean(leave)}
                        onChange={() => setForm(f => ({
                          ...f,
                          crew_ids: f.crew_ids.includes(member.id)
                            ? f.crew_ids.filter(id => id !== member.id)
                            : [...f.crew_ids, member.id],
                        }))}
                        style={{ accentColor: '#2563eb', width: '15px', height: '15px' }}
                      />
                      <span style={{ fontSize: '13px', color: '#0f172a' }}>
                        {member.full_name}{leave ? ` - ${getLeaveSummary(leave)}` : ''}
                      </span>
                    </label>
                  )})}
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

            {quickAssignSite?.site_assignments?.some(a => a.work_date) && (
              <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#92400e', fontWeight: '600' }}>
                This site has different crew per day — saving here will replace that with one crew for every day. Use the Sites form to keep per-day assignments.
              </div>
            )}

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
                    <option key={member.id} value={member.id} disabled={Boolean(quickAssignUnavailable[member.id])}>
                      {member.full_name} · {member.workload.workload_percentage}% load{quickAssignUnavailable[member.id] ? ` · ${getLeaveSummary(quickAssignUnavailable[member.id])}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '8px' }}>Crew</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '190px', overflowY: 'auto', paddingRight: '4px' }}>
                  {members.map(member => (
                    <label key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '9px 10px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', cursor: quickAssignUnavailable[member.id] ? 'not-allowed' : 'pointer', opacity: quickAssignUnavailable[member.id] ? 0.55 : 1 }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{member.full_name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          {member.role} · {member.workload.workload_percentage}% load{quickAssignUnavailable[member.id] ? ` · ${getLeaveSummary(quickAssignUnavailable[member.id])}` : ''}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={quickAssign.crewIds.includes(member.id)}
                        disabled={Boolean(quickAssignUnavailable[member.id])}
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
