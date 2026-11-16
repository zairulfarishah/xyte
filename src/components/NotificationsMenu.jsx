import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Settings, X } from 'lucide-react'
import { supabase } from '../supabase'
import { categoryOf, urlForCategory } from '../utils/notificationPrefs'
import './NotificationsMenu.css'

// The bell's dropdown: tabs with counts, avatar per sender, time + "time ago",
// quoted text in a bubble, unread dot. Uses the real notifications passed in from the app shell.

const SITE_CATS = ['assignment', 'pic_update', 'site_update']
const TABS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'unread', label: 'Unread' },
  { key: 'sites', label: 'Sites', test: n => SITE_CATS.includes(categoryOf(n)) },
  { key: 'mentions', label: 'Mentions', test: n => ['mention', 'feed_comment'].includes(categoryOf(n)) },
]

// Team avatars, loaded once per session (names → photo)
let memberCache = null
function useMembers() {
  const [members, setMembers] = useState(memberCache || [])
  useEffect(() => {
    if (memberCache) return undefined
    let cancelled = false
    supabase.from('team_members').select('id, full_name, short_name, avatar_url').then(({ data }) => {
      memberCache = data || []
      if (!cancelled) setMembers(memberCache)
    })
    return () => { cancelled = true }
  }, [])
  return members
}

function timeAgo(ts) {
  const m = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? '1 day ago' : `${d} days ago`
}
function stamp(ts) {
  const d = new Date(ts)
  const time = d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })
  const days = (Date.now() - d) / 86400000
  if (days < 6) return `${d.toLocaleDateString('en-MY', { weekday: 'long' })} ${time}`
  return `${d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}, ${time}`
}
// 'X commented on your post: "nice work"' → lead + quote shown in a bubble
function splitQuote(message = '') {
  const m = message.match(/^(.*?)[:—–-]\s*[“"](.{12,})[”"]\s*$/s)
  return m ? { lead: m[1].trim(), quote: m[2].trim() } : { lead: message, quote: null }
}
const initials = name => String(name || '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()

function Item({ n, unread, member, onOpen }) {
  const system = !n.actor || n.actor === 'System'
  const split = splitQuote(n.message)
  const { quote } = split
  // the name is already shown in bold, so drop it from the start of the text ("Zairul gave you a task" → "gave you a task")
  let lead = split.lead
  if (!system) {
    const names = [n.actor, String(n.actor).split(' ')[0]]
    const hit = names.find(nm => nm && lead.toLowerCase().startsWith(`${nm.toLowerCase()} `))
    if (hit) lead = lead.slice(hit.length + 1)
  }
  return (
    <button type="button" className={`nm-item${unread ? ' unread' : ''}`} onClick={() => onOpen(n)}>
      <span className={`nm-av${system ? ' sys' : ''}`}>
        {system ? <Bell size={17} /> : member?.avatar_url ? <img src={member.avatar_url} alt="" loading="lazy" /> : initials(n.actor)}
      </span>
      <span className="nm-main">
        <span className="nm-line">
          <span className="nm-text">{!system && <b>{n.actor} </b>}<span>{lead}</span></span>
          {unread && <i className="nm-dot" aria-label="Unread" />}
        </span>
        <span className="nm-time"><span>{stamp(n.created_at)}</span><span>{timeAgo(n.created_at)}</span></span>
        {quote && <span className="nm-quote">{quote}</span>}
      </span>
    </button>
  )
}

export default function NotificationsMenu({ notifs, seenBefore, onMarkAllRead, onClose }) {
  const navigate = useNavigate()
  const members = useMembers()
  const [tab, setTab] = useState('all')

  const byName = useMemo(() => {
    const map = new Map()
    members.forEach(m => { if (m.full_name) map.set(m.full_name.toLowerCase(), m); if (m.short_name) map.set(m.short_name.toLowerCase(), m) })
    return map
  }, [members])

  const isUnread = n => new Date(n.created_at) > new Date(seenBefore)
  const tabs = TABS.map(t => ({ ...t, test: t.key === 'unread' ? isUnread : t.test }))
  const counts = Object.fromEntries(tabs.map(t => [t.key, notifs.filter(t.test).length]))
  const shown = notifs.filter(tabs.find(t => t.key === tab).test)

  function open(n) {
    onClose()
    navigate(urlForCategory(categoryOf(n)))
  }

  return (
    <div className="nm-panel" role="dialog" aria-label="Notifications">
      <div className="nm-head">
        <h3>Your notifications</h3>
        <div className="nm-tools">
          <button type="button" onClick={onMarkAllRead} disabled={!counts.unread} title="Mark all as read" aria-label="Mark all as read"><CheckCheck size={17} /></button>
          <button type="button" onClick={() => { onClose(); navigate('/settings?tab=notifications') }} title="Notification settings" aria-label="Notification settings"><Settings size={17} /></button>
          <button type="button" onClick={onClose} title="Close" aria-label="Close"><X size={17} /></button>
        </div>
      </div>

      <div className="nm-tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}<span className={t.key === 'unread' && counts.unread ? 'hot' : ''}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="nm-list">
        {shown.length > 0
          ? shown.map(n => <Item key={n.id} n={n} unread={isUnread(n)} member={byName.get(String(n.actor || '').toLowerCase())} onOpen={open} />)
          : (
            <div className="nm-empty">
              <span><Bell size={22} /></span>
              <p>{tab === 'unread' ? 'You’re all caught up.' : 'No notifications yet.'}</p>
            </div>
          )}
      </div>
    </div>
  )
}
