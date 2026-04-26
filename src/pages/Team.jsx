import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { Search, MapPin, Calendar, TrendingUp, Users, Briefcase, Activity, Clock, FileText, Radar, Camera } from 'lucide-react'
import { calculateWorkload } from '../utils/workload'

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626']

const ACTIVITY_TEMPLATES = [
  { action: 'Updated site status', color: '#38bdf8' },
  { action: 'Confirmed field coverage', color: '#22c55e' },
  { action: 'Progressed reporting', color: '#f59e0b' },
  { action: 'Rebalanced assignments', color: '#a855f7' },
]

const SITE_TYPE_LABELS = {
  site_scanning: 'Site Scanning',
  site_visit: 'Site Visit',
  meeting: 'Meeting',
}

const SITE_TYPE_COLORS = {
  site_scanning: { bg: 'rgba(59, 130, 246, 0.16)', text: '#bfdbfe', border: 'rgba(96, 165, 250, 0.35)' },
  site_visit: { bg: 'rgba(34, 197, 94, 0.16)', text: '#bbf7d0', border: 'rgba(74, 222, 128, 0.35)' },
  meeting: { bg: 'rgba(168, 85, 247, 0.16)', text: '#e9d5ff', border: 'rgba(192, 132, 252, 0.35)' },
}

function Avatar({ name, size = 40, index = 0, avatarUrl = null, onUpload = null }) {
  const initials = name?.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?'
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onUpload}
      onMouseEnter={() => onUpload && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, position: 'relative', overflow: 'hidden',
        background: avatarUrl ? '#0f172a' : AVATAR_COLORS[index % AVATAR_COLORS.length],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontWeight: '700', fontSize: size * 0.35,
        border: '2px solid rgba(255,255,255,0.82)',
        boxShadow: '0 14px 30px rgba(15, 23, 42, 0.18)',
        cursor: onUpload ? 'pointer' : 'default',
      }}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials
      }
      {onUpload && hovered && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Camera size={Math.max(size * 0.32, 12)} color="white" />
        </div>
      )}
    </div>
  )
}

function normalizeRole(role) {
  return String(role || '').toLowerCase()
}

function getRoleTone(role) {
  if (normalizeRole(role) === 'pic') {
    return { bg: 'rgba(59, 130, 246, 0.16)', text: '#bfdbfe', border: 'rgba(96, 165, 250, 0.35)' }
  }

  return { bg: 'rgba(148, 163, 184, 0.14)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.22)' }
}

function getSiteTypeTone(siteType) {
  return SITE_TYPE_COLORS[String(siteType || '').toLowerCase()] || SITE_TYPE_COLORS.site_scanning
}

