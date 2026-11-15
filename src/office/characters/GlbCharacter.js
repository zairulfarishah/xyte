import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

// A skinned .glb person: AnimationMixer with weighted cross-fades, walk speed matched to
// movement, and pose layers (sit, type, sleep, read, coffee, write, city, look, talk) made by aiming
// bones in world space. If the model ships a real clip for a layer, the clip is used instead.
// 'lie' lays the whole model on its back (couch nap), feet at the root, head towards -forward.

export const POSE_LAYERS = ['sit', 'type', 'sleep', 'read', 'coffee', 'write', 'city', 'look', 'talk']
const LIE_Y = .57
const ACTIVITY_LAYERS = { idle: [], walk: [], turn: [], lie: [], sit: ['sit'], type: ['sit', 'type'], sleep: ['sit', 'sleep'], read: ['read'], coffee: ['coffee'], write: ['write'], city: ['city'], look: ['look'], talk: ['talk'], wait: ['look'] }
const UP = new THREE.Vector3(0, 1, 0)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3()
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion()
const _F = new THREE.Vector3(), _L = new THREE.Vector3(), _D = new THREE.Vector3(0, -1, 0)
export const damp = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt))

export class GlbCharacter {
  constructor(src, def, tint, kit) {
    this.kind = 'glb'; this.def = def; this.activity = 'idle'; this.speed = 0; this.t = Math.random() * 20
    this.root = new THREE.Group()
    this.model = SkeletonUtils.clone(src.scene); this.root.add(this.model)
    this.model.traverse(o => {
      if (!o.isMesh) return
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false
      o.material = o.material.clone()
      const joints = /joint/i.test(o.name) || /joint/i.test(o.material.name)
      o.material.color.set(joints ? tint.joint : tint.body); o.material.roughness = joints ? .35 : .55; o.material.metalness = joints ? .3 : .05
    })
    this.bones = {}; this.model.traverse(o => { if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o })
    this.mixer = new THREE.AnimationMixer(this.model)
    this.actions = {}; this.w = {}; this.wt = {}
    for (const [k, name] of Object.entries(def.clips)) {
      let clip = THREE.AnimationClip.findByName(src.animations, name); if (!clip) continue
      const additive = (def.additive || []).includes(k)
      if (additive) { clip = clip.clone(); THREE.AnimationUtils.makeClipAdditive(clip) }
      const act = this.mixer.clipAction(clip); if (additive) act.blendMode = THREE.AdditiveAnimationBlendMode
      act.play(); act.time = Math.random() * clip.duration
      this.actions[k] = act; this.w[k] = this.wt[k] = k === 'idle' ? 1 : 0; act.setEffectiveWeight(this.w[k])
    }
    // layers the model has real clips for are played as clips, not posed
    this.clipLayers = new Set(POSE_LAYERS.filter(l => this.actions[l]))
    this.layer = {}; this.layerT = {}; POSE_LAYERS.forEach(l => { this.layer[l] = this.layerT[l] = 0 })
    this.hipY = null
    // props live in the room and follow the hands each frame (they stay upright)
    const { M, box, cyl } = kit
    this.props = new THREE.Group()
    this.mug = new THREE.Group(); this.props.add(this.mug)
    cyl(this.mug, .04, .035, .1, M('#f4f2ec', { roughness: .35 }), 0, 0, 0, 16)
    this.marker = new THREE.Group(); this.props.add(this.marker)
    cyl(this.marker, .012, .012, .14, M('#2d4a7a'), 0, 0, 0, 8)
    this.book = new THREE.Group(); this.root.add(this.book); this.book.position.set(0, 1.12, .3); this.book.rotation.x = -.75
    for (const s of [-1, 1]) {
      const c = box(this.book, .15, .22, .012, M('#2f4a3f', { roughness: .6 }), s * .075, 0, 0); c.rotation.y = s * .25
      const pg = box(this.book, .14, .21, .014, M('#f4ecd8', { roughness: .8 }), s * .072, 0, .008); pg.rotation.y = s * .25
    }
    this.setActivity('idle')
  }

