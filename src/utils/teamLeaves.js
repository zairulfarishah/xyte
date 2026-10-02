import { supabase } from '../supabase'

const LEAVE_BUCKET = 'site-photos'
const LEAVE_FILE_PATH = 'app-data/team-leaves.json'

// Not leave: a rostered day off (e.g. alternate Saturdays). Stored with the leave
// records so people on it drop out of "At Store", but kept out of leave stats.
export const OFF_DAY_TYPE = 'OFF DAY'

export const LEAVE_TYPES = [
  'ANNUAL LEAVE',
  'EMERGENCY LEAVE',
  'HOSPITALIZATION LEAVE',
  'MARRIAGE LEAVE',
  'MEDICAL',
  'PARENTAL LEAVE',
  'UNPAID',
  OFF_DAY_TYPE,
]

export const LEAVE_SESSIONS = [
  'FULL_DAY',
  'AM_ONLY',
  'PM_ONLY',
]

function normalizeDate(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function formatDateLabel(value) {
  const normalized = normalizeDate(value)
  if (!normalized) return ''
  return new Date(normalized).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
  })
}

function sortLeaves(leaves) {
  return [...leaves].sort((a, b) => {
    const byStart = String(a.start_date || '').localeCompare(String(b.start_date || ''))
    if (byStart !== 0) return byStart
    return String(a.member_id || '').localeCompare(String(b.member_id || ''))
  })
}

function sanitizeLeave(leave) {
  return {
    id: leave.id,
    member_id: leave.member_id,
    leave_type: leave.leave_type,
    leave_session: LEAVE_SESSIONS.includes(leave.leave_session) ? leave.leave_session : 'FULL_DAY',
    start_date: normalizeDate(leave.start_date),
    end_date: normalizeDate(leave.end_date || leave.start_date),
    note: leave.note || '',
    created_at: leave.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export async function fetchTeamLeaves() {
  const { data, error } = await supabase.storage.from(LEAVE_BUCKET).download(LEAVE_FILE_PATH)

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (message.includes('not found') || message.includes('404') || message.includes('does not exist')) {
      return []
    }
    throw new Error(error.message)
  }

  const raw = await data.text()
  if (!raw.trim()) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return sortLeaves(parsed.map(sanitizeLeave))
  } catch {
    return []
  }
}

export async function saveTeamLeaves(leaves) {
  const payload = JSON.stringify(sortLeaves(leaves).map(sanitizeLeave), null, 2)
  const file = new Blob([payload], { type: 'application/json' })
  const { error } = await supabase.storage
    .from(LEAVE_BUCKET)
    .upload(LEAVE_FILE_PATH, file, { upsert: true, contentType: 'application/json', cacheControl: '0' })

  if (error) {
    throw new Error(error.message)
  }
}

export function isDateWithinLeave(date, leave) {
  const target = normalizeDate(date)
  const start = normalizeDate(leave?.start_date)
  const end = normalizeDate(leave?.end_date || leave?.start_date)
  if (!target || !start || !end) return false
  return target >= start && target <= end
}

export function getMemberLeaveOnDate(leaves, memberId, date) {
  if (!memberId || !date) return null
  return leaves.find(leave => leave.member_id === memberId && isDateWithinLeave(date, leave)) || null
}

export function getMembersOnLeave(leaves, members, date) {
  return members
    .map(member => ({
      member,
      leave: getMemberLeaveOnDate(leaves, member.id, date),
    }))
    .filter(item => item.leave)
}

const LEAVE_ABBR = {
  'ANNUAL LEAVE': 'AL',
  MEDICAL: 'MC',
  'EMERGENCY LEAVE': 'EL',
  'HOSPITALIZATION LEAVE': 'HL',
  'MARRIAGE LEAVE': 'ML',
  'PARENTAL LEAVE': 'PL',
  UNPAID: 'UPL',
  [OFF_DAY_TYPE]: 'OFF',
}

export function leaveAbbr(type) {
  return LEAVE_ABBR[type] || (type || '').slice(0, 2).toUpperCase()
}

export const isOffDay = leave => leave?.leave_type === OFF_DAY_TYPE

// Turn one member's day off on/off. Adds a single-day OFF DAY record, or removes that
// date from an existing one (splitting a multi-day record around it). Returns a new array.
export function setOffDay(leaves, memberId, date, off) {
  const day = normalizeDate(date)
  const covers = l => isOffDay(l) && l.member_id === memberId &&
    normalizeDate(l.start_date) <= day && normalizeDate(l.end_date || l.start_date) >= day

  if (off) {
    if (leaves.some(covers)) return leaves
    return [...leaves, {
      id: `${memberId}-${day}-off-${Date.now()}`,
      member_id: memberId,
      leave_type: OFF_DAY_TYPE,
      leave_session: 'FULL_DAY',
      start_date: day,
      end_date: day,
      note: '',
    }]
  }

  const shift = (d, n) => {
    const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  return leaves.flatMap(l => {
    if (!covers(l)) return [l]
    const start = normalizeDate(l.start_date)
    const end = normalizeDate(l.end_date || l.start_date)
    const parts = []
    if (start < day) parts.push({ ...l, end_date: shift(day, -1) })
    if (end > day) parts.push({ ...l, id: `${l.id}-b`, start_date: shift(day, 1) })
    return parts
  })
}

export function getLeaveSessionLabel(session) {
  if (session === 'AM_ONLY') return 'AM Only'
  if (session === 'PM_ONLY') return 'PM Only'
  return 'Full Day'
}

export function getLeaveSummary(leave) {
  if (!leave) return ''
  const start = normalizeDate(leave.start_date)
  const end = normalizeDate(leave.end_date || leave.start_date)
  const sessionLabel = getLeaveSessionLabel(leave.leave_session)
  return start === end
    ? `${leave.leave_type} · ${sessionLabel} · ${formatDateLabel(start)}`
    : `${leave.leave_type} · ${sessionLabel} · ${formatDateLabel(start)} - ${formatDateLabel(end)}`
}
