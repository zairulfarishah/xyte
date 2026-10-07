import { useState } from 'react'
import { useViewport } from '../utils/useViewport'
import { useAuth } from '../context/AuthContext'
import { Clock, Users, FileBarChart } from 'lucide-react'
import PageTabs from '../components/PageTabs'
import { useTabParam } from '../utils/useTabParam'
import MyTimecard from './MyTimecard'
import TeamTimecards from './TeamTimecards'
import TimecardSummary from './TimecardSummary'

const TABS = [
  { key: 'timecard', label: 'My timecard', Icon: Clock, hint: 'Key in your time in and time out — OT is worked out for you' },
  { key: 'team',     label: 'Team',     Icon: Users, hint: "Everyone's hours and OT for the month" },
  { key: 'summary',  label: 'Summary',  Icon: FileBarChart, hint: 'OT totals per member for payroll, with printable timecards', adminOnly: true },
]

export default function Schedule() {
  const { isMobile } = useViewport()
  const { memberId, isZairul } = useAuth()
  const tabs = TABS.filter(t => !t.adminOnly || isZairul)
  const [tab, setTab] = useTabParam(tabs.map(t => t.key), 'timecard')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  // null until someone is picked, so it follows memberId once auth has loaded.
  const [pickedId, setPickedId] = useState(null)
  const viewId = pickedId || memberId
  const active = tabs.find(t => t.key === tab) || tabs[0]

  function openMember(id) {
    setPickedId(id)
    setTab('timecard')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 148px,#dde4ed 148px 100%)' }}>
      <PageTabs title="Timecard" hint={active.hint} tabs={tabs} active={active.key}
        onChange={key => { setTab(key); if (key === 'timecard') setPickedId(null) }} />

      <div style={{ padding: isMobile ? '16px 14px 48px' : '24px 32px 48px' }}>
        {active.key === 'summary' ? <TimecardSummary />
          : active.key === 'team' ? <TeamTimecards month={month} setMonth={setMonth} onOpenMember={openMember} />
          : <MyTimecard month={month} setMonth={setMonth} viewId={viewId} setViewId={setPickedId} />}
      </div>
    </div>
  )
}
