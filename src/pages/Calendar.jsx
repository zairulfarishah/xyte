import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TYPE_COLORS = {
  site_scanning: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd', dot: '#2563eb', label: 'Site Scanning' },
  site_visit:    { bg: '#f0fdf4', text: '#166534', border: '#86efac', dot: '#16a34a', label: 'Site Visit'    },
  meeting:       { bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd', dot: '#7c3aed', label: 'Meeting'       },
}

const STATUS_DOT = {
  upcoming:  '#f59e0b',
  ongoing:   '#2563eb',
  completed: '#16a34a',
  cancelled: '#ef4444',
  postponed: '#94a3b8',
}

function Avatar({ name, size = 18 }) {
  const initials = (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const colors   = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#0891b2', '#d97706']
  const color    = colors[(name?.charCodeAt(0) || 0) % colors.length]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, fontWeight: '700', color: 'white', flexShrink: 0, border: '1.5px solid white' }}>
      {initials}
    </div>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const today    = useMemo(() => new Date(), [])
  const [current, setCurrent]   = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [sites, setSites]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [dayModal, setDayModal] = useState(null) // { day, ds, sites }

  const year  = current.getFullYear()
  const month = current.getMonth()

  useEffect(() => {
    setExpanded(null)
    fetchSites()
  }, [year, month])

  async function fetchSites() {
    setLoading(true)
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const last = new Date(year, month + 1, 0).getDate()
    const to   = `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    const { data } = await supabase
      .from('sites')
      .select(`id, site_name, site_type, site_status, scheduled_date,
        site_assignments(assignment_role, team_members(id, short_name, full_name, avatar_url))`)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date')
    setSites(data || [])
    setLoading(false)
  }

  const days = useMemo(() => {
    const firstDow  = new Date(year, month, 1).getDay()         // 0=Sun
    const offset    = firstDow === 0 ? 6 : firstDow - 1         // Mon-based offset
    const lastDay   = new Date(year, month + 1, 0).getDate()
    const arr       = Array(offset).fill(null)
    for (let d = 1; d <= lastDay; d++) arr.push(d)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [year, month])

  const sitesByDate = useMemo(() => {
    const map = {}
    sites.forEach(s => {
      if (!map[s.scheduled_date]) map[s.scheduled_date] = []
      map[s.scheduled_date].push(s)
    })
    return map
  }, [sites])

  function ds(day) {
    return day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
  }

  function isToday(day) {
    return day && today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
  }

  const monthLabel = current.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })

  const SHOW = 2 // max chips before "+X more"

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 100px,#c8d4e3 100px 100%)' }}>

      {/* ── Header ── */}
      <div style={{ padding: '24px 40px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Calendar</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>
            {sites.length} site{sites.length !== 1 ? 's' : ''} this month
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => setCurrent(new Date(year, month - 1, 1))} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', cursor: 'pointer', display: 'flex' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ color: 'white', fontWeight: '700', fontSize: '15px', minWidth: '170px', textAlign: 'center' }}>{monthLabel}</span>
          <button onClick={() => setCurrent(new Date(year, month + 1, 1))} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', cursor: 'pointer', display: 'flex' }}>
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))}
            style={{ padding: '7px 14px', borderRadius: '8px', background: '#2563eb', border: 'none', color: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer', marginLeft: '4px' }}
          >
            Today
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      <div style={{ padding: '20px 40px 48px' }}>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>
          ))}
        </div>

        {/* Cells */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', gap: '10px', color: '#64748b', fontSize: '14px' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />
            Loading…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {days.map((day, idx) => {
              const dateStr  = ds(day)
              const daySites = dateStr ? (sitesByDate[dateStr] || []) : []
              const isExp    = expanded === dateStr
              const visible  = isExp ? daySites : daySites.slice(0, SHOW)
              const overflow = daySites.length - SHOW
              const todayCell = isToday(day)

              return (
                <div
                  key={idx}
                  style={{
                    minHeight: '116px',
                    background:    day ? (todayCell ? '#dbeafe' : '#f8fafc') : 'transparent',
                    borderRadius:  day ? '10px' : '0',
                    border:        day ? (todayCell ? '2px solid #2563eb' : '1px solid #cbd5e1') : 'none',
                    padding:       day ? '8px' : '0',
                    display:       'flex',
                    flexDirection: 'column',
                    gap:           '3px',
                  }}
                >
                  {day && (
                    <>
                      {/* Date number */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <div style={{
                          width: '22px', height: '22px', borderRadius: '50%',
                          background: todayCell ? '#2563eb' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: todayCell ? '800' : '600',
                          color: todayCell ? 'white' : '#0f172a',
                          flexShrink: 0,
                        }}>
                          {day}
                        </div>
                        {daySites.length > 0 && (
                          <button
                            onClick={() => setDayModal({ day, dateStr, sites: daySites })}
                            style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer' }}
                          >
                            {daySites.length}
                          </button>
                        )}
                      </div>

                      {/* Site chips */}
                      {visible.map(site => {
                        const tc   = TYPE_COLORS[site.site_type] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' }
                        const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
                        const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []
                        const picName = pic?.team_members?.short_name || pic?.team_members?.full_name?.split(' ')[0]

                        return (
                          <div
                            key={site.id}
                            onClick={() => navigate(`/sites/${site.id}`)}
                            style={{ background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                          >
                            {/* Site name */}
                            <p style={{ fontSize: '10px', fontWeight: '700', color: tc.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                              {site.site_name}
                            </p>

                            {/* PIC + crew avatars */}
                            {(pic || crew.length > 0) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '4px' }}>
                                {/* PIC */}
                                {pic && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                                    <Avatar name={picName} size={14} />
                                    <span style={{ fontSize: '9px', fontWeight: '600', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '48px' }}>{picName}</span>
                                  </div>
                                )}
                                {/* Crew avatars stacked */}
                                {crew.length > 0 && (
                                  <div style={{ display: 'flex', marginLeft: '2px' }}>
                                    {crew.slice(0, 3).map((a, i) => (
                                      <div key={a.team_members?.id || i} style={{ marginLeft: i === 0 ? 0 : '-5px', zIndex: 3 - i }}>
                                        <Avatar name={a.team_members?.short_name || a.team_members?.full_name?.split(' ')[0]} size={14} />
                                      </div>
                                    ))}
                                    {crew.length > 3 && (
                                      <div style={{ marginLeft: '-5px', width: '14px', height: '14px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: '700', color: '#64748b', border: '1.5px solid white' }}>
                                        +{crew.length - 3}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* +X more / show less */}
                      {!isExp && overflow > 0 && (
                        <button onClick={() => setExpanded(dateStr)} style={{ fontSize: '10px', fontWeight: '600', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '1px 2px' }}>
                          +{overflow} more
                        </button>
                      )}
                      {isExp && daySites.length > SHOW && (
                        <button onClick={() => setExpanded(null)} style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '1px 2px' }}>
                          show less
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '16px', justifyContent: 'flex-end' }}>
          {Object.values(TYPE_COLORS).map(tc => (
            <div key={tc.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: tc.bg, border: `1px solid ${tc.border}` }} />
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>{tc.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Day modal (tap the count badge) ── */}
      {dayModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '24px' }}
          onClick={e => e.target === e.currentTarget && setDayModal(null)}
        >
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,.2)' }}>
            {/* Modal header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>
                  {new Date(dayModal.dateStr + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>{dayModal.sites.length} site{dayModal.sites.length !== 1 ? 's' : ''} scheduled</p>
              </div>
              <button onClick={() => setDayModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Site list */}
            <div style={{ overflowY: 'auto', padding: '12px 0' }}>
              {dayModal.sites.map(site => {
                const tc   = TYPE_COLORS[site.site_type] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0', label: site.site_type }
                const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
                const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew') || []

                return (
                  <div
                    key={site.id}
                    onClick={() => { navigate(`/sites/${site.id}`); setDayModal(null) }}
                    style={{ padding: '12px 22px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Site name + type */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_DOT[site.site_status] || '#94a3b8', flexShrink: 0 }} />
                      <p style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a', flex: 1 }}>{site.site_name}</p>
                      <span style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`, padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap' }}>{tc.label}</span>
                    </div>

                    {/* PIC */}
                    {pic && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: crew.length > 0 ? '6px' : 0 }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '28px' }}>PIC</span>
                        <Avatar name={pic.team_members?.short_name || pic.team_members?.full_name?.split(' ')[0]} size={20} />
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>{pic.team_members?.full_name}</span>
                      </div>
                    )}

                    {/* Crew */}
                    {crew.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '28px' }}>Crew</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          {crew.map((a, i) => (
                            <div key={a.team_members?.id || i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Avatar name={a.team_members?.short_name || a.team_members?.full_name?.split(' ')[0]} size={20} />
                              <span style={{ fontSize: '12px', color: '#64748b' }}>{a.team_members?.full_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
