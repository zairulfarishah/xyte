import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Box, Eye, Layers, Maximize, MoveHorizontal, Square } from 'lucide-react'
import { activeLevel, wallAxes, same, gridNode, dist } from './geometry'

// 3D view of the plan, built from the 2D data every time it changes.
// Plan x → 3D x, plan y → 3D z, heights → 3D y. Units are metres in 3D.
const M = 0.001

function makeMaterials() {
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra })
  return {
    wall: std('#e5e7eb'),
    slab: std('#cbd5e1'),
    column: std('#94a3b8'),
    beam: std('#fdba74'),
    glass: std('#93c5fd', { transparent: true, opacity: 0.35, depthWrite: false }),
    edge: new THREE.LineBasicMaterial({ color: '#334155' }),
    grid: new THREE.LineDashedMaterial({ color: '#dc2626', dashSize: 0.6, gapSize: 0.25 }),
  }
}

export default function View3D({ plan }) {
  const boxRef = useRef(null)
  const ctx = useRef(null)
  const fittedRef = useRef(false)
  const [only, setOnly] = useState(false)       // true = just the level being edited
  const [xray, setXray] = useState(false)       // see-through walls

  // ── one renderer for the life of the view ──────────────────
  useEffect(() => {
    const el = boxRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor('#f1f5f9')
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 5000)
    camera.position.set(30, 25, 30)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.screenSpacePanning = true
    controls.maxPolarAngle = Math.PI * 0.499

    scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 1.6))
    const sun = new THREE.DirectionalLight('#ffffff', 1.4)
    sun.position.set(40, 80, 25)
    scene.add(sun)

    const group = new THREE.Group()
    scene.add(group)
    const helpers = new THREE.Group()
    scene.add(helpers)

    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    })
    ro.observe(el)

    ctx.current = { renderer, scene, camera, controls, group, helpers, render, mats: makeMaterials() }
    return () => {
      ro.disconnect()
      controls.dispose()
      clear(group); clear(helpers)
      Object.values(ctx.current.mats).forEach(m => m.dispose())
      renderer.dispose()
      renderer.domElement.remove()
      ctx.current = null
    }
  }, [])

  // ── rebuild the model when the plan or options change ──────
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    c.mats.wall.transparent = xray
    c.mats.wall.opacity = xray ? 0.25 : 1
    c.mats.wall.depthWrite = !xray
    c.mats.wall.needsUpdate = true
    build(c, plan, only)
    if (!fittedRef.current) { fittedRef.current = true; view(c, 'iso') } else c.render()
  }, [plan, only, xray])

  const go = v => ctx.current && view(ctx.current, v)
  const shot = () => {
    const c = ctx.current
    if (!c) return
    c.render()
    const a = document.createElement('a')
    a.href = c.renderer.domElement.toDataURL('image/png')
    a.download = `${plan.name || 'layout'} 3D.png`
    a.click()
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={boxRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={S.bar}>
        <button style={S.btn} onClick={() => go('iso')} title="3D view"><Box size={14} /> 3D</button>
        <button style={S.btn} onClick={() => go('top')} title="Look down"><Square size={14} /> Top</button>
        <button style={S.btn} onClick={() => go('front')} title="Look from the front (bottom of the plan)"><MoveHorizontal size={14} /> Front</button>
        <button style={S.btn} onClick={() => go('fit')} title="Zoom to fit"><Maximize size={14} /> Fit</button>
        <span style={S.sep} />
        <button style={{ ...S.btn, ...(only ? S.on : null) }} onClick={() => setOnly(v => !v)} title="Show only the level you are editing">
          <Layers size={14} /> {only ? 'This level' : 'All levels'}
        </button>
        <button style={{ ...S.btn, ...(xray ? S.on : null) }} onClick={() => setXray(v => !v)} title="See-through walls">
          <Eye size={14} /> See-through
        </button>
        <button style={S.btn} onClick={shot} title="Download this view as a picture">Save image</button>
      </div>
      <div style={S.hint}>Drag to turn · Right-drag to move · Scroll to zoom</div>
    </div>
  )
}

function clear(group) {
  for (const o of [...group.children]) {
    o.traverse(n => n.geometry?.dispose())
    group.remove(o)
  }
}

