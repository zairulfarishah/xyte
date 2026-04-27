const COMPLETION_META_START = '--- Completion Details ---'
const COMPLETION_META_END = '--- End Completion Details ---'

function cleanValue(value) {
  return String(value || '').trim()
}

export function parseCompletionMeta(notes) {
  const text = String(notes || '')
  const pattern = new RegExp(`${COMPLETION_META_START}\\n([\\s\\S]*?)\\n${COMPLETION_META_END}`, 'm')
  const match = text.match(pattern)
  const block = match?.[1] || ''

  const deliveryOrderNumber = cleanValue(block.match(/Delivery Order Number:\s*(.*)/)?.[1])
  const completionReason = cleanValue(block.match(/Completion Reason:\s*(.*)/)?.[1])
  const baseNotes = cleanValue(text.replace(pattern, ''))

  return {
    baseNotes,
    deliveryOrderNumber,
    completionReason,
  }
}

export function mergeCompletionMeta(notes, meta = {}) {
  const { baseNotes } = parseCompletionMeta(notes)
  const deliveryOrderNumber = cleanValue(meta.deliveryOrderNumber)
  const completionReason = cleanValue(meta.completionReason)

  const blockLines = []
  if (deliveryOrderNumber) blockLines.push(`Delivery Order Number: ${deliveryOrderNumber}`)
  if (completionReason) blockLines.push(`Completion Reason: ${completionReason}`)

  const parts = []
  if (baseNotes) parts.push(baseNotes)
  if (blockLines.length > 0) {
    parts.push([
      COMPLETION_META_START,
      ...blockLines,
      COMPLETION_META_END,
    ].join('\n'))
  }

  return parts.join('\n\n').trim()
}

export function validateCompletionRequirement(siteStatus, deliveryOrderNumber, completionReason) {
  if (cleanValue(siteStatus).toLowerCase() !== 'completed') return null
  if (cleanValue(deliveryOrderNumber) || cleanValue(completionReason)) return null
  return 'Enter a delivery order number or provide a reason before marking this site as completed.'
}
