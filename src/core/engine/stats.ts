// Ordinary least squares for polynomial models (degree 1 or 2) with classical
// prediction/confidence intervals. Assumes independent, homoscedastic Gaussian errors —
// the UI states this next to the numbers.

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((r, i) => r[n] / r[i])
}

function invert(A: number[][]): number[][] | null {
  const n = A.length
  const cols: number[][] = []
  for (let j = 0; j < n; j++) {
    const e = Array(n).fill(0); e[j] = 1
    const s = solve(A, e)
    if (!s) return null
    cols.push(s)
  }
  return A.map((_, i) => cols.map((c) => c[i]))
}

/** Two-sided 95% Student-t quantile (Cornish–Fisher expansion; accurate to ~1e-3 for df>=3). */
export function t975(df: number): number {
  const table: Record<number, number> = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571 }
  if (df in table) return table[df]
  const z = 1.959964
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2)
}

export interface Fit {
  ok: true
  degree: 1 | 2
  coef: number[] // c0 + c1 x (+ c2 x^2)
  r2: number
  adjR2: number
  sigma: number // residual standard error
  df: number
  n: number
  se: number[]
  residuals: number[]
  fitted: number[]
  predict: (x: number) => number
  /** half-widths at x: confidence of the mean, and prediction interval for a new observation */
  intervals: (x: number) => { ci: number; pi: number }
}
export type FitResult = Fit | { ok: false; error: string }

export function fitPoly(x: number[], y: number[], degree: 1 | 2): FitResult {
  const n = x.length
  const p = degree + 1
  if (n !== y.length) return { ok: false, error: 'x and y must have the same length' }
  if (n < p + 2) return { ok: false, error: `Need at least ${p + 2} points for a degree-${degree} fit with uncertainty` }
  const row = (v: number) => Array.from({ length: p }, (_, k) => v ** k)
  const X = x.map(row)
  const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)))
  const Xty = Array.from({ length: p }, (_, i) => X.reduce((s, r, k) => s + r[i] * y[k], 0))
  const coef = solve(XtX, Xty)
  const inv = invert(XtX)
  if (!coef || !inv) return { ok: false, error: 'Singular design matrix (x values are not varied enough)' }
  const predict = (v: number) => row(v).reduce((s, r, k) => s + r * coef[k], 0)
  const fitted = x.map(predict)
  const residuals = y.map((v, i) => v - fitted[i])
  const ybar = y.reduce((s, v) => s + v, 0) / n
  const sse = residuals.reduce((s, r) => s + r * r, 0)
  const sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0)
  const df = n - p
  const sigma2 = sse / df
  const r2 = sst === 0 ? 0 : 1 - sse / sst
  const quad = (v: number) => {
    const r = row(v)
    return r.reduce((s, ri, i) => s + ri * r.reduce((s2, rj, j) => s2 + inv[i][j] * rj, 0), 0)
  }
  const t = t975(df)
  return {
    ok: true, degree, coef, r2, adjR2: 1 - ((1 - r2) * (n - 1)) / df, sigma: Math.sqrt(sigma2), df, n,
    se: inv.map((r, i) => Math.sqrt(sigma2 * r[i])), residuals, fitted, predict,
    intervals: (v) => ({ ci: t * Math.sqrt(sigma2 * quad(v)), pi: t * Math.sqrt(sigma2 * (1 + quad(v))) }),
  }
}

/** Pearson correlation */
export function pearson(x: number[], y: number[]): number {
  const n = x.length
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2 }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
}

/** Small seeded PRNG so demo datasets are reproducible. */
export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12), v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
