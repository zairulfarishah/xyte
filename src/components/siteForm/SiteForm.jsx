import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, MapPin, X } from 'lucide-react'
import PlaceSearchBox from '../PlaceSearchBox'
import LocationPicker from '../LazyLocationPicker'
import PhotoPicker from './PhotoPicker'
import { getLeaveSummary, getMemberLeaveOnDate } from '../../utils/teamLeaves'
import { buildJobIndex } from '../../utils/memberDay'
import { isActiveMember } from '../../utils/members'
import {
  REPORT_STATUSES, SALESPERSONS, SESSIONS, SITE_STATUSES, SITE_TYPES,
  datesInRange, saveSite, siteDuration,
} from './siteFormModel'
import './SiteForm.css'

// Add / edit site — "live preview" layout: the site card on the left updates as you type,
// the form on the right is one page with jump buttons per section.

const SECTIONS = [['loc', 'Location'], ['det', 'Details'], ['when', 'Schedule'], ['team', 'Team'], ['more', 'Status & notes']]
const fmt = (s, o = { day: 'numeric', month: 'short' }) => s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', o) : ''
const firstName = m => m?.short_name || m?.full_name?.split(' ')[0] || '?'
const initials = m => (m?.full_name || '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
const shortPlace = s => { const p = String(s || '').split(',').map(x => x.trim()).filter(Boolean); return p.slice(0, 2).join(', ') }

export default function SiteForm({ title, initial, editSite = null, members, leaves, sites = [], fullName, memberId, onClose, onSaved }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [picker, setPicker] = useState(false)
  const [moreOpen, setMoreOpen] = useState(!!editSite)
  const initialJson = useRef(JSON.stringify(initial))
  const bodyRef = useRef(null)
  const set = patch => setForm(f => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) }))

  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const days = datesInRange(form.scheduled_date, form.end_date)
  const multiDay = days.length > 1
  const sameDay = form.scheduled_date && form.end_date && form.scheduled_date === form.end_date
  const perDay = form.assign_mode === 'per_day' && multiDay
  const isMeeting = form.site_type === 'meeting'
  const picWord = isMeeting ? 'Organizer' : 'PIC'

  // Who is already on another site on these days (this site left out when editing)
  const jobIndex = useMemo(() => buildJobIndex(sites.filter(s => s.id !== editSite?.id)), [sites, editSite])
  const busyNote = (id, dates) => {
    for (const d of dates) {
      const jobs = jobIndex.get(`${id}|${d}`)
      if (jobs?.length) return `On ${jobs[0].site.site_name} ${fmt(d)}`
    }
    return ''
  }
  const leaveNote = (id, dates) => {
    for (const d of dates) { const l = getMemberLeaveOnDate(leaves, id, d); if (l) return { d, l } }
    return null
  }

  const companies = useMemo(() => [...new Set(sites.map(s => (s.client_company_name || '').trim()).filter(Boolean))].sort(), [sites])
  const lastForCompany = useMemo(() => {
    const c = form.client_company_name.trim().toLowerCase()
    if (!c) return null
    return sites
      .filter(s => s.id !== editSite?.id && (s.client_company_name || '').trim().toLowerCase() === c && (s.client_name || s.client_number))
      .sort((a, b) => String(b.scheduled_date || '').localeCompare(String(a.scheduled_date || '')))[0] || null
  }, [sites, form.client_company_name, editSite])
  const contactDiffers = lastForCompany && (lastForCompany.client_name || '') !== form.client_name

  function close() {
    if (saving) return
    if (JSON.stringify(form) !== initialJson.current && !confirm('Discard your unsaved changes?')) return
    onClose()
  }
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !picker) close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function save() {
    setError('')
    setSaving(true)
    try {
      const saved = await saveSite({ form, editSite, members, leaves, fullName, memberId })
      onSaved(saved)
    } catch (err) {
      setError(err.message || 'Unable to save.')
      setSaving(false)
    }
  }

  function jump(id) {
    if (id === 'more') setMoreOpen(true)
    requestAnimationFrame(() => bodyRef.current?.querySelector(`#sf-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // Tap a person: add as crew → make PIC → remove
  function cycle(id) {
    set(f => {
      if (f.pic_id === id) return { pic_id: '', crew_ids: f.crew_ids.filter(x => x !== id) }
      if (f.crew_ids.includes(id)) return { pic_id: id, crew_ids: [...f.crew_ids.filter(x => x !== id), ...(f.pic_id ? [f.pic_id] : [])] }
      return { crew_ids: [...f.crew_ids, id] }
    })
  }
  function cycleDay(d, id) {
    set(f => {
      const cur = f.daily_assignments[d] || { pic_id: '', crew_ids: [] }
      let next
      if (cur.pic_id === id) next = { pic_id: '', crew_ids: cur.crew_ids.filter(x => x !== id) }
      else if (cur.crew_ids.includes(id)) next = { pic_id: id, crew_ids: [...cur.crew_ids.filter(x => x !== id), ...(cur.pic_id ? [cur.pic_id] : [])] }
      else next = { ...cur, crew_ids: [...cur.crew_ids, id] }
      return { daily_assignments: { ...f.daily_assignments, [d]: next } }
    })
  }
  function copyDayToAll(d) {
    const src = form.daily_assignments[d] || { pic_id: '', crew_ids: [] }
    set(f => ({ daily_assignments: Object.fromEntries(days.map(x => [x, { pic_id: src.pic_id, crew_ids: [...src.crew_ids] }]).concat(Object.entries(f.daily_assignments).filter(([x]) => !days.includes(x)))) }))
  }
  function switchMode(mode) {
    if (mode === form.assign_mode) return
    // Carry the current team over so nobody has to re-tick
    if (mode === 'per_day') set(f => ({ assign_mode: 'per_day', daily_assignments: Object.fromEntries(days.map(d => [d, f.daily_assignments[d] || { pic_id: f.pic_id, crew_ids: f.crew_ids.filter(x => x !== f.pic_id) }])) }))
    else set({ assign_mode: 'same' })
  }

  const pickable = (selected) => members.filter(m => isActiveMember(m) || selected.includes(m.id))

  function personRow({ m, role, onTap, dates }) {
    const leave = leaveNote(m.id, dates.slice(0, 1))
    const laterLeave = !leave && leaveNote(m.id, dates.slice(1))
    const busy = busyNote(m.id, dates)
    const blocked = Boolean(leave) && !role
    const note = leave ? getLeaveSummary(leave.l) : laterLeave ? `On leave ${fmt(laterLeave.d)}` : busy || 'Available'
    const tone = leave || laterLeave ? 'leave' : busy ? 'busy' : 'free'
    return (
      <button type="button" key={m.id} className={`sf-person${role ? ` ${role}` : ''}${blocked ? ' dis' : ''}`} disabled={blocked} onClick={onTap}>
        <span className="sf-av">{m.avatar_url ? <img src={m.avatar_url} alt="" /> : initials(m)}</span>
        <span className="nm"><b>{m.full_name}</b><small className={`t-${tone}`}>{note}</small></span>
        <span className="role">{role === 'pic' ? picWord : role === 'crew' ? (isMeeting ? 'Attending' : 'Crew') : 'Add'}</span>
      </button>
    )
  }

  // ── preview card bits ──
  const teamIds = perDay
    ? [...new Set(days.flatMap(d => { const x = form.daily_assignments[d]; return x ? [x.pic_id, ...x.crew_ids] : [] }).filter(Boolean))]
    : [form.pic_id, ...form.crew_ids].filter(Boolean)
  const picIds = perDay ? days.map(d => form.daily_assignments[d]?.pic_id).filter(Boolean) : [form.pic_id].filter(Boolean)
  const typeLabel = SITE_TYPES.find(t => t.value === form.site_type)?.label
  const dateLabel = !form.scheduled_date ? 'Pick dates' : sameDay || !form.end_date ? `${fmt(form.scheduled_date, { weekday: 'short', day: 'numeric', month: 'short' })}${form.site_session ? ` · ${form.site_session}` : ''}` : `${fmt(form.scheduled_date)} – ${fmt(form.end_date)} · ${days.length} days`
  const missing = [!form.location && 'location', !form.site_name && 'site name', !form.scheduled_date && 'start date'].filter(Boolean)

  return (
    <div className="sf-modal" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className="sf-shell" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sf-head">
          <h2>{title}</h2>
          <button type="button" className="sf-circ" onClick={close} aria-label="Close"><X size={16} /></button>
        </header>

        <div className="sf-body" ref={bodyRef}>
          {/* ── live preview ── */}
          <aside className="sf-prev">
            <div className="sf-lbl">Preview</div>
            <div className="sf-card">
              <button type="button" className="sf-card-img" onClick={() => setPicker(true)} title="Change photo">
                {form.site_photo_preview
                  ? <img src={form.site_photo_preview} alt="" />
                  : <span className="sf-card-noimg"><ImagePlus size={20} /><span>Add a cover photo</span></span>}
              </button>
              <div className="sf-card-bd">
                <b>{form.site_name || 'Site name'}</b>
                <span className="sf-card-loc"><MapPin size={12} />{shortPlace(form.location) || 'Location'}</span>
                <div className="sf-chips">
                  <span>{typeLabel}</span>
                  <span>{dateLabel}</span>
                  {form.client_company_name && <span>{form.client_company_name}</span>}
                </div>
                <div className="sf-card-team">
                  {teamIds.length
                    ? teamIds.map(id => memberById[id]).filter(Boolean).map((m, i) => <span key={m.id}>{i ? ', ' : ''}{picIds.includes(m.id) ? <b>{firstName(m)}</b> : firstName(m)}</span>)
                    : <span className="muted">No team yet</span>}
                </div>
              </div>
            </div>
            {missing.length > 0 && <p className="sf-need">Still needed: {missing.join(', ')}</p>}
          </aside>

          {/* ── form ── */}
          <div className="sf-form">
            <nav className="sf-nav">
              {SECTIONS.map(([id, t]) => <button type="button" key={id} className="sf-pill" onClick={() => jump(id)}>{t}</button>)}
            </nav>

            <section id="sf-loc" className="sf-sec">
              <h3><i>1</i>Location & photo</h3>
              <label className="sf-lbl">Location *</label>
              <PlaceSearchBox
                value={form.location}
                onChange={v => set({ location: v, latitude: '', longitude: '' })}
                onSelect={r => set(f => ({ location: r.label, latitude: r.latitude, longitude: r.longitude, site_name: f.site_name || r.name || '' }))}
                placeholder="Search building, road or area…"
              />
              <label className="sf-lbl">Pin <span className="muted">· click the map to place it exactly</span></label>
              <LocationPicker lat={form.latitude} lng={form.longitude} height={190}
                onPick={(lat, lng) => set({ latitude: lat, longitude: lng })}
                mapKey={`${form.latitude}-${form.longitude}`} />
              {form.latitude !== '' && (
                <p className="sf-hint">{Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)} · <button type="button" className="sf-link" onClick={() => set({ latitude: '', longitude: '' })}>clear pin</button></p>
              )}
              <label className="sf-lbl">Cover photo</label>
              <div className="sf-photo-row">
                <button type="button" className={`sf-slot${form.site_photo_preview ? ' has' : ''}`} onClick={() => setPicker(true)}>
                  {form.site_photo_preview && <img src={form.site_photo_preview} alt="" />}
                  <span className="sf-slot-cta"><ImagePlus size={15} />{form.site_photo_preview ? 'Change photo' : 'Search or add a photo'}</span>
                </button>
                {form.site_photo_preview && <button type="button" className="sf-link" onClick={() => set({ site_photo: null, site_photo_preview: null, site_photo_url: '' })}>Remove</button>}
              </div>
            </section>

            <section id="sf-det" className="sf-sec">
              <h3><i>2</i>Details</h3>
              <label className="sf-lbl">Type</label>
              <div className="sf-types">
                {SITE_TYPES.map(t => (
                  <button type="button" key={t.value} className={`sf-type${form.site_type === t.value ? ' on' : ''}`}
                    onClick={() => set(f => ({ site_type: t.value, site_duration_days: t.value === 'site_visit' ? '0.5' : f.site_duration_days }))}>
                    <b>{t.label}</b><small>{t.hint}</small>
                  </button>
                ))}
              </div>
              <label className="sf-lbl">Site name *</label>
              <input className="sf-in" value={form.site_name} placeholder="Fills in from the location" onChange={e => set({ site_name: e.target.value })} />
              <div className="sf-row2">
                <div>
                  <label className="sf-lbl">Client company</label>
                  <input className="sf-in" list="sf-companies" value={form.client_company_name} placeholder="Start typing…" onChange={e => set({ client_company_name: e.target.value })} />
                  <datalist id="sf-companies">{companies.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="sf-lbl">Contact name</label>
                  <input className="sf-in" value={form.client_name} placeholder="Contact name" onChange={e => set({ client_name: e.target.value })} />
                </div>
                <div>
                  <label className="sf-lbl">Contact phone</label>
                  <input className="sf-in" value={form.client_number} placeholder="e.g. +60123456789" onChange={e => set({ client_number: e.target.value })} />
                </div>
                <div>
                  <label className="sf-lbl">Salesperson</label>
                  <select className="sf-in" value={form.salesperson} onChange={e => set({ salesperson: e.target.value })}>
                    <option value="">— Select —</option>
                    {SALESPERSONS.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              </div>
              {contactDiffers && (
                <button type="button" className="sf-suggest" onClick={() => set({ client_name: lastForCompany.client_name || '', client_number: lastForCompany.client_number || '', salesperson: form.salesperson || lastForCompany.salesperson || '' })}>
                  Use contact from the last {form.client_company_name} job: <b>{[lastForCompany.client_name, lastForCompany.client_number].filter(Boolean).join(' · ')}</b>
                </button>
              )}
              <label className="sf-lbl">Scope of work</label>
              <textarea className="sf-in" rows={3} value={form.scope_of_work} placeholder="What are we doing there?" onChange={e => set({ scope_of_work: e.target.value })} />
            </section>

            <section id="sf-when" className="sf-sec">
              <h3><i>3</i>Schedule</h3>
              <div className="sf-row2">
                <div>
                  <label className="sf-lbl">Start *</label>
                  <input type="date" className="sf-in" value={form.scheduled_date} onChange={e => { const v = e.target.value; set(f => ({ scheduled_date: v, end_date: !f.end_date || f.end_date < v ? v : f.end_date })) }} />
                </div>
                <div>
                  <label className="sf-lbl">End</label>
                  <input type="date" className="sf-in" value={form.end_date} min={form.scheduled_date} onChange={e => set({ end_date: e.target.value })} />
                </div>
              </div>
              {sameDay && (
                <>
                  <label className="sf-lbl">Session</label>
                  <div className="sf-pills">
                    {SESSIONS.map(s => <button type="button" key={s} className={`sf-pill${form.site_session === s ? ' on' : ''}`} onClick={() => set({ site_session: form.site_session === s ? '' : s })}>{s}</button>)}
                  </div>
                </>
              )}
              {form.site_type === 'site_scanning' && (
                <div className="sf-row2">
                  <div><label className="sf-lbl">Site time</label><div className="sf-in sf-ro">{form.scheduled_date ? `${siteDuration(form)} day${siteDuration(form) === 1 ? '' : 's'}` : '—'}</div></div>
                  <div><label className="sf-lbl">Report time (days)</label><input type="number" min="0" step="0.5" className="sf-in" value={form.report_duration_days} onChange={e => set({ report_duration_days: e.target.value })} /></div>
                </div>
              )}
              {form.site_type === 'site_visit' && <p className="sf-hint">Site visits count as half a day.</p>}
              {isMeeting && (
                <>
                  <label className="sf-lbl">Meeting length</label>
                  <div className="sf-pills">
                    {[['0.25', '2 hours'], ['0.5', 'Half day'], ['1', 'Full day']].map(([v, t]) => <button type="button" key={v} className={`sf-pill${form.site_duration_days === v ? ' on' : ''}`} onClick={() => set({ site_duration_days: v })}>{t}</button>)}
                  </div>
                </>
              )}
            </section>

            <section id="sf-team" className="sf-sec">
              <h3><i>4</i>Team</h3>
              {multiDay && (
                <div className="sf-pills" style={{ marginTop: 10 }}>
                  <button type="button" className={`sf-pill${!perDay ? ' on' : ''}`} onClick={() => switchMode('same')}>Same team every day</button>
                  <button type="button" className={`sf-pill${perDay ? ' on' : ''}`} onClick={() => switchMode('per_day')}>Different team per day</button>
                </div>
              )}
              <p className="sf-hint">Tap once to add, again to make {picWord}, again to remove.{form.scheduled_date ? '' : ' Pick dates first to see who is free.'}</p>
              {!perDay ? (
                <div className="sf-people">
                  {pickable([form.pic_id, ...form.crew_ids]).map(m => (
                    personRow({ m, dates: days.length ? days : [form.scheduled_date].filter(Boolean),
                      role: form.pic_id === m.id ? 'pic' : form.crew_ids.includes(m.id) ? 'crew' : '',
                      onTap: () => cycle(m.id) })
                  ))}
                </div>
              ) : (
                <div className="sf-days">
                  {days.map((d, i) => {
                    const day = form.daily_assignments[d] || { pic_id: '', crew_ids: [] }
                    return (
                      <div key={d} className="sf-day">
                        <div className="sf-day-h"><b>Day {i + 1} · {fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                          {i === 0 && <button type="button" className="sf-link" onClick={() => copyDayToAll(d)}>Copy to all days</button>}</div>
                        <div className="sf-people">
                          {pickable([day.pic_id, ...day.crew_ids]).map(m => (
                            personRow({ m, dates: [d],
                              role: day.pic_id === m.id ? 'pic' : day.crew_ids.includes(m.id) ? 'crew' : '',
                              onTap: () => cycleDay(d, m.id) })
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section id="sf-more" className="sf-sec">
              <button type="button" className="sf-more" onClick={() => setMoreOpen(o => !o)}>
                <h3><i>5</i>Status & notes</h3><span>{moreOpen ? '−' : '+'}</span>
              </button>
              {moreOpen && (
                <>
                  <label className="sf-lbl">Site status</label>
                  <div className="sf-pills">
                    {SITE_STATUSES.map(s => <button type="button" key={s} className={`sf-pill${form.site_status === s ? ' on' : ''}`} onClick={() => set({ site_status: s })}>{s[0].toUpperCase() + s.slice(1)}</button>)}
                  </div>
                  {form.site_type === 'site_scanning' && (
                    <>
                      <label className="sf-lbl">Report status</label>
                      <div className="sf-pills">
                        {REPORT_STATUSES.map(s => <button type="button" key={s} className={`sf-pill${form.report_status === s ? ' on' : ''}`} onClick={() => set({ report_status: s })}>{s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</button>)}
                      </div>
                    </>
                  )}
                  <div className="sf-row2">
                    <div><label className="sf-lbl">Delivery order number</label><input className="sf-in" value={form.delivery_order_number} placeholder="DO-12345" onChange={e => set({ delivery_order_number: e.target.value })} /></div>
                    <div><label className="sf-lbl">Reason if no DO</label><input className="sf-in" value={form.completion_reason} placeholder="Why there is no DO" onChange={e => set({ completion_reason: e.target.value })} /></div>
                  </div>
                  <label className="sf-lbl">Notes</label>
                  <textarea className="sf-in" rows={3} value={form.notes} placeholder="Optional notes…" onChange={e => set({ notes: e.target.value })} />
                </>
              )}
            </section>
          </div>
        </div>

        <footer className="sf-foot">
          {error && <p className="sf-err">{error}</p>}
          <div className="sf-foot-btns">
            <button type="button" className="sf-btn ghost" onClick={close} disabled={saving}>Cancel</button>
            <button type="button" className="sf-btn" onClick={save} disabled={saving || missing.length > 0} title={missing.length ? `Still needed: ${missing.join(', ')}` : ''}>
              {saving ? 'Saving…' : editSite ? 'Save changes' : 'Add site'}
            </button>
          </div>
        </footer>
      </div>

      {picker && (
        <PhotoPicker form={form} sites={sites}
          onClose={() => setPicker(false)}
          onPick={p => { set(p.url ? { site_photo: null, site_photo_preview: p.url, site_photo_url: p.url } : { site_photo: p.file, site_photo_preview: p.preview }); setPicker(false) }} />
      )}
    </div>
  )
}
