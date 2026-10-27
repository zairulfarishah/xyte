import { toCanvas } from 'html-to-image'
import { PDFDocument } from 'pdf-lib'

// A4 in points, 12mm margins
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 34
const GAP = 10

// Snapshots each [data-pdf-block] inside `root` and lays them on A4 pages top to bottom.
// A block never splits across pages; [data-pdf-break] starts a new page; one taller
// than a page is shrunk to fit. Returns the PDF as a Blob.
export async function reportToPdf(root) {
  const pdf = await PDFDocument.create()
  const contentW = PAGE_W - MARGIN * 2
  const contentH = PAGE_H - MARGIN * 2
  let page = null
  let y = 0 // space used on the current page

  for (const block of root.querySelectorAll('[data-pdf-block]')) {
    const canvas = await toCanvas(block, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9))
    const img = await pdf.embedJpg(await blob.arrayBuffer())

    let w = contentW
    let h = (canvas.height / canvas.width) * w
    if (h > contentH) { w *= contentH / h; h = contentH }

    if (!page || block.hasAttribute('data-pdf-break') || y + h > contentH) {
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = 0
    }
    page.drawImage(img, { x: MARGIN, y: PAGE_H - MARGIN - y - h, width: w, height: h })
    y += h + GAP
  }

  return new Blob([await pdf.save()], { type: 'application/pdf' })
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
