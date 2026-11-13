// Reinforcement (bars) for slabs, beams, columns and footings.
//
// An element either has its own bars (it.rebar) or follows a design type that many
// elements share (plan.designs = [{ id, type, mark: 'B1', rebar }], it.design = type id),
// the way a structural drawing marks every beam B1, B2…
//
// rebar fields (all mm):
//   beam    { tn, tdia (top bars), n, dia (bottom bars), lt, ln, lsp, legs (links), cover }
//   column  { n, dia (main bars), lt, ln, lsp (links), cover }
//   slab    { dia, sp (bottom, short span), dia2, sp2 (bottom, long span), tdia, tsp (top), cover }
//   footing { dia, sp (bottom, across X), dia2, sp2 (bottom, along Y), cover }
// lt = link bar type: 'R' mild steel (250) or 'T' high yield (default).
import { uid } from './geometry'

export const DESIGN_KINDS = {
  beam: { prefix: 'B', label: 'Beam', plural: 'beams' },
  column: { prefix: 'C', label: 'Column', plural: 'columns' },
  slab: { prefix: 'S', label: 'Slab', plural: 'slabs' },
  footing: { prefix: 'F', label: 'Footing', plural: 'footings' },
}
export const COVER = { beam: 30, column: 30, slab: 25, footing: 75 }
export const BAR_SIZES = [6, 8, 10, 12, 16, 20, 25, 32, 40]

export const designsOf = (plan, type) => (plan.designs || []).filter(d => d.type === type)
export const designOf = (it, plan) => (it?.design && (plan.designs || []).find(d => d.id === it.design)) || null
export const rebarOf = (it, plan) => designOf(it, plan)?.rebar || it.rebar || {}
// the element with its effective bars, for the capacity checks
export const withRebar = (it, plan) => (it.design ? { ...it, rebar: rebarOf(it, plan) } : it)
export const markOf = (it, plan) => designOf(it, plan)?.mark || ''

export function nextMark(plan, type) {
  const pre = DESIGN_KINDS[type].prefix
  const used = new Set((plan.designs || []).map(d => d.mark))
  let n = designsOf(plan, type).length + 1
  while (used.has(`${pre}${n}`)) n++
  return `${pre}${n}`
}

export const newDesign = (plan, type, rebar = {}) => ({ id: uid(), type, mark: nextMark(plan, type), rebar: { ...rebar } })

// How many elements on every level follow a design type.
export const designUse = (plan, id) => plan.levels.reduce((s, l) => s + l.items.filter(i => i.design === id).length, 0)

// Deleting a type keeps its bars on the elements that used it.
export function removeDesign(plan, id) {
  const d = (plan.designs || []).find(x => x.id === id)
  return {
    ...plan,
    designs: (plan.designs || []).filter(x => x.id !== id),
    levels: plan.levels.map(l => ({ ...l, items: l.items.map(i => (i.design === id ? { ...i, design: undefined, rebar: { ...(d?.rebar || {}) } } : i)) })),
  }
}

export const setDesign = (plan, id, fn) => ({ ...plan, designs: (plan.designs || []).map(d => (d.id === id ? fn(d) : d)) })

// "3T20", "T10@200", "R10@200 (2 legs)"
const T = d => `T${d}`
const bars = (n, d) => (n > 0 && d > 0 ? `${n}${T(d)}` : '')
const mesh = (d, s) => (d > 0 && s > 0 ? `${T(d)}@${s}` : '')
const links = r => (r.ln > 0 && r.lsp > 0 ? `${r.lt === 'R' ? 'R' : 'T'}${r.ln}@${r.lsp}${r.legs > 2 ? ` (${r.legs} legs)` : ''}` : '')

// Bars as one line of text, the way they are written on a drawing.
export function barText(type, r = {}) {
  const parts = []
  const add = (label, s) => { if (s) parts.push(label ? `${label} ${s}` : s) }
  if (type === 'beam') { add('Top', bars(r.tn, r.tdia)); add('Bot', bars(r.n, r.dia)); add('Links', links(r)) }
  else if (type === 'column') { add('', bars(r.n, r.dia)); add('Links', links(r)) }
  else if (type === 'slab') { add('B1', mesh(r.dia, r.sp)); add('B2', mesh(r.dia2, r.sp2)); add('T', mesh(r.tdia, r.tsp)) }
  else if (type === 'footing') { add('X', mesh(r.dia, r.sp)); add('Y', mesh(r.dia2, r.sp2)) }
  return parts.join(' · ')
}

// The separate pieces, for the schedule columns.
export function barCells(type, r = {}) {
  if (type === 'beam') return { top: bars(r.tn, r.tdia), bottom: bars(r.n, r.dia), links: links(r) }
  if (type === 'column') return { main: bars(r.n, r.dia), links: links(r) }
  if (type === 'slab') return { bottom1: mesh(r.dia, r.sp), bottom2: mesh(r.dia2, r.sp2), top: mesh(r.tdia, r.tsp) }
  return { x: mesh(r.dia, r.sp), y: mesh(r.dia2, r.sp2) }
}
