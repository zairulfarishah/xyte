import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const STATUS_COLORS = {
  upcoming:  'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  ongoing:   'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  completed: 'bg-green-500/20 text-green-400 border border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border border-red-500/30',
  postponed: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
}

const REPORT_COLORS = {
  pending:     'bg-gray-500/20 text-gray-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  submitted:   'bg-purple-500/20 text-purple-400',
  approved:    'bg-green-500/20 text-green-400',
}

const EMPTY_FORM = {
  site_name: '', location: '', latitude: '', longitude: '',
  scheduled_date: '', site_status: 'upcoming', report_status: 'pending',
  notes: '', pic_id: '', crew_ids: [],
}

export default function Sites() {
  const [sites, setSites]       = useState([])
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editSite, setEditSite] = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: s } = await supabase
      .from('sites')
      .select(`*, site_assignments(assignment_role, team_members(id, full_name))`)
      .order('scheduled_date', { ascending: true })

    const { data: m } = await supabase
      .from('team_members')
      .select('*')
      .order('full_name')

    setSites(s || [])
    setMembers(m || [])
    setLoading(false)
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditSite(null)
    setShowForm(true)
  }

  function openEdit(site) {
    const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
    const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew')
    setForm({
      site_name:      site.site_name,
      location:       site.location,
      latitude:       site.latitude || '',
      longitude:      site.longitude || '',
      scheduled_date: site.scheduled_date,
      site_status:    site.site_status,
      report_status:  site.report_status,
      notes:          site.notes || '',
      pic_id:         pic?.team_members?.id || '',
      crew_ids:       crew?.map(c => c.team_members?.id) || [],
    })
    setEditSite(site)
    setShowForm(true)
  }

  function toggleCrew(id) {
    setForm(f => ({
      ...f,
      crew_ids: f.crew_ids.includes(id)
        ? f.crew_ids.filter(x => x !== id)
        : [...f.crew_ids, id]
    }))
  }

  async function handleSave() {
    if (!form.site_name || !form.location || !form.scheduled_date) return
    setSaving(true)

    const payload = {
      site_name:      form.site_name,
      location:       form.location,
      latitude:       form.latitude ? parseFloat(form.latitude) : null,
      longitude:      form.longitude ? parseFloat(form.longitude) : null,
      scheduled_date: form.scheduled_date,
      site_status:    form.site_status,
      report_status:  form.report_status,
      notes:          form.notes,
    }

    let siteId = editSite?.id

    if (editSite) {
      await supabase.from('sites').update(payload).eq('id', siteId)
      await supabase.from('site_assignments').delete().eq('site_id', siteId)
      await supabase.from('workload_log').delete().eq('site_id', siteId)
    } else {
      const { data } = await supabase.from('sites').insert(payload).select().single()
      siteId = data.id
    }

    // Re-insert assignments
    const assignments = []
    if (form.pic_id) assignments.push({ site_id: siteId, member_id: form.pic_id, assignment_role: 'PIC' })
    form.crew_ids.forEach(id => {
      if (id !== form.pic_id) assignments.push({ site_id: siteId, member_id: id, assignment_role: 'crew' })
    })
    if (assignments.length > 0) {
      await supabase.from('site_assignments').insert(assignments)
    }

    setSaving(false)
    setShowForm(false)
    fetchAll()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this site?')) return
    await supabase.from('sites').delete().eq('id', id)
    fetchAll()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500">Loading sites...</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Sites</h2>
          <p className="text-gray-400 text-sm mt-1">{sites.length} total sites</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Site
        </button>
      </div>

      {/* Sites Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
              <th className="text-left px-4 py-3">Site Name</th>
              <th className="text-left px-4 py-3">Location</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">PIC</th>
              <th className="text-left px-4 py-3">Crew</th>
              <th className="text-left px-4 py-3">Site Status</th>
              <th className="text-left px-4 py-3">Report</th>
              <th className="text-left px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sites.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-gray-500 py-12">
                  No sites yet. Click "+ Add Site" to get started.
                </td>
              </tr>
            ) : sites.map((site, i) => {
              const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
              const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew')
              return (
                <tr
                  key={site.id}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-800/20'}`}
                >
                  <td className="px-4 py-3 text-white font-medium">{site.site_name}</td>
                  <td className="px-4 py-3 text-gray-300">{site.location}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {new Date(site.scheduled_date).toLocaleDateString('en-MY', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </td>
                  <td className="px-4 py-3 text-blue-400">
                    {pic?.team_members?.full_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {crew?.length > 0 ? crew.map(c => c.team_members?.full_name).join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[site.site_status]}`}>
                      {site.site_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-md ${REPORT_COLORS[site.report_status]}`}>
                      {site.report_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(site)}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(site.id)}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">
              {editSite ? 'Edit Site' : 'Add New Site'}
            </h3>

            {/* Site Name */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Site Name *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.site_name}
                onChange={e => setForm(f => ({ ...f, site_name: e.target.value }))}
                placeholder="e.g. Jalan Ampang Survey"
              />
            </div>

            {/* Location */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Location *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Jalan Ampang, Kuala Lumpur"
              />
            </div>

            {/* Lat / Long */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Latitude</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  value={form.latitude}
                  onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                  placeholder="e.g. 3.1579"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Longitude</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  value={form.longitude}
                  onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                  placeholder="e.g. 101.7151"
                />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Scheduled Date *</label>
              <input
                type="date"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.scheduled_date}
                onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
              />
            </div>

            {/* Site Status */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Site Status</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.site_status}
                onChange={e => setForm(f => ({ ...f, site_status: e.target.value }))}
              >
                {['upcoming','ongoing','completed','cancelled','postponed'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Report Status */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Report Status</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.report_status}
                onChange={e => setForm(f => ({ ...f, report_status: e.target.value }))}
              >
                {['pending','in_progress','submitted','approved'].map(s => (
                  <option key={s} value={s}>{s.replace('_',' ')}</option>
                ))}
              </select>
            </div>

            {/* PIC */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">PIC</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.pic_id}
                onChange={e => setForm(f => ({ ...f, pic_id: e.target.value }))}
              >
                <option value="">— Select PIC —</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>

            {/* Crew */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Crew (select multiple)</label>
              <div className="space-y-2">
                {members.map(m => (
                  <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.crew_ids.includes(m.id)}
                      onChange={() => toggleCrew(m.id)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-300">{m.full_name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notes</label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..."
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Saving...' : editSite ? 'Save Changes' : 'Add Site'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}