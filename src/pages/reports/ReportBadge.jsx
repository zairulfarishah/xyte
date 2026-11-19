import { memo, useState } from 'react'
import { ArrowUpRight, Calendar, FileWarning, Truck, Users } from 'lucide-react'
import { REPORT_STATUS, SITE_STATUS, statusInfo } from '../../components/ui/status'
import { getSiteHeaderImage } from '../../utils/siteHeader'
import { doApplies, parseCompletionMeta } from '../../utils/completionMeta'
import { isPic, uniqueAssignments } from '../../utils/siteDays'
import { TYPE_LABEL, dayDiff, formatRange, reportDueDate, reportOverdueDays, siteEnd, siteStart } from '../../utils/siteCard'
import { REPORT_FLOW } from './reportUtils'

// A report as a hanging ID badge. Front: site photo, name, client, status, barcode.
// Back (flipped): dates, team, due date, DO, progress and the status picker.

// Decorative barcode from the DO number (or the site id) — same site, same bars
function barcode(seed) {
  let h = 2166136261
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const bars = []
  for (let i = 0; i < 46; i++) { h = Math.imul(h ^ (h >>> 13), 2654435761); bars.push(1 + ((h >>> 0) % 3)) }
  return bars
}
// The bars as one painted gradient (one element instead of 46)
function barsBackground(bars) {
  const stops = []
  let x = 0
  bars.forEach((w, i) => {
    stops.push(`#e5e7eb ${x}px ${x + w}px`)
    x += w
    const gap = i % 3 ? 1 : 2
    if (i < bars.length - 1) { stops.push(`transparent ${x}px ${x + gap}px`); x += gap }
  })
  return { width: x, background: `linear-gradient(90deg, ${stops.join(', ')})` }
}
const digitsOf = (seed, n = 10) => {
  const d = String(seed).replace(/\D/g, '')
  return (d + '0000000000').slice(0, n)
}

function dueLine(site, today) {
  const overdue = reportOverdueDays(site, today)
  if (overdue > 0) return { text: `Overdue by ${overdue} day${overdue === 1 ? '' : 's'}`, late: true }
  if (site.report_status === 'not_applicable') return { text: 'No report needed' }
  if (site.report_status === 'approved') return { text: 'Approved — all done' }
  if (site.report_status === 'submitted') return { text: 'Waiting for approval' }
  if (site.site_status !== 'completed') return { text: site.site_status === 'ongoing' ? 'Job still on site' : 'Job not done yet' }
  const due = reportDueDate(site)
  if (!due) return { text: 'Report to write' }
  const left = dayDiff(today, due)
  return { text: left <= 0 ? 'Due today' : left === 1 ? 'Due tomorrow' : `Due in ${left} days` }
}

function ReportBadge({ site, today, flipped, isZairul, updating, onStatus, onOpen }) {
  // The back is only built once the badge has been turned over (most never are)
  const [seenBack, setSeenBack] = useState(flipped)
  if (flipped && !seenBack) setSeenBack(true)
  const roster = uniqueAssignments(site.site_assignments || [])
  const pic = roster.find(isPic)
  const crew = roster.filter(a => !isPic(a))
  const doNo = doApplies(site.site_type) ? parseCompletionMeta(site.notes || '').deliveryOrderNumber : ''
  const status = statusInfo(REPORT_STATUS, site.report_status)
  const overdue = reportOverdueDays(site, today)
  const due = dueLine(site, today)
  const step = site.report_status === 'approved' ? 4 : Math.max(0, REPORT_FLOW.indexOf(site.report_status))
  const seed = doNo || site.id
  const bars = barcode(seed)
  const stop = e => e.stopPropagation()

  return (
    <div className={`rb-flip${seenBack ? ' d3' : ''}${flipped ? ' on' : ''}`}>
      {/* ── front ── */}
      <div className="rb-face rb-front" aria-hidden={flipped}>
        <div className="rb-band"><i className="rb-slot" /></div>
        {overdue > 0 && <span className="rb-stamp">Overdue</span>}
        <div className="rb-photo"><img src={site.site_photo_url || getSiteHeaderImage(site.site_type)} alt="" loading="lazy" decoding="async" draggable="false" /></div>
        <b className="rb-name">{site.site_name}</b>
        <span className="rb-sub">{site.client_company_name || TYPE_LABEL[site.site_type] || 'Site'}</span>
        <span className="rb-caps">Report · {status.label}</span>
        <div className="rb-code">
          <div className="rb-bars" aria-hidden="true" style={barsBackground(bars)} />
          <span>{doNo ? doNo : digitsOf(seed)}</span>
        </div>
      </div>

      {/* ── back ── */}
      {seenBack && <div className="rb-face rb-back" aria-hidden={!flipped}>
        <div className="rb-band thin"><i className="rb-slot" /></div>
        <b className="rb-bname">{site.site_name}</b>
        <span className="rb-bsub">{TYPE_LABEL[site.site_type] || 'Site'} · site {statusInfo(SITE_STATUS, site.site_status).label.toLowerCase()}</span>

        <ul className="rb-facts">
          <li><Calendar /><span>{formatRange(siteStart(site), siteEnd(site))}</span></li>
          <li><Users /><span>{pic ? pic.team_members?.full_name?.split(' ').slice(0, 2).join(' ') : 'No PIC'}{crew.length ? ` +${crew.length} crew` : ''}</span></li>
          <li className={due.late ? 'late' : ''}><FileWarning /><span>{due.text}</span></li>
          {doApplies(site.site_type) && <li><Truck /><span>{doNo ? `DO ${doNo}` : 'No DO yet'}</span></li>}
        </ul>

        {site.report_status !== 'not_applicable' && (
          <div className="rb-steps" aria-label={`Report step ${Math.min(step + 1, 4)} of 4`}>
            {['Pending', 'In progress', 'Submitted', 'Approved'].map((l, i) => <i key={l} title={l} className={i < step ? 'done' : i === step ? 'cur' : ''} />)}
          </div>
        )}

        <div className="rb-actions" onClick={stop} onKeyDown={stop}>
          <label className="rb-sel">
            <select value={site.report_status} disabled={updating} tabIndex={flipped ? 0 : -1}
              aria-label={`Report status for ${site.site_name}`} onChange={e => onStatus?.(site.id, e.target.value)}>
              {[...REPORT_FLOW, 'not_applicable'].map(s => (
                <option key={s} value={s} disabled={s === 'approved' && !isZairul}>
                  {REPORT_STATUS[s].label}{s === 'approved' && !isZairul ? ' (Zairul only)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="rb-open" tabIndex={flipped ? 0 : -1} onClick={() => onOpen?.(site)}>
            Open site <ArrowUpRight />
          </button>
        </div>
      </div>}
    </div>
  )
}

export default memo(ReportBadge)
