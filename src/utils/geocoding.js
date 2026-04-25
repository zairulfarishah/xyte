export async function searchPlaces(query, options = {}) {
  const trimmedQuery = String(query || '').trim()
  if (trimmedQuery.length < 3) return []

  const { limit = 5, countrycodes = 'my' } = options
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', trimmedQuery)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(limit))
  if (countrycodes) url.searchParams.set('countrycodes', countrycodes)

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Location search failed.')
  }

  const data = await response.json()
  return (data || []).map(item => ({
    id: item.place_id,
    label: item.display_name,
    name: item.name || item.display_name,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
  }))
}
