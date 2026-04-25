import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { User, Info, Lock } from 'lucide-react'
import { ROLE_MULTIPLIERS, WEEKLY_CAPACITY_DAYS } from '../utils/workload'
import { useAuth } from '../context/AuthContext'

const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626']

function Avatar({ name, size = 40, index = 0 }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: AVATAR_COLORS[index % AVATAR_COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: '700', fontSize: size * 0.35, flexShrink: 0
    }}>{initials}</div>
  )
}

const SECTIONS = [
  { key: 'team',         label: 'Team Members',    icon: User     },
  { key: 'app',          label: 'App Info',         icon: Info     },
]

export default function SettingsPage() {
  const { isZairul } = useAuth()
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [section, setSection]   = useState('team')
  const [stats, setStats]       = useState({})

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: m } = await supabase
      .from('team_members').select('*').order('created_at')
    const { data: s } = await supabase
      .from('sites').select('id, site_status, report_status')
    const { data: d } = await supabase
      .from('library_documents').select('id')

    setMembers(m || [])
    setStats({
      totalSites:    s?.length || 0,
      completed:     s?.filter(x => x.site_status === 'completed').length || 0,
      approved:      s?.filter(x => x.report_status === 'approved').length || 0,
      docs:          d?.length || 0,
    })
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none',
    background: '#f8fafc', color: '#0f172a'
  }

  if (!isZairul) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Lock size={24} color="#ef4444" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a', marginBottom: '4px' }}>Access Restricted</p>
        <p style={{ color: '#64748b', fontSize: '13px' }}>Settings are only accessible by Zairul.</p>
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: '#64748b' }}>Loading settings...</div>
    </div>
  )

  return (
    <div style={{ padding: '28px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Settings</h1>
        <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>Manage your app configuration</p>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* Left nav */}
        <div style={{ width: '220px', flexShrink: 0, background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '8px', overflow: 'hidden' }}>
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setSection(key)} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              background: section === key ? '#eff6ff' : 'transparent',
              color: section === key ? '#1d4ed8' : '#64748b',
              fontSize: '13px', fontWeight: section === key ? '600' : '400',
              transition: 'all 0.15s', marginBottom: '2px'
            }}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Team Members Section */}
          {section === 'team' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>Team Members</h2>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Your current GPR team</p>
                </div>
                <div style={{ padding: '8px' }}>
                  {members.map((m, i) => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px', borderRadius: '8px', marginBottom: '2px',
                      transition: 'background 0.1s'
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Avatar name={m.full_name} size={40} index={i} />
                        <div>
                          <p style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a' }}>{m.full_name}</p>
                          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>{m.role}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          background: m.role === 'Team Leader' ? '#eff6ff' : '#faf5ff',
                          color: m.role === 'Team Leader' ? '#1d4ed8' : '#6d28d9',
                          border: `1px solid ${m.role === 'Team Leader' ? '#93c5fd' : '#c4b5fd'}`,
                          padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '500'
                        }}>{m.role}</span>
                        <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #4ade80', padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '500' }}>Active</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weightage info */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>Workload Weightage</h2>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>% of weekly capacity per task type (week = {WEEKLY_CAPACITY_DAYS} days)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    {
                      label: 'PIC — Site Scanning', color: '#2563eb', bg: '#eff6ff',
                      desc: 'Liaises with client, manages full process',
                      pct: `${((ROLE_MULTIPLIERS.site_scanning.pic / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}% per day`,
                      example: `e.g. 1-day site = ${((1 / WEEKLY_CAPACITY_DAYS) * 100 * ROLE_MULTIPLIERS.site_scanning.pic).toFixed(0)}%`,
                    },
                    {
                      label: 'Crew — Site Scanning', color: '#7c3aed', bg: '#faf5ff',
                      desc: 'On-site scanning work',
                      pct: `${((ROLE_MULTIPLIERS.site_scanning.crew / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}% per day`,
                      example: `e.g. 1-day site = ${((1 / WEEKLY_CAPACITY_DAYS) * 100 * ROLE_MULTIPLIERS.site_scanning.crew).toFixed(0)}%`,
                    },
                    {
                      label: 'PIC / Crew — Site Visit', color: '#059669', bg: '#f0fdf4',
                      desc: 'Fixed half-day visit, same weight for all',
                      pct: `${((0.5 / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}% fixed`,
                      example: 'Always half day (0.5)',
                    },
                    {
                      label: 'Meeting', color: '#d97706', bg: '#fffbeb',
                      desc: 'Contributes based on meeting duration',
                      pct: '9–18% per meeting',
                      example: '2hrs=5% / half day=9% / full day=18%',
                    },
                    {
                      label: 'Report Preparation', color: '#dc2626', bg: '#fef2f2',
                      desc: 'When site moves to report phase',
                      pct: `${((1 / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}% per day`,
                      example: `e.g. 1-day report = ${((1 / WEEKLY_CAPACITY_DAYS) * 100).toFixed(0)}%`,
                    },
                  ].map(({ label, color, bg, desc, pct, example }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: bg, borderRadius: '10px' }}>
                      <div>
                        <p style={{ fontWeight: '600', fontSize: '13px', color }}>{label}</p>
                        <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{desc}</p>
                        <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{example}</p>
                      </div>
                      <div style={{ background: 'white', borderRadius: '8px', padding: '6px 12px', textAlign: 'center', minWidth: '80px', flexShrink: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: '700', color }}>{pct}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* App Info Section */}
          {section === 'app' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* App details */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ width: '52px', height: '52px', background: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '22px' }}>X</div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Xyte</h2>
                    <p style={{ fontSize: '13px', color: '#64748b' }}>GPR Team Manager · Version 1.0.0</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'Total Sites',       value: stats.totalSites },
                    { label: 'Completed Sites',   value: stats.completed  },
                    { label: 'Approved Reports',  value: stats.approved   },
                    { label: 'Library Docs',      value: stats.docs       },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>{value}</p>
                      <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tech stack */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>Tech Stack</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { name: 'React + Vite',   role: 'Frontend framework',   color: '#2563eb' },
                    { name: 'Tailwind CSS',   role: 'Styling',              color: '#0ea5e9' },
                    { name: 'Supabase',       role: 'Database + Storage',   color: '#059669' },
                    { name: 'React Leaflet',  role: 'Map module',           color: '#d97706' },
                    { name: 'Lucide React',   role: 'Icons',                color: '#7c3aed' },
                    { name: 'GitHub',         role: 'Code repository',      color: '#0f172a' },
                  ].map(({ name, role, color }) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>{name}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}