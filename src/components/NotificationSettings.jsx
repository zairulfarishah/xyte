import { useEffect, useState } from 'react'
import { BellRing, BellOff, Smartphone, Check } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { NOTIFICATION_CATEGORIES, isCategoryOn } from '../utils/notificationPrefs'
import { getPushState, enablePush, disablePush, isIos, isStandalone } from '../utils/push'

const card = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }
const head = { padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }

function Switch({ on, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      disabled={disabled}
      style={{ width: '42px', height: '24px', borderRadius: '999px', border: 'none', padding: '3px', cursor: disabled ? 'default' : 'pointer', background: on ? '#2563eb' : '#cbd5e1', transition: 'background 0.15s', flexShrink: 0, opacity: disabled ? 0.5 : 1 }}
    >
      <span style={{ display: 'block', width: '18px', height: '18px', borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transform: on ? 'translateX(18px)' : 'none', transition: 'transform 0.15s' }} />
    </button>
  )
}

function DeviceCard() {
  const { memberId } = useAuth()
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getPushState().then(s => { if (!cancelled) setState(s) }).catch(() => { if (!cancelled) setState('unsupported') })
    return () => { cancelled = true }
  }, [])

  async function toggle(next) {
    setBusy(true); setError(null)
    try { setState(next ? await enablePush(memberId) : await disablePush()) } catch (err) { setError(err.message) }
    setBusy(false)
  }

  const needsHomeScreen = isIos() && !isStandalone()
  const text = {
    loading: 'Checking…',
    on: 'Push notifications are on for this device.',
    off: 'Push notifications are off for this device.',
    denied: 'Notifications are blocked. Allow Xyte in your browser or phone settings, then come back here.',
    unsupported: needsHomeScreen
      ? 'On iPhone, tap Share → Add to Home Screen, then open Xyte from the new icon to turn notifications on.'
      : 'This browser does not support push notifications.',
  }[state]

  return (
    <div style={card}>
      <div style={{ ...head, display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: state === 'on' ? '#dcfce7' : '#f1f5f9', color: state === 'on' ? '#16a34a' : '#64748b', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          {state === 'on' ? <BellRing size={18} /> : state === 'off' ? <Smartphone size={18} /> : <BellOff size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>This device</h2>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', lineHeight: 1.5 }}>{text}</p>
          {error && <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>{error}</p>}
        </div>
        {(state === 'on' || state === 'off') && <Switch on={state === 'on'} onChange={toggle} disabled={busy} />}
      </div>
      <p style={{ padding: '10px 20px', fontSize: '11.5px', color: '#94a3b8', background: '#f8fafc' }}>
        Turn this on once on each phone or computer you use. The choices below apply to all your devices.
      </p>
    </div>
  )
}

export default function NotificationSettings() {
  const { memberId } = useAuth()
  const [prefs, setPrefs] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [savedKey, setSavedKey] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!memberId) return undefined
    let cancelled = false
    supabase.from('notification_prefs').select('prefs').eq('member_id', memberId).maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError(`Could not load your settings: ${err.message}`)
        setPrefs(data?.prefs || {})
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [memberId])

  async function setCategory(key, on) {
    const next = { ...prefs, [key]: on }
    setPrefs(next)
    setError(null)
    const { error: err } = await supabase.from('notification_prefs').upsert({ member_id: memberId, prefs: next, updated_at: new Date().toISOString() })
    if (err) { setError(`Could not save: ${err.message}`); setPrefs(prefs); return }
    setSavedKey(key)
    setTimeout(() => setSavedKey(k => (k === key ? null : k)), 1500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <DeviceCard />

      <div style={card}>
        <div style={head}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>Notify me about</h2>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Choose which updates are pushed to your phone. Everything still appears in the bell.</p>
        </div>
        {!memberId ? (
          <p style={{ padding: '20px', fontSize: '13px', color: '#94a3b8' }}>Your account is not linked to a team member.</p>
        ) : (
          <div>
            {NOTIFICATION_CATEGORIES.map((c, i) => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13.5px', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {c.label}
                    {savedKey === c.key && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: '600', color: '#16a34a' }}><Check size={12} /> Saved</span>}
                  </p>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', lineHeight: 1.45 }}>{c.hint}</p>
                </div>
                <Switch on={isCategoryOn(prefs, c.key)} onChange={on => setCategory(c.key, on)} disabled={!loaded} />
              </div>
            ))}
          </div>
        )}
        {error && <p style={{ padding: '10px 20px', fontSize: '12px', color: '#dc2626', borderTop: '1px solid #fee2e2', background: '#fff1f2' }}>{error}</p>}
      </div>
    </div>
  )
}
