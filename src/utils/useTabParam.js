import { useSearchParams } from 'react-router-dom'

// Which tab is open lives in the URL (?tab=…), so refresh, back and shared links keep it.
export function useTabParam(keys, fallback) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab = keys.includes(raw) ? raw : fallback
  const setTab = key => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (key === fallback) next.delete('tab'); else next.set('tab', key)
    return next
  })
  return [tab, setTab]
}
