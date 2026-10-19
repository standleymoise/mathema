import type { OptimizationSpec } from '../types'

export interface LPSolution {
  feasible: boolean
  x: number
  y: number
  value: number
  vertices: { x: number; y: number }[]
  binding: string[]
  error?: string
}

/** Exact 2-variable LP (maximize cx*x+cy*y, a*x+b*y<=rhs, x,y>=0) by vertex enumeration. */
export function solveLP(spec: OptimizationSpec): LPSolution {
  const lines = [
    ...spec.constraints.map((c) => ({ id: c.label, a: c.a, b: c.b, c: c.rhs })),
    { id: `${spec.xName} ≥ 0`, a: -1, b: 0, c: 0 },
    { id: `${spec.yName} ≥ 0`, a: 0, b: -1, c: 0 },
  ]
  const eps = 1e-7
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const L1 = lines[i], L2 = lines[j]
      const det = L1.a * L2.b - L2.a * L1.b
      if (Math.abs(det) < 1e-12) continue
      const x = (L1.c * L2.b - L2.c * L1.b) / det
      const y = (L1.a * L2.c - L2.a * L1.c) / det
      if (lines.every((L) => L.a * x + L.b * y <= L.c + eps)) pts.push({ x, y })
    }
  if (!pts.length) return { feasible: false, x: 0, y: 0, value: 0, vertices: [], binding: [], error: 'No feasible region' }
  const val = (p: { x: number; y: number }) => spec.cx * p.x + spec.cy * p.y
  const best = pts.reduce((a, b) => (val(b) > val(a) + 1e-12 ? b : a))
  // detect unbounded: any ray direction increasing objective while feasible — check with large box
  const far = { x: best.x + 1e6, y: best.y + 1e6 }
  const unbounded = lines.every((L) => L.a * far.x + L.b * far.y <= L.c + eps) && (spec.cx > 0 || spec.cy > 0)
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const vertices = [...pts]
    .filter((p, i, a) => a.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) === i)
    .sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx))
  const binding = lines.filter((L) => Math.abs(L.a * best.x + L.b * best.y - L.c) < 1e-6).map((L) => L.id)
  return { feasible: true, x: best.x, y: best.y, value: val(best), vertices, binding, error: unbounded ? 'Objective is unbounded' : undefined }
}
