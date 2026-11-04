// Last data each page loaded, kept for the session. Coming back to a page draws
// it straight away from here while a fresh copy loads in the background, instead
// of showing a spinner on every visit. Cleared on sign-out.
const cache = new Map()

export function cachedPage(key) {
  return cache.get(key)
}

export function rememberPage(key, data) {
  cache.set(key, data)
}

export function clearPageCache() {
  cache.clear()
}
