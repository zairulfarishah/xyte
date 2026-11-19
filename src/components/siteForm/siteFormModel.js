import { supabase } from '../../supabase'
import { memberSchedule, notify, notifyMany, notifyScheduleChanges } from '../../utils/notify'
import { doApplies, mergeCompletionMeta, parseCompletionMeta, validateCompletionRequirement } from '../../utils/completionMeta'
import { getLeaveSessionLabel, getMemberLeaveOnDate } from '../../utils/teamLeaves'
import { getSiteDates, siteCrew, sitePic } from '../../utils/siteDays'
import { shrinkPhoto } from '../../utils/photo'
import { isOutsideKlSelangor } from '../../utils/outstation'

// Everything about a site form that isn't layout: the empty form, loading a site into it,
// and saving it (photo upload, site row, assignments, notifications). Used by the Dashboard
// and the Sites page so both add/edit sites the same way.

export const SITE_TYPES = [
  { value: 'site_scanning', label: 'Site Scanning', hint: 'GPR / concrete scan' },
  { value: 'site_visit', label: 'Site Visit', hint: 'Survey, quotation' },
  { value: 'meeting', label: 'Meeting', hint: 'Client or internal' },
]
export const SALESPERSONS = ['GH Tan', 'Chong Jie Yan', 'Jasmin', 'Darren', 'Wendy', 'Zairul', 'Reekha', 'Ryan']
export const SESSIONS = ['Full Day', 'AM', 'PM', 'Night Work']
export const SITE_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled', 'postponed']
export const REPORT_STATUSES = ['pending', 'in_progress', 'submitted', 'approved', 'not_applicable']

export const EMPTY_SITE_FORM = {
  site_type: 'site_scanning', site_name: '', location: '', latitude: '', longitude: '', outstation: false,
  client_company_name: '', client_name: '', client_number: '', scope_of_work: '',
  salesperson: '', scheduled_date: '', end_date: '', site_session: '', site_status: 'upcoming', report_status: 'pending',
  site_duration_days: '1', report_duration_days: '0.5', notes: '', pic_id: '', crew_ids: [],
  assign_mode: 'same', daily_assignments: {},
  delivery_order_number: '', completion_reason: '',
  site_photo: null, site_photo_preview: null, site_photo_url: '',
}

export function datesInRange(start, end) {
  if (!start) return []
  const arr = []
  const cur = new Date(`${start}T00:00:00`)
  const last = new Date(`${end || start}T00:00:00`)
  while (cur <= last) {
    arr.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    cur.setDate(cur.getDate() + 1)
  }
  return arr
}

export function formFromSite(site) {
  const assignments = site.site_assignments || []
  const isPerDay = assignments.some(a => a.work_date)
  const idOf = a => a.team_members?.id || a.member_id
  const pic = assignments.find(a => a.assignment_role === 'PIC' && !a.work_date)
  const crew = assignments.filter(a => a.assignment_role === 'crew' && !a.work_date)
  const dailyAssignments = {}
  if (isPerDay) {
    assignments.filter(a => a.work_date).forEach(a => {
      const d = dailyAssignments[a.work_date] || { pic_id: '', crew_ids: [] }
      if (a.assignment_role === 'PIC') d.pic_id = idOf(a) || ''
      else if (idOf(a)) d.crew_ids = [...d.crew_ids, idOf(a)]
      dailyAssignments[a.work_date] = d
    })
  }
  const completionMeta = parseCompletionMeta(site.notes || '')
  return {
    ...EMPTY_SITE_FORM,
    site_type: site.site_type || 'site_scanning',
    site_name: site.site_name, location: site.location,
    latitude: site.latitude || '', longitude: site.longitude || '',
    outstation: !!site.outstation,
    client_company_name: site.client_company_name || '', client_name: site.client_name || '',
    client_number: site.client_number || '', scope_of_work: site.scope_of_work || '',
    salesperson: site.salesperson || '', scheduled_date: site.scheduled_date,
    end_date: site.end_date || site.scheduled_date || '', site_session: site.site_session || '',
    site_status: site.site_status,
    site_duration_days: site.site_duration_days?.toString() || '1',
    report_duration_days: site.report_duration_days?.toString() || '0.5',
    report_status: site.report_status, notes: completionMeta.baseNotes,
    pic_id: isPerDay ? '' : (pic ? idOf(pic) || '' : ''),
    crew_ids: isPerDay ? [] : crew.map(idOf).filter(Boolean),
    assign_mode: isPerDay ? 'per_day' : 'same',
    daily_assignments: dailyAssignments,
    delivery_order_number: completionMeta.deliveryOrderNumber,
    completion_reason: completionMeta.completionReason,
    site_photo: null, site_photo_preview: site.site_photo_url || null, site_photo_url: site.site_photo_url || '',
  }
}

