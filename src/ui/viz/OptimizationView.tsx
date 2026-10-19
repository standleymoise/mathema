import type { MathModel } from '../../core/types'
import { optimizationWith } from '../../core/engine/runtime'
import { solveLP } from '../../core/engine/lp'
import { Eq, Label } from '../common'
import { ChartFrame, ParamControls, ScenarioPanel, fmt } from './shared'
import type { Working } from '../models/working'
import { useStore } from '../../store/store'
import { tr } from '../../core/text'

export default function OptimizationView({ model, w }: { model: MathModel; w: Working }) {
  const lang = useStore((st) => st.ui.lang)
  const L = (en: string, es: string) => tr(lang, en, es)
  const base = model.spec as Extract<MathModel['spec'], { kind: 'optimization' }>
  const spec = optimizationWith(base, w.params)
  const sol = solveLP(spec)
  // plot window
  const xi = spec.constraints.filter((c) => c.a > 0).map((c) => c.rhs / c.a)
  const yi = spec.constraints.filter((c) => c.b > 0).map((c) => c.rhs / c.b)
  const X = Math.max(1, ...xi) * 1.12, Y = Math.max(1, ...yi) * 1.12
  const W = 560, H = 360, m = { l: 48, r: 14, t: 12, b: 40 }
  const sx = (x: number) => m.l + (x / X) * (W - m.l - m.r)
  const sy = (y: number) => H - m.b - (y / Y) * (H - m.t - m.b)
  const ticks = (max: number) => { const step = Math.pow(10, Math.floor(Math.log10(max / 4))) * ([1, 2, 5].find((k) => (max / (Math.pow(10, Math.floor(Math.log10(max / 4))) * k)) <= 6) ?? 10); return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step) }
  const colors = ['var(--s2)', 'var(--s5)', 'var(--s3)', 'var(--s4)']
  const lineEnds = (c: { a: number; b: number; rhs: number }) => {
    const pts: [number, number][] = []
    if (c.b !== 0) { pts.push([0, c.rhs / c.b]); pts.push([X, (c.rhs - c.a * X) / c.b]) } else { pts.push([c.rhs / c.a, 0]); pts.push([c.rhs / c.a, Y]) }
    return pts
  }
  // iso-profit line through optimum
  const iso = sol.feasible && (spec.cx !== 0 || spec.cy !== 0) ? (() => {
    const pts: [number, number][] = []
    if (spec.cy !== 0) { pts.push([0, sol.value / spec.cy]); pts.push([X, (sol.value - spec.cx * X) / spec.cy]) } else { pts.push([sol.value / spec.cx, 0]); pts.push([sol.value / spec.cx, Y]) }
    return pts
  })() : null
  const poly = sol.vertices.map((v) => `${sx(v.x)},${sy(v.y)}`).join(' ')
  const latex = `\\max\; ${fmt(spec.cx)}\\,x + ${fmt(spec.cy)}\\,y \\quad \\text{s.t.}\; ${spec.constraints.map((c) => `${fmt(c.a)}x + ${fmt(c.b)}y \\le ${fmt(c.rhs)}`).join(',\; ')},\; x,y \\ge 0`
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <section className="rounded-xl border border-line bg-surface p-4"><Label>{model.equations[0]?.label ?? L('Program', 'Programa')}</Label><div className="serif overflow-x-auto text-[17px]"><Eq latex={latex} /></div></section>
      <ChartFrame title={L('Feasible region and optimum', 'Región factible y óptimo')} caption={L('Exact solution by vertex enumeration. Dashed line: objective level through the optimum. Constraint coefficients are fixed by the model; objective values and limits are adjustable below.', 'Solución exacta por enumeración de vértices. Línea punteada: nivel del objetivo que pasa por el óptimo. Los coeficientes de las restricciones son fijos; los valores del objetivo y los límites se ajustan abajo.')}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={L(`Feasible region; optimum at ${spec.xName}=${fmt(sol.x)}, ${spec.yName}=${fmt(sol.y)}`, `Región factible; óptimo en ${spec.xName}=${fmt(sol.x)}, ${spec.yName}=${fmt(sol.y)}`)}>
          {ticks(X).map((v) => <g key={`x${v}`}><line x1={sx(v)} x2={sx(v)} y1={m.t} y2={H - m.b} stroke="var(--grid)" /><text x={sx(v)} y={H - m.b + 15} textAnchor="middle" className="recharts-text">{v}</text></g>)}
          {ticks(Y).map((v) => <g key={`y${v}`}><line y1={sy(v)} y2={sy(v)} x1={m.l} x2={W - m.r} stroke="var(--grid)" /><text x={m.l - 6} y={sy(v) + 4} textAnchor="end" className="recharts-text">{v}</text></g>)}
          <text x={(W + m.l) / 2} y={H - 6} textAnchor="middle" className="recharts-text">{spec.xName}</text>
          <text transform={`translate(12 ${H / 2}) rotate(-90)`} textAnchor="middle" className="recharts-text">{spec.yName}</text>
          {sol.feasible && <polygon points={poly} fill="var(--s2)" fillOpacity={0.14} stroke="var(--s2)" strokeWidth={1} />}
          {spec.constraints.map((c, i) => { const [a, b] = lineEnds(c); return <line key={c.id} x1={sx(a[0])} y1={sy(a[1])} x2={sx(b[0])} y2={sy(b[1])} stroke={colors[i % 4]} strokeWidth={1.8} /> })}
          {iso && <line x1={sx(iso[0][0])} y1={sy(iso[0][1])} x2={sx(iso[1][0])} y2={sy(iso[1][1])} stroke="var(--s1)" strokeWidth={1.8} strokeDasharray="6 5" />}
          {sol.vertices.map((v, i) => <circle key={i} cx={sx(v.x)} cy={sy(v.y)} r={3.2} fill="rgb(var(--surface))" stroke="rgb(var(--mute))" />)}
          {sol.feasible && <circle cx={sx(sol.x)} cy={sy(sol.y)} r={6.5} fill="var(--s1)" stroke="rgb(var(--surface))" strokeWidth={2} />}
        </svg>
      </ChartFrame>
      <section className="rounded-xl border border-line bg-surface p-4" aria-live="polite">
        <Label>{L('Optimum', 'Óptimo')}</Label>
        {sol.feasible ? (
          <>
            <div className="serif text-3xl">{fmt(sol.value, 5)} <span className="text-sm text-mute">{spec.objectiveLabel}</span></div>
            <div className="mt-1 text-[13px] text-mute">{spec.xName} = <b className="font-mono text-ink">{fmt(sol.x)}</b> · {spec.yName} = <b className="font-mono text-ink">{fmt(sol.y)}</b></div>
            <div className="mt-1 text-[13px] text-mute">{L('Binding limits', 'Límites que se agotan')}: {sol.binding.length ? sol.binding.join(', ') : L('none', 'ninguno')}</div>
            {sol.error && <div role="alert" className="mt-2 text-sm text-warn">{sol.error}</div>}
          </>
        ) : <div role="alert" className="text-sm text-bad">{sol.error}</div>}
        <p className="mt-2 text-xs text-mute">{L('A normative result: the best choice given the stated inputs. It is not an observation of real behaviour.', 'Un resultado normativo: la mejor opción con los datos indicados. No es una observación de comportamiento real.')}</p>
      </section>
      <ParamControls model={model} params={w.params} base={w.base} onChange={w.setParam} onReset={w.reset} />
      <ScenarioPanel model={model} params={w.params} onApply={w.setParams} setName={() => {}} />
    </div>
  )
}
