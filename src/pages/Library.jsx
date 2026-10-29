import { activeMembers, isActiveMember } from '../utils/members'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { Download, Upload, ChevronRight, FileText, Folder, X, Trash2, Eye, Plus } from 'lucide-react'
import { useViewport } from '../utils/useViewport'
import CompileExport from '../components/CompileExport'
import { undoableDelete } from '../utils/toast'

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
  const [selected, setSelected]               = useState(SECTIONS[0].key)
  const [dragOver, setDragOver]               = useState(false)
  const [modalDragOver, setModalDragOver]     = useState(false)
  const [customSections, setCustomSections]   = useState([])
  const [customFormSubs, setCustomFormSubs]   = useState([])

  const [showUpload, setShowUpload]           = useState(false)
  const [uploading, setUploading]             = useState(false)
  const [form, setForm]                       = useState({ section: '', member_id: '', subcategory: '' })
  const [lockedMemberId, setLockedMemberId]   = useState(null)
  const [files, setFiles]                     = useState([])
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

  // A file dropped outside a drop zone would otherwise open in the tab and leave the app
  useEffect(() => {
    const stop = e => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop) }
  }, [])

  // Only the first load shows the loading screen; refreshes after an upload stay in place
  async function fetchAll() {
    const [{ data: d }, { data: m }, custom, formSubs] = await Promise.all([
      supabase.from('library_documents')
        .select('*, team_members(id, full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('team_members').select('id, full_name, is_hidden').order('full_name'),
      loadJson(CUSTOM_SECTIONS_PATH),
      loadJson(FORM_SUBS_PATH),
    ])
    setDocs(d || [])
    setMembers(m || [])
    setCustomSections(custom)
    setCustomFormSubs(formSubs)
    setLoading(false)
  }

  function openUploadFor(sectionKey, subcat = '', forceMemberId = null, dropped = []) {
    const sec = allSections.find(s => s.key === sectionKey)
    setLockedMemberId(forceMemberId)
    setForm({
      section: sectionKey,
      member_id: forceMemberId || (sec?.type === 'member' ? myMemberId || '' : ''),
      subcategory: subcat || (sectionKey === 'form_template' ? (allFormSubs[0] || '') : ''),
    })
    setFiles(dropped)
    setUploadError(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowUpload(true)
  }

  function openUploadBlank() {
    setLockedMemberId(null)
    setForm({ section: '', member_id: '', subcategory: '' })
    setFiles([])
    setUploadError(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowUpload(true)
  }

  function addFiles(list) {
    setFiles(prev => [...prev, ...list])
    setUploadError(null)
  }

  async function handleUpload() {
    const sec = allSections.find(s => s.key === form.section)
    if (!files.length || !form.section) return
    if (sec?.type === 'member' && !form.member_id)   { setUploadError('Please select a team member.'); return }
    if (form.section === 'form_template' && !form.subcategory) { setUploadError('Please select a sub-section.'); return }
    if ((sec?.type === 'member' || sec?.type === 'single') && files.length > 1) { setUploadError(`${sec.label} takes one file. Remove the extra files.`); return }

    setUploading(true); setUploadError(null)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = `${form.section}/${Date.now()}_${i}_${file.name.replace(/\s+/g, '_')}`
      const { error: upErr } = await supabase.storage.from('library').upload(filePath, file)
      const { error: dbErr } = upErr ? {} : await supabase.from('library_documents').insert({
        section:     form.section,
        file_path:   filePath,
        file_name:   file.name,
        file_type:   file.name.split('.').pop().toLowerCase(),
        member_id:   form.member_id   || null,
        subcategory: form.subcategory || null,
      })
      const err = upErr || dbErr
      if (err) {
        // Keep the failed file and the ones after it so the user can retry just those
        setFiles(files.slice(i))
        setUploadError(`${file.name}: ${err.message}`)
        setUploading(false)
        if (i > 0) fetchAll()
        return
      }
    }

    setUploading(false)
    setShowUpload(false)
    setSelected(form.section)
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
      const { default: mammoth } = await import('mammoth')
      const result = await mammoth.convertToHtml({ arrayBuffer: buf })
      setPreview({ doc, url, html: result.value })
      setPreviewing(false)
      return
    }
    window.open(url, '_blank')
    setPreviewing(false)
  }

  function handleDelete(doc) {
    undoableDelete({
      label: doc.file_name ? `"${doc.file_name}"` : 'file',
      hide: () => setDocs(prev => prev.filter(d => d.id !== doc.id)),
      restore: () => setDocs(prev => prev.some(d => d.id === doc.id) ? prev : [...prev, doc]),
      commit: async () => {
        const { error } = await supabase.from('library_documents').delete().eq('id', doc.id)
        if (error) throw error
        await supabase.storage.from('library').remove([doc.file_path])
      },
    })
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
    if (selected === key) setSelected(SECTIONS[0].key)
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
    setSelected(key)
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

  const dashBtn   = { display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', background: 'white', border: '1px dashed #94a3b8', fontSize: '12px', fontWeight: '600', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }
  const iconBtn   = { width: '30px', height: '30px', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
  const delBtn    = { padding: '5px', borderRadius: '6px', background: '#fee2e2', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex' }
  const rowStyle  = { padding: isMobile ? '10px 14px' : '10px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f5f9' }
  const groupHead = { padding: isMobile ? '8px 14px' : '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: '11px', fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b' }

  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const initialsOf = name => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const rosterFor = key => members.filter(m => isActiveMember(m) || getMember(key, m.id))

  function TypeBadge({ type }) {
    const b = TYPE_BADGE[type] || { bg: '#f1f5f9', text: '#475569' }
    return <span style={{ background: b.bg, color: b.text, padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{type}</span>
  }

  function DocActions({ doc, onReplace }) {
    return (
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
        <TypeBadge type={doc.file_type} />
        {doc.file_type !== 'zip' && <button title="Preview" onClick={() => handlePreview(doc)} style={iconBtn} disabled={previewing}><Eye size={15} /></button>}
        <button title="Download" onClick={() => handleDownload(doc)} style={iconBtn}><Download size={15} /></button>
        {onReplace && <button title="Replace" onClick={onReplace} style={iconBtn}><Upload size={15} /></button>}
        {isZairul && <button title="Delete" onClick={() => handleDelete(doc)} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={14} /></button>}
      </div>
    )
  }

  function DocRow({ doc, color }) {
    return (
      <div style={rowStyle}>
        <FileText size={18} color={color} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</p>
          <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{fmtDate(doc.created_at)}</p>
        </div>
        <DocActions doc={doc} />
      </div>
    )
  }

  const emptyRow = text => <p style={{ padding: isMobile ? '14px' : '16px 20px', fontSize: '12px', color: '#94a3b8' }}>{text}</p>

  function folderMeta(sec) {
    const n = getMulti(sec.key).length
    const files = `${n} file${n !== 1 ? 's' : ''}`
    if (sec.type === 'member') {
      const roster = activeMembers(members)
      const have = roster.filter(m => getMember(sec.key, m.id)).length
      return { text: `${have}/${roster.length} members`, progress: roster.length ? have / roster.length : 0 }
    }
    if (sec.type === 'sub')    return { text: `${allFormSubs.length} sub-folders · ${files}` }
    if (sec.type === 'single') return { text: n ? 'Latest version' : 'No file yet' }
    return { text: files }
  }

  function renderPanelBody(sec) {
    if (sec.type === 'single') {
      const doc = getSingle(sec.key)
      return doc ? <DocRow doc={doc} color={sec.color} /> : emptyRow('No file uploaded yet.')
    }

    if (sec.type === 'member') {
      return rosterFor(sec.key).map(m => {
        const doc = getMember(sec.key, m.id)
        const avatar = (
          <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: sec.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: sec.color, flexShrink: 0 }}>
            {initialsOf(m.full_name)}
          </div>
        )
        if (!doc) return (
          <div key={m.id} style={{ ...rowStyle, background: 'repeating-linear-gradient(135deg,#fff,#fff 8px,#fafafa 8px,#fafafa 16px)' }}>
            {avatar}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{m.full_name}</p>
              <p style={{ fontSize: '11px', color: '#b45309', marginTop: '2px' }}>No {sec.label} on file</p>
            </div>
            <button onClick={() => openUploadFor(sec.key, '', m.id)} style={{ ...dashBtn, marginLeft: 'auto' }}><Upload size={12} /> Upload</button>
          </div>
        )
        return (
          <div key={m.id} style={rowStyle}>
            {avatar}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{m.full_name}</p>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name} · {fmtDate(doc.created_at)}</p>
            </div>
            <DocActions doc={doc} onReplace={() => openUploadFor(sec.key, '', m.id)} />
          </div>
        )
      })
    }

    if (sec.type === 'sub') {
      return (
        <>
          {allFormSubs.map(sub => {
            const subDocs = getSubDocs(sub)
            return (
              <div key={sub}>
                <div style={groupHead}>
                  <span>{sub} · {subDocs.length}</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button onClick={() => openUploadFor('form_template', sub)} style={dashBtn}><Upload size={11} /> Upload</button>
                    {isZairul && !DEFAULT_FORM_SUBS.includes(sub) && (
                      <button onClick={() => handleDeleteFormSub(sub)} style={delBtn}><Trash2 size={12} /></button>
                    )}
                  </div>
                </div>
                {subDocs.length === 0
                  ? emptyRow('No files yet.')
                  : subDocs.map(doc => <DocRow key={doc.id} doc={doc} color={sec.color} />)}
              </div>
            )
          })}
          <div style={{ padding: isMobile ? '12px 14px' : '12px 20px' }}>
            <button onClick={() => { setNewFormSubName(''); setShowAddFormSub(true) }} style={{ ...dashBtn, color: '#94a3b8', borderColor: '#cbd5e1', background: 'none' }}>
              <Plus size={12} /> Add Sub-section
            </button>
          </div>
        </>
      )
    }

    const multiDocs = getMulti(sec.key)
    return multiDocs.length === 0
      ? emptyRow('No files uploaded yet.')
      : multiDocs.map(doc => <DocRow key={doc.id} doc={doc} color={sec.color} />)
  }

  const current = allSections.find(s => s.key === selected) || allSections[0]
  const currentCount = getMulti(current.key).length

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

      <div style={{ padding: isMobile ? '16px 14px 28px' : '24px 40px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); openUploadFor(current.key, '', null, [...e.dataTransfer.files]) }}
          style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: isMobile ? '12px 14px' : '16px 18px', borderRadius: '14px', border: `2px dashed ${dragOver ? '#2563eb' : '#93c5fd'}`, background: dragOver ? '#dbeafe' : '#f8fbff', transition: 'background .15s' }}
        >
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Upload size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e40af' }}>{isMobile ? 'Upload documents' : 'Drop files here to upload'}</p>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Anyone in the team can add documents. Pick the folder in the next step.</p>
          </div>
          {!isMobile && (
            <button onClick={() => openUploadFor(current.key)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: 'white', border: 'none', padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', flexShrink: 0 }}>
              <Upload size={14} /> Browse
            </button>
          )}
        </div>

        {/* Folder grid */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '150px' : '210px'}, 1fr))`, gap: isMobile ? '10px' : '12px' }}>
          {allSections.map(sec => {
            const on = sec.key === current.key
            const meta = folderMeta(sec)
            return (
              <button
                key={sec.key}
                onClick={() => setSelected(sec.key)}
                style={{ textAlign: 'left', background: 'white', borderRadius: '14px', padding: isMobile ? '14px' : '16px', display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer', border: `1px solid ${on ? sec.color : '#cbd5e1'}`, boxShadow: on ? `0 0 0 3px ${sec.color}2e` : '0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)', fontFamily: 'inherit' }}
              >
                <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: sec.bg, color: sec.color, border: sec.bg === '#f8fafc' ? '1px solid #e2e8f0' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <Folder size={22} />
                </div>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{sec.label}</p>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>{meta.text}</p>
                {meta.progress != null && (
                  <div style={{ height: '5px', borderRadius: '9px', background: '#f1f5f9', marginTop: '8px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${meta.progress * 100}%`, background: sec.color, borderRadius: '9px' }} />
                  </div>
                )}
              </button>
            )
          })}
          <button
            onClick={() => { setNewListName(''); setShowAddList(true) }}
            style={{ minHeight: '130px', borderRadius: '14px', border: '1px dashed #94a3b8', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Plus size={16} /> New list
          </button>
        </div>

        {/* Selected folder */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
          <div style={{ padding: isMobile ? '12px 14px' : '14px 20px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#94a3b8' }}>
              Library <ChevronRight size={14} /> <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>{current.label}</span>
            </div>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{currentCount} file{currentCount !== 1 ? 's' : ''}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              {isZairul && current.custom && (
                <button onClick={() => handleDeleteSection(current.key)} style={delBtn} title="Delete list"><Trash2 size={13} /></button>
              )}
              <button onClick={() => openUploadFor(current.key)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Upload size={13} /> Upload to {current.label}
              </button>
            </div>
          </div>
          {renderPanelBody(current)}
        </div>
      </div>

      {/* Preview Modal */}
      {(preview || previewing) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: isMobile ? '12px' : '24px', overflowY: 'auto' }} onClick={e => e.target === e.currentTarget && setPreview(null)}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '860px', height: isMobile ? 'calc(100vh - 24px)' : 'calc(100vh - 48px)', maxHeight: isMobile ? 'calc(100vh - 24px)' : '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.3)', flexShrink: 0 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '16px' }} onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
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
                  setLockedMemberId(null)
                  setForm(f => ({
                    ...f,
                    section: key,
                    member_id: sec?.type === 'member' ? (f.member_id || myMemberId || '') : '',
                    subcategory: key === 'form_template' ? (allFormSubs[0] || '') : '',
                  }))
                }}>
                  <option value="">— Select section —</option>
                  {allSections.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
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
                      {activeMembers(members).map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label style={lLabel}>Files *</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setModalDragOver(true) }}
                  onDragLeave={() => setModalDragOver(false)}
                  onDrop={e => { e.preventDefault(); setModalDragOver(false); addFiles([...e.dataTransfer.files]) }}
                  style={{ border: `2px dashed ${modalDragOver ? '#2563eb' : '#cbd5e1'}`, background: modalDragOver ? '#eff6ff' : 'white', borderRadius: '12px', padding: '18px', textAlign: 'center', cursor: 'pointer', color: '#64748b', fontSize: '13px' }}
                >
                  <Upload size={22} color="#94a3b8" style={{ margin: '0 auto' }} />
                  <p style={{ marginTop: '6px' }}>{isMobile ? 'Tap to choose files' : <>Drag files here or <b style={{ color: '#2563eb' }}>browse</b></>}</p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>{selectedSec?.type === 'member' || selectedSec?.type === 'single' ? 'One file' : 'Multiple files OK'}</p>
                </div>
                <input ref={fileRef} type="file" multiple hidden onChange={e => { addFiles([...e.target.files]); e.target.value = '' }} />
                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {files.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', borderRadius: '8px', padding: '6px 10px', fontSize: '12px' }}>
                        <FileText size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{f.name}</span>
                        <span style={{ color: '#94a3b8', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                        <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {uploadError && <p style={{ fontSize: '12px', color: '#ef4444', background: '#fee2e2', padding: '8px 12px', borderRadius: '8px' }}>{uploadError}</p>}

              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', paddingTop: '4px' }}>
                <button onClick={handleUpload} disabled={uploading || !files.length || !form.section} style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: 'white', border: 'none', cursor: uploading || !files.length || !form.section ? 'not-allowed' : 'pointer', background: '#2563eb', opacity: uploading || !files.length || !form.section ? 0.5 : 1 }}>
                  {uploading ? 'Uploading…' : files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
                </button>
                <button onClick={() => setShowUpload(false)} style={{ flex: 1, padding: '11px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#0f172a', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New List Modal */}
      {showAddList && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '16px' }} onClick={e => e.target === e.currentTarget && setShowAddList(false)}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '16px' }} onClick={e => e.target === e.currentTarget && setShowAddFormSub(false)}>
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
