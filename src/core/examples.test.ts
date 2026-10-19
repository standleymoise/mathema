import { describe, expect, it } from 'vitest'
import { EXAMPLES, exampleModel } from './examples'
import { baseParams, metric } from './engine/runtime'
import { compile } from './engine/expr'
import { integrate } from './engine/ode'
import { solveLP } from './engine/lp'

describe('example gallery', () => {
  for (const lang of ['en', 'es'] as const) for (const e of EXAMPLES) {
    it(`${e.id} (${lang}) is a valid, runnable model`, () => {
      const m = exampleModel(e.id, lang)!
      expect(m).toBeTruthy(); expect(m.isDemo).toBe(true); expect(m.id).toBe(e.id)
      const p = baseParams(m)
      for (const eq of m.equations) if (eq.expr) expect(compile(eq.expr).ok).toBe(true)
      if (m.spec.kind === 'dynamic') {
        const r = integrate({ states: m.spec.states, params: p, tEnd: m.spec.tEnd, steps: 60 })
        expect(r.ok).toBe(true)
      } else if (m.spec.kind === 'optimization') {
        const sol = solveLP({ ...m.spec, cx: p.cx ?? m.spec.cx, cy: p.cy ?? m.spec.cy })
        expect(sol.feasible).toBe(true)
      } else if (m.spec.kind === 'function') {
        expect(metric(m, p)).toBeTruthy()
      }
      for (const v of m.variables) if (v.role === 'parameter') expect(v.min! <= v.value! && v.value! <= v.max!).toBe(true)
    })
  }
  it('has 5 explicit-math and 6 vague-idea examples', () => {
    expect(EXAMPLES.filter((e) => e.group === 'math')).toHaveLength(5)
    expect(EXAMPLES.filter((e) => e.group === 'idea')).toHaveLength(6)
  })
})

import { seedDB } from './demo'
import { localizeDemos } from './examples'
describe('demo localisation', () => {
  it('re-renders untouched demos in Spanish and keeps edited ones', () => {
    const db = seedDB('en')
    db.models[1] = { ...db.models[1], version: 2 }
    const es = localizeDemos(db, 'es')
    expect(es.models[0].title).toMatch(/Respuesta/)
    expect(es.models[1].title).toBe(db.models[1].title)
    expect(es.sources[0].title).toMatch(/Datos demo/)
    expect(localizeDemos(es, 'en').models[0].title).toMatch(/response/i)
  })
})
