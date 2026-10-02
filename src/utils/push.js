import { supabase } from '../supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC_KEY

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker not registered:', err.message))
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

/**
 * 'unsupported' — this browser can't do push (on iPhone: not opened from the Home Screen icon)
 * 'denied'      — the user blocked notifications in browser/phone settings
 * 'on'          — this device is subscribed
 * 'off'         — can be turned on
 */
export async function getPushState() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

// Must be called from a click/tap — iOS only shows the permission prompt for a user gesture.
export async function enablePush(memberId) {
  if (!pushSupported()) throw new Error('Push notifications are not supported on this browser.')
  if (!memberId) throw new Error('Your account is not linked to a team member.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return getPushState()

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    member_id: memberId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 300),
  }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
  return 'on'
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return 'off'
}

// Ask the server to push freshly inserted notification rows to devices.
// Fire-and-forget: the bell still works if this fails (e.g. local dev has no /api).
export function sendPushFor(ids) {
  if (!ids?.length) return
  fetch('/api/send-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
    keepalive: true,
  }).catch(() => {})
}