function formatDate(date) {
  if (!date) return '-'

  return new Date(date).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getDayLabel(date) {
  if (!date) return '-'

  return new Date(date).toLocaleDateString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function timeAgo(index) {
  const times = ['2h ago', '5h ago', '1d ago', '2d ago', '4d ago']
  return times[index % times.length]
}

function buildMemberRecord(member, sites) {
  const assignments = sites.flatMap(site =>
    (site.site_assignments || [])
      .filter(assignment => assignment.member_id === member.id)
      .map(assignment => ({ ...assignment, site }))
  )

  const picCount = assignments.filter(assignment => normalizeRole(assignment.assignment_role) === 'pic').length
  const crewCount = assignments.filter(assignment => normalizeRole(assignment.assignment_role) === 'crew').length

  return {
    ...member,
    assignments,
    pic_count: picCount,
    crew_count: crewCount,
    workload: calculateWorkload(assignments),
  }
}

function getMemberRole(memberId, assignments) {
  return assignments?.find(assignment => assignment.member_id === memberId)?.assignment_role || '-'
}

export default function Team() {
  const { isZairul } = useAuth()
  const [members, setMembers] = useState([])
  const [allSites, setAllSites] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploadingFor, setUploadingFor] = useState(null)
  const avatarInputRef = useRef(null)

  function triggerAvatarUpload(memberId) {
    setUploadingFor(memberId)
    avatarInputRef.current?.click()
  }

  async function handleAvatarFileChange(e) {
    const file = e.target.files[0]
    // Capture memberId immediately — uploadingFor may become stale during await
    const memberId = uploadingFor
    if (!file || !memberId) return

    try {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        setUploadingFor(null)
        return
      }

      // Unique filename per upload avoids CDN serving the cached old file
      const ext = file.name.split('.').pop()
      const fileName = `${memberId}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('team-avatars')
        .upload(fileName, file)

      if (uploadError) {
        alert('Failed to upload avatar: ' + uploadError.message)
        setUploadingFor(null)
        return
      }

      const { data: urlData } = supabase.storage
        .from('team-avatars')
        .getPublicUrl(fileName)

      if (!urlData?.publicUrl) {
        setUploadingFor(null)
        return
      }

      const avatarUrl = urlData.publicUrl

      const { error: updateError } = await supabase
        .from('team_members')
        .update({ avatar_url: avatarUrl })
        .eq('id', memberId)

      if (updateError) {
        alert('Failed to save avatar: ' + updateError.message)
        setUploadingFor(null)
        return
      }

      setMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, avatar_url: avatarUrl } : m
      ))

      setUploadingFor(null)
      e.target.value = ''

    } catch (err) {
      alert('An unexpected error occurred: ' + err.message)
      setUploadingFor(null)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)

    const { data: memberData } = await supabase
      .from('team_members')
      .select('*')
      .order('full_name')

    const { data: siteData } = await supabase
      .from('sites')
      .select('*, site_assignments(assignment_role, member_id, team_members(full_name))')
      .order('scheduled_date', { ascending: true })

    const sites = siteData || []
    const memberRecords = (memberData || []).map(member => buildMemberRecord(member, sites))

    setMembers(memberRecords)
    setAllSites(sites)
    setSelectedId(currentId => {
      if (memberRecords.some(member => member.id === currentId)) return currentId
      return memberRecords[0]?.id || null
    })
    setLoading(false)
  }

  const filteredMembers = useMemo(
    () => members.filter(member => !search || member.full_name.toLowerCase().includes(search.toLowerCase())),
    [members, search]
  )

  const selected = useMemo(
    () =>
      filteredMembers.find(member => member.id === selectedId) ||
      members.find(member => member.id === selectedId) ||
      filteredMembers[0] ||
      members[0] ||
      null,
    [filteredMembers, members, selectedId]
  )

  const selectedIndex = members.findIndex(member => member.id === selected?.id)

  const selectedSites = useMemo(
    () => (
      selected
        ? allSites.filter(site => site.site_assignments?.some(assignment => assignment.member_id === selected.id))
        : []
    ),
    [allSites, selected]
  )

  const activeSites = useMemo(
    () => selectedSites.filter(site =>
      ['ongoing', 'report_pending'].includes(String(site.site_status || '').toLowerCase()) ||
      ['pending', 'in_progress', 'submitted', 'report_pending'].includes(String(site.report_status || '').toLowerCase())
    ),
    [selectedSites]
  )

  const upcomingSites = useMemo(
    () => selectedSites
      .filter(site => ['upcoming', 'ongoing'].includes(String(site.site_status || '').toLowerCase()))
      .slice(0, 5),
    [selectedSites]
  )

  const completedSites = selectedSites.filter(site => String(site.site_status || '').toLowerCase() === 'completed')
  const reportQueue = selectedSites.filter(site => ['pending', 'in_progress', 'submitted', 'report_pending'].includes(String(site.report_status || '').toLowerCase()))

  const workloadStatus = selected?.workload?.status_colors
  const progressBarWidth = selected ? Math.min(selected.workload.workload_percentage, 100) : 0

  const avgWorkload = members.length > 0
    ? Math.round(members.reduce((sum, member) => sum + member.workload.workload_percentage, 0) / members.length)
    : 0
  const availableCount = members.filter(member => member.workload.status === 'Available').length
  const busyCount = members.filter(member => ['Busy', 'Overloaded'].includes(member.workload.status)).length
  const picLeads = members.filter(member => member.pic_count > 0).length

  const topLoadMembers = [...members]
    .sort((a, b) => b.workload.workload_percentage - a.workload.workload_percentage)
    .slice(0, 4)

  const teamRadar = members
    .filter(member => member.assignments.length > 0)
    .slice(0, 6)

  const activity = selected
    ? selectedSites.slice(0, 4).map((site, index) => ({
        ...ACTIVITY_TEMPLATES[index % ACTIVITY_TEMPLATES.length],
        site: site.site_name,
        time: timeAgo(index),
      }))
    : []

  // Smart insight derived from live data
  const overloaded = members.filter(m => m.workload.status === 'Overloaded')
  const busy = members.filter(m => m.workload.status === 'Busy')
  const topLoader = topLoadMembers[0]
  const pendingReports = allSites.filter(s => ['pending','in_progress'].includes(s.report_status))
  const submittedReports = allSites.filter(s => s.report_status === 'submitted')
  const ongoingSites = allSites.filter(s => s.site_status === 'ongoing')
  const upcomingSitesList = allSites.filter(s => s.site_status === 'upcoming')
  const unassigned = allSites.filter(s => !s.site_assignments || s.site_assignments.length === 0)

  function getInsight() {
    if (overloaded.length > 0) {
      const names = overloaded.map(m => m.full_name.split(' ')[0]).join(' and ')
      return {
        label: 'Staffing Risk',
        color: '#ef4444',
        dot: '#ef4444',
        headline: `${names} ${overloaded.length === 1 ? 'is' : 'are'} overloaded right now.`,
        body: `With ${overloaded.length} member${overloaded.length > 1 ? 's' : ''} above capacity, new site assignments should be redistributed to avoid delivery slippage. ${availableCount} member${availableCount !== 1 ? 's are' : ' is'} available to absorb the load.`,
      }
    }
    if (submittedReports.length > 0) {
      return {
        label: 'Pending Review',
        color: '#f59e0b',
        dot: '#f59e0b',
        headline: `${submittedReports.length} report${submittedReports.length > 1 ? 's have' : ' has'} been submitted and awaiting approval.`,
        body: `${submittedReports.map(s => s.site_name).slice(0,2).join(' and ')}${submittedReports.length > 2 ? ` and ${submittedReports.length - 2} more` : ''} — review and approve to keep the pipeline moving.`,
      }
    }
    if (busy.length >= 2) {
      return {
        label: 'High Load',
        color: '#f97316',
        dot: '#f97316',
        headline: `${busy.length} members are running at high capacity.`,
        body: `Average team workload is at ${avgWorkload}%. ${topLoader ? `${topLoader.full_name.split(' ')[0]} leads at ${topLoader.workload.workload_percentage}%.` : ''} Monitor closely before adding new assignments this week.`,
      }
    }
    if (pendingReports.length > 0) {
      return {
        label: 'Report Pressure',
        color: '#a855f7',
        dot: '#a855f7',
        headline: `${pendingReports.length} site report${pendingReports.length > 1 ? 's are' : ' is'} still in progress or pending.`,
        body: `Ongoing field work is generating report backlog. ${ongoingSites.length > 0 ? `${ongoingSites.length} site${ongoingSites.length > 1 ? 's are' : ' is'} still active in the field.` : ''} Prioritise submission before new sites begin.`,
      }
    }
    if (unassigned.length > 0) {
      return {
        label: 'Unassigned Sites',
        color: '#38bdf8',
        dot: '#38bdf8',
        headline: `${unassigned.length} site${unassigned.length > 1 ? 's have' : ' has'} no team assigned yet.`,
        body: `Assign a PIC and crew before the scheduled date to avoid last-minute gaps. ${availableCount} member${availableCount !== 1 ? 's are' : ' is'} currently available.`,
      }
    }
    if (upcomingSitesList.length > 0) {
      return {
        label: 'On Track',
        color: '#22c55e',
        dot: '#22c55e',
        headline: `Team is healthy — ${upcomingSitesList.length} upcoming site${upcomingSitesList.length > 1 ? 's' : ''} ahead.`,
        body: `All ${members.length} members are within normal capacity at ${avgWorkload}% average workload. ${availableCount} ${availableCount === 1 ? 'person is' : 'people are'} fully available for new assignments.`,
      }
    }
    return {
      label: 'All Clear',
      color: '#22c55e',
      dot: '#22c55e',
      headline: `No active pressure detected across the team.`,
      body: `All ${members.length} members are within healthy workload limits. Average capacity sits at ${avgWorkload}%. Good time to plan ahead for upcoming site cycles.`,
    }
  }

  const insight = getInsight()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#08111f' }}>
        <div style={{ color: '#94a3b8' }}>Loading team...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top left, #13315c 0%, #0b1220 38%, #060912 100%)' }}>
      <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFileChange} />
      <div style={{ maxWidth: '1540px', margin: '0 auto', padding: '26px 30px 36px' }}>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '28px',
            padding: '24px 26px',
            marginBottom: '24px',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(15,23,42,0.88) 44%, rgba(37,99,235,0.26) 100%)',
            border: '1px solid rgba(148,163,184,0.16)',
            boxShadow: '0 24px 60px rgba(2, 6, 23, 0.45)',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 85% 18%, rgba(56,189,248,0.22), transparent 26%), radial-gradient(circle at 70% 100%, rgba(37,99,235,0.20), transparent 35%)' }} />

          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 500px', gap: '24px', alignItems: 'center' }}>
            <div style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderRadius: '999px', background: 'rgba(15, 23, 42, 0.58)', border: '1px solid rgba(148,163,184,0.18)', color: '#93c5fd', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  <Radar size={14} />
                  Team Operations
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '999px', background: `${insight.color}18`, border: `1px solid ${insight.color}44`, fontSize: '11px', fontWeight: '700', color: insight.color }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: insight.color }} />
                  {insight.label}
                </div>
              </div>
              <h1 style={{ marginTop: '14px', color: 'white', fontSize: '24px', lineHeight: 1.2, maxWidth: '700px', fontWeight: '700' }}>
                {insight.headline}
              </h1>
              <p style={{ marginTop: '8px', color: '#94a3b8', fontSize: '14px', maxWidth: '660px', lineHeight: 1.6 }}>
                {insight.body}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              {[
                { label: 'Team Size', sub: 'Active members', value: members.length, icon: Users, accent: '#38bdf8' },
                { label: 'Available', sub: 'Ready for assignment', value: availableCount, icon: Activity, accent: '#22c55e' },
                { label: 'At Risk', sub: 'Busy or overloaded', value: busyCount, icon: Briefcase, accent: '#f97316' },
                { label: 'Lead PICs', sub: 'Members owning sites', value: picLeads, icon: TrendingUp, accent: '#a855f7' },
              ].map(({ label, sub, value, icon: Icon, accent }) => (
                <div
                  key={label}
                  style={{
                    padding: '15px 16px',
                    borderRadius: '20px',
                    background: 'rgba(15, 23, 42, 0.62)',
                    border: '1px solid rgba(148,163,184,0.14)',
                    backdropFilter: 'blur(10px)',
                    minHeight: '112px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <p style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '700' }}>{label}</p>
                      <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{sub}</p>
                    </div>
                    <div style={{ width: '42px', height: '42px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}22`, border: `1px solid ${accent}44` }}>
                      <Icon size={18} color={accent} />
                    </div>
                  </div>
                  <p style={{ color: 'white', fontSize: '27px', fontWeight: '800', lineHeight: 1 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) 280px', gap: '16px', alignItems: 'start' }}>
          <div
            style={{
              position: 'sticky',
              top: '18px',
              background: 'rgba(8, 15, 28, 0.88)',
              borderRadius: '24px',
              border: '1px solid rgba(148,163,184,0.12)',
              overflow: 'hidden',
              boxShadow: '0 18px 40px rgba(2, 6, 23, 0.26)',
            }}
          >
              <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                <p style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: '700' }}>Team Members</p>
                <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Search and switch between individual workload views.</p>
                <div style={{ position: 'relative', marginTop: '14px' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  placeholder="Search member..."
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.14)',
                    fontSize: '13px',
                    outline: 'none',
                    color: '#e2e8f0',
                    background: 'rgba(15,23,42,0.86)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ maxHeight: '72vh', overflowY: 'auto', padding: '10px' }}>
              {filteredMembers.map((member, index) => {
                const isSelected = selected?.id === member.id
                const colors = member.workload.status_colors

                return (
                  <div
                    key={member.id}
                    onClick={() => setSelectedId(member.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '13px',
                      cursor: 'pointer',
                      borderRadius: '18px',
                      marginBottom: '8px',
                      background: isSelected ? 'linear-gradient(135deg, rgba(30,64,175,0.34), rgba(15,23,42,0.92))' : 'rgba(15,23,42,0.72)',
                      border: `1px solid ${isSelected ? 'rgba(96,165,250,0.42)' : 'rgba(148,163,184,0.08)'}`,
                      boxShadow: isSelected ? '0 16px 36px rgba(37, 99, 235, 0.18)' : 'none',
                    }}
                  >
                    <Avatar name={member.full_name} size={42} index={index} avatarUrl={member.avatar_url} onUpload={isZairul ? () => triggerAvatarUpload(member.id) : null} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.full_name}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.role}</p>
                      <div style={{ height: '6px', background: 'rgba(148,163,184,0.14)', borderRadius: '999px', overflow: 'hidden', marginTop: '10px' }}>
                        <div style={{ height: '100%', width: `${Math.min(member.workload.workload_percentage, 100)}%`, background: colors.bar, borderRadius: '999px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <span style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap' }}>{member.workload.status}</span>
                      <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: '700' }}>{member.workload.workload_percentage}%</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '12px 16px 15px', borderTop: '1px solid rgba(148,163,184,0.08)' }}>
              <p style={{ fontSize: '11px', color: '#64748b' }}>Showing {filteredMembers.length} of {members.length} members</p>
            </div>
          </div>

          {selected && (
            <div style={{ display: 'grid', gap: '16px', minWidth: 0 }}>
              <div
                style={{
                  background: 'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(8,15,28,0.94) 100%)',
                  borderRadius: '28px',
                  border: '1px solid rgba(148,163,184,0.12)',
                  padding: '22px',
                  boxShadow: '0 20px 44px rgba(2, 6, 23, 0.3)',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(240px, 0.92fr)', gap: '16px', alignItems: 'stretch' }}>
                  <div
                    style={{
                      padding: '20px',
                      borderRadius: '24px',
                      background: 'linear-gradient(135deg, rgba(30,64,175,0.28) 0%, rgba(15,23,42,0.78) 72%)',
                      border: '1px solid rgba(96,165,250,0.18)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <Avatar name={selected.full_name} size={68} index={selectedIndex} avatarUrl={selected.avatar_url} onUpload={isZairul ? () => triggerAvatarUpload(selected.id) : null} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <h2 style={{ fontSize: '23px', fontWeight: '800', color: 'white' }}>{selected.full_name}</h2>
                            <span style={{ background: workloadStatus.bg, color: workloadStatus.text, border: `1px solid ${workloadStatus.border}`, padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700' }}>{selected.workload.status}</span>
                          </div>
                          <p style={{ color: '#cbd5e1', fontSize: '14px' }}>{selected.role}</p>
                          <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
                            {selected.full_name.toLowerCase().replace(/\s+/g, '.')}@xyte.com
                          </p>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginTop: '20px' }}>
                      {[
                        { label: 'PIC Lead', sub: 'Sites owned', value: selected.pic_count, color: '#60a5fa', bg: 'rgba(37,99,235,0.18)' },
                        { label: 'Crew', sub: 'Supporting assignments', value: selected.crew_count, color: '#c084fc', bg: 'rgba(168,85,247,0.16)' },
                        { label: 'Reports', sub: 'Pending or in flow', value: reportQueue.length, color: '#34d399', bg: 'rgba(16,185,129,0.16)' },
                      ].map(({ label, sub, value, color, bg }) => (
                        <div key={label} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: '20px', padding: '15px' }}>
                          <p style={{ color, fontSize: '27px', fontWeight: '800', lineHeight: 1 }}>{value}</p>
                          <p style={{ color: 'white', fontSize: '13px', fontWeight: '700', marginTop: '8px' }}>{label}</p>
                          <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>{sub}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '20px',
                      borderRadius: '24px',
                      background: 'rgba(15,23,42,0.78)',
                      border: '1px solid rgba(148,163,184,0.12)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <p style={{ color: 'white', fontSize: '14px', fontWeight: '700' }}>Capacity Meter</p>
                      <span style={{ color: '#e2e8f0', fontSize: '26px', fontWeight: '800', lineHeight: 1 }}>{selected.workload.workload_percentage}%</span>
                    </div>

                    <div style={{ height: '14px', background: 'rgba(148,163,184,0.12)', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' }}>
                      <div style={{ height: '100%', width: `${progressBarWidth}%`, background: workloadStatus.bar, borderRadius: '999px', transition: 'width 0.5s ease' }} />
                    </div>

                    <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
                      {selected.workload.workload_percentage}% of weekly capacity is already committed across live site work and report delivery.
                    </p>

                    <div style={{ marginTop: '16px', display: 'grid', gap: '10px' }}>
                      {[
                        { dot: '#22c55e', label: 'Available', desc: '0-50% weekly allocation' },
                        { dot: '#eab308', label: 'Normal', desc: '51-80% active load' },
                        { dot: '#f97316', label: 'Busy', desc: '81-100% close to limit' },
                        { dot: '#ef4444', label: 'Overloaded', desc: 'Above 100% needs rebalance' },
                      ].map(({ dot, label, desc }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: dot, flexShrink: 0 }} />
                          <div>
                            <p style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: '600' }}>{label}</p>
                            <p style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(240px, 0.95fr)', gap: '16px' }}>
                <div
                  style={{
                    background: 'rgba(8, 15, 28, 0.92)',
                    borderRadius: '24px',
                    border: '1px solid rgba(148,163,184,0.12)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(148,163,184,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <p style={{ color: 'white', fontSize: '14px', fontWeight: '700' }}>Assignment Board</p>
                      <p style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>Live and upcoming work for the selected member.</p>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#93c5fd', fontSize: '11px', fontWeight: '700', padding: '6px 10px', borderRadius: '999px', background: 'rgba(37,99,235,0.14)', border: '1px solid rgba(96,165,250,0.22)' }}>
                      <Clock size={13} />
                      {upcomingSites.length} scheduled
                    </div>
                  </div>

                  <div style={{ padding: '14px' }}>
                    {upcomingSites.length === 0 ? (
                      <p style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>No scheduled assignments yet.</p>
                    ) : upcomingSites.map(site => {
                      const role = getMemberRole(selected.id, site.site_assignments)
                      const roleTone = getRoleTone(role)
                      const typeTone = getSiteTypeTone(site.site_type)

                      return (
                        <div
                          key={site.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '86px minmax(0, 1fr) auto',
                            gap: '14px',
                            alignItems: 'center',
                            padding: '13px',
                            borderRadius: '20px',
                            background: 'linear-gradient(135deg, rgba(15,23,42,0.84), rgba(15,23,42,0.64))',
                            border: '1px solid rgba(148,163,184,0.10)',
                            marginBottom: '10px',
                          }}
                        >
                          <div style={{ padding: '11px 10px', borderRadius: '16px', background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(96,165,250,0.16)', textAlign: 'center' }}>
                            <p style={{ color: '#93c5fd', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.08em' }}>Next</p>
                            <p style={{ color: 'white', fontSize: '13px', fontWeight: '700', marginTop: '5px' }}>{getDayLabel(site.scheduled_date)}</p>
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <p style={{ color: 'white', fontSize: '14px', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.site_name}</p>
                              <span style={{ background: typeTone.bg, color: typeTone.text, border: `1px solid ${typeTone.border}`, borderRadius: '999px', padding: '2px 8px', fontSize: '10px', fontWeight: '700' }}>
                                {SITE_TYPE_LABELS[String(site.site_type || '').toLowerCase()] || 'Site'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', color: '#94a3b8', minWidth: 0 }}>
                              <MapPin size={13} />
                              <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.location || 'Location unavailable'}</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                            <span style={{ background: roleTone.bg, color: roleTone.text, border: `1px solid ${roleTone.border}`, padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: '700' }}>{role}</span>
                            <span style={{ color: '#64748b', fontSize: '11px' }}>{formatDate(site.scheduled_date)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '16px' }}>
                  <div
                    style={{
                      background: 'rgba(8, 15, 28, 0.92)',
                      borderRadius: '24px',
                      border: '1px solid rgba(148,163,184,0.12)',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                      <p style={{ color: 'white', fontSize: '14px', fontWeight: '700' }}>Recent Activity</p>
                    </div>
                    <div style={{ padding: '16px 18px' }}>
                      {activity.length === 0 ? (
                        <p style={{ padding: '12px 0', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>No recent activity.</p>
                      ) : activity.map((item, index) => (
                        <div key={index} style={{ display: 'flex', gap: '12px', marginBottom: index === activity.length - 1 ? '0' : '16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: item.color, marginTop: '4px' }} />
                            {index < activity.length - 1 && <div style={{ width: '1px', flex: 1, background: 'rgba(148,163,184,0.16)', marginTop: '5px' }} />}
                          </div>
                          <div>
                            <p style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: '700' }}>{item.action}</p>
                            <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>{item.site}</p>
                            <p style={{ color: '#64748b', fontSize: '10px', marginTop: '3px' }}>{item.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'rgba(8, 15, 28, 0.92)',
                      borderRadius: '24px',
                      border: '1px solid rgba(148,163,184,0.12)',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                      <p style={{ color: 'white', fontSize: '14px', fontWeight: '700' }}>Delivery Snapshot</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', padding: '16px 18px' }}>
                      {[
                        { label: 'Active', value: activeSites.length, icon: Activity, color: '#38bdf8' },
                        { label: 'Completed', value: completedSites.length, icon: Briefcase, color: '#22c55e' },
                        { label: 'Reports', value: reportQueue.length, icon: FileText, color: '#f59e0b' },
                        { label: 'Coverage', value: `${selectedSites.length} sites`, icon: MapPin, color: '#a855f7' },
                      ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} style={{ borderRadius: '18px', padding: '13px', background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(148,163,184,0.08)' }}>
                          <div style={{ width: '38px', height: '38px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}22`, border: `1px solid ${color}33` }}>
                            <Icon size={16} color={color} />
                          </div>
                          <p style={{ color: 'white', fontSize: '22px', fontWeight: '800', marginTop: '14px', lineHeight: 1 }}>{value}</p>
                          <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '5px' }}>{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gap: '16px' }}>
            <div
              style={{
                background: 'rgba(8, 15, 28, 0.92)',
                borderRadius: '24px',
                border: '1px solid rgba(148,163,184,0.12)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: '700' }}>Team Pulse</p>
                <p style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>Fast view of who needs capacity attention.</p>
              </div>

              <div style={{ padding: '14px' }}>
                {topLoadMembers.map((member, index) => {
                  const colors = member.workload.status_colors

                  return (
                    <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 12px', marginBottom: '8px', borderRadius: '18px', background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(148,163,184,0.08)' }}>
                      <Avatar name={member.full_name} size={38} index={index} avatarUrl={member.avatar_url} onUpload={isZairul ? () => triggerAvatarUpload(member.id) : null} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.full_name}</p>
                        <div style={{ height: '6px', background: 'rgba(148,163,184,0.12)', borderRadius: '999px', overflow: 'hidden', marginTop: '8px' }}>
                          <div style={{ width: `${Math.min(member.workload.workload_percentage, 100)}%`, height: '100%', background: colors.bar, borderRadius: '999px' }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ color: 'white', fontSize: '12px', fontWeight: '800' }}>{member.workload.workload_percentage}%</p>
                        <p style={{ color: '#64748b', fontSize: '10px', marginTop: '3px' }}>{member.workload.status}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div
              style={{
                background: 'rgba(8, 15, 28, 0.92)',
                borderRadius: '24px',
                border: '1px solid rgba(148,163,184,0.12)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: '700' }}>Capacity Radar</p>
              </div>

              <div style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px', minHeight: '120px' }}>
                  {teamRadar.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '13px', width: '100%', textAlign: 'center' }}>No assignments yet.</p>
                  ) : teamRadar.map((member, index) => (
                    <div key={member.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <div style={{ height: '98px', display: 'flex', alignItems: 'flex-end' }}>
                        <div
                          style={{
                            width: '22px',
                            height: `${Math.max(18, Math.min(member.workload.workload_percentage, 100))}%`,
                            minHeight: '18px',
                            borderRadius: '999px',
                            background: member.workload.status_colors.bar,
                            boxShadow: `0 10px 24px ${member.workload.status_colors.bar}33`,
                          }}
                        />
                      </div>
                      <div style={{ width: '100%' }}>
                        <p style={{ color: '#e2e8f0', fontSize: '10px', fontWeight: '700', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {member.full_name.split(' ')[0]}
                        </p>
                        <p style={{ color: '#64748b', fontSize: '10px', textAlign: 'center', marginTop: '3px' }}>{member.workload.workload_percentage}%</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(148,163,184,0.08)' }}>
                  <p style={{ color: 'white', fontSize: '22px', fontWeight: '800', lineHeight: 1 }}>{avgWorkload}%</p>
                  <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>Average workload across the team right now.</p>
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(8, 15, 28, 0.92)',
                borderRadius: '24px',
                border: '1px solid rgba(148,163,184,0.12)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: '700' }}>Ops Notes</p>
              </div>
              <div style={{ padding: '16px 18px', display: 'grid', gap: '12px' }}>
                {[
                  `${availableCount} members are currently available for new assignments.`,
                  `${busyCount} members are close to or above their weekly limit.`,
                  `${picLeads} people are acting as PIC across current site coverage.`,
                ].map(note => (
                  <div key={note} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8', marginTop: '6px', flexShrink: 0 }} />
                    <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.6 }}>{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
