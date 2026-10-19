// Persistence seam. `LocalRepository` is the working demo-mode implementation (browser localStorage).
// A Supabase implementation can be dropped in behind the same interface; schema + RLS are in /supabase.
import type { DB } from '../core/types'
import { seedDB } from '../core/demo'

export interface Repository {
  id: string
  label: string
  load(): DB
  save(db: DB): void
  reset(): DB
}

const KEY = 'mathema:db:v1'

export const localRepository: Repository = {
  id: 'local', label: 'Browser storage (demo mode)',
  load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const db = JSON.parse(raw) as DB
        if (db.schema === 1 && Array.isArray(db.models)) return db
      }
    } catch { /* corrupted or blocked storage: fall through to seed */ }
    return seedDB()
  },
  save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* quota / private mode: state stays in memory */ }
  },
  reset() {
    const db = seedDB()
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore */ }
    return db
  },
}

export const supabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
export const repository: Repository = localRepository
