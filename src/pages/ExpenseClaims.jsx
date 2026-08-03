import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useViewport } from '../utils/useViewport'
import { notify } from '../utils/notify'
import { Plus, X, Check, Trash2, Paperclip, Receipt, Wallet, Clock, CircleCheck, Ban } from 'lucide-react'

const CATEGORIES = [
  { value: 'travel',        label: 'Travel' },
  { value: 'mileage',       label: 'Mileage' },
  { value: 'meals',         label: 'Meals' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'materials',     label: 'Materials' },
  { value: 'other',         label: 'Other' },
]

const STATUS = {
  pending:  { label: 'Pending',  bg: '#fef9c3', text: '#854d0e', border: '#fde047', dot: '#eab308' },
  approved: { label: 'Approved', bg: '#f0fdf4', text: '#166534', border: '#86efac', dot: '#22c55e' },
  rejected: { label: 'Rejected', bg: '#fee2e2', text: '#991b1b', border: '#f87171', dot: '#ef4444' },
  paid:     { label: 'Paid',     bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd', dot: '#2563eb' },
}

const TABS = ['all', 'pending', 'approved', 'rejected', 'paid']

const lLabel = { display: 'block', fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }
const input  = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', outline: 'none', color: '#0f172a', boxSizing: 'border-box', fontFamily: 'inherit', background: 'white' }

// Solid, high-contrast buttons — matches the Mileage tab.
const btnBase = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', transition: 'filter 0.15s' }
const BTN = {
  blue:   { ...btnBase, background: '#2563eb', color: 'white', border: '1.5px solid #1d4ed8', boxShadow: '0 4px 12px rgba(37,99,235,0.35)' },
  green:  { ...btnBase, background: '#16a34a', color: 'white', border: '1.5px solid #15803d', boxShadow: '0 4px 12px rgba(22,163,74,0.32)' },
  slate:  { ...btnBase, background: '#475569', color: 'white', border: '1.5px solid #334155' },
  red:    { ...btnBase, background: '#dc2626', color: 'white', border: '1.5px solid #b91c1c' },
  ghost:  { ...btnBase, background: 'white', color: '#1e293b', border: '2px solid #94a3b8' },
}
const lift = e => { e.currentTarget.style.filter = 'brightness(1.12)' }
const drop = e => { e.currentTarget.style.filter = 'none' }

function fmtRM(n) {
  const v = Number(n) || 0
  return `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ExpenseClaims() {
  const { memberId, fullName, isZairul } = useAuth()
  const { isMobile } = useViewport()

  const [claims, setClaims]   = useState([])
  const [members, setMembers] = useState([])
  const [sites, setSites]     = useState([])
  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState(null)

  const [tab, setTab] = useState('all')
  const [memberFilter, setMemberFilter] = useState('all')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ category: 'travel', claim_date: '', amount: '', site_id: '', description: '' })
  const [receipt, setReceipt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c, error }, { data: m }, { data: s }] = await Promise.all([
      supabase.from('claims')
        .select('*, member:team_members!claims_member_id_fkey(id, full_name, short_name, avatar_url), site:sites(id, site_name)')
        .order('claim_date', { ascending: false }),
      supabase.from('team_members').select('id, full_name, short_name, avatar_url').order('full_name'),
      supabase.from('sites').select('id, site_name').order('site_name'),
    ])
    setSetupError(error ? error.message : null)
    setClaims(c || [])
    setMembers(m || [])
    setSites(s || [])
    setLoading(false)
  }

  function openModal() {
    setForm({ category: 'travel', claim_date: new Date().toISOString().slice(0, 10), amount: '', site_id: '', description: '' })
    setReceipt(null)
    setFormError(null)
    setShowModal(true)
  }

  async function handleSubmit() {
    const amount = parseFloat(form.amount)
    if (!form.claim_date)       { setFormError('Claim date is required.'); return }
    if (!amount || amount <= 0) { setFormError('Enter an amount greater than 0.'); return }
    if (!memberId)              { setFormError('Your account is not linked to a team member.'); return }
    setSaving(true); setFormError(null)

    let receipt_path = null
    if (receipt) {
      const safe = receipt.name.replace(/[^\w.-]/g, '_')
      const path = `${memberId}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from('claim-receipts').upload(path, receipt)
      if (upErr) { setFormError(`Receipt upload failed: ${upErr.message}`); setSaving(false); return }
      receipt_path = path
    }

    const { error } = await supabase.from('claims').insert({
      member_id:   memberId,
      site_id:     form.site_id || null,
      category:    form.category,
      claim_date:  form.claim_date,
      amount,
      description: form.description.trim() || null,
      receipt_path,
      status:      'pending',
    })

    if (error) { setFormError(error.message); setSaving(false); return }

    await notify(`${fullName} submitted a ${fmtRM(amount)} claim for approval`, fullName)

    setSaving(false)
    setShowModal(false)
    fetchAll()
  }

  async function setStatus(claim, status) {
    const { error } = await supabase.from('claims').update({
      status,
      reviewed_by: memberId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', claim.id)
    if (error) { alert(error.message); return }

    if (claim.member_id) {
      await notify(`Your ${fmtRM(claim.amount)} claim was ${STATUS[status].label.toLowerCase()}`, fullName, claim.member_id)
    }
    setClaims(prev => prev.map(c => c.id === claim.id ? { ...c, status, reviewed_by: memberId } : c))
  }

  async function handleDelete(claim) {
    if (!confirm('Delete this claim?')) return
    if (claim.receipt_path) await supabase.storage.from('claim-receipts').remove([claim.receipt_path])
    const { error } = await supabase.from('claims').delete().eq('id', claim.id)
    if (error) { alert(error.message); return }
    setClaims(prev => prev.filter(c => c.id !== claim.id))
  }

  async function openReceipt(claim) {
    const { data, error } = await supabase.storage.from('claim-receipts').createSignedUrl(claim.receipt_path, 300)
    if (error) { alert(`Could not open receipt: ${error.message}`); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const visible = useMemo(() => claims.filter(c =>
    (tab === 'all' || c.status === tab) &&
    (memberFilter === 'all' || c.member_id === memberFilter)
  ), [claims, tab, memberFilter])

  const totals = useMemo(() => {
    const sum = status => claims.filter(c => c.status === status).reduce((a, c) => a + Number(c.amount || 0), 0)
    return {
      pending:  sum('pending'),
      approved: sum('approved'),
      paid:     sum('paid'),
      mine:     claims.filter(c => c.member_id === memberId).reduce((a, c) => a + Number(c.amount || 0), 0),
    }
  }, [claims, memberId])

  if (loading) return <p style={{ color: '#64748b', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading claims…</p>

  const STATS = [
    { key: 'pending',  label: 'Pending approval', value: totals.pending,  Icon: Clock,       color: '#eab308' },
    { key: 'approved', label: 'Approved',         value: totals.approved, Icon: CircleCheck, color: '#22c55e' },
    { key: 'paid',     label: 'Paid out',         value: totals.paid,     Icon: Wallet,      color: '#2563eb' },
    { key: 'mine',     label: 'My claims',        value: totals.mine,     Icon: Receipt,     color: '#7c3aed' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {setupError && (
        <div style={{ background: 'white', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444', borderRadius: '14px', padding: '16px 18px' }}>
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#991b1b' }}>Claims table not set up yet</p>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
            Supabase said: <span style={{ color: '#991b1b', fontWeight: '600' }}>{setupError}</span><br />
            Run <code>sql/setup-claims.sql</code> in the Supabase SQL editor, then reload this page.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <p style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600' }}>
          {claims.length} claim{claims.length !== 1 ? 's' : ''} · {claims.filter(c => c.status === 'pending').length} awaiting approval
        </p>
        <button
          onClick={openModal}
          onMouseEnter={lift} onMouseLeave={drop}
          style={{ ...BTN.blue, padding: '10px 20px', fontSize: '13px' }}
        >
          <Plus size={14} /> New Claim
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
        {STATS.map(({ key, label, value, Icon, color }) => (
          <div key={key} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e8edf3', padding: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '9px', background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={14} color={color} />
              </div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
            </div>
            <p style={{ fontSize: isMobile ? '18px' : '21px', fontWeight: '800', color: '#0f172a', marginTop: '10px', letterSpacing: '-0.02em' }}>{fmtRM(value)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e8edf3', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', border: '1.5px solid #cbd5e1', borderRadius: '11px', padding: '4px', flexWrap: 'wrap' }}>
          {TABS.map(t => {
            const active = tab === t
            const sc = STATUS[t]
            const count = t === 'all' ? claims.length : claims.filter(c => c.status === t).length
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{ padding: '8px 15px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: '800', background: active ? (sc ? sc.dot : '#334155') : 'transparent', color: active ? 'white' : '#334155', boxShadow: active ? '0 3px 10px rgba(15,23,42,0.22)' : 'none', transition: 'all 0.15s' }}
              >
                {t === 'all' ? 'All' : sc.label} <span style={{ opacity: 0.8 }}>{count}</span>
              </button>
            )
          })}
        </div>

        <select
          value={memberFilter}
          onChange={e => setMemberFilter(e.target.value)}
          style={{ ...input, width: 'auto', minWidth: '160px', padding: '8px 10px', cursor: 'pointer' }}
        >
          <option value="all">All members</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.short_name || m.full_name}</option>
          ))}
        </select>

        <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
          {visible.length} shown · {fmtRM(visible.reduce((a, c) => a + Number(c.amount || 0), 0))}
        </span>
      </div>

      {/* Claim list */}
      <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e8edf3', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
        {visible.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '48px 16px' }}>
            {claims.length === 0 ? 'No claims submitted yet.' : 'No claims match these filters.'}
          </p>
        ) : visible.map((c, i) => {
          const sc = STATUS[c.status] || STATUS.pending
          const cat = CATEGORIES.find(x => x.value === c.category)
          const name = c.member?.short_name || c.member?.full_name || 'Unknown'
          const initials = (c.member?.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
          const isMine = c.member_id === memberId
          const canReview = isZairul && c.status === 'pending'
          const canDelete = isZairul || (isMine && c.status === 'pending')

          return (
            <div
              key={c.id}
              style={{ padding: isMobile ? '14px' : '14px 18px', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: '12px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}
            >
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: 'white', flexShrink: 0, overflow: 'hidden' }}>
                {c.member?.avatar_url
                  ? <img src={c.member.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials}
              </div>

              <div style={{ flex: 1, minWidth: '160px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{name}</p>
                  <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {cat ? cat.label : c.category}
                  </span>
                  {c.site?.site_name && (
                    <span style={{ fontSize: '11px', color: '#64748b' }}>· {c.site.site_name}</span>
                  )}
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                  {fmtDate(c.claim_date)}
                  {c.description ? ` · ${c.description}` : ''}
                </p>
              </div>

              {c.receipt_path && (
                <button
                  onClick={() => openReceipt(c)}
                  title="View receipt"
                  onMouseEnter={lift} onMouseLeave={drop}
                  style={{ ...BTN.slate, padding: '6px 11px', fontSize: '11.5px', flexShrink: 0 }}
                >
                  <Paperclip size={12} /> Receipt
                </button>
              )}

              <p style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', minWidth: '96px', textAlign: isMobile ? 'left' : 'right', flexShrink: 0 }}>
                {fmtRM(c.amount)}
              </p>

              <span style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, padding: '3px 10px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>
                {sc.label}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {canReview && (
                  <>
                    <button
                      onClick={() => setStatus(c, 'approved')}
                      title="Approve"
                      onMouseEnter={lift} onMouseLeave={drop}
                      style={{ ...BTN.green, width: '30px', height: '30px', padding: 0 }}
                    >
                      <Check size={14} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => setStatus(c, 'rejected')}
                      title="Reject"
                      onMouseEnter={lift} onMouseLeave={drop}
                      style={{ ...BTN.red, width: '30px', height: '30px', padding: 0 }}
                    >
                      <Ban size={14} />
                    </button>
                  </>
                )}
                {isZairul && c.status === 'approved' && (
                  <button
                    onClick={() => setStatus(c, 'paid')}
                    onMouseEnter={lift} onMouseLeave={drop}
                    style={{ ...BTN.blue, padding: '6px 13px', fontSize: '11.5px' }}
                  >
                    Mark paid
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => handleDelete(c)}
                    title="Delete claim"
                    onMouseEnter={lift} onMouseLeave={drop}
                    style={{ ...BTN.red, padding: '7px 9px' }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* New Claim Modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '520px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 70px rgba(15,23,42,.22)' }}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>New Claim</p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Submit an expense for approval</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: '70vh' }}>

              <div>
                <label style={lLabel}>Category</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {CATEGORIES.map(cat => {
                    const active = form.category === cat.value
                    return (
                      <button
                        key={cat.value}
                        onClick={() => setForm(f => ({ ...f, category: cat.value }))}
                        style={{ padding: '8px 15px', borderRadius: '99px', border: `1.5px solid ${active ? '#1d4ed8' : '#94a3b8'}`, background: active ? '#2563eb' : 'white', color: active ? 'white' : '#334155', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                      >
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={lLabel}>Amount (RM) *</label>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    style={input}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={lLabel}>Date *</label>
                  <input
                    type="date"
                    value={form.claim_date}
                    onChange={e => setForm(f => ({ ...f, claim_date: e.target.value }))}
                    style={{ ...input, padding: '8px 10px' }}
                  />
                </div>
              </div>

              <div>
                <label style={lLabel}>Site <span style={{ color: '#94a3b8', fontWeight: '400' }}>(optional)</span></label>
                <select
                  value={form.site_id}
                  onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}
                  style={{ ...input, cursor: 'pointer' }}
                >
                  <option value="">Not site-related</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                </select>
              </div>

              <div>
                <label style={lLabel}>Description <span style={{ color: '#94a3b8', fontWeight: '400' }}>(optional)</span></label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Toll and petrol for site inspection"
                  rows={2}
                  style={{ ...input, resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={lLabel}>Receipt <span style={{ color: '#94a3b8', fontWeight: '400' }}>(optional)</span></label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '10px', border: `2px dashed ${receipt ? '#2563eb' : '#94a3b8'}`, background: receipt ? '#eff6ff' : 'white', cursor: 'pointer', color: receipt ? '#1d4ed8' : '#475569', fontSize: '12.5px', fontWeight: '700' }}>
                  <Paperclip size={13} />
                  {receipt ? receipt.name : 'Attach receipt (image or PDF)'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={e => setReceipt(e.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {formError && (
                <p style={{ fontSize: '12px', color: '#ef4444', background: '#fee2e2', padding: '9px 12px', borderRadius: '8px' }}>{formError}</p>
              )}

              <div style={{ display: 'flex', gap: '10px', paddingTop: '2px' }}>
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  onMouseEnter={lift} onMouseLeave={drop}
                  style={{ ...BTN.blue, flex: 2, padding: '13px', fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Submitting…' : 'Submit Claim'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  onMouseEnter={lift} onMouseLeave={drop}
                  style={{ ...BTN.ghost, flex: 1, padding: '13px', fontSize: '14px' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
