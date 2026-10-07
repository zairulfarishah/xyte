import { supabase } from '../../supabase'

export const GAMES = [
  { key: 'flappy',   name: 'Flappy Bird',   emoji: '🐤', blurb: 'Tap to fly through the pipes', unit: 'pipes' },
  { key: '2048',     name: '2048',          emoji: '🔢', blurb: 'Swipe to merge tiles — reach 2048', unit: 'pts' },
  { key: 'snake',    name: 'Snake',         emoji: '🐍', blurb: 'Eat, grow, don’t bite yourself', unit: 'food' },
  { key: 'reaction', name: 'Reaction time', emoji: '⚡', blurb: 'Tap the moment it turns green — 5 rounds', unit: 'ms', lowerWins: true },
]
export const gameOf = key => GAMES.find(g => g.key === key)

const better = (game, a, b) => (game.lowerWins ? a < b : a > b)

// Monday 00:00 of this week, local time
export function weekStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

// Each member's best score for one game, best first. since: only scores after this date.
export async function fetchBoard(gameKey, since = null) {
  const game = gameOf(gameKey)
  let q = supabase.from('game_scores').select('member_id, member_name, score, created_at')
    .eq('game', gameKey).order('score', { ascending: !!game.lowerWins }).limit(1000)
  if (since) q = q.gte('created_at', since.toISOString())
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const best = new Map()
  for (const row of data || []) {
    const key = row.member_id || row.member_name
    const cur = best.get(key)
    if (!cur || better(game, row.score, cur.score)) best.set(key, row)
  }
  return [...best.values()].sort((a, b) => (game.lowerWins ? a.score - b.score : b.score - a.score))
}

// Saves a finished game. Returns { personalBest, newRecord, previousTop }.
export async function saveScore(gameKey, score, { memberId, fullName }) {
  const game = gameOf(gameKey)
  const board = await fetchBoard(gameKey)
  const top = board[0]
  const mine = board.find(r => r.member_id === memberId)
  const { error } = await supabase.from('game_scores').insert({ game: gameKey, member_id: memberId, member_name: fullName, score })
  if (error) throw new Error(error.message)
  return {
    personalBest: !mine || better(game, score, mine.score),
    newRecord: !top || better(game, score, top.score),
    previousTop: top || null,
  }
}

export const fmtScore = (gameKey, score) => `${score} ${gameOf(gameKey)?.unit || ''}`.trim()
