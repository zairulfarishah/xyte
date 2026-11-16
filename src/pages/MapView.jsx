import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, Maximize2, Search, X, ArrowRight } from 'lucide-react'
import { supabase } from '../supabase'
import { cachedPage, rememberPage } from '../utils/pageCache'
import { searchPlaces } from '../utils/geocoding'
import SitesViewSwitch from '../components/SitesViewSwitch'
import { Page, PageHeader, Tabs, SearchInput, LoadingState } from '../components/ui'
import { siteCrew, sitePic } from '../utils/siteDays'
import 'leaflet/dist/leaflet.css'
import './MapView.css'

// Map view of the sites: navy header with status tabs, a site list on the left
// (click → the map flies there), a clean light map (or satellite) on the right.
// Classes prefixed mv-.

const STATUS = {
  ongoing:   { label: 'Ongoing',   color: '#16a36a' },
  upcoming:  { label: 'Upcoming',  color: '#e9a23b' },
  completed: { label: 'Completed', color: '#94a3b8' },
  postponed: { label: 'Postponed', color: '#b8c2d1' },
  cancelled: { label: 'Cancelled', color: '#dc4545' },
}
const colorOf = s => STATUS[s?.site_status]?.color || '#94a3b8'

const LIGHT = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
]
const SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const KL = [3.139, 101.6869]

const pinSvg = c => `<svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 37s13-12.4 13-22.6A13 13 0 0 0 2 14.4C2 24.6 15 37 15 37z" fill="${c}" stroke="#fff" stroke-width="2.5"/><circle cx="15" cy="14.5" r="5" fill="#fff"/></svg>`
const icons = {}
function pinIcon(color, selected) {
  const key = `${color}${selected ? '!' : ''}`
  icons[key] ||= L.divIcon({ html: `<div class="mv-pin${selected ? ' sel' : ''}">${pinSvg(color)}</div>`, className: '', iconSize: [30, 38], iconAnchor: [15, 37], tooltipAnchor: [0, -34] })
  return icons[key]
}
const placeIcon = L.divIcon({ html: '<div class="mv-pin place"><span></span></div>', className: '', iconSize: [22, 22], iconAnchor: [11, 11], tooltipAnchor: [0, -12] })

const STATES = ['selangor', 'kuala lumpur', 'wilayah persekutuan kuala lumpur', 'putrajaya', 'wilayah persekutuan putrajaya', 'johor', 'penang', 'pulau pinang', 'perak', 'pahang', 'negeri sembilan', 'melaka', 'malacca', 'kedah', 'kelantan', 'terengganu', 'perlis', 'sabah', 'sarawak', 'labuan']
const ROAD = /^(jalan|jln|lorong|persiaran|lebuh|lebuhraya|lingkaran|no\.?\s|lot\s)/i
// "Jalan X, Seksyen 7, 40000 Shah Alam, Selangor" → "Shah Alam"
function areaOf(location) {
  const parts = String(location || '').split(',').map(p => p.trim()).filter(p => p && !/^malaysia$/i.test(p))
    .map(p => p.replace(/^\d{5}\s+/, '')).filter(p => p && !/^\d{4,6}$/.test(p))
  if (!parts.length) return ''
  const last = parts[parts.length - 1].replace(/^Wilayah Persekutuan\s+/i, '')
  if (/^(kuala lumpur|putrajaya|labuan)$/i.test(last)) return last
  if (STATES.includes(parts[parts.length - 1].toLowerCase()) && parts.length > 1) {
    const city = parts[parts.length - 2]
    if (!ROAD.test(city) && !STATES.includes(city.toLowerCase())) return city
  }
  return last
}
const fmtDay = (d, withMonth = true) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' })
function dateRange(site) {
  const a = site.scheduled_date, b = site.end_date || a
  if (!a) return ''
  if (a === b) return fmtDay(a)
  return a.slice(0, 7) === b.slice(0, 7) ? `${fmtDay(a, false)}–${fmtDay(b)}` : `${fmtDay(a)} – ${fmtDay(b)}`
}
const hasPos = s => Number(s.latitude) && Number(s.longitude)
const posOf = s => [Number(s.latitude), Number(s.longitude)]

// Moves the map: fit all pins (on load, tab change, "Show all sites"), fly to a picked site or place
function MapMover({ points, fitKey, focus, onArrive }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 12)
    else if (points.length > 1) map.fitBounds(points, { padding: [60, 60], maxZoom: 13 })
  }, [fitKey, map]) // eslint-disable-line react-hooks/exhaustive-deps -- refit only on load, tab change or 'Show all sites'
  useEffect(() => {
    if (!focus) return undefined
    map.flyTo(focus.pos, focus.zoom, { duration: 0.8 })
    const done = () => onArrive?.(focus)
    map.once('moveend', done)
    return () => { map.off('moveend', done) }
  }, [focus, map]) // eslint-disable-line react-hooks/exhaustive-deps -- fly only when the target changes
  return null
}

