import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useViewport } from '../utils/useViewport'
import { Paperclip, Pin, PinOff, Trash2, MessageCircle, Send, X, FileText, Image as ImageIcon } from 'lucide-react'

const BUCKET = 'feed-media'
const MAX_FILE_MB = 20

const card = { background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 14px rgba(15,23,42,0.05)' }
const btnBase = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', transition: 'filter 0.15s' }
const BTN = {
  blue:  { ...btnBase, background: '#2563eb', color: 'white', border: '1.5px solid #1d4ed8', boxShadow: '0 4px 12px rgba(37,99,235,0.35)' },
  ghost: { ...btnBase, background: 'white', color: '#1e293b', border: '1.5px solid #cbd5e1' },
}
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 8px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '600', fontFamily: 'inherit' }

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(dateStr).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const publicUrl = path => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
const isImage = a => String(a.type || '').startsWith('image/')

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

function Composer({ onPosted }) {
  const { memberId, fullName, avatarUrl } = useAuth()
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([])
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
    for (const file of files) {
      const safe = file.name.replace(/[^\w.-]/g, '_')
      const path = `${memberId}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
      if (upErr) {
        if (attachments.length) await supabase.storage.from(BUCKET).remove(attachments.map(a => a.path))
        setError(`Upload failed for "${file.name}": ${upErr.message}`)
        setSaving(false)
        return
      }
      attachments.push({ path, name: file.name, type: file.type, size: file.size })
    }

    const { error: insErr } = await supabase.from('feed_posts').insert({
      author_id: memberId,
      author_name: fullName,
      body: body.trim(),
      attachments,
    })
    if (insErr) {
      if (attachments.length) await supabase.storage.from(BUCKET).remove(attachments.map(a => a.path))
      setError(insErr.message)
      setSaving(false)
      return
    }

    setBody(''); setFiles([]); setSaving(false)
    onPosted()
  }

  const canPost = (body.trim() || files.length) && !saving

  return (
    <div style={{ ...card, padding: '16px' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <Avatar person={{ avatar_url: avatarUrl, full_name: fullName }} name={fullName} />
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canPost) handlePost() }}
          placeholder="Share an announcement or update with the team…"
          rows={3}
          style={{ flex: 1, resize: 'vertical', minHeight: '72px', padding: '10px 12px', borderRadius: '12px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', color: '#0f172a', outline: 'none', lineHeight: 1.5 }}
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', marginLeft: '48px', gap: '8px' }}>
        <input ref={fileRef} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} style={{ ...BTN.ghost, padding: '8px 12px', fontSize: '12.5px' }}>
          <Paperclip size={14} /> Photo / File
        </button>
        <button onClick={handlePost} disabled={!canPost} style={{ ...BTN.blue, padding: '8px 18px', fontSize: '13px', opacity: canPost ? 1 : 0.5, cursor: canPost ? 'pointer' : 'default' }}>
          <Send size={14} /> {saving ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  )
}

function Attachments({ items }) {
  const images = items.filter(isImage)
  const others = items.filter(a => !isImage(a))
  if (!items.length) return null

  return (
    <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
      {images.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '6px' }}>
          {images.map(a => (
            <a key={a.path} href={publicUrl(a.path)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f1f5f9' }}>
              <img src={publicUrl(a.path)} alt={a.name} loading="lazy" style={{ width: '100%', maxHeight: images.length === 1 ? '420px' : '220px', objectFit: 'cover', display: 'block' }} />
            </a>
          ))}
        </div>
      )}
      {others.map(a => (
        <a key={a.path} href={publicUrl(a.path)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', textDecoration: 'none', color: '#0f172a' }}>
          <FileText size={18} color="#2563eb" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: '600', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
          <span style={{ fontSize: '11.5px', color: '#94a3b8', flexShrink: 0 }}>{fmtSize(a.size)}</span>
        </a>
      ))}
    </div>
  )
}

function Comments({ post, comments, onChange }) {
  const { memberId, fullName, isZairul } = useAuth()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!text.trim() || !memberId) return
    setSaving(true)
    const { error } = await supabase.from('feed_comments').insert({
      post_id: post.id,
      author_id: memberId,
      author_name: fullName,
      body: text.trim(),
    })
    setSaving(false)
    if (error) { alert(error.message); return }
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
            <p style={{ fontSize: '13px', color: '#334155', marginTop: '2px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{c.body}</p>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !saving) handleAdd() }}
          placeholder="Write a comment…"
          style={{ flex: 1, padding: '9px 12px', borderRadius: '999px', border: '1.5px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit', outline: 'none', color: '#0f172a' }}
        />
        <button onClick={handleAdd} disabled={!text.trim() || saving} style={{ ...BTN.blue, width: '36px', height: '36px', borderRadius: '50%', padding: 0, opacity: text.trim() ? 1 : 0.5 }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

function PostCard({ post, comments, onChange }) {
  const { isZairul } = useAuth()
  const [showComments, setShowComments] = useState(false)
  const canDelete = isZairul

  async function togglePin() {
    const { error } = await supabase.from('feed_posts').update({ pinned: !post.pinned }).eq('id', post.id)
    if (error) { alert(error.message); return }
    onChange()
  }

  async function handleDelete() {
    if (!confirm('Delete this post and its comments?')) return
    const paths = (post.attachments || []).map(a => a.path)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    const { error } = await supabase.from('feed_posts').delete().eq('id', post.id)
    if (error) { alert(error.message); return }
    onChange()
  }

  return (
    <div style={{ ...card, padding: '16px', borderLeft: post.pinned ? '4px solid #f59e0b' : card.border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Avatar person={post.author} name={post.author_name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{post.author?.full_name || post.author_name}</p>
          <p style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '1px' }}>
            {fmtDateTime(post.created_at)} · {timeAgo(post.created_at)}
          </p>
        </div>
        {post.pinned && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', padding: '3px 8px', borderRadius: '999px' }}>
            <Pin size={11} /> Pinned
          </span>
        )}
      </div>

      {post.body && <p style={{ fontSize: '14px', color: '#1e293b', marginTop: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{post.body}</p>}

      <Attachments items={post.attachments || []} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '10px' }}>
        <button onClick={() => setShowComments(s => !s)} style={{ ...iconBtn, color: showComments ? '#2563eb' : '#64748b' }}>
          <MessageCircle size={15} /> {comments.length ? `${comments.length} comment${comments.length !== 1 ? 's' : ''}` : 'Comment'}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
          {isZairul && (
            <button onClick={togglePin} title={post.pinned ? 'Unpin' : 'Pin to top'} style={iconBtn}>
              {post.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
          )}
          {canDelete && (
            <button onClick={handleDelete} title="Delete post" style={{ ...iconBtn, color: '#ef4444' }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {showComments && <Comments post={post} comments={comments} onChange={onChange} />}
    </div>
  )
}

export default function Feed() {
  const { isMobile } = useViewport()
  const [posts, setPosts] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: p, error }, { data: c }] = await Promise.all([
      supabase.from('feed_posts')
        .select('*, author:team_members(id, full_name, avatar_url)')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('feed_comments')
        .select('*, author:team_members(id, full_name, avatar_url)')
        .order('created_at', { ascending: true }),
    ])
    setSetupError(error ? error.message : null)
    setPosts(p || [])
    setComments(c || [])
    setLoading(false)
  }

  const commentsByPost = useMemo(() => {
    const map = {}
    for (const c of comments) (map[c.post_id] ||= []).push(c)
    return map
  }, [comments])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 148px,#dde4ed 148px 100%)' }}>
      <div style={{ padding: isMobile ? '18px 14px 0' : '24px 32px 0', maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Feed</h1>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>Announcements and updates from the team</p>
      </div>

      <div style={{ padding: isMobile ? '16px 14px 48px' : '24px 32px 48px', maxWidth: '760px', margin: '0 auto', display: 'grid', gap: '14px' }}>
        {setupError && (
          <div style={{ background: 'white', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444', borderRadius: '14px', padding: '16px 18px' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#991b1b' }}>Feed table not set up yet</p>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
              Supabase said: <span style={{ color: '#991b1b', fontWeight: '600' }}>{setupError}</span><br />
              Run <code>sql/setup-feed.sql</code> in the Supabase SQL editor, then reload this page.
            </p>
          </div>
        )}

        <Composer onPosted={fetchAll} />

        {loading ? (
          <p style={{ color: '#64748b', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading feed…</p>
        ) : posts.length === 0 && !setupError ? (
          <div style={{ ...card, padding: '40px 20px', textAlign: 'center' }}>
            <ImageIcon size={28} color="#cbd5e1" style={{ margin: '0 auto' }} />
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#334155', marginTop: '10px' }}>No posts yet</p>
            <p style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '4px' }}>Be the first to share something with the team.</p>
          </div>
        ) : (
          posts.map(post => (
            <PostCard key={post.id} post={post} comments={commentsByPost[post.id] || []} onChange={fetchAll} />
          ))
        )}
      </div>
    </div>
  )
}
