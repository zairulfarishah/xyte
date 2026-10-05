import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, createDetachedClient } from '../supabase'
import { Bell, CalendarDays, Camera, ChevronLeft, ChevronRight, Info, Pencil, Plus, Trash2, UserPlus, Users, X } from 'lucide-react'
import { ROLE_MULTIPLIERS, WEEKLY_CAPACITY_DAYS } from '../utils/workload'
import { useAuth } from '../context/AuthContext'
import {
  LEAVE_SESSIONS, LEAVE_TYPES, OFF_DAY_TYPE, fetchTeamLeaves, getLeaveSessionLabel, isOffDay, leaveAbbr, saveTeamLeaves,
} from '../utils/teamLeaves'
import { publicHolidayName } from '../utils/holidays'
import { memberDatesOnSite } from '../utils/siteDays'
import { formatPhoneDisplay, isValidPhone, normalizePhone } from '../utils/whatsapp'
import NotificationSettings from '../components/NotificationSettings'
import './Settings.css'

const TABS = [
  { key: 'members',       label: 'Members',       icon: Users },
  { key: 'leave',         label: 'Team Leave',    icon: CalendarDays },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'about',         label: 'About',         icon: Info },
]

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626', '#0891b2']

// Must match the member_role_enum labels in Postgres exactly
const MEMBER_ROLES = ['GPR Engineer', 'Team Leader', 'Intern']
const ROLE_TONES = {
  'Team Leader':  { bg: '#eff6ff', text: '#1d4ed8' },
  Intern:         { bg: '#fffbeb', text: '#b45309' },
  'GPR Engineer': { bg: '#f5f3ff', text: '#6d28d9' },
}

const LEAVE_COLORS = {
  'ANNUAL LEAVE':          '#2563eb',
  'EMERGENCY LEAVE':       '#dc2626',
  'HOSPITALIZATION LEAVE': '#9333ea',
  'MARRIAGE LEAVE':        '#db2777',
  MEDICAL:                 '#d97706',
  'PARENTAL LEAVE':        '#0891b2',
  UNPAID:                  '#475569',
  [OFF_DAY_TYPE]:          '#94a3b8',
}
const leaveColor = type => LEAVE_COLORS[type] || '#64748b'
const REAL_LEAVE_TYPES = LEAVE_TYPES.filter(t => t !== OFF_DAY_TYPE)

const EMPTY_MEMBER = { full_name: '', short_name: '', role: 'GPR Engineer', email: '', phone: '', password: '' }

