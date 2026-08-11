// Per-day crew for multi-day sites.
//
// site_assignments.work_date holds the day a row applies to. A row with
// no date applies to every day of the site — that is what every pre-migration
// row means, so both shapes are readable through the helpers below.

const MAX_SPAN_DAYS = 366

export function normalizeDate(value) {
  if (!value) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  return String(value).slice(0, 10)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// Every calendar day the site runs, first to last.
export function getSiteDates(site) {
  const start = normalizeDate(site?.scheduled_date)
  if (!start) return []
  const end = normalizeDate(site?.end_date) || start

  const startDate = new Date(`${start}T00:00:00`)
  const endDate   = new Date(`${end}T00:00:00`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return [start]

  const span = Math.min(Math.round((endDate - startDate) / 86400000) + 1, MAX_SPAN_DAYS)
  return Array.from({ length: span }, (_, i) => {
    const day = new Date(startDate)
    day.setDate(day.getDate() + i)
    return normalizeDate(day)
  })
}

export function getSiteDayCount(site) {
  return getSiteDates(site).length
}

// Rows are selected with member_id in some pages and only the nested row in others.
export function assignmentMemberId(assignment) {
  return assignment?.member_id || assignment?.team_members?.id || null
}

export function isPic(assignment) {
  return String(assignment?.assignment_role || '').toLowerCase() === 'pic'
}

// Does this site keep a separate crew per day?
export function hasDailyCrew(assignments = []) {
  return assignments.some(a => a.work_date)
}

// Rows that apply on a given day: the rows pinned to that date, plus the
// undated rows (which cover every day) for anyone not already listed.
export function assignmentsForDate(assignments = [], date) {
  const target = normalizeDate(date)
  const undated = assignments.filter(a => !a.work_date)
  if (!target) return undated.length > 0 ? undated : assignments

  const dated = assignments.filter(a => normalizeDate(a.work_date) === target)
  const datedIds = new Set(dated.map(assignmentMemberId).filter(Boolean))
  return [...dated, ...undated.filter(a => !datedIds.has(assignmentMemberId(a)))]
}

export function picForDate(assignments = [], date) {
  return assignmentsForDate(assignments, date).find(isPic) || null
}

export function crewForDate(assignments = [], date) {
  return assignmentsForDate(assignments, date).filter(a => !isPic(a))
}

// The day a site-level view should speak for: today when the site is running,
// otherwise its first day.
export function representativeDate(site, referenceDate = new Date()) {
  const dates = getSiteDates(site)
  if (dates.length === 0) return ''
  const today = normalizeDate(referenceDate)
  return dates.includes(today) ? today : dates[0]
}

export function sitePic(site, referenceDate = new Date()) {
  return picForDate(site?.site_assignments || [], representativeDate(site, referenceDate))
}

export function siteCrew(site, referenceDate = new Date()) {
  return crewForDate(site?.site_assignments || [], representativeDate(site, referenceDate))
}

// One row per member across the whole site, PIC row winning — for "everyone who
// touched this site" lists, which must not repeat a person once per day.
export function uniqueAssignments(assignments = []) {
  const byMember = new Map()
  assignments.forEach(a => {
    const id = assignmentMemberId(a)
    const key = id || a
    const existing = byMember.get(key)
    if (!existing || (isPic(a) && !isPic(existing))) byMember.set(key, a)
  })
  return [...byMember.values()]
}

export function siteMemberIds(site) {
  return [...new Set((site?.site_assignments || []).map(assignmentMemberId).filter(Boolean))]
}

// Days this member actually stands on the site.
export function memberDatesOnSite(site, memberId) {
  const assignments = site?.site_assignments || []
  const mine = assignments.filter(a => assignmentMemberId(a) === memberId)
  if (mine.length === 0) return []
  if (mine.some(a => !a.work_date)) return getSiteDates(site)

  const siteDates = getSiteDates(site)
  const mineDates = new Set(mine.map(a => normalizeDate(a.work_date)))
  const inSpan = siteDates.filter(d => mineDates.has(d))
  // A pinned date outside the span (site was rescheduled) still counts as a day.
  return inSpan.length > 0 ? inSpan : [...mineDates].filter(Boolean).sort()
}

export function memberDaysOnSite(site, memberId) {
  return memberDatesOnSite(site, memberId).length
}

export function memberRoleOnSite(site, memberId) {
  const mine = (site?.site_assignments || []).filter(a => assignmentMemberId(a) === memberId)
  if (mine.length === 0) return null
  return mine.some(isPic) ? 'PIC' : 'crew'
}

// Days of the site nobody is leading.
export function missingPicDates(site) {
  const assignments = site?.site_assignments || []
  const dates = getSiteDates(site)
  if (dates.length === 0) return assignments.some(isPic) ? [] : ['']
  return dates.filter(date => !picForDate(assignments, date))
}

export function isMissingPic(site) {
  return missingPicDates(site).length > 0
}

// Assignment rows expanded to one entry per day, each carrying its own date.
export function assignmentDays(site) {
  const assignments = site?.site_assignments || []
  const dates = getSiteDates(site)
  return assignments.flatMap(a => {
    if (a.work_date) return [{ assignment: a, date: normalizeDate(a.work_date) }]
    return dates.map(date => ({ assignment: a, date }))
  })
}

export function formatDayLabel(date) {
  const normalized = normalizeDate(date)
  if (!normalized) return ''
  return new Date(`${normalized}T00:00:00`).toLocaleDateString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}
