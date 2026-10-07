import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle, X } from 'lucide-react'
import { subscribeToasts } from '../utils/toast'

// Mounted once in the app shell; shows whatever toast() sends
export default function Toaster() {
  const [toasts, setToasts] = useState([])

  useEffect(() => subscribeToasts(t => {
    setToasts(list => [...list, t])
    setTimeout(() => setToasts(list => list.filter(x => x.id !== t.id)), t.ms)
  }), [])

  const dismiss = id => setToasts(list => list.filter(x => x.id !== id))

  return (
    <div className="xt-toasts">
      {toasts.map(t => (
        <div key={t.id} className={`xt-toast ${t.tone}`}>
          {t.tone === 'err' || t.tone === 'warn' ? <AlertTriangle size={15} /> : <CheckCircle size={15} />}
          <span>{t.msg}</span>
          {t.action && <button className="act" onClick={() => { t.action.fn(); dismiss(t.id) }}>{t.action.label}</button>}
          <button className="x" onClick={() => dismiss(t.id)}><X size={13} /></button>
        </div>
      ))}
    </div>
  )
}
