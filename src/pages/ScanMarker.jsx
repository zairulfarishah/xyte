import { useCallback, useEffect, useRef, useState } from 'react'
import { FilePlus2, FolderOpen, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { toast, undoableDelete } from '../utils/toast'

// Scanning Point Marker lives in public/scan-marker.html and runs in a same-origin frame.
// This page owns the shared side (sql/setup-scan-marker.sql):
//   scan_projects  one row per drawing, the PDF itself in the scan-drawings bucket
//   scan_points    one row per marked point, kept live for everyone through Supabase realtime
// The frame reports what changed ("ops"); this page writes it, retries while there is no
// signal, and passes other people's changes back in.
const SRC = '/scan-marker.html'
const BUCKET = 'scan-drawings'
const LAST_KEY = 'xyte.scanproject'
const pendKey = id => `xyte.scanpending.${id}`
const SESSION = crypto.randomUUID()
const SELECT = '*, updater:team_members!scan_projects_updated_by_fkey(full_name, short_name), scan_points(count)'
const who = m => m?.short_name || m?.full_name?.split(' ')[0] || 'someone'
const when = t => new Date(t).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d } catch { return d } }
const writeJSON = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }

export default function ScanMarker() {
  const { memberId } = useAuth()
  const boxRef = useRef(null)
  const frameRef = useRef(null)
  const [height, setHeight] = useState(null)
  const [ready, setReady] = useState(false)
  const [project, setProject] = useState(null)        // scan_projects row
  const [opening, setOpening] = useState(false)
  const [sync, setSync] = useState({ state: 'idle', waiting: 0 })
  const [listOpen, setListOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const members = useRef({})
  const pending = useRef(new Map())                    // point id -> {kind:'ins'|'up'|'del', row}
  const pendingProject = useRef(null)
  const inflight = useRef(false)
  const retryT = useRef(null)
  const channel = useRef(null)
  const projectRef = useRef(null)
  const memberRef = useRef(memberId)
  useEffect(() => { memberRef.current = memberId }, [memberId])

  const frame = () => frameRef.current?.contentWindow?.scanMarker
  const flushRef = useRef(() => {})

  // ── layout: fill the screen below the app bar ──
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

  // ── team names for "marked by" ──
  useEffect(() => {
    supabase.from('team_members').select('id, full_name, short_name').then(({ data }) => {
      members.current = Object.fromEntries((data || []).map(m => [m.id, who(m)]))
      frame()?.setMembers(members.current)
    })
  }, [])

  // ── writing changes ──
  const savePending = useCallback(() => {
    const p = projectRef.current
    if (p) writeJSON(pendKey(p.id), pending.current.size || pendingProject.current
      ? { points: [...pending.current], project: pendingProject.current } : null)
    setSync(s => ({ ...s, waiting: pending.current.size + (pendingProject.current ? 1 : 0) }))
  }, [])

  const flush = useCallback(async () => {
    const proj = projectRef.current
    if (!proj || inflight.current) return
    if (!pending.current.size && !pendingProject.current) { setSync({ state: 'saved', waiting: 0 }); return }
    inflight.current = true
    clearTimeout(retryT.current)
    setSync(s => ({ ...s, state: 'saving' }))
    const batch = [...pending.current]
    const projPatch = pendingProject.current
    pending.current.clear(); pendingProject.current = null
    const me = memberRef.current, now = new Date().toISOString()
    const ins = batch.filter(([, o]) => o.kind === 'ins').map(([, o]) => ({ ...o.row, project_id: proj.id, created_by: me, updated_by: me, session_id: SESSION }))
    const ups = batch.filter(([, o]) => o.kind === 'up').map(([, o]) => ({ ...o.row, project_id: proj.id, updated_by: me, session_id: SESSION, updated_at: now }))
    const dels = batch.filter(([, o]) => o.kind === 'del').map(([id]) => id)
    const failed = []
    const reject = (row, wasInsert) => frame()?.reject({ id: row.id, code: 'duplicate', wasInsert })
    const isDup = e => e?.code === '23505'

    async function write(rows, kind) {
      if (!rows.length) return
      const q = kind === 'ins' ? supabase.from('scan_points').insert(rows) : supabase.from('scan_points').upsert(rows, { onConflict: 'id' })
      const { error } = await q
      if (!error) return
      if (!isDup(error)) { rows.forEach(r => failed.push([r.id, { kind, row: strip(r) }])); throw error }
      for (const r of rows) {     // one point clashed on its number: find which, keep the rest
        const { error: e1 } = kind === 'ins' ? await supabase.from('scan_points').insert(r) : await supabase.from('scan_points').upsert(r, { onConflict: 'id' })
        if (isDup(e1)) reject(r, kind === 'ins')
        else if (e1) failed.push([r.id, { kind, row: strip(r) }])
      }
    }
    let err = null
    try { await write(ins, 'ins') } catch (e) { err = e }
    try { await write(ups, 'up') } catch (e) { err = e }
    if (dels.length) {
      const { error } = await supabase.from('scan_points').delete().in('id', dels)
      if (error) { err = error; dels.forEach(id => failed.push([id, { kind: 'del' }])) }
    }
    const projUpdate = { updated_by: me, updated_at: now, ...(projPatch || {}) }
    const { error: pe } = await supabase.from('scan_projects').update(projUpdate).eq('id', proj.id)
    if (pe && projPatch) { err = pe; pendingProject.current = { ...projPatch, ...(pendingProject.current || {}) } }

    // anything that failed goes back in, unless a newer change for the same point arrived meanwhile
    for (const [id, o] of failed) if (!pending.current.has(id)) pending.current.set(id, o)
    inflight.current = false
    savePending()
    if (err) {
      setSync({ state: 'offline', waiting: pending.current.size + (pendingProject.current ? 1 : 0) })
      retryT.current = setTimeout(() => flushRef.current(), 5000)
    } else if (pending.current.size || pendingProject.current) flushRef.current()
    else setSync({ state: 'saved', waiting: 0 })
  }, [savePending])
  useEffect(() => { flushRef.current = flush }, [flush])

  // came back after a drop: catch up on what we missed while away
  const resync = useCallback(async proj => {
    try {
      const rows = await fetchPoints(proj.id)
      const f = frameRef.current?.contentWindow?.scanMarker
      if (!f || projectRef.current?.id !== proj.id) return
      const server = new Set(rows.map(r => r.id))
      const deletes = f.snapshotIds().filter(id => !server.has(id) && !pending.current.has(id))
      f.applyRemote({ upserts: rows.filter(r => !pending.current.has(r.id)), deletes })
    } catch { /* the next reconnect tries again */ }
  }, [])

  const enqueue = useCallback(msg => {
    for (const r of msg.inserts || []) pending.current.set(r.id, { kind: 'ins', row: r })
    for (const r of msg.updates || []) {
      const cur = pending.current.get(r.id)
      pending.current.set(r.id, { kind: cur?.kind === 'ins' ? 'ins' : 'up', row: r })
    }
    for (const id of msg.deletes || []) pending.current.set(id, { kind: 'del' })
    if (msg.project) pendingProject.current = msg.project
    savePending()
    flush()
  }, [flush, savePending])

  // ── live updates from everyone else ──
  const subscribe = useCallback(proj => {
    if (channel.current) supabase.removeChannel(channel.current)
    let first = true
    const ch = supabase.channel(`scan-points-${proj.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scan_points', filter: `project_id=eq.${proj.id}` },
        ({ new: r }) => { if (r.session_id !== SESSION) frame()?.applyRemote({ upserts: [r] }) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scan_points', filter: `project_id=eq.${proj.id}` },
        ({ new: r }) => { if (r.session_id !== SESSION && !pending.current.has(r.id)) frame()?.applyRemote({ upserts: [r] }) })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'scan_points' },
        ({ old: r }) => { if (r?.id && (!r.project_id || r.project_id === proj.id)) frame()?.applyRemote({ deletes: [r.id] }) })
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSync(s => ({ ...s, state: 'offline' })); return }
        if (first) { first = false; return }
        resync(proj)
        flushRef.current()
      })
    channel.current = ch
  }, [resync])

  // ── open a project ──
  const open = useCallback(async row => {
    const f = frame()
    if (!f) return
    setOpening(true)
    try {
      const [{ data: pdf, error: e1 }, rows] = await Promise.all([
        supabase.storage.from(BUCKET).download(row.pdf_path),
        fetchPoints(row.id),
      ])
      if (e1) throw e1
      // changes made here earlier that never reached the server (no signal, closed tab) go on top
      const saved = readJSON(pendKey(row.id), null)
      const merged = new Map(rows.map(r => [r.id, r]))
      if (saved?.points) for (const [id, o] of saved.points) {
        if (o.kind === 'del') merged.delete(id); else merged.set(id, { ...merged.get(id), ...o.row })
      }
      const ok = await f.loadProject({
        id: row.id, pdf: new Uint8Array(await pdf.arrayBuffer()), pdfName: row.pdf_name, rows: [...merged.values()],
        settings: row.settings, report: row.report, me: memberRef.current, members: members.current,
      })
      if (!ok) throw new Error('the drawing could not be opened')
      projectRef.current = row
      pending.current = new Map(saved?.points || [])
      pendingProject.current = saved?.project || null
      setProject(row)
      writeJSON(LAST_KEY, row.id)
      subscribe(row)
      setListOpen(false)
      flush()
    } catch (err) {
      toast(`Couldn't open "${row.name}": ${err.message}`, { tone: 'err', ms: 7000 })
    } finally { setOpening(false) }
  }, [subscribe, flush])

  // ── messages from the frame ──
  useEffect(() => {
    function onMsg(e) {
      if (e.origin !== location.origin || e.data?.source !== 'scan-marker') return
      if (e.data.type === 'ready') setReady(true)
      if (e.data.type === 'ops') enqueue(e.data)
      if (e.data.type === 'openProjects') setListOpen(true)
      if (e.data.type === 'newProject') setNewOpen(true)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [enqueue])

  // reopen the last project once the frame is ready
  useEffect(() => {
    if (!ready || projectRef.current) return
    const last = readJSON(LAST_KEY, null)
    const find = last ? supabase.from('scan_projects').select(SELECT).eq('id', last).maybeSingle() : Promise.resolve({ data: null })
    find.then(({ data }) => {
      if (data) open(data); else { writeJSON(LAST_KEY, null); setListOpen(true) }
    })
  }, [ready, open])

  useEffect(() => {
    const online = () => flush()
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('online', online)
      clearTimeout(retryT.current)
      if (channel.current) supabase.removeChannel(channel.current)
    }
  }, [flush])

  const status = !project ? 'No project open'
    : opening ? 'Opening…'
    : sync.state === 'offline' ? `No connection · ${sync.waiting} change${sync.waiting === 1 ? '' : 's'} waiting, retrying`
    : sync.state === 'saving' ? 'Saving…'
    : 'Live · all changes saved'
  const tone = sync.state === 'offline' ? '#b45309' : sync.state === 'saving' ? '#64748b' : '#15803d'

  return (
    <div ref={boxRef} style={{ height: height ? `${height}px` : 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div style={S.bar}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          {project && sync.state !== 'offline' && <span style={{ ...S.dot, background: tone }} aria-hidden="true" />}
          <b style={S.name} title={project?.name}>{project ? project.name : 'Scanning Point Marker'}</b>
          <span style={{ fontSize: '12px', color: project ? tone : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status}</span>
        </div>
        <button style={S.btn} onClick={() => setListOpen(true)} disabled={!ready || opening}><FolderOpen size={14} /> Projects</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={() => setNewOpen(true)} disabled={!ready || opening}><FilePlus2 size={14} /> New project</button>
      </div>
      <iframe ref={frameRef} src={SRC} title="Scanning Point Marker"
        style={{ flex: 1, width: '100%', border: 0, display: 'block', background: '#eef1f4' }} />
      {newOpen && <NewProject memberId={memberId} onClose={() => setNewOpen(false)} onCreated={row => { setNewOpen(false); open(row) }} />}
      {listOpen && <ProjectList current={project?.id} busy={opening} onOpen={open} onClose={() => setListOpen(false)}
        onNew={() => { setListOpen(false); setNewOpen(true) }}
        onDeleted={id => { if (projectRef.current?.id === id) { writeJSON(LAST_KEY, null); location.reload() } }} />}
    </div>
  )
}

async function fetchPoints(id) {
  const { data, error } = await supabase.from('scan_points').select('*').eq('project_id', id).order('created_at').range(0, 9999)
  if (error) throw error
  return data
}

function strip(r) {
  const { project_id, created_by, updated_by, session_id, updated_at, ...rest } = r // eslint-disable-line no-unused-vars
  return rest
}

function NewProject({ memberId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    const n = name.trim()
    if (!n) { setError('Type a project name.'); return }
    if (!file) { setError('Choose the drawing PDF.'); return }
    setBusy(true); setError('')
    try {
      const { data: same } = await supabase.from('scan_projects').select('id').ilike('name', n.replace(/[%_\\]/g, '\\$&')).limit(1)
      if (same?.length) { setError('A project with this name already exists. Open it from Projects, or use another name.'); return }
      const id = crypto.randomUUID(), path = `${id}.pdf`
      const { error: e1 } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf' })
      if (e1) throw e1
      const { data: row, error: e2 } = await supabase.from('scan_projects').insert({
        id, name: n, pdf_path: path, pdf_name: file.name, pdf_size: file.size,
        settings: { prefix: 'P', target: 180, msize: 3 }, report: { project: n },
        created_by: memberId, updated_by: memberId,
      }).select(SELECT).single()
      if (e2) { await supabase.storage.from(BUCKET).remove([path]); throw e2 }
      toast(`"${n}" created. Everyone in the team can open it from Projects.`)
      onCreated(row)
    } catch (err) {
      setError(`Couldn't create the project: ${err.message}${/scan_projects|bucket/i.test(err.message) ? ' Run sql/setup-scan-marker.sql in Supabase first.' : ''}`)
    } finally { setBusy(false) }
  }

  return (
    <Modal title="New scanning project" onClose={onClose}>
      <label style={S.label}>
        Project name
        <input autoFocus value={name} onChange={e => { setName(e.target.value); setError('') }} placeholder="Menara ABC L3 drilling" style={S.input} />
      </label>
      <label style={S.label}>
        Drawing (PDF)
        <input type="file" accept="application/pdf,.pdf" onChange={e => { setFile(e.target.files[0] || null); setError('') }} style={{ fontSize: '13px' }} />
      </label>
      <p style={S.note}>Everyone in the team can open this project and mark points at the same time. Changes show on every screen within a few seconds.</p>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {error && <span style={{ color: '#dc2626', fontSize: '13px', marginRight: 'auto' }}>{error}</span>}
        <button style={S.btn} onClick={onClose}>Cancel</button>
        <button style={{ ...S.btn, ...S.primary }} onClick={create} disabled={busy}>{busy ? 'Uploading…' : 'Create project'}</button>
      </div>
    </Modal>
  )
}

function ProjectList({ current, busy, onOpen, onClose, onNew, onDeleted }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from('scan_projects').select(SELECT).order('updated_at', { ascending: false }).then(({ data, error }) => {
      if (error) setError(error.message); else setRows(data)
    })
  }, [])

  function del(row) {
    if (!confirm(`Delete "${row.name}" and all its points for everyone?`)) return
    undoableDelete({
      label: `"${row.name}"`,
      hide: () => setRows(list => list.filter(r => r.id !== row.id)),
      restore: () => setRows(list => [row, ...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at))),
      commit: async () => {
        const { error } = await supabase.from('scan_projects').delete().eq('id', row.id)
        if (error) throw error
        await supabase.storage.from(BUCKET).remove([row.pdf_path])
        onDeleted(row.id)
      },
    })
  }

  const shown = (rows || []).filter(r => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const count = r => r.scan_points?.[0]?.count ?? 0
  return (
    <Modal title="Scanning projects" onClose={onClose} wide>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search project name" style={{ ...S.input, paddingLeft: '30px' }} />
        </div>
        <button style={{ ...S.btn, ...S.primary }} onClick={onNew}><FilePlus2 size={14} /> New</button>
      </div>
      {error && <p style={{ ...S.note, color: '#dc2626' }}>
        Couldn't load projects: {error}{/scan_projects|scan_points/.test(error) ? ' Run sql/setup-scan-marker.sql in Supabase first.' : ''}
      </p>}
      {!rows && !error && <p style={S.note}>Loading…</p>}
      {rows && !shown.length && <p style={S.note}>{rows.length ? 'No project matches.' : 'No projects yet. Start one with New and your drawing PDF.'}</p>}
      <div style={{ display: 'grid', gap: '6px', maxHeight: '60vh', overflowY: 'auto' }}>
        {shown.map(r => (
          <div key={r.id} style={{ ...S.row, ...(r.id === current ? { borderColor: '#2563eb', background: '#eff6ff' } : null) }}>
            <button onClick={() => onOpen(r)} disabled={busy} style={S.rowMain}>
              <b style={{ fontSize: '14px', color: '#0f172a' }}>{r.name}{r.id === current ? ' · open' : ''}</b>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {count(r)} point{count(r) === 1 ? '' : 's'}{r.settings?.target ? ` of ${r.settings.target}` : ''} · {r.pdf_name} · updated {when(r.updated_at)} by {who(r.updater)}
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
      <div role="dialog" aria-modal="true" aria-label={title} style={{ ...S.dlg, maxWidth: wide ? '600px' : '440px' }}>
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
  dot: { width: '8px', height: '8px', borderRadius: '50%', flex: 'none' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '13px', fontWeight: 600, borderRadius: '7px',
    border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' },
  primary: { background: '#2563eb', borderColor: '#2563eb', color: '#fff' },
  scrim: { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,6,23,.45)', display: 'grid', placeItems: 'center', padding: '16px' },
  dlg: { width: '100%', background: '#fff', borderRadius: '12px', padding: '16px', display: 'grid', gap: '12px', boxShadow: '0 20px 50px rgba(0,0,0,.3)' },
  label: { display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155' },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', background: '#fff' },
  note: { margin: 0, fontSize: '12.5px', color: '#64748b' },
  row: { display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', paddingRight: '4px' },
  rowMain: { flex: 1, minWidth: 0, display: 'grid', gap: '2px', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 0, cursor: 'pointer' },
  icon: { display: 'inline-flex', padding: '6px', background: 'transparent', border: 0, color: '#64748b', cursor: 'pointer', borderRadius: '6px' },
}
