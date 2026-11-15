import { FONT } from './kit'

// Digital wall clock above the pantry: real time and date, matte face (no glow).
// Malaysia time, whatever the computer's own time zone is.

const TZ = 'Asia/Kuala_Lumpur'
export const myTime = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]))
  return { hh: p.hour, mm: p.minute, hour: Number(p.hour) }
}

export function createWallClock(kit) {
  const { canvas, texture } = kit.liveTex(720, 320)
  let last = ''
  function draw(force = false) {
    const d = new Date()
    const { hh, mm } = myTime(d)
    const date = d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(/,/g, '')
    const key = hh + mm + date
    if (!force && key === last) return
    last = key
    const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height
    g.fillStyle = '#211d19'; g.fillRect(0, 0, w, h)
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    g.fillStyle = '#e9dfcc'; g.font = `500 150px ${FONT}`
    g.fillText(`${hh}:${mm}`, w / 2, 170)
    g.fillStyle = '#3a332b'; g.fillRect(70, 200, w - 140, 2)
    g.fillStyle = '#c9b99d'; g.font = `500 52px ${FONT}`
    g.fillText(date, w / 2, 276)
    texture.needsUpdate = true
  }
  return { texture, draw }
}
