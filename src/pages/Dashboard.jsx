import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { calculateWorkload } from '../utils/workload'
import { memberSchedule, notify, notifyMany, notifyScheduleChanges, siteRoleIds } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import SiteForm from '../components/siteForm/SiteForm'
import { EMPTY_SITE_FORM } from '../components/siteForm/siteFormModel'
import { mergeCompletionMeta, parseCompletionMeta, validateCompletionRequirement } from '../utils/completionMeta'
import { fetchTeamLeaves, getLeaveSessionLabel, getLeaveSummary, getMemberLeaveOnDate } from '../utils/teamLeaves'
import {
  assignmentMemberId, crewForDate, getSiteDates, isMissingPic, memberRoleOnSite, picForDate, representativeDate,
} from '../utils/siteDays'
import DashboardHome from './DashboardHome'
import { activeMembers } from '../utils/members'
import { cachedPage, rememberPage } from '../utils/pageCache'

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

export default function Dashboard() {
  const { fullName, firstName, isZairul, memberId } = useAuth()
  const [members, setMembers] = useState(() => cachedPage('dashboard')?.members || [])
  const [sites, setSites] = useState(() => cachedPage('dashboard')?.sites || [])
  const [upcoming, setUpcoming] = useState(() => cachedPage('dashboard')?.upcoming || [])
  const [loading, setLoading] = useState(() => !cachedPage('dashboard'))
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updateSite, setUpdateSite] = useState(null)
  const [quickAssign, setQuickAssign] = useState(null)
  const [quickAssignSaving, setQuickAssignSaving] = useState(false)
  const [leaves, setLeaves] = useState(() => cachedPage('dashboard')?.leaves || [])

  useEffect(() => {
    fetchAll()
  }, [])



  useEffect(() => {
    function handleOpenAdd() {
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

  // Refreshes in place: the spinner only shows on the very first visit
  async function fetchAll() {
    const [{ data: memberData }, { data: allSites }, leaveData] = await Promise.all([
      supabase
        .from('team_members')
        .select('*')
        .order('full_name'),
      supabase
        .from('sites')
        .select('*, site_assignments(assignment_role, member_id, work_date, team_members(id, full_name, avatar_url))')
        .eq('is_hidden', false)
        .order('scheduled_date', { ascending: true }),
      fetchTeamLeaves().catch(() => []),
    ])

    const siteList = allSites || []
    const memberRecords = activeMembers(memberData).map(member => buildMemberRecord(member, siteList))

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
    rememberPage('dashboard', { members: memberRecords, sites: siteList, upcoming: upcomingSites, leaves: leaveData || [] })
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

  // Any day of a multi-day site without a PIC counts as unassigned
  const noPicSites = sites.filter(site => isMissingPic(site) && !['completed', 'cancelled'].includes(site.site_status))
  const soonSites = sites.filter(site => {
    const diff = (new Date(site.scheduled_date) - new Date()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 2 && site.site_status === 'upcoming'
  })
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
    <div style={{ minHeight: '100vh', color: '#0b1220' }}>
      <DashboardHome
        sites={sites}
        members={members}
        fullName={fullName}
        leaves={leaves}
        firstName={firstName}
        memberId={memberId}
        isZairul={isZairul}
        onAssign={openQuickAssign}
        onUpdate={openStatusUpdate}
        onAdd={() => setShowAdd(true)}
      />

      {showAdd && (
        <SiteForm
          title="Add New Site"
          initial={EMPTY_SITE_FORM}
          members={members}
          leaves={leaves}
          sites={sites}
          fullName={fullName}
          memberId={memberId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchAll() }}
        />
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
            zIndex: 3200,
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
            zIndex: 3200,
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
