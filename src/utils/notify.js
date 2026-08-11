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

// "1 Sep 2026" for a single day, "3 days: 1 Sep, 2 Sep, 4 Sep" for several
export function formatAssignmentDays(dates = []) {
  const clean = [...new Set(dates.filter(Boolean).map(d => String(d).slice(0, 10)))].sort()
  if (clean.length === 0) return 'a date to be confirmed'
  if (clean.length === 1) return formatAssignmentDate(clean[0])

  const short = clean.map(date => {
    const parsed = new Date(`${date}T00:00:00`)
    return Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
  })
  return `${clean.length} days: ${short.join(', ')}`
}

// Multi-day site where each day has its own crew — everyone hears about their own days.
// days: [{ date, picId, crewIds }]
export async function notifyDailyAssignments({ siteName, days = [], actor = 'System' }) {
  const byMember = new Map()
  const remember = (memberId, role, date) => {
    if (!memberId) return
    const entry = byMember.get(memberId) || { role: 'crew', dates: [] }
    if (role === 'PIC') entry.role = 'PIC'
    if (!entry.dates.includes(date)) entry.dates.push(date)
    byMember.set(memberId, entry)
  }

  days.forEach(({ date, picId, crewIds = [] }) => {
    remember(picId, 'PIC', date)
    crewIds.forEach(id => { if (id !== picId) remember(id, 'crew', date) })
  })

  for (const [memberId, { role, dates }] of byMember) {
    const label = role === 'PIC' ? 'PIC' : 'crew'
    await notify(
      `You have been assigned as ${label} for "${siteName}" — ${formatAssignmentDays(dates)}`,
      actor,
      memberId
    )
  }
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
