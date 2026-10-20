import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCheck, Images, TrendingUp, AlertTriangle, MapPinned, Camera, X, Plus, Trash2, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PageTabs from '../components/PageTabs'
import { useTabParam } from '../utils/useTabParam'
import { toast } from '../utils/toast'
import {
  ITEM_KEYS, PILLARS, addZone, average, deleteAudit, deleteZone, fetchAudits, fetchZones, fivesUrl, fmtDate, fmtPct, lastMonths, monthName,
  passPct, presetAnswers, removePhotos, saveAudit, todayStr, updateZone, tone, uploadZonePhoto, zoneStatus, zoneType, ZONE_TYPES,
} from '../utils/fiveS'
import './BreakRoom.css' // shared mk-* cards, buttons, inputs and modal
import './FiveS.css'

const TABS = [
  { key: 'audit', label: 'Audit', Icon: ClipboardCheck },
  { key: 'progress', label: 'Progress', Icon: Images },
  { key: 'trend', label: 'Trend', Icon: TrendingUp },
  { key: 'escalation', label: 'Escalation', Icon: AlertTriangle },
  { key: 'zones', label: 'Zones', Icon: MapPinned },
]

export default function FiveS() {
  const { isZairul } = useAuth()
  const [tab, setTab] = useTabParam(TABS.map(t => t.key), 'audit')
  const [zones, setZones] = useState([])
  const [audits, setAudits] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState(null)

  const load = useCallback(async () => {
    const since = new Date(); since.setMonth(since.getMonth() - 13)
    try {
      const [zoneList, list] = await Promise.all([fetchZones(), fetchAudits(since.toISOString().slice(0, 10))])
      setZones(zoneList)
      setAudits(list)
      setSetupError(null)
    } catch (e) {
      setSetupError(e.message)
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const activeZones = zones.filter(z => z.active)
  // zone id → its audits, newest first
  const auditsByZone = useMemo(() => {
    const map = new Map()
    for (const a of audits) (map.get(a.zone_id) || map.set(a.zone_id, []).get(a.zone_id)).push(a)
    return map
  }, [audits])
  // Only the admin audits (the page is admin-only too)
  const canAudit = isZairul

  const ctx = { zones, activeZones, audits, auditsByZone, canAudit, isZairul, reload: load }

  return (
    <div className="mk fs">
      <PageTabs title="5S" hint="Weekly zone walks: Sort · Set in Order · Shine · Standardize · Sustain" tabs={TABS} active={tab} onChange={setTab} />
      <div className="mk-body">
        {setupError && <SetupNotice message={setupError} />}
        {loading ? <div className="mk-card mk-empty">Loading…</div> : !setupError && (
          <>
            {tab === 'audit' && <AuditBoard {...ctx} />}
            {tab === 'progress' && <Progress {...ctx} />}
            {tab === 'trend' && <Trend {...ctx} />}
            {tab === 'escalation' && <Escalation {...ctx} />}
            {tab === 'zones' && <Zones {...ctx} />}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Audit: one card per zone for the chosen date ── */
function AuditBoard({ activeZones, auditsByZone, canAudit, ...rest }) {
  const [date, setDate] = useState(todayStr())
  const [open, setOpen] = useState(null) // zone being audited
  const done = activeZones.filter(z => (auditsByZone.get(z.id) || []).some(a => a.audit_date === date)).length

  return (
    <>
      <div className="mk-card mk-pad mk-h">
        <div className="grow">
          <h2>Zone walk</h2>
          <p className="mk-sub">{done} of {activeZones.length} zones audited on {fmtDate(date)}{canAudit ? ' · tap a zone to fill in or edit' : ''}</p>
        </div>
        <input type="date" className="mk-in fs-date" value={date} max={todayStr()} onChange={e => e.target.value && setDate(e.target.value)} />
      </div>

      {activeZones.length === 0 ? (
        <div className="mk-card mk-empty"><b>No zones yet</b>Add zones in the Zones tab.</div>
      ) : (
        <div className="fs-grid">
          {activeZones.map(z => {
            const list = auditsByZone.get(z.id) || []
            const audit = list.find(a => a.audit_date === date)
            const last = audit || list.find(a => a.audit_date < date)
            const status = zoneStatus(list.filter(a => a.audit_date <= date))
            const cover = audit?.photos?.[0]
            return (
              <button key={z.id} className={`mk-card fs-zone ${audit ? 'done' : ''}`} onClick={() => setOpen(z)}>
                <div className="fs-cover">
                  {cover ? <img src={fivesUrl(cover.path)} alt="" loading="lazy" /> : <Camera size={22} />}
                  {audit?.photos?.length > 1 && <span className="n">+{audit.photos.length - 1}</span>}
                </div>
                <div className="fs-zone-b">
                  <div className="mk-h">
                    <b className="grow">{z.name}</b>
                    {audit ? <Pct pct={audit.pass_pct} /> : <span className="mk-pill fs-todo">Not done</span>}
                  </div>
                  <small>{zoneType(z.zone_type) ? `${zoneType(z.zone_type).label} · ` : ''}PIC: {z.pic_name || '—'}</small>
                  <small className={`fs-st ${status.level}`}>
                    {audit ? status.label : last ? `Last: ${fmtPct(last.pass_pct)} on ${fmtDate(last.audit_date, { day: 'numeric', month: 'short' })}` : 'Never audited'}
                  </small>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {open && (
        <AuditModal zone={open} date={date} auditsByZone={auditsByZone} canAudit={canAudit} {...rest}
          onClose={() => setOpen(null)} />
      )}
    </>
  )
}

function AuditModal({ zone, date, auditsByZone, canAudit, isZairul, reload, onClose }) {
  const { memberId, fullName } = useAuth()
  const zoneAudits = auditsByZone.get(zone.id) || []
  const existing = zoneAudits.find(a => a.audit_date === date)
  const type = zoneType(zone.zone_type)
  // A new audit starts with the questions that don't fit this zone already on N-A
  const [preset] = useState(() => existing ? {} : presetAnswers(zone.zone_type, !zoneAudits.some(a => a.audit_date < date)))
  const [answers, setAnswers] = useState(existing?.answers || preset)
  const [notes, setNotes] = useState(existing?.notes || '')
  const [photos, setPhotos] = useState(existing?.photos || [])
  const [pending, setPending] = useState([]) // [{ file, preview }]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [viewer, setViewer] = useState(null)
  const fileRef = useRef(null)
  const readOnly = !canAudit
  const pct = passPct(answers)
  const answered = ITEM_KEYS.filter(k => answers[k]).length

  // Free the local previews when the form closes
  const previews = useRef([])
  useEffect(() => () => previews.current.forEach(url => URL.revokeObjectURL(url)), [])

  const setAnswer = (key, val) => setAnswers(a => ({ ...a, [key]: a[key] === val ? undefined : val }))
  const markRest = val => setAnswers(a => Object.fromEntries(ITEM_KEYS.map(k => [k, a[k] || val])))

  function addFiles(e) {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    const added = files.map(file => ({ file, preview: URL.createObjectURL(file) }))
    previews.current.push(...added.map(p => p.preview))
    setPending(p => [...p, ...added])
    e.target.value = ''
  }

  async function save() {
    if (answered < ITEM_KEYS.length) { setError(`Mark every item first — ${ITEM_KEYS.length - answered} left. Use N-A where it doesn't apply.`); return }
    setSaving(true); setError(null)
    try {
      const uploaded = []
      for (const p of pending) uploaded.push(await uploadZonePhoto(p.file, zone.id))
      const now = new Date().toISOString()
      const saved = await saveAudit({
        zone_id: zone.id, audit_date: date, answers, pass_pct: pct, notes: notes.trim() || null,
        photos: [...photos, ...uploaded],
        auditor_names: fullName,
        created_by: existing?.created_by || memberId,
        created_at: existing?.created_at || now,
        updated_at: now,
      })
      // Photos taken off this audit are deleted from storage too
      const kept = new Set(saved.photos.map(p => p.path))
      removePhotos((existing?.photos || []).map(p => p.path).filter(p => !kept.has(p)))

      toast(`${zone.name} saved · ${fmtPct(pct)}`)
      reload()
      onClose()
    } catch (e) {
      setError(e.message || 'Unable to save.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!existing || !confirm(`Delete the ${zone.name} audit for ${fmtDate(date)}?`)) return
    try { await deleteAudit(existing) } catch (e) { setError(e.message); return }
    toast(`${zone.name} audit deleted`)
    reload()
    onClose()
  }

  return (
    <div className="mk-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mk-modal fs-modal">
        <div className="mk-modal-h">
          <h3>{zone.name} · {fmtDate(date)}</h3>
          <Pct pct={pct} big />
          <button className="mk-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="mk-modal-b">
          <p className="mk-sub" style={{ marginTop: -6 }}>
            {type && <>{type.label} · </>}PIC: <b>{zone.pic_name || '—'}</b>
            {existing && <> · audited by {existing.auditor_names || '—'}</>}
          </p>
          {!readOnly && Object.keys(preset).length > 0 && (
            <p className="mk-sub fs-preset">
              {Object.keys(preset).length} question{Object.keys(preset).length === 1 ? '' : 's'} pre-marked N-A
              {type ? ` for a ${type.label.toLowerCase()}` : ''}{preset.sustain_1 ? ' (first audit has no previous issues)' : ''} — change any that do apply.
            </p>
          )}

          <section>
            <label className="mk-label">Photos of the area</label>
            <div className="mk-drop">
              {photos.map((p, i) => (
                <div key={p.path} className="th">
                  <img src={fivesUrl(p.path)} alt="" onClick={() => setViewer(i)} style={{ cursor: 'zoom-in' }} />
                  {!readOnly && <button onClick={() => setPhotos(ps => ps.filter(x => x.path !== p.path))} aria-label="Remove photo"><X size={12} /></button>}
                </div>
              ))}
              {pending.map(p => (
                <div key={p.preview} className="th">
                  <img src={p.preview} alt="" />
                  <button onClick={() => setPending(ps => ps.filter(x => x !== p))} aria-label="Remove photo"><X size={12} /></button>
                </div>
              ))}
              {!readOnly && (
                <button className="add" onClick={() => fileRef.current?.click()} aria-label="Add photos"><Camera size={20} /></button>
              )}
              {readOnly && !photos.length && <p className="mk-sub">No photos.</p>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={addFiles} />
          </section>

          {!readOnly && (
            <div className="mk-row" style={{ flexWrap: 'wrap' }}>
              <span className="mk-sub grow" style={{ flex: 1 }}>{answered} of {ITEM_KEYS.length} marked</span>
              <button className="mk-btn sm ghost" onClick={() => markRest('yes')}>Rest = Yes</button>
              <button className="mk-btn sm ghost" onClick={() => markRest('na')}>Rest = N-A</button>
            </div>
          )}

          {PILLARS.map(p => (
            <section key={p.key} className="fs-pillar">
              <h4>{p.label}</h4>
              {p.items.map((text, i) => {
                const key = `${p.key}_${i + 1}`
                return (
                  <div key={key} className="fs-item">
                    <span>{i + 1}. {text}</span>
                    <div className="fs-yn">
                      {[['yes', 'Yes'], ['no', 'No'], ['na', 'N-A']].map(([val, label]) => (
                        <button key={val} disabled={readOnly} className={answers[key] === val ? `on ${val}` : ''} onClick={() => setAnswer(key, val)}>{label}</button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </section>
          ))}

          <section>
            <label className="mk-label">Notes / action needed</label>
            <textarea className="mk-in" rows={3} value={notes} disabled={readOnly} placeholder='What must be fixed for the "No" items…' onChange={e => setNotes(e.target.value)} />
          </section>
        </div>

        {error && <div className="mk-err" style={{ margin: '0 20px' }}>{error}</div>}
        <div className="mk-modal-f">
          {existing && isZairul && <button className="mk-btn danger" onClick={remove} style={{ marginRight: 'auto' }}><Trash2 size={14} /> Delete</button>}
          <button className="mk-btn ghost" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && <button className="mk-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : <><Check size={15} /> Save audit</>}</button>}
        </div>
      </div>
      {viewer != null && <Lightbox photos={photos} index={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

/* ── Progress: a zone's photos audit by audit, and two dates side by side ── */
function Progress({ activeZones, auditsByZone }) {
  const [zoneId, setZoneId] = useState(activeZones[0]?.id || null)
  const list = (auditsByZone.get(zoneId) || []).filter(a => a.photos?.length || a.pass_pct != null)
  const [chosen, setChosen] = useState({}) // compare picks, reset when the zone changes
  const [viewer, setViewer] = useState(null)
  // Default compare: the oldest audit against the newest
  const left = chosen.zoneId === zoneId && chosen.left || list[list.length - 1]?.id || ''
  const right = chosen.zoneId === zoneId && chosen.right || list[0]?.id || ''
  const setLeft = id => setChosen({ zoneId, left: id, right })
  const setRight = id => setChosen({ zoneId, left, right: id })

  const pick = id => list.find(a => a.id === id)

  return (
    <>
      <div className="mk-card mk-pad">
        <label className="mk-label">Zone</label>
        <div className="mk-chips">
          {activeZones.map(z => <button key={z.id} className={`mk-chip ${z.id === zoneId ? 'on' : ''}`} onClick={() => setZoneId(z.id)}>{z.name}</button>)}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="mk-card mk-empty"><b>No audits for this zone yet</b>Photos added in the Audit tab show up here.</div>
      ) : (
        <>
          {list.length > 1 && (
            <div className="mk-card mk-pad">
              <div className="mk-h"><h2 className="grow">Compare</h2></div>
              <div className="fs-compare">
                {[[left, setLeft, 'Before'], [right, setRight, 'After']].map(([val, set, label]) => {
                  const a = pick(val)
                  return (
                    <div key={label}>
                      <div className="mk-row" style={{ marginBottom: 8 }}>
                        <b style={{ fontSize: 13 }}>{label}</b>
                        <select className="mk-in" value={val} onChange={e => set(e.target.value)}>
                          {list.map(x => <option key={x.id} value={x.id}>{fmtDate(x.audit_date)} · {fmtPct(x.pass_pct)}</option>)}
                        </select>
                      </div>
                      <div className="fs-cmp-photos">
                        {a?.photos?.length
                          ? a.photos.map((p, i) => <img key={p.path} src={fivesUrl(p.path)} alt="" loading="lazy" onClick={() => setViewer({ photos: a.photos, index: i })} />)
                          : <div className="mk-empty">No photos</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="fs-timeline">
            {list.map(a => (
              <div key={a.id} className="mk-card mk-pad">
                <div className="mk-h">
                  <b className="grow">{fmtDate(a.audit_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</b>
                  <Pct pct={a.pass_pct} />
                </div>
                <p className="mk-sub">By {a.auditor_names || '—'}{a.notes ? ` · ${a.notes}` : ''}</p>
                {a.photos?.length > 0 && (
                  <div className="mk-receipts" style={{ padding: '10px 0 0' }}>
                    {a.photos.map((p, i) => (
                      <button key={p.path} onClick={() => setViewer({ photos: a.photos, index: i })} style={{ width: 96, height: 96 }}>
                        <img src={fivesUrl(p.path)} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {viewer && <Lightbox photos={viewer.photos} index={viewer.index} onClose={() => setViewer(null)} />}
    </>
  )
}

/* ── Trend: monthly average Pass % per zone ── */
function Trend({ activeZones, auditsByZone }) {
  const [typeFilter, setTypeFilter] = useState('')
  const months = lastMonths(6)
  const cell = (zoneId, month) => average((auditsByZone.get(zoneId) || [])
    .filter(a => a.pass_pct != null && String(a.audit_date).startsWith(month)).map(a => Number(a.pass_pct)))
  const types = ZONE_TYPES.filter(t => activeZones.some(z => z.zone_type === t.key))
  const shown = typeFilter ? activeZones.filter(z => z.zone_type === typeFilter) : activeZones
  const rows = shown.map(z => ({ zone: z, vals: months.map(m => cell(z.id, m)) }))
  const overall = months.map((_, i) => average(rows.map(r => r.vals[i]).filter(v => v != null)))
  const totalLabel = typeFilter ? `All ${zoneType(typeFilter).label.toLowerCase()} zones` : 'All zones'

  return (
    <div className="mk-card mk-pad">
      <div className="mk-h"><h2 className="grow">Monthly average Pass %</h2></div>
      <p className="mk-sub">Green 80% and up · amber 60–79% · red under 60%. Aim to keep every zone above 80%.</p>
      {types.length > 0 && (
        <div className="mk-chips" style={{ marginTop: 12 }}>
          <button className={`mk-chip ${!typeFilter ? 'on' : ''}`} onClick={() => setTypeFilter('')}>All types</button>
          {types.map(t => <button key={t.key} className={`mk-chip ${typeFilter === t.key ? 'on' : ''}`} onClick={() => setTypeFilter(t.key)}>{t.label}</button>)}
        </div>
      )}
      <div className="fs-table-wrap">
        <table className="fs-table">
          <thead><tr><th>Zone</th>{months.map(m => <th key={m}>{monthName(m)}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ zone, vals }) => (
              <tr key={zone.id}><td>{zone.name}</td>{vals.map((v, i) => <td key={i}><Pct pct={v} /></td>)}</tr>
            ))}
            <tr className="total"><td>{totalLabel}</td>{overall.map((v, i) => <td key={i}><Pct pct={v} /></td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Escalation: latest vs previous audit per zone ── */
const LEVEL_ORDER = { escalate: 0, watch: 1, amber: 2, none: 3, green: 4 }
function Escalation({ activeZones, auditsByZone }) {
  const rows = activeZones
    .map(z => ({ zone: z, ...zoneStatus(auditsByZone.get(z.id) || []) }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])

  return (
    <div className="mk-card mk-pad">
      <div className="mk-h"><h2 className="grow">Escalation tracker</h2></div>
      <p className="mk-sub">1 red audit = watch it. 2 red audits running = escalate: talk to the PIC directly.</p>
      <div className="fs-table-wrap">
        <table className="fs-table">
          <thead><tr><th>Zone</th><th>PIC</th><th>Latest</th><th>Date</th><th>Previous</th><th>Status — action needed</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.zone.id}>
                <td>{r.zone.name}</td>
                <td>{r.zone.pic_name || '—'}</td>
                <td><Pct pct={r.latest?.pass_pct} /></td>
                <td>{r.latest ? fmtDate(r.latest.audit_date, { day: 'numeric', month: 'short' }) : '—'}</td>
                <td><Pct pct={r.prev?.pass_pct} /></td>
                <td><span className={`fs-st ${r.level}`}>{r.label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Zones & PIC names ── */
function Zones({ zones, reload }) {
  const [error, setError] = useState(null)

  async function run(job) {
    try {
      await job
      setError(null)
      reload()
    } catch (e) {
      setError(e.message)
    }
  }
  const update = (id, patch) => run(updateZone(id, patch))
  const add = () => {
    const n = zones.length + 1
    run(addZone({ code: String(n), name: `Zone ${n}`, pic_name: '', sort_order: Math.max(0, ...zones.map(z => z.sort_order)) + 1 }))
  }
  function removeZone(z) {
    if (!confirm(`Delete ${z.name} and all its audits and photos? To keep its history, switch it off instead.`)) return
    run(deleteZone(z.id))
  }
  // Text fields save when you leave them
  const onBlurSave = (z, field) => e => {
    const v = e.target.value.trim()
    if (v !== (z[field] || '') && (field !== 'name' || v)) update(z.id, { [field]: v })
  }

  return (
    <>
      <div className="mk-card mk-pad">
        <div className="mk-h">
          <div className="grow">
            <h2>Zones & person-in-charge</h2>
            <p className="mk-sub">Type the zone name, type and PIC (anyone, not only Xyte users). The type pre-marks questions that don't fit the area as N-A. Changes save when you leave the box. Switched-off zones keep their history but leave the weekly walk.</p>
          </div>
          <button className="mk-btn" onClick={add}><Plus size={15} /> Add zone</button>
        </div>
        <div className="fs-zones">
          {zones.map(z => (
            <div key={z.id} className={`fs-zrow ${z.active ? '' : 'off'}`}>
              <input className="mk-in" defaultValue={z.name} placeholder="Zone name" onBlur={onBlurSave(z, 'name')} />
              <select className="mk-in" value={z.zone_type || ''} onChange={e => update(z.id, { zone_type: e.target.value || null })} aria-label={`${z.name} type`}>
                <option value="">Type…</option>
                {ZONE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <input className="mk-in" defaultValue={z.pic_name || ''} placeholder="PIC name" onBlur={onBlurSave(z, 'pic_name')} />
              <label className="fs-switch"><input type="checkbox" checked={z.active} onChange={e => update(z.id, { active: e.target.checked })} /> On</label>
              <button className="mk-x" onClick={() => removeZone(z)} aria-label={`Delete ${z.name}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </div>
      {error && <div className="mk-err">{error}</div>}
    </>
  )
}

/* ── Small pieces ── */
function Pct({ pct, big }) {
  return <span className={`fs-pct ${tone(pct)} ${big ? 'big' : ''}`}>{fmtPct(pct)}</span>
}

function Lightbox({ photos, index, onClose }) {
  const [i, setI] = useState(index)
  const step = d => setI(n => (n + d + photos.length) % photos.length)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className="fs-lightbox" onClick={e => e.target === e.currentTarget && onClose()}>
      <img src={fivesUrl(photos[i].path)} alt="" />
      <button className="x" onClick={onClose} aria-label="Close"><X size={20} /></button>
      {photos.length > 1 && <>
        <button className="prev" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={24} /></button>
        <button className="next" onClick={() => step(1)} aria-label="Next"><ChevronRight size={24} /></button>
        <span className="count">{i + 1} / {photos.length}</span>
      </>}
    </div>
  )
}

function SetupNotice({ message }) {
  return (
    <div className="mk-card mk-pad" style={{ borderLeft: '4px solid #ef4444' }}>
      <b style={{ color: '#991b1b' }}>Couldn't load 5S data</b>
      <p className="mk-sub">Supabase said: <b>{message}</b><br />If this is the first time, run <code>sql/setup-5s.sql</code> in the Supabase SQL editor, then reload this page.</p>
    </div>
  )
}
