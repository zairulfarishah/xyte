import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useViewport } from '../utils/useViewport'
import { notify, notifyMany } from '../utils/notify'
import {
  FEED_BUCKET, feedPublicUrl, isImageAttachment, notExpiredFilter, isExpired,
  timeAgo, fmtDateTime, fmtShortDate, expiryFromDate, dateFromExpiry,
} from '../utils/feed'
import {
  Paperclip, Pin, PinOff, Trash2, MessageCircle, Send, X, FileText, Image as ImageIcon,
  Pencil, MapPin, CalendarClock, Search, SmilePlus, ChevronLeft, ChevronRight, ExternalLink, Plus,
} from 'lucide-react'

const MAX_FILE_MB = 20
const PAGE = 20
const EMOJIS = ['👍', '✅', '❤️', '🎉']

const card = { background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 14px rgba(15,23,42,0.05)' }
const btnBase = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', transition: 'filter 0.15s' }
const BTN = {
  blue:  { ...btnBase, background: '#2563eb', color: 'white', border: '1.5px solid #1d4ed8', boxShadow: '0 4px 12px rgba(37,99,235,0.35)' },
  ghost: { ...btnBase, background: 'white', color: '#1e293b', border: '1.5px solid #cbd5e1' },
}
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 8px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '600', fontFamily: 'inherit' }
const smallField = { padding: '7px 10px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '12.5px', fontFamily: 'inherit', color: '#0f172a', background: 'white', outline: 'none' }
const textareaStyle = { width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: '72px', padding: '10px 12px', borderRadius: '12px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', color: '#0f172a', outline: 'none', lineHeight: 1.5 }

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Mentions ────────────────────────────────────────────────
const mentionName = m => m.short_name || m.full_name
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function mentionedIds(text, members) {
  return members
    .filter(m => mentionName(m) && new RegExp(`@${escapeRe(mentionName(m))}(?![\\w])`).test(text))
    .map(m => m.id)
}

function RichText({ text, members }) {
  const names = members.map(mentionName).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!names.length) return text
  const parts = text.split(new RegExp(`(@(?:${names.map(escapeRe).join('|')}))(?![\\w])`, 'g'))
  return parts.map((part, i) => i % 2
    ? <span key={i} style={{ color: '#2563eb', fontWeight: '700', background: '#eff6ff', borderRadius: '4px', padding: '0 3px' }}>{part}</span>
    : part)
}

