import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { avatarColor, initials } from '../utils/makan'
import { findQr } from '../utils/qrCrop'

// Small pieces shared by the Break Room screens
export function Avatar({ m, name, size }) {
  const label = m?.full_name || name
  return (
    <span className="mk-av" style={{ '--c': avatarColor(m?.id || name), ...(size ? { width: size, height: size } : {}) }} title={label}>
      {m?.avatar_url ? <img src={m.avatar_url} alt="" /> : initials(label)}
    </span>
  )
}

export function Modal({ title, onClose, children, footer, narrow, wide }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="mk-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`mk-modal${narrow ? ' narrow' : ''}${wide ? ' wide' : ''}`}>
        <div className="mk-modal-h"><h3>{title}</h3><button className="mk-x" onClick={onClose}><X size={16} /></button></div>
        <div className="mk-modal-b">{children}</div>
        {footer && <div className="mk-modal-f">{footer}</div>}
      </div>
    </div>
  )
}

export function Lightbox({ src, onClose }) {
  return <div className="mk-lightbox" onClick={onClose}><img src={src} alt="" /></div>
}


// Shows a stored QR picture cropped to just the code (found in the browser),
// falling back to the picture as uploaded. Results are kept for the session.
const cropped = new Map()
export function QrImage({ src, alt = 'QR code' }) {
  const [url, setUrl] = useState(() => cropped.get(src) || null)
  useEffect(() => {
    if (!src || cropped.has(src)) return undefined
    let cancelled = false
    findQr(src).then(r => {
      const out = r ? r.canvas.toDataURL('image/png') : src
      cropped.set(src, out)
      if (!cancelled) setUrl(out)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [src])
  return <img src={url || cropped.get(src) || src} alt={alt} style={{ imageRendering: url && url !== src ? 'pixelated' : 'auto' }} />
}
