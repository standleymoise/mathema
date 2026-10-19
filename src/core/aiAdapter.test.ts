import { describe, expect, it } from 'vitest'
import { AdapterError, proposalToAnalysis, type Proposal } from './aiAdapter'

const base = { topic: 't', centralQuestion: 'q', claim: 'c', method: 'm', methodRationale: 'r', concepts: ['a'], assumptions: ['x'], limitations: ['l'], hypotheses: [], formalizable: [], notFormalizable: [], dataAndAssumptions: [], experiments: [], missing: [] }
const meta = { provider: 'anthropic', model: 'claude-sonnet-5-5' }
const run = (p: Partial<Proposal>) => proposalToAnalysis({ ...base, kind: 'function', title: 'T', variables: [], equations: [], spec: {}, ...p } as Proposal, { text: 'idea', lang: 'en' }, meta)

describe('AI proposal adapter (trust boundary)', () => {
  it('accepts a valid function, labels everything as system hypothesis, never validated', () => {
    const a = run({ spec: { expr: 'a*x^2+b', xName: 'x', xMin: 0, xMax: 5, xLabel: 'x', yLabel: 'y' }, variables: [{ name: 'A', symbol: 'a', definition: '', unit: '-', role: 'parameter', value: 2, min: 0, max: 5 }, { name: 'B', symbol: 'b', definition: '', unit: '-', role: 'parameter', value: 1, min: 0, max: 5 }] })
    expect(a.draft.kind).toBe('function')
    expect(a.draft.variables.filter((v) => v.value !== undefined).every((v) => v.provenance === 'system-hypothesis')).toBe(true)
    expect(a.draft.validation.status).toBe('unvalidated')
    expect(a.engine).toBe('ai:anthropic/claude-sonnet-5-5')
    expect(a.draft.equations[0].expr).toBe('a*x^2+b')
  })
  it('rejects expressions with unknown variables or unsafe syntax', () => {
    expect(() => run({ spec: { expr: 'a*zzz', xName: 'x', xMin: 0, xMax: 5 }, variables: [{ name: 'A', symbol: 'a', definition: '', unit: '-', role: 'parameter', value: 2 }] })).toThrow(AdapterError)
    expect(() => run({ spec: { expr: 'process(1)', xName: 'x', xMin: 0, xMax: 5 } })).toThrow(AdapterError)
  })
  it('validates dynamics by integrating them, and rejects divergence', () => {
    const ok = { states: [{ id: 'S', label: 'S', expr: 'r*S*(1-S/K)', init: 'S0' }], tEnd: 40, tLabel: 't', yLabel: 'S' }
    const vars = [['r', 0.3], ['K', 100], ['S0', 5]].map(([symbol, value]) => ({ name: String(symbol), symbol: String(symbol), definition: '', unit: '-', role: 'parameter' as const, value: value as number }))
    expect(run({ kind: 'dynamic', spec: ok, variables: vars }).draft.kind).toBe('dynamic')
    expect(() => run({ kind: 'dynamic', spec: { ...ok, states: [{ id: 'S', label: 'S', expr: 'S*S*S', init: 'S0' }], tEnd: 1000 }, variables: vars })).toThrow(AdapterError)
  })
  it('rejects infeasible optimisation and lays out graphs', () => {
    expect(() => run({ kind: 'optimization', spec: { xName: 'x', yName: 'y', cx: 1, cy: 1, objectiveLabel: 'v', constraints: [{ id: 'a', label: 'A', a: 1, b: 1, rhs: 10 }, { id: 'b', label: 'B', a: 1, b: 0, rhs: 5 }] } })).not.toThrow()
    const g = run({ kind: 'causal', spec: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', sign: 1, note: '' }], gaps: [] } })
    expect(g.draft.spec.kind).toBe('causal')
    expect(g.draft.variables).toHaveLength(2)
  })
})
