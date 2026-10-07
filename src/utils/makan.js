import { supabase } from '../supabase'

export const MAKAN_BUCKET = 'makan'

export const rm = n => `RM ${(Number(n) || 0).toFixed(2)}`
export const round2 = n => Math.round((Number(n) || 0) * 100) / 100

export function makanUrl(path) {
  if (!path) return ''
  return supabase.storage.from(MAKAN_BUCKET).getPublicUrl(path).data.publicUrl
}

// Phone photos are often several MB; scale big ones down to a 1600px JPEG.
// QR codes stay sharp at that size.
async function shrinkPhoto(file, maxSide = 1600) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 400 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// folder: 'qr' | 'receipts' | 'proof'. Returns the storage path.
export async function uploadMakanFile(original, folder) {
  const file = await shrinkPhoto(original)
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(MAKAN_BUCKET).upload(path, file)
  if (error) throw new Error(error.message)
  return path
}

export function memberShort(m) {
  return m?.short_name || String(m?.full_name || '').split(' ').slice(0, 2).join(' ') || '?'
}

export function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
}

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626']
export function avatarColor(id = '') {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

// A fair random index (no modulo bias worth worrying about at these sizes)
export function randomIndex(n) {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % n
}
