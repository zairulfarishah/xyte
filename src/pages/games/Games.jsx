import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Trophy } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { notify } from '../../utils/notify'
import { toast } from '../../utils/toast'
import { GAMES, fetchBoard, fmtScore, gameOf, saveScore, weekStart } from './scores'
import Flappy from './Flappy'
import Game2048 from './Game2048'
import Snake from './Snake'
import Reaction from './Reaction'

const PLAYERS = { flappy: Flappy, '2048': Game2048, snake: Snake, reaction: Reaction }
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
  const [boards, setBoards] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all(GAMES.map(g => fetchBoard(g.key).then(b => [g.key, b])))
      .then(list => setBoards(Object.fromEntries(list)))
      .catch(err => setError(err.message))
  }, [])

  return (
    <>
      {error && <SetupNotice message={error} />}
      <div className="gm-hub">
        {GAMES.map(g => {
          const board = boards[g.key] || []
          const mine = board.find(r => r.member_id === memberId)
          const rank = mine ? board.indexOf(mine) + 1 : null
          return (
            <button key={g.key} className={`gm-card g-${g.key}`} onClick={() => onOpen(g.key)}>
              <span className="em">{g.emoji}</span>
              <b>{g.name}</b>
              <small>{g.blurb}</small>
              <div className="gm-card-foot">
                <span><Trophy size={12} /> {board[0] ? `${board[0].member_name.split(' ')[0]} · ${fmtScore(g.key, board[0].score)}` : 'No record yet'}</span>
                <span>{mine ? `You: ${fmtScore(g.key, mine.score)} · #${rank}` : 'Not played yet'}</span>
              </div>
            </button>
          )
        })}
      </div>
    </>
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
    if (!memberId || !(score > 0)) return
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
  }, [gameKey, game.name, memberId, fullName])

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
        </div>
      </div>
    </>
  )
}
