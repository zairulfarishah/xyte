import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Click-to-pin map for the site forms. Loaded lazily (see LazyLocationPicker) so
// the map library only downloads when a form with a map is opened.
function ClickHandler({ onPick }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

export default function LocationPicker({ lat, lng, onPick, mapKey, height = 170 }) {
  const hasPin = lat !== '' && lat != null && lng !== '' && lng != null
  const center = hasPin ? [parseFloat(lat), parseFloat(lng)] : [3.139, 101.6869]
  return (
    <MapContainer key={mapKey} center={center} zoom={hasPin ? 13 : 10}
      style={{ height, borderRadius: '12px', cursor: 'crosshair' }} zoomControl={false} scrollWheelZoom>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" />
      <ClickHandler onPick={onPick} />
      {hasPin && <CircleMarker center={[parseFloat(lat), parseFloat(lng)]} radius={9}
        pathOptions={{ color: 'white', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }} />}
    </MapContainer>
  )
}
