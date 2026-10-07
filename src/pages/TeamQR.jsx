import { useEffect, useRef, useState } from 'react'
import { Copy, ImagePlus, Pencil, QrCode, Search, X } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../utils/toast'
import { makanUrl, uploadMakanFile } from '../utils/makan'
import { Avatar, Modal, QrImage } from './BreakRoomUI'
import { cropQrFile } from '../utils/qrCrop'

// Everyone's DuitNow QR in one place. You edit your own; the admin can edit anyone's.
export default function TeamQR({ members, onSaved, editMe = false, onEditMeDone }) {
  const { memberId, isZairul } = useAuth()
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)

  // Arriving from "Add your QR" opens your own editor straight away
  useEffect(() => {
    if (!editMe || !members.length) return
    const me = members.find(m => m.id === memberId)
    if (me) setEditing(me)
    onEditMeDone?.()
  }, [editMe, members, memberId, onEditMeDone])

  const needle = query.trim().toLowerCase()
  const list = members
    .filter(m => !needle || `${m.full_name} ${m.short_name || ''}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.id === memberId) - (a.id === memberId) || !!b.pay_qr_url - !!a.pay_qr_url || a.full_name.localeCompare(b.full_name))
  const withQr = members.filter(m => m.pay_qr_url).length

  return (
    <>
      <div className="mk-h">
        <label className="qr-search">
          <Search size={15} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find someone…" />
          {query && <button onClick={() => setQuery('')}><X size={13} /></button>}
        </label>
        <span className="grow" />
        <span className="mk-sub" style={{ margin: 0 }}>{withQr} of {members.length} have a QR</span>
      </div>

      <div className="qr-wall">
        {list.map(m => {
          const isMe = m.id === memberId
          const canEdit = isMe || isZairul
          return (
            <div key={m.id} className={`mk-card qr-card${isMe ? ' me' : ''}`}>
              <div className="qr-who">
                <Avatar m={m} />
                <div><b>{isMe ? `${m.full_name} (you)` : m.full_name}</b>{m.role && <small>{m.role}</small>}</div>
                {canEdit && <button className="mk-x" title={isMe ? 'Edit my QR' : `Edit ${m.full_name}'s QR`} onClick={() => setEditing(m)}><Pencil size={14} /></button>}
              </div>
              {m.pay_qr_url ? (
                <button className="qr-thumb" onClick={() => setViewing(m)} title="Show QR"><QrImage key={m.pay_qr_url} src={m.pay_qr_url} alt={`${m.full_name}'s QR`} /></button>
              ) : (
                <button className="qr-thumb none" onClick={() => canEdit ? setEditing(m) : setViewing(m)} disabled={!canEdit && !m.pay_details}>
                  <QrCode size={26} />
                  <span>{canEdit ? (isMe ? 'Add your QR' : 'Add QR') : 'No QR yet'}</span>
                </button>
              )}
              {m.pay_details && <p className="qr-details" title={m.pay_details}>{m.pay_details}</p>}
            </div>
          )
        })}
      </div>

      {viewing && <QrView m={viewing} onClose={() => setViewing(null)} />}
      {editing && <QrEditor m={editing} isMe={editing.id === memberId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved() }} />}
    </>
  )
}

function QrView({ m, onClose }) {
  return (
    <Modal title={m.full_name} onClose={onClose} wide>
      <div className="mk-pay">
        {m.pay_qr_url
          ? <div className="mk-qr xl"><QrImage key={m.pay_qr_url} src={m.pay_qr_url} alt={`${m.full_name}'s DuitNow QR`} /></div>
          : <div className="mk-qr none">No QR yet</div>}
        {m.pay_qr_url && <p className="mk-sub">Turn your screen brightness up and scan from another phone.</p>}
        {m.pay_details && <div className="mk-details">{m.pay_details}</div>}
        {m.pay_details && (
          <button className="mk-btn ghost sm" onClick={() => navigator.clipboard?.writeText(m.pay_details).then(() => toast('Details copied'))}>
            <Copy size={13} /> Copy details
          </button>
        )}
      </div>
    </Modal>
  )
}

