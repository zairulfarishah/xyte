import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pin, MessageSquareText, ArrowRight } from 'lucide-react'
import { supabase } from '../supabase'
import { feedPublicUrl, isImageAttachment, notExpiredFilter, fmtDateTime, timeAgo } from '../utils/feed'

const clamp = lines => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' })

function usePosts(build, deps) {
  const [posts, setPosts] = useState([])
  useEffect(() => {
    let cancelled = false
    build(
      supabase.from('feed_posts')
        .select('id, body, author_name, attachments, created_at, author:team_members(full_name)')
        .or(notExpiredFilter())
    ).then(({ data }) => { if (!cancelled) setPosts(data || []) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return posts
}

// Dashboard: posts the admin has pinned. Renders nothing when there are none.
export function PinnedFeedCard() {
  const posts = usePosts(q => q.eq('pinned', true).order('created_at', { ascending: false }).limit(3), [])
  if (!posts.length) return null

  return (
    <section style={{ background: 'white', border: '1px solid rgba(226,232,240,.9)', borderLeft: '4px solid #f59e0b', borderRadius: '16px', boxShadow: '0 1px 4px rgba(15,23,42,.06), 0 4px 16px rgba(15,23,42,.06)', padding: '14px 18px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          <Pin size={13} /> Announcements
        </span>
        <Link to="/feed" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', fontWeight: '700', color: '#2563eb', textDecoration: 'none' }}>
          Open Feed <ArrowRight size={13} />
        </Link>
      </div>
      <div style={{ display: 'grid', gap: '10px' }}>
        {posts.map((post, i) => {
          const image = (post.attachments || []).find(isImageAttachment)
          return (
            <Link key={post.id} to="/feed" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', textDecoration: 'none', color: 'inherit', paddingTop: i ? '10px' : 0, borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
              {image && <img src={feedPublicUrl(image.path)} alt="" style={{ width: '56px', height: '56px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '14px', color: '#0f172a', fontWeight: '600', lineHeight: 1.45, whiteSpace: 'pre-wrap', ...clamp(2) }}>{post.body || (image ? 'Shared a photo' : 'Shared a file')}</p>
                <p style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '3px' }}>
                  {post.author?.full_name || post.author_name} · {fmtDateTime(post.created_at)}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// Site detail sidebar: Feed posts linked to this site. Renders nothing when there are none.
export function SiteFeedPosts({ siteId }) {
  const posts = usePosts(q => q.eq('site_id', siteId).order('created_at', { ascending: false }).limit(5), [siteId])
  if (!posts.length) return null

  return (
    <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MessageSquareText size={14} color="#2563eb" /> Feed Updates
        </p>
        <Link to="/feed" style={{ fontSize: '12px', fontWeight: '600', color: '#2563eb', textDecoration: 'none' }}>Open Feed</Link>
      </div>
      <div style={{ padding: '12px 20px 16px', display: 'grid', gap: '12px' }}>
        {posts.map(post => (
          <div key={post.id}>
            <p style={{ fontSize: '13px', color: '#0f172a', lineHeight: 1.5, whiteSpace: 'pre-wrap', ...clamp(3) }}>{post.body || 'Shared an attachment'}</p>
            <p title={fmtDateTime(post.created_at)} style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {post.author?.full_name || post.author_name} · {timeAgo(post.created_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
