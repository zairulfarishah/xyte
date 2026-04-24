import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Search, Upload, Download, Trash2, FileText, File } from 'lucide-react'

const CATEGORY_COLORS = {
  'Report Templates': { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  'Safety Forms':     { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  'Site Checklists':  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  'Guidelines':       { bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd' },
  'General':          { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
}

const FILE_COLORS = {
  pdf:  { bg: '#fee2e2', text: '#991b1b' },
  docx: { bg: '#eff6ff', text: '#1d4ed8' },
  xlsx: { bg: '#f0fdf4', text: '#166534' },
  pptx: { bg: '#fff7ed', text: '#9a3412' },
  jpg:  { bg: '#faf5ff', text: '#6d28d9' },
  png:  { bg: '#faf5ff', text: '#6d28d9' },
  dwg:  { bg: '#fef9c3', text: '#854d0e' },
}

function FileTypeBadge({ type }) {
  const t = type?.toLowerCase() || 'file'
  const c = FILE_COLORS[t] || { bg: '#f1f5f9', text: '#475569' }
  return (
    <span style={{
      background: c.bg, color: c.text, padding: '2px 8px',
      borderRadius: '6px', fontSize: '11px', fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: '0.05em'
    }}>{t}</span>
  )
}

function formatSize(kb) {
  if (!kb) return '—'
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

const CATEGORIES = ['All', 'Report Templates', 'Safety Forms', 'Site Checklists', 'Guidelines', 'General']

export default function Library() {
  const [docs, setDocs]           = useState([])
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [search, setSearch]       = useState('')
  const [category, setCategory]   = useState('All')
  const [page, setPage]           = useState(1)
  const [form, setForm]           = useState({ title: '', description: '', category: 'General', uploaded_by: '' })
  const [file, setFile]           = useState(null)
  const PER_PAGE = 8

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: d } = await supabase
      .from('library_documents')
      .select('*, team_members(full_name)')
      .order('created_at', { ascending: false })
    const { data: m } = await supabase
      .from('team_members').select('id, full_name').order('full_name')
    setDocs(d || [])
    setMembers(m || [])
    setLoading(false)
  }

  async function handleUpload() {
    if (!file || !form.title) return
    setUploading(true)
    const ext      = file.name.split('.').pop().toLowerCase()
    const filePath = `documents/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
    const { error } = await supabase.storage.from('library').upload(filePath, file)
    if (error) { alert('Upload failed: ' + error.message); setUploading(false); return }
    await supabase.from('library_documents').insert({
      title: form.title, description: form.description,
      category: form.category, file_path: filePath,
      file_type: ext, file_size_kb: Math.round(file.size / 1024),
      uploaded_by: form.uploaded_by || null,
    })
    setUploading(false)
    setShowForm(false)
    setForm({ title: '', description: '', category: 'General', uploaded_by: '' })
    setFile(null)
    fetchAll()
  }

  async function handleDownload(doc) {
    const { data } = await supabase.storage.from('library').createSignedUrl(doc.file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(doc) {
    if (!confirm('Delete this document?')) return
    await supabase.storage.from('library').remove([doc.file_path])
    await supabase.from('library_documents').delete().eq('id', doc.id)
    fetchAll()
  }

  const filtered = docs
    .filter(d => category === 'All' || d.category === category)
    .filter(d => !search || d.title.toLowerCase().includes(search.toLowerCase()))

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none',
    background: 'white', color: '#0f172a'
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: '#64748b' }}>Loading library...</div>
    </div>
  )

  return (
    <div style={{ padding: '28px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Library</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>{docs.length} documents</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: '#2563eb', color: 'white', border: 'none',
          padding: '9px 16px', borderRadius: '8px', fontSize: '13px',
          fontWeight: '500', cursor: 'pointer'
        }}>
          <Upload size={15} /> Upload Document
        </button>
      </div>

      {/* Table card */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '280px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              placeholder="Search documents..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{ ...inputStyle, paddingLeft: '32px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => { setCategory(c); setPage(1) }} style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
                fontWeight: '500', cursor: 'pointer', border: 'none',
                background: category === c ? '#2563eb' : 'transparent',
                color: category === c ? 'white' : '#64748b',
                transition: 'all 0.15s'
              }}>{c}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Name', 'Type', 'Category', 'Uploaded By', 'Date', 'Size', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '60px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <FileText size={32} color="#cbd5e1" />
                    <p style={{ color: '#94a3b8', fontWeight: '500' }}>No documents yet</p>
                    <p style={{ color: '#cbd5e1', fontSize: '12px' }}>Click "Upload Document" to add your first file</p>
                  </div>
                </td>
              </tr>
            ) : paginated.map((doc, i) => {
              const catColor = CATEGORY_COLORS[doc.category] || CATEGORY_COLORS['General']
              return (
                <tr key={doc.id}
                  style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafafa'}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <File size={16} color="#64748b" />
                      </div>
                      <div>
                        <p style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>{doc.title}</p>
                        {doc.description && <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{doc.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><FileTypeBadge type={doc.file_type} /></td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: catColor.bg, color: catColor.text, border: `1px solid ${catColor.border}`, padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '500', whiteSpace: 'nowrap' }}>
                      {doc.category}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#475569' }}>{doc.team_members?.full_name || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {new Date(doc.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{formatSize(doc.file_size_kb)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleDownload(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', display: 'flex', alignItems: 'center', padding: '4px' }}>
                        <Download size={15} />
                      </button>
                      <button onClick={() => handleDelete(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', padding: '4px' }}>
                        <Trash2 size={15} />
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

      {/* Upload Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '20px' }}>Upload Document</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>File *</label>
                <input type="file" onChange={e => setFile(e.target.files[0])} style={{ width: '100%', fontSize: '13px', color: '#64748b' }} />
                {file && <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{file.name} — {formatSize(Math.round(file.size / 1024))}</p>}
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Title *</label>
                <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. GPR Report Template v2" />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Description</label>
                <textarea style={{ ...inputStyle, resize: 'none' }} rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description..." />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Category</label>
                <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {['General','Report Templates','Safety Forms','Site Checklists','Guidelines'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '5px' }}>Uploaded by</label>
                <select style={inputStyle} value={form.uploaded_by} onChange={e => setForm(f => ({ ...f, uploaded_by: e.target.value }))}>
                  <option value="">— Select member —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={handleUpload} disabled={uploading || !file || !form.title} style={{ flex: 1, background: '#2563eb', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading || !file || !form.title ? 0.6 : 1 }}>
                  {uploading ? 'Uploading...' : 'Upload'}
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