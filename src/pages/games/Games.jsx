import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Crown, Gamepad2, Medal, Sparkles, Trophy } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { notify } from '../../utils/notify'
import { toast } from '../../utils/toast'
import { GAMES, fetchBoard, fmtScore, gameOf, saveScore, weekStart } from './scores'
import { GAME_ART, GAME_GROUPS, groupOf } from './gameArt'
import './GamesArcade.css'
import Flappy from './Flappy'
import Game2048 from './Game2048'
import Snake from './Snake'
import Reaction from './Reaction'
import DailyWord from './DailyWord'
import Memory from './Memory'
import QuickMath from './QuickMath'
import Stack from './Stack'
import Whack from './Whack'
import Trivia from './Trivia'
import BlockDrop from './BlockDrop'
import Simon from './Simon'
import ColourTrap from './ColourTrap'

const PLAYERS = {
  flappy: Flappy, '2048': Game2048, snake: Snake, reaction: Reaction,
  word: DailyWord, memory: Memory, math: QuickMath, stack: Stack, whack: Whack,
  trivia: Trivia, blocks: BlockDrop, simon: Simon, colour: ColourTrap,
}
const MEDALS = ['🥇', '🥈', '🥉']

export default function Games() {
  const [params, setParams] = useSearchParams()
  const open = gameOf(params.get('game')) ? params.get('game') : null
  const setOpen = key => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (key) next.set('game', key); else next.delete('game')
    return next
  })
  return open ? <GameScreen gameKey={open} onBack={() => setOpen(null)} /> : <Hub onOpen={setOpen} />
}

function SetupNotice({ message }) {
  return (
    <div className="mk-card mk-pad" style={{ borderLeft: '4px solid #ef4444' }}>
      <b style={{ color: '#991b1b' }}>Games need one more database step</b>
      <p className="mk-sub">Supabase said: <b>{message}</b><br />Run <code>sql/setup-games.sql</code> in the Supabase SQL editor to keep high scores. You can still play meanwhile.</p>
    </div>
  )
}

