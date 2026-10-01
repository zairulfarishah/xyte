// Fixed-date Malaysia public holidays — same date every year, safe to hardcode.
const FIXED_HOLIDAY_LABELS = {
  '01-01': "New Year's Day",
  '05-01': 'Labour Day',
  '08-31': 'Merdeka Day',
  '09-16': 'Malaysia Day',
  '12-25': 'Christmas Day',
}
// Movable holidays (Chinese New Year, Hari Raya, Wesak, Deepavali, Awal Muharram, etc.) shift every
// year and aren't safe to guess — add the exact gazetted "YYYY-MM-DD" here once known.
const MOVABLE_HOLIDAYS = {
  // 2026 — company-observed dates (Selangor/Penang)
  '2026-02-02': 'Thaipusam',
  '2026-02-17': 'Chinese New Year Day 1',
  '2026-02-18': 'Chinese New Year Day 2',
  '2026-03-07': 'Nuzul Al-Quran',
  '2026-03-21': 'Hari Raya Aidilfitri Day 1',
  '2026-03-23': 'Hari Raya Aidilfitri Day 2',
  '2026-05-27': 'Hari Raya Haji',
  '2026-06-01': 'Hari Gawai',
  '2026-06-02': "Agong's Birthday",
  '2026-06-17': 'Awal Muharram',
  '2026-07-11': "Penang Governor's Birthday",
  '2026-08-25': "Prophet Muhammad's Birthday",
  '2026-11-09': 'Deepavali',
  '2026-12-11': "Sultan of Selangor's Birthday",
}

export function publicHolidayName(dateStr) {
  return FIXED_HOLIDAY_LABELS[dateStr.slice(5)] || MOVABLE_HOLIDAYS[dateStr] || null
}
