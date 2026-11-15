import * as THREE from 'three'
import { C } from './kit'
import { myTime } from './clock'

// The room shell and every fixed piece of furniture. Positions are the prototype's, unchanged.
export const RW = 12, RD = 10, RH = 4.6
export const RUG = { x: 1.4, z: -0.2 }
export const PLANTS = [[-5.45, -3.55, 1, true], [5.4, -2.9, .9, false], [5.35, -4.4, 1, true], [-5.4, 4.4, 1, true]]

export function buildRoom({ kit, T, hs, tv, clock, room }) {
  const { M, box, cyl, rnd, pick } = kit
  const { makeHotspot } = hs
  const brass = M(C.brass, { metalness: .85, roughness: .3 })
  const chrome = M('#c9c6bf', { metalness: .9, roughness: .22 })

  /* ── shell ── */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), M('#ffffff', { map: T.floor, roughness: .55 }))
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; room.add(floor)
  box(room, RW, 0.25, RD, M('#2a211b'), 0, -0.126, 0, { cast: false })
  const wallMat = M('#ffffff', { map: T.wall, roughness: .95 })
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(RW, RH), wallMat)
  backWall.position.set(0, RH / 2, -RD / 2); room.add(backWall)
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(RD, RH), wallMat)
  leftWall.rotation.y = Math.PI / 2; leftWall.position.set(-RW / 2, RH / 2, 0); room.add(leftWall)
  // wall thickness, kept just behind the wall planes so they don't flicker
  box(room, RW + .25, RH, .24, M('#2a211b'), 0, RH / 2, -RD / 2 - .13, { cast: false })
  box(room, .24, RH, RD, M('#2a211b'), -RW / 2 - .13, RH / 2, 0, { cast: false })
  box(room, RW + .25, .02, .25, M('#3a2e25'), 0, RH + .01, -RD / 2 - .125, { cast: false })
  box(room, .25, .02, RD + .25, M('#3a2e25'), -RW / 2 - .125, RH + .01, -.125, { cast: false })
  const wood = M('#cfae84', { roughness: .55 })
  const whiteTrim = M('#f4f3ef', { roughness: .5 })
  box(room, RW, .1, .025, whiteTrim, 0, .05, -RD / 2 + .013)
  box(room, .025, .1, RD, whiteTrim, -RW / 2 + .013, .05, 0)
  // grey acoustic felt panels behind the framed pictures
  const felt = M('#a7abae', { roughness: 1 })
  for (let x = -4.55; x < -0.05; x += .62) box(room, .6, 3.2, .02, felt, x + .3, 2.3, -RD / 2 + .01, { cast: false })
  // vertical oak slats behind the pantry and the clock
  for (let x = .2; x < 2.3; x += .085) box(room, .05, RH - .1, .03, wood, x, (RH - .1) / 2 + .05, -RD / 2 + .015, { cast: false })
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.0), M('#ffffff', { map: T.rug, roughness: 1 }))
  rug.rotation.x = -Math.PI / 2; rug.position.set(RUG.x, .006, RUG.z); rug.receiveShadow = true; room.add(rug)

  /* ── wall TV + media console = the dashboard ── */
  const monG = new THREE.Group(); room.add(monG)
  const TVX = -2.2, TVY = 1.5, TVW = 2.3, TVH = 1.29, TVZ = -RD / 2 + .07
  box(monG, .5, .35, .04, M('#2a2b2e'), TVX, TVY, -RD / 2 + .03, { cast: false })
  box(monG, TVW + .05, TVH + .05, .045, M('#0d0e10', { roughness: .3, metalness: .4 }), TVX, TVY, TVZ)
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(TVW, TVH), new THREE.MeshBasicMaterial({ map: tv.texture, toneMapped: false }))
  tvScreen.position.set(TVX, TVY, TVZ + .024); tvScreen.userData.noGlow = true; monG.add(tvScreen)
  box(monG, 1.1, .07, .09, M('#1a1b1d', { roughness: .6 }), TVX, TVY - TVH / 2 - .12, TVZ + .03)
  const CZ = -RD / 2 + .24
  box(monG, 2.1, .4, .42, M('#cfae84', { roughness: .55 }), TVX, .26, CZ)
  box(monG, 2.14, .03, .45, M('#c4a176', { roughness: .45 }), TVX, .475, CZ)
  for (let k = 0; k < 3; k++) box(monG, .68, .34, .015, M('#d8ba92'), TVX - .69 + k * .69, .26, CZ + .214)
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) box(monG, .03, .06, .03, M('#1d1d1d'), TVX + lx * 1.0, .03, CZ + lz * .17)
  cyl(monG, .07, .06, .16, M('#e9e7e1', { roughness: .4 }), TVX + .8, .57, CZ, 16)
  const leafM = M('#3d6b3b'), leafG = new THREE.SphereGeometry(.06, 8, 6)
  for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(leafG, leafM); l.scale.set(.5, 1.5, .2); l.position.set(TVX + .8 + (rnd() - .5) * .1, .72 + rnd() * .12, CZ + (rnd() - .5) * .08); l.rotation.set(rnd() - .5, rnd() * 3, rnd() - .5); monG.add(l) }
  makeHotspot('dashboard', monG, { title: 'Dashboard', sub: 'Today at a glance · live on the wall TV', offset: [0.3, 0.3, 3.7] })
  const tvGlow = new THREE.PointLight('#d8ecff', .5, 2.6, 2); tvGlow.position.set(TVX, TVY, TVZ + .6); room.add(tvGlow)

  /* ── framed pictures ── */
  function frame(key, x, y, w, h, picture, plaque, frameMat, def) {
    const g = new THREE.Group(); room.add(g)
    const z = -RD / 2 + .04, t = .07, d = .06
    box(g, w + t * 2, t, d, frameMat, x, y + h / 2 + t / 2, z)
    box(g, w + t * 2, t, d, frameMat, x, y - h / 2 - t / 2, z)
    box(g, t, h, d, frameMat, x - w / 2 - t / 2, y, z)
    box(g, t, h, d, frameMat, x + w / 2 + t / 2, y, z)
    box(g, w, h, .01, M('#f4efe4'), x, y, z - .01, { cast: false })
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w * .86, h * .86), M('#ffffff', { map: picture, roughness: .9 }))
    pic.position.set(x, y, z + .001); g.add(pic)
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(.36, .09), M('#ffffff', { map: T.plaque(plaque), metalness: .4, roughness: .4 }))
    pl.position.set(x, y - h / 2 - .2, z - .01); g.add(pl)
    box(g, w * .55, .04, .05, brass, x, y + h / 2 + .24, z + .12)
    box(g, .03, .03, .14, brass, x, y + h / 2 + .24, z + .05)
    const sp = new THREE.SpotLight('#fff6e8', 1.2, 3, .75, .7, 1.5)
    sp.position.set(x, y + h / 2 + .22, z + .2); sp.target.position.set(x, y - .1, z); room.add(sp, sp.target)
    makeHotspot(key, g, { ...def, offset: [0.25, 0.05, 2.1] })
    return g
  }
  const FY = 3.15
  frame('sites', -3.65, FY, 1.05, .78, T.picSites, 'Sites', M('#2a1d14', { roughness: .4 }), { title: 'Sites', sub: 'Site arrangement · map · who goes where' })
  frame('schedule', -2.2, FY + .12, 1.05, .78, T.picSchedule, 'Schedule', M('#1c1c1c', { roughness: .35 }), { title: 'Schedule & timecard', sub: 'Daily and weekly schedule, leave, hours' })
  frame('team', -0.75, FY, 1.05, .78, T.picTeam, 'Team', M(C.brass, { metalness: .7, roughness: .35 }), { title: 'Team', sub: 'The crew, roles, contacts' })

  /* ── sideboard + pantry ── */
  const pantry = new THREE.Group(); room.add(pantry)
  const SX = 1.0, SZ = -4.62
  box(pantry, 1.6, .8, .66, M('#cfae84', { roughness: .55 }), SX, .44, SZ)
  box(pantry, 1.64, .05, .7, M('#c4a176', { roughness: .45 }), SX, .865, SZ)
  for (let i = 0; i < 4; i++) cyl(pantry, .02, .015, .08, M('#2a2a2a'), SX - .7 + (i % 2) * 1.4, .04, SZ + (i < 2 ? .25 : -.25), 8)
  box(pantry, .76, .66, .02, M('#d8ba92'), SX - .39, .45, SZ + .335); box(pantry, .76, .66, .02, M('#d8ba92'), SX + .39, .45, SZ + .335)
  cyl(pantry, .015, .015, .1, brass, SX - .05, .5, SZ + .35, 8).rotation.x = Math.PI / 2; cyl(pantry, .015, .015, .1, brass, SX + .05, .5, SZ + .35, 8).rotation.x = Math.PI / 2
  box(pantry, .42, .42, .36, M('#8e2f25', { roughness: .35 }), SX - .3, 1.1, SZ - .05)
  box(pantry, .44, .04, .38, chrome, SX - .3, 1.33, SZ - .05)
  box(pantry, .36, .05, .2, chrome, SX - .3, .92, SZ + .1)
  cyl(pantry, .045, .045, .07, chrome, SX - .3, 1.02, SZ + .1, 16)
  cyl(pantry, .03, .025, .05, M('#f1ece2', { roughness: .3 }), SX - .3, .97, SZ + .1, 12)
  for (let i = 0; i < 3; i++) cyl(pantry, .03, .025, .05, M('#f1ece2', { roughness: .3 }), SX - .32 + i * .08, 1.38, SZ - .1, 12)
  for (let i = 0; i < 4; i++) cyl(pantry, .1, .1, .085, M(i % 2 ? '#2f6b6b' : '#c9a24a', { metalness: .5, roughness: .35 }), SX + .3, .935 + i * .09, SZ, 24)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.08, .008, 8, 24, Math.PI), chrome); handle.position.set(SX + .3, 1.27, SZ); pantry.add(handle)
  cyl(pantry, .06, .06, .16, new THREE.MeshStandardMaterial({ color: '#d9cfb7', transparent: true, opacity: .55, roughness: .1 }), SX + .62, .97, SZ - .1, 16)
  makeHotspot('pantry', pantry, { title: 'Pantry', sub: 'Where to eat · QR & split bill', offset: [0.3, 0.45, 1.9] })

  /* ── bookshelf + library + games ── */
  const shelf = new THREE.Group(); room.add(shelf)
  const BX = 3.55, BZ = -4.73, BW = 2.4, BH = 3.4, BD = .48
  const shelfMat = M('#cfae84', { roughness: .55 })
  box(shelf, .06, BH, BD, shelfMat, BX - BW / 2, BH / 2, BZ)
  box(shelf, .06, BH, BD, shelfMat, BX + BW / 2, BH / 2, BZ)
  box(shelf, BW, BH, .02, M('#efeee9'), BX, BH / 2, BZ - BD / 2 + .01)
  const levels = [.1, .78, 1.46, 2.14, 2.82, BH - .02]
  levels.forEach(y => box(shelf, BW, .05, BD, shelfMat, BX, y, BZ))
  box(shelf, BW + .1, .08, BD + .06, shelfMat, BX, BH + .02, BZ)

  const library = new THREE.Group(); room.add(library)
  const spineCols = ['#7a2e26', '#2f4a3f', '#3c4f63', '#8a6a35', '#5b3a5c', '#26403a', '#a0522d', '#40362e', '#6e7b5a', '#1f2f45', '#93443a', '#c2a46a']
  const spineMats = spineCols.map(c => M(c, { roughness: .7 }))
  const goldM = M('#d8b76a', { metalness: .6, roughness: .4 })
  function fillShelf(y, x0, x1, grp) {
    let x = x0
    while (x < x1 - .06) {
      const t = .045 + rnd() * .06, h = .36 + rnd() * .2, d = .26 + rnd() * .08
      if (x + t > x1) break
      const b = box(grp, t, h, d, pick(spineMats), x + t / 2, y + .025 + h / 2, BZ + .05)
      if (rnd() < .08 && x + .25 < x1) { b.rotation.z = .22; b.position.x += .04; x += .1 }
      if (rnd() < .3) box(grp, t * .7, .015, .005, goldM, x + t / 2, y + .1 + h * .5, BZ + .05 + d / 2 + .002, { cast: false })
      x += t + .003
    }
  }
  fillShelf(levels[0], BX - 1.15, BX + 1.15, library)
  fillShelf(levels[1], BX - 1.15, BX + .55, library)
  fillShelf(levels[3], BX - 1.15, BX + 1.15, library)
  fillShelf(levels[4], BX - 1.15, BX + .3, library)
  for (let i = 0; i < 6; i++) box(library, .07, .34, .3, M(i % 2 ? '#2b3a4a' : '#e6dcc8', { roughness: .6 }), BX + .65 + i * .08, levels[1] + .2, BZ + .04)
  cyl(shelf, .09, .07, .2, M('#3f6e5a', { roughness: .4 }), BX + .75, levels[4] + .12, BZ + .05, 16)

  // games: board-game boxes + the special "games" book on level 2
  const games = new THREE.Group(); room.add(games)
  const GY = levels[2] + .025
  ;['#b23a2e', '#2f6b43', '#d6a23a'].forEach((c, i) => {
    const bw = .62 - i * .06, bd = .38 - i * .03
    box(games, bw, .07, bd, M(c, { roughness: .55 }), BX + .55, GY + .035 + i * .075, BZ + .02)
    box(games, bw * .6, .002, bd * .5, M('#f3ead5'), BX + .55, GY + .072 + i * .075, BZ + .02, { cast: false })
  })
  const gameBook = new THREE.Group(); games.add(gameBook)
  const bookHome = new THREE.Vector3(BX - .35, GY + .3, BZ + .04)
  gameBook.position.copy(bookHome)
  const BT = .12, BHt = .5, BDp = .36
  const bookGreen = M('#1f4d36', { roughness: .6 })
  const pageSide = M('#efe5cf')
  const pagesMesh = new THREE.Mesh(new THREE.BoxGeometry(BT - .02, BHt - .02, BDp - .02), [M('#ffffff', { map: T.page, roughness: .9 }), pageSide, pageSide, pageSide, pageSide, pageSide])
  pagesMesh.castShadow = true; gameBook.add(pagesMesh)
  box(gameBook, .012, BHt, BDp, bookGreen, -BT / 2 + .006, 0, 0)
  const spine = new THREE.Mesh(new THREE.BoxGeometry(BT, BHt, .012), [bookGreen, bookGreen, bookGreen, bookGreen, M('#ffffff', { map: T.spine, roughness: .6 }), bookGreen])
  spine.position.set(0, 0, BDp / 2); spine.castShadow = true; gameBook.add(spine)
  const coverPivot = new THREE.Group(); coverPivot.position.set(BT / 2 - .006, 0, BDp / 2); gameBook.add(coverPivot)
  const frontCover = new THREE.Mesh(new THREE.BoxGeometry(.012, BHt, BDp), [M('#ffffff', { map: T.cover, roughness: .6 }), bookGreen, bookGreen, bookGreen, bookGreen, bookGreen])
  frontCover.position.set(0, 0, -BDp / 2); frontCover.castShadow = true; coverPivot.add(frontCover)
  let gx = BX - 1.15
  while (gx < BX - .45) { const t = .05 + rnd() * .05, h = .38 + rnd() * .14; box(library, t, h, .3, pick(spineMats), gx + t / 2, GY + h / 2, BZ + .05); gx += t + .004 }
  makeHotspot('library', library, { title: 'Library', sub: 'Certificates, forms, drawing templates', offset: [-.2, 0.0, 2.3] })
  makeHotspot('games', games, { title: 'Games', sub: 'Break-room games · high scores', offset: [0.3, 0.12, 1.55] })

  /* ── filing cabinet ── */
  const files = new THREE.Group(); room.add(files)
  const FX = -5.25, FZ = -4.42
  box(files, .72, 1.32, .64, M('#e6e5e1', { metalness: .3, roughness: .45 }), FX, .66, FZ)
  ;['CLAIMS', 'REPORTS', 'ARCHIVE'].forEach((t, i) => {
    const y = 1.12 - i * .42
    box(files, .66, .38, .02, M('#f1f0ec', { metalness: .2, roughness: .4 }), FX, y, FZ + .33)
    box(files, .2, .025, .03, chrome, FX, y + .08, FZ + .35)
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(.16, .05), M('#ffffff', { map: T.drawerLabel(t) }))
    lbl.position.set(FX, y - .02, FZ + .342); files.add(lbl)
  })
  box(files, .4, .05, .3, M('#2e2a26'), FX, 1.345, FZ + .05)
  for (let i = 0; i < 4; i++) { const p = box(files, .26, .004, .2, M(i % 2 ? '#f4efe4' : '#e9e2d0'), FX + (rnd() - .5) * .05, 1.375 + i * .006, FZ + .05); p.rotation.y = (rnd() - .5) * .4 }
  makeHotspot('files', files, { title: 'Claims & reports', sub: 'Expense, mileage, site reports', offset: [1.4, 0.4, 1.6] })

  /* ── left wall: notice board, window, whiteboard ── */
  const feed = new THREE.Group(); room.add(feed)
  const LX = -RW / 2 + .06
  box(feed, .05, 1.08, 1.56, M('#cfae84', { roughness: .5 }), LX, 2.25, -2.3)
  const cork = new THREE.Mesh(new THREE.PlaneGeometry(1.44, .98), M('#ffffff', { map: T.cork, roughness: .95 }))
  cork.rotation.y = Math.PI / 2; cork.position.set(LX + .03, 2.25, -2.3); feed.add(cork)
  makeHotspot('feed', feed, { title: 'Notice board', sub: 'Team feed · posts and updates', offset: [2.3, 0.05, 0.25] })

  const win = new THREE.Group(); room.add(win)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.5), new THREE.MeshBasicMaterial({ map: T.night }))
  glass.rotation.y = Math.PI / 2; glass.position.set(LX - .01, 2.35, 0.35); win.add(glass)
  const wf = M('#3a3d40', { metalness: .4, roughness: .45 })
  box(win, .08, .06, 2.82, wf, LX + .02, 3.63, .35); box(win, .08, .06, 2.82, wf, LX + .02, 1.07, .35)
  box(win, .08, 2.62, .06, wf, LX + .02, 2.35, -1.03); box(win, .08, 2.62, .06, wf, LX + .02, 2.35, 1.73)
  box(win, .06, 2.5, .04, wf, LX + .02, 2.35, .35)
  box(win, .16, .03, 2.82, M('#f4f3ef'), LX + .08, 1.05, .35)
  // vertical blinds, half turned so the view shows through
  const blind = M('#efeee9', { roughness: .9 })
  for (let z = -.98; z < 1.7; z += .1) { const b = box(win, .006, 2.45, .09, blind, LX + .12, 2.35, z, { cast: false }); b.rotation.y = 1.15 }
  box(win, .06, .05, 2.8, M('#e3e2de'), LX + .12, 3.6, .35)
  const moon = new THREE.DirectionalLight('#9fb6d6', .35); moon.position.set(-10, 6, 1); room.add(moon, moon.target)

  // 7 am – 7 pm Malaysia time shows the day view. #day / #night in the URL forces one (for checking).
  let dayState = null
  function updateWindow() {
    const f = location.hash.replace('#', '')
    const hr = myTime().hour
    const day = f === 'day' ? true : f === 'night' ? false : hr >= 7 && hr < 19
    if (day === dayState) return
    dayState = day
    glass.material.map = day ? T.day : T.night; glass.material.needsUpdate = true
    moon.color.set(day ? '#fff1d6' : '#9fb6d6'); moon.intensity = day ? 1.6 : .35
  }
  updateWindow()

  // wall clock above the pantry
  const wallClock = new THREE.Group(); room.add(wallClock)
  box(wallClock, 1.2, .56, .06, M('#1a1714', { roughness: .6 }), 1.0, 2.66, -RD / 2 + .04)
  box(wallClock, 1.24, .025, .07, brass, 1.0, 2.95, -RD / 2 + .045); box(wallClock, 1.24, .025, .07, brass, 1.0, 2.37, -RD / 2 + .045)
  const clockFace = new THREE.Mesh(new THREE.PlaneGeometry(1.12, .498), new THREE.MeshBasicMaterial({ map: clock.texture, toneMapped: false }))
  clockFace.position.set(1.0, 2.66, -RD / 2 + .071); wallClock.add(clockFace)

  const tasks = new THREE.Group(); room.add(tasks)
  box(tasks, .04, 1.14, 1.84, M('#bfc3c4', { metalness: .6, roughness: .35 }), LX, 2.15, 2.65)
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 1.06), M('#ffffff', { map: T.whiteboard, roughness: .25 }))
  wb.rotation.y = Math.PI / 2; wb.position.set(LX + .025, 2.15, 2.65); tasks.add(wb)
  box(tasks, .1, .03, 1.2, M('#bfc3c4', { metalness: .6, roughness: .35 }), LX + .05, 1.57, 2.65)
  ;['#2d4a7a', '#b23a2e', '#2f8a4a'].forEach((c, i) => { cyl(tasks, .012, .012, .13, M(c), LX + .07, 1.6, 2.3 + i * .12, 8).rotation.x = Math.PI / 2 })
  makeHotspot('tasks', tasks, { title: 'Whiteboard', sub: 'Tasks · who is doing what', offset: [2.5, 0.05, 0.1] })

  /* ── plants ── */
  const leafA = M('#3d6b3b', { roughness: .6 }), leafB = M('#4f7f46', { roughness: .6 }), leafGeo = new THREE.SphereGeometry(.1, 10, 6)
  const pot = M('#cfae84', { roughness: .6 }), soil = M('#3a2a1e'), stem = M('#5a4632')
  for (const [x, z, s, tall] of PLANTS) {
    const g = new THREE.Group(); room.add(g); g.position.set(x, 0, z); g.scale.setScalar(s)
    box(g, .5, .55, .5, pot, 0, .275, 0)
    box(g, .46, .02, .46, soil, 0, .55, 0)
    const n = tall ? 26 : 16
    for (let i = 0; i < n; i++) {
      const l = new THREE.Mesh(leafGeo, i % 2 ? leafA : leafB)
      l.scale.set(.5, 1.5, .16)
      const a = rnd() * Math.PI * 2, r = .03 + rnd() * .17
      l.position.set(Math.cos(a) * r, .75 + rnd() * (tall ? 1.1 : .55), Math.sin(a) * r)
      l.rotation.set((rnd() - .5) * 1.2, a, (rnd() - .5) * 1.2)
      l.castShadow = true; g.add(l)
    }
    if (tall) cyl(g, .015, .02, 1.2, stem, 0, 1.1, 0, 6)
  }

  return { monG, pantry, shelf, files, gameBook, coverPivot, bookHome, updateWindow }
}
