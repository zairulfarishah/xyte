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