function build(c, plan, only) {
  const { group, helpers, mats } = c
  clear(group); clear(helpers)
  const current = activeLevel(plan)
  const levels = only ? [current] : plan.levels

  const addBox = (mat, cx, cy, cz, sx, sy, sz, rotY = 0, edges = true) => {
    if (sx <= 0 || sy <= 0 || sz <= 0) return
    const geo = new THREE.BoxGeometry(sx, sy, sz)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(cx, cy, cz)
    mesh.rotation.y = rotY
    group.add(mesh)
    if (edges) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mats.edge)
      e.position.copy(mesh.position)
      e.rotation.copy(mesh.rotation)
      group.add(e)
    }
  }

  for (const lv of levels) {
    const base = lv.elevation
    const items = lv.items
    const walls = items.filter(i => i.type === 'wall')

    // floor slabs: top of slab at the level's floor
    for (const r of items.filter(i => i.type === 'room' && i.pts.length >= 3)) {
      const shape = new THREE.Shape(r.pts.map(p => new THREE.Vector2(p.x * M, -p.y * M)))
      const t = (r.slab ?? lv.slab) * M
      if (t <= 0) continue
      const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      const mesh = new THREE.Mesh(geo, mats.slab)
      mesh.position.y = base * M - t
      group.add(mesh)
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mats.edge)
      e.position.copy(mesh.position)
      group.add(e)
    }

    // walls, split around doors and windows
    for (const w of walls) {
      const { len, u } = wallAxes(w)
      if (len < 1) continue
      const joined = end => walls.some(o => o.id !== w.id && (same(o.a, end) || same(o.b, end)))
      const extA = joined(w.a) ? w.thickness / 2 : 0, extB = joined(w.b) ? w.thickness / 2 : 0
      const H = w.height
      const rot = -Math.atan2(u.y, u.x)
      const piece = (s0, s1, z0, z1, mat = mats.wall, thick = w.thickness, edges = true) => {
        if (s1 - s0 < 1 || z1 - z0 < 1) return
        const mid = (s0 + s1) / 2
        addBox(mat, (w.a.x + u.x * mid) * M, (base + (z0 + z1) / 2) * M, (w.a.y + u.y * mid) * M,
          (s1 - s0) * M, (z1 - z0) * M, thick * M, rot, edges)
      }
      const ops = items.filter(o => o.type === 'opening' && o.wallId === w.id).sort((a, b) => a.offset - b.offset)
      let cur = -extA
      for (const o of ops) {
        const s0 = o.offset - o.width / 2, s1 = o.offset + o.width / 2
        const sill = Math.max(0, Math.min(o.sill || 0, H)), top = Math.min(H, sill + o.height)
        if (s0 > cur) piece(cur, s0, 0, H)
        piece(Math.max(s0, cur), s1, 0, sill)
        piece(Math.max(s0, cur), s1, top, H)
        if (o.kind === 'window') piece(s0, s1, sill, top, mats.glass, 20, false)
        cur = Math.max(cur, s1)
      }
      piece(cur, len + extB, 0, H)
    }

    // columns stand on the floor
    for (const col of items.filter(i => i.type === 'column')) {
      const h = col.height * M
      if (col.shape === 'round') {
        const geo = new THREE.CylinderGeometry(col.w / 2 * M, col.w / 2 * M, h, 32)
        const mesh = new THREE.Mesh(geo, mats.column)
        mesh.position.set(col.x * M, base * M + h / 2, col.y * M)
        group.add(mesh)
      } else {
        addBox(mats.column, col.x * M, base * M + h / 2, col.y * M, col.w * M, h, col.d * M)
      }
    }

    // beams hang under the slab above (top of beam at floor + wall height)
    for (const b of items.filter(i => i.type === 'beam')) {
      const len = dist(b.a, b.b)
      if (len < 1) continue
      const top = base + lv.wallHeight
      addBox(mats.beam, (b.a.x + b.b.x) / 2 * M, (top - b.depth / 2) * M, (b.a.y + b.b.y) / 2 * M,
        len * M, b.depth * M, b.width * M, -Math.atan2(b.b.y - b.a.y, b.b.x - b.a.x))
    }

    // gridlines on the floor
    for (const g of items.filter(i => i.type === 'grid')) {
      const p0 = gridNode(g, 0, 0), p1 = gridNode(g, g.xs.length, g.ys.length)
      const over = 1500, y = base * M + 0.01
      const pts = []
      for (let i = 0; i <= g.xs.length; i++) {
        const x = gridNode(g, i, 0).x
        pts.push(new THREE.Vector3(x * M, y, (p0.y - over) * M), new THREE.Vector3(x * M, y, (p1.y + over) * M))
      }
      for (let j = 0; j <= g.ys.length; j++) {
        const z = gridNode(g, 0, j).y
        pts.push(new THREE.Vector3((p0.x - over) * M, y, z * M), new THREE.Vector3((p1.x + over) * M, y, z * M))
      }
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mats.grid)
      line.computeLineDistances()
      helpers.add(line)
    }
  }

  // ground grid under the lowest level, 1 m squares
  const box = new THREE.Box3().setFromObject(group)
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3())
    const n = Math.ceil(Math.max(size.x, size.z) + 10)
    const gh = new THREE.GridHelper(n, n, '#cbd5e1', '#e2e8f0')
    gh.position.set(Math.round(mid.x), box.min.y - 0.002, Math.round(mid.z))
    helpers.add(gh)
  }
}

function view(c, kind) {
  const { camera, controls, group, render } = c
  const box = new THREE.Box3().setFromObject(group)
  if (box.isEmpty()) box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 3, 10))
  const centre = box.getCenter(new THREE.Vector3())
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 10
  const d = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.05
  const dirs = { iso: [1, 0.8, 1.15], top: [0, 1, 0.0001], front: [0, 0.25, 1] }
  const dir = kind === 'fit'
    ? camera.position.clone().sub(controls.target).normalize()
    : new THREE.Vector3(...dirs[kind]).normalize()
  controls.target.copy(centre)
  camera.position.copy(centre).addScaledVector(dir, d)
  camera.near = Math.max(0.01, d / 1000)
  camera.far = d * 20
  camera.updateProjectionMatrix()
  controls.update()
  render()
}

const S = {
  bar: { position: 'absolute', top: '10px', left: '10px', right: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap', pointerEvents: 'none' },
  btn: { pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '12.5px', fontWeight: 600, borderRadius: '7px',
    border: '1px solid #cbd5e1', background: 'rgba(255,255,255,.95)', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' },
  on: { background: '#eff6ff', border: '1px solid #2563eb', color: '#1d4ed8' },
  sep: { width: '1px', background: '#cbd5e1', margin: '2px 2px' },
  hint: { position: 'absolute', left: '10px', bottom: '10px', padding: '6px 10px', fontSize: '12.5px', color: '#334155',
    background: 'rgba(255,255,255,.92)', border: '1px solid #e2e8f0', borderRadius: '8px', pointerEvents: 'none' },
}
