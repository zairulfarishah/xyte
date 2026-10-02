// Xyte service worker — only handles push notifications (no offline caching).

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data?.text() } }

  event.waitUntil(self.registration.showNotification(data.title || 'Xyte', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.tag,
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(w => w.url.startsWith(self.location.origin))
    if (existing) {
      await existing.focus()
      if ('navigate' in existing) await existing.navigate(url)
      return
    }
    await self.clients.openWindow(url)
  })())
})
