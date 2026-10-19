// Bridges typed models to the numeric engine. Pure functions only: no React, no IA.
import type { MathModel, OptimizationSpec, Variable } from '../types'
import { compile } from './expr'
import { integrate } from './ode'
import { solveLP } from './lp'
import { fitPoly } from './stats'

export type Params = Record<string, number>

export function baseParams(m: MathModel): Params {
  const p: Params = {}
  for (const v of m.variables) if ((v.role === 'parameter' || v.role === 'input') && v.value !== undefined) p[v.symbol] = v.value
  return p
}
export const adjustable = (m: MathModel): Variable[] =>
  m.variables.filter((v) => (v.role === 'parameter' || v.role === 'input') && v.value !== undefined)

export function sampleFunction(m: MathModel, params: Params, n = 160, exprOverride?: string) {
  if (m.spec.kind !== 'function') return { ok: false as const, error: 'not a function model' }
  const spec = m.spec
  const c = compile(exprOverride ?? spec.expr)
  if (!c.ok) return { ok: false as const, error: c.error }
  const pts: { x: number; y: number }[] = []
  try {
    for (let i = 0; i <= n; i++) {
      const x = spec.xMin + ((spec.xMax - spec.xMin) * i) / n
      const y = c.fn({ ...params, [spec.xName]: x })
      pts.push({ x, y: Number.isFinite(y) ? y : NaN })
    }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
  }
  return { ok: true as const, pts }
}

export function runDynamic(m: MathModel, params: Params) {
  if (m.spec.kind !== 'dynamic') return null
  return integrate({ states: m.spec.states, params, tEnd: m.spec.tEnd })
}

export function optimizationWith(spec: OptimizationSpec, params: Params): OptimizationSpec {
  return {
    ...spec,
    cx: params.cx ?? spec.cx,
    cy: params.cy ?? spec.cy,
    constraints: spec.constraints.map((c) => ({ ...c, rhs: params[`rhs_${c.id}`] ?? c.rhs })),
  }
}

/** One scalar summary per model kind, used for sensitivity analysis. Returns null if undefined. */
export function metric(m: MathModel, params: Params): { label: string; value: number } | null {
  const spec = m.spec
  if (spec.kind === 'function') {
    const s = sampleFunction(m, params, 100)
    if (!s.ok) return null
    const ys = s.pts.map((p) => p.y).filter(Number.isFinite)
    return { label: `mean of ${spec.yLabel} over [${spec.xMin}, ${spec.xMax}]`, value: ys.reduce((a, b) => a + b, 0) / ys.length }
  }
  if (spec.kind === 'dynamic') {
    const r = integrate({ states: spec.states, params, tEnd: spec.tEnd, steps: 120 })
    if (!r.ok) return null
    const id = spec.states[0].id
    return { label: `${spec.states[0].label} at t = ${spec.tEnd}`, value: r.series[id][r.series[id].length - 1] }
  }
  if (spec.kind === 'optimization') {
    const s = solveLP(optimizationWith(spec, params))
    return s.feasible ? { label: `optimal ${spec.objectiveLabel}`, value: s.value } : null
  }
  if (spec.kind === 'regression') {
    const f = fitPoly(spec.x, spec.y, spec.degree)
    return f.ok ? { label: 'fitted slope at mean x', value: f.coef[1] + (f.degree === 2 ? 2 * f.coef[2] * (spec.x.reduce((a, b) => a + b, 0) / spec.x.length) : 0) } : null
  }
  return null
}

export interface SensitivityRow { symbol: string; name: string; low: number; high: number; base: number; swing: number }
/** One-at-a-time ±pct perturbation. Deterministic; says nothing about interactions. */
export function sensitivity(m: MathModel, params: Params, pct = 0.2) {
  const base = metric(m, params)
  if (!base) return null
  const rows: SensitivityRow[] = []
  for (const v of adjustable(m)) {
    const b = params[v.symbol]
    if (b === undefined || b === 0) continue
    const lo = metric(m, { ...params, [v.symbol]: b * (1 - pct) })
    const hi = metric(m, { ...params, [v.symbol]: b * (1 + pct) })
    if (!lo || !hi) continue
    rows.push({ symbol: v.symbol, name: v.name, low: lo.value, high: hi.value, base: base.value, swing: Math.abs(hi.value - lo.value) })
  }
  rows.sort((a, b) => b.swing - a.swing)
  return { metric: base, rows, pct }
}

/** Qualitative sign propagation on a signed graph from an intervention (+1 / -1) on one node. */
export function propagateSigns(
  edges: { from: string; to: string; sign: 1 | -1 | 0 }[],
  source: string,
  dir: 1 | -1,
): Record<string, 1 | -1 | 0 | 'ambiguous'> {
  const out: Record<string, 1 | -1 | 0 | 'ambiguous'> = { [source]: dir }
  const q = [source]
  let guard = 0
  while (q.length && guard++ < 500) {
    const cur = q.shift()!
    const cs = out[cur]
    if (cs === 'ambiguous' || cs === 0) continue
    for (const e of edges.filter((e) => e.from === cur)) {
      if (e.to === source) continue
      if (e.sign === 0) { if (out[e.to] === undefined) { out[e.to] = 'ambiguous'; q.push(e.to) } continue }
      const eff = (cs * e.sign) as 1 | -1
      if (out[e.to] === undefined) { out[e.to] = eff; q.push(e.to) }
      else if (out[e.to] !== eff && out[e.to] !== 'ambiguous') { out[e.to] = 'ambiguous'; q.push(e.to) }
    }
  }
  return out
}
