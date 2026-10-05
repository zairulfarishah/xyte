import { supabase } from '../supabase'

// Team-wide Calendar settings, kept as a JSON file next to the team leave records.
const SETTINGS_BUCKET = 'site-photos'
const SETTINGS_FILE_PATH = 'app-data/calendar-settings.json'

export const CALENDAR_TABS = ['month', 'list', 'crew', 'person']
export const DEFAULT_CALENDAR_SETTINGS = { tabs: { month: true, list: true, crew: true, person: true } }

// Unknown or missing tabs default to on, so a new tab shows up until an admin hides it.
function sanitize(raw) {
  const tabs = Object.fromEntries(CALENDAR_TABS.map(k => [k, raw?.tabs?.[k] !== false]))
  if (!CALENDAR_TABS.some(k => tabs[k])) return DEFAULT_CALENDAR_SETTINGS
  return { tabs }
}

export async function fetchCalendarSettings() {
  const { data, error } = await supabase.storage.from(SETTINGS_BUCKET).download(SETTINGS_FILE_PATH)

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (message.includes('not found') || message.includes('404') || message.includes('does not exist')) {
      return DEFAULT_CALENDAR_SETTINGS
    }
    throw new Error(error.message)
  }

  try {
    return sanitize(JSON.parse(await data.text()))
  } catch {
    return DEFAULT_CALENDAR_SETTINGS
  }
}

export async function saveCalendarSettings(settings) {
  const payload = JSON.stringify(sanitize(settings), null, 2)
  const file = new Blob([payload], { type: 'application/json' })
  const { error } = await supabase.storage
    .from(SETTINGS_BUCKET)
    .upload(SETTINGS_FILE_PATH, file, { upsert: true, contentType: 'application/json', cacheControl: '0' })

  if (error) {
    throw new Error(error.message)
  }
}
