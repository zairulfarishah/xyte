import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'

// PT Cable Mapper is a self-contained tool that lives in public/pt-mapper.html.
// It runs in a same-origin frame so it keeps its own layout, keeps work in this
// browser (localStorage) and downloads DXF / PDF / PNG / CSV files directly.
const SRC = '/pt-mapper.html'

export default function PtMapper() {
  const boxRef = useRef(null)
  const [height, setHeight] = useState(null)

  useEffect(() => {
    function fit() {
      const el = boxRef.current
      if (!el) return
      const main = el.closest('main')
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      setHeight(Math.max(480, window.innerHeight - el.getBoundingClientRect().top - bottom))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return (
    <div ref={boxRef} style={{ height: height ? `${height}px` : 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 12px', background: '#e7e9ea' }}>
        <a
          href={SRC}
          target="_blank"
          rel="noopener"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: '#475569', textDecoration: 'none' }}
        >
          Open in its own window <ExternalLink size={13} />
        </a>
      </div>
      <iframe
        src={SRC}
        title="PT Cable Mapper"
        style={{ flex: 1, width: '100%', border: 0, display: 'block', background: '#e7e9ea' }}
      />
    </div>
  )
}
