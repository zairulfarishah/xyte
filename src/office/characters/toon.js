import * as THREE from 'three'

// The built-in cartoon people ("chibi" miniatures). Used when the 3D model is switched off
// with P, or when it fails to load. Ported from the prototype; geometries and materials are
// shared through small caches.

const LOOKS = [
  { skin: '#b9825e', hair: 'spiky', hairC: '#1c1714', glasses: true, goatee: true, suit: '#4a4d52', tie: '#e0b131' },
  { skin: '#c48d68', hair: 'swept', hairC: '#2a2522', glasses: true, beard: true, suit: '#7c8189', tie: '#c4302b' },
  { skin: '#d9a582', hair: 'wavy', hairC: '#6b3f26', glasses: true, skirt: '#a88e74', suit: '#c8a888', tie: '#c4302b' },
  { skin: '#6e4631', hair: 'curly', hairC: '#141110', glasses: true, suit: '#5b5d61', tie: '#d39a4a' },
  { skin: '#efc3a2', hair: 'bob', hairC: '#c8682f', skirt: '#2f3f63', suit: '#2f3f63', tie: null },
  { skin: '#c8926c', hair: 'hijab', hairC: '#2e7d74', skirt: '#2b2d31', suit: '#2b2d31', tie: null },
  { skin: '#d2a07a', hair: 'short', hairC: '#1a1512', suit: '#3b4a5e', tie: '#2f6fb3' },
  { skin: '#a8714f', hair: 'short', hairC: '#141110', glasses: true, beard: true, suit: '#2b2d31', tie: '#8e2f25' },
]
// Everyone is a man except the names listed here (only Izni for now).
const FEMALE_NAMES = /\bizni\b/i
const MALE_LOOKS = [0, 1, 3, 6, 7], FEMALE_LOOK = 5
export const lookFor = (name, i) => FEMALE_NAMES.test(name || '') ? FEMALE_LOOK : MALE_LOOKS[i % MALE_LOOKS.length]

