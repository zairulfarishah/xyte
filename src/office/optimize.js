import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Draw-call reduction. The office is built from ~2,000 small boxes and spheres; drawn one by one
// (plus again for each shadow) that is too much for an ordinary laptop. This merges sibling meshes
// that share the same look into one mesh. Siblings move together (they share a parent), so people,
// chairs, the games book and the city programs still animate. Meshes that change on their own
// (screens, the window, scan rings) are marked userData.noMerge. Run once, before the first frame.

const sig = m => [m.type, m.color?.getHexString(), m.roughness, m.metalness, m.map?.uuid, m.transparent, m.opacity,
  m.side, m.emissive?.getHexString(), m.emissiveIntensity, m.toneMapped, m.depthWrite].join('|')
const KEEP = ['position', 'normal', 'uv']
const _s = new THREE.Vector3()

export function optimizeScene(root, pickables) {
  root.updateMatrixWorld(true)
  // tiny parts (eyes, buttons, rebar) don't need to cast shadows
  root.traverse(o => {
    if (!o.isMesh || !o.castShadow) return
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere()
    o.getWorldScale(_s)
    if (g.boundingSphere.radius * Math.max(_s.x, _s.y, _s.z) < .045) o.castShadow = false
  })

  const parents = []
  root.traverse(o => { if (o.children.length > 1) parents.push(o) })
  let removed = 0
  for (const parent of parents) {
    const buckets = new Map()
    for (const m of parent.children) {
      if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || Array.isArray(m.material) || m.children.length || !m.visible) continue
      if (m.userData.noMerge || m.userData.noGlow) continue
      const g = m.geometry
      if (!g.index || !KEEP.every(n => g.attributes[n]) || Object.keys(g.morphAttributes).length) continue
      const k = `${sig(m.material)}|${m.castShadow}|${m.receiveShadow}|${m.userData.hot || ''}`
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k).push(m)
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue
      const geos = list.map(m => {
        m.updateMatrix()
        const g = m.geometry.clone().applyMatrix4(m.matrix)
        Object.keys(g.attributes).forEach(n => { if (!KEEP.includes(n)) g.deleteAttribute(n) })
        g.clearGroups()
        return g
      })
      const merged = mergeGeometries(geos, false)
      geos.forEach(g => g.dispose())
      if (!merged) continue
      const first = list[0]
      const mesh = new THREE.Mesh(merged, first.material)
      mesh.castShadow = list.some(m => m.castShadow); mesh.receiveShadow = first.receiveShadow
      mesh.userData = { ...first.userData }
      list.forEach(m => {
        parent.remove(m)
        const i = pickables.indexOf(m); if (i > -1) pickables.splice(i, 1)
      })
      parent.add(mesh)
      if (first.userData.hot) pickables.push(mesh)
      removed += list.length - 1
    }
  }
  return removed
}
