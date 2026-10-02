import { supabase } from '../supabase'

export const FEED_BUCKET = 'feed-media'

export const feedPublicUrl = path => supabase.storage.from(FEED_BUCKET).getPublicUrl(path).data.publicUrl
export const isImageAttachment = a => String(a?.type || '').startsWith('image/')

// PostgREST .or() filter: posts with no hide-after date, or one still in the future
export const notExpiredFilter = () => `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`
export const isExpired = post => !!post.expires_at && new Date(post.expires_at) <= new Date()

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return fmtShortDate(dateStr)
}

export function fmtDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

export function fmtShortDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

// "Hide after" is picked as a calendar date; the post stays visible until the end of that day.
export function expiryFromDate(dateStr) {
  return dateStr ? new Date(`${dateStr}T23:59:59`).toISOString() : null
}

export function dateFromExpiry(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
