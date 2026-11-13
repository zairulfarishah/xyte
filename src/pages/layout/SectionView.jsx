import { useMemo, useRef } from 'react'
import { Download } from 'lucide-react'
import { Modal } from './Dialogs'
import { computeSection } from './sections'

// A cross-section through the whole building, drawn to scale.
const FILL = {
  slab: { fill: '#cbd5e1', stroke: '#334155' },
  beam: { fill: '#fed7aa', stroke: '#9a3412' },
  column: { fill: '#94a3b8', stroke: '#1e293b' },
  rcwall: { fill: '#64748b', stroke: '#0f172a' },
  wall: { fill: '#f1f5f9', stroke: '#64748b' },
}
const ORDER = ['wall', 'rcwall', 'column', 'slab', 'beam']

export default function SectionView({ plan, sec, onClose }) {
  const svgRef = useRef(null)
  const data = useMemo(() => computeSection(plan, sec), [plan, sec])
  const { L, parts, grids, levels } = data

  const zs = [...parts.flatMap(p => [p.z0, p.z1]), ...levels.flatMap(l => [l.elevation, l.top])]
  const zMin = Math.min(...zs) - 600, zMax = Math.max(...zs) + 600
  const W = 900, padL = 120, padR = 90, padT = 20, padB = 70
  const k = Math.min((W - padL - padR) / Math.max(L, 1000), 480 / Math.max(zMax - zMin, 1000))
  const H = (zMax - zMin) * k + padT + padB
  const X = s => padL + s * k, Y = z => padT + (zMax - z) * k
  const width = padL + L * k + padR

  function download() {
    const svg = svgRef.current.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    a.download = `${plan.name || 'Layout'} - Section ${sec.name}.svg`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const sorted = [...parts].sort((p, q) => ORDER.indexOf(p.kind) - ORDER.indexOf(q.kind) || (p.seen ? -1 : 0))
  return (
    <Modal title={`Section ${sec.name}–${sec.name}`} onClose={onClose} wide>
      <div style={{ overflow: 'auto', maxHeight: '70vh', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff' }}>
        <svg ref={svgRef} width={width} height={H} viewBox={`0 0 ${width} ${H}`} style={{ display: 'block', fontFamily: 'system-ui, sans-serif' }}>
          <rect width={width} height={H} fill="#fff" />
          {/* gridlines */}
          {grids.map((g, n) => (
            <g key={`g${n}`}>
              <line x1={X(g.s)} y1={padT} x2={X(g.s)} y2={H - padB + 18} stroke="#dc2626" strokeWidth={0.8} strokeDasharray="10 3 2 3" />
              <circle cx={X(g.s)} cy={H - padB + 32} r={12} fill="#fff" stroke="#dc2626" />
              <text x={X(g.s)} y={H - padB + 32} fontSize={g.label.length > 2 ? 8.5 : 11} fontWeight="700" fill="#dc2626" textAnchor="middle" dominantBaseline="central">{g.label}</text>
            </g>
          ))}
          {/* level lines */}
          {levels.map((l, n) => (
            <g key={`l${n}`}>
              <line x1={padL - 100} y1={Y(l.elevation)} x2={X(L) + 20} y2={Y(l.elevation)} stroke="#0f172a" strokeWidth={0.6} strokeDasharray="4 3" />
              <text x={8} y={Y(l.elevation) - 4} fontSize={11} fontWeight="700" fill="#0f172a">{l.name}</text>
              <text x={8} y={Y(l.elevation) + 10} fontSize={10} fill="#475569">FFL {l.elevation >= 0 ? '+' : ''}{l.elevation}</text>
            </g>
          ))}
          {/* floor-to-floor heights on the right */}
          {levels.map((l, n) => {
            const x = X(L) + 45
            return (
              <g key={`h${n}`}>
                <line x1={x} y1={Y(l.elevation)} x2={x} y2={Y(l.top)} stroke="#b45309" strokeWidth={0.8} />
                <line x1={x - 4} y1={Y(l.elevation) + 4} x2={x + 4} y2={Y(l.elevation) - 4} stroke="#b45309" />
                <line x1={x - 4} y1={Y(l.top) + 4} x2={x + 4} y2={Y(l.top) - 4} stroke="#b45309" />
                <text x={x + 6} y={(Y(l.elevation) + Y(l.top)) / 2} fontSize={10} fill="#b45309" dominantBaseline="central">{l.top - l.elevation}</text>
              </g>
            )
          })}
          {/* structure */}
          {sorted.map((p, n) => {
            const f = FILL[p.kind]
            return (
              <rect key={`p${n}`} x={X(p.s0)} y={Y(p.z1)} width={Math.max(0.5, (p.s1 - p.s0) * k)} height={Math.max(0.5, (p.z1 - p.z0) * k)}
                fill={p.seen ? 'none' : f.fill} stroke={f.stroke} strokeWidth={p.cut ? 1.4 : 0.9} strokeDasharray={p.seen ? '5 3' : undefined} />
            )
          })}
          {/* beam sizes under cut beams */}
          {parts.filter(p => p.kind === 'beam' && p.cut).map((p, n) => (
            <text key={`t${n}`} x={X((p.s0 + p.s1) / 2)} y={Y(p.z0) + 11} fontSize={9.5} fill="#9a3412" textAnchor="middle">{p.label}</text>
          ))}
          <text x={padL} y={H - 10} fontSize={11} fill="#475569">Section {sec.name}–{sec.name} · {plan.name} · dimensions in mm · length {Math.round(L)}</text>
        </svg>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: '#64748b', marginRight: 'auto' }}>
          Shaded = cut · dashed = beam seen beyond · orange = beams · darker grey = RC walls. Beam tops sit at the next floor level.
        </span>
        <button onClick={download} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, borderRadius: '7px', border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
          <Download size={14} /> Download (SVG)
        </button>
      </div>
    </Modal>
  )
}
