import * as THREE from 'three'
import { C, mats } from './kit'

// Clickable objects: each hotspot is a group of meshes that glow green on hover
// and opens a panel when clicked.

const GREEN = new THREE.Color(C.green)
const baseOf = o => mats(o).map(m => [m.emissive ? m.emissive.clone() : null, m.emissiveIntensity ?? 1])

export function createHotspots() {
  const hotspots = {}
  const pickables = []

  function makeHotspot(key, group, def) {
    group.userData.key = key
    group.traverse(o => {
      if (!o.isMesh) return
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone()
      o.userData.base = baseOf(o)
      o.userData.hot = key
      pickables.push(o)
    })
    hotspots[key] = { key, group, ...def }
    return hotspots[key]
  }

  // Extra meshes (a walking person) that belong to an existing hotspot
  // (materials are cloned so the glow only lights this person, not everyone sharing a material)
  function attach(key, obj) {
    obj.traverse(o => {
      if (!o.isMesh) return
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone()
      o.userData.hot = key; o.userData.base = baseOf(o); pickables.push(o)
    })
    const h = hotspots[key]; if (h) h.extra = [...(h.extra || []), obj]
  }

  function drop(mesh) {
    const i = pickables.indexOf(mesh); if (i > -1) pickables.splice(i, 1)
  }

  function setGlow(key, on) {
    const h = hotspots[key]; if (!h) return
    const glowIn = o => {
      if (!o.isMesh || o.userData.noGlow || !o.userData.base) return
      mats(o).forEach((m, i) => {
        if (!m.emissive) return
        if (on) { m.emissive.copy(GREEN); m.emissiveIntensity = 0.16 }
        else { m.emissive.copy(o.userData.base[i][0]); m.emissiveIntensity = o.userData.base[i][1] }
      })
    }
    h.group.traverse(glowIn)
    if (h.extra) h.extra.forEach(x => x.traverse(glowIn))
  }

  return { hotspots, pickables, makeHotspot, attach, drop, setGlow }
}
