import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Search, LayoutGrid, List } from 'lucide-react'

const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626']

const STATUS_COLORS = {
  upcoming:  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  ongoing:   { bg: '#ffedd5', text: '#9a3412', border: '#fb923c' },
  completed: { bg: '#dcfce7', text: '#166534', border: '#4ade80' },
  cancelled: { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  postponed: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
}

function Avatar({ name, size = 40, index = 0 }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: AVATAR_COLORS[index % AVATAR_COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: '700', fontSize: size * 0.35, flexShrink: 0
    }}>{initials}</div>
  )
}

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.postponed
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      padding: '2px 8px', borderRadius: '99px', fontSize: '11px',
      fontWeight: '500', textTransform: 'capitalize', whiteSpace: 'nowrap'
    }}>{status}</span>
  )
}

const MEMBER_TABS = ['Overview', 'Workload', 'Assigned Sites']

export default function Team() {
  const [members, setMembers]     = useState([])
  const [allSites, setAllSites]   = useState([])
  const [selected, setSelected]   = useState(null)
  const [activeTab, setActiveTab] = useState('Overview')
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: m } = await supabase
      .from('member_workload_summary').select('*')
    const { data: s } = await supabase
      .from('sites')
      .select(`*, site_assignments(assignment_role, member_id, team_members(full_name))`)
      .order('scheduled_date', { ascending: false })
    setMembers(m || [])
    setAllSites(s || [])
    if (m && m.length > 0) setSelected(m[0])
    setLoading(false)
  }

  function getMemberSites(memberId) {
    return allSites.filter(s => s.site_assignments?.some(a => a.member_id === memberId))
  }

  function getMemberRole(memberId, assignments) {
    return assignments?.find(a => a.member_id === memberId)?.assignment_role || '—'
  }

  const maxPoints = Math.max(...members.map(m => m.total_points), 1)

  const filteredMembers = members.filter(m =>
    !search || m.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const selectedSites   = selected ? getMemberSites(selected.id) : []
  const selectedIndex   = members.findIndex(m => m.id === selected?.id)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: '#64748b' }}>Loading team...</div>
    </div>
  )

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Team</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>{members.length} active members</p>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* Left — member list */}
        <div style={{ width: '260px', flexShrink: 0, background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                placeholder="Search member..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', color: '#0f172a' }}
              />
            </div>
          </div>
          {filteredMembers.map((m, i) => {
            const isSelected = selected?.id === m.id
            const mSites = getMemberSites(m.id)
            return (
              <div key={m.id} onClick={() => { setSelected(m); setActiveTab('Overview') }} style={{
                padding: '14px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                background: isSelected ? '#eff6ff' : 'white',
                borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                transition: 'all 0.15s'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Avatar name={m.full_name} size={38} index={i} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.full_name}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{m.role}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '1px 7px', borderRadius: '99px', fontWeight: '500' }}>Active</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{mSites.length} sites</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right — member detail */}
        {selected && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Profile card */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Avatar name={selected.full_name} size={56} index={selectedIndex} />
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>{selected.full_name}</h2>
                    <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>{selected.role}</p>
                    <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '1px' }}>
                      {selected.full_name.toLowerCase().replace(' ', '.')}@xyte.com
                    </p>
                  </div>
                </div>
                <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #4ade80', padding: '4px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: '500' }}>Active</span>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 16px' }}>
                {MEMBER_TABS.map(t => (
                  <button key={t} onClick={() => setActiveTab(t)} style={{
                    padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: '13px', fontWeight: activeTab === t ? '600' : '400',
                    color: activeTab === t ? '#2563eb' : '#64748b',
                    borderBottom: activeTab === t ? '2px solid #2563eb' : '2px solid transparent',
                    transition: 'all 0.15s', marginBottom: '-1px'
                  }}>{t}</button>
                ))}
              </div>

              <div style={{ padding: '20px' }}>

                {/* Overview Tab */}
                {activeTab === 'Overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      {[
                        { label: 'Total Points', value: `${selected.total_points} pts`, color: '#2563eb', bg: '#eff6ff' },
                        { label: 'Sites Assigned', value: selectedSites.length, color: '#059669', bg: '#f0fdf4' },
                        { label: 'PIC Count', value: selected.pic_count, color: '#7c3aed', bg: '#faf5ff' },
                      ].map(({ label, value, color, bg }) => (
                        <div key={label} style={{ background: bg, borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                          <p style={{ fontSize: '24px', fontWeight: '700', color }}>{value}</p>
                          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{label}</p>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Site Status Breakdown</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {Object.keys(STATUS_COLORS).map(status => {
                          const count = selectedSites.filter(s => s.site_status === status).length
                          if (count === 0) return null
                          const c = STATUS_COLORS[status]
                          return (
                            <span key={status} style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: '4px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: '500', textTransform: 'capitalize' }}>
                              {count} {status}
                            </span>
                          )
                        })}
                        {selectedSites.length === 0 && <p style={{ color: '#94a3b8', fontSize: '13px' }}>No sites assigned yet.</p>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Workload Tab */}
                {activeTab === 'Workload' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p style={{ fontSize: '13px', color: '#64748b' }}>Current workload relative to team</p>
                      <span style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>{selected.total_points} pts</span>
                    </div>
                    <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '99px',
                        background: AVATAR_COLORS[selectedIndex % AVATAR_COLORS.length],
                        width: `${(selected.total_points / maxPoints) * 100}%`,
                        transition: 'width 0.5s ease'
                      }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
                      {[
                        { label: 'PIC Assignments', value: selected.pic_count, pts: selected.pic_count * 5, color: '#2563eb', bg: '#eff6ff' },
                        { label: 'Crew Assignments', value: selected.crew_count, pts: selected.crew_count * 3, color: '#7c3aed', bg: '#faf5ff' },
                      ].map(({ label, value, pts, color, bg }) => (
                        <div key={label} style={{ background: bg, borderRadius: '10px', padding: '14px' }}>
                          <p style={{ fontSize: '20px', fontWeight: '700', color }}>{value}</p>
                          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{label}</p>
                          <p style={{ fontSize: '11px', color, marginTop: '4px' }}>{pts} pts</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assigned Sites Tab */}
                {activeTab === 'Assigned Sites' && (
                  <div>
                    {selectedSites.length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: '13px' }}>No sites assigned yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedSites.map(site => {
                          const role = getMemberRole(selected.id, site.site_assignments)
                          return (
                            <div key={site.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                              <div>
                                <p style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>{site.site_name}</p>
                                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{site.location}</p>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                  background: role === 'PIC' ? '#eff6ff' : '#f8fafc',
                                  color: role === 'PIC' ? '#1d4ed8' : '#475569',
                                  border: `1px solid ${role === 'PIC' ? '#93c5fd' : '#e2e8f0'}`,
                                  padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '600'
                                }}>{role}</span>
                                <StatusPill status={site.site_status} />
                                <span style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                  {new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}