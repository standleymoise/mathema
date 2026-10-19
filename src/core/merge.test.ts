import { describe, expect, it } from 'vitest'
import { mergeDB } from './merge'
import { seedDB } from './demo'

describe('mergeDB', () => {
  it('unions records by id and keeps the newer version on conflict', () => {
    const a = seedDB(), b = seedDB()
    a.models[0] = { ...a.models[0], title: 'Local newer', updatedAt: '2030-01-01T00:00:00.000Z' }
    b.models.push({ ...b.models[0], id: 'remote_only', title: 'R' })
    const m = mergeDB(a, b)
    expect(m.models.find((x) => x.id === a.models[0].id)!.title).toBe('Local newer')
    expect(m.models.some((x) => x.id === 'remote_only')).toBe(true)
    expect(m.models.length).toBe(a.models.length + 1)
  })
})
