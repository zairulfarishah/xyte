import { useCallback, useEffect, useState } from 'react'
import { Dices, Gamepad2, Receipt, QrCode } from 'lucide-react'
import { supabase } from '../supabase'
import PageTabs from '../components/PageTabs'
import { useTabParam } from '../utils/useTabParam'
import LunchSpin from './LunchSpin'
import SplitBill, { MyPayQR } from './SplitBill'
import Games from './games/Games'
import './BreakRoom.css'

const TABS = [
  { key: 'spin',  label: 'Lunch spin', Icon: Dices,   hint: 'Everyone puts in a place, the wheel decides' },
  { key: 'bills', label: 'Split bill', Icon: Receipt, hint: 'One person pays, everyone settles up with their QR' },
  { key: 'games', label: 'Games',      Icon: Gamepad2, hint: 'Quick games for the break — beat the team’s high score' },
  { key: 'qr',    label: 'My QR',      Icon: QrCode,  hint: 'Your DuitNow QR and bank details, shown when someone pays you back' },
]

export default function BreakRoom() {
  const [tab, setTab] = useTabParam(TABS.map(t => t.key), 'spin')
  const [members, setMembers] = useState([])
  const [setupError, setSetupError] = useState(null)
  const active = TABS.find(t => t.key === tab)

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase.from('team_members').select('*').order('full_name')
    if (error) setSetupError(error.message)
    setMembers(data || [])
  }, [])
  useEffect(() => { loadMembers() }, [loadMembers])

  return (
    <div className="mk">
      <PageTabs title="Break Room" hint={active.hint} tabs={TABS} active={tab} onChange={setTab} />
      <div className="mk-body">
        {setupError && <SetupNotice message={setupError} />}
        {tab === 'spin' && <LunchSpin members={members} onSetupError={setSetupError} />}
        {tab === 'bills' && <SplitBill members={members} onSetupError={setSetupError} onOpenQr={() => setTab('qr')} />}
        {tab === 'games' && <Games />}
        {tab === 'qr' && <MyPayQR members={members} onSaved={loadMembers} />}
      </div>
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
