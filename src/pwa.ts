// PWA glue: service-worker registration with a user-controlled update, install prompt and online status.
import { useSyncExternalStore } from 'react'

interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
interface PwaState { updateReady: boolean; canInstall: boolean; installed: boolean; online: boolean; swSupported: boolean }

let state: PwaState = {
  updateReady: false, canInstall: false, online: typeof navigator === 'undefined' ? true : navigator.onLine,
  installed: typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true),
  swSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
}
const listeners = new Set<() => void>()
const set = (p: Partial<PwaState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()) }
export const usePwa = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => state)

let deferred: BIPEvent | null = null
let waiting: ServiceWorker | null = null
let updating = false

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null; set({ canInstall: false })
  return outcome === 'accepted'
}
export function applyUpdate() {
  if (!waiting) return location.reload()
  updating = true // only reload when the user asked for the update
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

export function initPwa(onOnline?: () => void) {
  window.addEventListener('online', () => { set({ online: true }); onOnline?.() })
  window.addEventListener('offline', () => set({ online: false }))
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; set({ canInstall: true }) })
  window.addEventListener('appinstalled', () => { deferred = null; set({ canInstall: false, installed: true }) })
  if (!import.meta.env.PROD || !state.swSupported) return // no service worker in development
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload() })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { updateViaCache: 'none' }).then((reg) => {
      const watch = (w: ServiceWorker | null) => w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; set({ updateReady: true }) } })
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; set({ updateReady: true }) }
      reg.addEventListener('updatefound', () => watch(reg.installing))
      const check = () => { void reg.update().catch(() => undefined) }
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
      setInterval(check, 60 * 60 * 1000)
    }).catch((e) => console.warn('[mathema] service worker not registered:', e))
  })
}

/** Escape hatch for any stale-version problem: drop the service worker and its caches, then reload from the network. Account data is untouched. */
export async function resetAppCache() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    for (const k of await caches.keys()) if (k.startsWith('mathema-')) await caches.delete(k)
  } catch { /* nothing to clear */ }
  location.reload()
}
