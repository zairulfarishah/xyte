import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

// Link to Scan Marker (sql/setup-scan-marker.sql). A level linked to a scan project uses
// that project's drawing page as its underlay; scan points are stored in PDF points from
// the page's top-left, so they sit on the underlay wherever it is moved or scaled.
// level.scan = { id, name, page (0-based), show }

export const SCAN_STATUS = {
  marked: { label: 'Marked', color: '#e8590c', aci: 30 },
  clear: { label: 'Clear to drill', color: '#2b8a3e', aci: 3 },
  shift: { label: 'Shifted', color: '#1971c2', aci: 5 },
  nogo: { label: 'No-go', color: '#c92a2a', aci: 1 },
}

const COLS = 'id, project_id, label, page, x, y, status, note, d, updated_at'

// Where a scan point sits on the plan (mm), given the level's underlay.
export const scanToPlan = (p, bg) => (bg?.ptScale
  ? { x: bg.x + p.x * bg.ptScale * bg.mmPerPx, y: bg.y + p.y * bg.ptScale * bg.mmPerPx }
  : null)

export async function fetchScanPoints(projectId) {
  const { data, error } = await supabase.from('scan_points').select(COLS).eq('project_id', projectId)
  if (error) throw error
  return data
}

// All points of a scan project, kept live as the team marks and records them.
export function useScanPoints(projectId) {
  const [state, setState] = useState({ id: null, points: [], error: '' })
  useEffect(() => {
    if (!projectId) return
    let alive = true
    fetchScanPoints(projectId)
      .then(points => alive && setState({ id: projectId, points, error: '' }))
      .catch(err => alive && setState({ id: projectId, points: [], error: err.message }))
    const put = r => setState(s => (s.id === projectId ? { ...s, points: [...s.points.filter(p => p.id !== r.id), r] } : s))
    const ch = supabase.channel(`layout-scan-${projectId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scan_points', filter: `project_id=eq.${projectId}` }, ({ new: r }) => put(r))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scan_points', filter: `project_id=eq.${projectId}` }, ({ new: r }) => put(r))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'scan_points' },
        ({ old: r }) => r?.id && setState(s => ({ ...s, points: s.points.filter(p => p.id !== r.id) })))
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [projectId])
  return projectId && state.id === projectId ? state : { id: projectId, points: [], error: '' }
}

// One-line summary of what was recorded at a point, like Scan Marker's own list.
export function scanSummary(d = {}) {
  const a = []
  if (d.topCover || d.topSp) a.push(`Top ${d.topCover || '?'} cover${d.topSp ? ` @${d.topSp}` : ''}`)
  if (d.botCover || d.botSp) a.push(`Bottom ${d.botCover || '?'} cover${d.botSp ? ` @${d.botSp}` : ''}`)
  if (d.thk) a.push(`${d.thk} thk`)
  if (d.pt === 'yes') a.push(`PT cable${d.ptDepth ? ` @${d.ptDepth}` : ''}`)
  if (d.conduit === 'yes') a.push(`Conduit${d.conduitDepth ? ` @${d.conduitDepth}` : ''}`)
  return a.join(' · ')
}

// Opens the project in the Scan Marker page.
export function openInScanMarker(projectId, navigate) {
  try { localStorage.setItem('xyte.scanproject', JSON.stringify(projectId)) } catch { /* storage unavailable */ }
  navigate('/scan-points')
}
