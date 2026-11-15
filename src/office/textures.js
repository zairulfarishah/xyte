import { C, seeded } from './kit'

// Every texture in the room is drawn on a canvas — no image files.

export function buildTextures({ tex, rnd, pick }) {
  const T = {}

  T.floor = tex(1024, 1024, (g, w, h) => {
    const n = 8, t = w / n
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const l = 52 + rnd() * 4
      g.fillStyle = `hsl(210,3%,${l}%)`; g.fillRect(a * t, b * t, t, t)
      // carpet tiles laid in alternating direction
      g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 1
      for (let k = 3; k < t; k += 5) { g.beginPath(); if ((a + b) % 2) { g.moveTo(a * t + k, b * t); g.lineTo(a * t + k, b * t + t) } else { g.moveTo(a * t, b * t + k); g.lineTo(a * t + t, b * t + k) } g.stroke() }
    }
    for (let i = 0; i < 60000; i++) { const v = rnd(); g.fillStyle = v < .5 ? `rgba(40,42,46,${.25 + rnd() * .3})` : `rgba(210,212,214,${.2 + rnd() * .3})`; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5) }
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1
    for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(k * t, 0); g.lineTo(k * t, h); g.moveTo(0, k * t); g.lineTo(w, k * t); g.stroke() }
  }, [3, 2.5])

  T.wall = tex(512, 512, (g, w, h) => {
    g.fillStyle = C.wall; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(120,115,105,${rnd() * .03})`; g.fillRect(rnd() * w, rnd() * h, 2, 2) }
  }, [6, 2])

  T.rug = tex(1024, 768, (g, w, h) => {
    g.fillStyle = '#4b4e53'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 40000; i++) { g.fillStyle = rnd() < .5 ? 'rgba(20,20,22,.35)' : 'rgba(150,152,156,.25)'; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5) }
    g.strokeStyle = '#3c3f43'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14)
  })

  // framed pictures – drawn, not photos
  const paperBg = (g, w, h) => {
    g.fillStyle = C.paper; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(120,90,50,${rnd() * .05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2) }
  }
  T.picSites = tex(512, 380, (g, w, h) => {
    paperBg(g, w, h)
    g.strokeStyle = '#9cc1c4'; g.lineWidth = 16; g.beginPath(); g.moveTo(-10, 300); g.bezierCurveTo(140, 250, 220, 360, 520, 280); g.stroke()
    g.strokeStyle = '#c9b48f'; g.lineWidth = 9;
    [[0, 110, 512, 150], [140, 0, 190, 380], [330, 0, 300, 380], [0, 230, 512, 205]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke() })
    g.strokeStyle = '#ddd0b4'; g.lineWidth = 4
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(rnd() * w, rnd() * h); g.lineTo(rnd() * w, rnd() * h); g.stroke() }
    ;[[110, 90], [250, 175], [400, 120], [360, 270], [190, 300]].forEach(([x, y], i) => {
      g.fillStyle = i === 1 ? '#e0664f' : '#2f9a55'
      g.beginPath(); g.arc(x, y - 22, 15, Math.PI, 0); g.lineTo(x, y); g.closePath(); g.fill()
      g.fillStyle = C.paper; g.beginPath(); g.arc(x, y - 22, 5.5, 0, 7); g.fill()
    })
    g.fillStyle = C.ink; g.font = '600 26px Georgia'; g.fillText('Site arrangement', 24, 44)
  })
  T.picSchedule = tex(512, 380, (g, w, h) => {
    paperBg(g, w, h)
    g.fillStyle = C.ink; g.font = '600 26px Georgia'; g.fillText('This week', 24, 44)
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'], x0 = 70, y0 = 80, cw = 60, ch = 40
    g.font = '500 16px monospace'; g.fillStyle = '#6b5d4d'
    days.forEach((d, i) => g.fillText(d, x0 + i * cw + 24, y0 - 10))
    const cols = ['#3f8f5a', '#c58a3a', '#9a5446', '#d9ccb2']
    for (let r = 0; r < 6; r++) {
      g.fillStyle = '#6b5d4d'; g.fillRect(28, y0 + r * (ch + 8) + 14, 26, 10)
      for (let c = 0; c < 7; c++) {
        g.fillStyle = c > 4 ? '#e2d7c0' : (rnd() < .65 ? cols[0] : pick(cols))
        g.fillRect(x0 + c * cw + 3, y0 + r * (ch + 8), cw - 6, ch)
      }
    }
  })
  T.picTeam = tex(512, 380, (g, w, h) => {
    paperBg(g, w, h)
    g.fillStyle = '#d6c6a6'; g.fillRect(0, 250, w, 130)
    const tones = ['#7d5a43', '#a87c5b', '#5f4535', '#8f6a50', '#b48a68', '#6d503d']
    const shirts = ['#2f6b43', '#3c4f63', '#7a3e33', '#2f6b43', '#5a5a52', '#3c4f63']
    ;[70, 150, 230, 310, 390, 455].forEach((x, i) => {
      const y = i % 2 ? 210 : 190
      g.fillStyle = shirts[i]; g.beginPath(); g.ellipse(x, y + 120, 46, 80, 0, Math.PI, 0); g.fill(); g.fillRect(x - 46, y + 120, 92, 80)
      g.fillStyle = tones[i]; g.beginPath(); g.arc(x, y + 10, 26, 0, 7); g.fill()
      g.fillStyle = '#e8a43c'; g.beginPath(); g.ellipse(x, y - 10, 30, 14, 0, Math.PI, 0); g.fill(); g.fillRect(x - 34, y - 12, 68, 5)
    })
    g.fillStyle = C.ink; g.font = '600 26px Georgia'; g.fillText('The crew', 24, 44)
  })
  T.plaque = text => tex(256, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d2b06a'); gr.addColorStop(1, '#9c7a3a')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    g.fillStyle = '#3a2a12'; g.font = '600 26px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 1)
  })
  T.night = tex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d1626'); gr.addColorStop(.7, '#1d2b3b'); gr.addColorStop(1, '#33404a')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * .7})`; g.fillRect(rnd() * w, rnd() * h * .5, 1.5, 1.5) }
    g.fillStyle = '#efe6c8'; g.beginPath(); g.arc(380, 110, 26, 0, 7); g.fill()
    g.fillStyle = '#1d2b3b'; g.beginPath(); g.arc(392, 102, 24, 0, 7); g.fill()
    let x = 0
    while (x < w) {
      const bw = 30 + rnd() * 60, bh = 80 + rnd() * 220
      g.fillStyle = '#0b1018'; g.fillRect(x, h - bh, bw, bh)
      for (let yy = h - bh + 8; yy < h - 6; yy += 12) for (let xx = x + 5; xx < x + bw - 5; xx += 9)
        if (rnd() < .3) { g.fillStyle = rnd() < .8 ? 'rgba(240,190,110,.85)' : 'rgba(150,220,200,.8)'; g.fillRect(xx, yy, 4, 6) }
      x += bw + 2
    }
  })
  // daytime view uses its own random so the rest of the room stays the same
  const rnd2 = seeded(99)
  T.day = tex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5aa0d8'); gr.addColorStop(.6, '#a9d1ee'); gr.addColorStop(1, '#e6eef0')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(255,248,220,.9)'; g.beginPath(); g.arc(380, 100, 30, 0, 7); g.fill()
    g.fillStyle = 'rgba(255,248,220,.25)'; g.beginPath(); g.arc(380, 100, 52, 0, 7); g.fill()
    for (const [cx, cy, s] of [[110, 90, 1], [250, 150, .7], [60, 200, .6], [440, 220, .8]]) {
      g.fillStyle = 'rgba(255,255,255,.92)'
      for (const [dx, dy, r] of [[0, 0, 26], [24, -10, 22], [48, 0, 24], [22, 8, 24]]) { g.beginPath(); g.arc(cx + dx * s, cy + dy * s, r * s, 0, 7); g.fill() }
    }
    let x = 0
    while (x < w) {
      const bw = 30 + rnd2() * 60, bh = 80 + rnd2() * 220
      g.fillStyle = ['#8d98a3', '#a7b0b8', '#7b8794', '#c3c8c9', '#97a4ad'][Math.floor(rnd2() * 5)]
      g.fillRect(x, h - bh, bw, bh)
      g.fillStyle = 'rgba(40,60,80,.35)'
      for (let yy = h - bh + 8; yy < h - 6; yy += 12) for (let xx = x + 5; xx < x + bw - 5; xx += 9) g.fillRect(xx, yy, 4, 6)
      x += bw + 2
    }
    g.fillStyle = '#5f8f4e'; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(rnd2() * w, h - 4, 12 + rnd2() * 14, Math.PI, 0); g.fill() }
  })
  T.cork = tex(512, 360, (g, w, h) => {
    g.fillStyle = '#b48857'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < .5 ? 'rgba(90,55,25,.25)' : 'rgba(230,190,140,.2)'; g.fillRect(rnd() * w, rnd() * h, 2, 2) }
    const notes = [[30, 30, 150, 120, '#f2ead6'], [200, 24, 130, 160, '#f4e39a'], [350, 40, 140, 110, '#f2ead6'], [40, 180, 170, 140, '#cfe6d2'], [250, 210, 120, 120, '#f2ead6'], [390, 180, 100, 150, '#f6c9b8']]
    notes.forEach(([x, y, nw, nh, c], i) => {
      g.save(); g.translate(x + nw / 2, y + nh / 2); g.rotate((rnd() - .5) * .12)
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-nw / 2 + 4, -nh / 2 + 5, nw, nh)
      g.fillStyle = c; g.fillRect(-nw / 2, -nh / 2, nw, nh)
      g.fillStyle = '#6b5d4d'
      for (let l = 0; l < 5; l++) g.fillRect(-nw / 2 + 12, -nh / 2 + 26 + l * 16, (nw - 24) * (.5 + rnd() * .5), 4)
      g.fillStyle = i % 2 ? '#c0392b' : '#2f6b43'; g.beginPath(); g.arc(0, -nh / 2 + 10, 7, 0, 7); g.fill()
      g.restore()
    })
  })
  T.whiteboard = tex(640, 400, (g, w, h) => {
    g.fillStyle = '#f3f2ee'; g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(0,0,0,.03)'; for (let i = 0; i < 30; i++) g.fillRect(rnd() * w, rnd() * h, 120, 10)
    g.strokeStyle = '#2d4a7a'; g.fillStyle = '#2d4a7a'; g.lineWidth = 3; g.font = '600 30px "Comic Sans MS", cursive'
    g.fillText('TO DO', 34, 52)
    for (let i = 0; i < 5; i++) {
      const y = 90 + i * 56; g.strokeRect(36, y, 22, 22)
      if (i < 2) { g.strokeStyle = '#2f8a4a'; g.beginPath(); g.moveTo(38, y + 10); g.lineTo(46, y + 20); g.lineTo(62, y - 4); g.stroke(); g.strokeStyle = '#2d4a7a' }
      g.beginPath(); g.moveTo(76, y + 12); for (let x = 76; x < 76 + 140 + rnd() * 160; x += 12) g.lineTo(x, y + 12 + Math.sin(x * .3) * 4); g.stroke()
    }
    g.strokeStyle = '#b23a2e'; g.lineWidth = 3; g.strokeRect(430, 80, 170, 120)
    g.beginPath(); g.moveTo(430, 140); g.lineTo(600, 140); g.moveTo(515, 80); g.lineTo(515, 200); g.stroke()
    g.fillStyle = '#b23a2e'; g.font = '600 22px "Comic Sans MS", cursive'; g.fillText('site plan?', 450, 240)
  })
  T.monOn = tex(256, 160, (g, w, h) => {
    g.fillStyle = '#0d1110'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#4fd36f'; g.fillRect(14, 14, 60, 6)
    for (let i = 0; i < 6; i++) { g.fillStyle = '#1a2320'; g.fillRect(14, 32 + i * 20, w - 28, 14); g.fillStyle = '#9fb3a8'; g.fillRect(22, 37 + i * 20, 50 + (i * 37) % 120, 4) }
  })
  const card = (text, bg, ink) => tex(200, 80, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.fillStyle = ink; g.font = '700 32px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2)
  })
  T.cardSite = card('ON SITE', '#e8a43c', '#2a1a06')
  T.cardLeave = card('ON LEAVE', '#c9cfd6', '#1d2733')
  T.cardOff = card('OFF TODAY', '#c9cfd6', '#1d2733')
  T.page = tex(256, 340, (g, w) => {
    g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, w, 340)
    g.fillStyle = '#2a2420'; g.font = '600 20px Georgia'; g.fillText('Games', 20, 34)
    g.strokeStyle = '#2f6b43'; g.lineWidth = 3
    for (let i = 0; i < 12; i++) { const x = 22 + (i % 3) * 76, y = 56 + Math.floor(i / 3) * 70; g.strokeRect(x, y, 56, 50); g.beginPath(); g.arc(x + 28, y + 25, 12, 0, 7); g.stroke() }
  })
  T.cover = tex(256, 340, (g, w, h) => {
    g.fillStyle = '#1f4d36'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#d8b76a'; g.lineWidth = 4; g.strokeRect(16, 16, w - 32, h - 32)
    g.fillStyle = '#d8b76a'; g.font = '600 34px Georgia'; g.textAlign = 'center'; g.fillText('GAMES', w / 2, h / 2)
    g.font = '15px Georgia'; g.fillText('break room', w / 2, h / 2 + 30)
  })
  T.spine = tex(64, 340, (g, w, h) => {
    g.fillStyle = '#1f4d36'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#d8b76a'; g.fillRect(0, 30, w, 4); g.fillRect(0, h - 34, w, 4)
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.font = '600 26px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GAMES', 0, 0); g.restore()
  })
  T.drawerLabel = text => tex(160, 50, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a7a5a'; g.strokeRect(1, 1, w - 2, h - 2)
    g.fillStyle = '#2a2420'; g.font = '600 20px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 1)
  })
  T.cityBoard = tex(1024, 768, (g, w, h) => {
    g.fillStyle = '#26302a'; g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(79,211,111,.12)'; g.lineWidth = 1
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() }
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
    g.fillStyle = '#3b3f3c'; g.fillRect(0, h * .5 - 30, w, 60); g.fillRect(w * .5 - 30, 0, 60, h)
    g.strokeStyle = '#d9c98a'; g.setLineDash([18, 16]); g.lineWidth = 3
    g.beginPath(); g.moveTo(0, h * .5); g.lineTo(w, h * .5); g.moveTo(w * .5, 0); g.lineTo(w * .5, h); g.stroke(); g.setLineDash([])
    g.fillStyle = '#4f6a3e'; g.fillRect(w * .78, h * .62, 170, 220)
    g.fillStyle = '#4b7a8a'; g.beginPath(); g.ellipse(w * .86, h * .82, 50, 30, 0, 0, 7); g.fill()
  })
  T.cityPlaque = tex(500, 40, (g, w, h) => {
    g.fillStyle = '#b8924a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1d0c'; g.font = '600 22px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('XRADAR · PROGRAM CITY', w / 2, h / 2 + 1)
  })
  T.tower = tex(128, 256, (g, w, h) => { g.fillStyle = '#d8cfbe'; g.fillRect(0, 0, w, h); for (let y = 8; y < h; y += 16) { g.fillStyle = '#5c6a70'; g.fillRect(6, y, w - 12, 8) } })
  return T
}
