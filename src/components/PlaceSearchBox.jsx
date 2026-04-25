import { useEffect, useState } from 'react'
import { Search, MapPin } from 'lucide-react'
import { searchPlaces } from '../utils/geocoding'

export default function PlaceSearchBox({
  value,
  onChange,
  onSelect,
  placeholder = 'Search location...',
  countrycodes = 'my',
}) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!value) {
      setResults([])
      setError('')
    }
  }, [value])

  async function handleSearch() {
    if (String(value || '').trim().length < 3) {
      setError('Type at least 3 characters to search.')
      setResults([])
      return
    }

    setLoading(true)
    setError('')

    try {
      const places = await searchPlaces(value, { countrycodes })
      setResults(places)
      if (places.length === 0) setError('No matching locations found.')
    } catch {
      setResults([])
      setError('Unable to search locations right now.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSearch()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={value}
            placeholder={placeholder}
            onChange={event => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
              outline: 'none',
              background: 'white',
              color: '#0f172a',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          style={{
            border: 'none',
            borderRadius: '10px',
            background: '#0f172a',
            color: 'white',
            padding: '0 14px',
            fontSize: '12px',
            fontWeight: '700',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {error && (
        <p style={{ marginTop: '8px', fontSize: '11px', color: '#b45309' }}>{error}</p>
      )}

      {results.length > 0 && (
        <div
          style={{
            marginTop: '10px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            overflow: 'hidden',
          }}
        >
          {results.map(result => (
            <button
              key={result.id}
              type="button"
              onClick={() => {
                onSelect(result)
                setResults([])
                setError('')
              }}
              style={{
                width: '100%',
                border: 'none',
                background: 'white',
                padding: '11px 12px',
                textAlign: 'left',
                cursor: 'pointer',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <MapPin size={14} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span style={{ fontSize: '12px', color: '#334155', lineHeight: 1.5 }}>{result.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
