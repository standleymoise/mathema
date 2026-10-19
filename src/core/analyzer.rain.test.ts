import { describe, expect, it } from 'vitest'
import { analyze } from './analyzer'

describe('local causal extraction', () => {
  it('splits clauses, keeps only claim endpoints as nodes, and gives a readable short title', () => {
    const a = analyze({ text: 'Más lluvia aumenta el rendimiento del cultivo, pero el calor excesivo reduce el rendimiento.', lang: 'es' })
    const spec = a.draft.spec as { nodes: { label: string }[]; edges: { sign: number }[] }
    expect(spec.edges.map((e) => e.sign).sort()).toEqual([-1, 1])
    expect(spec.nodes.length).toBeLessThanOrEqual(4)
    expect(a.title.length).toBeLessThanOrEqual(61)
    expect(a.title).not.toMatch(/excesi…/)
  })
})
