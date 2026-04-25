const HEADER_THEMES = {
  site_scanning: {
    start: '#1e3a8a',
    end: '#2563eb',
    accent: '#93c5fd',
    label: 'SITE SCANNING',
  },
  site_visit: {
    start: '#064e3b',
    end: '#059669',
    accent: '#6ee7b7',
    label: 'SITE VISIT',
  },
  meeting: {
    start: '#3b0764',
    end: '#7c3aed',
    accent: '#c4b5fd',
    label: 'MEETING',
  },
}

function encodeSvg(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function getSiteHeaderImage(siteType) {
  const theme = HEADER_THEMES[siteType] || HEADER_THEMES.site_scanning
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 480" preserveAspectRatio="none">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${theme.start}" />
          <stop offset="100%" stop-color="${theme.end}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="480" fill="url(#bg)" />
      <circle cx="930" cy="110" r="170" fill="rgba(255,255,255,0.08)" />
      <circle cx="1080" cy="340" r="200" fill="rgba(255,255,255,0.06)" />
      <path d="M0 365 C160 325 290 285 470 306 C660 328 760 424 980 404 C1080 396 1140 362 1200 332 L1200 480 L0 480 Z" fill="rgba(255,255,255,0.12)" />
      <path d="M0 400 C175 350 315 340 500 360 C690 380 810 446 1005 430 C1080 424 1140 406 1200 388 L1200 480 L0 480 Z" fill="rgba(255,255,255,0.18)" />
      <rect x="60" y="64" rx="28" ry="28" width="228" height="54" fill="rgba(15,23,42,0.16)" stroke="rgba(255,255,255,0.2)" />
      <text x="90" y="99" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="${theme.accent}">${theme.label}</text>
      <text x="60" y="175" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="rgba(255,255,255,0.92)">Xyte Site Header</text>
      <text x="60" y="220" font-family="Arial, sans-serif" font-size="24" font-weight="500" fill="rgba(255,255,255,0.72)">Default cover shown until a real site photo is uploaded.</text>
    </svg>
  `
  return encodeSvg(svg)
}
