// Base of operations — distances are straight-line from here
export const BASE = { label: 'Kuala Lumpur', latitude: 3.1390, longitude: 101.6869 }

const EARTH_RADIUS_KM = 6371

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export function distanceFromBase(site) {
  const lat = Number(site?.latitude)
  const lon = Number(site?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null
  return haversineKm(BASE.latitude, BASE.longitude, lat, lon)
}

export function toDate(value) {
  if (!value) return null
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key) {
  const [year, month] = key.split('-')
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1]} ${String(year).slice(2)}`
}

// Monday-anchored week id, for "busiest week" style counts
export function weekKey(date) {
  const ref = new Date(date)
  ref.setHours(0, 0, 0, 0)
  ref.setDate(ref.getDate() - ((ref.getDay() + 6) % 7))
  return monthKey(ref) + '-' + String(ref.getDate()).padStart(2, '0')
}

export function countBy(items, keyFn) {
  const counts = new Map()
  items.forEach(item => {
    const key = keyFn(item)
    if (key === null || key === undefined || key === '') return
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  return counts
}

export function sumBy(items, keyFn, valueFn) {
  const totals = new Map()
  items.forEach(item => {
    const key = keyFn(item)
    if (key === null || key === undefined || key === '') return
    totals.set(key, (totals.get(key) || 0) + (Number(valueFn(item)) || 0))
  })
  return totals
}

export function topEntries(map, limit = 5) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))
}

// "Jalan Ampang, Kuala Lumpur, Malaysia" -> "Kuala Lumpur"
export function areaOf(location) {
  const parts = String(location || '').split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const withoutCountry = parts.filter(p => !/^malaysia$/i.test(p))
  return withoutCountry[withoutCountry.length - 1] || parts[parts.length - 1]
}

export function formatNumber(value, decimals = 0) {
  if (!Number.isFinite(value)) return '-'
  return value.toLocaleString('en-MY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function daysBetween(from, to) {
  if (!from || !to) return null
  return Math.round((to - from) / 86400000)
}

// Site end date: explicit column, else derived from duration
export function siteEndDate(site) {
  const explicit = toDate(site?.scheduled_end_date) || toDate(site?.end_date)
  if (explicit) return explicit
  const start = toDate(site?.scheduled_date)
  if (!start) return null
  const days = Math.max(1, Math.ceil(Number(site?.site_duration_days) || 1))
  return new Date(start.getTime() + (days - 1) * 86400000)
}
