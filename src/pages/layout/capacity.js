// Section capacities of reinforced concrete members, for planning checks only.
// EC = MS EN 1992-1-1 (Eurocode 2), rectangular stress block; BS = BS 8110-1.
// Units in: mm, N/mm² (MPa). Out: kN·m, kN.

const bar = d => Math.PI * d * d / 4

// Bending resistance of a singly reinforced rectangular section.
export function sectionMRd(b, d, As, m) {
  if (!(b > 0 && d > 0 && As > 0)) return null
  let x, z
  if (m.code === 'BS') {
    x = (0.87 * m.fy * As) / (0.405 * m.fcu * b)          // 0.45 fcu × 0.9x block
    z = Math.min(0.95 * d, d - 0.45 * x)
  } else {
    x = (0.87 * m.fy * As) / (0.4536 * m.fck * b)         // 0.567 fck × 0.8x block
    z = Math.min(0.95 * d, d - 0.4 * x)
  }
  const limit = m.code === 'BS' ? 0.5 : 0.45
  return { M: 0.87 * m.fy * As * Math.max(z, 0) / 1e6, x, z, d, As, overReinforced: x > limit * d }
}

// Slab: bottom bars (dia @ spacing) per metre width.
export function slabMRd(h, r, m) {
  const cover = r?.cover ?? 25, dia = r?.dia, sp = r?.sp
  if (!(dia > 0 && sp > 0)) return null
  const d = h - cover - dia / 2
  return sectionMRd(1000, d, bar(dia) * 1000 / sp, m)
}

// Strength of the link steel: R = mild steel (250), T = high yield.
const fyw = (r, m) => (r.lt === 'R' ? 250 : m.fyLink)

// Beam: n bottom bars, links (dia, spacing, legs). Flange ignored (conservative).
// Top bars give the hogging capacity (over supports, for continuous beams).
export function beamCapacity(bm, m) {
  const r = bm.rebar || {}
  if (!(r.n > 0 && r.dia > 0)) return null
  const cover = r.cover ?? 30, link = r.ln ?? 10
  const b = bm.width, d = bm.depth - cover - link - r.dia / 2
  const As = r.n * bar(r.dia)
  const flex = sectionMRd(b, d, As, m)
  if (!flex) return null
  // shear
  let V
  const Asw = (r.legs ?? 2) * bar(link), s = r.lsp
  if (m.code === 'BS') {
    const vc = 0.79 * Math.min(3, (100 * As) / (b * d)) ** (1 / 3) * Math.max(1, 400 / d) ** 0.25 / 1.25 * (Math.min(m.fcu, 40) / 25) ** (1 / 3)
    const vmax = Math.min(0.8 * Math.sqrt(m.fcu), 5)
    V = Math.min(vc * b * d + (s > 0 ? Asw * 0.87 * fyw(r, m) * d / s : 0), vmax * b * d) / 1000
  } else {
    const k = Math.min(2, 1 + Math.sqrt(200 / d)), rho = Math.min(0.02, As / (b * d))
    const vRdc = Math.max(0.12 * k * (100 * rho * m.fck) ** (1 / 3), 0.035 * k ** 1.5 * Math.sqrt(m.fck)) * b * d
    if (s > 0) {
      const cot = 2.5, z = 0.9 * d
      const vRds = (Asw / s) * z * 0.87 * fyw(r, m) * cot
      const vRdmax = b * z * 0.6 * (1 - m.fck / 250) * 0.567 * m.fck / (cot + 1 / cot)
      V = Math.min(vRds, vRdmax) / 1000
    } else V = vRdc / 1000
  }
  // hogging: top bars in tension
  let Mtop = null
  if (r.tn > 0 && r.tdia > 0) Mtop = sectionMRd(b, bm.depth - cover - link - r.tdia / 2, r.tn * bar(r.tdia), m)?.M ?? null
  return { M: flex.M, V, Mtop, d, As, overReinforced: flex.overReinforced }
}

// Column: short, braced, axially loaded with nominal eccentricity.
export function columnNRd(c, m) {
  const r = c.rebar || {}
  if (!(r.n > 0 && r.dia > 0)) return null
  const Ac = c.shape === 'round' ? Math.PI * c.w * c.w / 4 : c.w * c.d
  const As = r.n * bar(r.dia)
  const N = m.code === 'BS'
    ? 0.4 * m.fcu * (Ac - As) + 0.75 * m.fy * As
    : 0.567 * m.fck * (Ac - As) + 0.87 * m.fy * As
  const h = c.shape === 'round' ? c.w : Math.min(c.w, c.d)
  return { N: N / 1000, As, slender: c.height / h > 15 }
}

// Footing: bottom bars each way, as a slab of the footing's thickness.
// X bars are the outer layer; Y bars sit on them, so their depth is one bar less.
export function footingMRd(f, m) {
  const r = f.rebar || {}, cover = r.cover ?? 75
  const x = slabMRd(f.h, { dia: r.dia, sp: r.sp, cover }, m)
  const y = slabMRd(f.h - (r.dia || 0), { dia: r.dia2 ?? r.dia, sp: r.sp2 ?? r.sp, cover }, m)
  return x || y ? { Mx: x?.M ?? null, My: y?.M ?? null } : null
}
