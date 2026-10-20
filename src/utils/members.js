// Members who have left are hidden, not deleted, so their history keeps its names.
// Use activeMembers for lists and pickers; keep the full list for name lookups.
export const isActiveMember = m => !m?.is_hidden
export const activeMembers = members => (members || []).filter(isActiveMember)
