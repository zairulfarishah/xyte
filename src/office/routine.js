import * as THREE from 'three'
import { damp } from './characters/GlbCharacter'

// The crew's day: type at the desk → stand up (chair out) → walk to a free spot → do the
// activity for 6–13 s → walk back → sit (chair in). At most 3 people up at once. People on site
// or on leave never wander. Movement: turn on the spot before sharp corners, ease in/out, give way,
// walk round people standing still, sideways-only separation, slide along edges, re-plan after
// 1.5 s without progress, squeeze past after 6 s of deadlock. Ported from the prototype unchanged.

export const SPOTS = {
  book: { slots: [[3.05, -3.95], [3.8, -3.95]], face: [[0, -1], [0, -1]], act: 'read', text: 'Reading at the bookshelf' },
  coffee: { slots: [[0.6, -3.85], [1.2, -3.85]], face: [[0, -1], [0, -1]], act: 'coffee', text: 'Making coffee' },
  city: { slots: [[1.0, -1.55], [1.85, -1.55]], face: [[0, 1], [0, 1]], act: 'city', text: 'Looking at the program city' },
  window: { slots: [[-5.45, -0.6], [-5.45, 0.65]], face: [[-1, 0], [-1, 0]], act: 'look', text: 'Looking out of the window' },
  board: { slots: [[-5.45, 1.95], [-5.45, 3.3]], face: [[-1, 0], [-1, 0]], act: 'write', text: 'Writing on the whiteboard' },
  notice: { slots: [[-5.45, -2.3], [-5.45, -2.8]], face: [[-1, 0], [-1, 0]], act: 'look', text: 'Reading the notice board' },
  chat: { slots: [[2.3, -2.45], [2.95, -2.45]], face: [[1, 0], [-1, 0]], act: 'talk', text: 'Chatting', pair: true },
}
const angDiff = (a, b) => ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
const MAX_UP = 3

