import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const AuthContext = createContext(null)

const ADMIN_EMAIL = 'zairul.f@sonicon.com.my'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const fullName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const firstName = fullName.split(' ')[0]
  const isZairul = user?.email === ADMIN_EMAIL

  return (
    <AuthContext.Provider value={{ user, loading, fullName, firstName, isZairul }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
