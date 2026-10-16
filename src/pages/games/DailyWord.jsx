import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { toast } from '../../utils/toast'
import { playedToday } from './scores'

// Everyday 5-letter English words; the day's word is picked from this list by date,
// so the whole team gets the same one. Any 5 letters are accepted as a guess.
const WORDS = `about above actor admit adult after again agent agree ahead alarm album alert alive allow alone along alter
among angle angry apple apply arena argue arise array aside asset audio avoid award aware badge basic beach begin being
below bench birth black blade blame blank blast blind block blood board boost booth brain brand brave bread break brick
brief bring broad brown brush build bunch burst buyer cabin cable candy carry catch cause chain chair chalk charm chart
chase cheap check chest chief child chips civil claim class clean clear clerk click climb clock close cloud coach coast
count court cover crack craft crane crash cream crowd crown curve cycle daily dance dealt death delay depth diary dirty
doubt draft drain drama drawn dream dress drill drink drive eager early earth eight elbow elite empty enjoy enter entry
equal error event every exact exist extra faith false fancy fault favor fence fever field fifty fight final first flash
fleet floor fluid focus force forth forum found frame fresh front fruit funny ghost giant given glass globe grace grade
grain grand grant grass great green greet group guard guess guest guide habit happy heart heavy hello hobby honey horse
hotel house human humor ideal image index inner input issue jelly joint judge juice knife label labor large laser later
laugh layer learn lemon level light limit local logic loose lucky lunch magic major maker mango march match maybe mayor
medal media metal meter minor model money month motor mount mouse mouth movie music nasty nerve never night noise north
novel nurse ocean offer often olive onion order other outer owner paint panel paper party pasta patch peace pearl
phone photo piano piece pilot pitch pizza place plain plane plant plate point power press price pride prime print prize
proof proud quick quiet quite radio raise range rapid ratio reach ready relax reply rider right river robot rough round
route royal rural salad sauce scale scene scope score screw sense serve seven shade shake shape share sharp sheet shelf
shell shift shine shirt shock shoot shore short shout sight skill sleep slice slide small smart smile smoke snack solid
solve sound south space spare speak speed spend spice spoon sport staff stage stair stamp stand start state steam steel
stick still stock stone store storm story stove style sugar sunny super sweet table taste teach thank theme thick thing
think third three throw tiger timer title toast today tooth topic total touch tough tower track trade train trend trial
truck trust truth twice uncle under union unity until upper urban usage usual value video visit voice waste watch water
wheel where which while white whole woman world worry worth would write wrong young youth zebra`
  .split(/\s+/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{5}$/.test(w))

const TRIES = 6
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const RANK = { hit: 3, near: 2, miss: 1 }

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Same word for everyone on the same calendar day; the step spreads neighbouring days across the list
function wordFor(key) {
  const day = Math.floor(new Date(`${key}T00:00:00Z`).getTime() / 86400000)
  return WORDS[(day * 37) % WORDS.length]
}

// hit = right letter, right spot · near = in the word, wrong spot · miss = not in the word
function grade(guess, answer) {
  const out = Array(5).fill('miss')
  const left = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) out[i] = 'hit'
    else left[answer[i]] = (left[answer[i]] || 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] !== 'hit' && left[guess[i]] > 0) { out[i] = 'near'; left[guess[i]] -= 1 }
  }
  return out
}

const points = (guesses, won) => (won ? TRIES + 1 - guesses : 0)

