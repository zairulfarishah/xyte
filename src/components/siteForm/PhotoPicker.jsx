import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ClipboardPaste, ImageUp, X } from 'lucide-react'

// Cover photo picker: satellite view of the pin, photos from earlier sites, or upload / camera / paste.
// Calls onPick({ file, preview }) for a new image, or onPick({ url }) for a photo already in storage.

const SAT_URL = (z, y, x) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
const SAT_ZOOMS = [[18, 'Close'], [17, 'Medium'], [16, 'Wide']]
const OUT_W = 768, OUT_H = 480

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('tile failed'))
    img.src = src
  })
}

// Stitch satellite tiles into one 768×480 JPEG centred on the pin
async function satelliteImage(lat, lng, z) {
  const n = 2 ** z
  const r = lat * Math.PI / 180
  const px = (lng + 180) / 360 * n * 256
  const py = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * 256
  const left = px - OUT_W / 2, top = py - OUT_H / 2
  const canvas = document.createElement('canvas')
  canvas.width = OUT_W; canvas.height = OUT_H
  const ctx = canvas.getContext('2d')
  const jobs = []
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + OUT_W) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + OUT_H) / 256); ty++) {
      jobs.push(loadImage(SAT_URL(z, ty, tx)).then(img => ctx.drawImage(img, tx * 256 - left, ty * 256 - top)))
    }
  }
  await Promise.all(jobs)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Could not build the image')
  return blob
}

const words = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))
function distKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export default function PhotoPicker({ form, sites = [], onPick, onClose }) {
  const hasPin = form.latitude !== '' && form.latitude != null && form.longitude !== '' && form.longitude != null
  const [tab, setTab] = useState(hasPin ? 'sat' : 'past')
  const [sat, setSat] = useState({})          // zoom -> { blob, url } | { error }
  const [chosen, setChosen] = useState(null)  // { key, file?, preview?, url? }
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)
  const camRef = useRef(null)

  // Build the three satellite options as soon as the picker opens (about 15 small tiles)
  useEffect(() => {
    if (!hasPin) return
    const lat = Number(form.latitude), lng = Number(form.longitude)
    SAT_ZOOMS.forEach(([z]) => {
      satelliteImage(lat, lng, z)
        .then(blob => setSat(s => ({ ...s, [z]: { blob, url: URL.createObjectURL(blob) } })))
        .catch(() => setSat(s => ({ ...s, [z]: { error: true } })))
    })
  }, [hasPin, form.latitude, form.longitude])

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

  const tabs = [['sat', 'Satellite'], ['past', 'Previous sites'], ['up', 'Upload / Camera']]

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

        {tab === 'sat' && (!hasPin
          ? <p className="sf-empty">Set the location first (search it, or click the map) to see it from above.</p>
          : <>
              <div className="sf-tiles">
                {SAT_ZOOMS.map(([z, cap]) => {
                  const it = sat[z]
                  const key = `sat${z}`
                  return (
                    <button type="button" key={z} className={`sf-tile${chosen?.key === key ? ' on' : ''}`} disabled={!it?.blob}
                      onClick={() => setChosen({ key, file: new File([it.blob], `satellite-${z}.jpg`, { type: 'image/jpeg' }), preview: it.url })}>
                      {it?.url ? <img src={it.url} alt="" /> : <span className="sf-tile-msg">{it?.error ? 'Not available' : 'Loading…'}</span>}
                      <span className="sf-cap">{cap}</span>
                    </button>
                  )
                })}
              </div>
              <p className="sf-src">Satellite view centred on your pin · Imagery © Esri, Maxar, Earthstar Geographics</p>
            </>)}

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
