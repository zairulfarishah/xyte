// One status → colour map for the whole app, so a status looks the same on every page.
// tone is one of: success, warning, danger, info, review, neutral, orange (see kit.css .x-tone-*)

export const SITE_STATUS = {
  upcoming:  { label: 'Upcoming',  tone: 'warning' },
  ongoing:   { label: 'Ongoing',   tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  postponed: { label: 'Postponed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

export const REPORT_STATUS = {
  pending:        { label: 'Pending',        tone: 'warning' },
  in_progress:    { label: 'In progress',    tone: 'info' },
  submitted:      { label: 'Submitted',      tone: 'review' },
  approved:       { label: 'Approved',       tone: 'success' },
  not_applicable: { label: 'Not applicable', tone: 'neutral' },
}

const titleCase = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export function statusInfo(map, key) {
  const k = String(key || '').toLowerCase()
  return map[k] || { label: titleCase(k) || '—', tone: 'neutral' }
}
