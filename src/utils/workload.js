const WEEKLY_CAPACITY_DAYS = 6.5

// Multipliers per role per site type (PIC scanning gets extra weight for admin/client work)
const ROLE_MULTIPLIERS = {
  site_scanning: { pic: 1.2, crew: 1.0 },
  site_visit:    { pic: 1.0, crew: 1.0 },
  meeting:       { pic: 1.0, crew: 1.0 },
}

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

function getAssignmentPercentage(assignment) {
  const site         = assignment?.site
  const siteStatus   = String(site?.site_status        || '').toLowerCase()
  const reportStatus = String(site?.report_status      || '').toLowerCase()
  const siteType     = String(site?.site_type          || 'site_scanning').toLowerCase()
  const role         = String(assignment?.assignment_role || '').toLowerCase()

  // Postponed site — no load on anyone
  if (siteStatus === 'postponed') return 0

  // Active or scheduled site — return early, no double counting with report
  if (['upcoming', 'ongoing'].includes(siteStatus)) {
    const duration    = Number(site?.site_duration_days) || 0
    const multipliers = ROLE_MULTIPLIERS[siteType] || ROLE_MULTIPLIERS.site_scanning
    const multiplier  = multipliers[role] ?? 1.0
    return (duration / WEEKLY_CAPACITY_DAYS) * 100 * multiplier
  }

  // Report work — only when site is no longer active on-site
  const reportActive = ['in_progress', 'submitted', 'report_pending'].includes(reportStatus)
  if (reportActive) {
    const reportDuration = Number(site?.report_duration_days) || 0
    return (reportDuration / WEEKLY_CAPACITY_DAYS) * 100
  }

  return 0
}

export function calculateWorkload(assignments = []) {
  const totalPct = assignments.reduce((sum, a) => sum + getAssignmentPercentage(a), 0)
  const workloadPercentage = Number(totalPct.toFixed(1))
  const statusColors = getWorkloadStatus(workloadPercentage)

  return {
    workload_percentage: workloadPercentage,
    status: statusColors.label,
    status_colors: statusColors,
  }
}

export { WEEKLY_CAPACITY_DAYS, ROLE_MULTIPLIERS, WORKLOAD_STATUS }