// Same client, place, scope and team as an earlier site — just pick the new dates
export function duplicateForm(site) {
  const base = formFromSite(site)
  const { pic_id, crew_ids } = base.assign_mode === 'per_day'
    ? (() => {
        const p = sitePic(site), c = siteCrew(site)
        return { pic_id: p?.team_members?.id || '', crew_ids: c.map(x => x.team_members?.id).filter(id => id && id !== p?.team_members?.id) }
      })()
    : base
  return {
    ...base,
    scheduled_date: '', end_date: '', site_session: '',
    site_status: 'upcoming', report_status: 'pending',
    delivery_order_number: '', completion_reason: '',
    assign_mode: 'same', daily_assignments: {}, pic_id, crew_ids: [...new Set(crew_ids)],
  }
}

// Days a scanning job counts for: same day = by session, otherwise the number of calendar days
export function siteDuration(form) {
  if (form.site_type === 'site_visit') return 0.5
  if (form.site_type === 'site_scanning') {
    const sameDay = form.scheduled_date && form.end_date && form.scheduled_date === form.end_date
    if (sameDay) return form.site_session === 'Full Day' ? 1 : 0.5
    if (form.scheduled_date && form.end_date) return Math.round((new Date(form.end_date) - new Date(form.scheduled_date)) / 86400000) + 1
  }
  return parseFloat(form.site_duration_days) || 1
}

export function leaveConflict(members, leaves, memberIds, date) {
  const conflicts = memberIds
    .map(id => {
      const member = members.find(m => m.id === id)
      const leave = getMemberLeaveOnDate(leaves, id, date)
      return leave && member ? { member, leave } : null
    })
    .filter(Boolean)
  if (!conflicts.length) return null
  return `These team members are on leave for ${date}: ${conflicts.map(({ member, leave }) => `${member.full_name} (${leave.leave_type}, ${getLeaveSessionLabel(leave.leave_session)})`).join(', ')}`
}

async function uploadSitePhoto(original) {
  const file = await shrinkPhoto(original)
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('site-photos').upload(path, file)
  if (error) throw new Error(`Photo upload failed: ${error.message}`)
  return supabase.storage.from('site-photos').getPublicUrl(path).data.publicUrl
}

// Only people whose own schedule changed hear about it: new days, removed days, a new
// role, or (for everyone still on the site) a change of session on the same day.
async function sendSaveNotifications({ form, editSite, assignments, savedSite, fullName, memberId }) {
  const before = editSite ? memberSchedule(editSite.site_assignments || [], getSiteDates(editSite)) : new Map()
  const after = memberSchedule(assignments, getSiteDates(savedSite))
  const sessionChanged = !!editSite && (editSite.site_session || null) !== (savedSite.site_session || null)
  const told = await notifyScheduleChanges({
    siteName: form.site_name,
    before,
    after,
    sessionNote: sessionChanged && savedSite.site_session ? `now ${savedSite.site_session}` : sessionChanged ? 'session updated' : null,
    actor: fullName,
    skipId: memberId,
  })
  const jobs = [notify(`${editSite ? 'Updated' : 'Added'} site: ${form.site_name}`, fullName, null, 'general')]
  if (editSite) {
    // PICs who weren't already told about their own schedule still hear the site was edited
    const statusNote = editSite.site_status !== form.site_status ? ` — status: ${form.site_status}` : ''
    const stillPic = [...after].filter(([id, s]) => s.role === 'PIC' && id !== memberId && !told.has(id)).map(([id]) => id)
    jobs.push(notifyMany(`${fullName} updated site "${form.site_name}" (you are PIC)${statusNote}`, fullName, stillPic, 'pic_update'))
  }
  await Promise.all(jobs)
}

