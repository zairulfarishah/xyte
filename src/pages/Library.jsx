import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { Download, Upload, ChevronDown, ChevronRight, FileText, File, X, Trash2, Eye } from 'lucide-react'
import mammoth from 'mammoth'

const SECTIONS = [
  { key: 'xradar_namelist',  label: 'Xradar Namelist',  type: 'single', color: '#2563eb', bg: '#eff6ff' },
  { key: 'cidb',             label: 'CIDB',              type: 'member', color: '#7c3aed', bg: '#faf5ff' },
  { key: 'identity_card',    label: 'Identity Card',     type: 'member', color: '#db2777', bg: '#fdf2f8' },
  { key: 'ntsp',             label: 'NTSP',              type: 'member', color: '#059669', bg: '#f0fdf4' },
  { key: 'ansp',             label: 'ANSP',              type: 'member', color: '#0891b2', bg: '#ecfeff' },
  { key: 'ogsp',             label: 'OGSP',              type: 'member', color: '#d97706', bg: '#fffbeb' },
  { key: 'form_template',    label: 'Form Template',     type: 'sub',    color: '#0f172a', bg: '#f8fafc' },
  { key: 'drawing_template', label: 'Drawing Template',  type: 'single', color: '#475569', bg: '#f1f5f9' },
]

const FORM_SUBS = ['Beam', 'Slab', 'Column', 'Plinth']

const TYPE_BADGE = {
  pdf:  { bg: '#fee2e2', text: '#991b1b' },
  docx: { bg: '#eff6ff', text: '#1d4ed8' },
  zip:  { bg: '#fef9c3', text: '#854d0e' },
}

const lightInput = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none',
  background: 'white', color: '#0f172a', fontFamily: 'inherit', boxSizing: 'border-box',
}

