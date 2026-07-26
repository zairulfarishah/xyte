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

// Assignment brief sent to a PIC or crew member
// Plain-text labels only — emoji render as tofu on some devices
export function buildAssignmentMessage({ role, memberName, site, pic = null, crew = [] }) {
  const label = String(role || '').toLowerCase() === 'pic' ? 'PIC' : 'crew'
  const duration = Number(site?.site_duration_days) || 0
  const dateLine = duration > 1
    ? `${formatAssignmentDate(site?.scheduled_date)} (${duration} days)`
    : formatAssignmentDate(site?.scheduled_date)

  const lines = [
    `Hi ${String(memberName || '').split(' ')[0] || 'there'},`,
    '',
    `You are assigned as *${label}* for:`,
    '',
    `*Site:* ${site?.site_name || '-'}`,
    `*Date:* ${dateLine}`,
  ]

  if (site?.location) lines.push(`*Location:* ${site.location}`)
  if (site?.latitude && site?.longitude) {
    lines.push(`*Map:* https://maps.google.com/?q=${site.latitude},${site.longitude}`)
  }
  if (site?.client_name) lines.push(`*Client:* ${site.client_name}`)

  // Full team roster, so everyone knows who else is on the job
  const mark = name => (name && memberName && name === memberName ? `${name} (you)` : name)
  const crewNames = crew.map(c => mark(c?.full_name)).filter(Boolean)

  if (pic?.full_name || crewNames.length > 0) {
    lines.push('')
    lines.push(`*PIC:* ${mark(pic?.full_name) || 'Not assigned'}`)
    lines.push(`*Crew:* ${crewNames.length > 0 ? crewNames.join(', ') : 'None'}`)
  }

  return lines.join('\n')
}

export function openWhatsApp(phone, message) {
  const url = buildWhatsAppUrl(phone, message)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