// Checks, uploads and saves. Throws an Error with a user-facing message if anything is wrong.
export async function saveSite({ form, editSite, members, leaves, fullName, memberId }) {
  if (!form.site_name || !form.location || !form.scheduled_date) throw new Error('Site name, location and start date are required.')
  // Days left over from an older date range are dropped, not checked or saved
  const siteDays = new Set(datesInRange(form.scheduled_date, form.end_date))
  const dailyInRange = Object.entries(form.daily_assignments).filter(([d]) => siteDays.has(d))
  if (form.assign_mode === 'per_day') {
    for (const [d, day] of dailyInRange) {
      const err = leaveConflict(members, leaves, [day.pic_id, ...day.crew_ids].filter(Boolean), d)
      if (err) throw new Error(err)
    }
  } else {
    const err = leaveConflict(members, leaves, [form.pic_id, ...form.crew_ids].filter(Boolean), form.scheduled_date)
    if (err) throw new Error(err)
  }
  const completionError = validateCompletionRequirement(form.site_status, form.delivery_order_number, form.completion_reason, form.site_type)
  if (completionError) throw new Error(completionError)

  let photoUrl = form.site_photo_url
  if (form.site_photo) photoUrl = await uploadSitePhoto(form.site_photo)

  const isVisit = form.site_type === 'site_visit'
  const isMeeting = form.site_type === 'meeting'
  const payload = {
    site_type: form.site_type, site_name: form.site_name, location: form.location,
    latitude: form.latitude !== '' ? parseFloat(form.latitude) : null,
    longitude: form.longitude !== '' ? parseFloat(form.longitude) : null,
    outstation: isOutsideKlSelangor(form.location, form.latitude, form.longitude) === false ? false : !!form.outstation,
    client_company_name: form.client_company_name || null, client_name: form.client_name || null,
    client_number: form.client_number || null, scope_of_work: form.scope_of_work || null,
    salesperson: form.salesperson || null, site_photo_url: photoUrl || null,
    scheduled_date: form.scheduled_date,
    end_date: form.end_date || form.scheduled_date || null,
    site_session: (form.scheduled_date && form.end_date && form.scheduled_date === form.end_date) ? (form.site_session || null) : null,
    site_status: form.site_status,
    site_duration_days: siteDuration(form),
    report_duration_days: isVisit || isMeeting ? 0 : (parseFloat(form.report_duration_days) || 0),
    report_status: isVisit || isMeeting ? 'not_applicable' : form.report_status,
    notes: mergeCompletionMeta(form.notes, {
      deliveryOrderNumber: doApplies(form.site_type) ? form.delivery_order_number : '',
      completionReason: doApplies(form.site_type) ? form.completion_reason : '',
    }),
  }

  const assignments = []
  if (form.assign_mode === 'per_day') {
    dailyInRange.forEach(([d, day]) => {
      if (day.pic_id) assignments.push({ member_id: day.pic_id, assignment_role: 'PIC', work_date: d })
      day.crew_ids.forEach(id => { if (id !== day.pic_id) assignments.push({ member_id: id, assignment_role: 'crew', work_date: d }) })
    })
  } else {
    if (form.pic_id) assignments.push({ member_id: form.pic_id, assignment_role: 'PIC', work_date: null })
    form.crew_ids.forEach(id => { if (id !== form.pic_id) assignments.push({ member_id: id, assignment_role: 'crew', work_date: null }) })
  }

  // Only rewrite assignments when the rows themselves differ
  const keys = rows => rows.map(a => `${a.member_id || a.team_members?.id}|${a.assignment_role}|${a.work_date || ''}`).sort().join(',')
  const changed = !editSite || keys(editSite.site_assignments || []) !== keys(assignments)
  // Before sql/migrate-site-outstation.sql is run the column is missing: still save the
  // site, unless it was marked outstation (then say what to run).
  const writeSite = async run => {
    let res = await run(payload)
    if (res.error && /outstation/.test(res.error.message)) {
      if (payload.outstation) throw new Error('Outstation needs a database update — run sql/migrate-site-outstation.sql in the Supabase SQL editor.')
      const rest = { ...payload }
      delete rest.outstation
      res = await run(rest)
    }
    if (res.error) throw new Error(res.error.message)
    return res
  }

  let siteId = editSite?.id
  if (editSite) {
    await writeSite(p => supabase.from('sites').update(p).eq('id', siteId))
    if (changed) {
      const [{ error: delError }] = await Promise.all([
        supabase.from('site_assignments').delete().eq('site_id', siteId),
        supabase.from('workload_log').delete().eq('site_id', siteId),
      ])
      if (delError) throw new Error(delError.message)
    }
  } else {
    const { data } = await writeSite(p => supabase.from('sites').insert(p).select().single())
    siteId = data.id
  }
  if (changed && assignments.length) {
    const { error } = await supabase.from('site_assignments').insert(assignments.map(a => ({ ...a, site_id: siteId })))
    if (error) throw new Error(error.message)
  }

  // Saved — notifications go out in the background
  sendSaveNotifications({ form, editSite, assignments, savedSite: payload, fullName, memberId })
    .catch(err => console.warn('Notification failed:', err.message))
  window.dispatchEvent(new CustomEvent('xyte:site-saved'))
  return { id: siteId, name: form.site_name }
}
