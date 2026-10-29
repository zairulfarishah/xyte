// Merges PDFs and photos into one PDF, in the order given.
// Photos are drawn two per A4 page (like a front/back IC photocopy);
// PDF pages are copied as they are.

const A4 = [595.28, 841.89]
const MARGIN = 36
const GAP = 24
const MAX_PX = 1800

export const canCombine = file =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name) || file.type.startsWith('image/')

// Phone photos are huge; shrink them and re-encode as JPEG (also applies EXIF rotation)
async function imageToJpeg(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
  return blob.arrayBuffer()
}

export async function combineToPdf(files) {
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()
  let page = null, slot = 0

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
      const copied = await out.copyPages(src, src.getPageIndices())
      copied.forEach(p => out.addPage(p))
      page = null
      continue
    }

    let img
    try { img = await out.embedJpg(await imageToJpeg(file)) }
    catch { throw new Error(`${file.name}: this image type can't be read. Use JPG or PNG.`) }

    if (!page || slot === 2) { page = out.addPage(A4); slot = 0 }
    const boxW = A4[0] - MARGIN * 2
    const boxH = (A4[1] - MARGIN * 2 - GAP) / 2
    const s = Math.min(boxW / img.width, boxH / img.height)
    const w = img.width * s, h = img.height * s
    const top = A4[1] - MARGIN - slot * (boxH + GAP)
    page.drawImage(img, { x: (A4[0] - w) / 2, y: top - (boxH + h) / 2, width: w, height: h })
    slot++
  }

  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}
