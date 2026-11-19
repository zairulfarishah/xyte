// Outstation = a site outside Kuala Lumpur / Selangor (Putrajaya sits inside Selangor, so it counts as local).
// Used by the site form (to ask the question), the site cards (tint) and the timecard (row highlight).

const LOCAL = ['selangor', 'kuala lumpur', 'putrajaya']
const OTHER_STATES = ['johor', 'penang', 'pulau pinang', 'perak', 'pahang', 'negeri sembilan', 'melaka', 'malacca',
  'kedah', 'kelantan', 'terengganu', 'perlis', 'sabah', 'sarawak', 'labuan', 'singapore']

// Rough box around Selangor + KL, for when the address text names no state
const inKlangValleyBox = (lat, lng) => lat >= 2.55 && lat <= 3.9 && lng >= 100.75 && lng <= 102.0

// true = outside KL / Selangor, false = inside, null = can't tell yet
export function isOutsideKlSelangor(location, latitude, longitude) {
  const text = String(location || '').toLowerCase()
  if (OTHER_STATES.some(s => text.includes(s))) return true
  if (LOCAL.some(s => text.includes(s))) return false
  const lat = parseFloat(latitude), lng = parseFloat(longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) return !inKlangValleyBox(lat, lng)
  return null
}

export const OUTSTATION_HIGHLIGHT = { label: 'Outstation', hex: '#E0E7FF' }
