import { supabase } from '../supabase'
import { sendPushFor } from './push'
import { ADMIN_EMAIL } from './admin'

// Inserts bell rows and asks the server to push them. If the database doesn't have the
// `category` column yet (sql/setup-notification-prefs.sql not run), retries without it.
async function insertNotifications(rows) {
  let { data, error } = await supabase.from('notifications').insert(rows).select('id')
  if (error && /category/i.test(error.message)) {
    ({ data, error } = await supabase.from('notifications').insert(rows.map(row => { const rest = { ...row }; delete rest.category; return rest })).select('id'))
  }
  if (error) console.warn('Notification skipped:', error.message)
  else sendPushFor((data || []).map(n => n.id))
  return !error
}

// Notification for the admin only (e.g. a claim waiting for approval).
export async function notifyAdmin(message, actor = 'System', category = null) {
  const { data } = await supabase.from('team_members').select('id').ilike('email', ADMIN_EMAIL).maybeSingle()
  return notify(message, actor, data?.id || null, category)
}

// category: one of NOTIFICATION_CATEGORIES in ./notificationPrefs (decides who gets a push)
export async function notify(message, actor = 'System', recipientId = null, category = null) {
  const payload = { message, actor }
  if (category) payload.category = category
  if (recipientId) payload.recipient_id = recipientId
  return insertNotifications([payload])
}

export async function notifyMany(message, actor = 'System', recipientIds = [], category = null) {
  const unique = [...new Set(recipientIds.filter(Boolean))]
  if (!unique.length) return
  await insertNotifications(unique.map(id => ({ message, actor, recipient_id: id, ...(category ? { category } : {}) })))
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
      memberId,
      'assignment'
    )
  }
}

// Personal notification to the PIC and each crew member of a site
export async function notifyAssignments({ siteName, scheduledDate, picId, crewIds = [], actor = 'System' }) {
  if (picId) {
    await notify(getAssignmentMessage('PIC', siteName, scheduledDate), actor, picId, 'assignment')
  }

  const crewOnly = crewIds.filter(id => id && id !== picId)
  if (crewOnly.length > 0) {
    await notifyMany(getAssignmentMessage('crew', siteName, scheduledDate), actor, crewOnly, 'assignment')
  }
}

// Member ids on a site split by role. Accepts site_assignments rows with either
// member_id or a joined team_members object.
export function siteRoleIds(site) {
  const pic = new Set()
  const crew = new Set()
  for (const a of site?.site_assignments || []) {
    const id = a.member_id || a.team_members?.id
    if (!id) continue
    if (String(a.assignment_role || '').toLowerCase() === 'pic') pic.add(id)
    else crew.add(id)
  }
  pic.forEach(id => crew.delete(id))
  return { picIds: [...pic], crewIds: [...crew] }
}