function MentionInput({ value, onChange, members, multiline, onSubmit, placeholder, style, autoFocus }) {
  const ref = useRef(null)
  const [query, setQuery] = useState(null)
  const [hi, setHi] = useState(0)

  const matches = useMemo(() => {
    if (query === null) return []
    const q = query.toLowerCase()
    return members.filter(m => `${m.full_name} ${m.short_name || ''}`.toLowerCase().includes(q)).slice(0, 6)
  }, [query, members])

  function handleChange(e) {
    const v = e.target.value
    onChange(v)
    const m = v.slice(0, e.target.selectionStart).match(/(^|\s)@([^\s@]*)$/)
    setQuery(m ? m[2] : null)
    setHi(0)
  }

  function pick(member) {
    const el = ref.current
    const caret = el.selectionStart
    const before = value.slice(0, caret).replace(/@([^\s@]*)$/, `@${mentionName(member)} `)
    onChange(before + value.slice(caret))
    setQuery(null)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length) })
  }

  function handleKeyDown(e) {
    if (matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % matches.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(h => (h - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[hi]); return }
      if (e.key === 'Escape')    { setQuery(null); return }
    }
    if (onSubmit && e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit() }
  }

  const Tag = multiline ? 'textarea' : 'input'
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <Tag
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setQuery(null)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        autoFocus={autoFocus}
        style={style}
      />
      {matches.length > 0 && (
        <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', minWidth: '220px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 12px 30px rgba(15,23,42,0.18)', padding: '4px', zIndex: 50 }}>
          {matches.map((m, i) => (
            <button
              key={m.id}
              onMouseDown={e => { e.preventDefault(); pick(m) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: i === hi ? '#eff6ff' : 'transparent', fontFamily: 'inherit', textAlign: 'left' }}
            >
              <Avatar person={m} name={m.full_name} size={24} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{m.full_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Small pieces ────────────────────────────────────────────
function Avatar({ person, name, size = 36 }) {
  const initials = (person?.full_name || name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#1d4ed8', color: 'white', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.32, fontWeight: '700' }}>
      {person?.avatar_url
        ? <img src={person.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials}
    </div>
  )
}

function Chip({ children, color, bg, border, to }) {
  const style = { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color, background: bg, border: `1px solid ${border}`, padding: '3px 8px', borderRadius: '999px', textDecoration: 'none', whiteSpace: 'nowrap' }
  return to ? <Link to={to} style={style}>{children}</Link> : <span style={style}>{children}</span>
}

function PostOptions({ sites, siteId, setSiteId, hideAfter, setHideAfter }) {
  return (
    <>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }} title="Link this post to a site">
        <MapPin size={14} />
        <select value={siteId} onChange={e => setSiteId(e.target.value)} style={{ ...smallField, maxWidth: '190px' }}>
          <option value="">No site</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', fontWeight: '600' }} title="The post hides itself after this date">
        <CalendarClock size={14} /> Hide after
        <input type="date" value={hideAfter} min={dateFromExpiry(new Date().toISOString())} onChange={e => setHideAfter(e.target.value)} style={smallField} />
        {hideAfter && (
          <button onClick={() => setHideAfter('')} title="Clear" style={{ ...iconBtn, padding: '2px' }}><X size={13} /></button>
        )}
      </label>
    </>
  )
}

// ── Composer ────────────────────────────────────────────────
function Composer({ members, sites, onPosted, onClose }) {
  const { memberId, fullName, avatarUrl } = useAuth()
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([])
  const [siteId, setSiteId] = useState('')
  const [hideAfter, setHideAfter] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const previews = useMemo(() => files.map(f => ({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })), [files])
  useEffect(() => () => previews.forEach(p => p.url && URL.revokeObjectURL(p.url)), [previews])

  function addFiles(list) {
    const picked = Array.from(list || [])
    const tooBig = picked.find(f => f.size > MAX_FILE_MB * 1024 * 1024)
    if (tooBig) { setError(`"${tooBig.name}" is larger than ${MAX_FILE_MB} MB.`); return }
    setError(null)
    setFiles(prev => [...prev, ...picked])
  }

  async function handlePost() {
    if (!body.trim() && !files.length) return
    if (!memberId) { setError('Your account is not linked to a team member.'); return }
    setSaving(true); setError(null)

    const attachments = []
    const cleanup = () => attachments.length && supabase.storage.from(FEED_BUCKET).remove(attachments.map(a => a.path))
    for (const file of files) {
      const safe = file.name.replace(/[^\w.-]/g, '_')
      const path = `${memberId}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from(FEED_BUCKET).upload(path, file)
      if (upErr) {
        await cleanup()
        setError(`Upload failed for "${file.name}": ${upErr.message}`)
        setSaving(false)
        return
      }
      attachments.push({ path, name: file.name, type: file.type, size: file.size })
    }

    const text = body.trim()
    const { error: insErr } = await supabase.from('feed_posts').insert({
      author_id: memberId,
      author_name: fullName,
      body: text,
      attachments,
      site_id: siteId || null,
      expires_at: expiryFromDate(hideAfter),
    })
    if (insErr) {
      await cleanup()
      setError(insErr.message)
      setSaving(false)
      return
    }

    // Mentioned people get the mention alert; everyone else gets a "new post" alert.
    const mentioned = mentionedIds(text, members).filter(id => id !== memberId)
    const others = members.map(m => m.id).filter(id => id !== memberId && !mentioned.includes(id))
    const snippet = text.length > 80 ? `${text.slice(0, 80).trimEnd()}…` : text
    await Promise.all([
      mentioned.length && notifyMany(`${fullName} mentioned you in a Feed post`, fullName, mentioned, 'mention'),
      others.length && notifyMany(snippet ? `${fullName} posted in Feed: "${snippet}"` : `${fullName} shared a new Feed post`, fullName, others, 'feed_post'),
    ])

    setBody(''); setFiles([]); setSiteId(''); setHideAfter(''); setSaving(false)
    onPosted()
  }

  const canPost = (body.trim() || files.length) && !saving

  function handleClose() {
    if ((body.trim() || files.length) && !confirm('Discard this post?')) return
    onClose()
  }

  return (
    <div style={{ ...card, padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>New Post</p>
        <button onClick={handleClose} title="Close" style={{ ...iconBtn, padding: '4px' }}><X size={17} /></button>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <Avatar person={{ avatar_url: avatarUrl, full_name: fullName }} name={fullName} />
        <MentionInput
          multiline
          autoFocus
          value={body}
          onChange={setBody}
          members={members}
          onSubmit={() => canPost && handlePost()}
          placeholder="Share an announcement or update… type @ to mention someone"
          style={textareaStyle}
        />
      </div>

      {previews.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', marginLeft: '48px' }}>
          {previews.map(({ file, url }, i) => (
            <div key={i} style={{ position: 'relative', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc' }}>
              {url
                ? <img src={url} alt={file.name} style={{ width: '84px', height: '84px', objectFit: 'cover', display: 'block' }} />
                : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 30px 10px 10px', fontSize: '12px', color: '#334155', maxWidth: '200px' }}>
                    <FileText size={15} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  </div>
                )}
              <button
                onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: '4px', right: '4px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: 'rgba(15,23,42,0.7)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: '#dc2626', fontSize: '12.5px', fontWeight: '600', marginTop: '10px', marginLeft: '48px' }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px', marginLeft: '48px', gap: '10px' }}>
        <input ref={fileRef} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} style={{ ...BTN.ghost, padding: '7px 12px', fontSize: '12.5px' }}>
          <Paperclip size={14} /> Photo / File
        </button>
        <PostOptions sites={sites} siteId={siteId} setSiteId={setSiteId} hideAfter={hideAfter} setHideAfter={setHideAfter} />
        <button onClick={handleClose} disabled={saving} style={{ ...BTN.ghost, marginLeft: 'auto', padding: '7px 14px', fontSize: '12.5px' }}>
          Cancel
        </button>
        <button onClick={handlePost} disabled={!canPost} style={{ ...BTN.blue, padding: '8px 18px', fontSize: '13px', opacity: canPost ? 1 : 0.5, cursor: canPost ? 'pointer' : 'default' }}>
          <Send size={14} /> {saving ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  )
}

// ── Attachments + photo viewer ──────────────────────────────
function Attachments({ items, onOpenImage }) {
  const images = items.filter(isImageAttachment)
  const others = items.filter(a => !isImageAttachment(a))
  if (!items.length) return null
  const shown = images.slice(0, 4)
  const extra = images.length - shown.length

  return (
    <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
      {shown.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: shown.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '6px' }}>
          {shown.map((a, i) => (
            <button
              key={a.path}
              onClick={() => onOpenImage(images, i)}
              style={{ position: 'relative', display: 'block', padding: 0, border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#f1f5f9', cursor: 'zoom-in' }}
            >
              <img src={feedPublicUrl(a.path)} alt={a.name} loading="lazy" style={{ width: '100%', height: shown.length === 1 ? 'auto' : '200px', maxHeight: '420px', objectFit: 'cover', display: 'block' }} />
              {extra > 0 && i === shown.length - 1 && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '800' }}>
                  +{extra}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {others.map(a => (
        <a key={a.path} href={feedPublicUrl(a.path)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', textDecoration: 'none', color: '#0f172a' }}>
          <FileText size={18} color="#2563eb" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: '600', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
          <span style={{ fontSize: '11.5px', color: '#94a3b8', flexShrink: 0 }}>{fmtSize(a.size)}</span>
        </a>
      ))}
    </div>
  )
}

function Lightbox({ images, index, onIndex, onClose }) {
  const touchX = useRef(null)
  const count = images.length
  const current = images[index]

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && count > 1) onIndex((index - 1 + count) % count)
      if (e.key === 'ArrowRight' && count > 1) onIndex((index + 1) % count)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [index, count, onIndex, onClose])

  const navBtn = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchX.current === null || count < 2) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 50) onIndex(dx > 0 ? (index - 1 + count) % count : (index + 1) % count)
        touchX.current = null
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(2,6,23,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', color: 'white' }}>
        <span style={{ fontSize: '13px', fontWeight: '700' }}>{index + 1} / {count}</span>
        <span style={{ fontSize: '12.5px', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{current.name}</span>
        <a href={feedPublicUrl(current.path)} target="_blank" rel="noopener noreferrer" title="Open original" style={{ color: 'white', display: 'flex' }}><ExternalLink size={18} /></a>
        <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', padding: 0 }}><X size={22} /></button>
      </div>

      <img src={feedPublicUrl(current.path)} alt={current.name} style={{ maxWidth: '92vw', maxHeight: '84vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />

      {count > 1 && (
        <>
          <button onClick={() => onIndex((index - 1 + count) % count)} style={{ ...navBtn, left: '16px' }}><ChevronLeft size={24} /></button>
          <button onClick={() => onIndex((index + 1) % count)} style={{ ...navBtn, right: '16px' }}><ChevronRight size={24} /></button>
        </>
      )}
    </div>
  )
}

// ── Reactions ───────────────────────────────────────────────
function Reactions({ reactions, members, onToggle }) {
  const { memberId } = useAuth()
  const [picker, setPicker] = useState(false)
  const ref = useRef(null)
  const nameOf = id => members.find(m => m.id === id)?.full_name || 'Someone'

  useEffect(() => {
    if (!picker) return undefined
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setPicker(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [picker])

  const groups = EMOJIS
    .map(emoji => ({ emoji, rows: reactions.filter(r => r.emoji === emoji) }))
    .filter(g => g.rows.length)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      {groups.map(({ emoji, rows }) => {
        const mine = rows.some(r => r.member_id === memberId)
        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            title={rows.map(r => nameOf(r.member_id)).join(', ')}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 9px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: '700', background: mine ? '#eff6ff' : '#f8fafc', border: `1.5px solid ${mine ? '#93c5fd' : '#e2e8f0'}`, color: mine ? '#1d4ed8' : '#475569' }}
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>{emoji}</span> {rows.length}
          </button>
        )
      })}
      <div ref={ref} style={{ position: 'relative' }}>
        <button onClick={() => setPicker(p => !p)} title="React" style={{ ...iconBtn, padding: '5px 7px' }}>
          <SmilePlus size={16} />
        </button>
        {picker && (
          <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, display: 'flex', gap: '2px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '4px', boxShadow: '0 10px 28px rgba(15,23,42,0.18)', zIndex: 40 }}>
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => { onToggle(emoji); setPicker(false) }}
                style={{ width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '19px', lineHeight: 1 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Comments ────────────────────────────────────────────────
function Comments({ post, comments, members, onChange }) {
  const { memberId, fullName, isZairul } = useAuth()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const body = text.trim()
    if (!body || !memberId || saving) return
    setSaving(true)
    const { error } = await supabase.from('feed_comments').insert({
      post_id: post.id,
      author_id: memberId,
      author_name: fullName,
      body,
    })
    if (error) { setSaving(false); alert(error.message); return }
    const mentioned = mentionedIds(body, members).filter(id => id !== memberId)
    if (mentioned.length) await notifyMany(`${fullName} mentioned you in a Feed comment`, fullName, mentioned, 'mention')
    if (post.author_id && post.author_id !== memberId && !mentioned.includes(post.author_id)) {
      const snippet = body.length > 60 ? `${body.slice(0, 60).trimEnd()}…` : body
      await notify(`${fullName} commented on your Feed post: "${snippet}"`, fullName, post.author_id, 'feed_comment')
    }
    setSaving(false)
    setText('')
    onChange()
  }

  async function handleDelete(c) {
    if (!confirm('Delete this comment?')) return
    const { error } = await supabase.from('feed_comments').delete().eq('id', c.id)
    if (error) { alert(error.message); return }
    onChange()
  }

  return (
    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '10px', paddingTop: '12px', display: 'grid', gap: '10px' }}>
      {comments.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: '10px' }}>
          <Avatar person={c.author} name={c.author_name} size={28} />
          <div style={{ flex: 1, minWidth: 0, background: '#f1f5f9', borderRadius: '12px', padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0f172a' }}>{c.author?.full_name || c.author_name}</span>
              <span title={fmtDateTime(c.created_at)} style={{ fontSize: '11px', color: '#94a3b8' }}>{timeAgo(c.created_at)}</span>
              {(c.author_id === memberId || isZairul) && (
                <button onClick={() => handleDelete(c)} title="Delete comment" style={{ ...iconBtn, padding: '2px', marginLeft: 'auto' }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <p style={{ fontSize: '13px', color: '#334155', marginTop: '2px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
              <RichText text={c.body} members={members} />
            </p>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <MentionInput
          value={text}
          onChange={setText}
          members={members}
          onSubmit={handleAdd}
          placeholder="Write a comment… type @ to mention"
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '999px', border: '1.5px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit', outline: 'none', color: '#0f172a' }}
        />
        <button onClick={handleAdd} disabled={!text.trim() || saving} style={{ ...BTN.blue, width: '36px', height: '36px', borderRadius: '50%', padding: 0, flexShrink: 0, opacity: text.trim() ? 1 : 0.5 }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Post ────────────────────────────────────────────────────
function PostCard({ post, comments, reactions, members, sites, onChange, onToggleReaction, onOpenImage }) {
  const { memberId, fullName, isZairul } = useAuth()
  const [showComments, setShowComments] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ body: '', siteId: '', hideAfter: '' })
  const [saving, setSaving] = useState(false)
  const expired = isExpired(post)

  function startEdit() {
    setDraft({ body: post.body || '', siteId: post.site_id || '', hideAfter: dateFromExpiry(post.expires_at) })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    const body = draft.body.trim()
    const { error } = await supabase.from('feed_posts').update({
      body,
      site_id: draft.siteId || null,
      expires_at: expiryFromDate(draft.hideAfter),
      edited_at: new Date().toISOString(),
    }).eq('id', post.id)
    if (error) { setSaving(false); alert(error.message); return }

    const before = new Set(mentionedIds(post.body || '', members))
    const added = mentionedIds(body, members).filter(id => !before.has(id) && id !== memberId)
    if (added.length) await notifyMany(`${fullName} mentioned you in a Feed post`, fullName, added, 'mention')

    setSaving(false)
    setEditing(false)
    onChange()
  }

  async function togglePin() {
    const { error } = await supabase.from('feed_posts').update({ pinned: !post.pinned }).eq('id', post.id)
    if (error) { alert(error.message); return }
    onChange()
  }

  async function handleDelete() {
    if (!confirm('Delete this post and its comments?')) return
    const paths = (post.attachments || []).map(a => a.path)
    if (paths.length) await supabase.storage.from(FEED_BUCKET).remove(paths)
    const { error } = await supabase.from('feed_posts').delete().eq('id', post.id)
    if (error) { alert(error.message); return }
    onChange()
  }

  return (
    <div style={{ ...card, padding: '16px', borderLeft: post.pinned ? '4px solid #f59e0b' : card.border, opacity: expired ? 0.65 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <Avatar person={post.author} name={post.author_name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{post.author?.full_name || post.author_name}</p>
          <p style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '1px' }}>
            {fmtDateTime(post.created_at)} · {timeAgo(post.created_at)}
            {post.edited_at && <span title={`Edited ${fmtDateTime(post.edited_at)}`}> · edited</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {post.pinned && <Chip color="#b45309" bg="#fef3c7" border="#fcd34d"><Pin size={11} /> Pinned</Chip>}
          {expired
            ? <Chip color="#991b1b" bg="#fee2e2" border="#fca5a5"><CalendarClock size={11} /> Expired</Chip>
            : post.expires_at && <Chip color="#475569" bg="#f1f5f9" border="#e2e8f0"><CalendarClock size={11} /> Until {fmtShortDate(post.expires_at)}</Chip>}
        </div>
      </div>

      {post.site && !editing && (
        <div style={{ marginTop: '10px' }}>
          <Chip to={`/sites/${post.site.id}`} color="#1d4ed8" bg="#eff6ff" border="#bfdbfe"><MapPin size={11} /> {post.site.site_name}</Chip>
        </div>
      )}

      {editing ? (
        <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
          <MentionInput multiline autoFocus value={draft.body} onChange={body => setDraft(d => ({ ...d, body }))} members={members} onSubmit={saveEdit} style={textareaStyle} />
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <PostOptions
              sites={sites}
              siteId={draft.siteId} setSiteId={siteId => setDraft(d => ({ ...d, siteId }))}
              hideAfter={draft.hideAfter} setHideAfter={hideAfter => setDraft(d => ({ ...d, hideAfter }))}
            />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button onClick={() => setEditing(false)} style={{ ...BTN.ghost, padding: '7px 14px', fontSize: '12.5px' }}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{ ...BTN.blue, padding: '7px 16px', fontSize: '12.5px' }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      ) : post.body && (
        <p style={{ fontSize: '14px', color: '#1e293b', marginTop: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
          <RichText text={post.body} members={members} />
        </p>
      )}

      <Attachments items={post.attachments || []} onOpenImage={onOpenImage} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
        <Reactions reactions={reactions} members={members} onToggle={emoji => onToggleReaction(post.id, emoji)} />
        <button onClick={() => setShowComments(s => !s)} style={{ ...iconBtn, color: showComments ? '#2563eb' : '#64748b' }}>
          <MessageCircle size={15} /> {comments.length ? `${comments.length} comment${comments.length !== 1 ? 's' : ''}` : 'Comment'}
        </button>
        {isZairul && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
            <button onClick={startEdit} title="Edit post" style={iconBtn}><Pencil size={15} /></button>
            <button onClick={togglePin} title={post.pinned ? 'Unpin' : 'Pin to top and Dashboard'} style={iconBtn}>
              {post.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
            <button onClick={handleDelete} title="Delete post" style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={15} /></button>
          </div>
        )}
      </div>

      {showComments && <Comments post={post} comments={comments} members={members} onChange={onChange} />}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────
export default function Feed() {
  const { memberId, isZairul } = useAuth()
  const { isMobile } = useViewport()
  const [posts, setPosts] = useState([])
  const [comments, setComments] = useState([])
  const [reactions, setReactions] = useState([])
  const [members, setMembers] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [setupError, setSetupError] = useState(null)
  const [limit, setLimit] = useState(PAGE)
  const [hasMore, setHasMore] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [showExpired, setShowExpired] = useState(false)
  const [viewer, setViewer] = useState(null)
  const [composing, setComposing] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('team_members').select('id, full_name, short_name, avatar_url').order('full_name'),
      supabase.from('sites').select('id, site_name').order('site_name'),
    ]).then(([{ data: m }, { data: s }]) => {
      setMembers(m || [])
      setSites(s || [])
    })
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setLimit(PAGE)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Bumped after any post/comment change to reload the visible page of posts.
  const [refreshKey, setRefreshKey] = useState(0)
  const fetchPosts = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    let cancelled = false
    let query = supabase.from('feed_posts')
      .select('*, author:team_members(id, full_name, avatar_url), site:sites(id, site_name)')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, limit - 1)
    if (!showExpired) query = query.or(notExpiredFilter())
    if (search) query = query.ilike('body', `%${search}%`)

    query.then(async ({ data: p, error }) => {
      const ids = (p || []).map(x => x.id)
      const [{ data: c }, { data: r }] = ids.length
        ? await Promise.all([
            supabase.from('feed_comments').select('*, author:team_members(id, full_name, avatar_url)').in('post_id', ids).order('created_at', { ascending: true }),
            supabase.from('feed_reactions').select('id, post_id, member_id, emoji').in('post_id', ids),
          ])
        : [{ data: [] }, { data: [] }]
      if (cancelled) return
      setSetupError(error ? error.message : null)
      setPosts(p || [])
      setComments(c || [])
      setReactions(r || [])
      setHasMore((p || []).length === limit)
      setLoading(false)
      setLoadingMore(false)
    })
    return () => { cancelled = true }
  }, [limit, search, showExpired, refreshKey])

  async function toggleReaction(postId, emoji) {
    if (!memberId) return
    const existing = reactions.find(r => r.post_id === postId && r.member_id === memberId && r.emoji === emoji)
    if (existing) {
      setReactions(prev => prev.filter(r => r.id !== existing.id))
      const { error } = await supabase.from('feed_reactions').delete().eq('id', existing.id)
      if (error) { alert(error.message); fetchPosts() }
    } else {
      const { data, error } = await supabase.from('feed_reactions')
        .insert({ post_id: postId, member_id: memberId, emoji })
        .select('id, post_id, member_id, emoji')
        .single()
      if (error) { alert(error.message); return }
      setReactions(prev => [...prev, data])
    }
  }

  const byPost = useMemo(() => {
    const group = rows => rows.reduce((map, row) => ((map[row.post_id] ||= []).push(row), map), {})
    return { comments: group(comments), reactions: group(reactions) }
  }, [comments, reactions])

  const openImage = useCallback((images, index) => setViewer({ images, index }), [])
  const closeViewer = useCallback(() => setViewer(null), [])
  const setViewerIndex = useCallback(index => setViewer(v => ({ ...v, index })), [])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 148px,#dde4ed 148px 100%)' }}>
      <div style={{ padding: isMobile ? '18px 14px 0' : '24px 32px 0', maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Feed</h1>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>Announcements and updates from the team</p>
      </div>

      <div style={{ padding: isMobile ? '16px 14px 48px' : '24px 32px 48px', maxWidth: '760px', margin: '0 auto', display: 'grid', gap: '14px' }}>
        {setupError && (
          <div style={{ background: 'white', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444', borderRadius: '14px', padding: '16px 18px' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#991b1b' }}>Feed database needs updating</p>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
              Supabase said: <span style={{ color: '#991b1b', fontWeight: '600' }}>{setupError}</span><br />
              Run <code>sql/setup-feed.sql</code> and then <code>sql/migrate-feed-v2.sql</code> in the Supabase SQL editor, then reload this page.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search posts…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 32px 9px 34px', borderRadius: '999px', border: '1.5px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit', outline: 'none', color: '#0f172a', background: 'white' }}
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} style={{ ...iconBtn, position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', padding: '4px' }}><X size={14} /></button>
            )}
          </div>
          {isZairul && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={showExpired} onChange={e => { setShowExpired(e.target.checked); setLimit(PAGE) }} />
              Show expired
            </label>
          )}
          {!composing && (
            <button onClick={() => setComposing(true)} style={{ ...BTN.blue, padding: '9px 16px', fontSize: '13px' }}>
              <Plus size={15} /> New Post
            </button>
          )}
        </div>

        {composing && (
          <Composer
            members={members}
            sites={sites}
            onPosted={() => { setComposing(false); fetchPosts() }}
            onClose={() => setComposing(false)}
          />
        )}

        {loading ? (
          <p style={{ color: '#64748b', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading feed…</p>
        ) : posts.length === 0 && !setupError ? (
          <div style={{ ...card, padding: '40px 20px', textAlign: 'center' }}>
            <ImageIcon size={28} color="#cbd5e1" style={{ margin: '0 auto' }} />
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#334155', marginTop: '10px' }}>{search ? 'No posts match your search' : 'No posts yet'}</p>
            <p style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '4px' }}>{search ? 'Try a different word.' : 'Be the first to share something with the team.'}</p>
          </div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                comments={byPost.comments[post.id] || []}
                reactions={byPost.reactions[post.id] || []}
                members={members}
                sites={sites}
                onChange={fetchPosts}
                onToggleReaction={toggleReaction}
                onOpenImage={openImage}
              />
            ))}
            {hasMore && (
              <button
                onClick={() => { setLoadingMore(true); setLimit(l => l + PAGE) }}
                disabled={loadingMore}
                style={{ ...BTN.ghost, padding: '10px', fontSize: '13px', justifySelf: 'center', minWidth: '160px' }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>

      {viewer && <Lightbox images={viewer.images} index={viewer.index} onIndex={setViewerIndex} onClose={closeViewer} />}
    </div>
  )
}
