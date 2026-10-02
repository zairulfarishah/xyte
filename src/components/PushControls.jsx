import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, BellRing, Settings2, Share, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getPushState, enablePush, disablePush, isIos, isStandalone } from '../utils/push'

const PROMPT_KEY = 'xyte_push_prompt_dismissed'

function usePushState() {
  const [state, setState] = useState('loading')
  useEffect(() => {
    let cancelled = false
    getPushState().then(s => { if (!cancelled) setState(s) }).catch(() => { if (!cancelled) setState('unsupported') })
    return () => { cancelled = true }
  }, [])
  return [state, setState]
}

function useToggle(setState) {
  const { memberId } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run(fn) {
    setBusy(true); setError(null)
    try { setState(await fn()) } catch (err) { setError(err.message) }
    setBusy(false)
  }

  return {
    busy,
    error,
    turnOn: () => run(() => enablePush(memberId)),
    turnOff: () => run(disablePush),
  }
}

const needsHomeScreen = () => isIos() && !isStandalone()

// Rows for the avatar menu: device on/off + link to per-category settings.
export function PushToggle({ onNavigate }) {
  return (
    <>
      <PushDeviceRow />
      <Link
        to="/settings"
        onClick={onNavigate}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: '500', color: '#334155', textDecoration: 'none' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
      >
        <Settings2 size={14} /> Notification settings
      </Link>
    </>
  )
}

function PushDeviceRow() {
  const [state, setState] = usePushState()
  const { busy, error, turnOn, turnOff } = useToggle(setState)
  if (state === 'loading') return null

  const row = { width: '100%', padding: '11px 14px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '500', textAlign: 'left', fontFamily: 'inherit' }
  const hint = { fontSize: '11px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.4 }

  if (state === 'unsupported') {
    return (
      <div style={{ ...row, alignItems: 'flex-start', color: '#64748b' }}>
        <BellOff size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
        <div>
          Notifications unavailable
          <p style={hint}>{needsHomeScreen() ? 'Add Xyte to your Home Screen, then open it from the icon.' : 'This browser does not support push notifications.'}</p>
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div style={{ ...row, alignItems: 'flex-start', color: '#b45309' }}>
        <BellOff size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
        <div>
          Notifications blocked
          <p style={hint}>Allow notifications for Xyte in your browser or phone settings.</p>
        </div>
      </div>
    )
  }

  const on = state === 'on'
  return (
    <button
      onClick={on ? turnOff : turnOn}
      disabled={busy}
      style={{ ...row, cursor: busy ? 'default' : 'pointer', color: on ? '#16a34a' : '#2563eb', flexWrap: 'wrap' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {on ? <BellRing size={14} /> : <Bell size={14} />}
      <span style={{ flex: 1 }}>{busy ? 'Please wait…' : on ? 'Notifications on' : 'Turn on notifications'}</span>
      {on && !busy && <span style={{ fontSize: '11px', color: '#94a3b8' }}>Turn off</span>}
      {error && <span style={{ width: '100%', fontSize: '11px', color: '#dc2626' }}>{error}</span>}
    </button>
  )
}

// One-time card nudging people to turn notifications on (or, on iPhone Safari, to install first).
export function PushPrompt() {
  const [state, setState] = usePushState()
  const { busy, error, turnOn } = useToggle(setState)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(PROMPT_KEY) === '1' } catch { return false }
  })

  const mode = needsHomeScreen() ? 'install' : state === 'off' ? 'enable' : null
  if (dismissed || !mode) return null

  function dismiss() {
    try { localStorage.setItem(PROMPT_KEY, '1') } catch { /* storage unavailable */ }
    setDismissed(true)
  }

  return (
    <div style={{ position: 'fixed', left: '16px', right: '16px', bottom: '16px', zIndex: 1500, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: '420px', background: '#0f172a', color: 'white', border: '1px solid rgba(148,163,184,0.25)', borderRadius: '16px', boxShadow: '0 20px 50px rgba(2,6,23,0.45)', padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BellRing size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '13.5px', fontWeight: '700' }}>Get Xyte notifications</p>
          {mode === 'install' ? (
            <p style={{ fontSize: '12.5px', color: '#cbd5e1', marginTop: '4px', lineHeight: 1.5 }}>
              On iPhone: tap <Share size={12} style={{ verticalAlign: '-2px' }} /> <b>Share</b>, then <b>Add to Home Screen</b>. Open Xyte from the new icon and turn notifications on from your profile menu.
            </p>
          ) : (
            <>
              <p style={{ fontSize: '12.5px', color: '#cbd5e1', marginTop: '4px', lineHeight: 1.5 }}>
                Be alerted about mentions, assignments and claim updates, even when Xyte is closed.
              </p>
              {error && <p style={{ fontSize: '12px', color: '#fca5a5', marginTop: '6px' }}>{error}</p>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button onClick={() => turnOn()} disabled={busy} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {busy ? 'Turning on…' : 'Turn on'}
                </button>
                <button onClick={dismiss} style={{ background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
        <button onClick={dismiss} title="Dismiss" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={16} /></button>
      </div>
    </div>
  )
}
