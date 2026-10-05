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

// Map of memberId → { role, dates:Set } for a site's assignment rows. Rows without a
// work_date cover every day of the site (siteDates).
export function memberSchedule(assignments = [], siteDates = []) {
  const byMember = new Map()
  for (const a of assignments) {
    const id = a.member_id || a.team_members?.id
    if (!id) continue
    const entry = byMember.get(id) || { role: 'crew', dates: new Set() }
    if (String(a.assignment_role || '').toLowerCase() === 'pic') entry.role = 'PIC'
    const days = a.work_date ? [String(a.work_date).slice(0, 10)] : siteDates.length ? siteDates : ['']
    days.forEach(d => entry.dates.add(d))
    byMember.set(id, entry)
  }
  return byMember
}

// Compares a site's schedule before and after an edit and tells only the people whose own
// schedule changed. sessionNote (e.g. "now Full Day") goes to everyone else still on the site.
// Returns the set of member ids that were notified.
export async function notifyScheduleChanges({ siteName, before, after, sessionNote = null, actor = 'System', skipId = null }) {
  const rows = []
  const add = (id, message) => rows.push({ message, actor, recipient_id: id, category: 'assignment' })

  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (!id || id === skipId) continue
    const old = before.get(id)
    const now = after.get(id)
    const oldDates = old?.dates || new Set()
    const newDates = now?.dates || new Set()
    const added   = [...newDates].filter(d => !oldDates.has(d))
    const removed = [...oldDates].filter(d => !newDates.has(d))

    if (!now) add(id, `You have been removed from "${siteName}"`)
    else if (!old) add(id, `You have been assigned as ${now.role} for "${siteName}" — ${formatAssignmentDays(added)}`)
    else if (added.length && removed.length) add(id, `Your days for "${siteName}" have changed — now ${formatAssignmentDays([...newDates])}${now.role !== old.role ? ` (as ${now.role})` : ''}`)
    else if (added.length) add(id, `You have been assigned as ${now.role} for "${siteName}" — ${formatAssignmentDays(added)}`)
    else if (removed.length) add(id, `You have been removed from "${siteName}" on ${formatAssignmentDays(removed)}`)
    else if (now.role !== old.role) add(id, `You are now ${now.role} for "${siteName}"`)
    else if (sessionNote) add(id, `"${siteName}" session changed — ${sessionNote}`)
  }

  if (rows.length) await insertNotifications(rows)
  return new Set(rows.map(r => r.recipient_id))
}

// Personal notification to the PIC and each crew member of a site
export async function notifyAssignments({ siteName, scheduledDate, picId, crewIds = [], actor = 'System' }) {
  const rows = []
  if (picId) {
    rows.push({ message: getAssignmentMessage('PIC', siteName, scheduledDate), actor, recipient_id: picId, category: 'assignment' })
  }
  const crewOnly = [...new Set(crewIds.filter(id => id && id !== picId))]
  const crewMessage = getAssignmentMessage('crew', siteName, scheduledDate)
  crewOnly.forEach(id => rows.push({ message: crewMessage, actor, recipient_id: id, category: 'assignment' }))
  if (rows.length) await insertNotifications(rows)
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
