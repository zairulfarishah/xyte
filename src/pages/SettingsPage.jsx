import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { User, Info, Lock, CalendarDays, Plus, Pencil, Trash2 } from 'lucide-react'
import { ROLE_MULTIPLIERS, WEEKLY_CAPACITY_DAYS } from '../utils/workload'
import { useAuth } from '../context/AuthContext'
import { useViewport } from '../utils/useViewport'
import { LEAVE_TYPES, fetchTeamLeaves, saveTeamLeaves } from '../utils/teamLeaves'

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626']

const SECTIONS = [
  { key: 'team', label: 'Team Members', icon: User },
  { key: 'leave', label: 'Team Leave', icon: CalendarDays },
  { key: 'app', label: 'App Info', icon: Info },
]

const EMPTY_LEAVE_FORM = {
  id: null,
  member_id: '',
  leave_type: LEAVE_TYPES[0],
  start_date: '',
  end_date: '',
  note: '',
}

function Avatar({ name, size = 40, index = 0 }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: AVATAR_COLORS[index % AVATAR_COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: '700', fontSize: size * 0.35, flexShrink: 0,
    }}>{initials}</div>
  )
}

function formatLeaveDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SettingsPage() {
  const { isZairul } = useAuth()
  const { isMobile, isTablet } = useViewport()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('team')
  const [stats, setStats] = useState({})
  const [leaves, setLeaves] = useState([])
  const [leaveForm, setLeaveForm] = useState(EMPTY_LEAVE_FORM)
  const [leaveSaving, setLeaveSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: m }, { data: s }, { data: d }, leaveData] = await Promise.all([
      supabase.from('team_members').select('*').order('created_at'),
      supabase.from('sites').select('id, site_status, report_status'),
      supabase.from('library_documents').select('id'),
      fetchTeamLeaves().catch(() => []),
    ])

    setMembers(m || [])
    setLeaves(leaveData || [])
    setStats({
      totalSites: s?.length || 0,
      completed: s?.filter(x => x.site_status === 'completed').length || 0,
      approved: s?.filter(x => x.report_status === 'approved').length || 0,
      docs: d?.length || 0,
    })
    setLoading(false)
  }

  const memberMap = useMemo(
    () => Object.fromEntries(members.map(member => [member.id, member])),
    [members]
  )

  const sortedLeaves = useMemo(
    () => [...leaves].sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || ''))),
    [leaves]
  )

  function resetLeaveForm() {
    setLeaveForm(EMPTY_LEAVE_FORM)
  }

  function startEditLeave(leave) {
    setLeaveForm({
      id: leave.id,
      member_id: leave.member_id,
      leave_type: leave.leave_type,
      start_date: leave.start_date,
      end_date: leave.end_date || leave.start_date,
      note: leave.note || '',
    })
  }

  async function handleLeaveSave() {
    if (!leaveForm.member_id || !leaveForm.start_date) {
      alert('Please select a team member and leave date.')
      return
    }

    const start = leaveForm.start_date
    const end = leaveForm.end_date || leaveForm.start_date
    if (end < start) {
      alert('End date cannot be earlier than start date.')
      return
    }

    const nextLeave = {
      id: leaveForm.id || `${leaveForm.member_id}-${start}-${Date.now()}`,
      member_id: leaveForm.member_id,
      leave_type: leaveForm.leave_type,
      start_date: start,
      end_date: end,
      note: leaveForm.note.trim(),
      created_at: leaveForm.id ? leaves.find(item => item.id === leaveForm.id)?.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const duplicate = leaves.find(item =>
      item.id !== nextLeave.id &&
      item.member_id === nextLeave.member_id &&
      !(nextLeave.end_date < item.start_date || nextLeave.start_date > (item.end_date || item.start_date))
    )

    if (duplicate) {
      alert('This member already has a leave record overlapping those dates.')
      return
    }

    setLeaveSaving(true)
    try {
      const nextLeaves = leaveForm.id
        ? leaves.map(item => item.id === leaveForm.id ? nextLeave : item)
        : [...leaves, nextLeave]

      await saveTeamLeaves(nextLeaves)
      setLeaves(nextLeaves)
      resetLeaveForm()
      window.dispatchEvent(new CustomEvent('xyte:leaves-updated'))
    } catch (error) {
      alert(error.message || 'Unable to save leave.')
    } finally {
      setLeaveSaving(false)
    }
  }

  async function handleLeaveDelete(leaveId) {
    if (!confirm('Delete this leave record?')) return
    setLeaveSaving(true)
    try {
      const nextLeaves = leaves.filter(item => item.id !== leaveId)
      await saveTeamLeaves(nextLeaves)
      setLeaves(nextLeaves)
      if (leaveForm.id === leaveId) resetLeaveForm()
      window.dispatchEvent(new CustomEvent('xyte:leaves-updated'))
    } catch (error) {
      alert(error.message || 'Unable to delete leave.')
    } finally {
      setLeaveSaving(false)
    }
  }

  if (!isZairul) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Lock size={24} color="#ef4444" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a', marginBottom: '4px' }}>Access Restricted</p>
        <p style={{ color: '#64748b', fontSize: '13px' }}>Settings are only accessible by Zairul.</p>
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: '#64748b' }}>Loading settings...</div>
    </div>
  )

  return (
    <div style={{ padding: isMobile ? '16px 14px 24px' : '28px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Settings</h1>
        <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>Manage your app configuration</p>
      </div>

      <div style={{ display: 'flex', flexDirection: isTablet ? 'column' : 'row', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ width: isTablet ? '100%' : '220px', flexShrink: 0, background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '8px', overflow: 'hidden' }}>
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setSection(key)} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              background: section === key ? '#eff6ff' : 'transparent',
              color: section === key ? '#1d4ed8' : '#64748b',
              fontSize: '13px', fontWeight: section === key ? '600' : '400',
              transition: 'all 0.15s', marginBottom: '2px',
            }}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {section === 'team' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>Team Members</h2>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Your current Xradar team</p>
                </div>
                <div style={{ padding: '8px' }}>
                  {members.map((m, i) => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px', borderRadius: '8px', marginBottom: '2px',
                      transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Avatar name={m.full_name} size={40} index={i} />
                        <div>
                          <p style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a' }}>{m.full_name}</p>
                          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>{m.role}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          background: m.role === 'Team Leader' ? '#eff6ff' : '#faf5ff',
                          color: m.role === 'Team Leader' ? '#1d4ed8' : '#6d28d9',
                          border: `1px solid ${m.role === 'Team Leader' ? '#93c5fd' : '#c4b5fd'}`,
                          padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '500',
                        }}>{m.role}</span>
                        <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #4ade80', padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' }}>Active</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>Workload Weightage</h2>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>% of weekly capacity per task type (week = {WEEKLY_CAPACITY_DAYS} days)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    {
                      label: 'PIC - Site Scanning',
                      color: '#2563eb',
                      bg: '#eff6ff',
                      desc: 'Includes a small coordination premium for the lead person',
                      pct: `${((ROLE_MULTIPLIERS.site_scanning.pic / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}% per day`,
                      example: `e.g. 1-day site = ${((1 / WEEKLY_CAPACITY_DAYS) * 100 * ROLE_MULTIPLIERS.site_scanning.pic).toFixed(0)}%`,
                    },
                    {
                      label: 'Crew - Site Scanning',
                      color: '#7c3aed',
                      bg: '#faf5ff',
                      desc: 'Standard on-site scanning workload',
                      pct: `${((ROLE_MULTIPLIERS.site_scanning.crew / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}% per day`,
                      example: `e.g. 1-day site = ${((1 / WEEKLY_CAPACITY_DAYS) * 100 * ROLE_MULTIPLIERS.site_scanning.crew).toFixed(0)}%`,
                    },
                    {
                      label: 'Site Visit',
                      color: '#059669',
                      bg: '#f0fdf4',
                      desc: 'Uses the entered duration with the standard multiplier',
                      pct: `${((1 / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}% per day`,
                      example: `e.g. 0.5-day visit = ${((0.5 / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}%`,
                    },
                    {
                      label: 'Meeting',
                      color: '#d97706',
                      bg: '#fffbeb',
                      desc: 'Uses the entered duration with the standard multiplier',
                      pct: `${((1 / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}% per day`,
                      example: `e.g. 0.5-day meeting = ${((0.5 / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}%`,
                    },
                    {
                      label: 'Report Preparation',
                      color: '#dc2626',
                      bg: '#fef2f2',
                      desc: 'Only counts after the site is no longer active on-site',
                      pct: `${((1 / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}% per day`,
                      example: `e.g. 1-day report = ${((1 / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}%`,
                    },
                  ].map(({ label, color, bg, desc, pct, example }) => (
                    <div key={label} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', background: bg, borderRadius: '10px' }}>
                      <div>
                        <p style={{ fontWeight: '600', fontSize: '13px', color }}>{label}</p>
                        <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{desc}</p>
                        <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{example}</p>
                      </div>
                      <div style={{ background: 'white', borderRadius: '8px', padding: '6px 12px', textAlign: 'center', minWidth: '80px', flexShrink: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: '700', color }}>{pct}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'leave' && (
            <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '340px minmax(0, 1fr)', gap: '16px' }}>
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>Add Leave</h2>
                    <p style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>Blocks assignment on selected dates.</p>
                  </div>
                  {leaveForm.id && (
                    <button onClick={resetLeaveForm} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                      Reset
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Team Member</label>
                    <select
                      value={leaveForm.member_id}
                      onChange={event => setLeaveForm(form => ({ ...form, member_id: event.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', color: '#0f172a' }}
                    >
                      <option value="">- Select member -</option>
                      {members.map(member => (
                        <option key={member.id} value={member.id}>{member.full_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Leave Type</label>
                    <select
                      value={leaveForm.leave_type}
                      onChange={event => setLeaveForm(form => ({ ...form, leave_type: event.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', color: '#0f172a' }}
                    >
                      {LEAVE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Start Date</label>
                      <input
                        type="date"
                        value={leaveForm.start_date}
                        onChange={event => setLeaveForm(form => ({ ...form, start_date: event.target.value, end_date: form.end_date || event.target.value }))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', color: '#0f172a' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>End Date</label>
                      <input
                        type="date"
                        value={leaveForm.end_date}
                        onChange={event => setLeaveForm(form => ({ ...form, end_date: event.target.value }))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', color: '#0f172a' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Note</label>
                    <textarea
                      rows={3}
                      value={leaveForm.note}
                      onChange={event => setLeaveForm(form => ({ ...form, note: event.target.value }))}
                      placeholder="Optional note"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', color: '#0f172a', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>

                  <button
                    onClick={handleLeaveSave}
                    disabled={leaveSaving}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', padding: '11px 12px', fontSize: '13px', fontWeight: '800', cursor: leaveSaving ? 'not-allowed' : 'pointer', opacity: leaveSaving ? 0.7 : 1 }}
                  >
                    <Plus size={14} />
                    {leaveForm.id ? 'Update Leave' : 'Save Leave'}
                  </button>
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>Leave Records</h2>
                  <p style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>These records are used by the dashboard and assignment forms.</p>
                </div>
                <div style={{ padding: '12px' }}>
                  {sortedLeaves.length === 0 ? (
                    <div style={{ padding: '20px', borderRadius: '10px', background: '#f8fafc', color: '#64748b', fontSize: '13px', textAlign: 'center' }}>
                      No leave records yet.
                    </div>
                  ) : sortedLeaves.map((leave, index) => {
                    const member = memberMap[leave.member_id]
                    const singleDay = leave.start_date === (leave.end_date || leave.start_date)
                    return (
                      <div key={leave.id} style={{ padding: '14px 12px', borderBottom: index === sortedLeaves.length - 1 ? 'none' : '1px solid #eef2f7', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '12px', minWidth: 0 }}>
                          <Avatar name={member?.full_name || 'Unknown'} size={38} index={index} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{member?.full_name || 'Unknown member'}</div>
                            <div style={{ marginTop: '4px', display: 'inline-flex', padding: '4px 8px', borderRadius: '999px', background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74', fontSize: '11px', fontWeight: '700' }}>
                              {leave.leave_type}
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '12px', color: '#475569' }}>
                              {singleDay ? formatLeaveDate(leave.start_date) : `${formatLeaveDate(leave.start_date)} - ${formatLeaveDate(leave.end_date)}`}
                            </div>
                            {leave.note && <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>{leave.note}</div>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          <button onClick={() => startEditLeave(leave)} style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1px solid #dbeafe', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleLeaveDelete(leave.id)} style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {section === 'app' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ width: '52px', height: '52px', background: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '22px' }}>X</div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Xyte</h2>
                    <p style={{ fontSize: '13px', color: '#64748b' }}>Xradar Internal System · Version 1.0.0</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'Total Sites', value: stats.totalSites },
                    { label: 'Completed Sites', value: stats.completed },
                    { label: 'Approved Reports', value: stats.approved },
                    { label: 'Library Docs', value: stats.docs },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>{value}</p>
                      <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>Tech Stack</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { name: 'React + Vite', role: 'Frontend framework', color: '#2563eb' },
                    { name: 'Tailwind CSS', role: 'Styling', color: '#0ea5e9' },
                    { name: 'Supabase', role: 'Database + Storage', color: '#059669' },
                    { name: 'React Leaflet', role: 'Map module', color: '#d97706' },
                    { name: 'Lucide React', role: 'Icons', color: '#7c3aed' },
                    { name: 'GitHub', role: 'Code repository', color: '#0f172a' },
                  ].map(({ name, role, color }) => (
                    <div key={name} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>{name}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
