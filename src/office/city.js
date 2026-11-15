import * as THREE from 'three'
import { C, mats } from './kit'
import { RUG } from './room'

// The program city on the model table. Each building is one program; clicking it plays a
// green scan ring that sweeps up and reveals the rebar, tendons or drill points inside.
export const PROGS = ['pt', 'scan', 'layout', 'pdf']
export const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export function buildCity({ kit, T, hs, room }) {
  const { M, box, rnd, pick } = kit
  const TX = RUG.x, TZ = RUG.z
  const table = new THREE.Group(); room.add(table)
  box(table, 2.5, .05, 1.8, M('#d9bc94', { roughness: .45 }), TX, .8, TZ)
  const legM = M('#ebeae6')
  for (const [a, b] of [[-1.15, -.8], [1.15, -.8], [-1.15, .8], [1.15, .8]]) box(table, .05, .77, .05, legM, TX + a, .385, TZ + b)
  box(table, 2.3, .05, .04, legM, TX, .72, TZ - .82); box(table, 2.3, .05, .04, legM, TX, .72, TZ + .82)

  const city = new THREE.Group(); room.add(city); city.position.set(TX, .835, TZ)
  const edge = M('#1d2420')
  box(city, 2.2, .05, 1.55, [edge, edge, M('#ffffff', { map: T.cityBoard, roughness: .85 }), edge, edge, edge], 0, .025, 0)
  const BTOP = .05
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(.5, .04), M('#ffffff', { map: T.cityPlaque, metalness: .5, roughness: .4 }))
  plaque.position.set(0, .025, .776); city.add(plaque)

  const decor = new THREE.Group(); city.add(decor)
  const fillerMats = ['#d8cfbe', '#bfb6a6', '#a9a397', '#e3dbcc', '#8f8a80'].map(c => M(c, { roughness: .8 }))
  ;[[-.95, -.6], [-.95, .05], [-.35, -.62], [.15, -.6], [.95, -.62], [.98, .02], [.35, .6], [.95, .62], [-.2, .62], [.6, -.08], [-.45, .08]]
    .forEach(([x, z]) => { const h = .06 + rnd() * .2, w = .1 + rnd() * .08; box(decor, w, h, w, pick(fillerMats), x, BTOP + h / 2, z) })
  const treeM = M('#3f6b3a'), treeG = new THREE.ConeGeometry(.03, .09, 8)
  for (let i = 0; i < 18; i++) { const tr = new THREE.Mesh(treeG, treeM); tr.position.set(.7 + rnd() * .35, BTOP + .05, .28 + rnd() * .4); tr.castShadow = true; decor.add(tr) }
  const carMats = ['#b23a2e', '#e3dbcc', '#2d4a7a', '#d6a23a'].map(c => M(c, { roughness: .4 }))
  for (let i = 0; i < 6; i++) box(decor, .05, .025, .025, pick(carMats), -.8 + i * .32, BTOP + .013, -.02 + (i % 2) * .05)
  hs.makeHotspot('city', city, { title: 'Program city', sub: 'Every building is one of your programs', offset: [2.1, 2.0, 2.6] })

  const programs = []
  function program(key, def, build) {
    const g = new THREE.Group(); city.add(g)
    g.position.set(def.x, BTOP, def.z)
    const shell = new THREE.Group(); g.add(shell)
    const core = new THREE.Group(); core.visible = false; g.add(core)
    build(shell, core)
    const ring = new THREE.Mesh(new THREE.RingGeometry(def.r * .92, def.r, 48), new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2; g.add(ring)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(def.r, 48), new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
    disc.rotation.x = -Math.PI / 2; g.add(disc)
    ring.userData.noGlow = disc.userData.noGlow = true
    hs.makeHotspot(key, g, { ...def, building: true })
    const p = { key, g, shell, core, ring, disc, h: def.h, t: 0, dir: 0 }
    programs.push(p); hs.hotspots[key].prog = p
    hs.drop(ring); hs.drop(disc); core.traverse(m => m.isMesh && hs.drop(m))
    return p
  }
  const conc = () => M(C.concrete, { roughness: .85 })
  const rebarMat = () => new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0 })

  // PT Mapper — multi-storey post-tensioned slabs, tendons inside
  program('pt', { title: 'PT Mapper', sub: 'Post-tension cable mapping', x: -.55, z: -.33, h: .44, r: .36, offset: [-0.35, 0.75, 1.05] }, (shell, core) => {
    const fh = .1
    for (let f = 0; f < 4; f++) {
      const y = f * fh + fh
      box(shell, .5, .022, .36, conc(), 0, y, 0)
      for (const [a, b] of [[-.2, -.14], [.2, -.14], [-.2, .14], [.2, .14], [0, -.14], [0, .14]]) box(shell, .024, fh - .022, .024, conc(), a, y - fh / 2, b)
      for (let k = 0; k < 4; k++) {
        const z = -.13 + k * .087, pts = []
        for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push(new THREE.Vector3(-.24 + u * .48, y + .007 - Math.sin(u * Math.PI * 2) * .008, z)) }
        core.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .0045, 6), rebarMat()))
        const a = new THREE.Mesh(new THREE.BoxGeometry(.012, .016, .016), new THREE.MeshBasicMaterial({ color: C.amber, transparent: true, opacity: 0 }))
        a.position.set(.255, y + .005, z); core.add(a)
      }
    }
    box(shell, .54, .03, .4, M('#8f8a80'), 0, .015, 0)
  })

  // Scan Points — slab under construction with crane; drill points inside
  program('scan', { title: 'Scan Points', sub: 'Mark drill points before drilling', x: .55, z: -.36, h: .32, r: .34, offset: [0.6, 0.7, 1.0] }, (shell, core) => {
    box(shell, .52, .03, .4, M('#8f8a80'), 0, .015, 0)
    for (const [a, b] of [[-.22, -.16], [.22, -.16], [-.22, .16], [.22, .16], [0, 0]]) box(shell, .03, .15, .03, conc(), a, .105, b)
    box(shell, .5, .03, .38, conc(), 0, .195, 0)
    const yellow = M('#d6a23a', { roughness: .5, metalness: .2 })
    box(shell, .03, .5, .03, yellow, .3, .25, .2)
    box(shell, .45, .02, .02, yellow, .17, .49, .2)
    box(shell, .05, .03, .03, M('#5a5a52'), .43, .48, .2)
    const dot = new THREE.SphereGeometry(.009, 8, 6)
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const bad = (i === 2 && j === 1) || (i === 4 && j === 3)
      const m = new THREE.Mesh(dot, new THREE.MeshBasicMaterial({ color: bad ? '#e0664f' : C.green, transparent: true, opacity: 0 }))
      m.position.set(-.2 + i * .08, .215, -.14 + j * .093); core.add(m)
    }
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.48, .004, .004), rebarMat()); b.position.set(0, .19, -.17 + i * .042); core.add(b) }
    for (let i = 0; i < 11; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.004, .004, .36), rebarMat()); b.position.set(-.22 + i * .044, .19, 0); core.add(b) }
  })

  // Site Layouts — tower; column rebar cage inside
  program('layout', { title: 'Site Layouts', sub: 'Structural layouts, sections, loads', x: -.05, z: .36, h: .78, r: .26, offset: [0.75, 0.8, 1.2] }, (shell, core) => {
    box(shell, .3, .03, .3, M('#8f8a80'), 0, .015, 0)
    box(shell, .22, .74, .22, M('#ffffff', { map: T.tower, roughness: .6 }), 0, .4, 0)
    box(shell, .24, .02, .24, conc(), 0, .78, 0)
    ;[[-.08, -.08], [.08, -.08], [-.08, .08], [.08, .08], [0, -.08], [0, .08], [-.08, 0], [.08, 0]].forEach(([x, z]) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, .74, 6), rebarMat()); b.position.set(x, .4, z); core.add(b)
    })
    for (let y = .06; y < .78; y += .05)
      for (const [w, d, x, z] of [[.17, .006, 0, -.085], [.17, .006, 0, .085], [.006, .17, -.085, 0], [.006, .17, .085, 0]]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(w, .004, d), rebarMat()); s.position.set(x, y, z); core.add(s)
      }
  })

  // PDF Tools — print shop with saw-tooth roof; pages inside
  program('pdf', { title: 'PDF Tools', sub: 'Merge, split, rotate, compress', x: -.75, z: .42, h: .26, r: .25, offset: [-0.2, 0.55, 0.95] }, (shell, core) => {
    box(shell, .34, .03, .28, M('#8f8a80'), 0, .015, 0)
    box(shell, .3, .16, .24, M('#b9573f', { roughness: .8 }), 0, .11, 0)
    for (let i = 0; i < 3; i++) { const r = box(shell, .1, .07, .24, M('#e3dbcc'), -.1 + i * .1, .215, 0); r.rotation.z = .5 }
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(.16, .003, .12), rebarMat()); p.position.set((rnd() - .5) * .04, .06 + i * .022, (rnd() - .5) * .04); p.rotation.y = (rnd() - .5) * .6; core.add(p) }
  })

  function updatePrograms(dt) {
    programs.forEach(p => {
      if (!p.dir) return
      p.t = THREE.MathUtils.clamp(p.t + p.dir * dt / (p.dir > 0 ? 1.6 : .5), 0, 1)
      if (p.t === 0) p.dir = 0
      const s = ease(p.t)
      p.core.visible = p.t > 0
      const op = 1 - .86 * s
      p.shell.traverse(m => { if (m.isMesh) mats(m).forEach(mm => { mm.transparent = op < .999; mm.opacity = op; mm.depthWrite = op > .5 }) })
      p.core.traverse(m => { if (m.isMesh) m.material.opacity = s })
      const sweep = p.dir > 0 ? THREE.MathUtils.clamp(p.t * 1.15, 0, 1) : 0
      p.ring.position.y = p.disc.position.y = sweep * (p.h + .06)
      const vis = p.dir > 0 && p.t < 1 ? Math.sin(sweep * Math.PI) : 0
      p.ring.material.opacity = vis * .95; p.disc.material.opacity = vis * .14
    })
  }

  return { table, city, programs, updatePrograms, TX, TZ }
}
