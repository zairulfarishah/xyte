import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { FileText, CheckCircle, Clock, AlertCircle, Search, MinusCircle } from 'lucide-react'
import { notify } from '../utils/notify'
import { useAuth } from '../context/AuthContext'

const REPORT_META = {
  pending:        { bg:'#fef3c7', text:'#92400e', border:'#fcd34d', dot:'#f59e0b',  label:'Pending'        },
  in_progress:    { bg:'#dbeafe', text:'#1e40af', border:'#93c5fd', dot:'#2563eb',  label:'In Progress'    },
  submitted:      { bg:'#ede9fe', text:'#5b21b6', border:'#c4b5fd', dot:'#7c3aed',  label:'Submitted'      },
  approved:       { bg:'#dcfce7', text:'#166534', border:'#86efac', dot:'#16a34a',  label:'Approved'       },
  not_applicable: { bg:'#f1f5f9', text:'#475569', border:'#cbd5e1', dot:'#94a3b8',  label:'Not Applicable' },
}

const STATUS_META = {
  upcoming:  { bg:'#fef9c3', text:'#854d0e', border:'#fde047' },
  ongoing:   { bg:'#ffedd5', text:'#9a3412', border:'#fb923c' },
  completed: { bg:'#dcfce7', text:'#166534', border:'#4ade80' },
  cancelled: { bg:'#fee2e2', text:'#991b1b', border:'#f87171' },
  postponed: { bg:'#f1f5f9', text:'#475569', border:'#cbd5e1' },
}

const STAT_CARDS = [
  { key:'pending',        label:'Pending',        Icon:Clock,        grad:'linear-gradient(135deg,#d97706,#f59e0b)', shadow:'rgba(245,158,11,.3)'  },
  { key:'in_progress',   label:'In Progress',    Icon:AlertCircle,  grad:'linear-gradient(135deg,#1d4ed8,#3b82f6)', shadow:'rgba(59,130,246,.3)'  },
  { key:'submitted',     label:'Submitted',      Icon:FileText,     grad:'linear-gradient(135deg,#6d28d9,#8b5cf6)', shadow:'rgba(139,92,246,.3)'  },
  { key:'approved',      label:'Approved',       Icon:CheckCircle,  grad:'linear-gradient(135deg,#15803d,#22c55e)', shadow:'rgba(34,197,94,.3)'   },
  { key:'not_applicable',label:'Not Applicable', Icon:MinusCircle,  grad:'linear-gradient(135deg,#475569,#94a3b8)', shadow:'rgba(148,163,184,.3)' },
]

const TABS = ['All','Pending','In Progress','Submitted','Approved','Not Applicable']

const AV_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626']

function Avatar({ name, size = 28, index = 0, avatarUrl = null }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', flexShrink:0, overflow:'hidden', background: avatarUrl ? '#0f172a' : AV_COLORS[index % AV_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:'700', fontSize:size*0.36 }}>
      {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initials}
    </div>
  )
}

function StatusPill({ status, meta }) {
  const m = meta[status] || { bg:'#f1f5f9', text:'#475569', border:'#e2e8f0', label: status }
  const label = m.label || status?.replace(/_/g, ' ')
  return (
    <span style={{ background:m.bg, color:m.text, border:`1px solid ${m.border}`, padding:'3px 10px', borderRadius:'99px', fontSize:'11px', fontWeight:'600', whiteSpace:'nowrap', textTransform:'capitalize' }}>
      {label}
    </span>
  )
}

