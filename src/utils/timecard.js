import { publicHolidayName } from './holidays'

// Office hours per day of week (0 = Sunday). Minutes from midnight.
// Anything worked outside the window counts as OT; a day with no window is an
// off day, so every minute worked on it is OT.
export const WORK_RULES = {
  0: null,                         // Sunday — off day, all OT if they work
  1: { start: 8 * 60, end: 17 * 60 + 30 },
  2: { start: 8 * 60, end: 17 * 60 + 30 },
  3: { start: 8 * 60, end: 17 * 60 + 30 },
  4: { start: 8 * 60, end: 17 * 60 + 30 },
  5: { start: 8 * 60, end: 17 * 60 + 30 },
  6: { start: 8 * 60, end: 13 * 60 },        // Saturday — OT after 1 PM
}

// Unpaid lunch break, taken out of the hours whenever a shift covers it.
export const LUNCH = { start: 13 * 60, end: 14 * 60 + 30 }

const DAY_MINUTES = 24 * 60

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

export function toMinutes(time) {
  if (!time) return null
  const [h, m] = String(time).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay()
}

// What kind of day this is before anyone keys in a time.
export function dayInfo(dateStr) {
  const holiday = publicHolidayName(dateStr)
  const dow = dayOfWeek(dateStr)
  if (holiday) return { kind: 'holiday', label: holiday, window: null }
  if (dow === 0) return { kind: 'off', label: 'Sunday', window: null }
  return { kind: dow === 6 ? 'saturday' : 'workday', label: null, window: WORK_RULES[dow] }
}

// A day can hold several time slots — two sites in one day, or a day shift
// plus night work (8:00–17:30 then 22:00–04:00). Each slot is
// { time_in, time_out, site_id }.
//
// A time out earlier than the time in means that slot finished after midnight;
// time past midnight is outside office hours, so it is all OT. Overlapping
// slots are merged so no minute is counted twice. Lunch is not counted as
// worked time, normal or OT.
export function calcTimecard(dateStr, segments = []) {
  const merged = []
  for (const [start, end] of toIntervals(segments)) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }

  const { window } = dayInfo(dateStr)
  let worked = 0
  let normal = 0
  for (const [start, end] of merged) {
    worked += end - start - overlap(start, end, LUNCH.start, LUNCH.end)
    if (window) {
      const ws = Math.max(start, window.start)
      const we = Math.min(end, window.end)
      normal += overlap(start, end, window.start, window.end) - overlap(ws, we, LUNCH.start, LUNCH.end)
    }
  }
  return { worked, normal, ot: worked - normal }
}

// Slots that overlap each other — usually a typo, so the UI flags it.
export function hasOverlap(segments = []) {
  const intervals = toIntervals(segments)
  return intervals.some((iv, i) => i > 0 && iv[0] < intervals[i - 1][1])
}

// Complete slots as [start, end] minutes, sorted by start.
function toIntervals(segments) {
  return segments
    .map(s => {
      const start = toMinutes(s.time_in)
      let end = toMinutes(s.time_out)
      if (start == null || end == null) return null
      if (end <= start) end += DAY_MINUTES
      return [start, end]
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0])
}

// Every date of the month as "YYYY-MM-DD".
export function monthDates(month) {
  const y = month.getFullYear()
  const m = month.getMonth()
  const count = new Date(y, m + 1, 0).getDate()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m, i + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
}

// A past working day (Mon–Sat, not a public holiday) with no time keyed in
// and no full-day leave.
export function isMissingDay(dateStr, today, card, leave) {
  if (dateStr >= today || card) return false
  const { kind } = dayInfo(dateStr)
  if (kind === 'holiday' || kind === 'off') return false
  return !(leave && leave.leave_session === 'FULL_DAY')
}

// Every date from `from` to `to` inclusive ("YYYY-MM-DD"), capped at a year.
export function rangeDates(from, to) {
  const out = []
  const d = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (d <= end && out.length < 366) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

// Payroll totals for one member over a set of dates. OT is split by the kind
// of day it was earned on, since weekday / Saturday / Sunday & PH OT are
// usually paid at different rates.
//   cardsByDate: { "YYYY-MM-DD": timecard row }
//   leaveOn(date): that member's leave on the date, or null
export function summarizeTimecards(dates, cardsByDate, leaveOn, today) {
  const sum = { days: 0, normal: 0, otWeekday: 0, otSaturday: 0, otOff: 0, ot: 0, missing: 0, leaveDays: 0 }
  for (const date of dates) {
    const card = cardsByDate[date]
    const leave = leaveOn(date)
    if (leave) sum.leaveDays += leave.leave_session === 'FULL_DAY' ? 1 : 0.5
    if (isMissingDay(date, today, card, leave)) sum.missing++
    if (!card) continue
    if (card.worked_minutes > 0) sum.days++
    sum.normal += card.normal_minutes || 0
    const ot = card.ot_minutes || 0
    const { kind } = dayInfo(date)
    if (kind === 'workday') sum.otWeekday += ot
    else if (kind === 'saturday') sum.otSaturday += ot
    else sum.otOff += ot
    sum.ot += ot
  }
  return sum
}

export function formatMinutes(mins) {
  if (!mins) return '0h'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`
}

export function formatTime12(time) {
  const mins = toMinutes(time)
  if (mins == null) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
