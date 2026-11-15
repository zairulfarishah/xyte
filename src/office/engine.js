import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { C, createKit, disposeAll } from './kit'
import { buildTextures } from './textures'
import { createHotspots } from './hotspots'
import { createTV } from './tv'
import { createWallClock } from './clock'
import { buildRoom, PLANTS, RH } from './room'
import { buildDesks } from './desks'
import { buildCity, ease, PROGS } from './city'
import { createNav } from './nav'
import { createRoutine } from './routine'
import { createToonKit, ToonCharacter, lookFor } from './characters/toon'
import { GlbCharacter } from './characters/GlbCharacter'
import { CHARACTER_MODELS, TINTS, resolveModelUrl } from './characters/registry'

// Creates the 3D office inside `container` and returns a small API for the React page.
// Everything it creates (GPU resources, listeners, timers, DOM labels) is released by dispose().

export const PANEL_W = 400
const HOME = { pos: new THREE.Vector3(6.4, 5.2, 9.2), target: new THREE.Vector3(-0.9, 1.2, -0.6) }
const LABEL_NAMES = { dashboard: 'Dashboard', sites: 'Sites', schedule: 'Schedule', team: 'Team', games: 'Games', library: 'Library', files: 'Claims & reports', feed: 'Feed', tasks: 'Tasks', pantry: 'Break room' }

const siteShort = s => { const n = (s || '').split(' + ')[0].split(' · ')[0].trim(); return n.length > 26 ? n.slice(0, 25).trimEnd() + '…' : n }
const crewLabel = c => c.status === 'site' ? `${c.name} · on site${c.site ? ` · ${siteShort(c.site)}` : ''}` : c.status === 'leave' ? `${c.name} · on leave` : c.status === 'off' ? `${c.name} · off` : c.name
const crewSub = c => c.status === 'site' ? `On site · ${c.site}` : c.status === 'leave' ? 'On leave today' : c.status === 'off' ? `Off today${c.offLabel ? ` · ${c.offLabel}` : ''}` : `In office${c.role ? ` · ${c.role}` : ''}`

