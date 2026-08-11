import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useViewport } from '../utils/useViewport'
import { getSiteTitle } from '../utils/siteTitle'
import {
  BASE, areaOf, countBy, daysBetween, distanceFromBase, formatNumber,
  monthKey, monthLabel, siteEndDate, sumBy, toDate, topEntries, weekKey,
} from '../utils/statistics'
import { getSiteDayCount, hasDailyCrew, memberDaysOnSite, siteMemberIds } from '../utils/siteDays'

/* ── Viz tokens (validated: light surface, sequential blue + fixed status) ── */
const SURFACE = '#ffffff'
const INK        = '#0f172a'
const INK_MUTED  = '#64748b'
const INK_FAINT  = '#94a3b8'
const GRID       = '#eef2f7'

const SEQ = {
  track: '#e8eef7',
  step250: '#86b6ef',
  step350: '#5598e7',
  step450: '#2a78d6',
  step550: '#1c5cab',
  step650: '#104281',
}

// Categorical: first three slots of the validated order (all-pairs safe)
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a']

const STATUS = {
  good:     '#0ca30c',
  warning:  '#fab219',
  serious:  '#ec835a',
  critical: '#d03b3b',
}

const TYPE_LABELS = {
  site_scanning: 'Site Scanning',
  site_visit: 'Site Visit',
  meeting: 'Meeting',
}

const SITE_STATUS_ORDER = ['upcoming', 'ongoing', 'completed', 'postponed', 'cancelled']

const REPORT_STAGES = [
  { key: 'pending',     label: 'Pending',     color: SEQ.step250 },
  { key: 'in_progress', label: 'In progress', color: SEQ.step350 },
  { key: 'submitted',   label: 'Submitted',   color: SEQ.step450 },
  { key: 'approved',    label: 'Approved',    color: SEQ.step650 },
]

/* ── Pieces ── */

const card = {
  background: SURFACE,
  border: '1px solid rgba(203,213,225,.85)',
  borderRadius: '16px',
  boxShadow: '0 8px 26px rgba(15,23,42,.06)',
  overflow: 'hidden',
}

function Card({ title, subtitle, right, children, minHeight }) {
  return (
    <section style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${GRID}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: INK, letterSpacing: '-.01em' }}>{title}</h3>
          {subtitle && <p style={{ margin: '3px 0 0', fontSize: '11px', color: INK_FAINT, fontWeight: '600' }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      <div style={{ padding: '16px 18px', flex: 1, minHeight }}>{children}</div>
    </section>
  )
}

function StatTile({ label, value, unit, sub, accent = SEQ.step450 }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: accent, flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: '11px', fontWeight: '800', color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: '30px', fontWeight: '800', color: INK, letterSpacing: '-.03em', lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: '14px', fontWeight: '700', color: INK_MUTED, marginLeft: '4px' }}>{unit}</span>}
      </p>
      {sub && <p style={{ margin: '7px 0 0', fontSize: '12px', color: INK_FAINT, fontWeight: '600' }}>{sub}</p>}
    </div>
  )
}