function QrEditor({ m, isMe, onClose, onSaved }) {
  const [file, setFile] = useState(null) // { file, url } — new picture, not saved yet
  const [removeQr, setRemoveQr] = useState(false)
  const [details, setDetails] = useState(m.pay_details || '')
  const [saving, setSaving] = useState(false)
  const [scan, setScan] = useState(null) // 'reading' | 'cropped' | 'notfound'
  const fileRef = useRef(null)
  const first = m.full_name.split(' ')[0]

  // Cut the QR out of the screenshot so it shows big; keep the picture as-is if no QR is found
  async function pick(original) {
    setScan('reading')
    setRemoveQr(false)
    const crop = await cropQrFile(original).catch(() => null)
    const f = crop || original
    setFile({ file: f, url: URL.createObjectURL(f) })
    setScan(crop ? 'cropped' : 'notfound')
  }
  const shown = file?.url || (!removeQr && m.pay_qr_url)

  async function save() {
    setSaving(true)
    try {
      const patch = { pay_details: details.trim() || null }
      if (file) patch.pay_qr_url = makanUrl(await uploadMakanFile(file.file, 'qr'))
      else if (removeQr) patch.pay_qr_url = null
      const { error } = await supabase.from('team_members').update(patch).eq('id', m.id)
      if (error) throw new Error(error.message)
      toast(isMe ? 'Your QR is saved' : `${first}'s QR is saved`)
      onSaved()
    } catch (err) {
      toast(`Couldn't save: ${err.message}`, { tone: 'err' })
      setSaving(false)
    }
  }

  return (
    <Modal narrow title={isMe ? 'My QR' : `${first}'s QR`} onClose={() => !saving && onClose()}
      footer={<>
        <button className="mk-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="mk-btn" onClick={save} disabled={saving || scan === 'reading'}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => {
        const f = e.target.files[0]
        if (f) pick(f)
        e.target.value = ''
      }} />
      <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
        {shown
          ? <div className="mk-qr" style={{ width: 230 }}>{file ? <img src={shown} alt="QR" /> : <QrImage key={shown} src={shown} />}</div>
          : <button className="mk-qr none" style={{ width: 230, cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
              <span><QrCode size={30} style={{ display: 'block', margin: '0 auto 8px' }} />Tap to upload a QR</span>
            </button>}
        <div className="mk-row">
          <button className="mk-btn sm" onClick={() => fileRef.current?.click()} disabled={saving}><ImagePlus size={13} /> {shown ? 'Change' : 'Upload'}</button>
          {shown && <button className="mk-btn danger sm" onClick={() => { setFile(null); setRemoveQr(true); setScan(null) }} disabled={saving}>Remove</button>}
        </div>
        {scan === 'reading' && <p className="mk-sub">Looking for the QR…</p>}
        {scan === 'cropped' && <p className="mk-sub" style={{ color: '#15803d', fontWeight: 700 }}>✓ QR found — trimmed to just the code</p>}
        {scan === 'notfound' && <p className="mk-sub" style={{ color: '#b45309', fontWeight: 700 }}>Couldn't read a QR in this picture. Try a clearer screenshot, or save it as is.</p>}
      </div>
      <div className="mk-note">
        Get the QR from the bank app — e.g. <b>Maybank MAE</b> → DuitNow QR → Receive, <b>CIMB OCTO</b> → DuitNow QR, or <b>Touch 'n Go</b> → Receive. Screenshot it and upload here.
      </div>
      <div>
        <label className="mk-label">Bank details (backup if the QR doesn't scan)</label>
        <textarea className="mk-in" rows={3} value={details} onChange={e => setDetails(e.target.value)} placeholder={`e.g. Maybank 1234 5678 9012\n${m.full_name}`} maxLength={200} />
      </div>
    </Modal>
  )
}
