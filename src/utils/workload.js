import { getSiteDates, normalizeDate } from './siteDays'

const WEEKLY_CAPACITY_DAYS = 6.5

// Site-day multipliers per role per site type (PIC carries admin/client overhead)
const ROLE_MULTIPLIERS = {
  site_scanning: { pic: 1.2, crew: 1.0 },
  site_visit:    { pic: 1.0, crew: 1.0 },
  meeting:       { pic: 1.0, crew: 1.0 },
}

// Report is owned by the PIC; crew only review
const REPORT_ROLE_SHARE = { pic: 1.0, crew: 0.2 }

// Submitted reports sit with the approver, so they carry no load
const OPEN_REPORT_STATUSES = ['pending', 'in_progress']
const ACTIVE_SITE_STATUSES = ['upcoming', 'ongoing']

const WORKLOAD_STATUS = {
  available:  { label: 'Available',  bg: '#dcfce7', text: '#166534', border: '#4ade80', bar: '#22c55e' },
  normal:     { label: 'Normal',     bg: '#fef9c3', text: '#854d0e', border: '#fde047', bar: '#eab308' },
  busy:       { label: 'Busy',       bg: '#ffedd5', text: '#9a3412', border: '#fdba74', bar: '#f97316' },
  overloaded: { label: 'Overloaded', bg: '#fee2e2', text: '#991b1b', border: '#f87171', bar: '#ef4444' },
}

function getWorkloadStatus(pct) {
  if (pct <= 50)  return WORKLOAD_STATUS.available
  if (pct <= 80)  return WORKLOAD_STATUS.normal
  if (pct <= 100) return WORKLOAD_STATUS.busy
  return WORKLOAD_STATUS.overloaded
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) {
    const copy = new Date(value)
    copy.setHours(0, 0, 0, 0)
    return Number.isNaN(copy.getTime()) ? null : copy
  }
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function addDays(date, count) {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

// Monday 00:00 -> next Monday 00:00 (exclusive). Sunday is not a working day.
function getWeekBounds(reference = new Date()) {
  const ref = toDate(reference) || toDate(new Date())
  const offset = (ref.getDay() + 6) % 7
  const start = addDays(ref, -offset)
  return { start, end: addDays(start, 7) }
}

// The working days (Sundays excluded) a site runs over. end_date is the source of
// truth; older sites without one fall back to their duration.
function getWorkingSpan(site) {
  const dates = getSiteDates(site)
  if (dates.length === 0) return []

  let span = dates
  if (dates.length === 1 && !site?.end_date) {
    const needed = Math.max(1, Math.ceil(Number(site?.site_duration_days) || 1))
    if (needed > 1) {
      const start = toDate(dates[0])
      span = Array.from({ length: needed }, (_, i) => normalizeDate(addDays(start, i)))
    }
  }
  return span.filter(date => toDate(date)?.getDay() !== 0)
}

// Days this member is on site — their own days when the crew rotates, the whole
// span otherwise (an undated row covers every day).
function getMemberDates(group, span) {
  if (group.some(a => !a?.work_date)) return span
  const mine = new Set(group.map(a => normalizeDate(a.work_date)))
  return span.filter(date => mine.has(date))
}

function normalizeRole(role) {
  return String(role || '').toLowerCase() === 'pic' ? 'pic' : 'crew'
}

// One site, one member: all of that member's rows for the site.
function getSiteLoad(group, win) {
  const site         = group[0]?.site
  const siteStatus   = String(site?.site_status   || '').toLowerCase()
  const reportStatus = String(site?.report_status || '').toLowerCase()
  const siteType     = String(site?.site_type     || 'site_scanning').toLowerCase()
  const role         = group.some(a => normalizeRole(a?.assignment_role) === 'pic') ? 'pic' : 'crew'

  if (siteStatus === 'postponed' || siteStatus === 'cancelled') return 0

  let days = 0

  // Field work — only the member's own days that fall inside this week
  if (ACTIVE_SITE_STATUSES.includes(siteStatus)) {
    const span = getWorkingSpan(site)
    const duration = Number(site?.site_duration_days) || 0
    if (span.length > 0 && duration > 0) {
      const perDay = duration / span.length
      const winStart = normalizeDate(win.start)
      const winEnd   = normalizeDate(win.end)   // exclusive
      const insideDays = getMemberDates(group, span)
        .filter(date => date >= winStart && date < winEnd).length
      const multipliers = ROLE_MULTIPLIERS[siteType] || ROLE_MULTIPLIERS.site_scanning
      days += perDay * insideDays * (multipliers[role] ?? 1.0)
    }
  }

  // Report work — outstanding reports load the current week, PIC-weighted.
  // Counted once per site, however many days the member was on it.
  if (OPEN_REPORT_STATUSES.includes(reportStatus)) {
    days += (Number(site?.report_duration_days) || 0) * (REPORT_ROLE_SHARE[role] ?? 0)
  }

  return days
}

export function calculateWorkload(assignments = [], options = {}) {
  const { referenceDate = new Date(), leaveDays = 0 } = options
  const win = getWeekBounds(referenceDate)

  // A rotating crew means several rows per site for the same person — group them
  // so the site is only charged once.
  const bySite = new Map()
  assignments.forEach(assignment => {
    const key = assignment?.site?.id ?? assignment?.site_id ?? assignment
    if (!bySite.has(key)) bySite.set(key, [])
    bySite.get(key).push(assignment)
  })

  const busyDays = [...bySite.values()].reduce((sum, group) => sum + getSiteLoad(group, win), 0)
  const capacity = Math.max(0.5, WEEKLY_CAPACITY_DAYS - (Number(leaveDays) || 0))

  const workloadPercentage = Number(((busyDays / capacity) * 100).toFixed(1))
  const statusColors = getWorkloadStatus(workloadPercentage)

  return {
    workload_percentage: workloadPercentage,
    busy_days: Number(busyDays.toFixed(2)),
    capacity_days: capacity,
    week_start: win.start,
    status: statusColors.label,
    status_colors: statusColors,
  }
}

export { WEEKLY_CAPACITY_DAYS, ROLE_MULTIPLIERS, REPORT_ROLE_SHARE, WORKLOAD_STATUS, getWeekBounds }
