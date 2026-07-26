import { supabase } from '../supabase'

export async function notify(message, actor = 'System', recipientId = null) {
  const payload = { message, actor }
  if (recipientId) payload.recipient_id = recipientId
  const { error } = await supabase.from('notifications').insert(payload)
  if (error) console.warn('Notification skipped:', error.message)
  return !error
}

export async function notifyMany(message, actor = 'System', recipientIds = []) {
  const unique = [...new Set(recipientIds.filter(Boolean))]
  if (!unique.length) return
  const rows = unique.map(id => ({ message, actor, recipient_id: id }))
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) console.warn('Bulk notification skipped:', error.message)
}

export function formatAssignmentDate(date) {
  if (!date) return 'a date to be confirmed'
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'a date to be confirmed'
  return parsed.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function getAssignmentMessage(role, siteName, scheduledDate) {
  const label = role === 'PIC' ? 'PIC' : 'crew'
  return `You have been assigned as ${label} for "${siteName}" on ${formatAssignmentDate(scheduledDate)}`
}

// Personal notification to the PIC and each crew member of a site
export async function notifyAssignments({ siteName, scheduledDate, picId, crewIds = [], actor = 'System' }) {
  if (picId) {
    await notify(getAssignmentMessage('PIC', siteName, scheduledDate), actor, picId)
  }

  const crewOnly = crewIds.filter(id => id && id !== picId)
  if (crewOnly.length > 0) {
    await notifyMany(getAssignmentMessage('crew', siteName, scheduledDate), actor, crewOnly)
  }
}