// "Find a place or address" floating on the map
function PlaceFinder({ onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  async function go() {
    if (q.trim().length < 3) { setResults({ error: 'Type at least 3 characters.' }); return }
    setBusy(true)
    try {
      const places = await searchPlaces(q, { countrycodes: 'my' })
      setResults(places.length ? { places } : { error: 'No matching places found.' })
    } catch {
      setResults({ error: 'Place search is not available right now.' })
    }
    setBusy(false)
  }
  return (
    <div className="mv-find">
      <label className="mv-find-box">
        <MapPin size={15} />
        <input value={q} onChange={e => { setQ(e.target.value); if (!e.target.value) setResults(null) }} placeholder="Find a place or address…"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); go() } if (e.key === 'Escape') setResults(null) }} />
        {q && <button type="button" className="x" onClick={() => { setQ(''); setResults(null); onPick(null) }} aria-label="Clear"><X size={14} /></button>}
        <button type="button" className="go" onClick={go} disabled={busy} aria-label="Search">{busy ? '…' : <ArrowRight size={15} />}</button>
      </label>
      {results && (
        <div className="mv-find-res">
          {results.error && <p>{results.error}</p>}
          {results.places?.map(p => (
            <button key={`${p.latitude},${p.longitude}`} type="button" onClick={() => { onPick(p); setResults(null) }}>
              <MapPin size={14} /><span>{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MapView() {
  const navigate = useNavigate()
  const [sites, setSites] = useState(() => cachedPage('map') || [])
  const [loading, setLoading] = useState(() => !cachedPage('map'))
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [place, setPlace] = useState(null)
  const [layer, setLayer] = useState('map')
  const [fitTick, setFitTick] = useState(0)
  const [focus, setFocus] = useState(null) // { pos, zoom, id? }
  const markerRefs = useRef({})
  const [map, setMap] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('sites')
      .select('*, site_assignments(assignment_role, work_date, member_id, team_members(full_name, short_name))')
      .eq('is_hidden', false)
      .order('scheduled_date', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setSites(data || [])
        setLoading(false)
        if (data) rememberPage('map', data)
      })
    return () => { cancelled = true }
  }, [])

  const counts = useMemo(() => {
    const c = { all: sites.length }
    for (const k of Object.keys(STATUS)) c[k] = sites.filter(s => s.site_status === k).length
    return c
  }, [sites])

  const q = search.trim().toLowerCase()
  const filtered = sites
    .filter(s => tab === 'all' || s.site_status === tab)
    .filter(s => !q || String(s.site_name || '').toLowerCase().includes(q) || String(s.location || '').toLowerCase().includes(q) || String(s.client_company_name || '').toLowerCase().includes(q))
  const onMap = filtered.filter(hasPos)
  const points = onMap.map(posOf)
  const noLocation = sites.filter(s => !hasPos(s)).length

  function pick(site) {
    if (!hasPos(site)) return
    setSelectedId(site.id)
    setFocus({ pos: posOf(site), zoom: 13, id: site.id })
    // phone / tablet: the list is under the map, so bring the map back into view
    if (window.innerWidth <= 1024) document.querySelector('.mv-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  function pickPlace(p) {
    setPlace(p)
    if (p) setFocus({ pos: [p.latitude, p.longitude], zoom: 15 })
  }
  const arrive = f => { if (f.id) markerRefs.current[f.id]?.openTooltip() }

  // keep the picked row in view when it's picked from the map (desktop, where the list scrolls by itself)
  useEffect(() => {
    if (selectedId && window.innerWidth > 1024) document.getElementById(`mv-row-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const tabs = [
    { key: 'all', label: 'All', count: counts.all },
    ...Object.entries(STATUS).map(([key, s]) => ({ key, label: <><i className="mv-dot" style={{ background: s.color }} />{s.label}</>, count: counts[key] })),
  ]

  return (
    <Page className="mv">
      <section className="x-hero">
        <PageHeader
          title="Map"
          subtitle={<><b>{sites.length - noLocation} site{sites.length - noLocation === 1 ? '' : 's'}</b> on the map{noLocation > 0 && ` · ${noLocation} without a location`}</>}
          actions={<SitesViewSwitch />}
        />
        <Tabs tabs={tabs} active={tab} onChange={t => { setTab(t); setSelectedId(null); setFitTick(n => n + 1) }} />
      </section>

      <div className="mv-body">
        <aside className="mv-side">
          <div className="mv-sq"><SearchInput value={search} onChange={setSearch} placeholder="Search sites…" /></div>
          <div className="mv-cnt"><span><b>{filtered.length}</b> site{filtered.length === 1 ? '' : 's'}</span><span>By date</span></div>
          <div className="mv-list">
            {loading
              ? <LoadingState rows={6} />
              : filtered.length === 0
                ? <p className="mv-empty"><Search size={18} />No sites match.</p>
                : filtered.map(site => {
                  const c = colorOf(site)
                  const located = hasPos(site)
                  return (
                    <button key={site.id} id={`mv-row-${site.id}`} type="button"
                      className={`mv-row${selectedId === site.id ? ' on' : ''}${located ? '' : ' nol'}`}
                      onClick={() => (selectedId === site.id ? navigate(`/sites/${site.id}`) : pick(site))}
                      title={located ? (selectedId === site.id ? 'Open site' : site.location || '') : 'No location yet — add one on the site page'}>
                      <span className="pin" style={{ background: `${c}1f`, color: c }}><MapPin size={15} fill="currentColor" stroke="#fff" strokeWidth={1.5} /></span>
                      <span className="t"><b>{site.site_name}</b><small>{located ? areaOf(site.location) || site.location : 'No location yet'}</small></span>
                      <span className="d">{dateRange(site)}</span>
                    </button>
                  )
                })}
          </div>
        </aside>

        <div className="mv-map">
          <MapContainer ref={setMap} center={KL} zoom={10} zoomControl={false} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            {layer === 'map'
              ? <>{LIGHT.map(url => <TileLayer key={url} url={url} maxNativeZoom={16} maxZoom={19} attribution="Esri" />)}</>
              : <TileLayer url={SATELLITE} maxZoom={19} attribution="Esri" />}
            <MapMover points={points} fitKey={`${tab}|${fitTick}|${loading}`} focus={focus} onArrive={arrive} />
            {onMap.map(site => {
              const pic = sitePic(site)?.team_members
              const crew = siteCrew(site).map(a => a.team_members).filter(Boolean)
              const s = STATUS[site.site_status]
              return (
                <Marker key={site.id} position={posOf(site)} icon={pinIcon(colorOf(site), selectedId === site.id)}
                  ref={el => { markerRefs.current[site.id] = el }}
                  zIndexOffset={selectedId === site.id ? 1000 : 0}
                  eventHandlers={{ click: () => (selectedId === site.id ? navigate(`/sites/${site.id}`) : setSelectedId(site.id)) }}>
                  <Tooltip direction="top" opacity={1} className="mv-tip">
                    <div className="h"><b>{site.site_name}</b>{s && <span style={{ background: `${s.color}22`, color: s.color }}>{s.label}</span>}</div>
                    <p>{[areaOf(site.location), dateRange(site)].filter(Boolean).join(' · ')}</p>
                    {pic || crew.length
                      ? <div className="crew">{pic && <><i /><b>{pic.short_name || pic.full_name}</b></>}{crew.length > 0 && `${pic ? ' · ' : ''}${crew.map(m => m.short_name || m.full_name?.split(' ')[0]).join(', ')}`}</div>
                      : <div className="crew none">No crew yet</div>}
                    {selectedId === site.id && <div className="open">Click the pin again to open</div>}
                  </Tooltip>
                </Marker>
              )
            })}
            {place && (
              <Marker position={[place.latitude, place.longitude]} icon={placeIcon}>
                <Tooltip direction="top" opacity={1} className="mv-tip" permanent><p className="place">{place.label}</p></Tooltip>
              </Marker>
            )}
          </MapContainer>

          <PlaceFinder onPick={pickPlace} />
          <div className="mv-zoom">
            <button type="button" onClick={() => map?.zoomIn()} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => map?.zoomOut()} aria-label="Zoom out">−</button>
          </div>
          <div className="mv-layer" role="group" aria-label="Map style">
            <button type="button" className={layer === 'map' ? 'on' : ''} onClick={() => setLayer('map')}>Map</button>
            <button type="button" className={layer === 'sat' ? 'on' : ''} onClick={() => setLayer('sat')}>Satellite</button>
          </div>
          {points.length > 0 && (
            <button type="button" className="mv-fit" onClick={() => { setSelectedId(null); setFitTick(n => n + 1) }}><Maximize2 size={14} />Show all sites</button>
          )}
        </div>
      </div>
    </Page>
  )
}

