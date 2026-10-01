import { useState } from 'react'
import { useViewport } from '../utils/useViewport'
import { useAuth } from '../context/AuthContext'
import { Clock, Users, FileBarChart } from 'lucide-react'
import MyTimecard from './MyTimecard'
import TeamTimecards from './TeamTimecards'
import TimecardSummary from './TimecardSummary'

const TABS = [
  { key: 'timecard', label: 'Timecard', Icon: Clock, hint: 'Key in your time in and time out — OT is worked out for you' },
  { key: 'team',     label: 'Team',     Icon: Users, hint: "Everyone's hours and OT for the month" },
  { key: 'summary',  label: 'Summary',  Icon: FileBarChart, hint: 'OT totals per member for payroll, with printable timecards', adminOnly: true },
]

export default function Schedule() {
  const { isMobile } = useViewport()
  const { memberId, isZairul } = useAuth()
  const [tab, setTab] = useState('timecard')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  // null until someone is picked, so it follows memberId once auth has loaded.
  const [pickedId, setPickedId] = useState(null)
  const viewId = pickedId || memberId

  const tabs = TABS.filter(t => !t.adminOnly || isZairul)
  const active = tabs.find(t => t.key === tab) || tabs[0]

  function openMember(id) {
    setPickedId(id)
    setTab('timecard')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 148px,#dde4ed 148px 100%)' }}>

      <div style={{ padding: isMobile ? '18px 14px 0' : '24px 32px 0' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Schedule</h1>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>{active.hint}</p>

        <div style={{ display: 'flex', gap: '5px', marginTop: '14px', background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: '999px', padding: '5px', width: 'max-content', maxWidth: '100%' }}>
          {tabs.map(({ key, label, Icon }) => {
            const isActive = active.key === key
            return (
              <button
                key={key}
                onClick={() => { setTab(key); if (key === 'timecard') setPickedId(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '9px 20px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                  fontSize: '13.5px', fontWeight: '800', whiteSpace: 'nowrap', transition: 'all 0.15s',
                  background: isActive ? '#2563eb' : 'transparent',
                  color: isActive ? 'white' : '#e2e8f0',
                  boxShadow: isActive ? '0 8px 18px rgba(37,99,235,0.45)' : 'none',
                }}
              >
                <Icon size={15} /> {label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: isMobile ? '16px 14px 48px' : '24px 32px 48px' }}>
        {active.key === 'summary' ? <TimecardSummary />
          : active.key === 'team' ? <TeamTimecards month={month} setMonth={setMonth} onOpenMember={openMember} />
          : <MyTimecard month={month} setMonth={setMonth} viewId={viewId} setViewId={setPickedId} />}
      </div>
    </div>
  )
}
