import { supabase } from '../supabase'
import { notify } from './notify'
import { isOffDay } from './teamLeaves'
import { assignmentMemberId, assignmentsForDate, getSiteDates, isPic } from './siteDays'

// Jobs still to run; finished or called-off jobs keep the crew they had.
const ACTIVE = ['upcoming', 'ongoing']

const endOf = leave => String(leave.end_date || leave.start_date).slice(0, 10)

// Does the leave rule the person out of this site on that day?
// Full-day leave always does. Half-day leave only clashes with a site booked for
// that same half; against a full-day site the person can still do the other half.
function sessionClash(leave, site) {
  if (!leave.leave_session || leave.leave_session === 'FULL_DAY') return 'yes'
  const half = leave.leave_session === 'AM_ONLY' ? 'AM' : 'PM'
  if (site.site_session === half) return 'yes'
  if (site.site_session === 'AM' || site.site_session === 'PM') return 'no'
  return 'partly'
}

const fmt = d => new Date(`${d}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })

// What one site's crew becomes when this leave is applied (no database calls).
// null: not affected. { halfDay, dates }: booked but only half-clashing, left alone.
// Otherwise { next: rows to save, dates, wasPic, wholeJob }.
export function planLeaveRemoval(site, leave) {
  const memberId = leave.member_id
  const start = String(leave.start_date).slice(0, 10)
  const end = endOf(leave)
  const rows = site.site_assignments || []
  const dates = getSiteDates(site)
  const onDay = d => assignmentsForDate(rows, d).some(a => assignmentMemberId(a) === memberId)
  const leaveDates = dates.filter(d => d >= start && d <= end && onDay(d))
  if (leaveDates.length === 0) return null

  const clash = sessionClash(leave, site)
  if (clash === 'no') return null
  if (clash === 'partly') return { halfDay: true, dates: leaveDates }

  const wasPic = leaveDates.some(d => assignmentsForDate(rows, d).some(a => assignmentMemberId(a) === memberId && isPic(a)))
  const wholeJob = leaveDates.length === dates.length
  const clean = (a, work_date) => ({ site_id: site.id, member_id: assignmentMemberId(a), assignment_role: a.assignment_role, work_date })

  let next
  if (rows.every(a => !a.work_date) && wholeJob) {
    // Off for the whole job: just drop them
    next = rows.filter(a => assignmentMemberId(a) !== memberId).map(a => clean(a, null))
  } else {
    // Spell the crew out day by day, leaving them out on their leave days
    const off = new Set(leaveDates)
    next = dates.flatMap(d => assignmentsForDate(rows, d)
      .filter(a => !(off.has(d) && assignmentMemberId(a) === memberId))
      .map(a => clean(a, d)))
  }
  return { next, dates: leaveDates, wasPic, wholeJob }
}

// Take a member off every active site on the days of their leave.
// A site with one crew for all days that loses the person on only some days is
// switched to per-day crew, so the other days stay as they were.
// Returns { removed: [{ site, dates, wasPic }], halfDay: [{ site, dates }] }.
export async function removeLeaveFromSites(leave, { actor = 'System' } = {}) {
  const result = { removed: [], halfDay: [] }
  if (!leave?.member_id || !leave.start_date || isOffDay(leave)) return result
  const end = endOf(leave)
  const memberId = leave.member_id

  const { data: sites, error } = await supabase
    .from('sites')
    .select('id, site_name, scheduled_date, end_date, site_session, site_status, site_assignments(member_id, assignment_role, work_date)')
    .in('site_status', ACTIVE)
    .lte('scheduled_date', end)
  if (error) throw new Error(error.message)

  for (const site of sites || []) {
    const plan = planLeaveRemoval(site, leave)
    if (!plan) continue
    if (plan.halfDay) { result.halfDay.push({ site, dates: plan.dates }); continue }
    const { next, dates: leaveDates, wasPic, wholeJob } = plan

    // Same rewrite the Sites form does when the crew changes
    await supabase.from('workload_log').delete().eq('site_id', site.id)
    const { error: delError } = await supabase.from('site_assignments').delete().eq('site_id', site.id)
    if (delError) throw new Error(delError.message)
    if (next.length) {
      const { error: insError } = await supabase.from('site_assignments').insert(next)
      if (insError) throw new Error(`${site.site_name}: ${insError.message}`)
    }
    result.removed.push({ site, dates: leaveDates, wasPic })

    const when = wholeJob ? '' :` on ${leaveDates.map(fmt).join(', ')}`
    notify(`You were taken off "${site.site_name}"${when} — you are on ${String(leave.leave_type || 'leave').toLowerCase()}`, actor, memberId, 'site_update')
      .catch(err => console.warn('Notification failed:', err.message))
  }

  if (result.removed.length) window.dispatchEvent(new CustomEvent('xyte:site-saved'))
  return result
}