// Horizontal magnitude bars — one hue, value always direct-labelled
function BarList({ rows, max, unit = '', emptyText = 'No data yet', color = SEQ.step450 }) {
  if (!rows || rows.length === 0) {
    return <p style={{ margin: 0, padding: '18px 0', textAlign: 'center', fontSize: '12px', color: INK_FAINT, fontWeight: '600' }}>{emptyText}</p>
  }

  const ceiling = max || Math.max(...rows.map(r => r.value), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '5px' }}>
            <span title={row.label} style={{ fontSize: '12px', fontWeight: '700', color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.label}
            </span>
            <span style={{ fontSize: '12px', fontWeight: '800', color: INK_MUTED, flexShrink: 0 }}>
              {formatNumber(row.value, row.decimals ?? 0)}{unit}
              {row.note && <span style={{ fontWeight: '600', color: INK_FAINT }}> · {row.note}</span>}
            </span>
          </div>
          <div style={{ height: '10px', background: SEQ.track, borderRadius: '5px', overflow: 'hidden' }}>
            <div
              title={`${row.label}: ${formatNumber(row.value, row.decimals ?? 0)}${unit}`}
              style={{ width: `${Math.max(2, (row.value / ceiling) * 100)}%`, height: '100%', background: color, borderRadius: '5px' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// Monthly columns — sequential, latest month emphasised
function MonthColumns({ data }) {
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '150px' }}>
        {data.map((d, i) => {
          const isLast = i === data.length - 1
          return (
            <div key={d.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '10px', fontWeight: '800', color: d.value > 0 ? INK_MUTED : 'transparent' }}>{d.value}</span>
              <div
                title={`${monthLabel(d.key)}: ${d.value} site${d.value === 1 ? '' : 's'}`}
                style={{
                  width: '100%',
                  height: `${Math.max(d.value > 0 ? 4 : 2, (d.value / max) * 110)}px`,
                  background: isLast ? SEQ.step650 : SEQ.step450,
                  borderRadius: '4px 4px 0 0',
                  opacity: d.value === 0 ? 0.25 : 1,
                }}
              />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', borderTop: `1px solid ${GRID}`, paddingTop: '7px' }}>
        {data.map(d => (
          <span key={d.key} style={{ flex: 1, textAlign: 'center', fontSize: '9px', fontWeight: '700', color: INK_FAINT, whiteSpace: 'nowrap' }}>
            {monthLabel(d.key).split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  )
}

// Part-to-whole, categorical with legend + direct labels
function StackedShare({ parts, total }) {
  if (total === 0) {
    return <p style={{ margin: 0, padding: '18px 0', textAlign: 'center', fontSize: '12px', color: INK_FAINT, fontWeight: '600' }}>No sites yet</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', height: '14px', marginBottom: '14px' }}>
        {parts.filter(p => p.value > 0).map(p => (
          <div key={p.label} title={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}
            style={{ width: `${(p.value / total) * 100}%`, background: p.color, borderRadius: '4px' }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {parts.map(p => (
          <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: p.color, flexShrink: 0 }} />
            <span style={{ fontSize: '12px', fontWeight: '700', color: INK, flex: 1 }}>{p.label}</span>
            <span style={{ fontSize: '12px', fontWeight: '800', color: INK_MUTED }}>
              {p.value} <span style={{ fontWeight: '600', color: INK_FAINT }}>· {total > 0 ? Math.round((p.value / total) * 100) : 0}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecordRow({ label, value, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${GRID}` }}>
      <span style={{ fontSize: '12px', fontWeight: '700', color: INK_MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: INK, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        {note && <span style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: INK_FAINT, marginTop: '1px' }}>{note}</span>}
      </span>
    </div>
  )
}

/* ── Page ── */

export default function Statistics() {
  const { isMobile, isTablet } = useViewport()
  const [sites, setSites] = useState([])
  const [members, setMembers] = useState([])
  const [docCount, setDocCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function fetchAll() {
      const [{ data: siteData }, { data: memberData }, { data: docs }] = await Promise.all([
        supabase.from('sites').select('*, site_assignments(assignment_role, work_date, member_id, team_members(id, full_name))'),
        supabase.from('team_members').select('id, full_name, short_name').order('full_name'),
        supabase.from('library_documents').select('id'),
      ])
      if (!active) return
      setSites(siteData || [])
      setMembers(memberData || [])
      setDocCount(docs?.length || 0)
      setLoading(false)
    }

    fetchAll()
    return () => { active = false }
  }, [])

  const stats = useMemo(() => {
    const real = sites.filter(s => String(s.site_status || '').toLowerCase() !== 'cancelled')
    const dated = sites.filter(s => toDate(s.scheduled_date))

    /* Volume */
    const totalFieldDays = sites.reduce((sum, s) => sum + (Number(s.site_duration_days) || 0), 0)
    const now = new Date()
    const thisMonth = monthKey(now)
    const thisYear = String(now.getFullYear())
    const sitesThisMonth = dated.filter(s => monthKey(toDate(s.scheduled_date)) === thisMonth).length
    const sitesThisYear = dated.filter(s => String(toDate(s.scheduled_date).getFullYear()) === thisYear).length

    const months = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ key: monthKey(d), value: 0 })
    }
    const monthIndex = Object.fromEntries(months.map((m, i) => [m.key, i]))
    dated.forEach(s => {
      const key = monthKey(toDate(s.scheduled_date))
      if (key in monthIndex) months[monthIndex[key]].value += 1
    })

    const monthCounts = countBy(dated, s => monthKey(toDate(s.scheduled_date)))
    const busiestMonth = topEntries(monthCounts, 1)[0] || null
    const weekCounts = countBy(dated, s => weekKey(toDate(s.scheduled_date)))
    const busiestWeek = topEntries(weekCounts, 1)[0] || null
    const weekdayCounts = countBy(dated, s => toDate(s.scheduled_date).getDay())
    const busiestWeekday = topEntries(weekdayCounts, 1)[0] || null
    const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    /* Type + status */
    const typeParts = Object.keys(TYPE_LABELS).map((key, i) => ({
      label: TYPE_LABELS[key],
      value: sites.filter(s => String(s.site_type || '').toLowerCase() === key).length,
      color: CATEGORICAL[i],
    }))
    const statusRows = SITE_STATUS_ORDER
      .map(key => ({
        label: key.charAt(0).toUpperCase() + key.slice(1),
        value: sites.filter(s => String(s.site_status || '').toLowerCase() === key).length,
      }))
      .filter(r => r.value > 0)

    const postponed = sites.filter(s => String(s.site_status || '').toLowerCase() === 'postponed').length
    const cancelled = sites.filter(s => String(s.site_status || '').toLowerCase() === 'cancelled').length

    /* Locations + distance */
    const withCoords = sites.filter(s => distanceFromBase(s) !== null)
    const distances = withCoords
      .map(s => ({ site: s, km: distanceFromBase(s) }))
      .sort((a, b) => b.km - a.km)
    const totalDistance = distances.reduce((sum, d) => sum + d.km * 2, 0)
    const farthest = distances[0] || null
    const nearest = distances[distances.length - 1] || null

    const siteVisits = countBy(sites, s => String(s.site_name || '').trim())
    const areaVisits = countBy(sites, s => areaOf(s.location))
    const distinctLocations = new Set(
      sites.map(s => String(s.location || '').trim().toLowerCase()).filter(Boolean)
    ).size

    /* Clients */
    const clientSites = countBy(sites, s => String(s.client_company_name || '').trim())
    const clientDays = sumBy(sites, s => String(s.client_company_name || '').trim(), s => s.site_duration_days)
    const repeatClients = [...clientSites.values()].filter(v => v > 1).length
    const totalClients = clientSites.size

    // Same site name booked by more than one company
    const siteToClients = new Map()
    sites.forEach(s => {
      const name = String(s.site_name || '').trim()
      const company = String(s.client_company_name || '').trim()
      if (!name || !company) return
      if (!siteToClients.has(name)) siteToClients.set(name, new Set())
      siteToClients.get(name).add(company)
    })
    const sharedSites = [...siteToClients.entries()]
      .filter(([, companies]) => companies.size > 1)
      .map(([name, companies]) => ({ label: name, value: companies.size, note: [...companies].join(', ') }))
      .sort((a, b) => b.value - a.value)

    /* People */
    const memberStats = members.map(m => {
      const assignments = sites.filter(s => (s.site_assignments || []).some(a => a.member_id === m.id))
      const picCount = sites.filter(s => (s.site_assignments || [])
        .some(a => a.member_id === m.id && String(a.assignment_role || '').toLowerCase() === 'pic')).length
      // On a rotating crew a person only carries the days they were actually on
      const days = assignments.reduce((sum, s) => {
        if (!hasDailyCrew(s.site_assignments || [])) return sum + (Number(s.site_duration_days) || 0)
        const siteDays = getSiteDayCount(s) || 1
        const perDay = (Number(s.site_duration_days) || 0) / siteDays
        return sum + perDay * memberDaysOnSite(s, m.id)
      }, 0)
      const lastSite = assignments
        .map(s => toDate(s.scheduled_date))
        .filter(Boolean)
        .sort((a, b) => b - a)[0] || null
      return { id: m.id, name: m.full_name, sites: assignments.length, picCount, days, lastSite }
    })

    const busiestByDays = [...memberStats].sort((a, b) => b.days - a.days || b.sites - a.sites)
    const mostPic = [...memberStats].sort((a, b) => b.picCount - a.picCount)[0] || null

    // Who works together most
    const pairCounts = new Map()
    sites.forEach(s => {
      const ids = [...new Set((s.site_assignments || []).map(a => a.member_id).filter(Boolean))].sort()
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = `${ids[i]}|${ids[j]}`
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
        }
      }
    })
    const nameOf = id => members.find(m => m.id === id)?.full_name || 'Unknown'
    const topPair = topEntries(pairCounts, 1)[0] || null

    // Head count, not row count — a rotating crew writes one row per person per day
    const crewSize = s => siteMemberIds(s).length
    const soloSites = sites.filter(s => crewSize(s) === 1).length
    const biggestCrew = sites
      .map(s => ({ site: s, size: crewSize(s) }))
      .sort((a, b) => b.size - a.size)[0] || null

    /* Reports */
    const scanning = sites.filter(s => String(s.site_type || '').toLowerCase() === 'site_scanning')
    const reportRows = REPORT_STAGES.map(stage => ({
      ...stage,
      value: scanning.filter(s => String(s.report_status || '').toLowerCase() === stage.key).length,
    }))
    const openReports = scanning.filter(s => ['pending', 'in_progress'].includes(String(s.report_status || '').toLowerCase()))
    const oldestOpen = openReports
      .map(s => ({ site: s, age: daysBetween(siteEndDate(s), new Date()) }))
      .filter(r => Number.isFinite(r.age) && r.age > 0)
      .sort((a, b) => b.age - a.age)[0] || null
    const awaitingApproval = scanning.filter(s => String(s.report_status || '').toLowerCase() === 'submitted').length
    const approved = scanning.filter(s => String(s.report_status || '').toLowerCase() === 'approved')
    const withDO = sites.filter(s => String(s.notes || '').includes('DO:')).length

    /* Records */
    const longestJob = [...sites].sort((a, b) => (Number(b.site_duration_days) || 0) - (Number(a.site_duration_days) || 0))[0] || null

    return {
      totalSites: sites.length,
      realSites: real.length,
      totalFieldDays,
      sitesThisMonth,
      sitesThisYear,
      months,
      busiestMonth,
      busiestWeek,
      busiestWeekday: busiestWeekday ? { day: WEEKDAYS[busiestWeekday.label], count: busiestWeekday.value } : null,
      typeParts,
      statusRows,
      postponed,
      cancelled,
      distinctLocations,
      totalDistance,
      farthest,
      nearest,
      missingCoords: sites.length - withCoords.length,
      topSites: topEntries(siteVisits, 5).filter(r => r.value > 1),
      topAreas: topEntries(areaVisits, 5),
      topClientsBySites: topEntries(clientSites, 5),
      topClientsByDays: topEntries(clientDays, 5),
      totalClients,
      repeatClients,
      sharedSites: sharedSites.slice(0, 4),
      busiestByDays: busiestByDays.slice(0, 6),
      mostPic,
      topPair: topPair
        ? { names: topPair.label.split('|').map(nameOf).join(' + '), count: topPair.value }
        : null,
      soloSites,
      biggestCrew,
      reportRows,
      scanningCount: scanning.length,
      openReports: openReports.length,
      oldestOpen,
      awaitingApproval,
      approvedCount: approved.length,
      withDO,
      longestJob,
      docCount,
    }
  }, [sites, members, docCount])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: INK_MUTED, fontSize: '13px', fontWeight: '600' }}>
        Crunching numbers…
      </div>
    )
  }

  const cols = isMobile ? 1 : isTablet ? 2 : 3
  const grid = { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '16px' }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px', fontWeight: '800', color: INK, letterSpacing: '-.02em' }}>Statistics</h1>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: INK_FAINT, fontWeight: '600' }}>
          Everything the team has logged — {stats.totalSites} site{stats.totalSites === 1 ? '' : 's'} across {stats.distinctLocations} location{stats.distinctLocations === 1 ? '' : 's'}
        </p>
      </div>

      {/* Headline */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0, 1fr))`, gap: '16px' }}>
        <StatTile label="Total sites" value={formatNumber(stats.totalSites)}
          sub={`${stats.sitesThisMonth} this month · ${stats.sitesThisYear} this year`} accent={SEQ.step450} />
        <StatTile label="Field days" value={formatNumber(stats.totalFieldDays, 1)}
          sub="Total scheduled days on site" accent={SEQ.step550} />
        <StatTile label="Locations" value={formatNumber(stats.distinctLocations)}
          sub={`${stats.totalClients} client compan${stats.totalClients === 1 ? 'y' : 'ies'}`} accent={SEQ.step350} />
        <StatTile label="Distance travelled" value={formatNumber(stats.totalDistance)} unit="km"
          sub={`Return trips from ${BASE.label}, straight line`} accent={SEQ.step650} />
      </div>

      {/* Trend + splits */}
      <div style={grid}>
        <div style={{ gridColumn: cols >= 3 ? 'span 2' : 'span 1' }}>
          <Card title="Sites per month" subtitle="Last 12 months, by scheduled date">
            <MonthColumns data={stats.months} />
          </Card>
        </div>
        <Card title="Work mix" subtitle="Share of all bookings by type">
          <StackedShare parts={stats.typeParts} total={stats.totalSites} />
        </Card>
      </div>

      <div style={grid}>
        <Card title="Status breakdown" subtitle="Where every booking stands">
          <BarList rows={stats.statusRows} color={SEQ.step450} />
          {(stats.postponed > 0 || stats.cancelled > 0) && (
            <p style={{ margin: '14px 0 0', fontSize: '11px', color: INK_FAINT, fontWeight: '600' }}>
              {stats.totalSites > 0 && `${Math.round(((stats.postponed + stats.cancelled) / stats.totalSites) * 100)}% of bookings postponed or cancelled`}
            </p>
          )}
        </Card>

        <Card title="Most visited sites" subtitle="Same site booked more than once">
          <BarList rows={stats.topSites} unit=" visits" color={SEQ.step550} emptyText="No repeat sites yet" />
        </Card>

        <Card title="Busiest areas" subtitle="Grouped from the location field">
          <BarList rows={stats.topAreas} unit=" sites" color={SEQ.step350} />
        </Card>
      </div>

      {/* Clients */}
      <div style={grid}>
        <Card title="Top clients" subtitle="By number of sites">
          <BarList rows={stats.topClientsBySites} unit=" sites" color={SEQ.step450} emptyText="No client companies recorded" />
        </Card>

        <Card title="Biggest clients" subtitle="By total site days — weight, not count">
          <BarList rows={stats.topClientsByDays.map(r => ({ ...r, decimals: 1 }))} unit=" days" color={SEQ.step650} emptyText="No client companies recorded" />
        </Card>

        <Card title="Client loyalty">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <RecordRow label="Total clients" value={formatNumber(stats.totalClients)} />
            <RecordRow label="Repeat clients"
              value={`${stats.repeatClients}`}
              note={stats.totalClients > 0 ? `${Math.round((stats.repeatClients / stats.totalClients) * 100)}% booked more than once` : null} />
            <div>
              <p style={{ margin: '4px 0 8px', fontSize: '11px', fontWeight: '800', color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Same site, different clients
              </p>
              {stats.sharedSites.length === 0 ? (
                <p style={{ margin: 0, fontSize: '12px', color: INK_FAINT, fontWeight: '600' }}>None yet — every site belongs to one company</p>
              ) : stats.sharedSites.map(s => (
                <div key={s.label} style={{ marginBottom: '8px' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: '800', color: INK }}>{s.label} <span style={{ color: INK_MUTED, fontWeight: '700' }}>· {s.value} clients</span></p>
                  <p style={{ margin: '1px 0 0', fontSize: '11px', color: INK_FAINT, fontWeight: '600' }}>{s.note}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* People + reports */}
      <div style={grid}>
        <Card title="Busiest team members" subtitle="Total site days assigned, all time">
          <BarList
            rows={stats.busiestByDays.map(m => ({ label: m.name, value: m.days, decimals: 1, note: `${m.sites} sites` }))}
            unit=" days" color={SEQ.step450} emptyText="No assignments yet" />
        </Card>

        <Card title="Team records">
          <RecordRow label="Leads most jobs"
            value={stats.mostPic?.name || '-'}
            note={stats.mostPic ? `PIC on ${stats.mostPic.picCount} site${stats.mostPic.picCount === 1 ? '' : 's'}` : null} />
          <RecordRow label="Most frequent pairing"
            value={stats.topPair?.names || '-'}
            note={stats.topPair ? `${stats.topPair.count} sites together` : null} />
          <RecordRow label="Solo jobs" value={formatNumber(stats.soloSites)} note="One person covered the site alone" />
          <RecordRow label="Biggest crew"
            value={stats.biggestCrew?.size ? `${stats.biggestCrew.size} people` : '-'}
            note={stats.biggestCrew?.site ? getSiteTitle(stats.biggestCrew.site) : null} />
        </Card>

        <Card title="Report pipeline" subtitle={`${stats.scanningCount} scanning site${stats.scanningCount === 1 ? '' : 's'} produce reports`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats.reportRows.map(stage => (
              <div key={stage.key}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: INK }}>{stage.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: INK_MUTED }}>{stage.value}</span>
                </div>
                <div style={{ height: '10px', background: SEQ.track, borderRadius: '5px', overflow: 'hidden' }}>
                  <div title={`${stage.label}: ${stage.value}`}
                    style={{ width: `${stats.scanningCount > 0 ? Math.max(2, (stage.value / stats.scanningCount) * 100) : 2}%`, height: '100%', background: stage.color, borderRadius: '5px' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${GRID}` }}>
            <RecordRow label="Awaiting approval" value={formatNumber(stats.awaitingApproval)} note="Sitting with the approver" />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', padding: '10px 0' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: INK_MUTED }}>Oldest open report</span>
              <span style={{ textAlign: 'right', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: stats.oldestOpen?.age > 14 ? STATUS.critical : INK }}>
                  {stats.oldestOpen ? `${stats.oldestOpen.age} days` : 'None open'}
                </span>
                {stats.oldestOpen && (
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: INK_FAINT, marginTop: '1px' }}>
                    {getSiteTitle(stats.oldestOpen.site)}
                  </span>
                )}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Distance + records */}
      <div style={grid}>
        <Card title="Distance records" subtitle={`Straight line from ${BASE.label}`}>
          <RecordRow label="Farthest site"
            value={stats.farthest ? `${formatNumber(stats.farthest.km)} km` : '-'}
            note={stats.farthest ? getSiteTitle(stats.farthest.site) : null} />
          <RecordRow label="Nearest site"
            value={stats.nearest ? `${formatNumber(stats.nearest.km, 1)} km` : '-'}
            note={stats.nearest ? getSiteTitle(stats.nearest.site) : null} />
          <RecordRow label="Total travelled" value={`${formatNumber(stats.totalDistance)} km`} note="Return trips, all sites with coordinates" />
          {stats.missingCoords > 0 && (
            <p style={{ margin: '12px 0 0', fontSize: '11px', fontWeight: '700', color: STATUS.serious }}>
              {stats.missingCoords} site{stats.missingCoords === 1 ? '' : 's'} missing coordinates — not counted
            </p>
          )}
        </Card>

        <Card title="Records">
          <RecordRow label="Busiest month"
            value={stats.busiestMonth ? monthLabel(stats.busiestMonth.label) : '-'}
            note={stats.busiestMonth ? `${stats.busiestMonth.value} sites` : null} />
          <RecordRow label="Busiest week"
            value={stats.busiestWeek ? `${stats.busiestWeek.value} sites` : '-'}
            note={stats.busiestWeek ? `Week of ${stats.busiestWeek.label}` : null} />
          <RecordRow label="Most common day"
            value={stats.busiestWeekday?.day || '-'}
            note={stats.busiestWeekday ? `${stats.busiestWeekday.count} sites start here` : null} />
          <RecordRow label="Longest single job"
            value={stats.longestJob ? `${formatNumber(Number(stats.longestJob.site_duration_days) || 0, 1)} days` : '-'}
            note={stats.longestJob ? getSiteTitle(stats.longestJob) : null} />
        </Card>

        <Card title="Library & totals">
          <RecordRow label="Documents in library" value={formatNumber(stats.docCount)} />
          <RecordRow label="Reports approved" value={formatNumber(stats.approvedCount)} />
          <RecordRow label="Open reports" value={formatNumber(stats.openReports)} note="Pending or in progress" />
          <RecordRow label="Sites with a DO number" value={formatNumber(stats.withDO)} note="Recorded on completion" />
        </Card>
      </div>

      <p style={{ margin: '4px 0 0', fontSize: '11px', color: INK_FAINT, fontWeight: '600', lineHeight: 1.6 }}>
        Distances are straight-line from {BASE.label} ({BASE.latitude}, {BASE.longitude}), not driving distance.
        Report ages are measured from each site&apos;s end date, since status changes are not timestamped.
      </p>
    </div>
  )
}
