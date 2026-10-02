import { formatAssignmentDate } from './notify'

const DEFAULT_COUNTRY_CODE = '60'   // Malaysia

// Accepts 012-345 6789, +60 12 345 6789, 60123456789 -> 60123456789
export function normalizePhone(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''

  if (digits.startsWith(countryCode) && digits.length > countryCode.length + 6) return digits
  if (digits.startsWith('0')) return `${countryCode}${digits.slice(1)}`
  if (digits.startsWith('00')) return digits.slice(2)

  return digits
}

export function isValidPhone(raw) {
  const digits = normalizePhone(raw)
  return digits.length >= 10 && digits.length <= 15
}

// Pretty form for display: 60123456789 -> +60 12-345 6789
export function formatPhoneDisplay(raw) {
  const digits = normalizePhone(raw)
  if (!digits) return ''
  const local = digits.startsWith(DEFAULT_COUNTRY_CODE) ? digits.slice(DEFAULT_COUNTRY_CODE.length) : digits
  if (local.length < 9) return `+${digits}`
  const head = local.slice(0, local.length - 7)
  const mid = local.slice(local.length - 7, local.length - 4)
  const tail = local.slice(local.length - 4)
  return `+${DEFAULT_COUNTRY_CODE} ${head}-${mid} ${tail}`
}

export function buildWhatsAppUrl(phone, message = '') {
  const digits = normalizePhone(phone)
  if (!digits) return ''
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${digits}${text}`
}

// Short name for messages: the member's short_name, else their first name.
export function shortNameOf(member) {
  return member?.short_name || String(member?.full_name || '').split(' ')[0] || ''
}

// Assignment brief sent to a PIC or crew member — short, one screen.
// Plain-text labels only — emoji render as tofu on some devices. Lines with no data are left out.
// memberName  — short name used in the greeting
// memberDates — the days this person is on site (only some days, on a rotating crew)
// dayRoster   — [{ date, picName, crewNames }] (short names) when the site runs a different crew per day
export function buildAssignmentMessage({
  role, memberName, site, pic = null, crew = [], memberDates = [], dayRoster = [],
}) {
  const label = String(role || '').toLowerCase() === 'pic' ? 'PIC' : 'crew'
  const duration = Number(site?.site_duration_days) || 0
  const dateLine = duration > 1
    ? `${formatAssignmentDate(site?.scheduled_date)} (${duration} days)`
    : formatAssignmentDate(site?.scheduled_date)

  const lines = [
    `Hi ${memberName || 'there'}, you're *${label}* for this site:`,
    '',
    `*Site:* ${site?.site_name || '-'}`,
    `*Date:* ${dateLine}`,
  ]

  if (memberDates.length > 0 && dayRoster.length > 1 && memberDates.length < dayRoster.length) {
    lines.push(`*Your days:* ${memberDates.map(shortDayLabel).join(', ')}`)
  }
  // Multi-line scopes start on their own line so the list stays readable.
  const objective = String(site?.scope_of_work || '').trim().replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n')
  if (objective) lines.push(objective.includes('\n') ? `*Objective:*\n${objective}` : `*Objective:* ${objective}`)

  // A map link takes people straight there; fall back to the typed address.
  if (site?.latitude && site?.longitude) {
    lines.push(`*Location:* https://maps.google.com/?q=${site.latitude},${site.longitude}`)
  } else if (site?.location) {
    lines.push(`*Location:* ${site.location}`)
  }

  const clientPhone = site?.client_number ? (formatPhoneDisplay(site.client_number) || site.client_number) : ''
  const client = [site?.client_name, clientPhone].filter(Boolean).join(' – ')
  if (client) lines.push(`*Client:* ${client}`)

  // Whole team on one line, PIC first. On a rotating crew, everyone who works any day.
  const pics = dayRoster.length > 1
    ? dayRoster.map(d => d.picName)
    : [shortNameOf(pic)]
  const crewNames = dayRoster.length > 1
    ? dayRoster.flatMap(d => d.crewNames || [])
    : crew.map(shortNameOf)
  const uniquePics = [...new Set(pics.filter(Boolean))]
  const team = [
    ...uniquePics.map(n => `${n} (PIC)`),
    ...[...new Set(crewNames.filter(Boolean))].filter(n => !uniquePics.includes(n)),
  ]
  if (team.length > 0) lines.push(`*Team:* ${team.join(', ')}`)

  return lines.join('\n')
}

function shortDayLabel(date) {
  const parsed = new Date(`${String(date || '').slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return String(date || '')
  return parsed.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function openWhatsApp(phone, message) {
  const url = buildWhatsAppUrl(phone, message)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
