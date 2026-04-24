import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const CATEGORY_COLORS = {
  'Report Templates': 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  'Safety Forms':     'bg-red-500/20 text-red-400 border border-red-500/30',
  'Site Checklists':  'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  'Guidelines':       'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  'General':          'bg-gray-500/20 text-gray-400 border border-gray-500/30',
}

const FILE_ICONS = {
  'pdf':  '📄',
  'docx': '📝',
  'xlsx': '📊',
  'pptx': '📋',
  'jpg':  '🖼',
  'png':  '🖼',
  'default': '📁',
}

function getIcon(fileType) {
  return FILE_ICONS[fileType?.toLowerCase()] || FILE_ICONS['default']
}

function formatSize(kb) {
  if (!kb) return '—'
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export default function Library() {
  const [docs, setDocs]           = useState([])
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [filter, setFilter]       = useState('all')
  const [form, setForm]           = useState({
    title: '', description: '', category: 'General', uploaded_by: '',
  })
  const [file, setFile] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: d } = await supabase
      .from('library_documents')
      .select('*, team_members(full_name)')
      .order('created_at', { ascending: false })

    const { data: m } = await supabase
      .from('team_members')
      .select('id, full_name')
      .order('full_name')

    setDocs(d || [])
    setMembers(m || [])
    setLoading(false)
  }

  async function handleUpload() {
    if (!file || !form.title) return
    setUploading(true)

    const ext      = file.name.split('.').pop().toLowerCase()
    const filePath = `documents/${Date.now()}_${file.name.replace(/\s+/g, '_')}`

    const { error: uploadError } = await supabase.storage
      .from('library')
      .upload(filePath, file)

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    await supabase.from('library_documents').insert({
      title:       form.title,
      description: form.description,
      category:    form.category,
      file_path:   filePath,
      file_type:   ext,
      file_size_kb: Math.round(file.size / 1024),
      uploaded_by: form.uploaded_by || null,
    })

    setUploading(false)
    setShowForm(false)
    setForm({ title: '', description: '', category: 'General', uploaded_by: '' })
    setFile(null)
    fetchAll()
  }

  async function handleDownload(doc) {
    const { data } = await supabase.storage
      .from('library')
      .createSignedUrl(doc.file_path, 60)

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    }
  }

  async function handleDelete(doc) {
    if (!confirm('Delete this document?')) return
    await supabase.storage.from('library').remove([doc.file_path])
    await supabase.from('library_documents').delete().eq('id', doc.id)
    fetchAll()
  }

  const categories = ['all', ...new Set(docs.map(d => d.category))]
  const filtered   = filter === 'all' ? docs : docs.filter(d => d.category === filter)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500">Loading library...</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Library</h2>
          <p className="text-gray-400 text-sm mt-1">{docs.length} documents</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Upload Document
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
              filter === cat
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Documents grid */}
      {filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-4xl mb-3">📁</p>
          <p className="text-gray-400 font-medium">No documents yet</p>
          <p className="text-gray-600 text-sm mt-1">Click "+ Upload Document" to add your first file</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(doc => (
            <div
              key={doc.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl flex-shrink-0">{getIcon(doc.file_type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{doc.title}</p>
                  {doc.description && (
                    <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{doc.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS['General']}`}>
                      {doc.category}
                    </span>
                    <span className="text-gray-600 text-xs uppercase">{doc.file_type}</span>
                    <span className="text-gray-600 text-xs">{formatSize(doc.file_size_kb)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div>
                      <p className="text-gray-600 text-xs">
                        {doc.team_members?.full_name || 'Unknown'}
                      </p>
                      <p className="text-gray-700 text-xs">
                        {new Date(doc.created_at).toLocaleDateString('en-MY', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(doc)}
                        className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-lg transition-colors"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Upload Document</h3>

            {/* File picker */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">File *</label>
              <input
                type="file"
                onChange={e => setFile(e.target.files[0])}
                className="w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
              />
              {file && (
                <p className="text-gray-500 text-xs mt-1">
                  {file.name} — {formatSize(Math.round(file.size / 1024))}
                </p>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Title *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. GPR Report Template v2"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Description</label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..."
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Category</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {['General','Report Templates','Safety Forms','Site Checklists','Guidelines'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Uploaded by */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Uploaded by</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.uploaded_by}
                onChange={e => setForm(f => ({ ...f, uploaded_by: e.target.value }))}
              >
                <option value="">— Select member —</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleUpload}
                disabled={uploading || !file || !form.title}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}