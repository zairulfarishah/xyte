import { activeMembers } from '../utils/members'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Brain, CircleCheck, Dices, Gamepad2, Puzzle, QrCode, Trophy, Users, Utensils, Wallet, Zap } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { rm } from '../utils/makan'
import LunchSpin from './LunchSpin'
import SplitBill from './SplitBill'
import TeamQR from './TeamQR'
import Games from './games/Games'
import { GAMES } from './games/scores'
import { groupOf } from './games/gameArt'
import './BreakRoom.css'
import './BreakRoomCards.css'

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
        {!section && <Home members={activeMembers(members)} onOpen={key => go({ section: key })} />}
        {section?.key === 'eat' && <LunchSpin members={members} onSetupError={setSetupError} />}
        {section?.key === 'pay' && view === 'qr' && (
          <TeamQR members={activeMembers(members)} onSaved={loadMembers}
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
      let line = { label: 'Lunch today', value: 'No pick yet', barLabel: 'Next lunch', barValue: 'Start a spin' }
      if (round?.status === 'open') {
        const { count } = await supabase.from('lunch_ideas').select('id', { count: 'exact', head: true }).eq('round_id', round.id)
        line = { open: true, label: 'Lunch spin open', value: `${count || 0} place${count === 1 ? '' : 's'} in so far`, barLabel: `${round.title || 'Lunch'} spin`, barValue: 'Add your place' }
      } else if (round?.winner_idea_id) {
        const { data: w } = await supabase.from('lunch_ideas').select('place').eq('id', round.winner_idea_id).maybeSingle()
        if (w) line = { label: 'Last pick', value: w.place, barLabel: 'Next lunch', barValue: 'Start a new spin' }
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
  const qrPct = members.length ? Math.round(withQr / members.length * 100) : 0
  const owing = owe > 0
  const cats = GAME_CATS.map(c => ({ ...c, n: GAMES.filter(g => groupOf(g.key) === c.key).length })).filter(c => c.n > 0)
  const [eatS, payS, gamesS] = SECTIONS

  return (
    <div className="brc-grid">
      <div className="brc-row">
        <button type="button" className="brc eat" onClick={() => onOpen('eat')}>
          <WheelArt />
          <span className="brc-head">
            <span className="brc-ico"><Utensils /></span>
            <span className={`brc-tag${eat?.open ? ' live' : ''}`}>{eat?.open ? 'Spin open' : 'Lunch'}</span>
          </span>
          <b className="brc-title">{eatS.title}</b>
          <small className="brc-desc">{eatS.hint}</small>
          <span className="brc-mid brc-big"><em>{eat?.label || 'Lunch'}</em><strong>{eat?.value || '…'}</strong></span>
          <InfoBar icon={eat?.open ? Users : Dices} label={eat?.barLabel || 'Next lunch'} value={eat?.barValue || '…'} />
        </button>

        <button type="button" className="brc pay" onClick={() => onOpen('pay')}>
          <QrArt />
          <span className="brc-head">
            <span className="brc-ico"><QrCode /></span>
            <span className="brc-tag">DuitNow</span>
          </span>
          <b className="brc-title">{payS.title}</b>
          <small className="brc-desc">{payS.hint}</small>
          <span className="brc-mid">
            <span className="brc-stat"><strong>{withQr}<small>/{members.length}</small></strong><span>QR codes registered</span></span>
            <span className="brc-prog" role="progressbar" aria-valuemin={0} aria-valuemax={members.length} aria-valuenow={withQr} aria-label="Team QR codes registered"><i style={{ width: `${qrPct}%` }} /></span>
          </span>
          <InfoBar icon={owing ? Wallet : CircleCheck} label={owing ? 'You owe' : 'Your bills'} value={owing ? rm(owe) : "You're all square"} />
        </button>

        <button type="button" className="brc games" onClick={() => onOpen('games')}>
          <Gamepad2 className="brc-art" strokeWidth={1.4} aria-hidden="true" />
          <span className="brc-head">
            <span className="brc-ico"><Gamepad2 /></span>
            <span className="brc-tag">Leaderboard</span>
          </span>
          <b className="brc-title">{gamesS.title}</b>
          <small className="brc-desc">{gamesS.hint}</small>
          <span className="brc-mid">
            <span className="brc-stat"><strong>{GAMES.length}</strong><span>games to play</span></span>
            <span className="brc-cats">
              {cats.map(({ key, label, Icon, n }) => <span key={key} className="brc-cat"><Icon />{label}<em>{n}</em></span>)}
            </span>
          </span>
          <InfoBar icon={Trophy} label="New every day" value={GAMES.filter(g => g.sum).map(g => g.name).join(' & ') || 'Beat the high score'} />
        </button>
      </div>
    </div>
  )
}

// Game groups shown on the Games card (same groups as the arcade filters)
const GAME_CATS = [
  { key: 'arcade', label: 'Arcade', Icon: Gamepad2 },
  { key: 'puzzle', label: 'Puzzle', Icon: Puzzle },
  { key: 'quiz',   label: 'Quiz',   Icon: Brain },
  { key: 'reflex', label: 'Reflex', Icon: Zap },
]

function InfoBar({ icon: Icon, label, value }) {
  return (
    <span className="brc-bar">
      <span className="brc-bar-ico"><Icon /></span>
      <span className="brc-bar-txt"><em>{label}</em><strong>{value}</strong></span>
      <span className="brc-go"><ArrowRight /></span>
    </span>
  )
}

const WheelArt = () => (
  <svg className="brc-art" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" aria-hidden="true">
    <circle cx="50" cy="50" r="44" /><path d="M50 6v88M6 50h88M19 19l62 62M81 19 19 81" /><circle cx="50" cy="50" r="9" fill="currentColor" />
  </svg>
)

const QR_DOTS = [[17,17,6],[77,17,6],[17,77,6],[44,4,10],[44,22,10],[44,44,10],[62,44,10],[86,44,10],[4,44,10],[22,44,10],[44,64,10],[64,64,10],[86,74,10],[54,86,10],[74,86,10]]
const QrArt = () => (
  <svg className="brc-art" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M4 4h32v32H4zm8 8v16h16V12zM64 4h32v32H64zm8 8v16h16V12zM4 64h32v32H4zm8 8v16h16V72z" />
    {QR_DOTS.map(([x, y, s]) => <rect key={`${x}-${y}`} x={x} y={y} width={s} height={s} />)}
  </svg>
)

function SetupNotice({ message }) {
  return (
    <div className="mk-card mk-pad" style={{ borderLeft: '4px solid #ef4444' }}>
      <b style={{ color: '#991b1b' }}>Break Room database needs setting up</b>
      <p className="mk-sub">Supabase said: <b>{message}</b><br />Run <code>sql/setup-makan.sql</code> in the Supabase SQL editor, then reload this page.</p>
    </div>
  )
}
