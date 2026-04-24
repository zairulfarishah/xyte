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

export default function Dashboard() {
  const [workload, setWorkload]       = useState([])
  const [upcomingSites, setUpcoming]  = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)

    // Fetch workload summary
    const { data: wl } = await supabase
      .from('member_workload_summary')
      .select('*')

    // Fetch upcoming sites (next 14 days)
    const today = new Date().toISOString().split('T')[0]
    const in14  = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                    .toISOString().split('T')[0]

    const { data: sites } = await supabase
      .from('sites')
      .select(`
        *,
        site_assignments (
          assignment_role,
          team_members ( full_name )
        )
      `)
      .in('site_status', ['upcoming', 'ongoing'])
      .gte('scheduled_date', today)
      .lte('scheduled_date', in14)
      .order('scheduled_date', { ascending: true })

    setWorkload(wl || [])
    setUpcoming(sites || [])
    setLoading(false)
  }

  const maxPoints = Math.max(...(workload.map(m => m.total_points)), 1)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-400 text-sm mt-1">
          {new Date().toLocaleDateString('en-MY', {
            weekday: 'long', year: 'numeric',
            month: 'long', day: 'numeric'
          })}
        </p>
      </div>

      {/* Workload Section */}
      <section>
        <h3 className="text-lg font-semibold text-white mb-4">
          Team Workload
        </h3>
        <div className="grid grid-cols-1 gap-3">
          {workload.map(member => (
            <div
              key={member.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-white font-medium">{member.full_name}</p>
                  <p className="text-gray-500 text-xs">{member.role}</p>
                </div>
                <div className="flex gap-3 text-xs text-gray-400">
                  <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md">
                    PIC: {member.pic_count}
                  </span>
                  <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded-md">
                    Crew: {member.crew_count}
                  </span>
                  <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded-md">
                    {member.total_points} pts
                  </span>
                </div>
              </div>

              {/* Workload bar */}
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${(member.total_points / maxPoints) * 100}%`
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming Sites Section */}
      <section>
        <h3 className="text-lg font-semibold text-white mb-4">
          Upcoming Sites — Next 14 Days
        </h3>

        {upcomingSites.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500">No sites scheduled in the next 14 days.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {upcomingSites.map(site => {
              const pic  = site.site_assignments?.find(a => a.assignment_role === 'PIC')
              const crew = site.site_assignments?.filter(a => a.assignment_role === 'crew')

              return (
                <div
                  key={site.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-semibold">{site.site_name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[site.site_status]}`}>
                          {site.site_status}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm">{site.location}</p>

                      <div className="mt-3 flex flex-wrap gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Date</p>
                          <p className="text-white">
                            {new Date(site.scheduled_date).toLocaleDateString('en-MY', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">PIC</p>
                          <p className="text-blue-400">
                            {pic ? pic.team_members.full_name : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Crew</p>
                          <p className="text-gray-300">
                            {crew && crew.length > 0
                              ? crew.map(c => c.team_members.full_name).join(', ')
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-gray-500 text-xs mb-1">Report</p>
                      <span className={`text-xs px-2 py-1 rounded-md ${REPORT_COLORS[site.report_status]}`}>
                        {site.report_status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

    </div>
  )
}