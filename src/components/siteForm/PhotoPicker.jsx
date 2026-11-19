import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ClipboardPaste, ExternalLink, ImageUp, Search, X } from 'lucide-react'
import { photoToFile, searchWebPhotos } from '../../utils/photoSearch'

// Cover photo picker: free web photos, photos from earlier sites, or upload / camera / paste.
// Calls onPick({ file, preview }) for a new image, or onPick({ url }) for a photo already in storage.

const words = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))
function distKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export default function PhotoPicker({ form, sites = [], onPick, onClose }) {
  const hasPin = form.latitude !== '' && form.latitude != null && form.longitude !== '' && form.longitude != null
  const [tab, setTab] = useState('web')
  const [chosen, setChosen] = useState(null)  // { key, file?, preview?, url? }
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)
  const camRef = useRef(null)

  // Earlier sites with a photo: same client or nearby first, then name matches, then newest
  const past = useMemo(() => {
    const pin = hasPin ? { lat: Number(form.latitude), lng: Number(form.longitude) } : null
    const nameWords = words(`${form.site_name} ${form.location}`)
    const company = String(form.client_company_name || '').trim().toLowerCase()
    return sites
      .filter(s => s.site_photo_url)
      .map(s => {
        let score = 0
        if (company && String(s.client_company_name || '').trim().toLowerCase() === company) score += 3
        if (pin && s.latitude && s.longitude && distKm(pin, { lat: Number(s.latitude), lng: Number(s.longitude) }) < 2) score += 4
        for (const w of words(`${s.site_name} ${s.location}`)) if (nameWords.has(w)) score += 1
        return { s, score }
      })
      .sort((a, b) => b.score - a.score || String(b.s.scheduled_date || '').localeCompare(String(a.s.scheduled_date || '')))
      .filter((x, i, arr) => arr.findIndex(y => y.s.site_photo_url === x.s.site_photo_url) === i)
      .slice(0, 12)
  }, [sites, form.site_name, form.location, form.client_company_name, form.latitude, form.longitude, hasPin])

  function takeFile(file, key = 'upload') {
    if (!file?.type?.startsWith('image/')) { setMsg('That file is not an image.'); return }
    setMsg('')
    setChosen({ key, file, preview: URL.createObjectURL(file) })
  }

  async function takeLink(text) {
    const link = String(text || '').trim()
    if (!/^https?:\/\//i.test(link)) { setMsg('Paste an image, or a link starting with http.'); return }
    setMsg('Loading image…')
    try {
      const res = await fetch(link)
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) throw new Error('not image')
      takeFile(new File([blob], 'pasted.' + (blob.type.split('/')[1] || 'jpg'), { type: blob.type }), 'link')
    } catch {
      setMsg("That website doesn't allow its images to be copied. Save the image to your device, then use Choose file.")
    }
  }

  // Ctrl+V anywhere in the picker: an image (screenshot) or an image link
  useEffect(() => {
    const onPaste = e => {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))
      if (item) { e.preventDefault(); setTab('up'); takeFile(item.getAsFile(), 'paste'); return }
      const text = e.clipboardData?.getData('text')
      if (text && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setTab('up'); takeLink(text) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function use() {
    if (!chosen) return
    if (chosen.url) onPick({ url: chosen.url })
    else onPick({ file: chosen.file, preview: chosen.preview })
  }

  async function pasteButton() {
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'))
        if (type) { const blob = await it.getType(type); takeFile(new File([blob], 'pasted.png', { type }), 'paste'); return }
      }
      takeLink(await navigator.clipboard.readText())
    } catch {
      setMsg('Press Ctrl+V (or long-press → Paste on phone) to paste.')
    }
  }

  // ── Web search ──
  const defaultQuery = String(form.site_name || '').trim() || String(form.location || '').split(',')[0].trim()
  const [webQ, setWebQ] = useState(defaultQuery)
  const [web, setWeb] = useState({ status: 'loading', items: [] })   // loading | done | error
  const [grabbing, setGrabbing] = useState(null)
  const webAbort = useRef(null)

  function runWeb(q = webQ) {
    setWeb({ status: 'loading', items: [] })
    fetchWeb(q)
  }
  async function fetchWeb(q) {
    webAbort.current?.abort()
    const ctrl = new AbortController()
    webAbort.current = ctrl
    try {
      const items = await searchWebPhotos({ query: q, lat: hasPin ? Number(form.latitude) : null, lng: hasPin ? Number(form.longitude) : null, signal: ctrl.signal })
      if (!ctrl.signal.aborted) setWeb({ status: 'done', items })
    } catch (err) {
      if (err?.name !== 'AbortError') setWeb({ status: 'error', items: [] })
    }
  }

  // Search as soon as the picker opens
  useEffect(() => { fetchWeb(defaultQuery); return () => webAbort.current?.abort() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function pickWeb(photo) {
    const key = `web${photo.id}`
    setGrabbing(key)
    setMsg('')
    try {
      const file = await photoToFile(photo)
      setChosen({ key, file, preview: URL.createObjectURL(file) })
    } catch {
      setMsg("Couldn't download that photo — try another one.")
    } finally {
      setGrabbing(null)
    }
  }

  const googleUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(webQ || defaultQuery)}`

  const tabs = [['web', 'Web'], ['past', 'Previous sites'], ['up', 'Upload / Camera']]

  return (
    <div className="sf-modal sf-top" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sf-picker" role="dialog" aria-modal="true" aria-label="Choose a cover photo"
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setTab('up'); takeFile(e.dataTransfer.files[0]) }}>
        <div className="sf-ph">
          <h3>Choose a <b>cover photo</b></h3>
          <button type="button" className="sf-circ" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="sf-tabs">
          {tabs.map(([k, t]) => <button type="button" key={k} className={`sf-pill${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{t}</button>)}
        </div>

        {tab === 'web' && (
          <>
            <form className="sf-websearch" onSubmit={e => { e.preventDefault(); runWeb() }}>
              <Search size={14} />
              <input value={webQ} onChange={e => setWebQ(e.target.value)} placeholder="Building, mall, area…" />
              <button type="submit" className="sf-btn">Search</button>
            </form>
            {web.status === 'loading' && <p className="sf-empty">Searching photos…</p>}
            {web.status === 'error' && <p className="sf-empty">Photo search isn't responding right now.</p>}
            {web.status === 'done' && web.items.length === 0 && <p className="sf-empty">No free photos found. Try a shorter name (e.g. just the building or area), or use Google Images below.</p>}
            {web.items.length > 0 && (
              <div className="sf-tiles">
                {web.items.map(p => {
                  const key = `web${p.id}`
                  return (
                    <button type="button" key={p.id} className={`sf-tile${chosen?.key === key ? ' on' : ''}`} disabled={!!grabbing} onClick={() => pickWeb(p)} title={p.credit}>
                      <img src={p.thumb} alt="" loading="lazy" onError={e => { e.currentTarget.closest('button').style.display = 'none' }} />
                      <span className="sf-cap">{grabbing === key ? 'Loading…' : p.source === 'near' ? `Near pin · ${p.title}` : p.title}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <p className="sf-src">
              Free photos from Wikimedia Commons & Openverse{hasPin ? ' — ones taken near your pin come first' : ''}. Hover a photo for its credit.{' '}
              Not there? <a href={googleUrl} target="_blank" rel="noreferrer" className="sf-link"><ExternalLink size={11} /> Search Google Images</a>, copy an image, come back and press Ctrl+V.
            </p>
          </>
        )}

        {tab === 'past' && (past.length === 0
          ? <p className="sf-empty">No earlier sites have a photo yet.</p>
          : <>
              <div className="sf-tiles">
                {past.map(({ s }) => {
                  const key = `past${s.id}`
                  return (
                    <button type="button" key={s.id} className={`sf-tile${chosen?.key === key ? ' on' : ''}`} onClick={() => setChosen({ key, url: s.site_photo_url })}>
                      <img src={s.site_photo_url} alt="" loading="lazy" />
                      <span className="sf-cap">{s.site_name}</span>
                    </button>
                  )
                })}
              </div>
              <p className="sf-src">Photos already in Xyte — same client or nearby sites first.</p>
            </>)}

        {tab === 'up' && (
          <div className="sf-drop">
            {chosen && ['upload', 'camera', 'paste', 'link'].includes(chosen.key)
              ? <img className="sf-drop-img" src={chosen.preview} alt="" />
              : <><b>Drop an image here, or paste a screenshot or image link (Ctrl+V)</b><p className="sf-src">JPG, PNG or WEBP. Big photos are shrunk automatically.</p></>}
            <div className="sf-drop-btns">
              <button type="button" className="sf-btn ghost" onClick={() => fileRef.current?.click()}><ImageUp size={15} />Choose file</button>
              <button type="button" className="sf-btn ghost" onClick={() => camRef.current?.click()}><Camera size={15} />Take photo</button>
              <button type="button" className="sf-btn ghost" onClick={pasteButton}><ClipboardPaste size={15} />Paste</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { takeFile(e.target.files[0]); e.target.value = '' }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { takeFile(e.target.files[0], 'camera'); e.target.value = '' }} />
          </div>
        )}

        {msg && <p className="sf-msg">{msg}</p>}
        <div className="sf-pfoot">
          <button type="button" className="sf-btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="sf-btn" disabled={!chosen} onClick={use}>Use this photo</button>
        </div>
      </div>
    </div>
  )
}
