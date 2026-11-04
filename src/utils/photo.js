// Phone photos are often several MB; scale down to a JPEG so uploads are quick and
// every page that shows them later loads faster. Anything that isn't a still
// image (PDFs, GIFs, documents) or is already small comes back unchanged.
export async function shrinkPhoto(file, maxSide = 1600) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif' || file.size < 400 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
