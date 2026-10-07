// Notification categories a member can switch on/off for push notifications.
// Pure module — also imported by the Vercel functions in /api, so no browser-only imports here.

export const NOTIFICATION_CATEGORIES = [
  { key: 'assignment',        label: 'Site assignments',       hint: 'When you are assigned to a site as PIC or crew',                          url: '/calendar', defaultOn: true },
  { key: 'pic_update',        label: 'Sites you lead (PIC)',   hint: 'Status, report and detail changes on sites where you are PIC',            url: '/sites',    defaultOn: true },
  { key: 'site_update',       label: 'Sites you work on',      hint: 'Status and report changes on sites where you are crew',                   url: '/sites',    defaultOn: true },
  { key: 'feed_post',         label: 'New Feed posts',         hint: 'Whenever someone posts in Feed',                                          url: '/feed',     defaultOn: true },
  { key: 'feed_comment',      label: 'Comments on your posts', hint: 'When someone comments on a Feed post you wrote',                         url: '/feed',     defaultOn: true },
  { key: 'mention',           label: 'Mentions',               hint: 'When someone @mentions you in a Feed post or comment',                    url: '/feed',     defaultOn: true },
  { key: 'schedule_reminder', label: 'Timecard reminder',      hint: '5:30 PM on weekdays and 1:00 PM on Saturday, only if you have not keyed in', url: '/timecard', defaultOn: true },
  { key: 'claim',             label: 'Claims',                 hint: 'When your claim is approved, rejected or paid (admin: new claims to approve)',                           url: '/claim',    defaultOn: true },
  { key: 'general',           label: 'Other team updates',     hint: 'New sites, site edits and report status for the whole team',              url: '/',         defaultOn: false },
]

export const DEFAULT_PREFS = Object.fromEntries(NOTIFICATION_CATEGORIES.map(c => [c.key, c.defaultOn]))

export function isCategoryOn(prefs, category) {
  const value = prefs?.[category]
  return typeof value === 'boolean' ? value : (DEFAULT_PREFS[category] ?? true)
}

// Older rows (and code paths that don't pass a category) are classified by their wording.
export function categoryOf(notification) {
  if (notification?.category) return notification.category
  const m = String(notification?.message || '').toLowerCase()
  if (m.includes('mentioned you')) return 'mention'
  if (m.includes('commented on your feed post')) return 'feed_comment'
  if (m.includes('posted in feed') || m.includes('new feed post')) return 'feed_post'
  if (m.includes('assigned as')) return 'assignment'
  if (m.includes('key in your timecard')) return 'schedule_reminder'
  if (m.includes('claim')) return 'claim'
  return 'general'
}

export function urlForCategory(category) {
  return NOTIFICATION_CATEGORIES.find(c => c.key === category)?.url || '/'
}
