import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { ChevronLeft, ChevronRight, Pencil, MapPin, Upload, X, Users, FileText, LayoutGrid, Grid3x3 } from 'lucide-react'
import SiteLayouts from './layout/SiteLayouts'
import { getSiteHeaderImage } from '../utils/siteHeader'
import { parseCompletionMeta } from '../utils/completionMeta'
import { SiteFeedPosts } from '../components/FeedWidgets'
import { shrinkPhoto } from '../utils/photo'
import {
  crewForDate, formatDayLabel, getSiteDates, hasDailyCrew, isPic,
  memberDatesOnSite, picForDate, uniqueAssignments,
} from '../utils/siteDays'
import { Avatar, Button, Card, EmptyState, LoadingState, Page, PageHeader, StatusBadge, Tabs } from '../components/ui'
import { REPORT_STATUS, SITE_STATUS } from '../components/ui/status'
import './SiteDetail.css'

const TYPE_LABELS = {
  site_scanning: 'Site Scanning',
  site_visit:    'Site Visit',
  meeting:       'Meeting',
}

export default function SiteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [site, setSite]           = useState(null)
  const [allIds, setAllIds]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('overview')
  const [photos, setPhotos]       = useState([])
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes]         = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: siteData }, { data: allSites }] = await Promise.all([
      supabase
        .from('sites')
        .select('*, site_assignments(assignment_role, work_date, member_id, team_members(id, full_name, role, avatar_url))')
        .eq('id', id)
        .single(),
      supabase
        .from('sites')
        .select('id')
        .eq('is_hidden', false)
        .order('scheduled_date', { ascending: true }),
    ])
    setSite(siteData)
    setNotes(siteData?.notes || '')
    setAllIds(allSites?.map(s => s.id) || [])
    await fetchPhotos()
    setLoading(false)
  }

  async function fetchPhotos() {
    const { data, error } = await supabase.storage
      .from('site-photos')
      .list(`${id}/`, { sortBy: { column: 'created_at', order: 'desc' } })
    if (!error && data) {
      const urls = data
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => ({
          name: f.name,
          url: supabase.storage.from('site-photos').getPublicUrl(`${id}/${f.name}`).data.publicUrl,
        }))
      setPhotos(urls)
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    for (const original of files) {
      const file = await shrinkPhoto(original)
      const ext  = file.name.split('.').pop()
      const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      await supabase.storage.from('site-photos').upload(path, file)
    }
    await fetchPhotos()
    setUploading(false)
    e.target.value = ''
  }

  async function handleDeletePhoto(name) {
    await supabase.storage.from('site-photos').remove([`${id}/${name}`])
    setPhotos(p => p.filter(ph => ph.name !== name))
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    await supabase.from('sites').update({ notes }).eq('id', id)
    setSavingNotes(false)
    setSite(s => ({ ...s, notes }))
  }

  const currentIndex = allIds.indexOf(id)
  const prevId = currentIndex > 0 ? allIds[currentIndex - 1] : null
  const nextId = currentIndex < allIds.length - 1 ? allIds[currentIndex + 1] : null

  if (loading) return (
    <Page className="sd">
      <PageHeader crumbs={[{ label: 'Sites', to: '/sites' }]} title="Loading site…" />
      <Card><LoadingState rows={6} /></Card>
    </Page>
  )

  if (!site) return (
    <Page className="sd">
      <PageHeader crumbs={[{ label: 'Sites', to: '/sites' }]} title="Site not found" />
      <Card><EmptyState icon={MapPin} title="This site doesn't exist" actions={<Button to="/sites">Back to sites</Button>}>It may have been deleted, or the link is wrong.</EmptyState></Card>
    </Page>
  )

  // Everyone who works the site, listed once — the crew may rotate day by day
  const assignments = site.site_assignments || []
  const roster = uniqueAssignments(assignments)
  const pic  = roster.find(isPic)
  const crew = roster.filter(a => !isPic(a))
  const perDayCrew = hasDailyCrew(assignments)
  const siteDates = getSiteDates(site)
  const completionMeta = parseCompletionMeta(site.notes || '')
  const dateLong = site.scheduled_date ? new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'
  const dateShort = site.scheduled_date ? new Date(site.scheduled_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'
  const showReport = site.site_type === 'site_scanning' || site.site_type === 'site_visit'

  return (
    <Page className="sd">
      <PageHeader
        crumbs={[{ label: 'Sites', to: '/sites' }, { label: site.site_name }]}
        title={<span className="sd-title">{site.site_name}<StatusBadge map={SITE_STATUS} value={site.site_status} /></span>}
        subtitle={site.location && <span className="sd-loc"><MapPin size={13} /> {site.location}</span>}
        actions={<>
          <Button iconOnly icon={ChevronLeft} onClick={() => prevId && navigate(`/sites/${prevId}`)} disabled={!prevId} aria-label="Previous site" title="Previous site" />
          <Button iconOnly icon={ChevronRight} onClick={() => nextId && navigate(`/sites/${nextId}`)} disabled={!nextId} aria-label="Next site" title="Next site" />
          <Button variant="primary" icon={Pencil} to="/sites">Edit</Button>
        </>}
      />

      <div className="sd-cols">
        {/* Left */}
        <div className="sd-main">
          <div className="sd-cover">
            <img src={site.site_photo_url || getSiteHeaderImage(site.site_type)} alt="" />
            <div className="sd-cover-facts">
              <span><b>{TYPE_LABELS[site.site_type] || 'Site Scanning'}</b></span>
              <span>{dateShort}</span>
              {site.client_company_name && <span>{site.client_company_name}</span>}
            </div>
          </div>

          {/* Photo gallery */}
          <Card title="Site photos" action={
            <>
              <Button size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload photos'}</Button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
            </>
          }>
            {photos.length === 0 ? (
              <button type="button" className="sd-drop" onClick={() => fileInputRef.current?.click()}>
                <EmptyState icon={Upload} title="No photos yet">Click to upload site photos.</EmptyState>
              </button>
            ) : (
              <div className="sd-photos">
                {photos.map(photo => (
                  <div key={photo.name} className="sd-ph">
                    <img src={photo.url} alt="" loading="lazy" decoding="async" />
                    <button onClick={() => handleDeletePhoto(photo.name)} aria-label="Delete photo" title="Delete photo"><X size={12} /></button>
                  </div>
                ))}
                <button type="button" className="sd-ph add" onClick={() => fileInputRef.current?.click()} aria-label="Upload more photos"><Upload size={18} /></button>
              </div>
            )}
          </Card>

          {/* Tabs */}
          <Card>
            <Tabs className="sd-tabs" active={tab} onChange={setTab} tabs={[
              { key: 'overview', label: 'Overview', icon: LayoutGrid },
              { key: 'team',     label: 'Team',     icon: Users, count: roster.length || undefined },
              { key: 'notes',    label: 'Notes',    icon: FileText },
              { key: 'layouts',  label: 'Layouts',  icon: Grid3x3 },
            ]} />

            <div className="sd-tab">
              {tab === 'overview' && (
                <dl className="sd-facts">
                  {[
                    { label: 'Site type',       value: TYPE_LABELS[site.site_type] || 'Site Scanning' },
                    { label: 'Scheduled date',  value: dateLong },
                    { label: 'Site duration',   value: `${site.site_duration_days} day(s)` },
                    { label: 'Report duration', value: site.report_duration_days > 0 ? `${site.report_duration_days} day(s)` : 'N/A' },
                    { label: 'Client company',  value: site.client_company_name || 'Not set' },
                    { label: 'Location',        value: site.location },
                    { label: 'Coordinates',     value: site.latitude && site.longitude ? `${Number(site.latitude).toFixed(4)}, ${Number(site.longitude).toFixed(4)}` : 'Not set' },
                    { label: 'Delivery order',  value: completionMeta.deliveryOrderNumber || 'N/A' },
                  ].map(({ label, value }) => (
                    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              )}

              {tab === 'team' && (
                <div className="sd-team">
                  {!pic && crew.length === 0 && (
                    <EmptyState icon={Users} title="No team yet">No one is assigned to this site.</EmptyState>
                  )}

                  {/* Day-by-day rota */}
                  {perDayCrew && (
                    <div className="sd-rota">
                      <div className="sd-rota-h">Crew schedule · {siteDates.length} days</div>
                      {siteDates.map((date, index) => {
                        const dayPic = picForDate(assignments, date)
                        const names = [
                          ...(dayPic ? [`${dayPic.team_members?.full_name} (PIC)`] : []),
                          ...crewForDate(assignments, date).map(c => c.team_members?.full_name).filter(Boolean),
                        ]
                        return (
                          <div key={date} className="sd-rota-r">
                            <span className="d">Day {index + 1}</span>
                            <span className="w">{formatDayLabel(date)}</span>
                            <span className={names.length ? 'n' : 'n none'}>{names.length ? names.join(', ') : 'Nobody assigned'}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {pic && (
                    <div className="sd-person pic">
                      <Avatar member={pic.team_members} size={44} />
                      <div><b>{pic.team_members?.full_name}</b><small>{pic.team_members?.role}{perDayCrew && ` · ${memberDatesOnSite(site, pic.member_id).length} day(s)`}</small></div>
                      <StatusBadge tone="orange" dot={false}>PIC</StatusBadge>
                    </div>
                  )}
                  {crew.map(c => (
                    <div key={c.member_id} className="sd-person">
                      <Avatar member={c.team_members} size={44} />
                      <div><b>{c.team_members?.full_name}</b><small>{c.team_members?.role}{perDayCrew && ` · ${memberDatesOnSite(site, c.member_id).length} day(s)`}</small></div>
                      <StatusBadge tone="neutral" dot={false}>Crew</StatusBadge>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'layouts' && <SiteLayouts siteId={id} />}

              {tab === 'notes' && (
                <div>
                  <textarea className="x-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes about this site…"
                    style={{ minHeight: '180px', resize: 'vertical', lineHeight: 1.6 }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <Button variant="primary" onClick={handleSaveNotes} disabled={savingNotes}>{savingNotes ? 'Saving…' : 'Save notes'}</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right */}
        <aside className="sd-side">
          <Card title="Site info" padded>
            <dl className="sd-info">
              <div><dt>Scheduled date</dt><dd>{dateShort}</dd></div>
              <div><dt>Site duration</dt><dd>{site.site_duration_days} day(s)</dd></div>
              <div><dt>Site type</dt><dd>{TYPE_LABELS[site.site_type] || 'Site Scanning'}</dd></div>
              <div><dt>Delivery order</dt><dd>{completionMeta.deliveryOrderNumber || 'N/A'}</dd></div>
              <div><dt>Report status</dt><dd><StatusBadge map={REPORT_STATUS} value={site.report_status} /></dd></div>
              <div><dt>Reason if no DO</dt><dd className={completionMeta.completionReason ? '' : 'na'}>{completionMeta.completionReason || 'N/A'}</dd></div>
            </dl>
          </Card>

          <SiteFeedPosts siteId={site.id} />

          <Card title="Site history" padded>
            <ol className="sd-hist">
              {[
                { label: 'Site status',  value: <StatusBadge map={SITE_STATUS} value={site.site_status} />, time: dateShort },
                ...(showReport && site.site_type === 'site_scanning' ? [{ label: 'Report status', value: <StatusBadge map={REPORT_STATUS} value={site.report_status} /> }] : []),
                { label: 'PIC assigned', value: pic?.team_members?.full_name || 'None' },
                { label: 'Crew',         value: crew.length > 0 ? `${crew.length} member(s)` : 'None' },
              ].map((item, i) => (
                <li key={i}>
                  <b>{item.label}</b>
                  <span>{item.value}</span>
                  {item.time && <small>{item.time}</small>}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </Page>
  )
}