  setActivity(a) {
    this.activity = a
    const walk = a === 'walk', turn = a === 'turn'
    for (const k in this.wt) this.wt[k] = 0
    const layers = ACTIVITY_LAYERS[a] || []
    const clipLayer = layers.find(l => this.clipLayers.has(l))
    this.wt.idle = walk || clipLayer ? 0 : turn ? .45 : 1
    this.wt.walk = walk ? 1 : turn ? .55 : 0
    if (clipLayer) this.wt[clipLayer] = 1
    if (a === 'talk' && !this.clipLayers.has('talk')) this.wt.nod = .9
    POSE_LAYERS.forEach(l => { this.layerT[l] = 0 })
    layers.forEach(l => { if (!this.clipLayers.has(l)) this.layerT[l] = 1 })
    if (a === 'lie' || a === 'sleep') POSE_LAYERS.forEach(l => { this.layer[l] = this.layerT[l] })   // snap, no half-poses
  }

  aim(bn, cn, dir, w) {
    if (w < .002) return
    const b = this.bones[bn], c = this.bones[cn]; if (!b || !c) return
    b.getWorldPosition(_a); c.getWorldPosition(_b); _b.sub(_a).normalize()
    _qa.setFromUnitVectors(_b, _d.copy(dir).normalize())
    b.getWorldQuaternion(_qb); _qa.multiply(_qb)
    b.parent.getWorldQuaternion(_qc).invert(); _qc.multiply(_qa)
    b.quaternion.slerp(_qc, Math.min(1, w))
    b.updateMatrixWorld(true)
  }

