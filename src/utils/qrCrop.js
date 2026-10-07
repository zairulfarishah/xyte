// Bank-app screenshots are mostly screen with a small QR in the middle. Find the
// QR and cut it out with a quiet-zone margin, so it can be shown big and sharp.

const MAX_SIDE = 1800

async function toBitmap(source) {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source
  return createImageBitmap(blob)
}

// Returns { canvas, text } or null when no QR can be read in the picture.
export async function findQr(source) {
  let bitmap
  try { bitmap = await toBitmap(source) } catch { return null }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const full = document.createElement('canvas')
  full.width = w
  full.height = h
  const ctx = full.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  // The reader is only downloaded the first time a QR is looked at
  const { default: jsQR } = await import('jsqr')
  const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' })
  if (!found) return null

  const { topLeftCorner: a, topRightCorner: b, bottomLeftCorner: c, bottomRightCorner: d } = found.location
  const xs = [a.x, b.x, c.x, d.x], ys = [a.y, b.y, c.y, d.y]
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const pad = size * 0.12 // scanners need a white border round the code
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2
  const side = Math.round(size + pad * 2)

  const out = document.createElement('canvas')
  out.width = side
  out.height = side
  const o = out.getContext('2d')
  o.fillStyle = '#fff'
  o.fillRect(0, 0, side, side)
  o.imageSmoothingEnabled = false // keep module edges crisp
  o.drawImage(full, Math.round(cx - side / 2), Math.round(cy - side / 2), side, side, 0, 0, side, side)
  return { canvas: out, text: found.data }
}

// Cropped QR as a PNG file ready to upload, or null.
export async function cropQrFile(file) {
  const r = await findQr(file)
  if (!r) return null
  const blob = await new Promise(res => r.canvas.toBlob(res, 'image/png'))
  return blob ? new File([blob], 'duitnow-qr.png', { type: 'image/png' }) : null
}
