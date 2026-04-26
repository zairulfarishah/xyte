import { useState } from 'react'
import { supabase } from '../supabase'

export default function LoginPage() {
  const [mode, setMode]         = useState('login') // 'login' | 'signup'
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [success, setSuccess]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      if (!fullName.trim()) { setError('Please enter your full name.'); setLoading(false); return }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (error) setError(error.message)
      else setSuccess('Account created! You can now sign in.')
    }
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none',
    background: 'white', color: '#0f172a', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 20% 10%, rgba(59,130,246,.25), transparent 30%), radial-gradient(circle at 80% 0%, rgba(14,165,233,.15), transparent 30%), linear-gradient(180deg, #071226 0%, #0f1f3d 100%)',
      padding: '16px',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', marginBottom: '32px' }}>
          <div style={{ width: '38px', height: '38px', background: '#2563eb', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '800', fontSize: '18px' }}>X</div>
          <span style={{ color: 'white', fontWeight: '800', fontSize: '22px', letterSpacing: '-0.03em' }}>Xyte</span>
        </div>

        {/* Card */}
        <div style={{ background: 'white', borderRadius: '20px', padding: '32px', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>
            {mode === 'login' ? 'Sign in to your Xyte account' : 'Enter your details to get started'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mode === 'signup' && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Full Name</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="e.g. Ahmad Farishah"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#2563eb'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  required
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Email</label>
              <input
                style={inputStyle}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={e => e.target.style.borderColor = '#2563eb'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Password</label>
              <input
                style={inputStyle}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={e => e.target.style.borderColor = '#2563eb'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                required
                minLength={6}
              />
            </div>

            {error && (
              <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#991b1b', fontWeight: '500' }}>
                {error}
              </div>
            )}

            {success && (
              <div style={{ background: '#dcfce7', border: '1px solid #4ade80', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#166534', fontWeight: '500' }}>
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '11px', background: loading ? '#93c5fd' : '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '4px', transition: 'background 0.15s' }}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
            {mode === 'login' ? (
              <>New to Xyte? <button onClick={() => { setMode('signup'); setError(null); setSuccess(null) }} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', cursor: 'pointer', fontSize: '13px', padding: 0 }}>Create an account</button></>
            ) : (
              <>Already have an account? <button onClick={() => { setMode('login'); setError(null); setSuccess(null) }} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', cursor: 'pointer', fontSize: '13px', padding: 0 }}>Sign in</button></>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '11px', marginTop: '20px' }}>
          Xyte · Xradar Internal System
        </p>
      </div>
    </div>
  )
}
