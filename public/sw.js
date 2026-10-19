/* MATHEMA service worker — deliberately conservative.
 *
 * Caches ONLY the static app shell so the app opens offline:
 *   - index.html (network-first: a fresh deploy is always picked up when online)
 *   - hashed /assets/* files (cache-first: the file name changes with every build, so they can never go stale)
 *   - manifest + icons (stale-while-revalidate)
 * It NEVER touches: /api/* (accounts, AI, sync, PayPal), non-GET requests, other origins, range requests,
 * or error responses. A new version waits until the user taps "Update" (no surprise reloads).
 */
const BUILD = '__BUILD_ID__' // replaced at build time (see vite.config.ts)
const CACHE = `mathema-${BUILD}`
const MAX_ASSETS = 80

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    const scope = self.registration.scope
    const index = await fetch(new URL('index.html', scope), { cache: 'reload' })
    if (!index.ok) throw new Error('index.html not available')
    const html = await index.clone().text()
    await cache.put(new URL('index.html', scope).href, index.clone())
    await cache.put(scope, index)
    const urls = new Set(['manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png'].map((u) => new URL(u, scope).href))
    for (const m of html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)) urls.add(new URL(m[1], scope).href) // JS/CSS referenced by this exact build
    await Promise.all([...urls].map(async (u) => { try { const r = await fetch(u, { cache: 'reload' }); if (r.ok) await cache.put(u, r) } catch { /* optional */ } }))
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('mathema-') && k !== CACHE) await caches.delete(k)
  })())
})

self.addEventListener('message', (event) => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting() })

const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MATHEMA</title><body style="font-family:system-ui;margin:12vh 1.5rem;line-height:1.5"><h1 style="font-weight:500">You are offline</h1><p>MATHEMA could not be loaded and nothing is cached on this device yet. Reconnect and open it once; after that it opens offline.</p>'

async function networkFirstNavigation(request) {
  const scope = self.registration.scope
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(request, { signal: ctrl.signal })
    clearTimeout(timer)
    // keep the freshest shell as the offline fallback, but only from a healthy response for the app root
    if (res.ok && res.type === 'basic' && new URL(request.url).origin === location.origin) {
      const cache = await caches.open(CACHE)
      cache.put(new URL('index.html', scope).href, res.clone())
    }
    return res // errors (e.g. a 500 diagnostic page) are shown as they are, never replaced by an old copy
  } catch {
    const cached = await caches.match(new URL('index.html', scope).href)
    return cached || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') {
    await cache.put(request, res.clone())
    const keys = await cache.keys()
    const assets = keys.filter((k) => k.url.includes('/assets/'))
    for (const k of assets.slice(0, Math.max(0, assets.length - MAX_ASSETS))) await cache.delete(k)
  }
  return res
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  const fresh = fetch(request).then((res) => { if (res.ok && res.type === 'basic') cache.put(request, res.clone()); return res }).catch(() => null)
  return hit || (await fresh) || new Response('', { status: 504 })
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return
  if (url.pathname.includes('/api/')) return // never cache or intercept the API
  if (req.mode === 'navigate') return event.respondWith(networkFirstNavigation(req))
  if (url.pathname.includes('/assets/')) return event.respondWith(cacheFirstAsset(req))
  if (/(manifest\.webmanifest|favicon\.svg|\/icons\/)/.test(url.pathname)) return event.respondWith(staleWhileRevalidate(req))
  // anything else: default network behaviour
})
