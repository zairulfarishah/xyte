// Display title for a site: "Site Name - Client Company"
// The same physical site can be booked by different clients, so the company
// is part of how the team identifies a job.
export function getSiteTitle(site) {
  const name = String(site?.site_name || '').trim()
  const company = String(site?.client_company_name || '').trim()

  if (!name) return company || 'Untitled site'
  if (!company) return name

  return `${name} - ${company}`
}
