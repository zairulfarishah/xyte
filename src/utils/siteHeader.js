// Cover image for a site that has no photo yet: a dusk sky and a building silhouette,
// tinted a little by site type. No text, so it never competes with the card's own labels.
const HEADER_THEMES = {
  site_scanning: { top: '#142131', mid: '#2c4568', glow: '#f0a35e' },
  site_visit:    { top: '#142131', mid: '#2b5359', glow: '#e9b872' },
  meeting:       { top: '#142131', mid: '#3d3a63', glow: '#d99a7a' },
}

function encodeSvg(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// Same skyline for every site; widths and heights are fixed so it never changes between renders
const TOWERS = [
  [0, 70, 300], [74, 46, 250], [124, 62, 330], [190, 38, 280], [232, 80, 360], [316, 50, 300], [370, 66, 390],
  [440, 44, 320], [488, 90, 350], [582, 52, 300], [638, 70, 410], [712, 40, 330], [756, 84, 370], [844, 56, 310],
  [904, 74, 380], [982, 48, 300], [1034, 88, 350], [1126, 74, 320],
]

export function getSiteHeaderImage(siteType) {
  const t = HEADER_THEMES[siteType] || HEADER_THEMES.site_scanning
  const towers = TOWERS.map(([x, w, h]) => `<rect x="${x}" y="${480 - h + 200}" width="${w}" height="${h}" />`).join('')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 480" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${t.top}" /><stop offset=".62" stop-color="${t.mid}" /><stop offset="1" stop-color="${t.glow}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="480" fill="url(#sky)" />
      <g fill="#ffffff" opacity=".07">${towers}</g>
      <g fill="#0e1826" opacity=".85" transform="translate(40 60)">${towers}</g>
      <path d="M980 120V420M930 120H1110M980 120l26-22" stroke="#0e1826" stroke-width="8" fill="none" opacity=".85" />
    </svg>
  `
  return encodeSvg(svg)
}
