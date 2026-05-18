import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { Download, Upload, ChevronDown, ChevronRight, FileText, File, X, Trash2, Eye, Plus } from 'lucide-react'
import mammoth from 'mammoth'
import { useViewport } from '../utils/useViewport'
import CompileExport from '../components/CompileExport'

const SECTIONS = [
  { key: 'xradar_namelist',  label: 'Xradar Namelist',  type: 'single', color: '#2563eb', bg: '#eff6ff' },
  { key: 'cidb',             label: 'CIDB',              type: 'member', color: '#7c3aed', bg: '#faf5ff' },
  { key: 'identity_card',    label: 'Identity Card',     type: 'member', color: '#db2777', bg: '#fdf2f8' },
  { key: 'ntsp',             label: 'NTSP',              type: 'member', color: '#059669', bg: '#f0fdf4' },
  { key: 'ansp',             label: 'ANSP',              type: 'member', color: '#0891b2', bg: '#ecfeff' },
  { key: 'ogsp',             label: 'OGSP',              type: 'member', color: '#d97706', bg: '#fffbeb' },
  { key: 'form_template',    label: 'Form Template',     type: 'sub',    color: '#0f172a', bg: '#f8fafc' },
  { key: 'drawing_template', label: 'Drawing Template',  type: 'multi',  color: '#475569', bg: '#f1f5f9' },
]

const DEFAULT_FORM_SUBS = ['Beam', 'Slab', 'Column', 'Plinth']

const CUSTOM_COLORS = [
  { color: '#7c3aed', bg: '#faf5ff' },
  { color: '#059669', bg: '#f0fdf4' },
  { color: '#0891b2', bg: '#ecfeff' },
  { color: '#d97706', bg: '#fffbeb' },
  { color: '#db2777', bg: '#fdf2f8' },
  { color: '#dc2626', bg: '#fef2f2' },
  { color: '#2563eb', bg: '#eff6ff' },
]

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

const CUSTOM_SECTIONS_PATH  = 'app-data/custom-sections.json'
const FORM_SUBS_PATH        = 'app-data/form-template-subs.json'

