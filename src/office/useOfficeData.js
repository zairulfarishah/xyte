import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { activeMembers } from '../utils/members'
import { fetchTeamLeaves } from '../utils/teamLeaves'
import { assignmentMemberId, assignmentsForDate, getSiteDates, isPic } from '../utils/siteDays'
import { buildJobIndex, isActiveSite, memberDayStatus } from '../utils/memberDay'
import { notExpiredFilter } from '../utils/feed'

// Everything the office shows, from Supabase. Refreshed every 60 s while the page is open.
// A query that fails gives null for its part, so the page shows "—" or an empty state —
// never an invented number.

const REFRESH_MS = 60000
const pad = n => String(n).padStart(2, '0')
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d) }
const shortName = m => m?.short_name || m?.full_name?.split(' ')[0] || '?'
// "Menara X, Jalan Y, Brickfields, Kuala Lumpur, 50470, Malaysia" → "Kuala Lumpur"
export function areaOf(location) {
  const parts = String(location || '').split(',').map(p => p.trim()).filter(p => p && !/^malaysia$/i.test(p) && !/^\d{4,6}$/.test(p))
  return parts.length > 1 ? parts[parts.length - 2].replace(/^Wilayah Persekutuan\s+/i, '') : parts[0] || ''
}
const TYPE = { site_scanning: 'Scanning', site_visit: 'Site visit', meeting: 'Meeting' }

const safe = async (p) => { try { const r = await p; return r?.error ? null : r } catch { return null } }

export function useOfficeData() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const today = isoOf(new Date())
    const dow = new Date(`${today}T00:00:00`).getDay()
    const monday = addDays(today, -((dow + 6) % 7))
    const [membersR, sitesR, leaves, claimsR, reportsSubR, reportsOpenR, feedR, tasksR, libR, roundR, sharesR, ptR, scanR] = await Promise.all([
      safe(supabase.from('team_members').select('*').order('full_name')),
      safe(supabase.from('sites')
        .select('id, site_name, location, site_type, site_status, site_session, scheduled_date, end_date, report_status, site_assignments(assignment_role, member_id, work_date, team_members(id, full_name))')
        .eq('is_hidden', false).gte('scheduled_date', addDays(today, -60)).lte('scheduled_date', addDays(monday, 6))),
      fetchTeamLeaves().catch(() => null),
      safe(supabase.from('claims').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      safe(supabase.from('sites').select('id', { count: 'exact', head: true }).eq('report_status', 'submitted').eq('is_hidden', false)),
      safe(supabase.from('sites').select('id', { count: 'exact', head: true }).in('report_status', ['pending', 'in_progress']).eq('site_status', 'completed').eq('site_type', 'site_scanning').eq('is_hidden', false)),
      safe(supabase.from('feed_posts').select('id, body, author_name, created_at, author:team_members(full_name)').or(notExpiredFilter()).order('created_at', { ascending: false }).limit(4)),
      safe(supabase.from('tasks').select('id, title, status, due_date, task_assignments(member_id)').neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(50)),
      safe(supabase.from('library_documents').select('section, expires_on')),
      safe(supabase.from('lunch_rounds').select('id, title, status').order('created_at', { ascending: false }).limit(1)),
      safe(supabase.from('bill_shares').select('id', { count: 'exact', head: true }).is('received_at', null)),
      safe(supabase.from('pt_jobs').select('id', { count: 'exact', head: true })),
      safe(supabase.from('scan_projects').select('id', { count: 'exact', head: true })),
    ])
    if (!membersR || !sitesR) { setError('Could not load the team or sites.'); return }
    setError(null)

    const members = activeMembers(membersR.data)
    const byId = Object.fromEntries(members.map(m => [m.id, m]))
    const sites = (sitesR.data || []).filter(isActiveSite)
    const jobIndex = buildJobIndex(sites)
    const lv = leaves || []
    const statusOf = (id, d) => memberDayStatus(jobIndex, lv, id, d)
    const siteLabel = s => [s.site_name, areaOf(s.location)].filter(Boolean).join(' · ')

    // today's sites + who is on each
    const todaySites = sites.filter(s => getSiteDates(s).includes(today)).map(s => {
      const rows = assignmentsForDate(s.site_assignments || [], today)
      const people = rows.map(a => byId[assignmentMemberId(a)]).filter(Boolean)
      const pic = rows.filter(isPic).map(a => byId[assignmentMemberId(a)]).find(Boolean)
      const dates = getSiteDates(s)
      return {
        id: s.id, name: s.site_name, place: areaOf(s.location), type: TYPE[s.site_type] || 'Scanning',
        day: dates.length > 1 ? `Day ${dates.indexOf(today) + 1}/${dates.length}` : (s.site_session || 'Full day'),
        people: people.map(shortName), pic: pic ? shortName(pic) : null,
        detail: [TYPE[s.site_type] || 'Scanning', areaOf(s.location), people.length ? `${people.length} crew` : 'no crew yet'].filter(Boolean).join(' · '),
      }
    })

    // one desk per active member
    const crew = members.map(m => {
      const st = statusOf(m.id, today)
      const status = st.kind === 'site' ? 'site' : st.kind === 'leave' ? 'leave' : ['off', 'holiday'].includes(st.kind) ? 'off' : 'office'
      return {
        id: m.id, name: shortName(m), fullName: m.full_name, role: m.role || '', avatar: m.avatar_url || null,
        status, site: st.kind === 'site' ? st.jobs.map(j => siteLabel(j.site)).join(' + ') : null,
        siteIds: st.kind === 'site' ? st.jobs.map(j => j.site.id) : [],
        offLabel: st.kind === 'holiday' ? st.label : '',
      }
    })

    // this week, Mon–Sun, per person: site / office / leave / off
    const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    const weekGrid = members.map(m => ({
      name: shortName(m),
      days: week.map(d => { const k = statusOf(m.id, d).kind; return k === 'site' ? 's' : k === 'leave' ? 'l' : ['off', 'holiday'].includes(k) ? '' : 'o' }),
    }))

    const sections = {}, soon = addDays(today, 30)
    let expiring = 0
    for (const d of libR?.data || []) {
      sections[d.section] = (sections[d.section] || 0) + 1
      if (d.expires_on && d.expires_on >= today && d.expires_on <= soon) expiring++
    }

    const count = r => (r ? r.count ?? 0 : null)
    const approvals = claimsR && reportsSubR ? count(claimsR) + count(reportsSubR) : null
    setData({
      today, week, members, crew, todaySites, weekGrid,
      approvals, claimsPending: count(claimsR), reportsSubmitted: count(reportsSubR), reportsOpen: count(reportsOpenR),
      feed: feedR ? feedR.data || [] : null,
      tasks: tasksR ? tasksR.data || [] : null,
      library: libR ? { sections, expiring, total: (libR.data || []).length } : null,
      lunch: roundR ? (roundR.data || [])[0] || null : undefined,
      unpaidShares: count(sharesR),
      ptJobs: count(ptR), scanProjects: count(scanR),
      loadedAt: new Date(),
    })
  }, [])

  useEffect(() => {
    let alive = true
    const run = () => { if (alive && !document.hidden) load() }
    run()
    const t = setInterval(run, REFRESH_MS)
    const onVis = () => { if (!document.hidden) run() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  return { data, error, reload: load }
}
