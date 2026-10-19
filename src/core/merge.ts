import type { DB } from './types'

/** Union by id; on conflict the most recently updated record wins. Used once when a device first signs in. */
export function mergeDB(a: DB, b: DB): DB {
  const union = <T extends { id: string }>(x: T[], y: T[], stamp: (t: T) => string): T[] => {
    const m = new Map<string, T>()
    for (const t of [...x, ...y]) { const cur = m.get(t.id); if (!cur || stamp(t) > stamp(cur)) m.set(t.id, t) }
    return [...m.values()]
  }
  return {
    schema: 1, seeded: a.seeded || b.seeded,
    models: union(a.models, b.models, (m) => m.updatedAt),
    conversations: union(a.conversations, b.conversations, (c) => c.updatedAt),
    sources: union(a.sources, b.sources, (s) => s.createdAt),
    relations: union(a.relations, b.relations, (r) => r.createdAt),
    experiments: union(a.experiments, b.experiments, (e) => e.createdAt),
  }
}
