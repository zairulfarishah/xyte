import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useViewport } from '../utils/useViewport'
import { notify } from '../utils/notify'
import { buildMileageClaimPdf, downloadPdf, mileagePdfFilename } from '../utils/mileagePdf'
import { Plus, X, Trash2, Copy, FileDown, Check, ArrowLeft, ArrowDown, Car, Route, Send, CircleCheck, CornerDownLeft, MapPin, ChevronDown, ChevronRight } from 'lucide-react'

const DEFAULT_RATE = 0.5
const ARROW = ' → '

const STATUS = {
  draft:     { label: 'Draft',     bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  submitted: { label: 'Submitted', bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  approved:  { label: 'Approved',  bg: '#f0fdf4', text: '#166534', border: '#86efac' },
  rejected:  { label: 'Rejected',  bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
}

const lLabel = { display: 'block', fontSize: '11px', fontWeight: '800', color: '#334155', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }
const input  = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', outline: 'none', color: '#0f172a', boxSizing: 'border-box', fontFamily: 'inherit', background: 'white' }
const cell   = { ...input, padding: '8px 10px', fontSize: '12.5px' }

// Solid, high-contrast buttons — every action reads at a glance.
const btnBase = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', transition: 'filter 0.15s' }
const BTN = {
  blue:   { ...btnBase, background: '#2563eb', color: 'white', border: '1.5px solid #1d4ed8', boxShadow: '0 4px 12px rgba(37,99,235,0.35)' },
  green:  { ...btnBase, background: '#16a34a', color: 'white', border: '1.5px solid #15803d', boxShadow: '0 4px 12px rgba(22,163,74,0.32)' },
  violet: { ...btnBase, background: '#7c3aed', color: 'white', border: '1.5px solid #6d28d9', boxShadow: '0 4px 12px rgba(124,58,237,0.3)' },
  slate:  { ...btnBase, background: '#475569', color: 'white', border: '1.5px solid #334155' },
  red:    { ...btnBase, background: '#dc2626', color: 'white', border: '1.5px solid #b91c1c' },
  ghost:  { ...btnBase, background: 'white', color: '#1e293b', border: '2px solid #94a3b8' },
}
const lift = e => { e.currentTarget.style.filter = 'brightness(1.12)' }
const drop = e => { e.currentTarget.style.filter = 'none' }

const SETUP_HINT = 'Run sql/setup-claims.sql then sql/migrate-multistop.sql in the Supabase SQL editor'

function fmtRM(n) {
  return `RM ${(Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return '—'
  const parsed = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function shortDate(d) {
  if (!d) return '—'
  const parsed = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

let SEQ = 0
function nextKey() {
  SEQ += 1
  return `k${SEQ}`
}

function blankStop(name = '', km = '') {
  return { key: nextKey(), name, km }
}

// A journey is a route: stop 1 is the origin, every later stop carries the km travelled to reach it.
// Simple mode is the same shape, just limited to [origin, destination] (+ the origin again on a return).
function blankRow(date, origin = '') {
  return {
    key: nextKey(),
    mode: 'simple',
    collapsed: false,
    row_date: date || today(),
    stops: [blankStop(origin), blankStop(), blankStop(origin)],
    description: '',
    trips: 1,
  }
}

function rowKm(row) {
  return row.stops.slice(1).reduce((a, s) => a + (parseFloat(s.km) || 0), 0)
}

function rowAmount(row, rate) {
  return rowKm(row) * (parseInt(row.trips, 10) || 0) * (parseFloat(rate) || 0)
}

function routeText(row) {
  return row.stops.map(s => s.name.trim()).filter(Boolean).join(ARROW)
}

function isSimpleReturn(row) {
  return row.stops.length === 3
}

// A saved route reopens in Simple mode only if it is genuinely a there-and-back (or a one-way hop).
function inferMode(stops) {
  if (stops.length === 2) return 'simple'
  if (stops.length === 3 && stops[0].name.trim() === stops[2].name.trim()) return 'simple'
  return 'multi'
}

export default function MileageClaims() {
  const { memberId, fullName, isZairul } = useAuth()
  const { isMobile } = useViewport()

  const [claims, setClaims]   = useState([])
  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState(null)
  const [editing, setEditing] = useState(null) // null = list view

  useEffect(() => { fetchClaims() }, [])

  async function fetchClaims() {
    setLoading(true)
    const { data, error } = await supabase
      .from('mileage_claims')
      .select('*, rows:mileage_claim_rows(*)')
      .order('created_at', { ascending: false })
    setSetupError(error ? error.message : null)
    setClaims((data || []).map(c => ({ ...c, rows: (c.rows || []).sort((a, b) => a.sort_order - b.sort_order) })))
    setLoading(false)
  }

  function newClaim() {
    setEditing({
      id: null,
      member_id: memberId,
      member_name: fullName,
      vehicle_plate: '',
      period: new Date().toLocaleDateString('en-MY', { month: 'long', year: 'numeric' }),
      rate_per_km: DEFAULT_RATE,
      status: 'draft',
      submitted_by_name: fullName,
      submitted_at: null,
      approved_by_name: null,
      approved_at: null,
      rows: [blankRow()],
    })
  }

  function openClaim(claim) {
    setEditing({
      ...claim,
      rows: (claim.rows || []).map(r => {
        const raw = Array.isArray(r.stops) && r.stops.length >= 2
          ? r.stops.map(s => blankStop(s.name || '', s.km ?? ''))
          // Rows saved before multi-stop: rebuild the route from the location text.
          : (r.location || '').split(/\s*(?:→|->|>)\s*/).filter(Boolean).map((name, i) => blankStop(name, i === 0 ? '' : r.km))
        const stops = raw.length >= 2 ? raw : [blankStop(r.location || ''), blankStop('', r.km)]
        return {
          key: r.id,
          id: r.id,
          mode: inferMode(stops),
          collapsed: true, // saved journeys open folded — expand the one you want to touch
          row_date: r.row_date,
          stops,
          description: r.description || '',
          trips: r.trips ?? 1,
        }
      }),
    })
  }

  async function handleDelete(claim) {
    if (!confirm(`Delete the mileage claim for ${claim.period}?`)) return
    const { error } = await supabase.from('mileage_claims').delete().eq('id', claim.id)
    if (error) { alert(error.message); return }
    setClaims(prev => prev.filter(c => c.id !== claim.id))
  }

  async function exportPdf(claim) {
    const bytes = await buildMileageClaimPdf({ claim, rows: claim.rows || [] })
    downloadPdf(bytes, mileagePdfFilename(claim))
  }

  async function approve(claim) {
    const { error } = await supabase.from('mileage_claims').update({
      status: 'approved',
      approved_by: memberId,
      approved_by_name: fullName,
      approved_at: new Date().toISOString(),
    }).eq('id', claim.id)
    if (error) { alert(error.message); return }
    if (claim.member_id) {
      await notify(`Your ${claim.period} mileage claim (${fmtRM(claim.total_amount)}) was approved`, fullName, claim.member_id)
    }
    fetchClaims()
  }

  if (editing) {
    return (
      <MileageEditor
        claim={editing}
        isMobile={isMobile}
        memberId={memberId}
        fullName={fullName}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); fetchClaims() }}
      />
    )
  }

  if (loading) return <p style={{ color: '#64748b', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading mileage claims…</p>

  const grandTotal = claims.reduce((a, c) => a + Number(c.total_amount || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {setupError && (
        <div style={{ background: 'white', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444', borderRadius: '14px', padding: '16px 18px' }}>
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#991b1b' }}>Mileage tables not ready</p>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
            Supabase said: <span style={{ color: '#991b1b', fontWeight: '600' }}>{setupError}</span><br />
            {SETUP_HINT}, then reload this page.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <p style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600' }}>
          {claims.length} claim{claims.length !== 1 ? 's' : ''} · {fmtRM(grandTotal)} total
        </p>
        <button
          onClick={newClaim}
          onMouseEnter={lift} onMouseLeave={drop}
          style={{ ...BTN.blue, padding: '10px 20px', fontSize: '13px' }}
        >
          <Plus size={14} /> New Mileage Claim
        </button>
      </div>

      {claims.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e8edf3', padding: '56px 20px', textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <Route size={30} color="#cbd5e1" style={{ margin: '0 auto' }} />
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginTop: '12px' }}>No mileage claims yet</p>
          <p style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '4px' }}>Add your journeys, save, then generate the PDF for approval.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(330px, 1fr))', gap: '14px' }}>
          {claims.map(c => {
            const sc = STATUS[c.status] || STATUS.draft
            const canEdit = c.status !== 'approved' && (isZairul || c.member_id === memberId)
            return (
              <div key={c.id} style={{ background: 'white', borderRadius: '18px', border: '1px solid #e8edf3', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px 18px 14px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>{c.period}</p>
                    <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{c.member_name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '7px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '99px' }}>
                        <Car size={10} /> {c.vehicle_plate || 'No plate'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '99px' }}>
                        {c.rows?.length || 0} journey{(c.rows?.length || 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <span style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, padding: '3px 10px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>
                    {sc.label}
                  </span>
                </div>

                <div style={{ padding: '12px 18px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <p style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>{fmtRM(c.total_amount)}</p>
                  <p style={{ fontSize: '11.5px', color: '#94a3b8' }}>{Number(c.total_km || 0).toLocaleString('en-MY')} km @ RM {Number(c.rate_per_km).toFixed(2)}/km</p>
                </div>

                {(c.submitted_at || c.approved_at) && (
                  <div style={{ padding: '10px 18px', fontSize: '11px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {c.submitted_at && <span>Submitted by {c.submitted_by_name || '—'} · {fmtDate(c.submitted_at)}</span>}
                    {c.approved_at  && <span style={{ color: '#166534', fontWeight: '600' }}>Approved by {c.approved_by_name || '—'} · {fmtDate(c.approved_at)}</span>}
                  </div>
                )}

                <div style={{ padding: '12px 14px', display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: 'auto' }}>
                  <button
                    onClick={() => exportPdf(c)}
                    onMouseEnter={lift} onMouseLeave={drop}
                    style={{ ...BTN.violet, padding: '9px 15px', fontSize: '12px' }}
                  >
                    <FileDown size={13} /> PDF
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => openClaim(c)}
                      onMouseEnter={lift} onMouseLeave={drop}
                      style={{ ...BTN.slate, padding: '9px 15px', fontSize: '12px' }}
                    >
                      Open
                    </button>
                  )}
                  {isZairul && c.status === 'submitted' && (
                    <button
                      onClick={() => approve(c)}
                      onMouseEnter={lift} onMouseLeave={drop}
                      style={{ ...BTN.green, padding: '9px 15px', fontSize: '12px' }}
                    >
                      <CircleCheck size={13} /> Approve
                    </button>
                  )}
                  {(isZairul || (c.member_id === memberId && c.status !== 'approved')) && (
                    <button
                      onClick={() => handleDelete(c)}
                      title="Delete claim"
                      onMouseEnter={lift} onMouseLeave={drop}
                      style={{ ...BTN.red, marginLeft: 'auto', padding: '9px 11px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MileageEditor({ claim, isMobile, memberId, fullName, onClose, onSaved }) {
  const [head, setHead] = useState({
    member_name:   claim.member_name || fullName,
    vehicle_plate: claim.vehicle_plate || '',
    period:        claim.period || '',
    rate_per_km:   claim.rate_per_km ?? DEFAULT_RATE,
  })
  const [rows, setRows] = useState(claim.rows?.length ? claim.rows : [blankRow()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // Survives a failed save so a retry updates the same claim instead of creating another one.
  const [savedId, setSavedId] = useState(claim.id)

  const rate = parseFloat(head.rate_per_km) || 0
  const totals = useMemo(() => ({
    km:     rows.reduce((a, r) => a + rowKm(r), 0),
    trips:  rows.reduce((a, r) => a + (parseInt(r.trips, 10) || 0), 0),
    amount: rows.reduce((a, r) => a + rowAmount(r, rate), 0),
  }), [rows, rate])

  function patchRow(key, patch) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r))
  }

  function patchStop(rowKey, stopKey, patch) {
    setRows(prev => prev.map(r => r.key !== rowKey ? r : {
      ...r,
      stops: r.stops.map(s => s.key === stopKey ? { ...s, ...patch } : s),
    }))
  }

  // ── Simple mode: [origin, destination] plus the origin repeated when it is a return trip ──
  function setSimple(row, patch) {
    const origin  = patch.origin  ?? row.stops[0].name
    const dest    = patch.dest    ?? row.stops[1]?.name ?? ''
    const km      = patch.km      ?? row.stops[1]?.km ?? ''
    const isRet   = patch.isReturn ?? isSimpleReturn(row)
    const stops = [
      { ...row.stops[0], name: origin },
      { ...(row.stops[1] || blankStop()), name: dest, km },
    ]
    if (isRet) stops.push({ ...(row.stops[2] || blankStop()), name: origin, km })
    patchRow(row.key, { stops })
  }

  function setMode(row, mode) {
    if (mode === row.mode) return

    // Simple mode can only hold "start -> destination (-> back to start)", so a longer
    // route has to be trimmed. Ask first whenever that would actually change the route.
    if (mode === 'simple' && row.stops.length > 2) {
      const [first, second] = row.stops
      const returned = row.stops[row.stops.length - 1].name.trim() === first.name.trim()
      const stops = [first, second]
      if (returned) stops.push(blankStop(first.name, second.km))

      const before = routeText(row)
      const after  = routeText({ ...row, stops })
      if (before !== after && !confirm(`Switching to one location changes this journey:\n\n${before}\n→\n${after}\n\nContinue?`)) return

      patchRow(row.key, { mode, stops })
      return
    }
    patchRow(row.key, { mode })
  }

  function addStop(row) {
    patchRow(row.key, { stops: [...row.stops, blankStop()] })
  }

  // Closes the loop: adds the origin back as the final stop, pre-filling the last leg's distance.
  function returnToStart(row) {
    const origin = row.stops[0]?.name || ''
    const lastKm = row.stops[row.stops.length - 1]?.km || ''
    patchRow(row.key, { stops: [...row.stops, blankStop(origin, lastKm)] })
  }

  function removeStop(row, stopKey) {
    if (row.stops.length <= 2) return
    patchRow(row.key, { stops: row.stops.filter(s => s.key !== stopKey) })
  }

  // Adding a journey folds the finished ones away, so only the row being filled stays open.
  function addRow() {
    setRows(prev => {
      const last = prev[prev.length - 1]
      return [
        ...prev.map(r => ({ ...r, collapsed: true })),
        blankRow(last?.row_date, last?.stops[0]?.name || ''),
      ]
    })
  }

  function duplicateRow(row) {
    const idx = rows.findIndex(r => r.key === row.key)
    const copy = {
      ...row,
      key: nextKey(),
      id: undefined,
      collapsed: false,
      stops: row.stops.map(s => ({ ...s, key: nextKey() })),
    }
    setRows(prev => [
      ...prev.slice(0, idx + 1).map(r => ({ ...r, collapsed: true })),
      copy,
      ...prev.slice(idx + 1).map(r => ({ ...r, collapsed: true })),
    ])
  }

  function removeRow(key) {
    setRows(prev => prev.length === 1 ? [blankRow()] : prev.filter(r => r.key !== key))
  }

  function setAllCollapsed(collapsed) {
    setRows(prev => prev.map(r => ({ ...r, collapsed })))
  }

  function filledRows() {
    return rows.filter(r => routeText(r) || rowKm(r) > 0)
  }

  // Returns the offending row key on failure so it can be unfolded for the user.
  function validate() {
    if (!head.period.trim())      { setError('Claim period is required (e.g. "August 2026").'); return false }
    if (!head.member_name.trim()) { setError('Name is required.'); return false }

    const kept = filledRows()
    if (kept.length === 0) { setError('Add at least one journey with a location and a distance.'); return false }

    for (const [i, r] of kept.entries()) {
      const fail = msg => {
        setError(`Journey ${i + 1}: ${msg}`)
        patchRow(r.key, { collapsed: false })
      }
      if (r.stops.filter(s => s.name.trim()).length < 2) { fail('needs at least a start and a destination.'); return false }
      if (r.stops.some(s => !s.name.trim()))             { fail('has an empty stop — fill it in or remove it.'); return false }
      const badLeg = r.stops.slice(1).findIndex(s => !(parseFloat(s.km) > 0))
      if (badLeg !== -1)                                 { fail(`the leg to "${r.stops[badLeg + 1].name}" has no distance.`); return false }
    }
    return true
  }

  // Persists head + rows; returns the saved claim (rows shaped for the PDF) or null.
  async function persist(status, extra = {}) {
    if (!validate()) return null
    setSaving(true); setError(null)

    const payload = {
      member_id:     claim.member_id || memberId,
      member_name:   head.member_name.trim(),
      vehicle_plate: head.vehicle_plate.trim() || null,
      period:        head.period.trim(),
      rate_per_km:   rate,
      total_km:      totals.km,
      total_amount:  totals.amount,
      status,
      ...extra,
    }

    let claimId = savedId
    const isNewClaim = !claimId
    let oldRowIds = []

    if (claimId) {
      const { error: upErr } = await supabase.from('mileage_claims').update(payload).eq('id', claimId)
      if (upErr) { setError(upErr.message); setSaving(false); return null }
      // Keep the old rows until the new ones are safely in — a failed insert must not wipe them.
      const { data: existing } = await supabase.from('mileage_claim_rows').select('id').eq('claim_id', claimId)
      oldRowIds = (existing || []).map(r => r.id)
    } else {
      const { data, error: insErr } = await supabase.from('mileage_claims').insert(payload).select().single()
      if (insErr) { setError(insErr.message); setSaving(false); return null }
      claimId = data.id
      setSavedId(claimId)
    }

    const rowPayload = filledRows().map((r, i) => ({
      claim_id:    claimId,
      sort_order:  i,
      row_date:    r.row_date || today(),
      location:    routeText(r),
      description: r.description.trim() || null,
      stops:       r.stops.map((s, si) => si === 0
        ? { name: s.name.trim() }
        : { name: s.name.trim(), km: parseFloat(s.km) || 0 }),
      km:          rowKm(r),
      trips:       parseInt(r.trips, 10) || 1,
      amount:      rowAmount(r, rate),
    }))

    const { error: rowErr } = await supabase.from('mileage_claim_rows').insert(rowPayload)
    if (rowErr) {
      // Roll back so a half-written claim never survives: a brand new header is removed
      // outright, an existing one keeps the rows it already had.
      if (isNewClaim) {
        await supabase.from('mileage_claims').delete().eq('id', claimId)
        setSavedId(null)
      }
      setError(rowErr.message)
      setSaving(false)
      return null
    }

    if (oldRowIds.length) await supabase.from('mileage_claim_rows').delete().in('id', oldRowIds)

    setSaving(false)
    return { ...claim, ...payload, id: claimId, rows: rowPayload }
  }

  async function handleSave() {
    const saved = await persist(claim.status === 'approved' ? 'approved' : claim.status || 'draft')
    if (saved) onSaved()
  }

  async function handleSubmit() {
    const saved = await persist('submitted', {
      submitted_by: memberId,
      submitted_by_name: fullName,
      submitted_at: new Date().toISOString(),
    })
    if (!saved) return
    await notify(`${fullName} submitted a mileage claim for ${saved.period} (${fmtRM(saved.total_amount)})`, fullName)
    onSaved()
  }

  // Save first so the PDF always matches what is stored.
  async function handleSaveAndPdf() {
    const saved = await persist(claim.status || 'draft')
    if (!saved) return
    const bytes = await buildMileageClaimPdf({ claim: saved, rows: saved.rows })
    downloadPdf(bytes, mileagePdfFilename(saved))
    onSaved()
  }

  const openCount = rows.filter(r => !r.collapsed).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      <button
        onClick={onClose}
        onMouseEnter={lift} onMouseLeave={drop}
        style={{ ...BTN.ghost, alignSelf: 'flex-start', padding: '8px 15px', fontSize: '12.5px' }}
      >
        <ArrowLeft size={14} /> Back to claims
      </button>

      {/* Claim header details */}
      <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e8edf3', padding: isMobile ? '16px' : '20px 22px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', marginBottom: '14px' }}>
          {claim.id ? 'Edit Mileage Claim' : 'New Mileage Claim'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
          <div>
            <label style={lLabel}>Name</label>
            <input value={head.member_name} onChange={e => setHead(h => ({ ...h, member_name: e.target.value }))} style={input} />
          </div>
          <div>
            <label style={lLabel}>Vehicle Plate No.</label>
            <input value={head.vehicle_plate} onChange={e => setHead(h => ({ ...h, vehicle_plate: e.target.value.toUpperCase() }))} placeholder="e.g. WXY 1234" style={input} />
          </div>
          <div>
            <label style={lLabel}>Claim Period</label>
            <input value={head.period} onChange={e => setHead(h => ({ ...h, period: e.target.value }))} placeholder="e.g. August 2026" style={input} />
          </div>
          <div>
            <label style={lLabel}>Rate (RM / km)</label>
            <input type="number" min="0" step="0.05" value={head.rate_per_km} onChange={e => setHead(h => ({ ...h, rate_per_km: e.target.value }))} style={input} />
          </div>
        </div>
      </div>

      {/* Journeys toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>Journeys</p>
          <p style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
            Total = journey × trip × RM {rate.toFixed(2)}. Tap a folded journey to edit it again.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {rows.length > 1 && (
            <button
              onClick={() => setAllCollapsed(openCount > 0)}
              onMouseEnter={lift} onMouseLeave={drop}
              style={{ ...BTN.ghost, padding: '9px 15px', fontSize: '12.5px' }}
            >
              {openCount > 0 ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              {openCount > 0 ? 'Collapse all' : 'Expand all'}
            </button>
          )}
          <button
            onClick={addRow}
            onMouseEnter={lift} onMouseLeave={drop}
            style={{ ...BTN.blue, padding: '10px 18px', fontSize: '12.5px' }}
          >
            <Plus size={14} /> Add journey
          </button>
        </div>
      </div>

      {rows.map((row, idx) => {
        const km = rowKm(row)
        const amount = rowAmount(row, rate)
        const simple = row.mode === 'simple'

        // ── Folded: one clean summary line ──
        if (row.collapsed) return (
          <div
            key={row.key}
            onClick={() => patchRow(row.key, { collapsed: false })}
            style={{ background: 'white', borderRadius: '14px', border: '1px solid #e8edf3', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: '11px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flexWrap: isMobile ? 'wrap' : 'nowrap' }}
          >
            <ChevronRight size={16} color="#2563eb" style={{ flexShrink: 0 }} />
            <span style={{ width: '22px', height: '22px', borderRadius: '7px', background: '#1e293b', color: 'white', fontSize: '10.5px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {idx + 1}
            </span>
            <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#334155', flexShrink: 0, minWidth: '52px' }}>{shortDate(row.row_date)}</span>
            <span style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: '600', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {routeText(row) || <span style={{ color: '#cbd5e1' }}>Empty journey</span>}
            </span>
            {!simple && (
              <span style={{ fontSize: '9.5px', fontWeight: '800', color: 'white', background: '#7c3aed', padding: '3px 8px', borderRadius: '99px', flexShrink: 0, letterSpacing: '0.03em' }}>
                {row.stops.length} STOPS
              </span>
            )}
            <span style={{ fontSize: '11.5px', color: '#334155', fontWeight: '700', flexShrink: 0 }}>{km.toLocaleString('en-MY')} km × {parseInt(row.trips, 10) || 0}</span>
            <span style={{ fontSize: '13px', color: '#15803d', fontWeight: '800', flexShrink: 0, minWidth: '84px', textAlign: 'right' }}>{fmtRM(amount)}</span>
            <button
              onClick={e => { e.stopPropagation(); removeRow(row.key) }}
              title="Remove journey"
              onMouseEnter={lift} onMouseLeave={drop}
              style={{ ...BTN.red, padding: '7px 9px', flexShrink: 0 }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )

        // ── Expanded editor ──
        return (
          <div key={row.key} style={{ background: 'white', borderRadius: '18px', border: '1px solid #dbe3ec', overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,0.07)' }}>

            {/* Journey header: number, date, trips, fold */}
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #eef2f6', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => patchRow(row.key, { collapsed: true })}
                title="Fold this journey"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#2563eb' }}
              >
                <ChevronDown size={17} />
              </button>
              <span style={{ width: '24px', height: '24px', borderRadius: '8px', background: '#0f172a', color: 'white', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {idx + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#334155', textTransform: 'uppercase' }}>Date</span>
                <input type="date" value={row.row_date} onChange={e => patchRow(row.key, { row_date: e.target.value })} style={{ ...cell, width: 'auto', padding: '6px 9px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#334155', textTransform: 'uppercase' }}>Trip</span>
                <input type="number" min="1" step="1" value={row.trips} onChange={e => patchRow(row.key, { trips: e.target.value })} style={{ ...cell, width: '64px', padding: '6px 9px', textAlign: 'center' }} />
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => duplicateRow(row)}
                  title="Duplicate journey"
                  onMouseEnter={lift} onMouseLeave={drop}
                  style={{ ...BTN.slate, padding: '7px 12px', fontSize: '11.5px' }}
                >
                  <Copy size={12} /> Duplicate
                </button>
                <button
                  onClick={() => removeRow(row.key)}
                  title="Remove journey"
                  onMouseEnter={lift} onMouseLeave={drop}
                  style={{ ...BTN.red, padding: '7px 10px' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* Mode switch */}
            <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', border: '1.5px solid #cbd5e1', borderRadius: '11px', padding: '4px' }}>
                {[['simple', 'One location'], ['multi', 'Multiple locations']].map(([val, label]) => {
                  const on = row.mode === val
                  return (
                    <button
                      key={val}
                      onClick={() => setMode(row, val)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: '800', background: on ? '#2563eb' : 'transparent', color: on ? 'white' : '#334155', boxShadow: on ? '0 3px 10px rgba(37,99,235,0.4)' : 'none', transition: 'all 0.15s' }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: '600' }}>
                {simple ? 'Office to one place and back' : 'Chain as many stops as you need'}
              </span>
            </div>

            {/* ── SIMPLE ── */}
            {simple ? (
              <div style={{ padding: isMobile ? '14px' : '14px 18px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 130px', gap: '12px', alignItems: 'end' }}>
                <div>
                  <label style={lLabel}>From</label>
                  <input
                    value={row.stops[0].name}
                    onChange={e => setSimple(row, { origin: e.target.value })}
                    placeholder="e.g. Sonicon (Office)"
                    style={cell}
                  />
                </div>
                <div>
                  <label style={lLabel}>To</label>
                  <input
                    value={row.stops[1]?.name || ''}
                    onChange={e => setSimple(row, { dest: e.target.value })}
                    placeholder="e.g. KLCC"
                    style={cell}
                  />
                </div>
                <div>
                  <label style={lLabel}>One-way (KM)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={row.stops[1]?.km ?? ''}
                    onChange={e => setSimple(row, { km: e.target.value })}
                    placeholder="0"
                    style={{ ...cell, textAlign: 'right' }}
                  />
                </div>
                <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0f172a', fontWeight: '700', cursor: 'pointer', background: isSimpleReturn(row) ? '#dbeafe' : '#f1f5f9', border: `1.5px solid ${isSimpleReturn(row) ? '#2563eb' : '#cbd5e1'}`, padding: '8px 13px', borderRadius: '10px' }}>
                    <input
                      type="checkbox"
                      checked={isSimpleReturn(row)}
                      onChange={e => setSimple(row, { isReturn: e.target.checked })}
                      style={{ width: '17px', height: '17px', accentColor: '#2563eb', cursor: 'pointer' }}
                    />
                    Return to <strong>{row.stops[0].name.trim() || 'start'}</strong> (×2)
                  </label>
                  <span style={{ fontSize: '12.5px', color: '#334155', fontWeight: '700' }}>
                    Journey: <strong style={{ color: '#1d4ed8' }}>{km.toLocaleString('en-MY')} km</strong>
                  </span>
                </div>
                <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                  <label style={lLabel}>Description</label>
                  <input
                    value={row.description}
                    onChange={e => patchRow(row.key, { description: e.target.value })}
                    placeholder="e.g. Site inspection"
                    style={cell}
                  />
                </div>
              </div>
            ) : (
              /* ── MULTI ── */
              <div style={{ padding: isMobile ? '14px' : '16px 18px' }}>
                {row.stops.map((stop, si) => (
                  <div key={stop.key}>
                    {si > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0 6px 9px' }}>
                        <ArrowDown size={15} color="#2563eb" />
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={stop.km}
                          onChange={e => patchStop(row.key, stop.key, { km: e.target.value })}
                          placeholder="0"
                          style={{ ...cell, width: '90px', padding: '6px 9px', textAlign: 'right', borderColor: '#2563eb' }}
                        />
                        <span style={{ fontSize: '11.5px', color: '#334155', fontWeight: '700' }}>km on this leg</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: si === 0 ? '#2563eb' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MapPin size={12} color="white" />
                      </div>
                      <input
                        value={stop.name}
                        onChange={e => patchStop(row.key, stop.key, { name: e.target.value })}
                        placeholder={si === 0 ? 'Start — e.g. Sonicon (Office)' : `Stop ${si + 1} — e.g. KLCC`}
                        style={{ ...cell, flex: 1 }}
                      />
                      <button
                        onClick={() => removeStop(row, stop.key)}
                        disabled={row.stops.length <= 2}
                        title={row.stops.length <= 2 ? 'A journey needs at least two stops' : 'Remove stop'}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', padding: '6px', flexShrink: 0, cursor: row.stops.length <= 2 ? 'not-allowed' : 'pointer', background: row.stops.length <= 2 ? '#f1f5f9' : '#fee2e2', border: `1.5px solid ${row.stops.length <= 2 ? '#e2e8f0' : '#dc2626'}`, color: row.stops.length <= 2 ? '#cbd5e1' : '#dc2626' }}
                      >
                        <X size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => addStop(row)}
                    onMouseEnter={lift} onMouseLeave={drop}
                    style={{ ...BTN.slate, padding: '9px 15px', fontSize: '12.5px' }}
                  >
                    <Plus size={13} /> Add stop
                  </button>
                  <button
                    onClick={() => returnToStart(row)}
                    title="Add the starting point back as the final stop"
                    onMouseEnter={lift} onMouseLeave={drop}
                    style={{ ...BTN.violet, padding: '9px 15px', fontSize: '12.5px' }}
                  >
                    <CornerDownLeft size={13} /> Return to start
                  </button>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <label style={lLabel}>Description</label>
                  <input
                    value={row.description}
                    onChange={e => patchRow(row.key, { description: e.target.value })}
                    placeholder="e.g. Site inspection and client meeting"
                    style={cell}
                  />
                </div>
              </div>
            )}

            {/* Journey total + fold */}
            <div style={{ padding: '11px 18px', background: '#e8eef5', borderTop: '1.5px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '11.5px', color: '#334155', fontWeight: '700', minWidth: 0, wordBreak: 'break-word' }}>
                {routeText(row) || 'Route not set yet'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <p style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
                  {km.toLocaleString('en-MY')} km × {parseInt(row.trips, 10) || 0} trip · <span style={{ color: '#15803d' }}>{fmtRM(amount)}</span>
                </p>
                <button
                  onClick={() => patchRow(row.key, { collapsed: true })}
                  onMouseEnter={lift} onMouseLeave={drop}
                  style={{ ...BTN.green, padding: '8px 15px', fontSize: '12px' }}
                >
                  <Check size={13} strokeWidth={3} /> Done
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {/* Grand total */}
      <div style={{ padding: '16px 20px', background: '#0f172a', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total distance</p>
            <p style={{ fontSize: '17px', fontWeight: '800', color: 'white', marginTop: '2px' }}>{totals.km.toLocaleString('en-MY')} km</p>
          </div>
          <div>
            <p style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Journeys</p>
            <p style={{ fontSize: '17px', fontWeight: '800', color: 'white', marginTop: '2px' }}>{rows.length}</p>
          </div>
          <div>
            <p style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trips</p>
            <p style={{ fontSize: '17px', fontWeight: '800', color: 'white', marginTop: '2px' }}>{totals.trips}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Claim total</p>
          <p style={{ fontSize: '25px', fontWeight: '800', color: '#22c55e', marginTop: '2px', letterSpacing: '-0.02em' }}>{fmtRM(totals.amount)}</p>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: '12.5px', color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', padding: '11px 14px', borderRadius: '10px', fontWeight: '600' }}>{error}</p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingBottom: '8px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          onMouseEnter={lift} onMouseLeave={drop}
          style={{ ...BTN.blue, padding: '13px 24px', fontSize: '13.5px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          <Check size={15} strokeWidth={3} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handleSaveAndPdf}
          disabled={saving}
          onMouseEnter={lift} onMouseLeave={drop}
          style={{ ...BTN.violet, padding: '13px 24px', fontSize: '13.5px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          <FileDown size={15} /> Save & Download PDF
        </button>
        {claim.status !== 'approved' && (
          <button
            onClick={handleSubmit}
            disabled={saving}
            onMouseEnter={lift} onMouseLeave={drop}
            style={{ ...BTN.green, padding: '13px 24px', fontSize: '13.5px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            <Send size={14} /> Save & Submit for approval
          </button>
        )}
        <button
          onClick={onClose}
          onMouseEnter={lift} onMouseLeave={drop}
          style={{ ...BTN.ghost, padding: '13px 24px', fontSize: '13.5px' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
