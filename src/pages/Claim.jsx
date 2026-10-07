import { useViewport } from '../utils/useViewport'
import { Car, Receipt } from 'lucide-react'
import PageTabs from '../components/PageTabs'
import { useTabParam } from '../utils/useTabParam'
import MileageClaims from './MileageClaims'
import ExpenseClaims from './ExpenseClaims'

const TABS = [
  { key: 'mileage', label: 'Mileage', Icon: Car,     hint: 'Journey-by-journey mileage claim forms' },
  { key: 'expense', label: 'Other Claims', Icon: Receipt, hint: 'Travel, meals, materials and other expenses' },
]

export default function Claim() {
  const { isMobile } = useViewport()
  const [tab, setTab] = useTabParam(TABS.map(t => t.key), 'mileage')
  const active = TABS.find(t => t.key === tab)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 148px,#dde4ed 148px 100%)' }}>
      <PageTabs title="Claims" hint={active.hint} tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ padding: isMobile ? '16px 14px 48px' : '24px 32px 48px' }}>
        {tab === 'mileage' ? <MileageClaims /> : <ExpenseClaims />}
      </div>
    </div>
  )
}