async function loadJson(path) {
  const { data, error } = await supabase.storage.from('library').download(path)
  if (error) return []
  try {
    const raw = await data.text()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

async function saveJson(path, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  await supabase.storage.from('library').upload(path, blob, {
    upsert: true, contentType: 'application/json', cacheControl: '0',
  })
}

export default function Library() {
  const { isZairul, memberId: myMemberId } = useAuth()
  const { isMobile } = useViewport()

  const [docs, setDocs]                       = useState([])
  const [members, setMembers]                 = useState([])
  const [loading, setLoading]                 = useState(true)
  const [openSecs, setOpenSecs]               = useState(new Set())
  const [openFormSubs, setOpenFormSubs]       = useState(new Set())
  const [customSections, setCustomSections]   = useState([])
  const [customFormSubs, setCustomFormSubs]   = useState([])

  const [showUpload, setShowUpload]           = useState(false)
  const [uploading, setUploading]             = useState(false)
  const [form, setForm]                       = useState({ section: '', member_id: '', subcategory: '' })
  const [lockedMemberId, setLockedMemberId]   = useState(null)
  const [file, setFile]                       = useState(null)
  const [uploadError, setUploadError]         = useState(null)

  const [preview, setPreview]                 = useState(null)
  const [previewing, setPreviewing]           = useState(false)

  const [showAddList, setShowAddList]         = useState(false)
  const [newListName, setNewListName]         = useState('')
  const [addingList, setAddingList]           = useState(false)

  const [showAddFormSub, setShowAddFormSub]   = useState(false)
  const [newFormSubName, setNewFormSubName]   = useState('')
  const [addingFormSub, setAddingFormSub]     = useState(false)

  const fileRef = useRef(null)

  const allFormSubs    = [...DEFAULT_FORM_SUBS, ...customFormSubs]
  const allSections    = [
    ...SECTIONS,
    ...customSections.map(cs => ({ ...cs, type: 'multi', custom: true })),
  ]

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: d }, { data: m }, custom, formSubs] = await Promise.all([
      supabase.from('library_documents')
        .select('*, team_members(id, full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('team_members').select('id, full_name').order('full_name'),
      loadJson(CUSTOM_SECTIONS_PATH),
      loadJson(FORM_SUBS_PATH),
    ])
    setDocs(d || [])
    setMembers(m || [])
    setCustomSections(custom)
    setCustomFormSubs(formSubs)
    setLoading(false)
  }

  function toggleSec(key) {
    setOpenSecs(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleFormSub(sub) {
    setOpenFormSubs(prev => {
      const next = new Set(prev)
      next.has(sub) ? next.delete(sub) : next.add(sub)
      return next
    })
  }

  function openUploadFor(sectionKey, subcat = '', forceMemberId = null) {
    const sec = allSections.find(s => s.key === sectionKey)
    const locked = forceMemberId || (!isZairul && sec?.type === 'member' ? myMemberId : null)
    setLockedMemberId(locked)
    setForm({
      section: sectionKey,
      member_id: locked || '',
      subcategory: subcat || (sectionKey === 'form_template' ? (allFormSubs[0] || '') : ''),
    })
    setFile(null)
    setUploadError(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowUpload(true)
  }

  function openUploadBlank() {
    const locked = !isZairul ? myMemberId : null
    setLockedMemberId(locked)
    setForm({ section: '', member_id: locked || '', subcategory: '' })
    setFile(null)
    setUploadError(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowUpload(true)
  }

  async function handleUpload() {
    const sec = allSections.find(s => s.key === form.section)
    if (!file || !form.section) return
    if (sec?.type === 'member' && !form.member_id)   { setUploadError('Please select a team member.'); return }
    if (form.section === 'form_template' && !form.subcategory) { setUploadError('Please select a sub-section.'); return }

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
      member_id:   form.member_id   || null,
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
      const resp   = await fetch(url)
      const buf    = await resp.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer: buf })
      setPreview({ doc, url, html: result.value })
      setPreviewing(false)
      return
    }
    window.open(url, '_blank')
    setPreviewing(false)
  }

  async function handleDelete(doc) {
    if (!confirm('Delete this file?')) return
    await supabase.storage.from('library').remove([doc.file_path])
    await supabase.from('library_documents').delete().eq('id', doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
  }

  async function handleDeleteSection(key) {
    if (!confirm('Delete this entire list and all its files?')) return
    const sectionDocs = docs.filter(d => d.section === key)
    for (const doc of sectionDocs) {
      await supabase.storage.from('library').remove([doc.file_path])
      await supabase.from('library_documents').delete().eq('id', doc.id)
    }
    const updated = customSections.filter(s => s.key !== key)
    setCustomSections(updated)
    await saveJson(CUSTOM_SECTIONS_PATH, updated)
    setDocs(prev => prev.filter(d => d.section !== key))
  }

  async function handleDeleteFormSub(sub) {
    if (!DEFAULT_FORM_SUBS.includes(sub)) {
      if (!confirm(`Delete sub-section "${sub}" and all its files?`)) return
      const subDocs = docs.filter(d => d.section === 'form_template' && d.subcategory === sub)
      for (const doc of subDocs) {
        await supabase.storage.from('library').remove([doc.file_path])
        await supabase.from('library_documents').delete().eq('id', doc.id)
      }
      const updated = customFormSubs.filter(s => s !== sub)
      setCustomFormSubs(updated)
      await saveJson(FORM_SUBS_PATH, updated)
      setDocs(prev => prev.filter(d => !(d.section === 'form_template' && d.subcategory === sub)))
    }
  }

  async function handleAddList() {
    if (!newListName.trim()) return
    setAddingList(true)
    const key = 'custom_' + newListName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now()
    const colorIdx = customSections.length % CUSTOM_COLORS.length
    const newSection = { key, label: newListName.trim(), custom: true, ...CUSTOM_COLORS[colorIdx], created_at: new Date().toISOString() }
    const updated = [...customSections, newSection]
    setCustomSections(updated)
    await saveJson(CUSTOM_SECTIONS_PATH, updated)
    setNewListName('')
    setShowAddList(false)
    setAddingList(false)
  }

  async function handleAddFormSub() {
    if (!newFormSubName.trim()) return
    const name = newFormSubName.trim()
    if (allFormSubs.includes(name)) { return }
    setAddingFormSub(true)
    const updated = [...customFormSubs, name]
    setCustomFormSubs(updated)
    await saveJson(FORM_SUBS_PATH, updated)
    setNewFormSubName('')
    setShowAddFormSub(false)
    setAddingFormSub(false)
    setOpenFormSubs(prev => new Set([...prev, name]))
  }

  const getSingle   = key       => docs.find(d => d.section === key) || null
  const getMember   = (key, id) => docs.find(d => d.section === key && d.member_id === id) || null
  const getMulti    = key       => docs.filter(d => d.section === key)
  const getSubDocs  = sub       => docs.filter(d => d.section === 'form_template' && d.subcategory === sub)

  const selectedSec = allSections.find(s => s.key === form.section)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ color: '#64748b', fontSize: '14px' }}>Loading library…</div>
    </div>
  )

  const uploadBtn = { display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: '600', color: '#475569', cursor: 'pointer' }
  const dlBtn     = color => ({ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', borderRadius: '8px', background: color, color: 'white', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' })
  const prevBtn   = { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }
  const delBtn    = { padding: '5px', borderRadius: '6px', background: '#fee2e2', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex' }

  function TypeBadge({ type }) {
    const b = TYPE_BADGE[type] || { bg: '#f1f5f9', text: '#475569' }
    return <span style={{ background: b.bg, color: b.text, padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{type}</span>
  }

  function DocRow({ doc, color, idx, total }) {
    return (
      <div style={{ padding: isMobile ? '10px 14px' : '10px 24px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: '10px', borderBottom: idx < total - 1 ? '1px solid #f8fafc' : 'none', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <FileText size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <TypeBadge type={doc.file_type} />
          {doc.file_type !== 'zip' && (
            <button onClick={() => handlePreview(doc)} style={prevBtn} disabled={previewing}><Eye size={11} /> Preview</button>
          )}
          <button onClick={() => handleDownload(doc)} style={dlBtn(color)}><Download size={11} /> Download</button>
          {isZairul && <button onClick={() => handleDelete(doc)} style={delBtn}><Trash2 size={12} /></button>}
        </div>
      </div>
    )
  }

  function renderMultiSection(sec) {
    const isOpen    = openSecs.has(sec.key)
    const multiDocs = getMulti(sec.key)
    return (
      <div key={sec.key} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <button
          onClick={() => toggleSec(sec.key)}
          style={{ width: '100%', padding: isMobile ? '14px' : '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: sec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileText size={20} color={sec.color} />
            </div>
            <div>
              <p style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{sec.label}</p>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>{multiDocs.length} file{multiDocs.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <button onClick={e => { e.stopPropagation(); openUploadFor(sec.key) }} style={uploadBtn}><Upload size={12} /> Upload</button>
            {isZairul && sec.custom && (
              <button onClick={e => { e.stopPropagation(); handleDeleteSection(sec.key) }} style={delBtn}><Trash2 size={13} /></button>
            )}
            {isOpen ? <ChevronDown size={18} color="#64748b" /> : <ChevronRight size={18} color="#64748b" />}
          </div>
        </button>
        {isOpen && (
          <div style={{ borderTop: '1px solid #f1f5f9' }}>
            {multiDocs.length === 0
              ? <p style={{ padding: '20px 24px', fontSize: '13px', color: '#94a3b8', textAlign: 'center' }}>No files uploaded yet.</p>
              : multiDocs.map((doc, idx) => <DocRow key={doc.id} doc={doc} color={sec.color} idx={idx} total={multiDocs.length} />)
            }
          </div>
        )}
      </div>
    )
  }

  function renderFormTemplate() {
    const sec    = SECTIONS.find(s => s.key === 'form_template')
    const isOpen = openSecs.has('form_template')
    const totalDocs = docs.filter(d => d.section === 'form_template').length
    return (
      <div key="form_template" style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <button
          onClick={() => toggleSec('form_template')}
          style={{ width: '100%', padding: isMobile ? '14px' : '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: sec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', flexShrink: 0 }}>
              <File size={20} color={sec.color} />
            </div>
            <div>
              <p style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{sec.label}</p>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>
                {allFormSubs.length} sub-section{allFormSubs.length !== 1 ? 's' : ''} · {totalDocs} file{totalDocs !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            {isOpen ? <ChevronDown size={18} color="#64748b" /> : <ChevronRight size={18} color="#64748b" />}
          </div>
        </button>

        {isOpen && (
          <div style={{ borderTop: '1px solid #f1f5f9' }}>
            {allFormSubs.map((sub, subIdx) => {
              const subDocs   = getSubDocs(sub)
              const isSubOpen = openFormSubs.has(sub)
              const isCustom  = !DEFAULT_FORM_SUBS.includes(sub)
              return (
                <div key={sub} style={{ borderBottom: subIdx < allFormSubs.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <button
                    onClick={() => toggleFormSub(sub)}
                    style={{ width: '100%', padding: isMobile ? '11px 14px' : '12px 24px 12px 80px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isSubOpen ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                      <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{sub}</p>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{subDocs.length} file{subDocs.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        onClick={e => { e.stopPropagation(); openUploadFor('form_template', sub) }}
                        style={uploadBtn}
                      >
                        <Upload size={11} /> Upload
                      </button>
                      {isZairul && isCustom && (
                        <button onClick={e => { e.stopPropagation(); handleDeleteFormSub(sub) }} style={delBtn}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </button>

                  {isSubOpen && (
                    <div style={{ background: '#fafafa', borderTop: '1px solid #f1f5f9' }}>
                      {subDocs.length === 0
                        ? <p style={{ padding: '14px 24px 14px 80px', fontSize: '12px', color: '#94a3b8' }}>No files yet. Upload one above.</p>
                        : subDocs.map((doc, idx) => <DocRow key={doc.id} doc={doc} color={sec.color} idx={idx} total={subDocs.length} />)
                      }
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add sub-section button */}
            <div style={{ padding: isMobile ? '12px 14px' : '12px 24px 12px 80px' }}>
              <button
                onClick={() => { setNewFormSubName(''); setShowAddFormSub(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', background: 'none', border: '1px dashed #cbd5e1', fontSize: '12px', fontWeight: '600', color: '#94a3b8', cursor: 'pointer' }}
              >
                <Plus size={12} /> Add Sub-section
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 88px,#dde4ed 88px 100%)' }}>

      {/* Header */}
      <div style={{ padding: isMobile ? '18px 14px 0' : '24px 40px 0', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Library</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>Team documents &amp; templates</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <CompileExport members={members} docs={docs} />
          <button
            onClick={() => { setNewListName(''); setShowAddList(true) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.18)', padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', flex: isMobile ? 1 : 'none' }}
          >
            <Plus size={14} /> New List
          </button>
          <button
            onClick={openUploadBlank}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#2563eb', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', flex: isMobile ? 1 : 'none' }}
          >
            <Upload size={14} /> Upload Document
          </button>
        </div>
      </div>

      {/* Section list */}
      <div style={{ padding: isMobile ? '16px 14px 28px' : '24px 40px 48px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {allSections.map(sec => {
          const isOpen = openSecs.has(sec.key)

          if (sec.type === 'single') {
            const doc = getSingle(sec.key)
            return (
              <div key={sec.key} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ padding: isMobile ? '14px' : '18px 24px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: sec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={20} color={sec.color} />
                    </div>
                    <div>
                      <p style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{sec.label}</p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>{doc ? doc.file_name : 'No file uploaded yet'}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {isZairul && <button onClick={() => openUploadFor(sec.key)} style={uploadBtn}><Upload size={12} /> Upload</button>}
                    {doc ? (
                      <>
                        <TypeBadge type={doc.file_type} />
                        {doc.file_type !== 'zip' && <button onClick={() => handlePreview(doc)} style={prevBtn} disabled={previewing}><Eye size={12} /> Preview</button>}
                        <button onClick={() => handleDownload(doc)} style={dlBtn(sec.color)}><Download size={12} /> Download</button>
                        {isZairul && <button onClick={() => handleDelete(doc)} style={delBtn}><Trash2 size={13} /></button>}
                      </>
                    ) : <span style={{ fontSize: '12px', color: '#cbd5e1' }}>—</span>}
                  </div>
                </div>
              </div>
            )
          }

          if (sec.type === 'multi') return renderMultiSection(sec)

          if (sec.type === 'sub') return renderFormTemplate()

          if (sec.type === 'member') {
            return (
              <div key={sec.key} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <button
                  onClick={() => toggleSec(sec.key)}
                  style={{ width: '100%', padding: isMobile ? '14px' : '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: sec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={20} color={sec.color} />
                    </div>
                    <div>
                      <p style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{sec.label}</p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>Personal documents · {members.length} members</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                    {isZairul && <button onClick={e => { e.stopPropagation(); openUploadFor(sec.key) }} style={uploadBtn}><Upload size={12} /> Upload</button>}
                    {isOpen ? <ChevronDown size={18} color="#64748b" /> : <ChevronRight size={18} color="#64748b" />}
                  </div>
                </button>
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    {members.map((m, idx) => {
                      const doc = getMember(sec.key, m.id)
                      const initials = m.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                      const canUpload = isZairul || m.id === myMemberId
                      return (
                        <div key={m.id} style={{ padding: isMobile ? '12px 14px' : '12px 24px 12px 80px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: '10px', borderBottom: idx < members.length - 1 ? '1px solid #f8fafc' : 'none', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: sec.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: sec.color, flexShrink: 0 }}>
                              {initials}
                            </div>
                            <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{m.full_name}</p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {canUpload && !doc && <button onClick={() => openUploadFor(sec.key, '', m.id)} style={uploadBtn}><Upload size={11} /> Upload</button>}
                            {doc ? (
                              <>
                                <TypeBadge type={doc.file_type} />
                                {doc.file_type !== 'zip' && <button onClick={() => handlePreview(doc)} style={prevBtn} disabled={previewing}><Eye size={11} /> Preview</button>}
                                <button onClick={() => handleDownload(doc)} style={dlBtn(sec.color)}><Download size={11} /> Download</button>
                                {canUpload && <button onClick={() => openUploadFor(sec.key, '', m.id)} style={uploadBtn}><Upload size={11} /> Replace</button>}
                                {isZairul && <button onClick={() => handleDelete(doc)} style={delBtn}><Trash2 size={12} /></button>}
                              </>
                            ) : (
                              !canUpload && <span style={{ fontSize: '12px', color: '#cbd5e1' }}>No file</span>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: isMobile ? '14px' : '24px' }} onClick={e => e.target === e.currentTarget && setPreview(null)}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '860px', height: isMobile ? '92vh' : '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewing ? 'Loading preview…' : preview?.doc?.file_name}</p>
                {!previewing && preview && <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', textTransform: 'uppercase' }}>{preview.doc.file_type}</p>}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                {preview && <button onClick={() => handleDownload(preview.doc)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}><Download size={13} /> Download</button>}
                <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: '4px' }}><X size={20} /></button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', background: '#f8fafc' }}>
              {previewing && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: '#64748b', fontSize: '14px' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />Loading…
                </div>
              )}
              {!previewing && preview?.doc?.file_type === 'pdf' && <iframe src={preview.url} style={{ width: '100%', height: '100%', border: 'none' }} title={preview.doc.file_name} />}
              {!previewing && preview?.html != null && <div style={{ height: '100%', overflowY: 'auto', padding: isMobile ? '18px' : '32px 40px', background: 'white', fontSize: '14px', lineHeight: '1.7', color: '#0f172a', fontFamily: 'Georgia, serif' }} dangerouslySetInnerHTML={{ __html: preview.html }} />}
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }} onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '440px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,.18)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>Upload Document</p>
              <button onClick={() => setShowUpload(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={18} /></button>
            </div>
            <div style={{ padding: isMobile ? '16px 18px' : '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              <div>
                <label style={lLabel}>Section *</label>
                <select style={lightInput} value={form.section} onChange={e => {
                  const key = e.target.value
                  const sec = allSections.find(s => s.key === key)
                  const locked = !isZairul && sec?.type === 'member' ? myMemberId : null
                  setLockedMemberId(locked)
                  setForm(f => ({
                    ...f,
                    section: key,
                    member_id: locked || '',
                    subcategory: key === 'form_template' ? (allFormSubs[0] || '') : '',
                  }))
                }}>
                  <option value="">— Select section —</option>
                  {allSections
                    .filter(s => isZairul || s.type === 'member' || s.type === 'multi' || s.key === 'form_template')
                    .map(s => <option key={s.key} value={s.key}>{s.label}</option>)
                  }
                </select>
              </div>

              {form.section === 'form_template' && (
                <div>
                  <label style={lLabel}>Sub-section *</label>
                  <select style={lightInput} value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}>
                    <option value="">— Select sub-section —</option>
                    {allFormSubs.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {selectedSec?.type === 'member' && (
                <div>
                  <label style={lLabel}>Team Member *</label>
                  {lockedMemberId ? (
                    <div style={{ ...lightInput, background: '#f8fafc', color: '#475569', cursor: 'not-allowed' }}>
                      {members.find(m => m.id === lockedMemberId)?.full_name || '—'}
                    </div>
                  ) : (
                    <select style={lightInput} value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}>
                      <option value="">— Select member —</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label style={lLabel}>File *</label>
                <input ref={fileRef} type="file" onChange={e => setFile(e.target.files[0] || null)} style={{ width: '100%', fontSize: '13px', color: '#64748b' }} />
                {file && <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>{file.name} — {(file.size / 1024).toFixed(0)} KB</p>}
              </div>

              {uploadError && <p style={{ fontSize: '12px', color: '#ef4444', background: '#fee2e2', padding: '8px 12px', borderRadius: '8px' }}>{uploadError}</p>}

              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', paddingTop: '4px' }}>
                <button onClick={handleUpload} disabled={uploading || !file || !form.section} style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: 'white', border: 'none', cursor: uploading || !file || !form.section ? 'not-allowed' : 'pointer', background: '#2563eb', opacity: uploading || !file || !form.section ? 0.5 : 1 }}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button onClick={() => setShowUpload(false)} style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#0f172a', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New List Modal */}
      {showAddList && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }} onClick={e => e.target === e.currentTarget && setShowAddList(false)}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '400px', overflow: 'hidden', boxShadow: '0 24px 64px rgba(15,23,42,.18)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>New List</p>
              <button onClick={() => setShowAddList(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={lLabel}>List Name *</label>
                <input style={lightInput} type="text" placeholder="e.g. Malaysia Standard Documents" value={newListName} onChange={e => setNewListName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddList()} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleAddList} disabled={addingList || !newListName.trim()} style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: 'white', border: 'none', cursor: addingList || !newListName.trim() ? 'not-allowed' : 'pointer', background: '#2563eb', opacity: addingList || !newListName.trim() ? 0.5 : 1 }}>
                  {addingList ? 'Creating…' : 'Create List'}
                </button>
                <button onClick={() => setShowAddList(false)} style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#0f172a', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Form Template Sub-section Modal */}
      {showAddFormSub && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }} onClick={e => e.target === e.currentTarget && setShowAddFormSub(false)}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '400px', overflow: 'hidden', boxShadow: '0 24px 64px rgba(15,23,42,.18)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>New Sub-section</p>
              <button onClick={() => setShowAddFormSub(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={lLabel}>Sub-section Name *</label>
                <input style={lightInput} type="text" placeholder="e.g. Truss, Footing, Wall" value={newFormSubName} onChange={e => setNewFormSubName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddFormSub()} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleAddFormSub} disabled={addingFormSub || !newFormSubName.trim()} style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: 'white', border: 'none', cursor: addingFormSub || !newFormSubName.trim() ? 'not-allowed' : 'pointer', background: '#2563eb', opacity: addingFormSub || !newFormSubName.trim() ? 0.5 : 1 }}>
                  {addingFormSub ? 'Creating…' : 'Create'}
                </button>
                <button onClick={() => setShowAddFormSub(false)} style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#0f172a', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
