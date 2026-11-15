import { FONT } from './kit'

// The big wall TV: a live mini dashboard, redrawn at most once a second
// (and straight away when the data changes).

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function createTV(kit) {
  const { canvas, texture } = kit.liveTex(1280, 720)
  let last = ''

  function draw(data, force = false) {
    const now = new Date()
    const key = now.getMinutes() * 100 + now.getSeconds() + '|' + (data?.version ?? 0)
    if (!force && key === last) return
    last = key
    const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height
    const crew = data?.crew || [], sites = data?.sites || []
    g.fillStyle = '#0c0f0e'; g.fillRect(0, 0, w, h)
    g.textBaseline = 'alphabetic'; g.textAlign = 'left'
    g.fillStyle = '#4fd36f'; g.font = `600 30px ${FONT}`; g.fillText('XYTE  ·  TODAY', 48, 64)
    g.fillStyle = '#9fb3a8'; g.font = `400 24px ${FONT}`
    g.fillText(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 48, 100)
    g.textAlign = 'right'; g.fillStyle = '#eef6f0'; g.font = `500 64px ${FONT}`
    g.fillText(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), w - 48, 92)
    g.textAlign = 'left'; g.fillStyle = '#26302b'; g.fillRect(48, 124, w - 96, 2)

    const onSite = crew.filter(c => c.status === 'site').length
    const inOffice = crew.filter(c => c.status === 'office').length
    const num = v => (v == null ? '—' : String(v))
    const tiles = [
      ['SITES TODAY', data ? num(sites.length) : '—', ''],
      ['IN OFFICE', data ? String(inOffice) : '—', data ? `/${crew.length}` : ''],
      ['ON SITE', data ? String(onSite) : '—', ''],
      ['WAITING APPROVAL', num(data?.approvals), ''],
    ]
    tiles.forEach(([l, n, sub], i) => {
      const x = 48 + i * 300, y = 152
      g.fillStyle = '#141a18'; g.fillRect(x, y, 280, 140)
      g.fillStyle = i === 2 ? '#e8a43c' : '#4fd36f'; g.fillRect(x, y, 4, 140)
      g.fillStyle = '#7f9488'; g.font = `500 20px ${FONT}`; g.fillText(l, x + 24, y + 40)
      g.fillStyle = '#eef6f0'; g.font = `500 66px ${FONT}`; g.fillText(n, x + 24, y + 112)
      if (sub) { const nw = g.measureText(n).width; g.fillStyle = '#5f7268'; g.font = `500 30px ${FONT}`; g.fillText(sub, x + 28 + nw, y + 112) }
    })

    g.fillStyle = '#7f9488'; g.font = `500 20px ${FONT}`
    g.fillText("TODAY'S SITES", 48, 346); g.fillText('CREW', 700, 346)
    if (!data) { g.fillStyle = '#8fa398'; g.font = `400 22px ${FONT}`; g.fillText('Loading…', 68, 400) }
    else if (!sites.length) { g.fillStyle = '#8fa398'; g.font = `400 22px ${FONT}`; g.fillText('No site work today', 68, 400) }
    sites.slice(0, 4).forEach((s, k) => {
      const y = 370 + k * 76
      g.fillStyle = '#141a18'; g.fillRect(48, y, 610, 64)
      g.fillStyle = '#eef6f0'; g.font = `500 25px ${FONT}`; g.fillText(cut(s.name, 38), 68, y + 30)
      g.fillStyle = '#8fa398'; g.font = `400 19px ${FONT}`; g.fillText(cut(s.detail, 52), 68, y + 54)
    })
    if (sites.length > 4) { g.fillStyle = '#8fa398'; g.font = `400 18px ${FONT}`; g.fillText(`+${sites.length - 4} more`, 68, 700) }

    crew.slice(0, 6).forEach((c, k) => {
      const col = k % 2, row = Math.floor(k / 2), x = 700 + col * 270, y = 370 + row * 100
      g.fillStyle = '#141a18'; g.fillRect(x, y, 250, 88)
      g.fillStyle = c.status === 'site' ? '#e8a43c' : c.status === 'office' ? '#4fd36f' : '#7d8a96'
      g.beginPath(); g.arc(x + 26, y + 30, 8, 0, 7); g.fill()
      g.fillStyle = '#eef6f0'; g.font = `500 23px ${FONT}`; g.fillText(cut(c.name, 15), x + 44, y + 38)
      g.fillStyle = '#8fa398'; g.font = `400 17px ${FONT}`
      const doing = c.status === 'site' ? `On site · ${c.site}` : c.status === 'leave' ? 'On leave' : c.status === 'off' ? 'Off today' : (c.doing || 'In office')
      g.fillText(cut(doing, 25), x + 20, y + 72)
    })
    if (crew.length > 6) { g.fillStyle = '#8fa398'; g.font = `400 18px ${FONT}`; g.fillText(`+${crew.length - 6} more`, 700, 712) }
    texture.needsUpdate = true
  }

  return { texture, draw }
}
