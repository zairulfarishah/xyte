import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { rm } from '../utils/makan'
import LunchSpin from './LunchSpin'
import SplitBill from './SplitBill'
import TeamQR from './TeamQR'
import Games from './games/Games'
import { GAMES } from './games/scores'
import './BreakRoom.css'

const SECTIONS = [
  { key: 'eat',   emoji: '🍽️', title: 'Where to eat',     hint: 'Everyone puts in a place, the wheel decides' },
  { key: 'pay',   emoji: '💳', title: 'QR & split bill',  hint: "Everyone's DuitNow QR, and who owes who" },
  { key: 'games', emoji: '🎮', title: 'Games',            hint: 'Quick games for the break — beat the team’s high score' },
]
// Links from before the home page existed (?tab=…)
const LEGACY = { spin: { section: 'eat' }, bills: { section: 'pay', view: 'bills' }, qr: { section: 'pay' }, games: { section: 'games' } }

export default function BreakRoom() {
  const [params, setParams] = useSearchParams()
  const [members, setMembers] = useState([])
  const [setupError, setSetupError] = useState(null)

  const legacy = LEGACY[params.get('tab')]
  const sectionKey = legacy?.section || params.get('section')
  const section = SECTIONS.find(s => s.key === sectionKey)
  const view = (legacy?.view || params.get('view')) === 'bills' ? 'bills' : 'qr'

  const go = useCallback(next => setParams(next), [setParams])

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase.from('team_members').select('*').order('full_name')
    if (error) setSetupError(error.message)
    setMembers(data || [])
  }, [])
  useEffect(() => { loadMembers() }, [loadMembers])

  return (
    <div className="mk">
      <div className="xt-hero">
        {section && <button className="br-back" onClick={() => go({})}><ArrowLeft size={14} /> Break Room</button>}
        <h1>{section ? `${section.emoji} ${section.title}` : 'Break Room'}</h1>
        <p>{section ? section.hint : 'Lunch, paying each other back, and a quick game'}</p>
        {section?.key === 'pay' && (
          <div className="xt-tabs" role="tablist">
            <button className={view === 'qr' ? 'on' : ''} onClick={() => go({ section: 'pay' })}>Team QR</button>
            <button className={view === 'bills' ? 'on' : ''} onClick={() => go({ section: 'pay', view: 'bills' })}>Split bill</button>
          </div>
        )}
      </div>

      <div className="mk-body">
        {setupError && <SetupNotice message={setupError} />}
        {!section && <Home members={members} onOpen={key => go({ section: key })} />}
        {section?.key === 'eat' && <LunchSpin members={members} onSetupError={setSetupError} />}
        {section?.key === 'pay' && view === 'qr' && (
          <TeamQR members={members} onSaved={loadMembers}
            editMe={params.get('edit') === 'me'} onEditMeDone={() => go({ section: 'pay' })} />
        )}
        {section?.key === 'pay' && view === 'bills' && (
          <SplitBill members={members} onSetupError={setSetupError} onOpenQr={() => go({ section: 'pay', edit: 'me' })} />
        )}
        {section?.key === 'games' && <Games />}
      </div>
    </div>
  )
}

// The three cards, each with a live line about what's going on inside
function Home({ members, onOpen }) {
  const { memberId } = useAuth()
  const [eat, setEat] = useState(null)
  const [owe, setOwe] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: rounds } = await supabase.from('lunch_rounds').select('id, title, status, winner_idea_id').order('created_at', { ascending: false }).limit(1)
      const round = rounds?.[0]
      let line = 'Start a spin for lunch'
      if (round?.status === 'open') {
        const { count } = await supabase.from('lunch_ideas').select('id', { count: 'exact', head: true }).eq('round_id', round.id)
        line = `${round.title} spin open · ${count || 0} place${count === 1 ? '' : 's'} in`
      } else if (round?.winner_idea_id) {
        const { data: w } = await supabase.from('lunch_ideas').select('place').eq('id', round.winner_idea_id).maybeSingle()
        if (w) line = `Last pick: ${w.place}`
      }
      if (!cancelled) setEat(line)

      if (memberId) {
        const { data: shares } = await supabase.from('bill_shares').select('amount, bills(payer_id)').eq('member_id', memberId).is('received_at', null)
        const total = (shares || []).filter(s => s.bills?.payer_id !== memberId).reduce((n, s) => n + Number(s.amount || 0), 0)
        if (!cancelled) setOwe(total)
      }
    })().catch(() => {})
    return () => { cancelled = true }
  }, [memberId])

  const withQr = members.filter(m => m.pay_qr_url).length
  const lines = {
    eat: eat || ' ',
    pay: owe > 0 ? `You owe ${rm(owe)} · ${withQr} QR codes` : `${withQr} of ${members.length} have a QR · you're all square`,
    games: `${GAMES.map(g => g.emoji).join(' ')} · ${GAMES.length} games`,
  }

  return (
    <div className="br-home">
      {SECTIONS.map(s => (
        <button key={s.key} className={`br-card br-${s.key}`} onClick={() => onOpen(s.key)}>
          <span className="em">{s.emoji}</span>
          <b>{s.title}</b>
          <small>{s.hint}</small>
          <span className="live">{lines[s.key]}<ChevronRight size={16} /></span>
        </button>
      ))}
    </div>
  )
}

function SetupNotice({ message }) {
  return (
    <div className="mk-card mk-pad" style={{ borderLeft: '4px solid #ef4444' }}>
      <b style={{ color: '#991b1b' }}>Break Room database needs setting up</b>
      <p className="mk-sub">Supabase said: <b>{message}</b><br />Run <code>sql/setup-makan.sql</code> in the Supabase SQL editor, then reload this page.</p>
    </div>
  )
}
