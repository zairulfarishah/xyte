import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BellRing, Camera, Check, Copy, ImagePlus, Plus, QrCode, Receipt, Trash2, Undo2, X } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { notify, notifyMany } from '../utils/notify'
import { toast, undoableDelete } from '../utils/toast'
import { MAKAN_BUCKET, makanUrl, memberShort, rm, round2, uploadMakanFile } from '../utils/makan'
import { Avatar, Lightbox, Modal } from './BreakRoomUI'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fmtDate = d => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })
const shareState = s => s.received_at ? 'recv' : s.paid_at ? 'paid' : 'unpaid'
const STATE_LABEL = { recv: 'Received', paid: 'Paid · to confirm', unpaid: 'Unpaid' }

// ════════════════ Split bill ════════════════
export default function SplitBill({ members, onSetupError, onOpenQr }) {
  const { memberId, fullName } = useAuth()
  const [bills, setBills] = useState([])
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('open')
  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState(null) // { bill, share }
  const [image, setImage] = useState(null)
  const [hidden, setHidden] = useState(() => new Set()) // bills deleted, waiting on undo
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const me = memberById[memberId]

  const load = useCallback(async () => {
    const { data: b, error } = await supabase.from('bills').select('*')
      .order('bill_date', { ascending: false }).order('created_at', { ascending: false }).limit(80)
    if (error) { onSetupError?.(error.message); setLoading(false); return }
    const ids = (b || []).map(x => x.id)
    const { data: s } = ids.length ? await supabase.from('bill_shares').select('*').in('bill_id', ids).order('created_at') : { data: [] }
    setBills(b || [])
    setShares(s || [])
    setLoading(false)
  }, [onSetupError])

  useEffect(() => {
    load()
    const channel = supabase.channel('makan-bills')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_shares' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const sharesByBill = useMemo(() => {
    const map = {}
    shares.forEach(s => { (map[s.bill_id] ||= []).push(s) })
    return map
  }, [shares])

  const visible = bills.filter(b => !hidden.has(b.id))
  const isSettled = b => (sharesByBill[b.id] || []).every(s => s.received_at)
  const youOwe = shares.filter(s => s.member_id === memberId && !s.received_at && visible.some(b => b.id === s.bill_id && b.payer_id !== memberId))
  const owedToYou = shares.filter(s => !s.received_at && s.member_id !== memberId && visible.some(b => b.id === s.bill_id && b.payer_id === memberId))
  const sum = list => list.reduce((n, s) => n + Number(s.amount || 0), 0)

  // Open bills where you still owe come first
  const owesOn = b => (sharesByBill[b.id] || []).some(s => s.member_id === memberId && !s.received_at)
  const listed = visible
    .filter(b => view === 'all' || (view === 'open' ? !isSettled(b) : isSettled(b)))
    .sort((a, b) => (owesOn(b) ? 1 : 0) - (owesOn(a) ? 1 : 0))

  async function updateShare(share, patch, message) {
    setShares(list => list.map(s => s.id === share.id ? { ...s, ...patch } : s))
    const { error } = await supabase.from('bill_shares').update(patch).eq('id', share.id)
    if (error) { toast(`Couldn't save: ${error.message}`, { tone: 'err' }); load(); return false }
    if (message) toast(message)
    return true
  }

  function markReceived(bill, share, on) {
    updateShare(share, { received_at: on ? new Date().toISOString() : null }, on ? `${share.member_name} marked as received` : null)
    if (on && share.member_id) notify(`${fullName} confirmed your ${rm(share.amount)} for "${bill.title}" ✓`, fullName, share.member_id, 'makan').catch(() => {})
  }

  function nudge(bill) {
    const unpaid = (sharesByBill[bill.id] || []).filter(s => !s.paid_at && s.member_id && s.member_id !== memberId)
    if (!unpaid.length) return
    unpaid.forEach(s => notify(`Reminder: you owe ${bill.payer_name} ${rm(s.amount)} for "${bill.title}"`, fullName, s.member_id, 'makan').catch(() => {}))
    toast(`Reminder sent to ${unpaid.map(s => s.member_name.split(' ')[0]).join(', ')}`)
  }

  function deleteBill(bill) {
    const toggle = on => setHidden(prev => { const next = new Set(prev); if (on) next.add(bill.id); else next.delete(bill.id); return next })
    undoableDelete({
      label: `"${bill.title}"`,
      hide: () => toggle(true),
      restore: () => toggle(false),
      commit: async () => {
        const { error } = await supabase.from('bills').delete().eq('id', bill.id)
        if (error) throw error
        const paths = [...(bill.receipts || []).map(r => r.path), ...(sharesByBill[bill.id] || []).map(s => s.proof_path)].filter(Boolean)
        if (paths.length) await supabase.storage.from(MAKAN_BUCKET).remove(paths)
        load()
      },
    })
  }

  if (loading) return <div className="mk-card mk-empty">Loading…</div>

  return (
    <>
      <div className="mk-totals">
        <div className="mk-total owe"><small>You owe</small><b>{rm(sum(youOwe))}</b></div>
        <div className="mk-total owed"><small>Owed to you</small><b>{rm(sum(owedToYou))}</b></div>
        <button className="mk-btn" onClick={() => setCreating(true)} disabled={!memberId}><Plus size={16} /> New bill</button>
      </div>

      {me && !me.pay_qr_url && (
        <div className="mk-card mk-pad mk-h" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <QrCode size={18} color="#1d4ed8" />
          <span style={{ flex: 1, fontSize: 13, color: '#1e3a8a' }}><b>Add your DuitNow QR</b> so people can pay you back in one scan.</span>
          <button className="mk-btn sm" onClick={onOpenQr}>Add QR</button>
        </div>
      )}

      <div className="mk-h">
        <div className="mk-tabs2">
          {[['open', 'Open'], ['settled', 'Settled'], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
      </div>

      {listed.length === 0 ? (
        <div className="mk-card mk-empty">
          <Receipt size={26} style={{ opacity: .35, margin: '0 auto 8px', display: 'block' }} />
          <b>{view === 'settled' ? 'Nothing settled yet' : 'All square'}</b>
          {view === 'open' ? 'Paid for the team? Post a new bill — only the people on it can see it.' : ''}
        </div>
      ) : (
        <div className="mk-bills">
          {listed.map(bill => (
            <BillCard key={bill.id} bill={bill} shares={sharesByBill[bill.id] || []} memberById={memberById}
              memberId={memberId} canDelete={bill.payer_id === memberId || bill.created_by === memberId}
              onPay={share => setPaying({ bill, share })}
              onUnpay={share => updateShare(share, { paid_at: null, proof_path: null })}
              onReceived={(share, on) => markReceived(bill, share, on)}
              onNudge={() => nudge(bill)} onDelete={() => deleteBill(bill)} onImage={setImage} />
          ))}
        </div>
      )}

      {creating && <BillForm members={members} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
      {paying && (
        <PaySheet bill={paying.bill} share={paying.share} payer={memberById[paying.bill.payer_id]}
          onClose={() => setPaying(null)}
          onPaid={async proofPath => {
            const ok = await updateShare(paying.share, { paid_at: new Date().toISOString(), proof_path: proofPath || null }, `Marked as paid — ${paying.bill.payer_name.split(' ')[0]} will confirm`)
            if (ok && paying.bill.payer_id) notify(`${fullName} paid you ${rm(paying.share.amount)} for "${paying.bill.title}" — tap Received once it's in`, fullName, paying.bill.payer_id, 'makan').catch(() => {})
            setPaying(null)
          }} />
      )}
      {image && <Lightbox src={image} onClose={() => setImage(null)} />}
    </>
  )
}

function BillCard({ bill, shares, memberById, memberId, canDelete, onPay, onUnpay, onReceived, onNudge, onDelete, onImage }) {
  const iPaid = bill.payer_id === memberId
  const done = shares.filter(s => s.received_at).length
  const owedTotal = shares.reduce((n, s) => n + Number(s.amount || 0), 0)
  const sorted = [...shares].sort((a, b) => (b.member_id === memberId ? 1 : 0) - (a.member_id === memberId ? 1 : 0))
  const anyUnpaid = shares.some(s => !s.paid_at && s.member_id !== memberId)

  return (
    <div className="mk-card mk-bill">
      <div className="mk-bill-top">
        <Avatar m={memberById[bill.payer_id]} name={bill.payer_name} />
        <div className="t">
          <h3>{bill.title}</h3>
          <p>{iPaid ? 'You paid' : `${bill.payer_name} paid`} · {fmtDate(bill.bill_date)}</p>
        </div>
        <div className="amt">
          <b>{rm(bill.total || owedTotal)}</b>
          <small>{done}/{shares.length} settled</small>
        </div>
      </div>
      <div className="mk-prog"><i style={{ width: `${shares.length ? (done / shares.length) * 100 : 100}%` }} /></div>

      {(bill.receipts || []).length > 0 && (
        <div className="mk-receipts">
          {bill.receipts.map(r => (
            <button key={r.path} onClick={() => onImage(makanUrl(r.path))} title="View receipt"><img src={makanUrl(r.path)} alt="Receipt" loading="lazy" /></button>
          ))}
        </div>
      )}
      {bill.note && <p className="mk-sub" style={{ padding: '8px 16px 0' }}>{bill.note}</p>}

      <div className="mk-shares">
        {sorted.map(s => {
          const st = shareState(s)
          const isMe = s.member_id === memberId
          return (
            <div key={s.id} className={`mk-share${isMe && !iPaid ? ' me' : ''}`}>
              <Avatar m={memberById[s.member_id]} name={s.member_name} size={26} />
              <div className="t">
                <b>{isMe ? 'You' : s.member_name}</b>
                <small>{s.item || ' '}</small>
              </div>
              <span className="a">{rm(s.amount)}</span>
              {s.proof_path && <button className="mk-x" title="Payment proof" onClick={() => onImage(makanUrl(s.proof_path))}><Camera size={14} /></button>}
              {iPaid ? (
                st === 'recv'
                  ? <button className="mk-pill recv" style={{ border: 0, cursor: 'pointer' }} title="Undo" onClick={() => onReceived(s, false)}><Check size={11} /> Received</button>
                  : <button className={`mk-btn sm ${st === 'paid' ? 'green' : 'ghost'}`} onClick={() => onReceived(s, true)}>{st === 'paid' ? 'Confirm' : 'Received'}</button>
              ) : isMe && st === 'unpaid' ? (
                <button className="mk-btn sm amber" onClick={() => onPay(s)}>Pay</button>
              ) : isMe && st === 'paid' ? (
                <button className="mk-pill paid" style={{ border: 0, cursor: 'pointer' }} title="Undo — I haven't paid" onClick={() => onUnpay(s)}>{STATE_LABEL.paid} <Undo2 size={10} /></button>
              ) : (
                <span className={`mk-pill ${st}`}>{STATE_LABEL[st]}</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="mk-bill-foot">
        <span className="grow" />
        {iPaid && anyUnpaid && <button className="mk-btn ghost sm" onClick={onNudge}><BellRing size={13} /> Nudge unpaid</button>}
        {canDelete && <button className="mk-x" title="Delete bill" onClick={onDelete}><Trash2 size={15} /></button>}
      </div>
    </div>
  )
}

// ════════════════ New bill ════════════════
function BillForm({ members, onClose, onSaved }) {
  const { memberId, fullName } = useAuth()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayIso())
  const [payerId, setPayerId] = useState(memberId || '')
  const [files, setFiles] = useState([]) // { file, url }
  const [mode, setMode] = useState('even')
  const [total, setTotal] = useState('')
  const [includePayer, setIncludePayer] = useState(true)
  const [people, setPeople] = useState(() => new Set())
  const [rows, setRows] = useState({}) // member_id → { amount, item }
  const [service, setService] = useState(false)
  const [sst, setSst] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const payer = members.find(m => m.id === payerId)
  const others = members.filter(m => m.id !== payerId)
  const picked = others.filter(m => people.has(m.id))
  const factor = (service ? 1.1 : 1) * (sst ? 1.06 : 1)

  const shares = mode === 'even'
    ? picked.map(m => ({ m, amount: round2((Number(total) || 0) / (picked.length + (includePayer ? 1 : 0)) || 0), item: '' }))
    : picked.map(m => ({ m, amount: round2((Number(rows[m.id]?.amount) || 0) * factor), item: rows[m.id]?.item || '' }))
  const sharesSum = round2(shares.reduce((n, s) => n + s.amount, 0))
  const billTotal = Number(total) || 0
  const payerPart = round2(billTotal - sharesSum)

  const togglePerson = id => setPeople(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const setRow = (id, patch) => setRows(r => ({ ...r, [id]: { ...r[id], ...patch } }))

  async function save() {
    setError('')
    if (!title.trim()) return setError('What was it for? e.g. Lunch at Pelita')
    if (!payer) return setError('Pick who paid.')
    if (mode === 'even' && !(billTotal > 0)) return setError('Key in the bill total.')
    const real = shares.filter(s => s.amount > 0)
    if (!real.length) return setError('Pick who owes, with an amount for each.')
    setSaving(true)
    try {
      const receipts = []
      for (const f of files) receipts.push({ path: await uploadMakanFile(f.file, 'receipts'), name: f.file.name })
      const { data: bill, error: e1 } = await supabase.from('bills').insert({
        title: title.trim(), bill_date: date, payer_id: payer.id, payer_name: payer.full_name, created_by: memberId,
        total: billTotal > 0 ? billTotal : sharesSum, receipts, note: note.trim() || null,
      }).select().single()
      if (e1) throw new Error(e1.message)
      const { error: e2 } = await supabase.from('bill_shares').insert(real.map(s => ({
        bill_id: bill.id, member_id: s.m.id, member_name: s.m.full_name, amount: s.amount, item: s.item.trim() || null,
      })))
      if (e2) { await supabase.from('bills').delete().eq('id', bill.id); throw new Error(e2.message) }
      real.forEach(s => notify(`${payer.full_name.split(' ')[0]} paid for "${bill.title}" — your share is ${rm(s.amount)}. Tap Pay in Break Room to settle.`, fullName, s.m.id, 'makan').catch(() => {}))
      if (payer.id !== memberId) notifyMany(`${fullName} posted "${bill.title}" — you paid, ${real.length} people owe you ${rm(sharesSum)}`, fullName, [payer.id], 'makan').catch(() => {})
      toast(`"${bill.title}" posted — ${real.length} ${real.length === 1 ? 'person' : 'people'} notified`)
      onSaved()
    } catch (err) {
      setError(err.message || 'Could not save the bill.')
      setSaving(false)
    }
  }

  return (
    <Modal title="New bill" onClose={() => !saving && onClose()}
      footer={<>
        <button className="mk-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="mk-btn" onClick={save} disabled={saving}>{saving ? 'Posting…' : 'Post bill'}</button>
      </>}>
      {error && <div className="mk-err">{error}</div>}

      <div className="mk-row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label className="mk-label">What for</label>
          <input className="mk-in" value={title} onChange={e => setTitle(e.target.value)} placeholder="Lunch at Pelita / Kopi run" maxLength={80} autoFocus />
        </div>
        <div style={{ width: 150 }}>
          <label className="mk-label">Date</label>
          <input className="mk-in" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="mk-label">Who paid</label>
        <select className="mk-in" value={payerId} onChange={e => { setPayerId(e.target.value); setPeople(p => { const n = new Set(p); n.delete(e.target.value); return n }) }}>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}{m.id === memberId ? ' (me)' : ''}</option>)}
        </select>
        {payer && !payer.pay_qr_url && <p className="mk-sub" style={{ marginTop: 6 }}>⚠ {memberShort(payer)} hasn't added a DuitNow QR yet — people will only see their bank details{payer.pay_details ? '' : ' (none saved either)'}.</p>}
      </div>

      <div>
        <label className="mk-label">Receipt</label>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => {
          const picked = [...e.target.files].map(file => ({ file, url: URL.createObjectURL(file) }))
          setFiles(f => [...f, ...picked].slice(0, 6))
          e.target.value = ''
        }} />
        <div className="mk-drop">
          {files.map((f, i) => (
            <div key={f.url} className="th"><img src={f.url} alt="" /><button onClick={() => setFiles(list => list.filter((_, j) => j !== i))}><X size={12} /></button></div>
          ))}
          <button className="add" onClick={() => fileRef.current?.click()} title="Add receipt photo"><ImagePlus size={20} /></button>
        </div>
      </div>

      <div>
        <label className="mk-label">Who owes <span style={{ fontWeight: 500 }}>— only you, the payer and these people can see this bill</span></label>
        <div className="mk-chips">
          {others.map(m => (
            <button key={m.id} className={`mk-chip${people.has(m.id) ? ' on' : ''}`} onClick={() => togglePerson(m.id)}>
              <span style={{ marginLeft: 6 }}><Avatar m={m} size={22} /></span>{memberShort(m)}
            </button>
          ))}
        </div>
        {others.length > 0 && (
          <div className="mk-row" style={{ marginTop: 8, gap: 12 }}>
            <button className="mk-btn ghost sm" onClick={() => setPeople(new Set(others.map(m => m.id)))}>Everyone</button>
            {people.size > 0 && <button className="mk-btn ghost sm" onClick={() => setPeople(new Set())}>Clear</button>}
          </div>
        )}
      </div>

      <div>
        <label className="mk-label">How to split</label>
        <div className="mk-tabs2">
          <button className={mode === 'even' ? 'on' : ''} onClick={() => setMode('even')}>Split evenly</button>
          <button className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>Each person's amount</button>
        </div>
      </div>

      {mode === 'even' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label className="mk-label">Bill total (RM)</label>
            <input className="mk-in" type="number" inputMode="decimal" min="0" step="0.01" value={total} onChange={e => setTotal(e.target.value)} placeholder="0.00" />
          </div>
          <label className="mk-row" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={includePayer} onChange={e => setIncludePayer(e.target.checked)} />
            {payer ? memberShort(payer) : 'The payer'} also ate — count them in the split
          </label>
          {picked.length > 0 && billTotal > 0 && (
            <div className="mk-sum"><span>{picked.length + (includePayer ? 1 : 0)} people × </span><b>{rm(shares[0]?.amount)} each</b></div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {picked.length === 0 && <p className="mk-note">Pick who owes first, then key in what each person had.</p>}
          {picked.map(m => (
            <div key={m.id} className="mk-split-row">
              <div className="who"><Avatar m={m} size={24} /><span>{memberShort(m)}</span></div>
              <input className="mk-in item" value={rows[m.id]?.item || ''} onChange={e => setRow(m.id, { item: e.target.value })} placeholder="What they had (optional)" maxLength={60} />
              <input className="mk-in" type="number" inputMode="decimal" min="0" step="0.01" value={rows[m.id]?.amount || ''} onChange={e => setRow(m.id, { amount: e.target.value })} placeholder="RM" />
            </div>
          ))}
          <div className="mk-row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <label className="mk-row" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', gap: 6 }}>
              <input type="checkbox" checked={service} onChange={e => setService(e.target.checked)} /> + Service charge 10%
            </label>
            <label className="mk-row" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', gap: 6 }}>
              <input type="checkbox" checked={sst} onChange={e => setSst(e.target.checked)} /> + SST 6%
            </label>
          </div>
          <div>
            <label className="mk-label">Bill total (RM, optional — to check it adds up)</label>
            <input className="mk-in" type="number" inputMode="decimal" min="0" step="0.01" value={total} onChange={e => setTotal(e.target.value)} placeholder="0.00" />
          </div>
          {picked.length > 0 && (
            <div className={`mk-sum${billTotal > 0 && payerPart < 0 ? ' bad' : ''}`}>
              <span>Others owe{factor > 1 ? ' (incl. charges)' : ''}</span>
              <b>{rm(sharesSum)}{billTotal > 0 ? (payerPart >= 0 ? ` · ${payer ? memberShort(payer) : 'payer'}'s own: ${rm(payerPart)}` : ` · ${rm(-payerPart)} over the total`) : ''}</b>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mk-label">Note (optional)</label>
        <input className="mk-in" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Pay by Friday" maxLength={120} />
      </div>
    </Modal>
  )
}

// ════════════════ Pay someone back ════════════════
function PaySheet({ bill, share, payer, onClose, onPaid }) {
  const [proof, setProof] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const qr = payer?.pay_qr_url
  const firstName = (payer?.full_name || bill.payer_name).split(' ')[0]

  async function paid() {
    setSaving(true)
    try {
      const path = proof ? await uploadMakanFile(proof.file, 'proof') : null
      await onPaid(path)
    } catch (err) {
      toast(`Couldn't upload proof: ${err.message}`, { tone: 'err' })
      setSaving(false)
    }
  }

  return (
    <Modal narrow title={`Pay ${firstName}`} onClose={() => !saving && onClose()}
      footer={<>
        <button className="mk-btn ghost" onClick={onClose} disabled={saving}>Later</button>
        <button className="mk-btn green" onClick={paid} disabled={saving}><Check size={15} /> {saving ? 'Saving…' : "I've paid"}</button>
      </>}>
      <div className="mk-pay">
        <div>
          <div className="amt">{rm(share.amount)}</div>
          <div className="to">to {payer?.full_name || bill.payer_name} · {bill.title}{share.item ? ` (${share.item})` : ''}</div>
        </div>
        <button className="mk-btn ghost sm" onClick={() => navigator.clipboard?.writeText(Number(share.amount).toFixed(2)).then(() => toast('Amount copied'))}>
          <Copy size={13} /> Copy amount
        </button>
        {qr
          ? <div className="mk-qr"><img src={qr} alt={`${firstName}'s DuitNow QR`} /></div>
          : <div className="mk-qr none">{firstName} hasn't added a DuitNow QR yet{payer?.pay_details ? ' — use the details below.' : '. Ask them for their account.'}</div>}
        {qr && <p className="mk-sub">Screenshot this and scan it from your bank app, or scan from another phone.</p>}
        {payer?.pay_details && <div className="mk-details">{payer.pay_details}</div>}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => {
          const file = e.target.files[0]
          if (file) setProof({ file, url: URL.createObjectURL(file) })
          e.target.value = ''
        }} />
        {proof ? (
          <div className="mk-drop" style={{ justifyContent: 'center' }}>
            <div className="th"><img src={proof.url} alt="" /><button onClick={() => setProof(null)}><X size={12} /></button></div>
          </div>
        ) : (
          <button className="mk-btn ghost sm" onClick={() => fileRef.current?.click()}><Camera size={13} /> Attach transfer screenshot (optional)</button>
        )}
      </div>
    </Modal>
  )
}
