import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dices, MapPin, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { notify } from '../utils/notify'
import { toast } from '../utils/toast'
import { avatarColor, initials, randomIndex } from '../utils/makan'

const PRESETS = ['Lunch', 'Breakfast', 'Dinner', 'Minum petang', 'Supper']
const SLICE_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']
const SPIN_MS = 5200
// A result newer than this when the page loads still gets the spin animation
const FRESH_MS = 20000

const tickets = idea => Math.max(1, (idea.backers || []).length)

function Avatar({ m, name }) {
  return (
    <span className="mk-av" style={{ '--c': avatarColor(m?.id || name) }} title={m?.full_name || name}>
      {m?.avatar_url ? <img src={m.avatar_url} alt="" /> : initials(m?.full_name || name)}
    </span>
  )
}

function timeLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
}

// ── The wheel: slices sized by tickets, 0° at the top, clockwise ──
function Wheel({ ideas, rotation, spinning }) {
  const total = ideas.reduce((n, i) => n + tickets(i), 0)
  const pt = (deg, r) => {
    const a = (deg * Math.PI) / 180
    return `${50 + r * Math.sin(a)},${50 - r * Math.cos(a)}`
  }
  const slices = ideas.reduce((list, idea, i) => {
    const from = list.length ? list[list.length - 1].to : 0
    return [...list, { idea, from, to: from + (tickets(idea) / total) * 360, color: SLICE_COLORS[i % SLICE_COLORS.length] }]
  }, [])

  return (
    <div className="mk-wheel">
      <span className="pin" />
      <svg viewBox="0 0 100 100">
        <g className="rot" style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.08,1)` : 'none' }}>
          {slices.length === 0 && <circle cx="50" cy="50" r="48" fill="#e2e8f0" />}
          {slices.length === 1 && <circle cx="50" cy="50" r="48" fill={slices[0].color} />}
          {slices.length > 1 && slices.map(s => (
            <path key={s.idea.id} fill={s.color} stroke="#fff" strokeWidth="0.6"
              d={`M50,50 L${pt(s.from, 48)} A48,48 0 ${s.to - s.from > 180 ? 1 : 0} 1 ${pt(s.to, 48)} Z`} />
          ))}
          {slices.map(s => {
            const mid = (s.from + s.to) / 2
            const label = s.idea.place.length > 14 ? `${s.idea.place.slice(0, 13)}…` : s.idea.place
            return (
              <text key={`t${s.idea.id}`} x="50" y="50" transform={`rotate(${mid - 90} 50 50) translate(17 0)`}
                fill="#fff" fontSize={slices.length > 8 ? 3.4 : 4.2} fontWeight="800" dominantBaseline="middle"
                style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.18)', strokeWidth: 0.6 }}>
                {label}
              </text>
            )
          })}
        </g>
      </svg>
      <span className="hub">🍽️</span>
    </div>
  )
}

// Rotation that lands the middle of the winner's slice under the pin, after a few full turns
function landingRotation(ideas, winnerId, from) {
  const total = ideas.reduce((n, i) => n + tickets(i), 0)
  let at = 0
  let mid = 0
  for (const idea of ideas) {
    const span = (tickets(idea) / total) * 360
    if (idea.id === winnerId) { mid = at + span / 2; break }
    at += span
  }
  const target = (((-mid - from) % 360) + 360) % 360
  return from + 360 * 6 + target
}

export default function LunchSpin({ members, onSetupError }) {
  const { memberId, fullName, isZairul } = useAuth()
  const [rounds, setRounds] = useState([])
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('Lunch')
  const [place, setPlace] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(null) // spun_at of the result now shown
  const [startNew, setStartNew] = useState(false)
  const animated = useRef(new Set())
  const loadedAt = useRef(Date.now())
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])

  const load = useCallback(async () => {
    const { data: r, error } = await supabase.from('lunch_rounds').select('*').order('created_at', { ascending: false }).limit(15)
    if (error) { onSetupError?.(error.message); setLoading(false); return }
    const ids = (r || []).map(x => x.id)
    const { data: i } = ids.length
      ? await supabase.from('lunch_ideas').select('*').in('round_id', ids).order('created_at')
      : { data: [] }
    setRounds(r || [])
    setIdeas(i || [])
    setLoading(false)
  }, [onSetupError])

  useEffect(() => {
    load()
    const channel = supabase.channel('makan-lunch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lunch_rounds' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lunch_ideas' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  // The round on stage: the newest one, unless the user asked to start another
  const current = startNew ? null : rounds[0] || null
  const roundIdeas = useMemo(() => ideas.filter(i => i.round_id === current?.id), [ideas, current])
  const winner = roundIdeas.find(i => i.id === current?.winner_idea_id)
  const totalTickets = roundIdeas.reduce((n, i) => n + tickets(i), 0)
  const history = rounds.filter(r => r.status === 'done' && r.id !== current?.id)

  // Spin (or re-spin) result arrived: animate it on every screen, once per result
  useEffect(() => {
    if (!current?.winner_idea_id || !current.spun_at || roundIdeas.length === 0) return
    const key = `${current.id}:${current.spun_at}`
    if (animated.current.has(key)) return
    animated.current.add(key)
    const fresh = new Date(current.spun_at).getTime() > loadedAt.current - FRESH_MS
    const to = landingRotation(roundIdeas, current.winner_idea_id, rotation)
    if (!fresh) { setRotation(to); setRevealed(current.spun_at); return }
    setRevealed(null)
    setSpinning(true)
    requestAnimationFrame(() => setRotation(to))
    // Not cleared on re-render: live updates mid-spin must not cancel the reveal
    const spunAt = current.spun_at
    setTimeout(() => { setSpinning(false); setRevealed(spunAt) }, SPIN_MS + 150)
  },[current?.id, current?.spun_at, current?.winner_idea_id, roundIdeas]) // eslint-disable-line react-hooks/exhaustive-deps

  async function startRound() {
    if (!title.trim()) return
    setBusy(true)
    const { error } = await supabase.from('lunch_rounds').insert({ title: title.trim(), created_by: memberId, created_by_name: fullName })
    setBusy(false)
    if (error) { toast(`Couldn't start: ${error.message}`, { tone: 'err' }); return }
    setStartNew(false)
    setRevealed(null)
    notify(`${fullName} started a ${title.trim()} spin — add your place in Break Room`, fullName, null, 'makan').catch(() => {})
    load()
  }

  async function addIdea(e) {
    e?.preventDefault()
    const name = place.trim()
    if (!name || !current || !memberId) return
    const same = roundIdeas.find(i => i.place.toLowerCase() === name.toLowerCase())
    if (same) {
      if (!(same.backers || []).includes(memberId)) await toggleBack(same)
      else toast(`"${same.place}" is already in — you've backed it`)
      setPlace(''); setNote('')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('lunch_ideas').insert({
      round_id: current.id, place: name, note: note.trim() || null, added_by: memberId, added_by_name: fullName, backers: [memberId],
    })
    setBusy(false)
    if (error) { toast(`Couldn't add: ${error.message}`, { tone: 'err' }); return }
    setPlace(''); setNote('')
    load()
  }

  async function toggleBack(idea) {
    if (!memberId) return
    const has = (idea.backers || []).includes(memberId)
    const backers = has ? idea.backers.filter(id => id !== memberId) : [...(idea.backers || []), memberId]
    setIdeas(list => list.map(i => i.id === idea.id ? { ...i, backers } : i))
    const { error } = await supabase.from('lunch_ideas').update({ backers }).eq('id', idea.id)
    if (error) { toast(`Couldn't update: ${error.message}`, { tone: 'err' }); load() }
  }

  async function removeIdea(idea) {
    setIdeas(list => list.filter(i => i.id !== idea.id))
    const { error } = await supabase.from('lunch_ideas').delete().eq('id', idea.id)
    if (error) { toast(`Couldn't remove: ${error.message}`, { tone: 'err' }); load() }
  }

  // Each backer is one ticket; a re-spin leaves out the place that just won
  async function spin(again = false) {
    const pool = roundIdeas.filter(i => !again || i.id !== current.winner_idea_id)
    if (pool.length === 0) return
    const bag = pool.flatMap(i => Array(tickets(i)).fill(i))
    const pick = bag[randomIndex(bag.length)]
    setBusy(true)
    let query = supabase.from('lunch_rounds')
      .update({ status: 'done', winner_idea_id: pick.id, spun_by_name: fullName, spun_at: new Date().toISOString() })
      .eq('id', current.id)
    // First spin only counts once, even if two people press at the same moment
    if (!again) query = query.eq('status', 'open')
    const { data, error } = await query.select()
    setBusy(false)
    if (error) { toast(`Couldn't spin: ${error.message}`, { tone: 'err' }); return }
    if (!data?.length) { toast('Someone else just spun it'); load(); return }
    setRounds(list => list.map(r => r.id === current.id ? data[0] : r))
    notify(`🍽️ ${current.title}: "${pick.place}" won the spin${again ? ' (re-spin)' : ''} — spun by ${fullName}`, fullName, null, 'makan').catch(() => {})
  }

  async function deleteRound() {
    if (!confirm(`Delete this ${current.title} round and its places?`)) return
    const { error } = await supabase.from('lunch_rounds').delete().eq('id', current.id)
    if (error) { toast(`Couldn't delete: ${error.message}`, { tone: 'err' }); return }
    load()
  }

  if (loading) return <div className="mk-card mk-empty">Loading…</div>

  const canManage = current && (current.created_by === memberId || isZairul)
  const showResult = winner && revealed === current.spun_at && !spinning

  return (
    <div className="mk-spin">
      <div style={{ display: 'grid', gap: 16 }}>
        {!current ? (
          <div className="mk-card mk-pad" style={{ display: 'grid', gap: 14 }}>
            <div className="mk-h">
              <h2>Start a spin</h2>
              {rounds.length > 0 && <><span className="grow" /><button className="mk-btn ghost sm" onClick={() => setStartNew(false)}>Back</button></>}
            </div>
            <div className="mk-chips">
              {PRESETS.map(p => <button key={p} className={`mk-chip${title === p ? ' on' : ''}`} onClick={() => setTitle(p)}>{p}</button>)}
            </div>
            <div className="mk-row">
              <input className="mk-in" value={title} onChange={e => setTitle(e.target.value)} placeholder="What's it for? e.g. Lunch Friday" maxLength={60} />
              <button className="mk-btn" onClick={startRound} disabled={busy || !title.trim()}><Dices size={15} /> Start</button>
            </div>
            <p className="mk-sub">Everyone gets a notification to add their place.</p>
          </div>
        ) : (
          <div className="mk-card mk-pad" style={{ display: 'grid', gap: 12 }}>
            <div className="mk-h">
              <div>
                <h2>{current.title}</h2>
                <p className="mk-sub">
                  Started by {current.created_by_name || 'someone'} · {timeLabel(current.created_at)}
                  {current.status === 'done' && current.spun_by_name && <> · spun by {current.spun_by_name}</>}
                </p>
              </div>
              <span className="grow" />
              {canManage && <button className="mk-x" title="Delete round" onClick={deleteRound}><Trash2 size={15} /></button>}
              {current.status === 'done' && <button className="mk-btn ghost sm" onClick={() => { setStartNew(true); setTitle('Lunch') }}><Plus size={14} /> New spin</button>}
            </div>

            {current.status === 'open' && (
              <form onSubmit={addIdea} style={{ display: 'grid', gap: 8 }}>
                <div className="mk-row">
                  <input className="mk-in" value={place} onChange={e => setPlace(e.target.value)} placeholder="Put in a place… e.g. Nasi Kandar Pelita" maxLength={60} />
                  <button className="mk-btn" disabled={busy || !place.trim() || !memberId}><Plus size={15} /> Add</button>
                </div>
                {place.trim() && <input className="mk-in" value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional) — e.g. near Store, got parking" maxLength={80} />}
                {!memberId && <p className="mk-sub">Your login isn't linked to a team member, so you can watch but not add.</p>}
              </form>
            )}

            {roundIdeas.length === 0 ? (
              <div className="mk-empty"><b>No places yet</b>Be the first to put one in.</div>
            ) : (
              <div>
                {roundIdeas.map((idea, i) => {
                  const backed = (idea.backers || []).includes(memberId)
                  const mine = idea.added_by === memberId
                  return (
                    <div key={idea.id} className="mk-idea" style={{ '--c': SLICE_COLORS[i % SLICE_COLORS.length] }}>
                      <span className="sw" />
                      <div className="t">
                        <b>{idea.place}{idea.id === current.winner_idea_id && showResult ? ' 🏆' : ''}</b>
                        <small>{idea.note ? `${idea.note} · ` : ''}by {idea.added_by_name || '—'}</small>
                      </div>
                      <div className="mk-stack">
                        {(idea.backers || []).slice(0, 4).map(id => <Avatar key={id} m={memberById[id]} name={id} />)}
                      </div>
                      <span className="odds">{Math.round((tickets(idea) / totalTickets) * 100)}%</span>
                      {current.status === 'open' && (<>
                        <button className={`mk-plus${backed ? ' on' : ''}`} onClick={() => toggleBack(idea)} disabled={!memberId} title={backed ? 'Take back your +1' : '+1 — adds a ticket'}>
                          +1{(idea.backers || []).length > 1 ? ` · ${idea.backers.length}` : ''}
                        </button>
                        {(mine || isZairul) && <button className="mk-x" title="Remove" onClick={() => removeIdea(idea)}><X size={15} /></button>}
                      </>)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="mk-card mk-pad">
            <div className="mk-h" style={{ marginBottom: 6 }}><h2 style={{ fontSize: 14 }}>Recent picks</h2></div>
            <div className="mk-hist">
              {history.slice(0, 8).map(r => {
                const w = ideas.find(i => i.id === r.winner_idea_id)
                return <div key={r.id}><b>{w?.place || '—'}</b><span>{r.title} · {timeLabel(r.spun_at || r.created_at)}</span></div>
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mk-card mk-wheel-card">
        <Wheel ideas={roundIdeas} rotation={rotation} spinning={spinning} />
        {showResult ? (
          <div className="mk-winner">
            <small>{current.title} winner</small>
            <b>🎉 {winner.place}</b>
            <a href={`https://www.google.com/maps/search/${encodeURIComponent(winner.place)}`} target="_blank" rel="noreferrer"><MapPin size={13} /> Open in Maps</a>
          </div>
        ) : spinning ? (
          <p className="mk-sub" style={{ fontWeight: 700 }}>Spinning…</p>
        ) : current?.status === 'open' ? (
          <p className="mk-sub">{roundIdeas.length < 2 ? 'Need at least 2 places to spin.' : `${roundIdeas.length} places · ${totalTickets} tickets. Every +1 is one more ticket.`}</p>
        ) : null}

        {current?.status === 'open' && (
          <button className="mk-btn big" onClick={() => spin(false)} disabled={busy || spinning || roundIdeas.length < 2}><Dices size={18} /> Spin!</button>
        )}
        {current?.status === 'done' && !spinning && roundIdeas.length > 1 && (
          <button className="mk-btn ghost" onClick={() => spin(true)} disabled={busy}><RotateCcw size={14} /> Not feeling it? Re-spin</button>
        )}
      </div>
    </div>
  )
}