// ── dates ──
const isoOf = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d) }
const fmt = (s, opts = { day: 'numeric', month: 'short' }) => new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', opts)
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
const endOf = l => l.end_date || l.start_date
const rangeLabel = l => l.start_date === endOf(l)
  ? fmt(l.start_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  : `${fmt(l.start_date)} – ${fmt(endOf(l), { day: 'numeric', month: 'short', year: 'numeric' })}`

// Working days a leave uses: Sundays and public holidays don't count, half-day sessions count 0.5.
function leaveDays(leave, from = null, to = null) {
  let days = 0
  for (let d = leave.start_date; d && d <= endOf(leave); d = addDays(d, 1)) {
    if ((from && d < from) || (to && d > to)) continue
    if (new Date(`${d}T00:00:00`).getDay() === 0 || publicHolidayName(d)) continue
    days += leave.leave_session === 'FULL_DAY' ? 1 : 0.5
  }
  return days
}
const daysText = n => `${n} day${n === 1 ? '' : 's'}`

function Avatar({ m, size = 40, onUpload = null, uploading = false }) {
  const initials = (m?.full_name || '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div
      className={`st-av${onUpload ? ' can-upload' : ''}`}
      onClick={onUpload && !uploading ? onUpload : undefined}
      title={onUpload ? 'Change photo' : undefined}
      style={{ width: size, height: size, fontSize: size * 0.36, background: m?.color || '#64748b' }}
    >
      {m?.avatar_url ? <img src={m.avatar_url} alt="" /> : initials}
      {onUpload && (
        <div className={`cam${uploading ? ' busy' : ''}`}>
          {uploading
            ? <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            : <Camera size={Math.max(size * 0.36, 12)} color="white" />}
        </div>
      )}
    </div>
  )
}

function Drawer({ title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <>
    <div className="st-drawer-bg" onClick={onClose} />
    <aside className="st-drawer" role="dialog" aria-label={title}>
      <div className="st-drawer-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button className="st-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="st-drawer-body">{children}</div>
      {footer && <div className="st-drawer-foot">{footer}</div>}
    </aside>
  </>
}

export default function SettingsPage() {
  const { isZairul } = useAuth()
  const [tab, setTab] = useState('members')
  const [rawMembers, setRawMembers] = useState([])
  const [sites, setSites] = useState([])
  const [docCount, setDocCount] = useState(0)
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    const [{ data: m }, { data: s }, { count }, leaveData] = await Promise.all([
      supabase.from('team_members').select('*').order('created_at'),
      supabase.from('sites').select('id, site_name, site_status, report_status, scheduled_date, end_date, site_assignments(member_id, work_date, assignment_role)'),
      supabase.from('library_documents').select('id', { count: 'exact', head: true }),
      fetchTeamLeaves().catch(() => []),
    ])
    setRawMembers(m || [])
    setSites(s || [])
    setDocCount(count || 0)
    setLeaves(leaveData || [])
    setLoading(false)
  }

  useEffect(() => { if (isZairul) fetchAll() }, [isZairul])

  const members = useMemo(
    () => rawMembers.map((m, i) => ({ ...m, color: AVATAR_COLORS[i % AVATAR_COLORS.length] })),
    [rawMembers]
  )

  // Team members only get their own notification settings; the rest is admin-only.
  if (!isZairul) return (
    <div className="st">
      <header className="st-hero"><div className="st-top"><div><h1>Settings</h1><p>Choose which notifications you receive</p></div></div></header>
      <div className="st-wrap"><div className="st-narrow" style={{ marginTop: 22 }}><NotificationSettings /></div></div>
    </div>
  )

  return (
    <div className="st">
      <header className="st-hero">
        <div className="st-top">
          <div><h1>Settings</h1><p>Team, leave and notifications</p></div>
          <div className="st-tabs" role="tablist">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="st-wrap">
        {loading && tab !== 'notifications' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 14, fontWeight: 600, padding: '40px 0', justifyContent: 'center' }}>
            <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" /> Loading…
          </div>
        ) : <>
          {tab === 'members' && <MembersTab members={members} setRawMembers={setRawMembers} />}
          {tab === 'leave' && <LeaveTab members={members} sites={sites} leaves={leaves} setLeaves={setLeaves} />}
          {tab === 'notifications' && <><div className="st-bar"><div><h2>Notifications</h2><p>What you get alerted about on this account</p></div></div><div className="st-narrow"><NotificationSettings /></div></>}
          {tab === 'about' && <AboutTab sites={sites} docCount={docCount} />}
        </>}
      </div>
    </div>
  )
}

// ════════════════════════ Members ════════════════════════
function MembersTab({ members, setRawMembers }) {
  const [editing, setEditing] = useState(null) // member, or 'new'
  const [notice, setNotice] = useState(null)   // { tone, text }
  const [uploading, setUploading] = useState(null)
  const photoInput = useRef(null)
  const photoFor = useRef(null)

  function pickPhoto(id) { photoFor.current = id; photoInput.current?.click() }

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    const memberId = photoFor.current
    e.target.value = ''
    if (!file || !memberId) return
    if (!file.type.startsWith('image/')) { setNotice({ tone: 'err', text: 'Please choose an image file.' }); return }
    setUploading(memberId)
    try {
      // Unique filename per upload avoids the CDN serving the cached old photo
      const fileName = `${memberId}_${Date.now()}.${file.name.split('.').pop()}`
      const { error: upErr } = await supabase.storage.from('team-avatars').upload(fileName, file)
      if (upErr) throw new Error(upErr.message)
      const avatarUrl = supabase.storage.from('team-avatars').getPublicUrl(fileName).data?.publicUrl
      const { error } = await supabase.from('team_members').update({ avatar_url: avatarUrl }).eq('id', memberId)
      if (error) throw new Error(error.message)
      setRawMembers(prev => prev.map(m => m.id === memberId ? { ...m, avatar_url: avatarUrl } : m))
    } catch (err) {
      setNotice({ tone: 'err', text: `Photo upload failed: ${err.message}` })
    } finally {
      setUploading(null)
    }
  }

  return <>
    <div className="st-bar">
      <div><h2>Team members</h2><p>{members.length} people · tap a photo to change it · a phone number enables WhatsApp buttons</p></div>
      <button className="st-btn" onClick={() => setEditing('new')}><UserPlus size={15} />Add member</button>
    </div>
    {notice && <div className={`st-notice ${notice.tone}`}><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={14} /></button></div>}
    <input ref={photoInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />

    <div className="st-members">
      {members.map(m => {
        const tone = ROLE_TONES[m.role] || ROLE_TONES['GPR Engineer']
        return (
          <div key={m.id} className="st-card st-mc">
            <div className="st-mc-top">
              <Avatar m={m} size={56} onUpload={() => pickPhoto(m.id)} uploading={uploading === m.id} />
              <div style={{ minWidth: 0 }}>
                <b>{m.full_name}</b>
                <span className="st-chip" style={{ background: tone.bg, color: tone.text, marginTop: 5 }}>{m.role}</span>
              </div>
            </div>
            <dl className="st-kv">
              <dt>Short name</dt><dd>{m.short_name}</dd>
              <dt>Phone</dt><dd className={m.phone ? '' : 'none'}>{m.phone ? formatPhoneDisplay(m.phone) : 'Not set'}</dd>
              <dt>Email</dt><dd className={m.email ? '' : 'none'} title={m.email || ''}>{m.email || 'No login'}</dd>
            </dl>
            <div className="st-mc-actions">
              <button className="st-btn ghost sm" onClick={() => setEditing(m)}><Pencil size={13} />Edit details</button>
            </div>
          </div>
        )
      })}
    </div>

    {editing && (
      <MemberDrawer
        member={editing === 'new' ? null : editing}
        members={members}
        onClose={() => setEditing(null)}
        onSaved={(row, msg) => {
          setRawMembers(prev => prev.some(m => m.id === row.id) ? prev.map(m => m.id === row.id ? row : m) : [...prev, row])
          setNotice(msg)
          setEditing(null)
        }}
        onRemoved={(id, name) => {
          setRawMembers(prev => prev.filter(m => m.id !== id))
          setNotice({ tone: 'ok', text: `${name} was removed from the team.` })
          setEditing(null)
        }}
      />
    )}
  </>
}

