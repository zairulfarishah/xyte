/* global process */
// Vercel serverless function: pushes newly created `notifications` rows to subscribed devices.
// The browser posts only row ids; everything else is read from the database, and rows older
// than a couple of minutes are ignored so the endpoint can't be used to replay old alerts.
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const MAX_AGE_MS = 2 * 60 * 1000

function urlFor(message) {
  const m = String(message || '').toLowerCase()
  if (m.includes('feed')) return '/feed'
  if (m.includes('claim')) return '/claim'
  if (m.includes('assigned')) return '/calendar'
  return '/'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY || !VITE_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Push is not configured on the server' })
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const ids = Array.isArray(body.ids) ? body.ids.filter(id => typeof id === 'string').slice(0, 100) : []
  if (!ids.length) return res.status(400).json({ error: 'No ids' })

  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

  const { data: notifs, error } = await supabase
    .from('notifications')
    .select('id, message, actor, recipient_id, created_at')
    .in('id', ids)
  if (error) return res.status(500).json({ error: error.message })

  const fresh = (notifs || []).filter(n => Date.now() - new Date(n.created_at).getTime() < MAX_AGE_MS)
  if (!fresh.length) return res.status(200).json({ sent: 0 })

  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('id, member_id, endpoint, p256dh, auth, member:team_members(full_name)')
  if (subErr) return res.status(500).json({ error: subErr.message })

  const jobs = []
  for (const n of fresh) {
    // Broadcasts go to everyone except whoever triggered them; targeted ones only to the recipient.
    const targets = (subs || []).filter(s => n.recipient_id
      ? s.member_id === n.recipient_id
      : s.member?.full_name !== n.actor)
    const payload = JSON.stringify({ title: 'Xyte', body: n.message, url: urlFor(n.message), tag: n.id })
    for (const s of targets) {
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
  return res.status(200).json({ sent: results.filter(r => r === 'ok').length, failed: results.filter(r => r === 'failed').length })
}