export function createRoutine({ agents, crew, nav, charOf, chairOut, onDoing }) {
  const taken = {}
  const setDoing = (a, text) => { crew[a.i].doing = text; onDoing?.(a.i, text) }

  function release(a) { if (a.holding) { delete taken[a.spot + a.slot]; a.holding = false } }
  function setAct(a, act) { a.toon.setActivity(act); if (a.glb) a.glb.setActivity(act); a.act = act }
  function claim(a, k, sl) { taken[k + sl] = a.i; a.holding = true; a.spot = k; a.slot = sl }

  function resetAgent(i) {
    const a = agents[i]; if (!a) return
    release(a); a.spot = null; a.partner = -1; a.speed = 0; a.path = null; a.final = null; a.next = null
    if (crew[i].status !== 'office') {
      a.state = 'away'; setAct(a, 'idle')
      setDoing(a, crew[i].status === 'leave' ? 'On leave' : crew[i].status === 'off' ? 'Off today' : 'On site')
      return
    }
    a.state = 'seated'; a.timer = 3 + Math.random() * 8; a.pos.copy(a.seatPos); a.heading = a.seatHeading
    setAct(a, 'type'); chairOut(a, false); setDoing(a, 'Working at the desk')
  }

  function startTrip(a, forced) {
    const keys = forced ? [forced] : Object.keys(SPOTS).sort(() => Math.random() - .5)
    for (const k of keys) {
      const S = SPOTS[k]
      if (S.pair) {
        if (taken[k + 0] !== undefined || taken[k + 1] !== undefined) continue
        const mates = agents.filter(b => b !== a && b.state === 'seated')
        if (!mates.length) continue
        const b = mates[Math.floor(Math.random() * mates.length)]
        claim(a, k, 0); claim(b, k, 1); a.partner = b.i; b.partner = a.i
        leaveDesk(a); leaveDesk(b); return true
      }
      for (let sl = 0; sl < S.slots.length; sl++) if (taken[k + sl] === undefined) { claim(a, k, sl); leaveDesk(a); return true }
    }
    return false
  }
  function leaveDesk(a) {
    a.state = 'standUp'; a.trans = 0; a.back = false; a.speed = 0
    setAct(a, 'idle'); chairOut(a, true)
    setDoing(a, 'On the way · ' + SPOTS[a.spot].text.toLowerCase())
  }
  function goTo(a, target) {
    const p = nav.findPath(a.pos, target)
    if (!p) return false
    a.path = p; a.idx = 1; a.state = 'walk'; return true
  }
  function arrive(a) {
    a.speed = 0
    if (a.back) { a.state = 'sitDown'; a.trans = 0; setAct(a, 'sit'); return }
    const S = SPOTS[a.spot]
    a.state = 'face'; a.faceTo = Math.atan2(...S.face[a.slot])
    setDoing(a, S.text)
  }
  function headBack(a) {
    release(a); a.back = true; a.partner = -1
    setDoing(a, 'Walking back to the desk')
    if (!goTo(a, a.exit)) { a.path = [a.pos.clone(), a.exit.clone()]; a.idx = 1; a.state = 'walk' }
    a.final = [a.standPos.clone()]
  }

  function update(dt) {
    const out = agents.filter(a => !['seated', 'away'].includes(a.state)).length
    for (const a of agents) {
      switch (a.state) {
        case 'away': break
        case 'seated':
          a.timer -= dt
          if (a.timer <= 0) { if (!(out < MAX_UP && Math.random() < .75 && startTrip(a))) a.timer = 6 + Math.random() * 10 }
          break
        case 'standUp':                                  // slide back out of the chair, then head off
          a.trans = Math.min(1, a.trans + dt / .9)
          a.pos.lerpVectors(a.seatPos, a.standPos, THREE.MathUtils.smoothstep(a.trans, 0, 1))
          if (a.trans >= 1) { a.path = [a.pos.clone(), a.exit.clone()]; a.idx = 1; a.state = 'walk'; a.final = null; a.next = 'toSpot' }
          break
        case 'walk': walkStep(a, dt); break
        case 'face': {
          const d = angDiff(a.heading, a.faceTo)
          a.heading += Math.sign(d) * Math.min(Math.abs(d), 3.2 * dt)
          setAct(a, Math.abs(d) > .15 ? 'turn' : a.act === 'turn' ? 'idle' : a.act)
          if (Math.abs(d) <= .02) {
            const S = SPOTS[a.spot]
            if (S.pair) { a.state = 'waitMate'; a.wait = 0; setAct(a, 'wait') }
            else { a.state = 'act'; a.timer = 6 + Math.random() * 7; setAct(a, S.act) }
          }
          break
        }
        case 'waitMate': {
          a.wait += dt; const b = agents[a.partner]
          if (b && (b.state === 'waitMate' || b.state === 'act')) {
            a.state = 'act'; a.timer = 9 + Math.random() * 6; setAct(a, 'talk')
            if (b.state === 'waitMate') { b.state = 'act'; b.timer = a.timer + Math.random(); setAct(b, 'talk') }
          } else if (a.wait > 25 || !b || b.state === 'away') headBack(a)
          break
        }
        case 'act':
          a.timer -= dt
          if (a.timer <= 0) headBack(a)
          break
        case 'sitDown':
          a.trans = Math.min(1, a.trans + dt / 1.0)
          a.heading += angDiff(a.heading, a.seatHeading) * Math.min(1, dt * 8)
          a.pos.lerpVectors(a.standPos, a.seatPos, THREE.MathUtils.smoothstep(a.trans, .2, 1))
          if (a.trans > .5) chairOut(a, false)
          if (a.trans >= 1) { a.state = 'seated'; a.timer = 10 + Math.random() * 16; a.spot = null; setAct(a, 'type'); setDoing(a, 'Working at the desk') }
          break
      }
      // apply to the characters
      const present = a.state !== 'away'
      const shown = charOf(a)
      for (const ch of [a.toon, a.glb]) {
        if (!ch) continue
        const active = ch === shown
        ch.root.position.copy(a.pos)
        ch.root.rotation.y = a.heading + (ch.kind === 'toon' ? Math.PI : 0)
        ch.speed = a.speed
        if (ch.kind === 'glb') { ch.root.visible = active && present; if (ch.props) ch.props.visible = active && present; if (active && present) ch.update(dt) }
        else ch.update(dt, active, present)
      }
      if (a.glb && shown === a.glb) a.c.fig.visible = false
    }
  }

  function walkStep(a, dt) {
    const tgt = a.path[a.idx], last = a.idx === a.path.length - 1
    const dx = tgt.x - a.pos.x, dz = tgt.z - a.pos.z, dist = Math.hypot(dx, dz)
    const want = Math.atan2(dx, dz), d = angDiff(a.heading, want)
    // turn in place first if the corner is sharp, otherwise steer while walking
    if (Math.abs(d) > 1.1 && a.speed < .25) { a.heading += Math.sign(d) * Math.min(Math.abs(d), 3.4 * dt); a.speed = damp(a.speed, 0, 8, dt); setAct(a, 'turn'); return }
    a.heading += Math.sign(d) * Math.min(Math.abs(d), (2.2 + a.speed * 2) * dt)
    let vmax = 1.05
    if (last) vmax = Math.min(vmax, .35 + dist * 1.4)
    if (Math.abs(d) > .5) vmax = Math.min(vmax, .45)
    // give way: someone standing close in front → slow down / wait, then sidestep
    let block = null
    for (const b of agents) {
      if (b === a || ['seated', 'away', 'standUp', 'sitDown'].includes(b.state)) continue
      const ox = b.pos.x - a.pos.x, oz = b.pos.z - a.pos.z, od = Math.hypot(ox, oz)
      if (od < .75) {
        const ahead = (ox * Math.sin(a.heading) + oz * Math.cos(a.heading)) / (od || 1)
        if (ahead > .45 && (b.speed < .1 || a.i > b.i)) block = { b, od }
      }
    }
    if (a.ghost > 0) { a.ghost -= dt; block = null }
    const still = block && (block.b.speed < .1 || block.b.state !== 'walk')
    if (block) { a.wait += dt; a.waitTotal = (a.waitTotal || 0) + dt; vmax = Math.min(vmax, still ? .3 : (block.od < .55 ? 0 : .25)) }
    else { a.wait = Math.max(0, a.wait - dt * 2); a.waitTotal = Math.max(0, (a.waitTotal || 0) - dt) }
    if ((a.waitTotal || 0) > 6) { a.ghost = 2.5; a.waitTotal = 0; a.wait = 0 }        // deadlock breaker: squeeze past
    a.speed = damp(a.speed, vmax, 4, dt)
    const step = a.speed * dt
    let nx = a.pos.x + Math.sin(a.heading) * step, nz = a.pos.z + Math.cos(a.heading) * step
    if (block && (still || a.wait > 1.2)) {                        // walk round someone standing still (or after waiting)
      const px = Math.cos(a.heading), pz = -Math.sin(a.heading)
      const ox = block.b.pos.x - a.pos.x, oz = block.b.pos.z - a.pos.z
      const side = (px * ox + pz * oz) > 0 ? -1 : 1, k = .7 * dt
      let sx = px * side * k, sz = pz * side * k
      if (!nav.freeAt(nx + sx * 6, nz + sz * 6)) { sx = -sx; sz = -sz }
      if (nav.freeAt(nx + sx * 6, nz + sz * 6)) { nx += sx; nz += sz }
      if (a.wait > 4) { a.wait = 0; const fin = a.path[a.path.length - 1]; if (!goTo(a, fin)) { a.path = [a.pos.clone(), fin]; a.idx = 1 } return }
    }
    // separation: never stand inside someone else
    for (const b of agents) {
      if (b === a || b.state === 'away' || b.state === 'seated') continue
      if (a.ghost > 0) break
      const ox = nx - b.pos.x, oz = nz - b.pos.z, od = Math.hypot(ox, oz)
      if (od < .45 && od > 1e-4) {
        // push sideways only (never backwards), so people slip past each other in narrow aisles
        const px = Math.cos(a.heading), pz = -Math.sin(a.heading), lat = (ox * px + oz * pz) / od, push = (.45 - od) * .6
        const sgn = Math.abs(lat) < .05 ? 1 : Math.sign(lat)
        nx += px * sgn * push; nz += pz * sgn * push
      }
    }
    const inside = !nav.freeAt(a.pos.x, a.pos.z)
    const before = Math.hypot(tgt.x - a.pos.x, tgt.z - a.pos.z)
    if (inside || a.idx <= 1 || last || nav.freeAt(nx, nz)) { a.pos.x = nx; a.pos.z = nz }
    else if (nav.freeAt(nx, a.pos.z)) a.pos.x = nx                  // slide along x
    else if (nav.freeAt(a.pos.x, nz)) a.pos.z = nz                  // slide along z
    // progress watchdog: wanting to move but not getting closer → plan a fresh path from here
    const after = Math.hypot(tgt.x - a.pos.x, tgt.z - a.pos.z)
    if (a.speed > .2 && after > before - step * .3) a.noProg = (a.noProg || 0) + dt; else a.noProg = 0
    if (a.noProg > 1.5) {
      a.noProg = 0; const fin = a.path[a.path.length - 1]
      const np = nav.findPath(a.pos, fin)
      if (np) { a.path = np; a.idx = 1 } else { a.path = [a.pos.clone(), fin]; a.idx = 1 }
      return
    }
    setAct(a, a.speed > .05 ? 'walk' : 'idle')
    if (dist < (last ? .06 : .22)) {
      if (!last) { a.idx++; return }
      a.pos.x = tgt.x; a.pos.z = tgt.z
      if (a.final && a.final.length) { a.path = [a.pos.clone(), a.final.shift()]; a.idx = 1; return }
      if (a.next === 'toSpot') {
        a.next = null
        const [sx, sz] = SPOTS[a.spot].slots[a.slot]
        // no route to the spot: give it up and go back to the desk
        if (!goTo(a, new THREE.Vector3(sx, 0, sz))) { a.back = true; release(a); a.path = [a.pos.clone(), a.standPos.clone()]; a.idx = 1; a.final = [] }
        return
      }
      arrive(a)
    }
  }

  return { update, resetAgent, startTrip, taken }
}
