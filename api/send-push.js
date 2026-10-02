// Vercel serverless function: pushes newly created `notifications` rows to subscribed devices.
// The browser posts only row ids; everything else is read from the database, and rows older
// than a couple of minutes are ignored so the endpoint can't be used to replay old alerts.
import { serverClients, deliver } from './_push.js'

const MAX_AGE_MS = 2 * 60 * 1000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  let supabase
  try { supabase = serverClients() } catch (err) { return res.status(500).json({ error: err.message }) }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  // notifications.id is a bigint, so ids arrive as numbers (accept numeric strings too).
  const ids = Array.isArray(body.ids)
    ? body.ids.filter(id => Number.isInteger(id) || /^\d+$/.test(String(id))).map(String).slice(0, 100)
    : []
  if (!ids.length) return res.status(400).json({ error: 'No ids' })

  const { data: notifs, error } = await supabase
    .from('notifications')
    .select('*') // '*' so this still works before the category column exists
    .in('id', ids)
  if (error) return res.status(500).json({ error: error.message })

  const fresh = (notifs || []).filter(n => Date.now() - new Date(n.created_at).getTime() < MAX_AGE_MS)
  try {
    return res.status(200).json(await deliver(supabase, fresh))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
