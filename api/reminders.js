// Vercel serverless function: timecard reminder. Called by Supabase pg_cron
// (see sql/setup-notification-prefs.sql) at 5:30 PM Mon–Fri and 1:00 PM Sat, Malaysia time.
//
// Safe to call at any time: it only acts inside those windows, skips public holidays,
// sends at most once per day, and only reminds members who have no timecard for today
// and are not on full-day leave. GET ?dry=1 reports what it would do without sending.
import { serverClients, deliver } from './_push.js'
import { publicHolidayName } from '../src/utils/holidays.js'

const LEAVE_BUCKET = 'site-photos'
const LEAVE_FILE_PATH = 'app-data/team-leaves.json'

// Minutes-from-midnight windows around each reminder time, per day of week (Malaysia time).
const WINDOWS = {
  1: [17 * 60 + 25, 18 * 60 + 30],
  2: [17 * 60 + 25, 18 * 60 + 30],
  3: [17 * 60 + 25, 18 * 60 + 30],
  4: [17 * 60 + 25, 18 * 60 + 30],
  5: [17 * 60 + 25, 18 * 60 + 30],
  6: [12 * 60 + 55, 14 * 60],
}

function malaysiaNow() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const pad = n => String(n).padStart(2, '0')
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    dow: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    label: d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
  }
}

async function fullDayLeaveIds(supabase, date) {
  const { data, error } = await supabase.storage.from(LEAVE_BUCKET).download(LEAVE_FILE_PATH)
  if (error) return new Set()
  try {
    const leaves = JSON.parse(await data.text())
    return new Set((Array.isArray(leaves) ? leaves : [])
      .filter(l => (l.leave_session || 'FULL_DAY') === 'FULL_DAY')
      .filter(l => String(l.start_date).slice(0, 10) <= date && String(l.end_date || l.start_date).slice(0, 10) >= date)
      .map(l => l.member_id))
  } catch {
    return new Set()
  }
}

const hasTime = card => !!card.time_in || (Array.isArray(card.segments) && card.segments.some(s => s?.time_in))

export default async function handler(req, res) {
  const dry = req.method === 'GET'
  if (!dry && req.method !== 'POST') return res.status(405).json({ error: 'GET (dry run) or POST only' })

  let supabase
  try { supabase = serverClients() } catch (err) { return res.status(500).json({ error: err.message }) }

  const now = malaysiaNow()
  const window = WINDOWS[now.dow]
  const holiday = publicHolidayName(now.date)
  const inWindow = !!window && now.minutes >= window[0] && now.minutes < window[1]

  const [{ data: members }, { data: cards }, onLeave] = await Promise.all([
    supabase.from('team_members').select('id, full_name'),
    supabase.from('timecards').select('member_id, time_in, segments').eq('work_date', now.date),
    fullDayLeaveIds(supabase, now.date),
  ])
  const keyedIn = new Set((cards || []).filter(hasTime).map(c => c.member_id))
  const toRemind = (members || []).filter(m => !keyedIn.has(m.id) && !onLeave.has(m.id))

  if (dry) {
    return res.status(200).json({ date: now.date, inWindow, holiday, members: (members || []).length, keyedIn: keyedIn.size, onLeave: onLeave.size, wouldRemind: toRemind.length })
  }
  if (!inWindow) return res.status(200).json({ skipped: 'outside reminder time', date: now.date })
  if (holiday) return res.status(200).json({ skipped: `public holiday: ${holiday}`, date: now.date })
  if (!toRemind.length) return res.status(200).json({ skipped: 'everyone has keyed in', date: now.date })

  // Claim today's slot first; a second call the same day hits the primary key and stops here.
  const { error: logErr } = await supabase.from('reminder_log').insert({ kind: 'timecard', day: now.date })
  if (logErr) return res.status(200).json({ skipped: 'already sent today', date: now.date })

  const message = `Reminder: key in your timecard for today (${now.label}) in Schedule`
  const { data: notifs, error } = await supabase
    .from('notifications')
    .insert(toRemind.map(m => ({ message, actor: 'Xyte', recipient_id: m.id, category: 'schedule_reminder' })))
    .select('id, message, actor, recipient_id, category, created_at')
  if (error) return res.status(500).json({ error: error.message })

  try {
    return res.status(200).json({ date: now.date, reminded: toRemind.length, ...(await deliver(supabase, notifs || [])) })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