function Hub({ onOpen }) {
  const { memberId } = useAuth()
  const [boards, setBoards] = useState(null)   // null while loading
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    Promise.all(GAMES.map(g => fetchBoard(g.key).then(b => [g.key, b])))
      .then(list => setBoards(Object.fromEntries(list)))
      .catch(err => { setError(err.message); setBoards({}) })
  }, [])

  const mineOf = key => boards?.[key]?.find(r => r.member_id === memberId)
  const played = boards ? GAMES.filter(g => mineOf(g.key)).length : null
  const records = boards ? GAMES.filter(g => memberId && boards[g.key]?.[0]?.member_id === memberId).length : null
  const groups = GAME_GROUPS.map(c => ({ ...c, n: GAMES.filter(g => groupOf(g.key) === c.key).length })).filter(c => c.n > 0)
  const list = filter === 'all' ? GAMES : GAMES.filter(g => groupOf(g.key) === filter)

  return (
    <>
      {error && <SetupNotice message={error} />}
      <div className="ga">
        <div className="ga-head">
          <div className="ga-top">
            <div>
              <span className="ga-eyebrow"><Gamepad2 />Xyte Arcade</span>
              <h2 className="ga-title"><span>Pick a game, top the board</span></h2>
              <p className="ga-sub">Quick games for the break. Every score counts toward the team leaderboard.</p>
            </div>
            <div className="ga-stats">
              <div className="ga-stat"><b>{GAMES.length}</b><span>Games</span></div>
              <div className="ga-stat"><b>{played ?? '–'}<small>/{GAMES.length}</small></b><span>You've played</span></div>
              <div className="ga-stat gold"><b>{records ?? '–'}</b><span>Records held</span></div>
            </div>
          </div>
          <div className="ga-filters" role="tablist" aria-label="Game type">
            {[{ key: 'all', label: 'All', n: GAMES.length }, ...groups].map(c => (
              <button key={c.key} type="button" role="tab" aria-selected={filter === c.key} className={`ga-chip${filter === c.key ? ' on' : ''}`} onClick={() => setFilter(c.key)}>
                {c.label} <em>{c.n}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="ga-grid">
          {list.map(g => <GameCard key={g.key} game={g} board={boards ? boards[g.key] || [] : null} memberId={memberId} onOpen={onOpen} />)}
        </div>
      </div>
    </>
  )
}

// One game: illustration, name, and the leaderboard (top player vs your record).
// board === null while the scores are loading.
function GameCard({ game: g, board, memberId, onOpen }) {
  const mine = board?.find(r => r.member_id === memberId)
  const rank = mine ? board.indexOf(mine) + 1 : null
  const top = board?.[0]
  const first = name => String(name || '').split(' ')[0]

  return (
    <button type="button" className={`gc g-${g.key}`} onClick={() => onOpen(g.key)} aria-label={`Play ${g.name}`}>
      <span className="gc-top">
        <span className="gc-art" dangerouslySetInnerHTML={{ __html: GAME_ART[g.key] || '' }} />
        <span className="gc-side">
          <span className="gc-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg></span>
          {rank === 1 ? <span className="gc-badge gold"><Crown />Record</span>
            : rank && rank <= 3 ? <span className="gc-badge"><Medal />Top 3</span>
            : g.sum ? <span className="gc-badge"><CalendarDays />Daily</span> : null}
        </span>
      </span>
      <b className="gc-title">{g.name}</b>
      <small className="gc-desc">{g.blurb}</small>

      {!board ? (
        <span className="gc-board" aria-label="Loading scores">
          <span className="gc-cell"><span className="gc-sk" /><span className="gc-sk" /></span>
          <span className="gc-cell"><span className="gc-sk" /><span className="gc-sk" /></span>
        </span>
      ) : !top ? (
        <span className="gc-board empty">
          <span className="gc-cell"><Sparkles /><span><span className="gc-muted">Not played yet</span><br /><span className="gc-hint">Be the first to set the record</span></span></span>
        </span>
      ) : (
        <span className="gc-board">
          <span className="gc-cell">
            <span className="gc-lbl"><Crown className="crown" />Top player</span>
            <span className="gc-name">{top.member_id === memberId ? 'You' : first(top.member_name)}</span>
            <span className="gc-score">{fmtScore(g.key, top.score)}</span>
          </span>
          <span className="gc-cell me">
            <span className="gc-lbl">Your record</span>
            {mine ? (
              <>
                <span className="gc-score"><span className="gc-big">{fmtScore(g.key, mine.score)}</span></span>
                <span className="gc-score"><span className={`gc-rank r${rank}`}>#{rank}</span>of {board.length}</span>
              </>
            ) : (
              <><span className="gc-muted">Not played</span><span className="gc-hint">Tap to play</span></>
            )}
          </span>
        </span>
      )}
      <span className="gc-rule">{g.lowerWins ? 'Lowest wins' : g.sum ? 'Points add up daily' : 'Highest wins'}</span>
    </button>
  )
}

function GameScreen({ gameKey, onBack }) {
  const { memberId, fullName } = useAuth()
  const game = gameOf(gameKey)
  const Player = PLAYERS[gameKey]
  const [range, setRange] = useState('week')
  const [board, setBoard] = useState([])
  const [error, setError] = useState(null)
  const [round, setRound] = useState(0) // bumps after each save to refresh the board

  const load = useCallback(() => {
    fetchBoard(gameKey, range === 'week' ? weekStart() : null)
      .then(b => { setBoard(b); setError(null) })
      .catch(err => setError(err.message))
  }, [gameKey, range])
  useEffect(() => { load() }, [load, round])

  const onGameOver = useCallback(async score => {
    // A missed Daily Word scores 0 but still counts as today's play
    if (!memberId || !(score > 0 || (game.sum && score === 0))) return
    try {
      const r = await saveScore(gameKey, score, { memberId, fullName })
      if (r.newRecord) {
        toast(`🏆 New ${game.name} record: ${fmtScore(gameKey, score)}!`, { ms: 6000 })
        if (r.previousTop && r.previousTop.member_id !== memberId) {
          notify(`🏆 ${fullName} took the ${game.name} record from ${r.previousTop.member_name.split(' ')[0]} — ${fmtScore(gameKey, score)}`, fullName, null, 'makan').catch(() => {})
        }
      } else if (r.personalBest) toast(`New personal best: ${fmtScore(gameKey, score)}`)
      setRound(n => n + 1)
    } catch (err) {
      setError(err.message)
    }
  }, [gameKey, game.name, game.sum, memberId, fullName])

  return (
    <>
      {error && <SetupNotice message={error} />}
      <div className="gm-screen">
        <div className="mk-card mk-pad gm-stage">
          <div className="mk-h" style={{ marginBottom: 12 }}>
            <button className="mk-btn ghost sm" onClick={onBack}><ArrowLeft size={14} /> All games</button>
            <h2>{game.emoji} {game.name}</h2>
          </div>
          <Player onGameOver={onGameOver} />
          {!memberId && <p className="mk-sub" style={{ textAlign: 'center', marginTop: 10 }}>Your login isn't linked to a team member, so scores aren't saved.</p>}
        </div>

        <div className="mk-card mk-pad">
          <div className="mk-h" style={{ marginBottom: 10 }}>
            <h2 style={{ fontSize: 15 }}><Trophy size={15} style={{ verticalAlign: -2 }} /> Leaderboard</h2>
            <span className="grow" />
            <div className="mk-tabs2">
              <button className={range === 'week' ? 'on' : ''} onClick={() => setRange('week')}>This week</button>
              <button className={range === 'all' ? 'on' : ''} onClick={() => setRange('all')}>All time</button>
            </div>
          </div>
          {board.length === 0 ? (
            <div className="mk-empty"><b>No scores {range === 'week' ? 'this week' : 'yet'}</b>Be the first on the board.</div>
          ) : (
            <ol className="gm-board">
              {board.slice(0, 10).map((r, i) => (
                <li key={r.member_id || r.member_name} className={r.member_id === memberId ? 'me' : ''}>
                  <span className="rk">{MEDALS[i] || i + 1}</span>
                  <span className="nm">{r.member_id === memberId ? 'You' : r.member_name}</span>
                  <b>{fmtScore(gameKey, r.score)}</b>
                </li>
              ))}
            </ol>
          )}
          {game.lowerWins && <p className="mk-sub" style={{ marginTop: 8 }}>Lower is better.</p>}
          {gameKey === 'word' && <p className="mk-sub" style={{ marginTop: 8 }}>Points added up over the days: 6 for 1 guess down to 1 for 6 guesses.</p>}
          {gameKey === 'trivia' && <p className="mk-sub" style={{ marginTop: 8 }}>Points added up over the days: 1 per right answer, up to 5 a day.</p>}
        </div>
      </div>
    </>
  )
}
