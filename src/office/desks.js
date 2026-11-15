import * as THREE from 'three'

// The crew workstation: one desk per person, 6 desks per block (two columns of 3 facing each other).
// More than 6 people adds a second block (rows of 3 again) in the free front-right of the room,
// clear of the city table's walkway. Up to 12 desks fit.
export const POD = { w: 1.3, size: 6, max: 12 }
export const BLOCKS = [
  { xA: -3.72, xB: -2.98, rows: [0.0, 1.3, 2.6] },     // the prototype's 6-desk workstation
  { xA: 3.3, xB: 4.04, rows: [1.65, 2.95, 4.25] },
]
const HAT = ['#f2f2ee', '#e8b72a', '#e46a2b', '#2f6fb3', '#f2f2ee', '#e8b72a']

export function buildDesks({ kit, T, hs, room, toonKit, count, looks }) {
  const { M, box, cyl, keep, liveTex } = kit
  const n = Math.min(count, POD.max)
  const podG = new THREE.Group(); room.add(podG)
  const oak = M('#f3f2ef', { roughness: .45 })
  const oakFront = M('#f4f3f0', { roughness: .45 })
  const frameM = M('#ebeae6', { metalness: .2, roughness: .45 })
  const greyPanel = M('#ecebe7', { roughness: .5 })
  const meshM = M('#8a8e93', { roughness: .95 })
  const blackM = M('#141516', { metalness: .3, roughness: .5 })
  const whiteM = M('#eceae6', { roughness: .35 })
  const silverM = M('#c7c9cb', { metalness: .8, roughness: .3 })
  const screenM = M('#b9bcbe', { roughness: 1 })
  const monOff = keep(new THREE.MeshBasicMaterial({ color: '#0a0b0b' }))
  const cardEdge = M('#e8a43c')

  const screenPanel = (parent, len, x, z, alongZ) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); if (alongZ) g.rotation.y = Math.PI / 2; parent.add(g)
    box(g, len - .02, .4, .035, screenM, 0, .775 + .2, 0)
    return g
  }

  const cubes = [], rects = []
  for (let i = 0; i < n; i++) {
    const pod = Math.floor(i / POD.size), j = i % POD.size
    const inPod = Math.min(POD.size, n - pod * POD.size)
    const colA = j < 3, row = j % 3
    const rowsInCol = colA ? Math.min(3, inPod) : Math.max(0, inPod - 3)
    const B = BLOCKS[pod]
    const pos = new THREE.Vector3(colA ? B.xA : B.xB, 0, B.rows[row])
    const rotY = colA ? -Math.PI / 2 : Math.PI / 2       // local -z = the way the person faces
    const plusZside = colA ? 1 : -1                      // which local x side points to world +z
    // frame + screens
    const part = new THREE.Group(); part.position.copy(pos); part.rotation.y = rotY; podG.add(part)
    screenPanel(part, POD.w, 0, -.33, false)
    if (row < rowsInCol - 1) screenPanel(part, .62, plusZside * POD.w / 2, -.02, true)
    const endSides = []
    if (row === 0) endSides.push(-plusZside)
    if (row === rowsInCol - 1) endSides.push(plusZside)
    endSides.forEach(sd => {
      const ex = sd * (POD.w / 2 - .02)
      box(part, .06, .72, .06, frameM, ex, .37, -.02)
      box(part, .07, .04, .66, frameM, ex, .02, -.02)
      box(part, .06, .04, .6, frameM, ex, .72, -.02)
    })
    // desk, pedestal, computer, chair, person (one hotspot per person)
    const d = new THREE.Group(); d.position.copy(pos); d.rotation.y = rotY; room.add(d)
    box(d, POD.w, .03, .66, oak, 0, .75, -.02)
    box(d, POD.w, .03, .03, frameM, 0, .72, -.33)
    const px = .43
    box(d, .42, .56, .5, greyPanel, px, .32, -.08)
    for (let k = 0; k < 3; k++) {
      box(d, .4, .165, .02, oakFront, px, .5 - k * .18, .175)
      box(d, .12, .012, .02, silverM, px, .55 - k * .18, .19)
    }
    for (const [cx, cz] of [[-.17, -.3], [.17, -.3], [-.17, .14], [.17, .14]]) cyl(d, .018, .018, .03, blackM, px + cx, .02, cz, 8)
    box(d, .22, .012, .16, blackM, 0, .772, -.2)
    box(d, .05, .26, .03, blackM, 0, .9, -.23)
    box(d, .6, .36, .025, M('#111214', { roughness: .4 }), 0, 1.13, -.21)
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.57, .33), new THREE.MeshBasicMaterial({ map: T.monOn, toneMapped: false }))
    scr.position.set(0, 1.13, -.196); scr.userData.noGlow = true; d.add(scr)
    box(d, .38, .012, .12, M('#2a2b2e'), -.02, .771, .08)
    box(d, .06, .012, .09, M('#2a2b2e'), .25, .771, .09)
    if (i % 2 === 0) {
      cyl(d, .03, .025, .14, M('#d9e2e0', { transparent: true, opacity: .6, roughness: .1 }), -.48, .84, -.22, 12)
      const fl = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), M(['#e7a1a8', '#f0d8a8', '#d77a7a'][i % 3])); fl.position.set(-.48, .95, -.22); d.add(fl)
    } else cyl(d, .035, .03, .08, M(['#e9e1d2', '#2f6b43', '#b23a2e'][i % 3], { roughness: .4 }), -.45, .8, -.05, 12)
    const hat = new THREE.Group(); hat.position.set(.42, .765, -.12); d.add(hat)
    const hatMat = M(HAT[i % HAT.length], { roughness: .35 })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat); dome.castShadow = true; hat.add(dome)
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .012, 20), hatMat); brim.position.y = .006; hat.add(brim)
    const card = new THREE.Mesh(new THREE.BoxGeometry(.3, .12, .012), [cardEdge, cardEdge, cardEdge, cardEdge, M('#ffffff', { map: T.cardSite }), cardEdge])
    card.position.set(0, .83, .08); card.rotation.x = -.15; d.add(card)
    // black mesh office chair with arms and castors
    const ch = new THREE.Group(); d.add(ch)
    box(ch, .48, .07, .46, M('#55595e', { roughness: .8 }), 0, .47, 0)
    const back = box(ch, .44, .55, .03, meshM, 0, .84, .24); back.rotation.x = .1
    box(ch, .46, .04, .05, whiteM, 0, 1.11, .27)
    for (const sx of [-.23, .23]) box(ch, .035, .6, .04, whiteM, sx, .84, .25)
    box(ch, .05, .06, .06, blackM, 0, .56, .22)
    for (const sx of [-.25, .25]) { box(ch, .04, .2, .04, whiteM, sx, .58, .02); box(ch, .06, .03, .24, blackM, sx, .69, .0) }
    cyl(ch, .025, .025, .34, silverM, 0, .27, 0, 10)
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2
      const leg = box(ch, .3, .03, .045, blackM, Math.cos(a) * .15, .07, Math.sin(a) * .15); leg.rotation.y = -a
      const wh = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), blackM); wh.position.set(Math.cos(a) * .29, .03, Math.sin(a) * .29); ch.add(wh)
    }
    const fig = toonKit.chibiSeated(looks[i]); d.add(fig)
    const k = 'crew' + i
    hs.makeHotspot(k, d, { title: '', sub: '', offset: colA ? [-1.45, 1.35, 0.95] : [1.5, 1.35, 0.95] })
    const cardFront = card.material[4]
    const siteCard = liveTex(256, 102)                     // "ON SITE" + where, drawn per person
    cubes.push({ k, d, ch, fig, hat, card, cardFront, siteCard, scr, onMat: scr.material, colA })
  }
  // walk-grid blockers: one rectangle per block, including chairs
  for (let p = 0; p * POD.size < n; p++) {
    const inPod = Math.min(POD.size, n - p * POD.size), rowsMax = Math.min(3, inPod), B = BLOCKS[p]
    rects.push([B.xA - .73, B.rows[0] - .68, B.xB + .73, B.rows[rowsMax - 1] + .68])
  }
  hs.makeHotspot('crew', podG, { title: 'Crew today', sub: 'Who is in the office and who is on site', offset: [3.2, 2.6, 3.6] })

  function drawSiteCard(c, site) {
    const g = c.siteCard.canvas.getContext('2d'), w = 256, h = 102
    g.fillStyle = '#e8a43c'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#2a1a06'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = '700 30px monospace'; g.fillText('ON SITE', w / 2, 30)
    let name = (site || '').split(' + ')[0].split(' · ')[0].trim() || 'Site'
    let px = 24; g.font = `600 ${px}px Poppins, sans-serif`
    while (g.measureText(name).width > w - 20 && px > 15) { px--; g.font = `600 ${px}px Poppins, sans-serif` }
    while (g.measureText(name).width > w - 20 && name.length > 4) name = name.slice(0, -2).trimEnd() + '…'
    g.fillText(name, w / 2, 72)
    c.siteCard.texture.needsUpdate = true
  }
  // person: crew entry (status 'office' | 'site' | 'leave' | 'off', site); mode: 'work' | 'sleep' | 'couch' | 'away'
  function applyPresence(i, person, mode) {
    const c = cubes[i], away = mode === 'away', status = person.status
    c.fig.visible = !away; c.hat.visible = !away; c.card.visible = away
    if (status === 'site') drawSiteCard(c, person.site)
    c.cardFront.map = status === 'leave' ? T.cardLeave : status === 'off' ? T.cardOff : c.siteCard.texture; c.cardFront.needsUpdate = true
    c.scr.material = mode === 'work' ? c.onMat : monOff
  }
  return { podG, cubes, rects, applyPresence }
}
