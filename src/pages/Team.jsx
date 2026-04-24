import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const ROLE_COLOR = {
  'Team Leader':  'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  'GPR Engineer': 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
}

const STATUS_COLORS = {
  upcoming:  'bg-yellow-500/20 text-yellow-400',
  ongoing:   'bg-orange-500/20 text-orange-400',
  completed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-red-500/20 text-red-400',
  postponed: 'bg-gray-500/20 text-gray-400',
}

export default function Team() {
  const [members, setMembers]   = useState([])
  const [selected, setSelected] = useState(null)
  const [sites, setSites]       = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)

    const { data: m } = await supabase
      .from('member_workload_summary')
      .select('*')

    const { data: s } = await supabase
      .from('sites')
      .select(`*, site_assignments(assignment_role, member_id, team_members(full_name))`)
      .order('scheduled_date', { ascending: false })

    setMembers(m || [])
    setSites(s || [])
    setLoading(false)
  }

  function getMemberSites(memberId) {
    return sites.filter(site =>
      site.site_assignments?.some(a => a.member_id === memberId)
    )
  }

  function getMemberRole(memberId, siteAssignments) {
    return siteAssignments?.find(a => a.member_id === memberId)?.assignment_role || '—'
  }

  const maxPoints = Math.max(...(members.map(m => m.total_points)), 1)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500">Loading team...</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Team</h2>
        <p className="text-gray-400 text-sm mt-1">{members.length} members</p>
      </div>

      {/* Member Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map(member => {
          const memberSites = getMemberSites(member.id)
          const completed   = memberSites.filter(s => s.site_status === 'completed').length
          const ongoing     = memberSites.filter(s => s.site_status === 'ongoing').length
          const upcoming    = memberSites.filter(s => s.site_status === 'upcoming').length

          return (
            <div
              key={member.id}
              onClick={() => setSelected(selected?.id === member.id ? null : member)}
              className={`bg-gray-900 border rounded-xl p-5 cursor-pointer transition-all hover:border-gray-600 ${
                selected?.id === member.id
                  ? 'border-blue-500'
                  : 'border-gray-800'
              }`}
            >
              {/* Avatar + Name */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {member.full_name.charAt(0)}
                </div>
                <div>
                  <p className="text-white font-semibold">{member.full_name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLOR[member.role]}`}>
                    {member.role}
                  </span>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div className="bg-gray-800 rounded-lg py-2">
                  <p className="text-white font-bold text-lg">{member.pic_count}</p>
                  <p className="text-gray-500 text-xs">PIC</p>
                </div>
                <div className="bg-gray-800 rounded-lg py-2">
                  <p className="text-white font-bold text-lg">{member.crew_count}</p>
                  <p className="text-gray-500 text-xs">Crew</p>
                </div>
                <div className="bg-gray-800 rounded-lg py-2">
                  <p className="text-white font-bold text-lg">{memberSites.length}</p>
                  <p className="text-gray-500 text-xs">Total</p>
                </div>
              </div>

              {/* Site status breakdown */}
              <div className="flex gap-2 flex-wrap mb-4">
                {upcoming > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400">
                    {upcoming} upcoming
                  </span>
                )}
                {ongoing > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400">
                    {ongoing} ongoing
                  </span>
                )}
                {completed > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-green-500/20 text-green-400">
                    {completed} completed
                  </span>
                )}
              </div>

              {/* Workload bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Workload</span>
                  <span>{member.total_points} pts</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${(member.total_points / maxPoints) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected member site history */}
      {selected && (
        <div className="bg-gray-900 border border-blue-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">
              {selected.full_name} — Site History
            </h3>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-600 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {getMemberSites(selected.id).length === 0 ? (
            <p className="text-gray-500 text-sm">No sites assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {getMemberSites(selected.id).map(site => {
                const role = getMemberRole(selected.id, site.site_assignments)
                return (
                  <div
                    key={site.id}
                    className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3"
                  >
                    <div>
                      <p className="text-white text-sm font-medium">{site.site_name}</p>
                      <p className="text-gray-500 text-xs">{site.location}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-md ${
                        role === 'PIC'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {role}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full ${STATUS_COLORS[site.site_status]}`}>
                        {site.site_status}
                      </span>
                      <span className="text-gray-500">
                        {new Date(site.scheduled_date).toLocaleDateString('en-MY', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}