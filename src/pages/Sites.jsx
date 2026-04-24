import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'

const STATUS_COLORS = {
  upcoming:  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  ongoing:   { bg: '#ffedd5', text: '#9a3412', border: '#fb923c' },
  completed: { bg: '#dcfce7', text: '#166534', border: '#4ade80' },
  cancelled: { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  postponed: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
}

const REPORT_COLORS = {
  pending:     { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  in_progress: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  submitted:   { bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd' },
  approved:    { bg: '#dcfce7', text: '#166534', border: '#4ade80' },
}

const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626']

function Avatar({ name, size = 28, index = 0 }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: AVATAR_COLORS[index % AVATAR_COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: '600', fontSize: size * 0.36, flexShrink: 0
    }}>{initials}</div>
  )
}

function StatusPill({ status, colors }) {
  const c = colors[status] || colors[Object.keys(colors)[0]]
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      padding: '3px 10px', borderRadius: '99px', fontSize: '11px',
      fontWeight: '500', textTransform: 'capitalize', whiteSpace: 'nowrap'
    }}>{status?.replace('_', ' ')}</span>
  )
}

const EMPTY = {
  site_name: '', location: '', latitude: '', longitude: '',
  scheduled_date: '', site_status: 'upcoming', report_status: 'pending',
  notes: '', pic_id: '', crew_ids: [],
}

const TABS = ['All', 'Upcoming', 'Ongoing', 'Completed', 'Cancelled', 'Postponed']

