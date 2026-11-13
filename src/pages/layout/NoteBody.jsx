import { useEffect, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { supabase } from '../../supabase'
import { shrinkPhoto } from '../../utils/photo'
import { toast } from '../../utils/toast'
import { BUCKET } from './store'

// A site note pinned on the plan: text and photos. Photos go to the layouts bucket under
// photos/<layout id>/, so the layout has to be saved to Xyte first.
export default function NoteBody({ it, set, layoutId, n }) {
  const [text, setText] = useState(it.text || '')
  const [prev, setPrev] = useState(it.text)
  if (prev !== it.text) { setPrev(it.text); setText(it.text || '') }
  const [urls, setUrls] = useState({})
  const [busy, setBusy] = useState(false)
  const photos = it.photos || []

  const key = photos.map(p => p.path).join('|')
  useEffect(() => {
    const paths = key ? key.split('|') : []
    if (!paths.length) return
    let alive = true
    supabase.storage.from(BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (alive && data) setUrls(Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])))
    })
    return () => { alive = false }
  }, [key])

  async function add(files) {
    if (!layoutId) { toast('Save the layout to Xyte first, then add photos.', { tone: 'err', ms: 6000 }); return }
    setBusy(true)
    try {
      const added = []
      for (const original of files) {
        const file = await shrinkPhoto(original)
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `photos/${layoutId}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' })
        if (error) throw error
        added.push({ path, name: original.name })
      }
      set({ photos: [...photos, ...added] })
      toast(`${added.length} photo${added.length > 1 ? 's' : ''} added. Save the layout to keep ${added.length > 1 ? 'them' : 'it'} on the note.`)
    } catch (err) {
      toast(`Couldn't upload: ${err.message}`, { tone: 'err', ms: 7000 })
    } finally { setBusy(false) }
  }

  async function remove(p) {
    if (!confirm('Remove this photo?')) return
    set({ photos: photos.filter(x => x.path !== p.path) })
    await supabase.storage.from(BUCKET).remove([p.path])
  }

  return (
    <>
      <div style={{ fontSize: '12px', color: '#64748b' }}>Note {n} on this level</div>
      <textarea value={text} onChange={e => setText(e.target.value)} onBlur={() => text !== it.text && set({ text })} rows={4}
        placeholder="What did you find here?" style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '8px', resize: 'vertical', fontFamily: 'inherit' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
        {photos.map(p => (
          <div key={p.path} style={{ position: 'relative', aspectRatio: '1', borderRadius: '6px', overflow: 'hidden', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
            {urls[p.path]
              ? <a href={urls[p.path]} target="_blank" rel="noreferrer" title={p.name}><img src={urls[p.path]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></a>
              : <span style={{ fontSize: '11px', color: '#94a3b8', padding: '4px', display: 'block' }}>Loading…</span>}
            <button onClick={() => remove(p)} aria-label={`Remove ${p.name}`} title="Remove photo"
              style={{ position: 'absolute', top: '2px', right: '2px', display: 'inline-flex', padding: '3px', border: 0, borderRadius: '5px', background: 'rgba(255,255,255,.9)', color: '#dc2626', cursor: 'pointer' }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '6px 9px', fontSize: '12.5px', fontWeight: 600, borderRadius: '7px',
        border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        <Camera size={14} /> {busy ? 'Uploading…' : 'Add photos'}
        <input type="file" accept="image/*" multiple capture="environment" hidden disabled={busy}
          onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) add(f) }} />
      </label>
      {!layoutId && <p style={{ margin: 0, fontSize: '12px', color: '#b45309' }}>Save the layout to Xyte to add photos.</p>}
      <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Drag the pin to move it. Notes print on the PDF and list in the Excel schedule.</p>
    </>
  )
}
