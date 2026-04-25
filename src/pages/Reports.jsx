import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { FileText, CheckCircle, Clock, AlertCircle, Search } from 'lucide-react'
import { notify } from '../utils/notify'
import { useAuth } from '../context/AuthContext'

const REPORT_COLORS = {
  pending:     { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  in_progress: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  submitted:   { bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd' },
  approved:    { bg: '#dcfce7', text: '#166534', border: '#4ade80' },
}

const STATUS_COLORS = {
  upcoming:  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  ongoing:   { bg: '#ffedd5', text: '#9a3412', border: '#fb923c' },
  completed: { bg: '#dcfce7', text: '#166534', border: '#4ade80' },
  cancelled: { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  postponed: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
}

const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626']

function Avatar({ name, size = 28, index = 0, avatarUrl = null }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: avatarUrl ? '#0f172a' : AVATAR_COLORS[index % AVATAR_COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: '600', fontSize: size * 0.36,
    }}>
      {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </div>
  )
}

function Pill({ status, colors }) {
  const c = colors[status] || colors[Object.keys(colors)[0]]
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      padding: '3px 10px', borderRadius: '99px', fontSize: '11px',
      fontWeight: '500', textTransform: 'capitalize', whiteSpace: 'nowrap'
    }}>{status?.replace('_', ' ')}</span>
  )
}

const TABS = ['All', 'Pending', 'In Progress', 'Submitted', 'Approved']

export default function Reports() {
  const { isZairul } = useAuth()
  const [sites, setSites]     = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('All')
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [updating, setUpdating] = useState(null)
  const PER_PAGE = 10

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: s } = await supabase
      .from('sites')
      .select(`*, site_assignments(assignment_role, team_members(id, full_name, avatar_url))`)
      .order('scheduled_date', { ascending: false })
    const { data: m } = await supabase
      .from('team_members').select('*').order('full_name')
    setSites(s || [])
    setMembers(m || [])
    setLoading(false)
  }

  async function updateReportStatus(siteId, newStatus) {
    if (newStatus === 'approved' && !isZairul) return
    const site = sites.find(s => s.id === siteId)
    const prevStatus = site?.report_status
    setUpdating(siteId)
    await supabase.from('sites').update({ report_status: newStatus }).eq('id', siteId)
    if (prevStatus !== newStatus) {
      if (newStatus === 'submitted') await notify(`Report for "${site?.site_name}" has been submitted — ready for review`)
      if (newStatus === 'approved') await notify(`Report for "${site?.site_name}" has been approved by Zairul`)
    }
    await fetchAll()
    setUpdating(null)
  }

  const tabKey = tab === 'All' ? 'all' : tab.toLowerCase().replace(' ', '_')

  const filtered = sites
    .filter(s => tab === 'All' || s.report_status === tabKey)
    .filter(s => !search ||
      s.site_name.toLowerCase().includes(search.toLowerCase()) ||
      s.location.toLowerCase().includes(search.toLowerCase())
    )

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const counts = {
    pending:     sites.filter(s => s.report_status === 'pending').length,
    in_progress: sites.filter(s => s.report_status === 'in_progress').length,
    submitted:   sites.filter(s => s.report_status === 'submitted').length,
    approved:    sites.filter(s => s.report_status === 'approved').length,
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: '#64748b' }}>Loading reports...</div>
    </div>
  )

  return (
    <div style={{ padding: '28px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Reports</h1>
        <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>Track report status for all sites</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Pending',     value: counts.pending,     icon: Clock,         color: '#d97706', bg: '#fffbeb' },
          { label: 'In Progress', value: counts.in_progress, icon: AlertCircle,   color: '#2563eb', bg: '#eff6ff' },
          { label: 'Submitted',   value: counts.submitted,   icon: FileText,      color: '#7c3aed', bg: '#faf5ff' },
          { label: 'Approved',    value: counts.approved,    icon: CheckCircle,   color: '#16a34a', bg: '#f0fdf4' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ color: '#64748b', fontSize: '12px', fontWeight: '500', marginBottom: '6px' }}>{label}</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a' }}>{value}</p>
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={20} color={color} />
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '280px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              placeholder="Search sites..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', color: '#0f172a' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setPage(1) }} style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
                fontWeight: '500', cursor: 'pointer', border: 'none',
                background: tab === t ? '#2563eb' : 'transparent',
                color: tab === t ? 'white' : '#64748b',
                transition: 'all 0.15s'
              }}>{t}</button>
            ))}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Site Name','Location','Date','PIC','Crew','Site Status','Report Status','Update'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>No reports found.</td></tr>
            ) : paginated.map((site, i) => {
              const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
              const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []
              const memberIndex = members.findIndex(m => m.id === pic?.team_members?.id)
              return (
                <tr key={site.id}
                  style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafafa'}
                >
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: '#0f172a' }}>{site.site_name}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '13px' }}>{site.location}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {pic && <Avatar name={pic.team_members.full_name} size={24} index={memberIndex >= 0 ? memberIndex : 0} avatarUrl={pic.team_members?.avatar_url} />}
                      <span style={{ color: '#2563eb', fontSize: '13px' }}>{pic?.team_members?.full_name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex' }}>
                      {crew.slice(0, 3).map((c, ci) => (
                        <div key={ci} title={c.team_members?.full_name} style={{ marginLeft: ci > 0 ? '-6px' : 0, border: '2px solid white', borderRadius: '50%' }}>
                          <Avatar name={c.team_members?.full_name || '?'} size={24} index={ci + 1} avatarUrl={c.team_members?.avatar_url} />
                        </div>
                      ))}
                      {crew.length > 3 && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px', alignSelf: 'center' }}>+{crew.length - 3}</span>}
                      {crew.length === 0 && <span style={{ color: '#94a3b8', fontSize: '13px' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><Pill status={site.site_status} colors={STATUS_COLORS} /></td>
                  <td style={{ padding: '12px 16px' }}><Pill status={site.report_status} colors={REPORT_COLORS} /></td>
                  <td style={{ padding: '12px 16px' }}>
                    <select
                      value={site.report_status}
                      disabled={updating === site.id}
                      onChange={e => updateReportStatus(site.id, e.target.value)}
                      style={{ padding: '5px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#0f172a', background: 'white', cursor: 'pointer', outline: 'none' }}
                    >
                      {['pending','in_progress','submitted','approved'].map(s => (
                        <option key={s} value={s} disabled={s === 'approved' && !isZairul}>
                          {s.replace('_', ' ')}{s === 'approved' && !isZairul ? ' (Zairul only)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#cbd5e1' : '#0f172a', fontSize: '12px' }}>Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: page === p ? '#2563eb' : 'white', color: page === p ? 'white' : '#0f172a', cursor: 'pointer', fontSize: '12px' }}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#cbd5e1' : '#0f172a', fontSize: '12px' }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}