export function createToonKit(rnd) {
  const matCache = new Map(), geoCache = new Map()
  const toon = (c, r = .45) => {
    const k = `${c}|${r}`
    if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 }))
    return matCache.get(k)
  }
  const geo = (k, make) => { if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k) }
  const SPH = r => geo(`s${r}`, () => new THREE.SphereGeometry(r, 24, 18))
  const CAP = (r, l) => geo(`c${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14))
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const blush = new THREE.MeshBasicMaterial({ color: '#f09a8c', transparent: true, opacity: .32, depthWrite: false })
  function part(g, geometry, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz)
    m.castShadow = true; g.add(m); return m
  }

  function chibiHead(L) {
    const skin = toon(L.skin, .6), hairM = toon(L.hairC, .45), female = !!L.skirt
    const h = new THREE.Group()
    part(h, SPH(.19), skin, 0, 0, 0, 0, 0, 0, 1.02, .95, .94)
    if (L.hair !== 'hijab') for (const s of [-1, 1]) part(h, SPH(.04), skin, s * .197, -.015, .015, 0, 0, 0, .5, 1, .85)
    const fz = -.164, dk = '#2a1c14'
    for (const s of [-1, 1]) {
      const ex = s * .068
      part(h, SPH(.044), toon('#fbfaf6', .25), ex, -.005, fz + .012, 0, 0, 0, .92, 1.05, .45)
      part(h, SPH(.034), toon('#5a3420', .2), ex, -.01, fz, 0, 0, 0, 1, 1.12, .45)
      part(h, SPH(.019), toon('#120c09', .15), ex, -.01, fz - .006, 0, 0, 0, 1, 1.1, .4)
      part(h, SPH(.009), white, ex - s * .011, .008, fz - .012)
      part(h, SPH(.0045), white, ex + s * .01, -.022, fz - .011)
      part(h, geo('lid', () => new THREE.TorusGeometry(.043, .0055, 6, 18, Math.PI)), toon(dk, .4), ex, -.005, fz - .004, 0, 0, 0, 1, .95, 1)
      if (female) part(h, geo('lash', () => new THREE.BoxGeometry(.016, .005, .004)), toon(dk, .4), ex + s * .045, .026, fz + .002, 0, 0, s * .6)
      part(h, geo('brow', () => new THREE.TorusGeometry(.04, .0075, 6, 16, Math.PI * .7)), toon(L.hair === 'hijab' ? dk : L.hairC, .5), ex, .045, fz + .006, 0, 0, Math.PI * .15, 1, .55, 1)
    }
    part(h, SPH(.018), toon(new THREE.Color(L.skin).multiplyScalar(.93).getStyle(), .55), 0, -.045, -.178, 0, 0, 0, 1.1, .8, .8)
    part(h, geo('mouth', () => new THREE.TorusGeometry(.028, .0055, 6, 18, Math.PI * .75)), toon('#6b3530', .45), 0, -.088, -.163, 0, 0, Math.PI + Math.PI * .125)
    for (const s of [-1, 1]) { const c = part(h, geo('cheek', () => new THREE.CircleGeometry(.028, 18)), blush, s * .108, -.05, -.152, 0, Math.PI + s * .45, 0); c.castShadow = false }
    if (L.glasses) {
      const gm = toon('#2a2522', .3)
      for (const s of [-1, 1]) {
        part(h, geo('lens', () => new THREE.TorusGeometry(.05, .0042, 6, 28)), gm, s * .068, -.006, fz - .016, 0, 0, 0, 1.1, .88, 1)
        part(h, geo('arm', () => new THREE.BoxGeometry(.005, .005, .15)), gm, s * .123, 0, -.1)
      }
      part(h, geo('bridge', () => new THREE.TorusGeometry(.016, .0038, 6, 10, Math.PI)), gm, 0, -.004, fz - .016)
    }
    if (L.beard) {
      part(h, geo('beard', () => new THREE.SphereGeometry(.195, 26, 16, 0, Math.PI * 2, Math.PI * .56, Math.PI * .44)), hairM, 0, .005, -.004, 0, 0, 0, 1.02, .98, .97)
      part(h, CAP(.014, .06), hairM, 0, -.065, -.176, 0, 0, Math.PI / 2)
    }
    if (L.goatee) {
      part(h, SPH(.032), hairM, 0, -.135, -.14, 0, 0, 0, 1, 1.25, .7)
      for (const s of [-1, 1]) part(h, CAP(.011, .035), hairM, s * .025, -.066, -.174, 0, 0, Math.PI / 2 + s * .25)
    }
    const shell = (sy = .95, sz = .98) => part(h, SPH(.2), hairM, 0, .05, .06, 0, 0, 0, 1.03, sy, sz)
    if (L.hair === 'spiky') {
      shell()
      for (let k = 0; k < 16; k++) { const a = rnd() * Math.PI * 2, r = rnd() * .12; part(h, geo('spike', () => new THREE.ConeGeometry(.045, .12, 10)), hairM, Math.cos(a) * r, .2 + (.12 - r) * .25, Math.sin(a) * r - .01, (rnd() - .5) * .7 - .2, 0, (rnd() - .5) * .7) }
    }
    if (L.hair === 'swept') {
      shell()
      part(h, SPH(.13), hairM, .01, .18, -.035, .35, 0, -.12, 1.45, .62, 1.15)
      part(h, SPH(.07), toon('#9a958f', .5), .07, .215, .02, 0, 0, 0, 1.3, .5, 1.4)
    }
    if (L.hair === 'wavy') {
      shell(.97, 1)
      part(h, SPH(.2), hairM, 0, -.12, .1, 0, 0, 0, 1.12, 1.3, .75)
      for (const s of [-1, 1]) { part(h, CAP(.062, .2), hairM, s * .175, -.11, -.03, 0, 0, s * -.08); part(h, SPH(.06), hairM, s * .15, -.24, .0) }
      part(h, SPH(.1), hairM, -.06, .14, -.11, .2, 0, .5, 1.3, .45, .7)
    }
    if (L.hair === 'curly') {
      shell(.9, .95)
      for (let k = 0; k < 34; k++) { const a = rnd() * Math.PI * 2, b = rnd() * 1.15; part(h, SPH(.05), hairM, Math.cos(a) * Math.sin(b) * .175, .07 + Math.cos(b) * .14, Math.sin(a) * Math.sin(b) * .16 + .05) }
    }
    if (L.hair === 'short') {
      shell(.9, .95)
      part(h, SPH(.12), hairM, 0, .16, -.09, .3, 0, 0, 1.4, .42, .9)
    }
    if (L.hair === 'bob') {
      part(h, SPH(.215), hairM, 0, .02, .045, 0, 0, 0, 1.08, .98, 1)
      part(h, SPH(.13), hairM, 0, .11, -.12, .15, 0, 0, 1.45, .5, .55)
      for (const s of [-1, 1]) part(h, SPH(.09), hairM, s * .17, -.11, -.02, 0, 0, 0, .7, 1, 1)
    }
    if (L.hair === 'hijab') {
      const op = .66
      const hijabM = new THREE.MeshStandardMaterial({ color: L.hairC, roughness: .45, side: THREE.DoubleSide })
      part(h, geo('hijab', () => new THREE.SphereGeometry(.208, 32, 22, 0, Math.PI * 2, op, Math.PI - op)), hijabM, 0, 0, 0, -Math.PI / 2, 0, 0, 1.03, 1, 1.07)
      part(h, geo('hijabRim', () => new THREE.TorusGeometry(.208 * Math.sin(op), .016, 10, 44)), hairM, 0, 0, -.208 * Math.cos(op), 0, 0, 0, 1.03, 1.07, 1)
      part(h, geo('hijabCone', () => new THREE.ConeGeometry(.22, .25, 28, 1, true)), hijabM, 0, -.21, .045)
    }
    h.traverse(o => { if (o.isMesh) o.receiveShadow = false })
    return h
  }

  // Standing figure (walks around the office)
  function chibiStand(i) {
    const L = LOOKS[i % LOOKS.length], f = new THREE.Group(), body = new THREE.Group(); f.add(body)
    const skin = toon(L.skin, .6), suit = toon(L.suit, .7), shirt = toon('#f8f6f1', .5), shoe = toon('#4a3326', .4)
    const suitDark = toon(new THREE.Color(L.suit).multiplyScalar(.78).getStyle(), .7)
    const female = !!L.skirt, skirtM = female ? toon(L.skirt, .7) : null
    const legs = [], arms = []
    for (const s of [-1, 1]) {
      const lg = new THREE.Group(); lg.position.set(s * .075, .44, 0); body.add(lg); legs.push(lg)
      part(lg, CAP(female ? .046 : .056, .26), female ? skin : suit, 0, -.2, 0)
      part(lg, SPH(.055), shoe, 0, -.405, -.03, 0, 0, 0, 1, .7, 1.7)
    }
    if (female) part(body, geo('skirtS', () => new THREE.CylinderGeometry(.15, .2, .26, 28)), skirtM, 0, .38, 0)
    else part(body, SPH(.15), suit, 0, .47, 0, 0, 0, 0, 1.05, .7, .9)
    const ty = .63
    part(body, CAP(.132, .1), suit, 0, ty, 0, 0, 0, 0, 1.08, 1, .85)
    part(body, geo('collar', () => new THREE.BoxGeometry(.075, .075, .012)), shirt, 0, ty + .105, -.113, 0, 0, Math.PI / 4, 1, 1.5, 1).castShadow = false
    for (const s of [-1, 1]) part(body, geo('lapel', () => new THREE.BoxGeometry(.028, .13, .012)), suitDark, s * .04, ty + .08, -.117, 0, 0, s * .38).castShadow = false
    if (L.tie) { part(body, geo('tie', () => new THREE.BoxGeometry(.026, .14, .012)), toon(L.tie, .4), 0, ty + .045, -.122); part(body, geo('knot', () => new THREE.BoxGeometry(.034, .028, .014)), toon(L.tie, .4), 0, ty + .12, -.118) }
    part(body, geo('neck', () => new THREE.CylinderGeometry(.042, .048, .07, 14)), skin, 0, ty + .165, 0)
    for (const s of [-1, 1]) {
      const ar = new THREE.Group(); ar.position.set(s * .17, ty + .1, 0); body.add(ar); arms.push(ar)
      part(ar, CAP(.04, .2), suit, 0, -.14, 0)
      part(ar, geo('cuff', () => new THREE.CylinderGeometry(.036, .036, .02, 14)), shirt, 0, -.255, 0)
      part(ar, SPH(.04), skin, 0, -.29, 0, 0, 0, 0, 1, 1.1, .9)
    }
    const mug = new THREE.Group(); mug.position.set(0, -.3, -.05); arms[1].add(mug)
    part(mug, geo('mug', () => new THREE.CylinderGeometry(.032, .028, .075, 16)), toon('#f4f2ec', .35), 0, 0, 0)
    part(mug, geo('mugH', () => new THREE.TorusGeometry(.02, .006, 6, 12)), toon('#f4f2ec', .35), .035, 0, 0, 0, Math.PI / 2, 0)
    const marker = new THREE.Group(); marker.position.set(0, -.33, -.01); arms[1].add(marker)
    part(marker, geo('marker', () => new THREE.CylinderGeometry(.01, .01, .1, 8)), toon('#2d4a7a', .4), 0, 0, 0)
    const book = new THREE.Group(); book.position.set(0, ty - .02, -.22); body.add(book)
    for (const s of [-1, 1]) {
      part(book, geo('bkC', () => new THREE.BoxGeometry(.12, .16, .012)), toon('#2f4a3f', .6), s * .058, 0, 0, 0, s * -.35, 0)
      part(book, geo('bkP', () => new THREE.BoxGeometry(.11, .15, .014)), toon('#f4ecd8', .8), s * .056, 0, -.006, 0, s * -.35, 0)
    }
    const h = chibiHead(L); h.position.set(0, ty + .36, 0); body.add(h)
    f.userData = { legs, arms, head: h, book, mug, marker, body }
    f.traverse(o => { if (o.isMesh) o.receiveShadow = false })
    setPose(f, 'idle')
    return f
  }

  // Seated figure at the desk (part of the desk hotspot)
  function chibiSeated(i) {
    const L = LOOKS[i % LOOKS.length], g = new THREE.Group()
    const skin = toon(L.skin, .6), suit = toon(L.suit, .7), shirt = toon('#f8f6f1', .5), shoe = toon('#4a3326', .4)
    const suitDark = toon(new THREE.Color(L.suit).multiplyScalar(.78).getStyle(), .7)
    const skirtM = L.skirt ? toon(L.skirt, .7) : null, female = !!L.skirt
    for (const sx of [-.075, .075]) {
      part(g, CAP(.058, .2), skirtM || suit, sx, .56, .38, Math.PI / 2)
      part(g, CAP(.046, .22), female ? skin : suit, sx, .32, .25)
      part(g, SPH(.055), shoe, sx, .1, .2, 0, 0, 0, 1, .7, 1.7)
    }
    if (female) part(g, geo('skirtSit', () => new THREE.CylinderGeometry(.155, .19, .2, 28)), skirtM, 0, .585, .44, Math.PI / 2 - .2, 0, 0, 1, 1, .72)
    else part(g, SPH(.15), suit, 0, .57, .52, 0, 0, 0, 1.05, .7, 1)
    const lowerN = g.children.length
    part(g, CAP(.132, .1), suit, 0, .79, .55, -.06, 0, 0, 1.08, 1, .85)
    part(g, geo('collar', () => new THREE.BoxGeometry(.075, .075, .012)), shirt, 0, .895, .437, -.06, 0, Math.PI / 4, 1, 1.5, 1).castShadow = false
    for (const s of [-1, 1]) part(g, geo('lapel', () => new THREE.BoxGeometry(.028, .13, .012)), suitDark, s * .04, .87, .433, -.06, 0, s * .38).castShadow = false
    if (L.tie) { part(g, geo('tie', () => new THREE.BoxGeometry(.026, .14, .012)), toon(L.tie, .4), 0, .835, .428, -.06); part(g, geo('knot', () => new THREE.BoxGeometry(.034, .028, .014)), toon(L.tie, .4), 0, .91, .432, -.06) }
    const hands = []
    for (const s of [-1, 1]) {
      part(g, CAP(.042, .12), suit, s * .165, .8, .5, .8, 0, s * .12)
      const fa = new THREE.Group(); g.add(fa); hands.push(fa)
      part(fa, CAP(.038, .11), suit, s * .15, .765, .36, Math.PI / 2)
      part(fa, geo('cuff', () => new THREE.CylinderGeometry(.036, .036, .02, 14)), shirt, s * .148, .766, .29, Math.PI / 2)
      part(fa, SPH(.038), skin, s * .142, .77, .255, 0, 0, 0, 1, .75, 1.15)
    }
    part(g, geo('neck', () => new THREE.CylinderGeometry(.042, .048, .07, 14)), skin, 0, .955, .535)
    const h = chibiHead(L); h.position.set(0, 1.15, .52); g.add(h)
    // upper body hinges at the hips so the person can lean forward and sleep on the desk
    const upper = new THREE.Group(); upper.position.set(0, .57, .5)
    g.children.slice(lowerN).filter(o => !hands.includes(o)).forEach(o => { g.remove(o); o.position.sub(upper.position); upper.add(o) })
    g.add(upper)
    g.userData.hands = hands; g.userData.head = h; g.userData.upper = upper
    g.traverse(o => { if (o.isMesh) o.receiveShadow = false })
    return g
  }

  return { chibiStand, chibiSeated }
}

export function setPose(f, mode, t = 0) {
  const u = f.userData
  let lL = 0, lR = 0, aL = 0, aR = 0, aRz = 0, hx = 0, hy = 0, bob = 0
  u.book.visible = mode === 'read'; u.mug.visible = mode === 'coffee'; u.marker.visible = mode === 'write'
  if (mode === 'walk') { const w = Math.sin(t * 9); lL = w * .55; lR = -w * .55; aL = -w * .45; aR = w * .45; bob = Math.abs(Math.cos(t * 9)) * .025 }
  else if (mode === 'read') { aL = aR = 1.15; hx = -.35; hy = Math.sin(t * .6) * .08 }
  else if (mode === 'coffee') { const sip = Math.sin(t * .9) > .7; aR = sip ? 2.3 : 1.0; aL = -.08; hx = sip ? .12 : -.08 }
  else if (mode === 'city') { aL = aR = -.4; hx = -.45; hy = Math.sin(t * .4) * .35 }
  else if (mode === 'write') { aR = 2.0 + Math.sin(t * 3) * .15; aRz = Math.sin(t * 2.2) * .25; hx = .12 }
  else if (mode === 'look') { aL = aR = -.15; hx = .05 + Math.sin(t * .5) * .05; hy = Math.sin(t * .3) * .2 }
  u.legs[0].rotation.x = lL; u.legs[1].rotation.x = lR
  u.arms[0].rotation.x = aL; u.arms[1].rotation.x = aR; u.arms[1].rotation.z = aRz
  u.head.rotation.x = hx; u.head.rotation.y = hy; u.body.position.y = bob
}

const POSE_MAP = { walk: 'walk', turn: 'walk', idle: 'idle', wait: 'look', talk: 'look', read: 'read', coffee: 'coffee', write: 'write', city: 'city', look: 'look' }

export class ToonCharacter {
  constructor(standing, cube) { this.kind = 'toon'; this.cube = cube; this.root = standing; this.activity = 'idle'; this.t = Math.random() * 10; this.speed = 0; this.props = null }
  setActivity(a) { this.activity = a }
  update(dt, active, present) {
    this.t += dt
    const seated = this.activity === 'sit' || this.activity === 'type' || this.activity === 'sleep'
    this.root.visible = active && present && !seated
    this.cube.fig.visible = active && present && seated
    const body = this.root.userData.body
    if (seated) {
      const u = this.cube.fig.userData, sleep = this.activity === 'sleep'
      u.hands.forEach((hg, k) => { hg.position.y = this.activity === 'type' ? Math.max(0, Math.sin(this.t * 14 + k * 1.9)) * .012 : 0 })
      u.upper.rotation.x = sleep ? -.72 + Math.sin(this.t * 1.4) * .015 : 0
      u.head.rotation.y = sleep ? 0 : Math.sin(this.t * .35) * .12
      u.head.rotation.z = sleep ? .35 : 0
    } else if (this.activity === 'lie') {            // on its back on the couch, head towards -forward
      setPose(this.root, 'idle', 0)
      body.rotation.x = Math.PI / 2; body.position.set(0, .6, .45)
      this.root.userData.head.rotation.y = .4
    } else {
      body.rotation.x = 0; body.position.z = 0
      setPose(this.root, POSE_MAP[this.activity] || 'idle', this.activity === 'turn' ? this.t * .5 : this.t)
    }
  }
}
