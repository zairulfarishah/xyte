import { reportOverdueDays } from '../../utils/siteCard'

// Report steps in order (not_applicable sits outside the flow)
export const REPORT_FLOW = ['pending', 'in_progress', 'submitted', 'approved']

export const REPORT_TABS = [
  { key: 'all',            label: 'All' },
  { key: 'overdue',        label: 'Overdue' },
  { key: 'pending',        label: 'Pending' },
  { key: 'in_progress',    label: 'In progress' },
  { key: 'submitted',      label: 'Submitted' },
  { key: 'approved',       label: 'Approved' },
  { key: 'not_applicable', label: 'Not applicable' },
]

export function matchesTab(site, tab, today) {
  if (tab === 'all') return true
  if (tab === 'overdue') return reportOverdueDays(site, today) > 0
  return site.report_status === tab
}

// Badge colour = report status (overdue wins)
export function badgeTone(site, today) {
  if (reportOverdueDays(site, today) > 0) return 'late'
  return { pending: 'pending', in_progress: 'progress', submitted: 'submitted', approved: 'approved' }[site.report_status] || 'na'
}
