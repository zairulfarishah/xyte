import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid3x3, Plus } from 'lucide-react'
import { supabase } from '../../supabase'
import { TABLE, SELECT, who, when } from './store'

// The layouts linked to a site, for the site's page.
export default function SiteLayouts({ siteId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from(TABLE).select(SELECT).eq('site_id', siteId).order('updated_at', { ascending: false })
      .then(({ data, error }) => { if (error) setError(error.message); else setRows(data) })
  }, [siteId])

  if (error) {
    return <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
      {/site_id|layout_plans/.test(error) ? 'Layouts can be linked to sites once sql/setup-layouts.sql has been run in Supabase.' : `Couldn't load layouts: ${error}`}
    </p>
  }
  if (!rows) return <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Loading…</p>
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {!rows.length && <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>No layouts linked to this site yet. In Layout, use "Link to site" next to the layout name.</p>}
      {rows.map(r => (
        <button key={r.id} onClick={() => navigate(`/layout?open=${r.id}`)}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#f8fafc', cursor: 'pointer' }}>
          <Grid3x3 size={18} color="#2563eb" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: '14px', color: '#0f172a' }}>{r.name}</b><br />
            <span style={{ fontSize: '12px', color: '#64748b' }}>{r.levels} level{r.levels === 1 ? '' : 's'} · {Number(r.area_m2 || 0).toFixed(1)} m² · saved {when(r.updated_at)} by {who(r.updater)}</span>
          </span>
        </button>
      ))}
      <button onClick={() => navigate('/layout')}
        style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer' }}>
        <Plus size={14} /> Go to Layout
      </button>
    </div>
  )
}
