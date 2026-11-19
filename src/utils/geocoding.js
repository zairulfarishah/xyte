// Place search for Malaysian addresses.
// Two free sources run side by side and are merged:
//  - Photon (komoot): typo tolerant, good with partial names — also used for type-ahead
//  - Nominatim (OpenStreetMap): stricter, only on an explicit search (its policy forbids autocomplete)
// Plus: pasted coordinates / Google Maps links, and a simplified retry when nothing matches.

const MY_BBOX = '99.6,0.8,119.3,7.5'          // Malaysia, for Photon
const BIAS = { lat: 3.1, lon: 101.6 }          // Klang Valley first

// "3.0738, 101.5183" or a Google Maps URL (…/@3.07,101.51,17z or ?q=3.07,101.51 or !3d3.07!4d101.51)
export function parseCoordinates(text) {
  const s = String(text || '').trim()
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,
    /^(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)$/,
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { latitude: lat, longitude: lng }
    }
  }
  return null
}

const join = parts => [...new Set(parts.filter(Boolean))].join(', ')

async function searchPhoton(q, limit, signal) {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(limit + 3))
  url.searchParams.set('lang', 'en')
  url.searchParams.set('bbox', MY_BBOX)
  url.searchParams.set('lat', BIAS.lat)
  url.searchParams.set('lon', BIAS.lon)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Photon failed')
  const data = await res.json()
  return (data.features || [])
    .filter(f => !f.properties.countrycode || f.properties.countrycode === 'MY')
    .map(f => {
      const p = f.properties
      const street = join([p.housenumber, p.street])
      return {
        id: `p-${p.osm_type}${p.osm_id}`,
        name: p.name || street || p.city || '',
        label: join([p.name, street, p.district, p.locality, p.city, p.postcode, p.state, 'Malaysia']),
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
      }
    })
}

async function searchNominatim(q, limit, countrycodes, signal) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(limit))
  if (countrycodes) url.searchParams.set('countrycodes', countrycodes)
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) throw new Error('Nominatim failed')
  const data = await res.json()
  return (data || []).map(item => ({
    id: `n-${item.place_id}`,
    label: item.display_name,
    name: item.name || item.display_name,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
  }))
}

// Two results within ~150 m are the same place — keep the first
function dedupe(list) {
  const out = []
  for (const r of list) {
    if (!out.some(o => Math.abs(o.latitude - r.latitude) < 0.0014 && Math.abs(o.longitude - r.longitude) < 0.0014)) out.push(r)
  }
  return out
}

// Strip what usually trips the search up: unit / lot numbers, postcodes, "Malaysia"
export function simplifyQuery(q) {
  return String(q || '')
    .replace(/\b(no\.?|lot|unit|level|lvl|tingkat|blok|block|plot)\s*[\w/-]+/gi, ' ')
    .replace(/\b\d{5}\b/g, ' ')
    .replace(/\bmalaysia\b/gi, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
}

// quick = type-ahead (Photon only); otherwise both sources, with simplified retries
export async function searchPlaces(query, options = {}) {
  const q = String(query || '').trim()
  if (q.length < 3) return []
  const { limit = 6, countrycodes = 'my', quick = false, signal } = options

  const run = async text => {
    const jobs = [searchPhoton(text, limit, signal)]
    if (!quick) jobs.push(searchNominatim(text, limit, countrycodes, signal))
    const settled = await Promise.allSettled(jobs)
    if (settled.every(s => s.status === 'rejected')) throw settled[0].reason
    // Nominatim first when it answers (more exact), Photon fills the gaps
    const [photon, nomi] = settled.map(s => (s.status === 'fulfilled' ? s.value : []))
    return dedupe([...(nomi || []), ...photon]).slice(0, limit)
  }

  let results = await run(q)
  if (results.length || quick) return results

  // Nothing — try a cleaner query, then just the last parts of the address (area, city, state)
  const tries = []
  const simple = simplifyQuery(q)
  if (simple && simple !== q) tries.push(simple)
  const parts = simple.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length > 2) tries.push(parts.slice(-3).join(', '))
  if (parts.length > 1) tries.push(parts.slice(-2).join(', '))
  for (const t of tries) {
    results = await run(t)
    if (results.length) return results.map(r => ({ ...r, approx: true }))
  }
  return []
}

// Address for a pin (used when coordinates / a Maps link are pasted)
export async function reverseGeocode(latitude, longitude) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('lat', latitude)
  url.searchParams.set('lon', longitude)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('zoom', '18')
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Reverse lookup failed')
  const d = await res.json()
  return d?.display_name ? { label: d.display_name, name: d.name || '' } : null
}