const lLabel = { display: 'block', fontSize: '12px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }

export default function Library() {
  const { isZairul } = useAuth()
  const [docs, setDocs]               = useState([])
  const [members, setMembers]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [openSecs, setOpenSecs]       = useState(new Set())
  const [showUpload, setShowUpload]   = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [form, setForm]               = useState({ section: '', member_id: '', subcategory: '', file_type: 'pdf' })
  const [file, setFile]               = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [preview, setPreview]         = useState(null) // { doc, url, html }
  const [previewing, setPreviewing]   = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: d }, { data: m }] = await Promise.all([
      supabase.from('library_documents')
        .select('*, team_members(id, full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('team_members').select('id, full_name').order('full_name'),
    ])
    setDocs(d || [])
    setMembers(m || [])
    setLoading(false)
  }

  function toggleSec(key) {
    setOpenSecs(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function openUploadFor(sectionKey) {
    const sec = SECTIONS.find(s => s.key === sectionKey)
    setForm({
      section: sectionKey,
      member_id: '',
      subcategory: sec?.type === 'sub' ? 'Beam' : '',
      file_type: sectionKey === 'drawing_template' ? 'zip' : 'pdf',
    })
    setFile(null)
    setUploadError(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowUpload(true)
  }

  function openUploadBlank() {
    setForm({ section: '', member_id: '', subcategory: '', file_type: 'pdf' })
    setFile(null)
    setUploadError(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowUpload(true)
  }

  async function handleUpload() {
    const sec = SECTIONS.find(s => s.key === form.section)
    if (!file || !form.section) return
    if (sec?.type === 'member' && !form.member_id) { setUploadError('Please select a team member.'); return }
    if (sec?.type === 'sub' && !form.subcategory)  { setUploadError('Please select a template.'); return }

    setUploading(true); setUploadError(null)

    const filePath = `${form.section}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
    const { error: upErr } = await supabase.storage.from('library').upload(filePath, file)
    if (upErr) { setUploadError(upErr.message); setUploading(false); return }

    const ext = file.name.split('.').pop().toLowerCase()
    const { error: dbErr } = await supabase.from('library_documents').insert({
      section:     form.section,
      file_path:   filePath,
      file_name:   file.name,
      file_type:   ext,
      member_id:   form.member_id  || null,
      subcategory: form.subcategory || null,
    })
    if (dbErr) { setUploadError(dbErr.message); setUploading(false); return }

    setUploading(false)
    setShowUpload(false)
    fetchAll()
  }

  async function handleDownload(doc) {
    const { data } = await supabase.storage.from('library').createSignedUrl(doc.file_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handlePreview(doc) {
    const type = doc.file_type?.toLowerCase()
    if (type === 'zip') { handleDownload(doc); return }
    setPreviewing(true)
    const { data } = await supabase.storage.from('library').createSignedUrl(doc.file_path, 300)
    const url = data?.signedUrl
    if (!url) { setPreviewing(false); return }
    if (type === 'pdf') {
      setPreview({ doc, url, html: null })
      setPreviewing(false)
      return
    }
    if (type === 'docx') {
      const resp     = await fetch(url)
      const buf      = await resp.arrayBuffer()
      const result   = await mammoth.convertToHtml({ arrayBuffer: buf })
      setPreview({ doc, url, html: result.value })
      setPreviewing(false)
      return
    }
    // fallback — just open
    window.open(url, '_blank')
    setPreviewing(false)
  }

  async function handleDelete(doc) {
    if (!confirm('Delete this file?')) return
    await supabase.storage.from('library').remove([doc.file_path])
    await supabase.from('library_documents').delete().eq('id', doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
  }

  const getSingle  = key       => docs.find(d => d.section === key) || null
  const getMember  = (key, id) => docs.find(d => d.section === key && d.member_id === id) || null
  const getSubDoc  = (sub, ft) => docs.find(d => d.section === 'form_template' && d.subcategory === sub && d.file_type === ft) || null

  const selectedSec = SECTIONS.find(s => s.key === form.section)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ color: '#64748b', fontSize: '14px' }}>Loading library…</div>
    </div>
  )

  /* ── shared mini styles ── */
  const uploadBtn  = { display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: '600', color: '#475569', cursor: 'pointer' }
  const dlBtn      = color => ({ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', borderRadius: '8px', background: color, color: 'white', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' })
  const prevBtn    = { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }
  const delBtn     = { padding: '5px', borderRadius: '6px', background: '#fee2e2', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex' }

  function TypeBadge({ type }) {
    const b = TYPE_BADGE[type] || { bg: '#f1f5f9', text: '#475569' }
    return <span style={{ background: b.bg, color: b.text, padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{type}</span>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 88px,#dde4ed 88px 100%)' }}>

      {/* Header */}
      <div style={{ padding: '24px 40px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Library</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>Team documents &amp; templates</p>
        </div>
        {isZairul && (
          <button onClick={openUploadBlank} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            <Upload size={14} /> Upload Document
          </button>
        )}
      </div>

      {/* Section list */}
      <div style={{ padding: '24px 40px 48px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {SECTIONS.map(sec => {
          const isOpen = openSecs.has(sec.key)

          /* ── SINGLE type ── */
          if (sec.type === 'single') {
            const doc = getSingle(sec.key)
            return (
              <div key={sec.key} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: sec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={20} color={sec.color} />
                    </div>
                    <div>
                      <p style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{sec.label}</p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>
                        {doc ? doc.file_name : 'No file uploaded yet'}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {isZairul && (
                      <button onClick={() => openUploadFor(sec.key)} style={uploadBtn}>
                        <Upload size={12} /> Upload
                      </button>
                    )}
                    {doc ? (
                      <>
                        <TypeBadge type={doc.file_type} />
                        {doc.file_type !== 'zip' && (
                          <button onClick={() => handlePreview(doc)} style={prevBtn} disabled={previewing}>
                            <Eye size={12} /> Preview
                          </button>
                        )}
                        <button onClick={() => handleDownload(doc)} style={dlBtn(sec.color)}>
                          <Download size={12} /> Download
                        </button>
                        {isZairul && (
                          <button onClick={() => handleDelete(doc)} style={delBtn}><Trash2 size={13} /></button>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#cbd5e1' }}>—</span>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          /* ── MEMBER type ── */
          if (sec.type === 'member') {
            return (
              <div key={sec.key} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <button
                  onClick={() => toggleSec(sec.key)}
                  style={{ width: '100%', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: sec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={20} color={sec.color} />
                    </div>
                    <div>
                      <p style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{sec.label}</p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>Personal documents · {members.length} members</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {isZairul && (
                      <button onClick={e => { e.stopPropagation(); openUploadFor(sec.key) }} style={uploadBtn}>
                        <Upload size={12} /> Upload
                      </button>
                    )}
                    {isOpen
                      ? <ChevronDown size={18} color="#64748b" />
                      : <ChevronRight size={18} color="#64748b" />}
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    {members.map((m, idx) => {
                      const doc = getMember(sec.key, m.id)
                      const initials = m.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                      return (
                        <div key={m.id} style={{ padding: '12px 24px 12px 80px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: idx < members.length - 1 ? '1px solid #f8fafc' : 'none', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: sec.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: sec.color, flexShrink: 0 }}>
                              {initials}
                            </div>
                            <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{m.full_name}</p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {doc ? (
                              <>
                                <TypeBadge type={doc.file_type} />
                                {doc.file_type !== 'zip' && (
                                  <button onClick={() => handlePreview(doc)} style={prevBtn} disabled={previewing}>
                                    <Eye size={11} /> Preview
                                  </button>
                                )}
                                <button onClick={() => handleDownload(doc)} style={dlBtn(sec.color)}>
                                  <Download size={11} /> Download
                                </button>
                                {isZairul && (
                                  <button onClick={() => handleDelete(doc)} style={delBtn}><Trash2 size={12} /></button>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#cbd5e1' }}>No file</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          /* ── SUB type (Form Template) ── */
          if (sec.type === 'sub') {
            return (
              <div key={sec.key} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <button
                  onClick={() => toggleSec(sec.key)}
                  style={{ width: '100%', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: sec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
                      <File size={20} color={sec.color} />
                    </div>
                    <div>
                      <p style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{sec.label}</p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>Beam · Slab · Column · Plinth</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {isZairul && (
                      <button onClick={e => { e.stopPropagation(); openUploadFor(sec.key) }} style={uploadBtn}>
                        <Upload size={12} /> Upload
                      </button>
                    )}
                    {isOpen
                      ? <ChevronDown size={18} color="#64748b" />
                      : <ChevronRight size={18} color="#64748b" />}
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    {FORM_SUBS.map((sub, idx) => {
                      const pdfDoc  = getSubDoc(sub, 'pdf')
                      const docxDoc = getSubDoc(sub, 'docx')
                      const ghostBtn = label => (
                        <span style={{ padding: '6px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #f1f5f9', fontSize: '12px', fontWeight: '600', color: '#cbd5e1' }}>{label}</span>
                      )
                      return (
                        <div key={sub} style={{ padding: '14px 24px 14px 80px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: idx < FORM_SUBS.length - 1 ? '1px solid #f8fafc' : 'none', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                          <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{sub}</p>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {pdfDoc ? (
                              <>
                                <button onClick={() => handlePreview(pdfDoc)} style={prevBtn} disabled={previewing}>
                                  <Eye size={11} /> PDF
                                </button>
                                <button onClick={() => handleDownload(pdfDoc)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                                  <Download size={11} /> PDF
                                </button>
                              </>
                            ) : ghostBtn('PDF')}

                            {docxDoc ? (
                              <>
                                <button onClick={() => handlePreview(docxDoc)} style={prevBtn} disabled={previewing}>
                                  <Eye size={11} /> Word
                                </button>
                                <button onClick={() => handleDownload(docxDoc)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', borderRadius: '8px', background: '#eff6ff', color: '#1d4ed8', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                                  <Download size={11} /> Word
                                </button>
                              </>
                            ) : ghostBtn('Word')}

                            {isZairul && (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {pdfDoc  && <button onClick={() => handleDelete(pdfDoc)}  style={delBtn}><Trash2 size={12} /></button>}
                                {docxDoc && <button onClick={() => handleDelete(docxDoc)} style={delBtn}><Trash2 size={12} /></button>}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return null
        })}
      </div>

      {/* Preview Modal */}
      {(preview || previewing) && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '24px' }}
          onClick={e => e.target === e.currentTarget && setPreview(null)}
        >
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '860px', height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previewing ? 'Loading preview…' : preview?.doc?.file_name}
                </p>
                {!previewing && preview && (
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', textTransform: 'uppercase' }}>{preview.doc.file_type}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                {preview && (
                  <button onClick={() => handleDownload(preview.doc)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    <Download size={13} /> Download
                  </button>
                )}
                <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: '4px' }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'hidden', background: '#f8fafc' }}>
              {previewing && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: '#64748b', fontSize: '14px' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />
                  Loading…
                </div>
              )}
              {!previewing && preview?.doc?.file_type === 'pdf' && (
                <iframe
                  src={preview.url}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title={preview.doc.file_name}
                />
              )}
              {!previewing && preview?.html != null && (
                <div
                  style={{ height: '100%', overflowY: 'auto', padding: '32px 40px', background: 'white', fontSize: '14px', lineHeight: '1.7', color: '#0f172a', fontFamily: 'Georgia, serif' }}
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}
          onClick={e => e.target === e.currentTarget && setShowUpload(false)}
        >
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '440px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,.18)' }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>Upload Document</p>
              <button onClick={() => setShowUpload(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={18} /></button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>

              {/* Section */}
              <div>
                <label style={lLabel}>Section *</label>
                <select style={lightInput} value={form.section} onChange={e => {
                  const key = e.target.value
                  const sec = SECTIONS.find(s => s.key === key)
                  setForm(f => ({
                    ...f,
                    section: key,
                    member_id: '',
                    subcategory: sec?.type === 'sub' ? 'Beam' : '',
                    file_type: key === 'drawing_template' ? 'zip' : 'pdf',
                  }))
                }}>
                  <option value="">— Select section —</option>
                  {SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>

              {/* Member picker */}
              {selectedSec?.type === 'member' && (
                <div>
                  <label style={lLabel}>Team Member *</label>
                  <select style={lightInput} value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}>
                    <option value="">— Select member —</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
              )}

              {/* Sub + file type picker (Form Template) */}
              {selectedSec?.type === 'sub' && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={lLabel}>Template *</label>
                    <select style={lightInput} value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}>
                      {FORM_SUBS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lLabel}>File Type *</label>
                    <select style={lightInput} value={form.file_type} onChange={e => setForm(f => ({ ...f, file_type: e.target.value }))}>
                      <option value="pdf">PDF</option>
                      <option value="docx">Word (DOCX)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* File picker */}
              <div>
                <label style={lLabel}>File *</label>
                <input
                  ref={fileRef}
                  type="file"
                  onChange={e => setFile(e.target.files[0] || null)}
                  style={{ width: '100%', fontSize: '13px', color: '#64748b' }}
                />
                {file && (
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>
                    {file.name} — {(file.size / 1024).toFixed(0)} KB
                  </p>
                )}
              </div>

              {uploadError && (
                <p style={{ fontSize: '12px', color: '#ef4444', background: '#fee2e2', padding: '8px 12px', borderRadius: '8px' }}>{uploadError}</p>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button
                  onClick={handleUpload}
                  disabled={uploading || !file || !form.section}
                  style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: 'white', border: 'none', cursor: uploading || !file || !form.section ? 'not-allowed' : 'pointer', background: '#2563eb', opacity: uploading || !file || !form.section ? 0.5 : 1 }}
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button
                  onClick={() => setShowUpload(false)}
                  style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#0f172a', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #e2e8f0' }}
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
