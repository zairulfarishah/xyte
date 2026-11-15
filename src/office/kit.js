import * as THREE from 'three'

// Small helpers shared by every part of the office scene, plus a list of everything
// that needs disposing when the page closes.

export const C = {
  wall: '#eceae6', walnut: '#5b3c28', walnutLight: '#7a5337', oak: '#a27a52',
  brass: '#b8924a', ink: '#2a2420', paper: '#efe6d2', green: '#4fd36f', amber: '#e8a43c', concrete: '#cfc7b8',
}
export const FONT = 'Poppins, "Segoe UI", system-ui, sans-serif'

// Seeded random, so the room looks the same every time
export function seeded(start) {
  let seed = start
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export const mats = o => Array.isArray(o.material) ? o.material : [o.material]

export function createKit() {
  const textures = new Set()
  const extraMaterials = new Set()
  const rnd = seeded(7)
  const pick = a => a[Math.floor(rnd() * a.length)]

  function tex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const g = c.getContext('2d'); draw(g, w, h)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]) }
    textures.add(t)
    return t
  }
  // A canvas texture you redraw yourself (TV, clock)
  function liveTex(w, h) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
    textures.add(t)
    return { canvas, texture: t }
  }
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o })
  function box(parent, w, h, d, mat, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    m.castShadow = opts.cast !== false; m.receiveShadow = true
    parent.add(m); return m
  }
  function cyl(parent, rt, rb, h, mat, x, y, z, seg = 24) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true
    parent.add(m); return m
  }
  const keep = m => { extraMaterials.add(m); return m }

  return { rnd, pick, tex, liveTex, M, box, cyl, keep, textures, extraMaterials }
}

// Free every geometry, material and texture under root, plus the kit's own lists
export function disposeAll(root, kit) {
  const geos = new Set(), materials = new Set(kit.extraMaterials)
  root.traverse(o => {
    if (o.geometry) geos.add(o.geometry)
    if (o.material) mats(o).forEach(m => materials.add(m))
  })
  geos.forEach(g => g.dispose())
  materials.forEach(m => {
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k]) kit.textures.add(m[k])
    m.dispose()
  })
  kit.textures.forEach(t => t.dispose())
}
