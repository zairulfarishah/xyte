// Free web photo search for site cover photos — no API keys, all allow the browser to fetch the image.
//  - Wikimedia Commons: photos taken near the pin, and by name
//  - Openverse: Creative Commons photos (Flickr etc.) by name
// Each result: { id, thumb, full, title, credit, source }

const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const IMG_MIME = /^image\/(jpeg|png|webp)$/

function commonsUrl(params) {
  const url = new URL(COMMONS)
  Object.entries({ action: 'query', format: 'json', origin: '*', prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '800', ...params })
    .forEach(([k, v]) => url.searchParams.set(k, v))
  return url
}

const stripHtml = s => String(s || '').replace(/<[^>]*>/g, '').trim()

async function commons(params, source, signal) {
  const res = await fetch(commonsUrl(params), { signal })
  if (!res.ok) throw new Error('Commons failed')
  const pages = Object.values((await res.json()).query?.pages || {})
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(p => {
      const ii = p.imageinfo?.[0]
      if (!ii || !IMG_MIME.test(ii.mime)) return null
      const meta = ii.extmetadata || {}
      return {
        id: `c-${p.pageid}`,
        thumb: ii.thumburl, full: ii.thumburl,
        title: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''),
        credit: [stripHtml(meta.Artist?.value), meta.LicenseShortName?.value].filter(Boolean).join(' · ') + ' · Wikimedia Commons',
        source,
      }
    })
    .filter(Boolean)
}

export const commonsNearby = (lat, lng, signal) =>
  commons({ generator: 'geosearch', ggscoord: `${lat}|${lng}`, ggsradius: '1000', ggslimit: '24', ggsnamespace: '6' }, 'near', signal)

export const commonsSearch = (q, signal) =>
  commons({ generator: 'search', gsrsearch: `filetype:bitmap ${q}`, gsrnamespace: '6', gsrlimit: '18' }, 'web', signal)

export async function openverseSearch(q, signal) {
  const url = new URL('https://api.openverse.org/v1/images/')
  url.searchParams.set('q', q)
  url.searchParams.set('page_size', '18')
  url.searchParams.set('mature', 'false')
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Openverse failed')
  return ((await res.json()).results || []).map(r => ({
    id: `o-${r.id}`,
    thumb: `https://api.openverse.org/v1/images/${r.id}/thumb/`,
    full: r.url,
    fallback: `https://api.openverse.org/v1/images/${r.id}/thumb/`,
    title: r.title || '',
    credit: [r.creator, r.license && `CC ${r.license.toUpperCase()}`].filter(Boolean).join(' · ') + ` · ${r.source || 'Openverse'}`,
    source: 'web',
  }))
}

// Photos near the pin first, then name matches from both libraries (interleaved)
export async function searchWebPhotos({ query, lat, lng, signal }) {
  const q = String(query || '').trim()
  const jobs = [
    lat != null && lng != null ? commonsNearby(lat, lng, signal) : Promise.resolve([]),
    q.length >= 3 ? commonsSearch(q, signal) : Promise.resolve([]),
    q.length >= 3 ? openverseSearch(q, signal) : Promise.resolve([]),
  ]
  const [near, com, ov] = (await Promise.allSettled(jobs)).map(r => (r.status === 'fulfilled' ? r.value : []))
  const mixed = []
  for (let i = 0; i < Math.max(com.length, ov.length); i++) { if (com[i]) mixed.push(com[i]); if (ov[i]) mixed.push(ov[i]) }
  const seen = new Set()
  return [...near, ...mixed].filter(r => !seen.has(r.thumb) && seen.add(r.thumb))
}

// Download a picked photo as a File (the full image, or the thumbnail if the host blocks it)
export async function photoToFile(photo) {
  for (const src of [photo.full, photo.fallback].filter(Boolean)) {
    try {
      const res = await fetch(src)
      if (!res.ok) continue
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) continue
      return new File([blob], `web-photo.${blob.type.split('/')[1] || 'jpg'}`, { type: blob.type })
    } catch { /* try the next */ }
  }
  throw new Error('download failed')
}
