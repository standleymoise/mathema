import { compile } from './expr'

export interface OdeInput {
  states: { id: string; expr: string; init: string }[]
  params: Record<string, number>
  tEnd: number
  steps?: number
}
export type OdeResult =
  | { ok: true; t: number[]; series: Record<string, number[]> }
  | { ok: false; error: string }

/** Classic fixed-step RK4. Deterministic and reproducible. */
export function integrate({ states, params, tEnd, steps = 240 }: OdeInput): OdeResult {
  const fns = states.map((s) => compile(s.expr))
  for (const f of fns) if (!f.ok) return { ok: false, error: f.error }
  const inits: number[] = []
  for (const s of states) {
    const c = compile(s.init)
    if (!c.ok) return { ok: false, error: c.error }
    try { inits.push(c.fn(params)) } catch (e) { return { ok: false, error: String(e) } }
  }
  const ids = states.map((s) => s.id)
  const f = (t: number, y: number[]) => {
    const scope: Record<string, number> = { ...params, t }
    ids.forEach((id, i) => (scope[id] = y[i]))
    return fns.map((c) => (c.ok ? c.fn(scope) : NaN))
  }
  const h = tEnd / steps
  let y = inits.slice()
  const t: number[] = [0]
  const series: Record<string, number[]> = Object.fromEntries(ids.map((id, i) => [id, [y[i]]]))
  try {
    for (let k = 0; k < steps; k++) {
      const tk = k * h
      const k1 = f(tk, y)
      const k2 = f(tk + h / 2, y.map((v, i) => v + (h / 2) * k1[i]))
      const k3 = f(tk + h / 2, y.map((v, i) => v + (h / 2) * k2[i]))
      const k4 = f(tk + h, y.map((v, i) => v + h * k3[i]))
      y = y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]))
      if (y.some((v) => !Number.isFinite(v))) return { ok: false, error: 'Solution diverged (non-finite value)' }
      t.push(+(tk + h).toFixed(10))
      ids.forEach((id, i) => series[id].push(y[i]))
    }
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) }
  }
  return { ok: true, t, series }
}
