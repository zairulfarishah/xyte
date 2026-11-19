import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, MapPin, History, Crosshair } from 'lucide-react'
import { parseCoordinates, reverseGeocode, searchPlaces } from '../utils/geocoding'

// Location search:
//  - suggestions while typing (past sites instantly, then the map search after a short pause)
//  - Search / Enter runs the fuller search (two sources + simplified retries)
//  - pasting coordinates or a Google Maps link places the pin straight away
// `recent`: [{ label, latitude, longitude }] — locations already used on other sites

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export default function PlaceSearchBox({
  value,
  onChange,
  onSelect,
  placeholder = 'Search location...',
  countrycodes = 'my',
  recent = [],
}) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const typed = useRef(false)        // only type-ahead after the user types, not when a value is loaded
  const abort = useRef(null)
  const boxRef = useRef(null)

  const text = String(value || '').trim()
  const coords = parseCoordinates(text)

  // Past sites whose address contains every word typed
  const recentMatches = useMemo(() => {
    const words = norm(text).split(' ').filter(w => w.length > 1)
    if (!words.length) return []
    const seen = new Set()
    return recent
      .filter(r => r.label && r.latitude != null && r.longitude != null)
      .filter(r => { const n = norm(r.label); return words.every(w => n.includes(w)) })
      .filter(r => { const k = norm(r.label); if (seen.has(k)) return false; seen.add(k); return true })
      .slice(0, 3)
      .map((r, i) => ({ ...r, id: `r-${i}`, name: r.name || r.label.split(',')[0], recent: true }))
  }, [recent, text])

  async function run(quick) {
    if (text.length < 3) { if (!quick) setError('Type at least 3 characters to search.'); setResults([]); return }
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setLoading(true)
    if (!quick) setError('')
    try {
      const places = await searchPlaces(text, { countrycodes, quick, signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      setResults(places)
      setOpen(true)
      setActive(-1)
      if (!quick) setError(places.length === 0 && !recentMatches.length
        ? 'Not found. Try the building or area name only, paste a Google Maps link, or keep this text and click the map to drop the pin.'
        : '')
    } catch (err) {
      if (err?.name === 'AbortError') return
      setResults([])
      if (!quick) setError('Location search is not responding — check the connection, or click the map to drop the pin.')
    } finally {
      if (abort.current === ctrl) setLoading(false)
    }
  }

  // Type-ahead after a short pause
  useEffect(() => {
    if (!typed.current || coords || text.length < 3) return
    const t = setTimeout(() => run(true), 450)
    return () => clearTimeout(t)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close the list on an outside click
  useEffect(() => {
    const onDown = e => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const coordItem = coords ? [{ id: 'coords', coords: true, name: '', label: `Pin at ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`, ...coords }] : []
  const items = [...coordItem, ...recentMatches, ...results.filter(r => !recentMatches.some(m => Math.abs(m.latitude - r.latitude) < 0.0014 && Math.abs(m.longitude - r.longitude) < 0.0014))]

  async function pick(r) {
    typed.current = false
    if (r.coords) {
      // Pasted pin: look up its address so the location isn't just a link / numbers
      setLoading(true)
      const raw = text.startsWith('http') || /^-?\d/.test(text)
      let label = raw ? `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}` : text, name = ''
      try { const a = await reverseGeocode(r.latitude, r.longitude); if (a && raw) { label = a.label; name = a.name } } catch { /* keep the numbers */ }
      setLoading(false)
      onSelect({ ...r, label, name })
    } else onSelect(r)
    setResults([])
    setError('')
    setOpen(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && active >= 0 && items[active]) pick(items[active])
      else if (coords) pick(coordItem[0])
      else run(false)
    }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={value}
            placeholder={placeholder}
            onChange={e => {
              const v = e.target.value
              typed.current = true
              setOpen(true)
              if (v.trim().length < 3 || parseCoordinates(v)) { setResults([]); setError('') }
              onChange(v)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            style={{
              width: '100%', padding: '9px 12px 9px 36px', borderRadius: '10px', border: '1px solid #e2e8f0',
              fontSize: '13px', outline: 'none', background: 'white', color: '#0f172a', boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => (coords ? pick(coordItem[0]) : run(false))}
          disabled={loading}
          style={{
            border: 'none', borderRadius: '10px', background: '#0f172a', color: 'white', padding: '0 14px',
            fontSize: '12px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {error && <p style={{ marginTop: '8px', fontSize: '11px', color: '#b45309', lineHeight: 1.45 }}>{error}</p>}

      {open && items.length > 0 && (
        <div style={{ marginTop: '6px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#ffffff', overflow: 'hidden', boxShadow: '0 8px 20px -8px rgba(15,23,42,.18)' }}>
          {items.map((r, i) => {
            const Icon = r.coords ? Crosshair : r.recent ? History : MapPin
            return (
              <button
                key={r.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r)}
                style={{
                  width: '100%', border: 'none', background: i === active ? '#f1f5f9' : 'white', padding: '10px 12px',
                  textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'flex-start',
                }}
              >
                <Icon size={14} color={r.recent ? '#f07c1e' : '#2563eb'} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontSize: '12px', color: '#334155', lineHeight: 1.5 }}>
                  {r.label}
                  {r.recent && <small style={{ marginLeft: 6, color: '#f07c1e', fontWeight: 600 }}>used before</small>}
                  {r.approx && <small style={{ marginLeft: 6, color: '#b45309', fontWeight: 600 }}>nearest match — check the pin</small>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
