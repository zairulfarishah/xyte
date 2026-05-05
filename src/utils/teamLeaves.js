import { supabase } from '../supabase'

const LEAVE_BUCKET = 'site-photos'
const LEAVE_FILE_PATH = 'app-data/team-leaves.json'

export const LEAVE_TYPES = [
  'ANNUAL LEAVE',
  'EMERGENCY LEAVE',
  'HOSPITALIZATION LEAVE',
  'MARRIAGE LEAVE',
  'MEDICAL',
  'PARENTAL LEAVE',
  'UNPAID',
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

export function getLeaveSummary(leave) {
  if (!leave) return ''
  const start = normalizeDate(leave.start_date)
  const end = normalizeDate(leave.end_date || leave.start_date)
  return start === end
    ? `${leave.leave_type} · ${formatDateLabel(start)}`
    : `${leave.leave_type} · ${formatDateLabel(start)} - ${formatDateLabel(end)}`
}
