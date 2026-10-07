import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { ADMIN_EMAIL } from '../utils/admin'

const AuthContext = createContext(null)

const MEMBER_CACHE_KEY = 'xyte_member'

// undefined: nothing remembered for this email; null: remembered as "no member row"
function readCachedMember(email) {
  try {
    const cached = JSON.parse(localStorage.getItem(MEMBER_CACHE_KEY) || 'null')
    return cached && cached.email === String(email).trim().toLowerCase() ? cached.member : undefined
  } catch {
    return undefined
  }
}

function saveCachedMember(email, member) {
  try { localStorage.setItem(MEMBER_CACHE_KEY, JSON.stringify({ email, member })) } catch { /* storage unavailable */ }
}


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

  // One lookup per email at a time — getSession and the auth listener both ask at startup
  const inflight = useRef({ email: null, promise: null })

  function fetchMember(email) {
    if (!email) { setMember(null); return Promise.resolve() }
    const normalizedEmail = String(email).trim().toLowerCase()
    if (inflight.current.email === normalizedEmail && inflight.current.promise) return inflight.current.promise
    const promise = supabase
      .from('team_members')
      .select('id, short_name, full_name, avatar_url')
      .ilike('email', normalizedEmail)
      .single()
      .then(({ data }) => {
        setMember(data || null)
        saveCachedMember(normalizedEmail, data || null)
      })
      .finally(() => { inflight.current = { email: null, promise: null } })
    inflight.current = { email: normalizedEmail, promise }
    return promise
  }

  // Draw the app straight away with the member remembered on this device, and
  // refresh it in the background; only a first login waits for the lookup.
  function onSession(session) {
    const u = session?.user ?? null
    setUser(u)
    const cached = u?.email ? readCachedMember(u.email) : undefined
    if (cached !== undefined) {
      setMember(cached)
      setLoading(false)
      fetchMember(u.email)
    } else {
      fetchMember(u?.email).finally(() => setLoading(false))
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => onSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => onSession(session))
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- set up once at startup

  const authDisplayName = getAuthDisplayName(user)
  const fullName  = member?.full_name || authDisplayName || user?.email?.split('@')[0] || 'User'
  const firstName = member?.short_name || fullName.split(' ')[0]
  const avatarUrl = member?.avatar_url || null
  const memberId  = member?.id || null
  const isZairul = user?.email === ADMIN_EMAIL

  return (
    <AuthContext.Provider value={{ user, loading, fullName, firstName, avatarUrl, memberId, isZairul }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
