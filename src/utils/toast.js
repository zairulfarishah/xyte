// App-wide toasts: call toast() from any page; <Toaster /> (components/Toaster.jsx) shows them.
const listeners = new Set()
let nextId = 1

export function subscribeToasts(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function toast(msg, { tone = 'ok', action = null, ms = 4000 } = {}) {
  const t = { id: nextId++, msg, tone, action, ms }
  listeners.forEach(fn => fn(t))
  return t.id
}

// Remove something from the screen straight away and only really delete it once the
// undo window closes. Closing the tab before then still carries the delete out.
const pending = new Set()
export function undoableDelete({ label, hide, restore, commit, ms = 6000 }) {
  hide()
  let done = false
  const run = async () => {
    if (done) return
    done = true
    pending.delete(run)
    try { await commit() } catch (err) {
      restore()
      toast(`Couldn't delete: ${err.message}`, { tone: 'err', ms: 7000 })
    }
  }
  const timer = setTimeout(run, ms)
  pending.add(run)
  toast(`Deleted ${label}`, {
    ms,
    action: { label: 'Undo', fn: () => { if (done) return; done = true; clearTimeout(timer); pending.delete(run); restore() } },
  })
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => pending.forEach(run => run()))
