import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { cachedPage, rememberPage } from '../utils/pageCache'
import { notify } from '../utils/notify'
import { useAuth } from '../context/AuthContext'
import { todayStr } from '../utils/siteCard'
import ReportsBoard from './reports/ReportsBoard'

// Reports: every site's report as a badge on the wall (or a card in the grid).
// This file loads the data and saves status changes; reports/ReportsBoard draws it.

const PER_PAGE = 12
const VIEW_KEY = 'xyte.reports.view'
const savedView = () => { try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'wall' } catch { return 'wall' } }

export default function Reports() {
  const { isZairul, fullName } = useAuth()
  const navigate = useNavigate()
  const [sites, setSites]     = useState(() => cachedPage('reports')?.sites || [])
  const [loading, setLoading] = useState(() => !cachedPage('reports'))
  const [tab, setTab]         = useState('all')
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [view, setView]       = useState(savedView)
  const [updating, setUpdating]       = useState(null)
  const [updateError, setUpdateError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('sites')
      .select(`*, site_assignments(assignment_role, work_date, member_id, team_members(id, full_name, avatar_url))`)
      .eq('is_hidden', false)
      .order('scheduled_date', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setSites(data || [])
        setLoading(false)
        rememberPage('reports', { sites: data || [] })
      })
    return () => { cancelled = true }
  }, [])

  async function updateReportStatus(siteId, newStatus) {
    if (newStatus === 'approved' && !isZairul) return
    const site = sites.find(s => s.id === siteId)
    const before = site?.report_status
    setUpdating(siteId)
    setSites(list => list.map(s => s.id === siteId ? { ...s, report_status: newStatus } : s))
    const { error } = await supabase.from('sites').update({ report_status: newStatus }).eq('id', siteId)
    setUpdating(null)
    if (error) {
      setSites(list => list.map(s => s.id === siteId ? { ...s, report_status: before } : s))
      setUpdateError(error.message)
      return
    }
    setUpdateError(null)
    if (before !== newStatus) {
      if (newStatus === 'submitted') notify(`Report for "${site?.site_name}" has been submitted — ready for review`, fullName, null, 'general')
      if (newStatus === 'approved')  notify(`Report for "${site?.site_name}" has been approved`, fullName, null, 'general')
    }
  }

  function changeView(v) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* private window — just not remembered */ }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', gap:'10px', color:'#64748b', fontSize:'14px' }}>
      <div style={{ width:'16px', height:'16px', borderRadius:'50%', border:'2px solid #e2e8f0', borderTopColor:'#2563eb', animation:'spin 0.7s linear infinite' }} />
      Loading reports…
    </div>
  )

  return (
    <ReportsBoard
      sites={sites} today={todayStr()}
      tab={tab} onTab={t => { setTab(t); setPage(1) }}
      search={search} onSearch={v => { setSearch(v); setPage(1) }}
      page={page} onPage={setPage} perPage={PER_PAGE}
      view={view} onView={changeView}
      isZairul={isZairul} updating={updating} onStatus={updateReportStatus}
      onOpen={site => navigate(`/sites/${site.id}`)}
      error={updateError} onDismissError={() => setUpdateError(null)}
    />
  )
}
