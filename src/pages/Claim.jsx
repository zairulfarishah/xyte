import { useState } from 'react'
import { useViewport } from '../utils/useViewport'
import { Car, Receipt } from 'lucide-react'
import MileageClaims from './MileageClaims'
import ExpenseClaims from './ExpenseClaims'

const TABS = [
  { key: 'mileage', label: 'Mileage', Icon: Car,     hint: 'Journey-by-journey mileage claim forms' },
  { key: 'expense', label: 'Other Claims', Icon: Receipt, hint: 'Travel, meals, materials and other expenses' },
]

export default function Claim() {
  const { isMobile } = useViewport()
  const [tab, setTab] = useState('mileage')
  const active = TABS.find(t => t.key === tab)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 148px,#dde4ed 148px 100%)' }}>

      <div style={{ padding: isMobile ? '18px 14px 0' : '24px 32px 0' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Claim</h1>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>{active.hint}</p>

        <div style={{ display: 'flex', gap: '5px', marginTop: '14px', background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: '999px', padding: '5px', width: 'max-content', maxWidth: '100%' }}>
          {TABS.map(({ key, label, Icon }) => {
            const isActive = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
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
        {tab === 'mileage' ? <MileageClaims /> : <ExpenseClaims />}
      </div>
    </div>
  )
}
