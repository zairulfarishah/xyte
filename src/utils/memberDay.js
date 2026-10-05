// What each team member is doing on a given day — the one place every people view reads from,
// so a person never shows as "Available" on one page and "At store" on another.
import { getMemberLeaveOnDate, isDateWithinLeave, isOffDay } from './teamLeaves'
import { publicHolidayName } from './holidays'
import { assignmentMemberId, assignmentsForDate, isPic, memberDatesOnSite, siteMemberIds } from './siteDays'

export const INACTIVE_SITE = ['cancelled', 'postponed']
export const isActiveSite = site => !INACTIVE_SITE.includes(String(site?.site_status || '').toLowerCase())

const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

// memberId|date → [{ site, role }], from active sites only
export function buildJobIndex(sites) {
  const index = new Map()
  for (const site of sites) {
    if (!isActiveSite(site)) continue
    for (const id of siteMemberIds(site)) {
      for (const date of memberDatesOnSite(site, id)) {
        const role = assignmentsForDate(site.site_assignments, date).some(a => assignmentMemberId(a) === id && isPic(a)) ? 'PIC' : 'crew'
        const key = `${id}|${date}`
        if (!index.has(key)) index.set(key, [])
        index.get(key).push({ site, role })
      }
    }
  }
  return index
}

// On site, on leave, rostered off, Sunday, public holiday, store (Saturday) or available.
export function memberDayStatus(jobIndex, leaves, memberId, date) {
  const jobs = jobIndex.get(`${memberId}|${date}`)
  if (jobs?.length) return { kind: 'site', jobs }
  // Real leave wins over a rostered off day on the same date
  const leave = leaves.find(l => l.member_id === memberId && !isOffDay(l) && isDateWithinLeave(date, l))
    || getMemberLeaveOnDate(leaves, memberId, date)
  if (leave) return isOffDay(leave) ? { kind: 'off', label: 'Off' } : { kind: 'leave', label: titleCase(leave.leave_type), leave }
  const dow = new Date(`${date}T00:00:00`).getDay()
  if (dow === 0) return { kind: 'off', label: 'Off', sunday: true }
  const holiday = publicHolidayName(date)
  if (holiday) return { kind: 'holiday', label: holiday }
  if (dow === 6) return { kind: 'store', label: 'Store' }
  return { kind: 'free', label: 'Available' }
}
