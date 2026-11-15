import * as THREE from 'three'

// Office walk grid: 0.2 m cells built from furniture bounding boxes with 0.3 m clearance,
// A* (binary heap, no corner cutting) and line-of-sight smoothing. Ported unchanged.

export function createNav({ blockObjects, rects }) {
  const NAV = { cell: .2, x0: -5.92, z0: -4.92, nx: 0, nz: 0, grid: null, built: false }
  NAV.nx = Math.ceil(11.84 / NAV.cell); NAV.nz = Math.ceil(9.84 / NAV.cell)

  function build() {
    const R = .3, g = new Uint8Array(NAV.nx * NAV.nz)
    const blockRect = (x1, z1, x2, z2) => {
      const i1 = Math.max(0, Math.floor((x1 - R - NAV.x0) / NAV.cell)), i2 = Math.min(NAV.nx - 1, Math.floor((x2 + R - NAV.x0) / NAV.cell))
      const j1 = Math.max(0, Math.floor((z1 - R - NAV.z0) / NAV.cell)), j2 = Math.min(NAV.nz - 1, Math.floor((z2 + R - NAV.z0) / NAV.cell))
      for (let i = i1; i <= i2; i++) for (let j = j1; j <= j2; j++) g[j * NAV.nx + i] = 1
    }
    blockObjects.forEach(o => { const b = new THREE.Box3().setFromObject(o); blockRect(b.min.x, b.min.z, b.max.x, b.max.z) })
    rects.forEach(r => blockRect(...r))
    for (let i = 0; i < NAV.nx; i++) for (let j = 0; j < NAV.nz; j++) {   // walls + floor edges
      const x = NAV.x0 + (i + .5) * NAV.cell, z = NAV.z0 + (j + .5) * NAV.cell
      if (x < -5.94 + R || x > 5.94 - R || z < -4.94 + R || z > 4.94 - R) g[j * NAV.nx + i] = 1
    }
    NAV.grid = g; NAV.built = true
  }

  const cellOf = (x, z) => [Math.floor((x - NAV.x0) / NAV.cell), Math.floor((z - NAV.z0) / NAV.cell)]
  const free = (i, j) => {
    if (!NAV.built) build()
    return i >= 0 && j >= 0 && i < NAV.nx && j < NAV.nz && !NAV.grid[j * NAV.nx + i]
  }
  const freeAt = (x, z) => free(...cellOf(x, z))
  const centerOfCell = (i, j) => new THREE.Vector3(NAV.x0 + (i + .5) * NAV.cell, 0, NAV.z0 + (j + .5) * NAV.cell)

  function nearestFree(i, j) {
    if (free(i, j)) return [i, j]
    for (let r = 1; r < 12; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++)
      if (Math.max(Math.abs(di), Math.abs(dj)) === r && free(i + di, j + dj)) return [i + di, j + dj]
    return [i, j]
  }
  function lineFree(a, b) {
    const d = a.distanceTo(b), n = Math.ceil(d / .08)
    for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n; if (!freeAt(x, z)) return false }
    return true
  }
  function findPath(from, to) {
    if (!NAV.built) build()
    const [si, sj] = nearestFree(...cellOf(from.x, from.z)), [ti, tj] = nearestFree(...cellOf(to.x, to.z))
    const N = NAV.nx * NAV.nz, gS = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N)
    const open = []
    const key = (i, j) => j * NAV.nx + i
    const hf = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + .414 * Math.min(dx, dz) }
    const push = (f, k) => { open.push([f, k]); let c = open.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break; [open[p], open[c]] = [open[c], open[p]]; c = p } }
    const pop = () => {
      const top = open[0], last = open.pop()
      if (open.length) {
        open[0] = last; let c = 0
        for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === c) break; [open[m], open[c]] = [open[c], open[m]]; c = m }
      }
      return top
    }
    gS[key(si, sj)] = 0; push(hf(si, sj), key(si, sj))
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]
    let found = false
    while (open.length) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1
      const i = k % NAV.nx, j = (k / NAV.nx) | 0
      if (i === ti && j === tj) { found = true; break }
      for (const [di, dj, c] of dirs) {
        const ni = i + di, nj = j + dj; if (!free(ni, nj)) continue
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue      // no corner cutting
        const nk = key(ni, nj), ng = gS[k] + c
        if (ng < gS[nk]) { gS[nk] = ng; came[nk] = k; push(ng + hf(ni, nj), nk) }
      }
    }
    if (!found) return null
    const cells = []; for (let k = key(ti, tj); k !== -1; k = came[k]) cells.push(centerOfCell(k % NAV.nx, (k / NAV.nx) | 0)); cells.reverse()
    // string-pull: keep only the points needed for clear straight lines
    const pts = [from.clone(), ...cells.slice(1, -1), to.clone()], out = [pts[0]]
    let a = 0
    while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !lineFree(pts[a], pts[b])) b--; out.push(pts[b]); a = b }
    return out
  }

  return { NAV, build, findPath, freeAt, lineFree }
}
