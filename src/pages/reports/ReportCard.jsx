import { Calendar, Check, FileWarning, MapPin } from 'lucide-react'
import { StatusBadge } from '../../components/ui'
import { REPORT_STATUS, SITE_STATUS, statusInfo } from '../../components/ui/status'
import MemberAvatar from '../../components/MemberAvatar'
import { getSiteHeaderImage } from '../../utils/siteHeader'
import { getSiteTitle } from '../../utils/siteTitle'
import { doApplies, parseCompletionMeta } from '../../utils/completionMeta'
import { isPic, uniqueAssignments } from '../../utils/siteDays'
import {
  TYPE_LABEL, dayDiff, formatRange, reportDueDate, reportOverdueDays, shortLocation, siteEnd, siteStart,
} from '../../utils/siteCard'
import { REPORT_FLOW } from './reportUtils'

// One site's report, in the Sites "navy" card style:
// photo, name, the report's progress (Pending → In progress → Submitted → Approved),
// team, and the report status picker.

const STEP_LABELS = ['Pending', 'In progress', 'Submitted', 'Approved']

// Chip on the photo: how urgent the report is
function dueChip(site, today) {
  const overdue = reportOverdueDays(site, today)
  if (overdue > 0) return { text: `Overdue ${overdue}d`, tone: 'late' }
  if (site.report_status === 'submitted') return { text: 'Awaiting approval', tone: 'soon' }
  if (site.report_status === 'approved' || site.report_status === 'not_applicable') return null
  if (site.site_status !== 'completed') return { text: site.site_status === 'ongoing' ? 'On site now' : 'Job not done yet', tone: 'later' }
  const due = reportDueDate(site)
  if (!due) return null
  const left = dayDiff(today, due)
  return { text: left === 0 ? 'Due today' : left === 1 ? 'Due tomorrow' : `Due in ${left} days`, tone: left <= 1 ? 'now' : 'soon' }
}

export default function ReportCard({ site, today, isZairul, updating, onStatus, onOpen }) {
  const roster = uniqueAssignments(site.site_assignments || [])
  const pic = roster.find(isPic)
  const crew = roster.filter(a => !isPic(a))
  const team = [pic, ...crew].filter(a => a?.team_members)
  const picShort = pic?.team_members?.full_name?.split(' ').slice(0, 2).join(' ')
  const noReport = site.report_status === 'not_applicable'
  const overdue = reportOverdueDays(site, today)
  const cur = site.report_status === 'approved' ? 4 : Math.max(0, REPORT_FLOW.indexOf(site.report_status))
  const chip = dueChip(site, today)
  const doNo = doApplies(site.site_type) ? parseCompletionMeta(site.notes || '').deliveryOrderNumber : null
  const siteTone = statusInfo(SITE_STATUS, site.site_status).tone
  const stop = e => e.stopPropagation()

  return (
    <div className={`ss-card rp-card${noReport ? ' rp-na' : ''}`} role="link" tabIndex={0} aria-label={`Open ${getSiteTitle(site)}`}
      onClick={e => { if (!e.target.closest('select, button, a')) onOpen?.(site) }}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen?.(site) }}
      style={{ '--sc2': overdue > 0 ? 'var(--x-danger)' : 'var(--x-orange)' }}>

      <div className={`ss-bg${site.site_photo_url ? '' : ' nophoto'}`}><img src={site.site_photo_url || getSiteHeaderImage(site.site_type)} alt="" loading="lazy" /></div>
      <div className="ss-top">
        <StatusBadge map={REPORT_STATUS} value={site.report_status} />
        {chip && <span className={`ss-when ${chip.tone}`}>{chip.text}</span>}
      </div>

      <div className="ss-body">
        <div className="ss-head">
          <div className="ss-eb">{TYPE_LABEL[site.site_type] || 'Site Scanning'}</div>
          <h3 className="ss-name" title={getSiteTitle(site)}>{site.site_name}</h3>
          <p className="ss-sub" title={site.location || ''}>
            {site.location && <><MapPin size={12} /><span>{shortLocation(site.location)}</span></>}
            {site.location && site.client_company_name && <i>·</i>}
            {site.client_company_name && <span>{site.client_company_name}</span>}
          </p>
          <div className="ss-meta"><Calendar size={12} /><span>{formatRange(siteStart(site), siteEnd(site))}</span></div>
        </div>

        <div className="ss-glass">
          {/* ── Report progress ── */}
          <div className={`ss-track${noReport ? ' halt' : ''}`}>
            {noReport ? (
              <p className="rp-none">No report needed for this {site.site_type === 'meeting' ? 'meeting' : site.site_type === 'site_visit' ? 'site visit' : 'job'}</p>
            ) : (
              <div className="ss-steps">
                {STEP_LABELS.map((label, i) => (
                  <div key={label} className={`ss-step${i < cur ? ' done' : i === cur ? ' cur' : ''}`}>
                    <i>{i < cur && <Check size={10} strokeWidth={3.2} />}</i>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="ss-cap">
              {overdue > 0
                ? <span className="rp-late"><FileWarning size={13} /> Report overdue · {overdue}d</span>
                : <span><i className="dot" style={{ background: `var(--x-${siteTone})` }} />Site {statusInfo(SITE_STATUS, site.site_status).label?.toLowerCase()}</span>}
              {doApplies(site.site_type) && <span className={`do${doNo ? '' : ' na'}`}>{doNo ? `DO ${doNo}` : 'No DO yet'}</span>}
            </div>
          </div>

          {/* ── Team + status picker ── */}
          <div className="ss-foot">
            <div className="ss-team" title={pic ? `PIC: ${pic.team_members?.full_name}${crew.length ? ` · Crew: ${crew.map(c => c.team_members?.full_name).join(', ')}` : ''}` : 'No PIC assigned'}>
              {team.length > 0 ? (<>
                <div className="ss-stack">
                  {team.slice(0, 3).map((a, i) => <MemberAvatar key={a.team_members.id || i} member={a.team_members} className={a === pic ? 'pic' : ''} />)}
                  {team.length > 3 && <span className="more">+{team.length - 3}</span>}
                </div>
                <b className={pic ? '' : 'na'}>{pic ? picShort : 'No PIC'}</b>
              </>) : <b className="na">No team yet</b>}
            </div>
            <label className={`rp-sel t-${statusInfo(REPORT_STATUS, site.report_status).tone}`} onClick={stop} title="Update report status">
              <select value={site.report_status} disabled={updating} aria-label={`Report status for ${site.site_name}`}
                onChange={e => onStatus?.(site.id, e.target.value)}>
                {[...REPORT_FLOW, 'not_applicable'].map(s => (
                  <option key={s} value={s} disabled={s === 'approved' && !isZairul}>
                    {REPORT_STATUS[s].label}{s === 'approved' && !isZairul ? ' (Zairul only)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
