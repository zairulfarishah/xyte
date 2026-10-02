/* global process */
// Shared by the /api functions (Vercel skips files starting with "_" when creating routes).
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { categoryOf, isCategoryOn, urlForCategory } from '../src/utils/notificationPrefs.js'

export function serverClients() {
  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY || !VITE_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('Push is not configured on the server')
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  return createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
}

// Push notification rows to every subscribed device whose owner has that category switched on.
export async function deliver(supabase, notifs) {
  if (!notifs.length) return { sent: 0, failed: 0, muted: 0 }

  const [{ data: subs, error: subErr }, { data: prefRows }] = await Promise.all([
    supabase.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth, member:team_members(full_name)'),
    supabase.from('notification_prefs').select('member_id, prefs'),
  ])
  if (subErr) throw new Error(subErr.message)
  const prefsByMember = Object.fromEntries((prefRows || []).map(r => [r.member_id, r.prefs]))

  let muted = 0
  const jobs = []
  for (const n of notifs) {
    const category = categoryOf(n)
    // Broadcasts go to everyone except whoever triggered them; targeted ones only to the recipient.
    const targets = (subs || []).filter(s => n.recipient_id
      ? s.member_id === n.recipient_id
      : s.member?.full_name !== n.actor)
    const payload = JSON.stringify({ title: 'Xyte', body: n.message, url: urlForCategory(category), tag: String(n.id) })

    for (const s of targets) {
      if (!isCategoryOn(prefsByMember[s.member_id], category)) { muted++; continue }
      jobs.push(
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 })
          .then(() => 'ok')
          .catch(async err => {
            // 404/410: the device unsubscribed or the subscription expired — forget it.
            if (err.statusCode === 404 || err.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('id', s.id)
            }
            return 'failed'
          })
      )
    }
  }

  const results = await Promise.all(jobs)
  return { sent: results.filter(r => r === 'ok').length, failed: results.filter(r => r === 'failed').length, muted }
}
