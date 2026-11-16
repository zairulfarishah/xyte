// Drawn scenes for the dashboard banner and the sidebar card (no photos needed).

// Seeded random so the skyline is the same on every render
function seeded(seed) {
  let s = seed
  return () => (s = (s * 9301 + 49297) % 233280) / 233280
}

const CITY = (() => {
  const rnd = seeded(7)
  const far = [], near = [], lights = []
  for (let x = 60; x < 800;) {
    const w = 14 + rnd() * 22, h = 30 + rnd() * 50
    far.push({ x, y: 150 - h, w, h: h + 10 })
    x += w + 2
  }
  for (let x = 90; x < 800;) {
    const w = 16 + rnd() * 30, tall = rnd() > 0.8, h = tall ? 95 + rnd() * 45 : 45 + rnd() * 55, y = 160 - h
    near.push({ x, y, w, h, tall })
    for (let wy = y + 6; wy < 155; wy += 7) {
      for (let wx = x + 3; wx < x + w - 3; wx += 5) if (rnd() > 0.55) lights.push({ x: wx, y: wy, o: 0.5 + rnd() * 0.5 })
    }
    x += w + 3 + rnd() * 6
  }
  return { far, near, lights }
})()

// City skyline at sunset with an orange slash on the left edge
export function Skyline({ className }) {
  return (
    <svg className={className} viewBox="0 0 800 160" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sa-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b6f94" /><stop offset=".45" stopColor="#d79a6b" /><stop offset=".75" stopColor="#f6b86a" /><stop offset="1" stopColor="#fbd29a" />
        </linearGradient>
        <radialGradient id="sa-sun" cx=".62" cy=".78" r=".35">
          <stop offset="0" stopColor="#fff3c9" /><stop offset="1" stopColor="#fff3c9" stopOpacity="0" />
        </radialGradient>
        <clipPath id="sa-diag"><path d="M150 0H800V160H70Z" /></clipPath>
      </defs>
      <g clipPath="url(#sa-diag)">
        <rect width="800" height="160" fill="url(#sa-sky)" />
        <rect width="800" height="160" fill="url(#sa-sun)" />
        {CITY.far.map((b, i) => <rect key={`f${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#8a7d8c" opacity=".55" />)}
        {CITY.near.map((b, i) => (
          <g key={`n${i}`} fill="#1d2638">
            <rect x={b.x} y={b.y} width={b.w} height={b.h} />
            {b.tall && <path d={`M${b.x + b.w / 2 - 3} ${b.y}L${b.x + b.w / 2} ${b.y - 18}L${b.x + b.w / 2 + 3} ${b.y}Z`} />}
          </g>
        ))}
        {CITY.lights.map((l, i) => <rect key={`l${i}`} x={l.x} y={l.y} width="2" height="3" fill="#f7c77a" opacity={l.o} />)}
        <path d="M735 160V30M690 30H795M735 30L760 14M700 30v30" fill="none" stroke="#1d2638" strokeWidth="3" />
        <rect x="785" y="30" width="12" height="10" fill="#1d2638" />
      </g>
      <path d="M150 0H186L106 160H70Z" fill="#f07c1e" />
    </svg>
  )
}

// Building under construction with two tower cranes, for the sidebar card
export function CraneScene({ className, sky = ["#3a4f78", "#c98a5c", "#f2b26b"] }) {
  return (
    <svg className={className} viewBox="0 0 208 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sa-psky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} /><stop offset=".55" stopColor={sky[1]} /><stop offset="1" stopColor={sky[2]} />
        </linearGradient>
        <linearGradient id="sa-pfade" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".45" stopColor="#0b1220" stopOpacity="0" /><stop offset="1" stopColor="#0b1220" stopOpacity=".85" />
        </linearGradient>
      </defs>
      <rect width="208" height="200" fill="url(#sa-psky)" />
      <g fill="#1d2433">
        <rect x="40" y="96" width="90" height="80" />
        <g fill="#2c3445"><rect x="46" y="104" width="78" height="2" /><rect x="46" y="120" width="78" height="2" /><rect x="46" y="136" width="78" height="2" /><rect x="46" y="152" width="78" height="2" /></g>
        <rect x="0" y="168" width="208" height="32" />
        <rect x="146" y="40" width="5" height="130" /><rect x="88" y="38" width="112" height="4" /><path d="M146 38 L148 22 L152 38z" /><rect x="96" y="42" width="1.5" height="34" /><rect x="190" y="42" width="10" height="10" />
        <rect x="22" y="62" width="4" height="108" /><rect x="2" y="60" width="70" height="3" /><rect x="58" y="63" width="1.2" height="28" />
      </g>
      <rect width="208" height="200" fill="url(#sa-pfade)" />
    </svg>
  )
}