export function createOffice({ container, canvas, labelsEl, tipEl, crew: crewIn, onFocus, onHint, onPeople, onModel, onDoing }) {
  const kit = createKit()
  const crew = crewIn.slice(0, 12).map(c => ({ ...c, doing: '' }))
  let tvData = null, tvDirty = true

  /* ── renderer, scene, camera ── */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const size = () => [Math.max(1, container.clientWidth), Math.max(1, container.clientHeight)]
  let [W, H] = size()
  renderer.setSize(W, H, false)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#1b1c1e')
  scene.fog = new THREE.Fog('#1b1c1e', 16, 30)
  const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 80)
  camera.position.set(10, 6.5, 12)
  // Portrait phones: wider lens and a step back so the whole room fits
  const home = { pos: HOME.pos.clone(), target: HOME.target }
  function fitLens() {
    const portrait = W / H < 1
    camera.fov = portrait ? 58 : 38
    scene.fog.near = portrait ? 20 : 16; scene.fog.far = portrait ? 38 : 30
    home.pos.copy(HOME.target).addScaledVector(HOME.pos.clone().sub(HOME.target), portrait ? 1.3 : 1)
    camera.updateProjectionMatrix()
  }
  const controls = new OrbitControls(camera, canvas)
  controls.target.copy(HOME.target)
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: true, screenSpacePanning: false, zoomToCursor: true, panSpeed: .9, rotateSpeed: .55, enabled: false })
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }

  /* ── build ── */
  fitLens()
  const room = new THREE.Group(); scene.add(room)
  const T = buildTextures(kit)
  const hs = createHotspots()
  const tv = createTV(kit)
  const clock = createWallClock(kit)
  const R = buildRoom({ kit, T, hs, tv, clock, room })
  const toonKit = createToonKit(kit.rnd)
  const looks = crew.map((c, i) => lookFor(c.fullName || c.name, i))
  const D = buildDesks({ kit, T, hs, room, toonKit, count: crew.length, looks })
  const CT = buildCity({ kit, T, hs, room })
  const { TX, TZ } = CT

  /* ── lights: one shadow-casting directional + one spot ── */
  scene.add(new THREE.HemisphereLight('#ffffff', '#8d8f92', 1.15))
  const key = new THREE.DirectionalLight('#fffaf2', 1.25)
  key.position.set(4, 9, 6); key.target.position.set(-.5, 0, -1.5)
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 25 })
  key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 4
  scene.add(key, key.target)
  const pend = new THREE.Group(); room.add(pend)
  const barMat = kit.M('#f2f2f0', { roughness: .4 }), ledMat = new THREE.MeshBasicMaterial({ color: '#ffffff' }), wireM = kit.M('#888')
  function linear(x, z, len, alongZ) {   // linear LED pendant
    const g = new THREE.Group(); g.position.set(x, RH - .6, z); if (alongZ) g.rotation.y = Math.PI / 2; pend.add(g)
    kit.box(g, len, .05, .1, barMat, 0, 0, 0, { cast: false })
    const led = new THREE.Mesh(new THREE.PlaneGeometry(len - .04, .07), ledMat); led.rotation.x = Math.PI / 2; led.position.y = -.026; g.add(led)
    for (const s of [-1, 1]) kit.cyl(g, .003, .003, .75, wireM, s * len * .4, .4, 0, 4)
  }
  linear(TX, TZ - .4, 2.4); linear(TX, TZ + .5, 2.4)
  linear(-3.35, 1.3, 3.4, true)
  const pendLight = new THREE.SpotLight('#ffffff', 9, 7, 1.0, .8, 1.2); pendLight.position.set(TX, RH - .8, TZ); pendLight.target.position.set(TX, 0, TZ)
  pendLight.castShadow = true; pendLight.shadow.mapSize.set(1024, 1024); pendLight.shadow.bias = -.0005
  room.add(pendLight, pendLight.target)
  const fill = new THREE.PointLight('#fff8ee', 10, 0, 2); fill.position.set(-1.8, 3.7, -1.8); room.add(fill)
  const fill2 = new THREE.PointLight('#fff8ee', 8, 0, 2); fill2.position.set(-3.3, 3.7, 1.5); room.add(fill2)
  const wash = new THREE.PointLight('#f4f8ff', 4, 0, 2); wash.position.set(-4.4, 3.2, 1.2); room.add(wash)
  const cityGlow = new THREE.PointLight(C.green, 0, 2.2, 2); cityGlow.position.set(TX, 1.5, TZ); room.add(cityGlow)
  scene.updateMatrixWorld(true)

  /* ── people ── */
  // People are the built-in characters. A 3D model is only used once a real one is set in registry.js.
  const def = CHARACTER_MODELS.default || null
  let peopleMode = def ? 'model' : 'toon'
  try { const m = localStorage.getItem('xyte-people'); if (def && (m === 'toon' || m === 'model')) peopleMode = m } catch { /* storage blocked */ }
  const agents = []
  const charOf = a => (peopleMode === 'model' && a.glb) ? a.glb : a.toon
  const chairOut = (a, out) => { a.c.ch.position.set(out ? -.1 : 0, 0, out ? .78 : .55); a.c.ch.rotation.y = out ? -.5 : 0 }
  D.cubes.forEach((c, i) => {
    const toon = new ToonCharacter(toonKit.chibiStand(looks[i]), c); room.add(toon.root); toon.root.visible = false
    const L = v => c.d.localToWorld(v.clone()).setY(0)
    const f0 = c.d.localToWorld(new THREE.Vector3(0, 0, 0)), f1 = c.d.localToWorld(new THREE.Vector3(0, 0, -1))
    const seatHeading = Math.atan2(f1.x - f0.x, f1.z - f0.z)
    agents.push({
      i, c, toon, glb: null, seatHeading,
      seatPos: L(new THREE.Vector3(0, 0, .6)), standPos: L(new THREE.Vector3(0, 0, 1.0)), exit: L(new THREE.Vector3(0, 0, 1.3)),
      pos: L(new THREE.Vector3(0, 0, .6)), heading: seatHeading, speed: 0,
      state: 'seated', timer: 3 + Math.random() * 8, path: null, idx: 0, spot: null, slot: -1, holding: false, back: false, partner: -1, wait: 0, trans: 0,
    })
    hs.attach(c.k, toon.root)
  })
  const nav = createNav({
    blockObjects: [R.monG, R.pantry, R.shelf, R.files, R.couch, CT.table],
    rects: [...PLANTS.map(([x, z, s]) => [x - .25 * s, z - .25 * s, x + .25 * s, z + .25 * s]), ...D.rects],
  })
  const routine = createRoutine({
    agents, crew, nav, charOf, chairOut, couch: R.couchBed,
    onDoing: (i, text) => { onDoing?.(i, text); tvDirty = true },
    onMode: (i, mode) => D.applyPresence(i, crew[i], mode),
  })
  const isNight = () => !R.updateWindow()

  function applyCrew(i, reset = true) {
    const c = crew[i], h = hs.hotspots[D.cubes[i].k]
    h.title = c.name; h.sub = crewSub(c)
    if (reset) routine.resetAgent(i)
    const l = labels[D.cubes[i].k]
    if (l) { l.textContent = crewLabel(c); l.classList.toggle('away', c.status === 'site' || c.status === 'leave') }
  }

  // 3D model people (only when a real model is set in registry.js)
  let disposed = false
  const glbs = []
  if (!def) onModel?.('none')
  else onModel?.('loading')
  if (def) resolveModelUrl(def.url)
    .then(u => new GLTFLoader().loadAsync(u))
    .then(gltf => {
      if (disposed) return
      agents.forEach(a => {
        a.glb = new GlbCharacter(gltf, def, TINTS[a.i % TINTS.length], kit)
        room.add(a.glb.root); room.add(a.glb.props)
        hs.attach(a.c.k, a.glb.root)
        a.glb.setActivity(a.act || 'type')
        glbs.push(a.glb)
      })
      onModel?.('ready')
    })
    .catch(err => { if (!disposed) { console.warn('Character model failed to load, keeping built-in people', err); onModel?.('failed') } })

  function setPeopleMode(m) {
    peopleMode = m
    try { localStorage.setItem('xyte-people', m) } catch { /* storage blocked */ }
    agents.forEach(a => { if (a.glb) a.glb.setActivity(a.act || 'type'); a.toon.setActivity(a.act || 'type') })
    onPeople?.(m)
  }

  /* ── labels: plain DOM, glued to objects every frame ── */
  const labels = {}, anchors = {}
  Object.keys(hs.hotspots).forEach(k => {
    if (k === 'city' || k === 'crew') return
    const d = document.createElement('div')
    d.className = 'of-label' + (PROGS.includes(k) ? '' : ' obj')
    d.textContent = LABEL_NAMES[k] || hs.hotspots[k].title
    labelsEl.appendChild(d); labels[k] = d
    if (!PROGS.includes(k)) {
      const b = new THREE.Box3().setFromObject(k === 'games' ? R.gameBook : hs.hotspots[k].group)
      anchors[k] = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + .06, (b.min.z + b.max.z) / 2)
    }
  })
  let labelsAll = true
  try { labelsAll = localStorage.getItem('xyte-labels') !== 'off' } catch { /* storage blocked */ }
  crew.forEach((c, i) => applyCrew(i, false))
  routine.setRest(isNight()); routine.resetAll()

  /* ── camera modes and moves ── */
  let tween = null, focused = null
  const hint = text => onHint?.(text)
  function setOrbit(mode) {
    if (mode === 'model') {   // close up around the city: turn all the way round and zoom right in
      Object.assign(controls, { minDistance: .35, maxDistance: 6, minPolarAngle: .12, maxPolarAngle: 1.42, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity, zoomSpeed: 1.1 })
      hint('Drag to turn the model · scroll to zoom · right-drag to move')
    } else {
      Object.assign(controls, { minDistance: .8, maxDistance: 24, minPolarAngle: .3, maxPolarAngle: 1.48, minAzimuthAngle: -.35, maxAzimuthAngle: 1.75, zoomSpeed: 1.1 })
      hint('Drag to turn · scroll to zoom · right-drag to move · click anything that lights up')
    }
    controls.enabled = true; controls.update()
  }
  const moveCam = (pos, target, dur = 1100, done) => { tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), start: performance.now(), dur, done } }
  const centerOf = obj => new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3())
  const panelShift = { v: 0, to: 0 }
  function applyViewOffset() {
    const Pw = PANEL_W * panelShift.v
    if (Pw < .5) { camera.clearViewOffset(); camera.aspect = W / H }
    else { camera.aspect = (W + Pw) / H; camera.setViewOffset(W + Pw, H, Pw, 0, W, H) }
    camera.updateProjectionMatrix()
  }

  const bookAnim = { t: 0, dir: 0 }
  const BOOK_OUT = R.bookHome.clone().add(new THREE.Vector3(.05, .12, .5))
  function updateBook(dt) {
    if (!bookAnim.dir) return
    bookAnim.t = THREE.MathUtils.clamp(bookAnim.t + bookAnim.dir * dt / 1.3, 0, 1)
    if (bookAnim.t === 0) bookAnim.dir = 0
    const a = ease(Math.min(1, bookAnim.t / .6)), b = ease(THREE.MathUtils.clamp((bookAnim.t - .45) / .55, 0, 1))
    R.gameBook.position.lerpVectors(R.bookHome, BOOK_OUT, a)
    R.gameBook.rotation.y = -Math.PI / 2 * a
    R.gameBook.rotation.x = -.12 * a
    R.coverPivot.rotation.y = -2.75 * b
  }
  function resetAnims(except) {
    if (except !== 'games') bookAnim.dir = bookAnim.t > 0 ? -1 : 0
    CT.programs.forEach(p => { if (p.key !== except && p.t > 0) p.dir = -1 })
  }

  function go(k) {
    const h = hs.hotspots[k]; if (!h) return
    resetAnims(k); hideTip()
    focused = k; controls.enabled = false; hint('')
    let target
    if (k === 'games') target = BOOK_OUT.clone()
    else if (h.prog) target = centerOf(h.prog.shell)
    else target = centerOf(h.group)
    if (k === 'city') target.y += .1
    const pos = target.clone().add(new THREE.Vector3(...h.offset))
    panelShift.to = W > 720 ? 1 : 0
    onFocus?.(k, false)
    if (k === 'games') bookAnim.dir = 1
    if (h.prog) { h.prog.dir = 1; h.prog.t = 0 }
    const model = k === 'city' || !!h.prog
    cityGlow.intensity = model ? .6 : 0
    moveCam(pos, target, 1100, () => { onFocus?.(k, true); if (model) setOrbit('model') })
  }
  function goHome() {
    focused = null; panelShift.to = 0
    resetAnims(); cityGlow.intensity = 0; controls.enabled = false
    onFocus?.(null, false)
    moveCam(home.pos, home.target, 1000, () => setOrbit('room'))
  }

  /* ── labels each frame ── */
  const tmpV = new THREE.Vector3()
  let hoverCity = false
  function crewAnchor(k, v) {
    if (!k.startsWith('crew') || k === 'crew') return false
    const a = agents[+k.slice(4)]
    if (!a || ['seated', 'away', 'sleep'].includes(a.state)) return false
    if (a.state === 'couch') { v.set(a.pos.x - Math.sin(a.heading) * .9, 1.0, a.pos.z - Math.cos(a.heading) * .9); return true }
    v.copy(a.pos); v.y = charOf(a).kind === 'glb' ? 2.0 : 1.42; return true
  }
  function updateLabels() {
    camera.updateMatrixWorld()   // this frame's camera, so labels stay glued while turning
    const inModel = focused === 'city' || PROGS.includes(focused)
    for (const k in labels) {
      const l = labels[k], prog = PROGS.includes(k)
      let show = !tween && k !== focused && (prog ? (inModel || hoverCity || (labelsAll && !focused)) : (labelsAll && !focused))
      if (show) {
        if (prog) { const p = hs.hotspots[k].prog; tmpV.set(0, p.h + .1, 0); p.g.localToWorld(tmpV) }
        else if (!crewAnchor(k, tmpV)) tmpV.copy(anchors[k])
        tmpV.project(camera)
        if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.02 || Math.abs(tmpV.y) > 1.02) show = false
        else {
          const x = (tmpV.x + 1) / 2 * W, y = (1 - tmpV.y) / 2 * H - 12
          l.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
        }
      }
      if (l.classList.contains('show') !== show) l.classList.toggle('show', show)
    }
  }

  /* ── picking + tooltip ── */
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2()
  let hovered = null, downAt = null
  function pickAt(e) {
    const r = canvas.getBoundingClientRect()
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(mouse, camera)
    const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true }
    const hit = ray.intersectObjects(hs.pickables, false).find(h => shown(h.object))
    return hit ? hit.object.userData.hot : null
  }
  function hideTip() { tipEl.classList.remove('show') }
  const onMove = e => {
    if (tween) return
    const k = pickAt(e)
    if (k !== hovered) { if (hovered) hs.setGlow(hovered, false); hovered = k; if (k && k !== focused) hs.setGlow(k, true) }
    hoverCity = !!k && (k === 'city' || PROGS.includes(k))
    canvas.style.cursor = k ? 'pointer' : 'grab'
    if (k && k !== focused && e.pointerType !== 'touch') {
      tipEl.querySelector('b').textContent = hs.hotspots[k].title
      tipEl.querySelector('span').textContent = hs.hotspots[k].sub
      tipEl.style.left = (e.clientX + 16) + 'px'; tipEl.style.top = (e.clientY + 14) + 'px'; tipEl.classList.add('show')
    } else hideTip()
  }
  const onLeave = () => { if (hovered) hs.setGlow(hovered, false); hovered = null; hoverCity = false; hideTip() }
  const onMouseDown = e => { if (e.button === 1) e.preventDefault() }
  const onDown = e => { downAt = e.button === 0 ? [e.clientX, e.clientY] : null; hideTip() }
  const onUp = e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || tween) return
    const k = pickAt(e)
    if (k) { if (hovered) hs.setGlow(hovered, false); hovered = null; if (k !== focused) go(k) }
    else if (focused) goHome()
  }
  const onContext = e => e.preventDefault()
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('contextmenu', onContext)

  /* ── TV + clock ── */
  function setTVData(data) { tvData = { ...data, crew, version: (tvData?.version || 0) + 1 }; tvDirty = true }
  // canvas text needs the web font; redraw once it has loaded
  document.fonts?.load(`500 20px Poppins`).then(() => { if (!disposed) { tvDirty = true; clock.draw(true) } }).catch(() => {})

  /* ── loop ── */
  const ro = new ResizeObserver(() => {
    const [w, h] = size(); if (w === W && h === H) return
    W = w; H = h; renderer.setSize(W, H, false); fitLens(); applyViewOffset()
  })
  ro.observe(container)
  const timer = new THREE.Timer()
  let raf = 0, slowT = 0
  function frame(ts) {
    raf = requestAnimationFrame(frame)
    timer.update(ts)
    if (dev) dev.frames++
    const dt = Math.min(timer.getDelta(), .1)
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.start) / tween.dur), e = ease(t)
      camera.position.lerpVectors(tween.p0, tween.p1, e)
      controls.target.lerpVectors(tween.t0, tween.t1, e)
      camera.lookAt(controls.target)
      if (t >= 1) { const d = tween.done; tween = null; d && d() }
    } else if (controls.enabled) {
      controls.update()
      // keep the pan target inside the room
      const Tg = controls.target, cx = THREE.MathUtils.clamp(Tg.x, -5.6, 5.6), cy = THREE.MathUtils.clamp(Tg.y, .1, 3.2), cz = THREE.MathUtils.clamp(Tg.z, -4.6, 4.6)
      if (cx !== Tg.x || cy !== Tg.y || cz !== Tg.z) { camera.position.x += cx - Tg.x; camera.position.y += cy - Tg.y; camera.position.z += cz - Tg.z; Tg.set(cx, cy, cz) }
    }
    if (panelShift.v !== panelShift.to) {
      panelShift.v += (panelShift.to - panelShift.v) * Math.min(1, dt * 6)
      if (Math.abs(panelShift.v - panelShift.to) < .002) panelShift.v = panelShift.to
      applyViewOffset()
    }
    updateBook(dt); CT.updatePrograms(dt)
    slowT += dt
    if (slowT > 15) { slowT = 0; routine.setRest(isNight()) }
    clock.draw()
    tv.draw(tvData, tvDirty); tvDirty = false
    try { routine.update(dt) } catch (err) { if (!frame.warned) { console.error(err); frame.warned = true } }
    if (cityGlow.intensity > 0) cityGlow.intensity = .5 + Math.sin(performance.now() * .004) * .12
    updateLabels()
    renderer.render(scene, camera)
  }
  // pause rendering while the tab is hidden
  const onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
    else if (!raf && !disposed) { timer.reset(); raf = requestAnimationFrame(frame) }
  }
  document.addEventListener('visibilitychange', onVisibility)
  const onHash = () => routine.setRest(isNight())     // #day / #night switch straight away
  window.addEventListener('hashchange', onHash)
  if (!document.hidden) raf = requestAnimationFrame(frame)
  const introT = setTimeout(() => moveCam(home.pos, home.target, 1800, () => setOrbit('room')), 350)

  const dev = import.meta.env.DEV ? (window.__xyte = { go, goHome, camera, controls, agents, routine, nav, city: CT, frames: 0, THREE }) : null

  /* ── API for the page ── */
  return {
    go, goHome,
    get focused() { return focused },
    setTVData,
    setCrew(next) {
      next.slice(0, crew.length).forEach((n, i) => {
        const c = crew[i]
        const changed = n.status !== c.status || n.site !== c.site
        Object.assign(c, n, { doing: c.doing })
        if (changed) applyCrew(i)
        else { hs.hotspots[D.cubes[i].k].title = c.name; const l = labels[D.cubes[i].k]; if (l) l.textContent = crewLabel(c) }
      })
      tvDirty = true
    },
    getCrew: () => crew,
    get labels() { return labelsAll },
    setLabels(on) { labelsAll = on; try { localStorage.setItem('xyte-labels', on ? 'on' : 'off') } catch { /* storage blocked */ } },
    get people() { return peopleMode },
    setPeopleMode,
    dispose() {
      disposed = true
      clearTimeout(introT)
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('hashchange', onHash)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('contextmenu', onContext)
      controls.dispose()
      glbs.forEach(g => g.dispose())
      Object.values(labels).forEach(l => l.remove())
      disposeAll(scene, kit)
      renderer.dispose()
      if (window.__xyte) delete window.__xyte
    },
  }
}
