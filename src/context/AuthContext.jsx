import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const AuthContext = createContext(null)

const ADMIN_EMAIL = 'zairul.f@xradar.asia'

function getAuthDisplayName(user) {
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.display_name ||
    user?.identities?.[0]?.identity_data?.full_name ||
    user?.identities?.[0]?.identity_data?.name ||
    ''
  )
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [member, setMember]   = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchMember(email) {
    if (!email) { setMember(null); return }
    const normalizedEmail = String(email).trim().toLowerCase()
    const { data } = await supabase
      .from('team_members')
      .select('short_name, full_name, avatar_url')
      .ilike('email', normalizedEmail)
      .single()
    setMember(data || null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      fetchMember(u?.email).then(() => setLoading(false))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      fetchMember(u?.email).finally(() => setLoading(false))
    })
    return () => subscription.unsubscribe()
  }, [])

  const authDisplayName = getAuthDisplayName(user)
  const fullName  = member?.full_name || authDisplayName || user?.email?.split('@')[0] || 'User'
  const firstName = member?.short_name || fullName.split(' ')[0]
  const avatarUrl = member?.avatar_url || null
  const isZairul = user?.email === ADMIN_EMAIL

  return (
    <AuthContext.Provider value={{ user, loading, fullName, firstName, avatarUrl, isZairul }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
