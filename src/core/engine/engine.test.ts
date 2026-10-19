import { describe, expect, it } from 'vitest'
import { compile, parse, toLatex } from './expr'
import { integrate } from './ode'
import { fitPoly } from './stats'
import { solveLP } from './lp'
import { propagateSigns } from './runtime'

describe('expr', () => {
  it('evaluates with precedence and right-associative powers', () => {
    const c = compile('2 + 3*x^2^1 - -1')
    expect(c.ok && c.fn({ x: 2 })).toBe(15)
  })
  it('rejects unknown functions and junk, never evals', () => {
    expect(compile('alert(1)').ok).toBe(false)
    expect(compile('x; y').ok).toBe(false)
    expect(compile('toString(1)').ok).toBe(false) // prototype members are not functions
    const c = compile('constructor')
    expect(() => (c.ok ? c.fn({}) : 0)).toThrow() // ...nor variables
  })
  it('renders latex', () => {
    expect(toLatex('a*exp(-(x-b)^2/(2*s^2))')).toContain('\\frac')
    expect(parse('1+1').t).toBe('bin')
  })
})
describe('ode', () => {
  it('RK4 reproduces exponential decay', () => {
    const r = integrate({ states: [{ id: 'y', expr: '-k*y', init: '1' }], params: { k: 1 }, tEnd: 1 })
    expect(r.ok && r.series.y.at(-1)).toBeCloseTo(Math.exp(-1), 6)
  })
})
describe('stats', () => {
  it('recovers an exact line with zero-ish residual', () => {
    const x = [1, 2, 3, 4, 5, 6], y = x.map((v) => 2 + 3 * v + (v % 2 ? 0.01 : -0.01))
    const f = fitPoly(x, y, 1)
    expect(f.ok && f.coef[1]).toBeCloseTo(3, 1)
    expect(f.ok && f.r2).toBeGreaterThan(0.999)
  })
})
describe('lp', () => {
  it('solves a small LP exactly', () => {
    const s = solveLP({ kind: 'optimization', xName: 'x', yName: 'y', cx: 3, cy: 2, objectiveLabel: 'z',
      constraints: [{ id: 'a', label: 'a', a: 1, b: 1, rhs: 4 }, { id: 'b', label: 'b', a: 1, b: 0, rhs: 3 }] })
    expect(s.value).toBeCloseTo(11) // x=3,y=1
  })
})
describe('signs', () => {
  it('flags ambiguity when paths disagree', () => {
    const r = propagateSigns([{ from: 'a', to: 'b', sign: 1 }, { from: 'a', to: 'c', sign: -1 }, { from: 'b', to: 'd', sign: 1 }, { from: 'c', to: 'd', sign: 1 }], 'a', 1)
    expect(r.d).toBe('ambiguous')
    expect(r.c).toBe(-1)
  })
})
