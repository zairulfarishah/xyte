// Tasks "Mission Control": date lanes, urgency sorting, workload and the quick-add parser.

const DAY = 864e5
export const isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
export const todayIso = () => isoDay(new Date())
export const plusDays = (n, from = new Date()) => isoDay(new Date(from.getTime() + n * DAY))

// whole days from today to a 'YYYY-MM-DD' date (negative = past)
export const daysTo = (date, today) => Math.round((new Date(date + 'T00:00:00') - new Date(today + 'T00:00:00')) / DAY)

export const isDone = t => t.status === 'done'
export const isLate = (t, today) => !!t.due_date && !isDone(t) && daysTo(t.due_date, today) < 0
export const assigneesOf = t => (t.task_assignments || []).map(a => a.member_id)

export function dueText(due, today) {
  if (!due) return 'No date'
  const n = daysTo(due, today)
  if (n < 0) return `${-n}d late`
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  return new Date(due + 'T00:00:00').toLocaleDateString('en-MY', { weekday: n < 7 ? 'short' : undefined, day: 'numeric', month: 'short' })
}

export const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 }
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

// soonest date first, then highest priority
export const byUrgency = today => (a, b) =>
  (a.due_date ? daysTo(a.due_date, today) : 9999) - (b.due_date ? daysTo(b.due_date, today) : 9999)
  || (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)

export const LANES = [
  { key: 'late',  label: 'Overdue',   color: 'var(--x-danger)', empty: 'Nothing overdue ✓', test: (t, d) => isLate(t, d) },
  { key: 'today', label: 'Today',     color: 'var(--x-orange)', empty: 'Nothing due today', test: (t, d) => !!t.due_date && daysTo(t.due_date, d) === 0 },
  { key: 'week',  label: 'This week', color: 'var(--x-info)', empty: 'Clear',             test: (t, d) => !!t.due_date && daysTo(t.due_date, d) >= 1 && daysTo(t.due_date, d) <= 7 },
  { key: 'later', label: 'Later',     color: 'var(--x-review)', empty: 'Clear',             test: (t, d) => !!t.due_date && daysTo(t.due_date, d) > 7 },
  { key: 'none',  label: 'No date',   color: 'var(--x-neutral)', empty: 'Clear',             test: t => !t.due_date },
]

// Quick add:  "Check DO for KLIA @Izni !high fri"
//   @name → assignee (first name / short name, can repeat)   !high !med !low → priority
//   today / tomorrow / tmr / esok / mon…sun / 12 dec / 12/12 → due date
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function nextDate(day, monthIdx, today) {
  const now = new Date(today + 'T00:00:00')
  let d = new Date(now.getFullYear(), monthIdx, day)
  if (d.getMonth() !== monthIdx) return null
  if (d < now) d = new Date(now.getFullYear() + 1, monthIdx, day)
  return isoDay(d)
}

export function parseQuickTask(text, members, today) {
  let title = ` ${text} `
  const who = []
  let priority = 'medium', due = null

  title = title.replace(/@([\p{L}\d_]+)/gu, (all, n) => {
    const q = n.toLowerCase()
    const m = members.find(x => (x.short_name || '').toLowerCase().startsWith(q))
      || members.find(x => x.full_name.toLowerCase().split(/\s+/).some(w => w.startsWith(q)))
    if (!m) return all
    if (!who.includes(m.id)) who.push(m.id)
    return ' '
  })
  title = title.replace(/\s!(high|hi|h|medium|med|m|low|lo|l)\b/i, (_, p) => {
    const c = p[0].toLowerCase()
    priority = c === 'h' ? 'high' : c === 'l' ? 'low' : 'medium'
    return ' '
  })
  const dmy = title.match(/\s(\d{1,2})\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i)
    || title.match(/\s(\d{1,2})\/(\d{1,2})\b/)
  if (dmy) {
    const month = isNaN(dmy[2]) ? MONTHS.indexOf(dmy[2].toLowerCase().slice(0, 3)) : Number(dmy[2]) - 1
    const d = nextDate(Number(dmy[1]), month, today)
    if (d) { due = d; title = title.replace(dmy[0], ' ') }
  }
  if (!due) {
    title = title.replace(/\s(today|tomorrow|tmr|esok|mon|tue|wed|thu|fri|sat|sun)\b/i, (_, w) => {
      w = w.toLowerCase()
      if (w === 'today') due = today
      else if (['tomorrow', 'tmr', 'esok'].includes(w)) due = plusDays(1, new Date(today + 'T00:00:00'))
      else {
        const ahead = (DOW.indexOf(w) - new Date(today + 'T00:00:00').getDay() + 7) % 7 || 7
        due = plusDays(ahead, new Date(today + 'T00:00:00'))
      }
      return ' '
    })
  }
  return { title: title.replace(/\s+/g, ' ').trim(), assignees: who, priority, due_date: due }
}