  update(dt) {
    this.t += dt
    for (const k in this.actions) { this.w[k] = damp(this.w[k], this.wt[k], 6, dt); this.actions[k].setEffectiveWeight(this.w[k]) }
    if (this.actions.walk) this.actions.walk.timeScale = this.activity === 'turn' ? .7 : THREE.MathUtils.clamp(this.speed / this.def.walkSpeed, .3, 1.3)
    if (this.actions.nod) this.actions.nod.timeScale = .8
    POSE_LAYERS.forEach(l => { this.layer[l] = damp(this.layer[l], this.layerT[l], 5, dt) })
    const L = this.layer, lie = this.activity === 'lie'
    this.model.rotation.x = lie ? -Math.PI / 2 : 0
    this.model.position.y = lie ? LIE_Y : this.hipY === null ? 0 : (.56 - this.hipY) * L.sit
    this.mixer.update(dt)
    this.root.updateMatrixWorld(true)
    if (this.hipY === null && this.bones.Hips && !lie) { this.bones.Hips.getWorldPosition(_a); this.hipY = _a.y - this.root.position.y }
    // body frame
    const h = this.root.rotation.y, t = this.t
    const F = _F.set(Math.sin(h), 0, Math.cos(h)), Lf = _L.set(Math.cos(h), 0, -Math.sin(h)), D = _D
    const v = (...terms) => { const r = new THREE.Vector3(); for (let i = 0; i < terms.length; i += 2) r.addScaledVector(terms[i], terms[i + 1]); return r }
    const sides = [['Left', 1], ['Right', -1]]
    if (L.sit > .002) {
      this.aim('Spine', 'Spine1', v(UP, 1, F, .12), L.sit)
      for (const [n, s] of sides) {
        this.aim(n + 'UpLeg', n + 'Leg', v(F, 1, UP, -.06, Lf, s * .13), L.sit)
        this.aim(n + 'Leg', n + 'Foot', v(D, 1, F, .14, Lf, s * .03), L.sit)
      }
    }
    if (L.type > .002) {
      this.aim('Neck', 'Head', v(UP, 1, F, .2), L.type)
      for (const [n, s] of sides) {
        const bob = Math.max(0, Math.sin(t * 13 + s * 1.9)) * .06
        this.aim(n + 'Arm', n + 'ForeArm', v(D, .85, F, .55, Lf, s * .22), L.type)
        this.aim(n + 'ForeArm', n + 'Hand', v(F, 1, UP, -.04 + bob, Lf, -s * .32), L.type)
      }
    }
    if (L.sleep > .002) {                                     // slumped forward, head on folded arms
      const br = Math.sin(t * 1.4) * .03
      this.aim('Spine', 'Spine1', v(UP, 1, F, .75 + br), L.sleep)
      this.aim('Spine1', 'Spine2', v(UP, .55, F, 1), L.sleep)
      this.aim('Neck', 'Head', v(F, 1, D, .7, Lf, .25), L.sleep)
      for (const [n, s] of sides) {
        this.aim(n + 'Arm', n + 'ForeArm', v(F, .8, D, .55, Lf, s * .35), L.sleep)
        this.aim(n + 'ForeArm', n + 'Hand', v(Lf, -s, F, .35, D, .05), L.sleep)
      }
    }
    if (L.read > .002) {
      this.aim('Neck', 'Head', v(UP, 1, F, .5), L.read)
      for (const [n, s] of sides) {
        this.aim(n + 'Arm', n + 'ForeArm', v(D, 1, F, .35, Lf, s * .25), L.read)
        this.aim(n + 'ForeArm', n + 'Hand', v(F, .7, UP, .5, Lf, -s * .45), L.read)
      }
    }
    if (L.coffee > .002) {
      const sip = Math.sin(t * .9) > .6
      this.aim('RightArm', 'RightForeArm', v(D, 1, F, .3, Lf, -.18), L.coffee)
      this.aim('RightForeArm', 'RightHand', sip ? v(UP, .95, F, .3, Lf, .45) : v(F, .7, UP, .35, Lf, .2), L.coffee)
      if (sip) this.aim('Neck', 'Head', v(UP, 1, F, -.12), L.coffee)
    }
    if (L.write > .002) {
      this.aim('Neck', 'Head', v(UP, 1, F, .08), L.write)
      this.aim('RightArm', 'RightForeArm', v(F, .75, UP, .5, Lf, -.12), L.write)
      this.aim('RightForeArm', 'RightHand', v(UP, .8, F, .5, Lf, Math.sin(t * 2.2) * .3), L.write)
    }
    if (L.city > .002) {
      this.aim('Spine', 'Spine1', v(UP, 1, F, .25), L.city)
      this.aim('Neck', 'Head', v(UP, 1, F, .8, Lf, Math.sin(t * .4) * .3), L.city)
      for (const [n, s] of sides) {
        this.aim(n + 'Arm', n + 'ForeArm', v(D, 1, F, -.35, Lf, s * .12), L.city)
        this.aim(n + 'ForeArm', n + 'Hand', v(F, -.45, D, .25, Lf, -s * .85), L.city)
      }
    }
    if (L.look > .002) this.aim('Neck', 'Head', v(UP, 1, F, .05 + Math.sin(t * .5) * .05, Lf, Math.sin(t * .3) * .25), L.look)
    if (L.talk > .002) {
      this.aim('RightArm', 'RightForeArm', v(D, 1, F, .3, Lf, -.22), L.talk)
      this.aim('RightForeArm', 'RightHand', v(F, .8, UP, .3 + Math.sin(t * 2.6) * .2, Lf, -.15 + Math.sin(t * 1.7) * .3), L.talk)
      this.aim('LeftArm', 'LeftForeArm', v(D, 1, F, .1, Lf, .15), L.talk * .6)
    }
    // props
    this.book.visible = L.read > .5
    this.mug.visible = L.coffee > .5; this.marker.visible = L.write > .5
    if (this.mug.visible && this.bones.RightHand) { this.bones.RightHand.getWorldPosition(this.mug.position); this.mug.position.addScaledVector(F, .03); this.mug.position.y += .02 }
    if (this.marker.visible && this.bones.RightHand) { this.bones.RightHand.getWorldPosition(this.marker.position); this.marker.position.addScaledVector(F, .06) }
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model) }
}
