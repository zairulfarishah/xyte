import { lazy, Suspense } from 'react'

const LocationPicker = lazy(() => import('./LocationPicker'))

// Same as LocationPicker, but the map library loads only when this is shown
export default function LazyLocationPicker(props) {
  const height = props.height || 170
  return (
    <Suspense fallback={<div style={{ height, borderRadius: '12px', background: '#e2e8f0', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '12px' }}>Loading map…</div>}>
      <LocationPicker {...props} />
    </Suspense>
  )
}
