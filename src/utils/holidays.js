// Malaysia national public holidays.
// Lunar/Islamic dates (CNY, Wesak, Deepavali, Raya, Awal Muharram, Maulidur Rasul)
// are based on published calendars and can shift by a day on official gazette —
// edit the entries here when the government confirms the year.
// State-only holidays (Thaipusam, Sultan birthdays, Hari Hol, etc.) are not included.

export const MY_PUBLIC_HOLIDAYS = {
  // ── 2025 ──
  '2025-01-01': "New Year's Day",
  '2025-01-29': 'Chinese New Year',
  '2025-01-30': 'Chinese New Year (2nd Day)',
  '2025-03-18': 'Nuzul Al-Quran',
  '2025-03-31': 'Hari Raya Aidilfitri',
  '2025-04-01': 'Hari Raya Aidilfitri (2nd Day)',
  '2025-05-01': 'Labour Day',
  '2025-05-12': 'Wesak Day',
  '2025-06-02': "Agong's Birthday",
  '2025-06-07': 'Hari Raya Haji',
  '2025-06-27': 'Awal Muharram',
  '2025-08-31': 'National Day',
  '2025-09-05': 'Maulidur Rasul',
  '2025-09-16': 'Malaysia Day',
  '2025-10-20': 'Deepavali',
  '2025-12-25': 'Christmas Day',

  // ── 2026 ──
  '2026-01-01': "New Year's Day",
  '2026-02-17': 'Chinese New Year',
  '2026-02-18': 'Chinese New Year (2nd Day)',
  '2026-03-06': 'Nuzul Al-Quran',
  '2026-03-20': 'Hari Raya Aidilfitri',
  '2026-03-21': 'Hari Raya Aidilfitri (2nd Day)',
  '2026-05-01': 'Labour Day',
  '2026-05-27': 'Hari Raya Haji',
  '2026-05-31': 'Wesak Day',
  '2026-06-01': "Agong's Birthday",
  '2026-06-16': 'Awal Muharram',
  '2026-08-25': 'Maulidur Rasul',
  '2026-08-31': 'National Day',
  '2026-09-16': 'Malaysia Day',
  '2026-11-08': 'Deepavali',
  '2026-12-25': 'Christmas Day',

  // ── 2027 ──
  '2027-01-01': "New Year's Day",
  '2027-02-06': 'Chinese New Year',
  '2027-02-07': 'Chinese New Year (2nd Day)',
  '2027-02-24': 'Nuzul Al-Quran',
  '2027-03-10': 'Hari Raya Aidilfitri',
  '2027-03-11': 'Hari Raya Aidilfitri (2nd Day)',
  '2027-05-01': 'Labour Day',
  '2027-05-17': 'Hari Raya Haji',
  '2027-05-20': 'Wesak Day',
  '2027-06-06': 'Awal Muharram',
  '2027-06-07': "Agong's Birthday",
  '2027-08-15': 'Maulidur Rasul',
  '2027-08-31': 'National Day',
  '2027-09-16': 'Malaysia Day',
  '2027-10-29': 'Deepavali',
  '2027-12-25': 'Christmas Day',
}

export function getHoliday(dateStr) {
  return MY_PUBLIC_HOLIDAYS[dateStr] || null
}

export function isHoliday(dateStr) {
  return Boolean(MY_PUBLIC_HOLIDAYS[dateStr])
}

// Sunday is the only non-working weekday (Sat is a working day for site crews).
export function isNonWorkingDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay() === 0
}