export default function Reports() {
  const { isZairul, fullName } = useAuth()
  const [sites, setSites]         = useState([])
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('All')
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [updating, setUpdating]   = useState(null)
  const [updateError, setUpdateError] = useState(null)
  const PER_PAGE = 10

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: s }, { data: m }] = await Promise.all([
      supabase.from('sites')
        .select(`*, site_assignments(assignment_role, team_members(id, full_name, avatar_url))`)
        .order('scheduled_date', { ascending: false }),
      supabase.from('team_members').select('*').order('full_name'),
    ])
    setSites(s || [])
    setMembers(m || [])
    setLoading(false)
  }

  async function updateReportStatus(siteId, newStatus) {
    if (newStatus === 'approved' && !isZairul) return
    const site = sites.find(s => s.id === siteId)
    const prev = site?.report_status
    setUpdating(siteId)
    setSites(prev => prev.map(s => s.id === siteId ? { ...s, report_status: newStatus } : s))
    const { error } = await supabase.from('sites').update({ report_status: newStatus }).eq('id', siteId)
    if (error) {
      setSites(prev => prev.map(s => s.id === siteId ? { ...s, report_status: prev } : s))
      setUpdateError(error.message)
      setUpdating(null)
      return
    }
    setUpdateError(null)
    const involvedIds = (site?.site_assignments || []).map(a => a.team_members?.id).filter(Boolean)
    if (prev !== newStatus) {
      if (newStatus === 'submitted') await notify(`Report for "${site?.site_name}" has been submitted — ready for review`, fullName)
      if (newStatus === 'approved')  await notify(`Report for "${site?.site_name}" has been approved`, fullName)
    }
    setUpdating(null)
  }

  const tabKey = tab === 'All' ? 'all' : tab.toLowerCase().replace(' ', '_')

  const filtered = sites
    .filter(s => tab === 'All' || s.report_status === tabKey)
    .filter(s => !search ||
      s.site_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.location?.toLowerCase().includes(search.toLowerCase())
    )

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const counts = {
    pending:        sites.filter(s => s.report_status === 'pending').length,
    in_progress:    sites.filter(s => s.report_status === 'in_progress').length,
    submitted:      sites.filter(s => s.report_status === 'submitted').length,
    approved:       sites.filter(s => s.report_status === 'approved').length,
    not_applicable: sites.filter(s => s.report_status === 'not_applicable').length,
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', gap:'10px', color:'#64748b', fontSize:'14px' }}>
      <div style={{ width:'16px', height:'16px', borderRadius:'50%', border:'2px solid #e2e8f0', borderTopColor:'#2563eb', animation:'spin 0.7s linear infinite' }} />
      Loading reports…
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(180deg,#071226 0 120px,#dde4ed 120px 100%)' }}>

      {/* ── Header ── */}
      <div style={{ padding:'24px 40px 0' }}>
        <h1 style={{ fontSize:'22px', fontWeight:'700', color:'white' }}>Reports</h1>
        <p style={{ color:'#94a3b8', fontSize:'13px', marginTop:'2px' }}>Track and update report status for all sites</p>
      </div>

      <div style={{ padding:'20px 40px 48px', display:'flex', flexDirection:'column', gap:'20px' }}>

        {updateError && (
          <div style={{ background:'#fee2e2', border:'1px solid #fecaca', borderRadius:'10px', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', color:'#991b1b', fontWeight:'500' }}>Failed to update: {updateError}</span>
            <button onClick={() => setUpdateError(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444', fontWeight:'700', fontSize:'18px', lineHeight:1 }}>×</button>
          </div>
        )}

        {/* ── Stat cards ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'12px' }}>
          {STAT_CARDS.map(({ key, label, Icon, grad, shadow }) => (
            <div
              key={key}
              onClick={() => { setTab(label); setPage(1) }}
              style={{ background:grad, borderRadius:'14px', padding:'18px 20px', cursor:'pointer', boxShadow:`0 8px 24px ${shadow}`, transition:'transform 0.15s, box-shadow 0.15s', display:'flex', flexDirection:'column', gap:'10px' }}
              onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 12px 32px ${shadow}` }}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow=`0 8px 24px ${shadow}` }}
            >
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <p style={{ color:'rgba(255,255,255,0.8)', fontSize:'12px', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</p>
                <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon size={16} color="white" />
                </div>
              </div>
              <p style={{ fontSize:'32px', fontWeight:'800', color:'white', lineHeight:1 }}>{counts[key]}</p>
            </div>
          ))}
        </div>

        {/* ── Table card ── */}
        <div style={{ background:'white', borderRadius:'16px', border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 4px 20px rgba(15,23,42,.06)' }}>

          {/* Toolbar */}
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap', background:'#fafafa' }}>
            <div style={{ position:'relative', flex:1, minWidth:'200px', maxWidth:'280px' }}>
              <Search size={13} style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
              <input
                placeholder="Search sites..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                style={{ width:'100%', padding:'7px 10px 7px 30px', borderRadius:'8px', border:'1px solid #e2e8f0', fontSize:'13px', outline:'none', color:'#0f172a', background:'white', boxSizing:'border-box' }}
              />
            </div>
            <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
              {TABS.map(t => {
                const active = tab === t
                const rKey = t === 'All' ? null : t.toLowerCase().replace(' ', '_')
                const meta = rKey ? REPORT_META[rKey] : null
                return (
                  <button key={t} onClick={() => { setTab(t); setPage(1) }} style={{
                    padding:'6px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:'600',
                    cursor:'pointer', border: active && meta ? `1px solid ${meta.border}` : 'none',
                    background: active ? (meta ? meta.bg : '#0f172a') : 'transparent',
                    color:      active ? (meta ? meta.text : 'white') : '#64748b',
                    transition: 'all 0.15s',
                  }}>{t}</button>
                )
              })}
            </div>
          </div>

          {/* Table */}
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#1e293b' }}>
                {['Site Name','Location','Date','PIC','Crew','Site Status','Report Status','Update'].map(h => (
                  <th key={h} style={{ padding:'11px 16px', textAlign:'left', fontSize:'11px', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={8} style={{ padding:'60px', textAlign:'center', color:'#94a3b8', fontSize:'14px' }}>No reports found.</td></tr>
              ) : paginated.map((site, i) => {
                const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
                const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []
                const mi   = members.findIndex(m => m.id === pic?.team_members?.id)
                const rm   = REPORT_META[site.report_status] || REPORT_META.pending
                return (
                  <tr
                    key={site.id}
                    style={{ borderBottom:'1px solid #f1f5f9', transition:'background 0.1s', borderLeft:`3px solid ${rm.dot}` }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding:'13px 16px', fontWeight:'700', color:'#0f172a', fontSize:'13px' }}>{site.site_name}</td>
                    <td style={{ padding:'13px 16px', color:'#64748b', fontSize:'12px', maxWidth:'220px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{site.location}</td>
                    <td style={{ padding:'13px 16px', color:'#64748b', fontSize:'12px', whiteSpace:'nowrap' }}>
                      {new Date(site.scheduled_date).toLocaleDateString('en-MY', { day:'numeric', month:'short', year:'numeric' })}
                    </td>
                    <td style={{ padding:'13px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        {pic && <Avatar name={pic.team_members.full_name} size={26} index={mi >= 0 ? mi : 0} avatarUrl={pic.team_members?.avatar_url} />}
                        <span style={{ color:'#2563eb', fontSize:'13px', fontWeight:'500', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100px' }}>{pic?.team_members?.full_name || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding:'13px 16px' }}>
                      <div style={{ display:'flex' }}>
                        {crew.length === 0 && <span style={{ color:'#cbd5e1', fontSize:'13px' }}>—</span>}
                        {crew.slice(0, 4).map((c, ci) => (
                          <div key={ci} title={c.team_members?.full_name} style={{ marginLeft: ci > 0 ? '-6px' : 0, border:'2px solid white', borderRadius:'50%' }}>
                            <Avatar name={c.team_members?.full_name || '?'} size={26} index={ci + 1} avatarUrl={c.team_members?.avatar_url} />
                          </div>
                        ))}
                        {crew.length > 4 && <span style={{ fontSize:'11px', color:'#94a3b8', marginLeft:'6px', alignSelf:'center' }}>+{crew.length - 4}</span>}
                      </div>
                    </td>
                    <td style={{ padding:'13px 16px' }}><StatusPill status={site.site_status} meta={STATUS_META} /></td>
                    <td style={{ padding:'13px 16px' }}><StatusPill status={site.report_status} meta={REPORT_META} /></td>
                    <td style={{ padding:'13px 16px' }}>
                      <select
                        value={site.report_status}
                        disabled={updating === site.id}
                        onChange={e => updateReportStatus(site.id, e.target.value)}
                        style={{ padding:'6px 10px', borderRadius:'8px', border:`1px solid ${rm.border}`, fontSize:'12px', fontWeight:'600', color:rm.text, background:rm.bg, cursor:'pointer', outline:'none', opacity: updating === site.id ? 0.5 : 1 }}
                      >
                        {['pending','in_progress','submitted','approved','not_applicable'].map(s => (
                          <option key={s} value={s} disabled={s === 'approved' && !isZairul}>
                            {REPORT_META[s]?.label}{s === 'approved' && !isZairul ? ' (Zairul only)' : ''}
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
            <div style={{ padding:'12px 20px', borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fafafa' }}>
              <span style={{ fontSize:'12px', color:'#64748b' }}>
                Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display:'flex', gap:'4px' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding:'5px 10px', borderRadius:'6px', border:'1px solid #e2e8f0', background:'white', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#cbd5e1' : '#0f172a', fontSize:'12px' }}>Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} style={{ padding:'5px 10px', borderRadius:'6px', border:'1px solid #e2e8f0', background: page === p ? '#2563eb' : 'white', color: page === p ? 'white' : '#0f172a', cursor:'pointer', fontSize:'12px' }}>{p}</button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding:'5px 10px', borderRadius:'6px', border:'1px solid #e2e8f0', background:'white', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#cbd5e1' : '#0f172a', fontSize:'12px' }}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