function MemberDrawer({ member, members, onClose, onSaved, onRemoved }) {
  const isNew = !member
  const [form, setForm] = useState(() => isNew ? EMPTY_MEMBER : {
    full_name: member.full_name || '', short_name: member.short_name || '', role: member.role || 'GPR Engineer',
    email: member.email || '', phone: member.phone ? formatPhoneDisplay(member.phone) : '', password: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  async function save() {
    const fullName = form.full_name.trim()
    const email = form.email.trim().toLowerCase()
    const phone = form.phone.trim()
    if (!fullName) return setError('Full name is required.')
    if (members.some(m => m.id !== member?.id && m.full_name?.trim().toLowerCase() === fullName.toLowerCase())) return setError(`${fullName} is already on the team.`)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address, or leave it blank.')
    if (phone && !isValidPhone(phone)) return setError('Enter a valid phone number, e.g. 012-345 6789.')
    if (isNew && form.password && !email) return setError('An email is needed to create a login — add one, or leave the password blank.')
    if (isNew && form.password && form.password.length < 6) return setError('Password must be at least 6 characters.')

    const row = {
      full_name: fullName,
      short_name: form.short_name.trim() || fullName.split(' ')[0],
      role: form.role,
      email: email || null,
      phone: phone ? normalizePhone(phone) : null,
    }
    setError('')
    setSaving(true)
    const query = isNew
      ? supabase.from('team_members').insert(row).select().single()
      : supabase.from('team_members').update(row).eq('id', member.id).select().single()
    const { data, error: dbError } = await query
    if (dbError) { setSaving(false); return setError(dbError.message) }

    const msg = isNew
      ? (form.password ? await createLogin(email, form.password, fullName) : { tone: 'ok', text: `${fullName} was added to the team.` })
      : { tone: 'ok', text: `${fullName}'s details were saved.` }
    setSaving(false)
    onSaved(data, msg)
  }

  async function remove() {
    const { count, error: countError } = await supabase.from('site_assignments').select('id', { count: 'exact', head: true }).eq('member_id', member.id)
    if (countError) return setError(countError.message)
    const warning = count > 0 ? ` They are assigned to ${count} site day${count > 1 ? 's' : ''} — those assignments will be removed too.` : ''
    if (!confirm(`Remove ${member.full_name} from the team?${warning}`)) return
    setSaving(true)
    if (count > 0) {
      const { error: e1 } = await supabase.from('site_assignments').delete().eq('member_id', member.id)
      if (e1) { setSaving(false); return setError(e1.message) }
    }
    const { error: e2 } = await supabase.from('team_members').delete().eq('id', member.id)
    setSaving(false)
    if (e2) return setError(e2.message)
    onRemoved(member.id, member.full_name)
  }

  const emailChanged = !isNew && (member.email || '') !== form.email.trim().toLowerCase()

  return (
    <Drawer
      title={isNew ? 'Add member' : member.full_name}
      subtitle={isNew ? 'Interns can be added too — pick Intern as the role.' : member.role}
      onClose={onClose}
      footer={<>
        {!isNew && <button className="st-btn danger" onClick={remove} disabled={saving}><Trash2 size={14} />Remove</button>}
        <span className="grow" />
        <button className="st-btn ghost" onClick={onClose}>Cancel</button>
        <button className="st-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add member' : 'Save'}</button>
      </>}
    >
      {error && <div className="st-notice err" style={{ margin: 0 }}><span>{error}</span></div>}
      <div className="st-field"><label>Full name *</label><input className="st-input" value={form.full_name} onChange={set('full_name')} placeholder="e.g. Ahmad Zaki" autoFocus={isNew} /></div>
      <div className="st-grid2">
        <div className="st-field"><label>Short name</label><input className="st-input" value={form.short_name} onChange={set('short_name')} placeholder="First name" /><div className="hint">Shown on Calendar, Team and WhatsApp</div></div>
        <div className="st-field"><label>Role</label>
          <select className="st-input" value={form.role} onChange={set('role')}>{MEMBER_ROLES.map(r => <option key={r}>{r}</option>)}</select>
        </div>
      </div>
      <div className="st-field"><label>Phone</label><input className="st-input" value={form.phone} onChange={set('phone')} placeholder="012-345 6789" inputMode="tel" /></div>
      <div className="st-field">
        <label>Email</label>
        <input className="st-input" type="email" value={form.email} onChange={set('email')} placeholder="name@xradar.asia" />
        <div className="hint" style={emailChanged ? { color: '#b45309' } : undefined}>
          {emailChanged ? 'They sign in with their email — changing it means their current login stops matching this profile.' : 'Used to sign in — leave blank if they don’t need a login.'}
        </div>
      </div>
      {isNew && (
        <div className="st-field"><label>Login password</label><input className="st-input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} placeholder="Min. 6 characters — leave blank to skip" /></div>
      )}
    </Drawer>
  )
}

// Login accounts match team members by email (see AuthContext).
async function createLogin(email, password, fullName) {
  const { data, error } = await createDetachedClient().auth.signUp({ email, password, options: { data: { full_name: fullName } } })
  if (error) return { tone: 'warn', text: `${fullName} was added, but the login could not be created: ${error.message}` }
  // Supabase hides "already registered" behind a user with no identities.
  if (data.user && data.user.identities?.length === 0) return { tone: 'warn', text: `${fullName} was added. ${email} already has a login, so they can sign in with their existing password.` }
  if (!data.session) return { tone: 'warn', text: `${fullName} was added and a login was created, but they must click the confirmation email sent to ${email} before signing in.` }
  return { tone: 'ok', text: `${fullName} was added. They can sign in now with ${email} and the password you set.` }
}

// ════════════════════════ Team leave ════════════════════════
function LeaveTab({ members, sites, leaves, setLeaves }) {
  const today = isoOf(new Date())
  const [month, setMonth] = useState(today.slice(0, 7))
  const [draft, setDraft] = useState(null) // leave being added/edited
  const [filter, setFilter] = useState('upcoming')
  const [who, setWho] = useState('')
  const [showOff, setShowOff] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const year = today.slice(0, 4)

  const realLeaves = leaves.filter(l => !isOffDay(l))
  const onLeaveToday = realLeaves.filter(l => l.start_date <= today && endOf(l) >= today)
  const in14 = addDays(today, 14)
  const upcoming14 = realLeaves.filter(l => l.start_date > today && l.start_date <= in14)
  const daysThisYear = realLeaves.reduce((sum, l) => sum + leaveDays(l, `${year}-01-01`, `${year}-12-31`), 0)

  const openNew = (memberId = '', date = today) =>
    setDraft({ id: null, member_id: memberId, leave_type: REAL_LEAVE_TYPES[0], leave_session: 'FULL_DAY', start_date: date, end_date: date, note: '' })
  const openEdit = leave => setDraft({ ...leave, end_date: endOf(leave), leave_session: leave.leave_session || 'FULL_DAY', note: leave.note || '' })

  async function persist(next) {
    setSaving(true)
    setError('')
    try {
      await saveTeamLeaves(next)
      setLeaves(next)
      setDraft(null)
      window.dispatchEvent(new CustomEvent('xyte:leaves-updated'))
    } catch (err) {
      setError(err.message || 'Unable to save leave.')
    } finally {
      setSaving(false)
    }
  }

  function saveDraft() {
    const d = draft
    if (!d.member_id) return setError('Pick who is on leave.')
    if (!d.start_date) return setError('Pick a start date.')
    const end = d.end_date || d.start_date
    if (end < d.start_date) return setError('End date cannot be before the start date.')
    const row = {
      id: d.id || `${d.member_id}-${d.start_date}-${Date.now()}`,
      member_id: d.member_id, leave_type: d.leave_type, leave_session: d.leave_session,
      start_date: d.start_date, end_date: end, note: d.note.trim(),
      created_at: d.created_at || new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    // Rostered off days don't block real leave
    const clash = leaves.find(l => l.id !== row.id && l.member_id === row.member_id && !isOffDay(l) && !isOffDay(row) &&
      !(row.end_date < l.start_date || row.start_date > endOf(l)))
    if (clash) return setError(`${memberById[row.member_id]?.short_name || 'They'} already has ${titleCase(clash.leave_type)} on ${rangeLabel(clash)}.`)
    persist(d.id ? leaves.map(l => l.id === d.id ? row : l) : [...leaves, row])
  }

  function deleteDraft() {
    if (!confirm('Delete this leave record?')) return
    persist(leaves.filter(l => l.id !== draft.id))
  }

  // ── list ──
  const listed = leaves
    .filter(l => showOff || !isOffDay(l))
    .filter(l => !who || l.member_id === who)
    .filter(l => filter === 'all' || (filter === 'upcoming' ? endOf(l) >= today : endOf(l) < today))
    .sort((a, b) => filter === 'upcoming' ? a.start_date.localeCompare(b.start_date) : b.start_date.localeCompare(a.start_date))
  const groups = []
  listed.forEach(l => {
    const key = l.start_date.slice(0, 7)
    if (groups[groups.length - 1]?.key !== key) groups.push({ key, items: [] })
    groups[groups.length - 1].items.push(l)
  })

  // ── per-member totals this year ──
  const totalCols = [['ANNUAL LEAVE', 'Annual'], ['MEDICAL', 'Medical'], ['EMERGENCY LEAVE', 'Emerg.']]
  const totals = members.map(m => {
    const mine = realLeaves.filter(l => l.member_id === m.id)
    const by = type => mine.filter(l => l.leave_type === type).reduce((s, l) => s + leaveDays(l, `${year}-01-01`, `${year}-12-31`), 0)
    const all = mine.reduce((s, l) => s + leaveDays(l, `${year}-01-01`, `${year}-12-31`), 0)
    return { m, cols: totalCols.map(([t]) => by(t)), other: all - totalCols.reduce((s, [t]) => s + by(t), 0), all }
  })

  return <>
    <div className="st-bar">
      <div><h2>Team leave</h2><p>Leave blocks people from being assigned to sites on those days</p></div>
      <button className="st-btn" onClick={() => openNew()}><Plus size={15} />Add leave</button>
    </div>
    {error && !draft && <div className="st-notice err"><span>{error}</span><button onClick={() => setError('')}><X size={14} /></button></div>}

    <div className="st-leave-top">
      <div className="st-card st-stat">
        <div className="eyebrow">On leave today</div>
        <div className="big">{onLeaveToday.length || 'Nobody'}</div>
        <div className="people">
          {onLeaveToday.map(l => { const m = memberById[l.member_id]; return m && (
            <span key={l.id} className="st-chip" style={{ background: `${leaveColor(l.leave_type)}18`, color: leaveColor(l.leave_type), cursor: 'pointer' }} onClick={() => openEdit(l)}>
              {m.short_name} · {leaveAbbr(l.leave_type)}
            </span>) })}
        </div>
      </div>
      <div className="st-card st-stat">
        <div className="eyebrow">Next 14 days</div>
        <div className="big">{upcoming14.length} <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>starting</span></div>
        <div className="people">
          {upcoming14.slice(0, 6).map(l => { const m = memberById[l.member_id]; return m && (
            <span key={l.id} className="st-chip" style={{ background: '#f1f5f9', color: 'var(--ink-2)', cursor: 'pointer' }} onClick={() => openEdit(l)}>{m.short_name} · {fmt(l.start_date)}</span>) })}
        </div>
      </div>
      <div className="st-card st-stat">
        <div className="eyebrow">Leave taken in {year}</div>
        <div className="big">{daysThisYear} <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>working days</span></div>
        <div className="people" style={{ fontSize: 12, color: 'var(--muted)' }}>Sundays and public holidays aren’t counted</div>
      </div>
    </div>

    <Planner month={month} setMonth={setMonth} today={today} members={members} leaves={leaves} onAdd={openNew} onEdit={openEdit} />

    <div className="st-leave-cols">
      <div className="st-card">
        <div className="st-list-head">
          <div className="st-seg">
            {[['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']].map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="st-input" style={{ width: 'auto', padding: '7px 10px', fontSize: 13 }} value={who} onChange={e => setWho(e.target.value)}>
              <option value="">Everyone</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.short_name || m.full_name}</option>)}
            </select>
            <label className="st-toggle"><input type="checkbox" checked={showOff} onChange={e => setShowOff(e.target.checked)} />Show off days</label>
          </div>
        </div>
        {groups.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>{filter === 'upcoming' ? 'No upcoming leave.' : 'No leave records.'}</div>}
        {groups.map(g => (
          <div key={g.key}>
            <div className="st-month">{fmt(`${g.key}-01`, { month: 'long', year: 'numeric' })}</div>
            {g.items.map(l => {
              const m = memberById[l.member_id]
              const c = leaveColor(l.leave_type)
              const n = leaveDays(l)
              return (
                <div key={l.id} className={`st-lr${endOf(l) < today ? ' past' : ''}`} onClick={() => openEdit(l)}>
                  <Avatar m={m} size={38} />
                  <div className="main">
                    <b>{m?.full_name || 'Unknown member'}</b>
                    <div className="meta">
                      <span className="st-chip" style={{ background: `${c}18`, color: c }}>{titleCase(l.leave_type)}</span>
                      <span>{rangeLabel(l)}</span>
                      {l.leave_session !== 'FULL_DAY' && <span>· {getLeaveSessionLabel(l.leave_session)}</span>}
                    </div>
                    {l.note && <div className="note">{l.note}</div>}
                  </div>
                  <div className="days"><b>{n}</b><small>day{n === 1 ? '' : 's'}</small></div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="st-card st-pad st-totals">
        <h3>Days taken · {year}</h3>
        <div className="sub" style={{ marginBottom: 10 }}>Working days per person, by leave type</div>
        <table>
          <thead><tr><th>Member</th>{totalCols.map(([t, l]) => <th key={l} title={titleCase(t)}>{l}</th>)}<th>Other</th><th>Total</th></tr></thead>
          <tbody>
            {totals.map(({ m, cols, other, all }) => (
              <tr key={m.id}>
                <td><div className="who"><Avatar m={m} size={24} />{m.short_name}</div></td>
                {cols.map((v, i) => <td key={i} className={v ? '' : 'zero'}>{v || '–'}</td>)}
                <td className={other ? '' : 'zero'}>{other || '–'}</td>
                <td><b>{all || <span className="zero">–</span>}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {draft && (
      <LeaveDrawer
        draft={draft}
        setDraft={setDraft}
        members={members}
        memberById={memberById}
        sites={sites}
        saving={saving}
        error={error}
        onClose={() => { setDraft(null); setError('') }}
        onSave={saveDraft}
        onDelete={deleteDraft}
      />
    )}
  </>
}

// Month grid: one row per member, one column per day. Click an empty day to add, a block to edit.
function Planner({ month, setMonth, today, members, leaves, onAdd, onEdit }) {
  const first = `${month}-01`
  const daysIn = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const days = Array.from({ length: daysIn }, (_, i) => addDays(first, i))
  const shift = n => { const d = new Date(`${first}T00:00:00`); d.setMonth(d.getMonth() + n); setMonth(isoOf(d).slice(0, 7)) }
  const leaveOn = (memberId, d) => leaves.find(l => l.member_id === memberId && l.start_date <= d && endOf(l) >= d && !isOffDay(l))
    || leaves.find(l => l.member_id === memberId && l.start_date <= d && endOf(l) >= d)
  const usedTypes = [...new Set(leaves.filter(l => l.start_date <= days[days.length - 1] && endOf(l) >= first).map(l => l.leave_type))]

  return (
    <div className="st-card">
      <div className="st-list-head">
        <div><h3>{fmt(first, { month: 'long', year: 'numeric' })}</h3><div className="sub">Tap an empty day to add leave · tap a block to edit</div></div>
        <div className="st-seg">
          <button onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={15} /></button>
          <button className={month === today.slice(0, 7) ? 'on' : ''} onClick={() => setMonth(today.slice(0, 7))}>This month</button>
          <button onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={15} /></button>
        </div>
      </div>
      <div className="st-planner">
        <table>
          <thead><tr>
            <th className="name" />
            {days.map(d => {
              const dow = new Date(`${d}T00:00:00`).getDay()
              const hol = publicHolidayName(d)
              return <th key={d} className={`${dow === 0 ? 'sun' : ''} ${hol ? 'hol' : ''} ${d === today ? 'today' : ''}`} title={hol || undefined}>{'SMTWTFS'[dow]}<b>{Number(d.slice(8))}</b></th>
            })}
          </tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td className="name"><div><Avatar m={m} size={24} />{m.short_name || m.full_name}</div></td>
                {days.map(d => {
                  const l = leaveOn(m.id, d)
                  const dow = new Date(`${d}T00:00:00`).getDay()
                  const hol = publicHolidayName(d)
                  return (
                    <td key={d} className={`day ${dow === 0 ? 'sun' : ''} ${hol ? 'hol' : ''} ${d === today ? 'today' : ''}`}
                      onClick={() => l ? onEdit(l) : onAdd(m.id, d)}
                      title={l ? `${m.short_name} · ${titleCase(l.leave_type)}${l.leave_session !== 'FULL_DAY' ? ` (${getLeaveSessionLabel(l.leave_session)})` : ''}${l.note ? ` — ${l.note}` : ''}` : `Add leave for ${m.short_name} on ${fmt(d)}`}>
                      {l && <span className={`blk ${l.leave_session === 'AM_ONLY' ? 'am' : l.leave_session === 'PM_ONLY' ? 'pm' : ''}`} style={{ background: leaveColor(l.leave_type), color: leaveColor(l.leave_type) }}><span style={{ color: '#fff' }}>{leaveAbbr(l.leave_type)}</span></span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="st-legend">
        {(usedTypes.length ? usedTypes : REAL_LEAVE_TYPES.slice(0, 3)).map(t => <span key={t}><i className="st-dot" style={{ background: leaveColor(t) }} />{titleCase(t)} ({leaveAbbr(t)})</span>)}
        <span>Half blocks = AM / PM only</span>
      </div>
    </div>
  )
}

function LeaveDrawer({ draft, setDraft, members, memberById, sites, saving, error, onClose, onSave, onDelete }) {
  const set = patch => setDraft(d => ({ ...d, ...patch }))
  const m = memberById[draft.member_id]
  const end = draft.end_date && draft.end_date >= draft.start_date ? draft.end_date : draft.start_date
  const days = draft.start_date ? leaveDays({ ...draft, end_date: end }) : 0
  const singleDay = draft.start_date === end
  const types = isOffDay(draft) ? LEAVE_TYPES : REAL_LEAVE_TYPES

  // Sites this person is booked on during the leave
  const clashes = !draft.member_id || !draft.start_date ? [] : sites
    .filter(s => !['cancelled', 'postponed'].includes(String(s.site_status || '').toLowerCase()))
    .map(s => ({ s, dates: memberDatesOnSite(s, draft.member_id).filter(d => d >= draft.start_date && d <= end) }))
    .filter(x => x.dates.length)

  return (
    <Drawer
      title={draft.id ? 'Edit leave' : 'Add leave'}
      subtitle={m ? m.full_name : 'Blocks site assignment on these days'}
      onClose={onClose}
      footer={<>
        {draft.id && <button className="st-btn danger" onClick={onDelete} disabled={saving}><Trash2 size={14} />Delete</button>}
        <span className="grow" />
        <button className="st-btn ghost" onClick={onClose}>Cancel</button>
        <button className="st-btn" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add leave'}</button>
      </>}
    >
      {error && <div className="st-notice err" style={{ margin: 0 }}><span>{error}</span></div>}

      <div className="st-field">
        <label>Who</label>
        <div className="st-who">
          {members.map(x => (
            <button key={x.id} className={draft.member_id === x.id ? 'on' : ''} onClick={() => set({ member_id: x.id })}>
              <Avatar m={x} size={26} />{x.short_name || x.full_name}
            </button>
          ))}
        </div>
      </div>

      <div className="st-field">
        <label>Type</label>
        <div className="st-pills">
          {types.map(t => {
            const on = draft.leave_type === t
            return (
              <button key={t} className={`st-pill${on ? ' on' : ''}`} onClick={() => set({ leave_type: t })}
                style={on ? { background: leaveColor(t), borderColor: leaveColor(t), color: '#fff' } : undefined}>
                <i className="st-dot" style={{ background: on ? '#fff' : leaveColor(t) }} />{titleCase(t)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="st-grid2">
        <div className="st-field"><label>From</label>
          <input className="st-input" type="date" value={draft.start_date} onChange={e => set({ start_date: e.target.value, end_date: !draft.end_date || draft.end_date < e.target.value ? e.target.value : draft.end_date })} />
        </div>
        <div className="st-field"><label>To</label>
          <input className="st-input" type="date" value={end} min={draft.start_date} onChange={e => set({ end_date: e.target.value })} />
        </div>
      </div>

      <div className="st-field">
        <label>Session</label>
        <div className="st-seg" style={{ display: 'inline-flex' }}>
          {LEAVE_SESSIONS.map(s => <button key={s} className={draft.leave_session === s ? 'on' : ''} onClick={() => set({ leave_session: s })}>{getLeaveSessionLabel(s)}</button>)}
        </div>
        {!singleDay && draft.leave_session !== 'FULL_DAY' && <div className="hint">Applies to every day in the range.</div>}
      </div>

      <div className="st-field"><label>Note</label>
        <textarea className="st-input" rows={2} value={draft.note} onChange={e => set({ note: e.target.value })} placeholder="Optional — e.g. balik kampung, clinic visit" style={{ resize: 'vertical' }} />
      </div>

      {draft.start_date && (
        <div className="st-summary">
          <b>{daysText(days)}</b> of {titleCase(draft.leave_type).toLowerCase()} · {singleDay ? fmt(draft.start_date, { weekday: 'long', day: 'numeric', month: 'short' }) : `${fmt(draft.start_date)} – ${fmt(end)}`}
          {clashes.length > 0 && (
            <div className="st-warn-list">
              <b style={{ fontSize: 12 }}>⚠ {m?.short_name || 'They'} {clashes.length === 1 ? 'is' : 'are'} booked on site:</b>
              {clashes.map(({ s, dates }) => <span key={s.id}>{s.site_name} — {dates.map(d => fmt(d)).join(', ')}</span>)}
              <span>Saving still works; reassign the site if needed.</span>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

// ════════════════════════ About ════════════════════════
function AboutTab({ sites, docCount }) {
  const stats = [
    ['Total sites', sites.length],
    ['Completed sites', sites.filter(s => s.site_status === 'completed').length],
    ['Approved reports', sites.filter(s => s.report_status === 'approved').length],
    ['Library documents', docCount],
  ]
  const pct = (mult, days = 1) => `${((days / WEEKLY_CAPACITY_DAYS) * 100 * mult).toFixed(0)}%`
  const weights = [
    ['PIC · site scanning', `${pct(ROLE_MULTIPLIERS.site_scanning.pic)} / day`, 'Includes a small coordination premium'],
    ['Crew · site scanning', `${pct(ROLE_MULTIPLIERS.site_scanning.crew)} / day`, 'Standard on-site scanning'],
    ['Site visit / meeting', `${pct(1)} / day`, 'Uses the entered duration'],
    ['Report preparation', `${pct(1)} / day`, 'Counts once the site is off-site'],
  ]
  return <>
    <div className="st-bar"><div><h2>About Xyte</h2><p>Xradar internal system · version 1.0.0</p></div></div>
    <div className="st-about">
      <div className="st-card st-pad">
        <h3>At a glance</h3>
        <div className="st-stats4">{stats.map(([l, v]) => <div key={l}><b>{v}</b><small>{l}</small></div>)}</div>
      </div>
      <div className="st-card st-pad">
        <h3>Dashboard workload weighting</h3>
        <div className="sub">Share of a {WEEKLY_CAPACITY_DAYS}-day week, used by the Dashboard's workload panel</div>
        <div className="st-rows">{weights.map(([l, v, d]) => <div key={l} className="st-row"><div><b style={{ fontSize: 13 }}>{l}</b><br /><small>{d}</small></div><b>{v}</b></div>)}</div>
      </div>
      <div className="st-card st-pad">
        <h3>Built with</h3>
        <div className="st-rows">
          {[['React + Vite', 'Frontend'], ['Supabase', 'Database, login and storage'], ['Leaflet', 'Maps'], ['Vercel', 'Hosting and push notifications'], ['GitHub', 'Code']].map(([n, r]) => (
            <div key={n} className="st-row"><b style={{ fontSize: 13 }}>{n}</b><small>{r}</small></div>
          ))}
        </div>
      </div>
    </div>
  </>
}