export default function DailyWord({ onGameOver }) {
  const { memberId } = useAuth()
  const day = todayKey()
  const answer = wordFor(day)
  const storeKey = `xyte_word_${day}_${memberId || 'guest'}`
  const [guesses, setGuesses] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) || '[]') } catch { return [] }
  })
  const [current, setCurrent] = useState('')
  const [shake, setShake] = useState(false)
  const [savedElsewhere, setSavedElsewhere] = useState(null) // today's score saved on another device

  const won = guesses.includes(answer)
  const over = won || guesses.length >= TRIES || savedElsewhere != null

  useEffect(() => {
    playedToday('word', memberId).then(row => { if (row && !guesses.length) setSavedElsewhere(row.score) }).catch(() => {})
  }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps -- check once when opened

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(guesses)) } catch { /* storage unavailable */ }
  }, [guesses, storeKey])

  function submit() {
    if (current.length !== 5) { setShake(true); setTimeout(() => setShake(false), 400); toast('Five letters, please', { tone: 'warn', ms: 1800 }); return }
    const next = [...guesses, current]
    setGuesses(next)
    setCurrent('')
    const done = current === answer || next.length >= TRIES
    if (done) {
      const win = current === answer
      toast(win ? `🎉 Got it in ${next.length}! +${points(next.length, true)} pts` : `The word was ${answer.toUpperCase()}`, { ms: 5000 })
      onGameOver?.(points(next.length, win))
    }
  }

  function press(key) {
    if (over) return
    if (key === 'enter') submit()
    else if (key === 'del') setCurrent(c => c.slice(0, -1))
    else if (current.length < 5) setCurrent(c => c + key)
  }

  useEffect(() => {
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (e.key === 'Enter') { e.preventDefault(); press('enter') }
      else if (e.key === 'Backspace') press('del')
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Best colour each letter has earned so far, for the keyboard
  const keyState = {}
  for (const g of guesses) grade(g, answer).forEach((s, i) => { if ((RANK[s] || 0) > (RANK[keyState[g[i]]] || 0)) keyState[g[i]] = s })

  function share() {
    const grid = guesses.map(g => grade(g, answer).map(s => ({ hit: '🟩', near: '🟨', miss: '⬜' })[s]).join('')).join('\n')
    const text = `Xyte Daily Word ${day} — ${won ? `${guesses.length}/${TRIES}` : `X/${TRIES}`}\n${grid}`
    navigator.clipboard?.writeText(text).then(() => toast('Copied — paste it in the group chat'), () => toast('Couldn’t copy', { tone: 'err' }))
  }

  if (savedElsewhere != null) {
    return (
      <div className="gm-react" style={{ background: '#1e3a8a' }}>
        <b>Done for today</b>
        <span>You scored {savedElsewhere} pts on today’s word. A new word comes at midnight.</span>
      </div>
    )
  }

  const rows = Array.from({ length: TRIES }, (_, r) => {
    if (r < guesses.length) return { letters: guesses[r], marks: grade(guesses[r], answer) }
    if (r === guesses.length && !over) return { letters: current, marks: [], typing: true }
    return { letters: '', marks: [] }
  })

  return (
    <div className="gm-word">
      <div className="gm-wgrid">
        {rows.map((row, r) => (
          <div key={r} className={`gm-wrow ${row.typing && shake ? 'shake' : ''}`}>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`gm-wcell ${row.marks[i] || ''} ${row.letters[i] ? 'filled' : ''}`}>{row.letters[i] || ''}</span>
            ))}
          </div>
        ))}
      </div>

      {over ? (
        <div className="gm-wdone">
          <b>{won ? `🎉 ${guesses.length}/${TRIES} · +${points(guesses.length, true)} pts` : `The word was ${answer.toUpperCase()}`}</b>
          <span>A new word comes at midnight — same one for the whole team.</span>
          <button className="mk-btn sm" onClick={share}>Copy result</button>
        </div>
      ) : (
        <div className="gm-kb">
          {ROWS.map((row, i) => (
            <div key={row}>
              {i === 2 && <button className="wide" onClick={() => press('enter')}>Enter</button>}
              {row.split('').map(k => <button key={k} className={keyState[k] || ''} onClick={() => press(k)}>{k}</button>)}
              {i === 2 && <button className="wide" onClick={() => press('del')} aria-label="Delete">⌫</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