export default function Sites() {
  const [sites, setSites]       = useState([])
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('All')
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editSite, setEditSite] = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [page, setPage]         = useState(1)
  const PER_PAGE = 10

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: s } = await supabase
      .from('sites')
      .select(`*, site_assignments(assignment_role, team_members(id, full_name))`)
      .order('scheduled_date', { ascending: true })
    const { data: m } = await supabase
      .from('team_members').select('*').order('full_name')
    setSites(s || [])
    setMembers(m || [])
    setLoading(false)
  }

  function openAdd() { setForm(EMPTY); setEditSite(null); setShowForm(true) }

  function openEdit(site) {
    const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
    const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew')
    setForm({
      site_name: site.site_name, location: site.location,
      latitude: site.latitude || '', longitude: site.longitude || '',
      scheduled_date: site.scheduled_date, site_status: site.site_status,
      report_status: site.report_status, notes: site.notes || '',
      pic_id: pic?.team_members?.id || '',
      crew_ids: crew?.map(c => c.team_members?.id) || [],
    })
    setEditSite(site)
    setShowForm(true)
  }

  function toggleCrew(id) {
    setForm(f => ({
      ...f,
      crew_ids: f.crew_ids.includes(id)
        ? f.crew_ids.filter(x => x !== id)
        : [...f.crew_ids, id]
    }))
  }

  async function handleSave() {
    if (!form.site_name || !form.location || !form.scheduled_date) return
    setSaving(true)
    const payload = {
      site_name: form.site_name, location: form.location,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      scheduled_date: form.scheduled_date, site_status: form.site_status,
      report_status: form.report_status, notes: form.notes,
    }
    let siteId = editSite?.id
    if (editSite) {
      await supabase.from('sites').update(payload).eq('id', siteId)
      await supabase.from('site_assignments').delete().eq('site_id', siteId)
      await supabase.from('workload_log').delete().eq('site_id', siteId)
    } else {
      const { data } = await supabase.from('sites').insert(payload).select().single()
      siteId = data.id
    }
    const assignments = []
    if (form.pic_id) assignments.push({ site_id: siteId, member_id: form.pic_id, assignment_role: 'PIC' })
    form.crew_ids.forEach(id => {
      if (id !== form.pic_id) assignments.push({ site_id: siteId, member_id: id, assignment_role: 'crew' })
    })
    if (assignments.length > 0) await supabase.from('site_assignments').insert(assignments)
    setSaving(false)
    setShowForm(false)
    fetchAll()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this site?')) return
    await supabase.from('sites').delete().eq('id', id)
    fetchAll()
  }

  const filtered = sites
    .filter(s => tab === 'All' || s.site_status === tab.toLowerCase())
    .filter(s => !search || s.site_name.toLowerCase().includes(search.toLowerCase()) || s.location.toLowerCase().includes(search.toLowerCase()))

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none',
    background: 'white', color: '#0f172a'
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: '#64748b' }}>Loading sites...</div>
    </div>
  )

  return (
    <div style={{ padding: '28px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Sites</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>{sites.length} total sites</p>
        </div>
        <button onClick={openAdd} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: '#2563eb', color: 'white', border: 'none',
          padding: '9px 16px', borderRadius: '8px', fontSize: '13px',
          fontWeight: '500', cursor: 'pointer'
        }}>
          <Plus size={15} /> Add Site
        </button>
      </div>

      {/* Search + Tabs */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '0' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '280px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              placeholder="Search sites..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{ ...inputStyle, paddingLeft: '32px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
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

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Site Name','Location','Date','PIC','Crew','Status','Report','Actions'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>No sites found.</td></tr>
            ) : paginated.map((site, i) => {
              const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
              const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []
              return (
                <tr key={site.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa', transition: 'background 0.1s' }}
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
                      {pic && <Avatar name={pic.team_members.full_name} size={26} index={0} />}
                      <span style={{ color: '#2563eb', fontSize: '13px' }}>{pic?.team_members?.full_name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex' }}>
                      {crew.slice(0, 3).map((c, ci) => (
                        <div key={ci} title={c.team_members?.full_name} style={{ marginLeft: ci > 0 ? '-6px' : 0, border: '2px solid white', borderRadius: '50%' }}>
                          <Avatar name={c.team_members?.full_name || '?'} size={26} index={ci + 1} />
                        </div>
                      ))}
                      {crew.length > 3 && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px', alignSelf: 'center' }}>+{crew.length - 3}</span>}
                      {crew.length === 0 && <span style={{ color: '#94a3b8', fontSize: '13px' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><StatusPill status={site.site_status} colors={STATUS_COLORS} /></td>
                  <td style={{ padding: '12px 16px' }}><StatusPill status={site.report_status} colors={REPORT_COLORS} /></td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => openEdit(site)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px' }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(site.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', padding: '4px' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
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

      {/* Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '20px' }}>
              {editSite ? 'Edit Site' : 'Add New Site'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Site Name *', key: 'site_name', placeholder: 'e.g. Jalan Ampang Survey' },
                { label: 'Location *', key: 'location', placeholder: 'e.g. Jalan Ampang, Kuala Lumpur' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>{label}</label>
                  <input style={inputStyle} value={form[key]} placeholder={placeholder} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[{ label: 'Latitude', key: 'latitude', placeholder: '3.1579' }, { label: 'Longitude', key: 'longitude', placeholder: '101.7151' }].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>{label}</label>
                    <input style={inputStyle} value={form[key]} placeholder={placeholder} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Scheduled Date *</label>
                <input type="date" style={inputStyle} value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { label: 'Site Status', key: 'site_status', options: ['upcoming','ongoing','completed','cancelled','postponed'] },
                  { label: 'Report Status', key: 'report_status', options: ['pending','in_progress','submitted','approved'] },
                ].map(({ label, key, options }) => (
                  <div key={key}>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>{label}</label>
                    <select style={inputStyle} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}>
                      {options.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>PIC</label>
                <select style={inputStyle} value={form.pic_id} onChange={e => setForm(f => ({ ...f, pic_id: e.target.value }))}>
                  <option value="">— Select PIC —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '8px' }}>Crew</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {members.map(m => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.crew_ids.includes(m.id)} onChange={() => toggleCrew(m.id)} style={{ accentColor: '#2563eb', width: '15px', height: '15px' }} />
                      <span style={{ fontSize: '13px', color: '#0f172a' }}>{m.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Notes</label>
                <textarea style={{ ...inputStyle, resize: 'none' }} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
              </div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={handleSave} disabled={saving} style={{ flex: 1, background: '#2563eb', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving...' : editSite ? 'Save Changes' : 'Add Site'}
                </button>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, background: '#f1f5f9', color: '#0f172a', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
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