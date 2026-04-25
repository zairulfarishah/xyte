import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { ChevronLeft, ChevronRight, Pencil, MapPin, Upload, X, Users, FileText, LayoutGrid } from 'lucide-react'

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

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626']

const TYPE_LABELS = {
  site_scanning: 'Site Scanning',
  site_visit:    'Site Visit',
  meeting:       'Meeting',
}

function Avatar({ name, size = 36, index = 0, avatarUrl = null }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: avatarUrl ? '#0f172a' : AVATAR_COLORS[index % AVATAR_COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: '700', fontSize: size * 0.35,
      border: '2px solid white',
    }}>
      {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </div>
  )
}

function StatusPill({ status, colors }) {
  const c = colors[status] || colors[Object.keys(colors)[0]]
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      padding: '4px 12px', borderRadius: '99px', fontSize: '12px',
      fontWeight: '600', textTransform: 'capitalize', whiteSpace: 'nowrap',
    }}>{status?.replace(/_/g, ' ')}</span>
  )
}

export default function SiteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [site, setSite]           = useState(null)
  const [allIds, setAllIds]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('overview')
  const [photos, setPhotos]       = useState([])
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes]         = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: siteData }, { data: allSites }] = await Promise.all([
      supabase
        .from('sites')
        .select('*, site_assignments(assignment_role, member_id, team_members(id, full_name, role, avatar_url))')
        .eq('id', id)
        .single(),
      supabase
        .from('sites')
        .select('id')
        .order('scheduled_date', { ascending: true }),
    ])
    setSite(siteData)
    setNotes(siteData?.notes || '')
    setAllIds(allSites?.map(s => s.id) || [])
    await fetchPhotos()
    setLoading(false)
  }

  async function fetchPhotos() {
    const { data, error } = await supabase.storage
      .from('site-photos')
      .list(`${id}/`, { sortBy: { column: 'created_at', order: 'desc' } })
    if (!error && data) {
      const urls = data
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => ({
          name: f.name,
          url: supabase.storage.from('site-photos').getPublicUrl(`${id}/${f.name}`).data.publicUrl,
        }))
      setPhotos(urls)
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const ext  = file.name.split('.').pop()
      const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      await supabase.storage.from('site-photos').upload(path, file)
    }
    await fetchPhotos()
    setUploading(false)
    e.target.value = ''
  }

  async function handleDeletePhoto(name) {
    await supabase.storage.from('site-photos').remove([`${id}/${name}`])
    setPhotos(p => p.filter(ph => ph.name !== name))
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    await supabase.from('sites').update({ notes }).eq('id', id)
    setSavingNotes(false)
    setSite(s => ({ ...s, notes }))
  }

  const currentIndex = allIds.indexOf(id)
  const prevId = currentIndex > 0 ? allIds[currentIndex - 1] : null
  const nextId = currentIndex < allIds.length - 1 ? allIds[currentIndex + 1] : null

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
      <div style={{ color: '#64748b' }}>Loading...</div>
    </div>
  )

  if (!site) return (
    <div style={{ padding: '28px' }}>
      <p style={{ color: '#64748b' }}>Site not found.</p>
    </div>
  )

  const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
  const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh' }}>

      {/* Dark header */}
      <div style={{ background: '#0f172a', padding: '24px 28px' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
          <Link to="/sites" style={{ color: '#64748b', fontSize: '13px', textDecoration: 'none' }}>Sites</Link>
          <ChevronRight size={13} color="#475569" />
          <span style={{ color: '#94a3b8', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.site_name}</span>
        </div>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.site_name}</h1>
            <StatusPill status={site.site_status} colors={STATUS_COLORS} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => prevId && navigate(`/sites/${prevId}`)}
              disabled={!prevId}
              style={{ width: '34px', height: '34px', borderRadius: '8px', border: '1px solid #1e293b', background: '#1e293b', color: prevId ? '#94a3b8' : '#334155', cursor: prevId ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            ><ChevronLeft size={16} /></button>
            <button
              onClick={() => nextId && navigate(`/sites/${nextId}`)}
              disabled={!nextId}
              style={{ width: '34px', height: '34px', borderRadius: '8px', border: '1px solid #1e293b', background: '#1e293b', color: nextId ? '#94a3b8' : '#334155', cursor: nextId ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            ><ChevronRight size={16} /></button>
            <Link
              to="/sites"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: 'white', textDecoration: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500' }}
            ><Pencil size={13} /> Edit</Link>
          </div>
        </div>

        <p style={{ color: '#475569', fontSize: '13px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={12} color="#475569" /> {site.location}
        </p>
      </div>

      {/* Content */}
      <div style={{ padding: '24px 28px', display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* Left */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Photo gallery */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Site Photos</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}
              >
                <Upload size={12} /> {uploading ? 'Uploading...' : 'Upload Photos'}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
            </div>

            {photos.length === 0 ? (
              <div onClick={() => fileInputRef.current?.click()} style={{ padding: '48px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <Upload size={20} color="#94a3b8" />
                </div>
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>No photos yet. Click to upload site photos.</p>
              </div>
            ) : (
              <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {photos.map(photo => (
                  <div key={photo.name} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', aspectRatio: '4/3', background: '#f1f5f9' }}>
                    <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <button
                      onClick={() => handleDeletePhoto(photo.name)}
                      style={{ position: 'absolute', top: '6px', right: '6px', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    ><X size={11} /></button>
                  </div>
                ))}
                <div onClick={() => fileInputRef.current?.click()} style={{ borderRadius: '8px', border: '2px dashed #e2e8f0', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8fafc' }}>
                  <Upload size={18} color="#94a3b8" />
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 4px' }}>
              {[
                { key: 'overview', label: 'Overview', icon: LayoutGrid },
                { key: 'team',     label: 'Team',     icon: Users      },
                { key: 'notes',    label: 'Notes',    icon: FileText   },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setTab(key)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: tab === key ? '600' : '400',
                  color: tab === key ? '#0f172a' : '#64748b',
                  borderBottom: `2px solid ${tab === key ? '#2563eb' : 'transparent'}`,
                  marginBottom: '-1px',
                }}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            <div style={{ padding: '20px' }}>

              {tab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Site Type',       value: TYPE_LABELS[site.site_type] || 'Site Scanning' },
                    { label: 'Scheduled Date',  value: new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' }) },
                    { label: 'Site Duration',   value: `${site.site_duration_days} day(s)` },
                    { label: 'Report Duration', value: site.report_duration_days > 0 ? `${site.report_duration_days} day(s)` : 'N/A' },
                    { label: 'Location',        value: site.location },
                    { label: 'Coordinates',     value: site.latitude && site.longitude ? `${Number(site.latitude).toFixed(4)}, ${Number(site.longitude).toFixed(4)}` : 'Not set' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'team' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {!pic && crew.length === 0 && (
                    <p style={{ textAlign: 'center', color: '#94a3b8', padding: '24px', fontSize: '13px' }}>No team assigned to this site.</p>
                  )}
                  {pic && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                      <Avatar name={pic.team_members?.full_name} size={48} index={0} avatarUrl={pic.team_members?.avatar_url} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a' }}>{pic.team_members?.full_name}</p>
                        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{pic.team_members?.role}</p>
                      </div>
                      <span style={{ background: '#2563eb', color: 'white', padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: '700' }}>PIC</span>
                    </div>
                  )}
                  {crew.map((c, i) => (
                    <div key={c.member_id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <Avatar name={c.team_members?.full_name} size={48} index={i + 1} avatarUrl={c.team_members?.avatar_url} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a' }}>{c.team_members?.full_name}</p>
                        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{c.team_members?.role}</p>
                      </div>
                      <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: '600' }}>Crew</span>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'notes' && (
                <div>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add notes about this site..."
                    style={{ width: '100%', minHeight: '180px', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#0f172a', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: '1.6' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button onClick={handleSaveNotes} disabled={savingNotes} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '9px 22px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: savingNotes ? 'not-allowed' : 'pointer', opacity: savingNotes ? 0.7 : 1 }}>
                      {savingNotes ? 'Saving...' : 'Save Notes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Info card */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>Site Info</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Scheduled Date', value: new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) },
                { label: 'Site Duration',  value: `${site.site_duration_days} day(s)` },
                { label: 'Site Type',      value: TYPE_LABELS[site.site_type] || 'Site Scanning' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>{label}</p>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{value}</p>
                </div>
              ))}
              <div>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>Report Status</p>
                <StatusPill status={site.report_status} colors={REPORT_COLORS} />
              </div>
            </div>
          </div>

          {/* Site History */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Site History</p>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {[
                { label: 'Site Status',  value: site.site_status?.replace(/_/g, ' '), color: '#2563eb', time: new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) },
                ...(site.site_type === 'site_scanning' ? [{ label: 'Report Status', value: site.report_status?.replace(/_/g, ' '), color: '#7c3aed', time: '—' }] : []),
                { label: 'PIC Assigned', value: pic?.team_members?.full_name || 'None', color: '#059669', time: '—' },
                { label: 'Crew',         value: crew.length > 0 ? `${crew.length} member(s)` : 'None', color: '#d97706', time: '—' },
              ].map((item, i, arr) => (
                <div key={i} style={{ display: 'flex', gap: '12px', paddingBottom: i < arr.length - 1 ? '16px' : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0, marginTop: '3px' }} />
                    {i < arr.length - 1 && <div style={{ width: '1px', flex: 1, background: '#e2e8f0', marginTop: '4px' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>{item.label}</p>
                    <p style={{ fontSize: '11px', color: '#64748b', marginTop: '1px', textTransform: 'capitalize' }}>{item.value}</p>
                    <p style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '1px' }}>{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
