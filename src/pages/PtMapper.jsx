import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FolderOpen, Save, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { toast, undoableDelete } from '../utils/toast'

// PT Cable Mapper is a self-contained tool that lives in public/pt-mapper.html.
// It runs in a same-origin frame so it keeps its own layout, keeps work in this
// browser (localStorage) and downloads DXF / PDF / PNG / CSV files directly.
// The bar above it saves jobs to the team's project list (sql/setup-pt-jobs.sql):
// a pt_jobs row per project, and the job file itself in the pt-jobs bucket.
const SRC = '/pt-mapper.html'
const BUCKET = 'pt-jobs'
const LINK_KEY = 'xyte.ptjob'   // the project this browser's PT Mapper job belongs to

const readLink = () => { try { return JSON.parse(localStorage.getItem(LINK_KEY) || 'null') } catch { return null } }
const writeLink = l => { try { l ? localStorage.setItem(LINK_KEY, JSON.stringify(l)) : localStorage.removeItem(LINK_KEY) } catch { /* storage unavailable */ } }
const who = m => m?.short_name || m?.full_name?.split(' ')[0] || 'someone'
const when = t => new Date(t).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const SELECT = '*, updater:team_members!pt_jobs_updated_by_fkey(full_name, short_name)'

export default function PtMapper() {
  const { memberId } = useAuth()
  const boxRef = useRef(null)
  const frameRef = useRef(null)
  const [height, setHeight] = useState(null)
  const [link, setLinkState] = useState(readLink)        // {id, name, updated_at, dirty}
  const [busy, setBusy] = useState(false)
  const [nameDlg, setNameDlg] = useState(null)           // {name, error}
  const [listOpen, setListOpen] = useState(false)

  const setLink = useCallback(l => { writeLink(l); setLinkState(l) }, [])
  const api = () => frameRef.current?.contentWindow?.ptMapper

  useEffect(() => {
    function fit() {
      const el = boxRef.current
      if (!el) return
      const main = el.closest('main')
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      setHeight(Math.max(480, window.innerHeight - el.getBoundingClientRect().top - bottom))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // Edits in the frame mark the project unsaved; a new job or an opened file there is no longer this project.
  useEffect(() => {
    function onMsg(e) {
      if (e.origin !== location.origin || e.data?.source !== 'pt-mapper') return
      if (e.data.type === 'changed') setLinkState(l => { if (!l || l.dirty) return l; const n = { ...l, dirty: true }; writeLink(n); return n })
      if (e.data.type === 'replaced') setLinkState(l => { if (l) toast(`This job is no longer linked to "${l.name}". Use Save to add it as a project.`); writeLink(null); return null })
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  async function upload(id, job) {
    const body = new Blob([JSON.stringify(job)], { type: 'application/json' })
    const { error } = await supabase.storage.from(BUCKET).upload(`${id}.json`, body, { upsert: true, contentType: 'application/json' })
    if (error) throw error
    return body.size
  }

  async function save() {
    const m = api()
    if (!m) return
    if (!link) { setNameDlg({ name: m.info().name, error: '' }); return }
    setBusy(true)
    try {
      const { data: row, error } = await supabase.from('pt_jobs').select(SELECT).eq('id', link.id).maybeSingle()
      if (error) throw error
      if (!row) { setLink(null); setNameDlg({ name: link.name, error: 'This project was deleted from Xyte. Save it again under a name.' }); return }
      if (row.updated_at !== link.updated_at &&
          !confirm(`${who(row.updater)} saved "${row.name}" at ${when(row.updated_at)}, after you opened it.\n\nSave yours over it? Their changes will be lost.`)) return
      const job = await m.getJob(), info = m.info()
      const size = await upload(link.id, job)
      const { data: saved, error: e2 } = await supabase.from('pt_jobs')
        .update({ levels: info.levels, readings: info.readings, size_bytes: size, updated_by: memberId, updated_at: new Date().toISOString() })
        .eq('id', link.id).select('updated_at').single()
      if (e2) throw e2
      setLink({ id: link.id, name: row.name, updated_at: saved.updated_at, dirty: false })
      toast(`Saved "${row.name}" to Xyte`)
    } catch (err) {
      toast(`Couldn't save: ${err.message}`, { tone: 'err', ms: 7000 })
    } finally { setBusy(false) }
  }

  async function saveNew(name) {
    const m = api()
    name = name.trim()
    if (!m) return
    if (!name) { setNameDlg({ name, error: 'Type a project name.' }); return }
    setBusy(true)
    try {
      const { data: same } = await supabase.from('pt_jobs').select('id').ilike('name', name.replace(/[%_\\]/g, '\\$&')).limit(1)
      if (same?.length) { setNameDlg({ name, error: 'A project with this name already exists. Open it from Projects, or use another name.' }); return }
      m.setName(name)
      const id = crypto.randomUUID(), job = await m.getJob(), info = m.info()
      const size = await upload(id, job)
      const { data: row, error } = await supabase.from('pt_jobs').insert({
        id, name, file_path: `${id}.json`, levels: info.levels, readings: info.readings, size_bytes: size, created_by: memberId, updated_by: memberId,
      }).select('updated_at').single()
      if (error) { await supabase.storage.from(BUCKET).remove([`${id}.json`]); throw error }
      setLink({ id, name, updated_at: row.updated_at, dirty: false })
      setNameDlg(null)
      toast(`"${name}" saved to Xyte. Everyone can open it from Projects.`)
    } catch (err) {
      setNameDlg({ name, error: `Couldn't save: ${err.message}` })
    } finally { setBusy(false) }
  }

  async function open(row) {
    const m = api()
    if (!m) return
    if (link?.dirty && !confirm(link.id === row.id
      ? `Your changes to "${link.name}" are not saved to Xyte. Open the saved version and drop them?`
      : `"${link.name}" has changes that are not saved to Xyte. Open "${row.name}" anyway?`)) return
    setBusy(true)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(row.file_path)
      if (error) throw error
      await m.loadJob(JSON.parse(await data.text()))
      setLink({ id: row.id, name: row.name, updated_at: row.updated_at, dirty: false })
      setListOpen(false)
      toast(`Opened "${row.name}"`)
    } catch (err) {
      toast(`Couldn't open "${row.name}": ${err.message}`, { tone: 'err', ms: 7000 })
    } finally { setBusy(false) }
  }

  const status = !link ? 'Not saved to Xyte'
    : link.dirty ? 'Unsaved changes'
    : `Saved ${when(link.updated_at)}`

  return (
    <div ref={boxRef} style={{ height: height ? `${height}px` : 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div style={S.bar}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '8px', flex: 1 }}>
          <b style={S.name} title={link?.name}>{link ? link.name : 'PT Mapper'}</b>
          <span style={{ fontSize: '12px', color: link?.dirty ? '#b45309' : '#64748b', whiteSpace: 'nowrap' }}>{status}</span>
        </div>
        <button style={S.btn} onClick={() => setListOpen(true)} disabled={busy}><FolderOpen size={14} /> Projects</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={save} disabled={busy}><Save size={14} /> {busy ? 'Saving…' : 'Save'}</button>
        {link && <button style={S.btn} onClick={() => setNameDlg({ name: `${link.name} (copy)`, error: '' })} disabled={busy}>Save as new</button>}
        <a href={SRC} target="_blank" rel="noopener" style={S.ext} title="Open in its own window (not linked to Xyte projects)">
          <ExternalLink size={13} />
        </a>
      </div>
      <iframe
        ref={frameRef}
        src={SRC}
        title="PT Cable Mapper"
        style={{ flex: 1, width: '100%', border: 0, display: 'block', background: '#e7e9ea' }}
      />
      {nameDlg && <NameDialog dlg={nameDlg} busy={busy} onChange={name => setNameDlg({ name, error: '' })} onSave={() => saveNew(nameDlg.name)} onClose={() => setNameDlg(null)} />}
      {listOpen && <ProjectList current={link?.id} busy={busy} onOpen={open} onClose={() => setListOpen(false)}
        onDeleted={id => { if (link?.id === id) setLink(null) }} />}
    </div>
  )
}

function NameDialog({ dlg, busy, onChange, onSave, onClose }) {
  return (
    <Modal title="Save to Xyte" onClose={onClose}>
      <label style={{ display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
        Project name
        <input autoFocus value={dlg.name} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSave()}
          placeholder="Menara ABC Level 3-5" style={S.input} />
      </label>
      <p style={S.note}>Everyone in the team can open, change and save this project from Projects.</p>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {dlg.error && <span style={{ color: '#dc2626', fontSize: '13px', marginRight: 'auto' }}>{dlg.error}</span>}
        <button style={S.btn} onClick={onClose}>Cancel</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={onSave} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

function ProjectList({ current, busy, onOpen, onClose, onDeleted }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from('pt_jobs').select(SELECT).order('updated_at', { ascending: false }).then(({ data, error }) => {
      if (error) setError(error.message); else setRows(data)
    })
  }, [])

  function del(row) {
    if (!confirm(`Delete "${row.name}" for everyone?`)) return
    undoableDelete({
      label: `"${row.name}"`,
      hide: () => setRows(list => list.filter(r => r.id !== row.id)),
      restore: () => setRows(list => [row, ...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at))),
      commit: async () => {
        const { error } = await supabase.from('pt_jobs').delete().eq('id', row.id)
        if (error) throw error
        await supabase.storage.from(BUCKET).remove([row.file_path])
        onDeleted(row.id)
      },
    })
  }

  const shown = (rows || []).filter(r => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Modal title="PT Mapper projects" onClose={onClose} wide>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search project name" style={{ ...S.input, paddingLeft: '30px' }} />
      </div>
      {error && <p style={{ ...S.note, color: '#dc2626' }}>
        Couldn't load projects: {error}{/pt_jobs/.test(error) ? ' Run sql/setup-pt-jobs.sql in Supabase first.' : ''}
      </p>}
      {!rows && !error && <p style={S.note}>Loading…</p>}
      {rows && !shown.length && <p style={S.note}>{rows.length ? 'No project matches.' : 'No projects yet. Use Save to add the job you are working on.'}</p>}
      <div style={{ display: 'grid', gap: '6px', maxHeight: '60vh', overflowY: 'auto' }}>
        {shown.map(r => (
          <div key={r.id} style={{ ...S.row, ...(r.id === current ? { borderColor: '#2563eb', background: '#eff6ff' } : null) }}>
            <button onClick={() => onOpen(r)} disabled={busy} style={S.rowMain}>
              <b style={{ fontSize: '14px', color: '#0f172a' }}>{r.name}{r.id === current ? ' · open' : ''}</b>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {r.levels} level{r.levels === 1 ? '' : 's'} · {r.readings} reading{r.readings === 1 ? '' : 's'} · saved {when(r.updated_at)} by {who(r.updater)}
              </span>
            </button>
            <button onClick={() => del(r)} style={S.icon} title="Delete project" aria-label={`Delete ${r.name}`}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, wide, children }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div style={S.scrim} onClick={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ ...S.dlg, maxWidth: wide ? '560px' : '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>{title}</h2>
          <button onClick={onClose} style={S.icon} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

const S = {
  bar: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#e7e9ea', borderBottom: '1px solid #d4d8dc', flexWrap: 'wrap' },
  name: { fontSize: '14px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '13px', fontWeight: 600, borderRadius: '7px',
    border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' },
  primary: { background: '#2563eb', borderColor: '#2563eb', color: '#fff' },
  ext: { display: 'inline-flex', padding: '6px', color: '#475569' },
  scrim: { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,6,23,.45)', display: 'grid', placeItems: 'center', padding: '16px' },
  dlg: { width: '100%', background: '#fff', borderRadius: '12px', padding: '16px', display: 'grid', gap: '12px', boxShadow: '0 20px 50px rgba(0,0,0,.3)' },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', background: '#fff' },
  note: { margin: 0, fontSize: '12.5px', color: '#64748b' },
  row: { display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', paddingRight: '4px' },
  rowMain: { flex: 1, minWidth: 0, display: 'grid', gap: '2px', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 0, cursor: 'pointer' },
  icon: { display: 'inline-flex', padding: '6px', background: 'transparent', border: 0, color: '#64748b', cursor: 'pointer', borderRadius: '6px' },
}
