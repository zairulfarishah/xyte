import { AlertTriangle, IdCardLanyard, LayoutGrid, Search, X } from 'lucide-react'
import { EmptyState, FilterBar, Page, PageHeader, Pagination, Tabs } from '../../components/ui'
import { REPORT_TABS, matchesTab } from './reportUtils'
import ReportCard from './ReportCard'
import BadgeWall from './BadgeWall'
import '../Sites.css'
import './Reports.css'

// Reports page layout (dark header + status tabs, search, card grid, pages).
// Data and saving stay in Reports.jsx; this only draws.

export default function ReportsBoard({
  sites, today, tab, onTab, search, onSearch, page, onPage, perPage, view = 'wall', onView,
  isZairul, updating, onStatus, onOpen, error, onDismissError,
}) {
  const q = search.trim().toLowerCase()
  const filtered = sites
    .filter(s => matchesTab(s, tab, today))
    .filter(s => !q || [s.site_name, s.location, s.client_company_name].some(v => v?.toLowerCase().includes(q)))
  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const cur = Math.min(page, pages)
  const shown = filtered.slice((cur - 1) * perPage, cur * perPage)

  const count = key => sites.filter(s => matchesTab(s, key, today)).length
  const overdue = count('overdue')
  const tabs = REPORT_TABS.filter(t => t.key !== 'overdue' || overdue > 0).map(t => ({ ...t, count: count(t.key) }))

  return (
    <Page className="ss ss-navy rp">
      <section className="ss-hero">
        <PageHeader
          title="Reports"
          subtitle={<>
            <b>{count('pending') + count('in_progress')}</b> to write · <b>{count('submitted')}</b> awaiting approval
            {overdue > 0 && <> · <button className={`ss-attn${tab === 'overdue' ? ' on' : ''}`} onClick={() => onTab(tab === 'overdue' ? 'all' : 'overdue')}>
              <AlertTriangle size={12} /> {overdue} overdue
            </button></>}
          </>}
        />
        <Tabs tabs={tabs} active={tab} onChange={onTab} />
      </section>

      <div className="x-card ss-board">
        <FilterBar>
          <label className="x-inp ss-search">
            <Search />
            <input placeholder="Search sites, places, clients…" value={search} onChange={e => onSearch(e.target.value)} />
            {search && <button className="x-clear" title="Clear search" onClick={() => onSearch('')}><X size={14} /></button>}
          </label>
          <div className="ss-cmp" role="group" aria-label="View">
            <span className="ss-cmp-l">View</span>
            <button className={`ss-tool${view === 'wall' ? ' on' : ''}`} onClick={() => onView?.('wall')} aria-pressed={view === 'wall'}><IdCardLanyard size={14} /> Badge wall</button>
            <button className={`ss-tool${view === 'grid' ? ' on' : ''}`} onClick={() => onView?.('grid')} aria-pressed={view === 'grid'}><LayoutGrid size={14} /> Grid</button>
          </div>
        </FilterBar>

        {error && (
          <div className="rp-err" role="alert">
            <span>Couldn't update the report: {error}</span>
            <button onClick={onDismissError} aria-label="Dismiss"><X size={14} /></button>
          </div>
        )}

        {filtered.length > 0 && view === 'wall' ? (
          <div className="rp-wall">
            <BadgeWall key={`${tab}|${q}`} sites={filtered} today={today} isZairul={isZairul} updating={updating} onStatus={onStatus} onOpen={onOpen} />
          </div>
        ) : shown.length === 0 ? (
          <div className="ss-grid" style={{ display: 'block' }}>
            <EmptyState title={q ? 'No reports match your search' : 'Nothing here'}>
              {q ? 'Try a different name or place.' : 'No reports with this status right now.'}
            </EmptyState>
          </div>
        ) : (
          <div className="ss-grid">
            {shown.map(site => (
              <ReportCard key={site.id} site={site} today={today} isZairul={isZairul}
                updating={updating === site.id} onStatus={onStatus} onOpen={onOpen} />
            ))}
          </div>
        )}

        {view === 'grid' && <Pagination page={cur} pages={pages} total={filtered.length} noun="reports"
          from={(cur - 1) * perPage + 1} to={Math.min(cur * perPage, filtered.length)} onChange={onPage} />}
      </div>
    </Page>
  )
}
