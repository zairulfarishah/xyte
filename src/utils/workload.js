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

// Site days pro-rated across the Mon-Sat days that fall inside the window
function getDaysInWindow(site, win) {
  const start = toDate(site?.scheduled_date)
  const duration = Number(site?.site_duration_days) || 0
  if (!start || duration <= 0) return 0

  const end = toDate(site?.scheduled_end_date)
    || addDays(start, Math.max(1, Math.ceil(duration)) - 1)
  if (end < start) return 0

  let spanDays = 0
  let insideDays = 0
  for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
    if (day.getDay() === 0) continue
    spanDays += 1
    if (day >= win.start && day < win.end) insideDays += 1
  }
  if (spanDays === 0) return 0

  return duration * (insideDays / spanDays)
}

function normalizeRole(role) {
  return String(role || '').toLowerCase() === 'pic' ? 'pic' : 'crew'
}

function getAssignmentDays(assignment, win) {
  const site         = assignment?.site
  const siteStatus   = String(site?.site_status   || '').toLowerCase()
  const reportStatus = String(site?.report_status || '').toLowerCase()
  const siteType     = String(site?.site_type     || 'site_scanning').toLowerCase()
  const role         = normalizeRole(assignment?.assignment_role)

  if (siteStatus === 'postponed' || siteStatus === 'cancelled') return 0

  let days = 0

  // Field work — only the part scheduled inside this week
  if (ACTIVE_SITE_STATUSES.includes(siteStatus)) {
    const multipliers = ROLE_MULTIPLIERS[siteType] || ROLE_MULTIPLIERS.site_scanning
    days += getDaysInWindow(site, win) * (multipliers[role] ?? 1.0)
  }

  // Report work — outstanding reports load the current week, PIC-weighted
  if (OPEN_REPORT_STATUSES.includes(reportStatus)) {
    days += (Number(site?.report_duration_days) || 0) * (REPORT_ROLE_SHARE[role] ?? 0)
  }

  return days
}

export function calculateWorkload(assignments = [], options = {}) {
  const { referenceDate = new Date(), leaveDays = 0 } = options
  const win = getWeekBounds(referenceDate)

  const busyDays = assignments.reduce((sum, a) => sum + getAssignmentDays(a, win), 0)
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
