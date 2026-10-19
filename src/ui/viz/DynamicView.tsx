import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MathModel } from '../../core/types'
import { runDynamic } from '../../core/engine/runtime'
import { ChartFrame, EquationEditor, SERIES, ScenarioPanel, ParamControls, fmt } from './shared'
import type { Working } from '../models/working'
import { useStore } from '../../store/store'
import { tr } from '../../core/text'

export default function DynamicView({ model, w }: { model: MathModel; w: Working }) {
  const lang = useStore((st) => st.ui.lang)
  const L = (en: string, es: string) => tr(lang, en, es)
  const spec = w.spec.kind === 'dynamic' ? w.spec : (model.spec as Extract<MathModel['spec'], { kind: 'dynamic' }>)
  const m2 = { ...model, spec }
  const cur = runDynamic(m2, w.params)
  const scen = model.scenarios.map((s) => runDynamic(m2, { ...w.params, ...s.params }))
  const first = spec.states[0]
  const known = [...Object.keys(w.params), 't', ...spec.states.map((s) => s.id)]
  const data = cur && cur.ok ? cur.t.map((t, i) => {
    const row: Record<string, number> = { t }
    spec.states.forEach((s) => (row[s.id] = cur.series[s.id][i]))
    scen.forEach((r, j) => { if (r && r.ok) row[`s${j}`] = r.series[first.id][i] })
    return row
  }) : []
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      {spec.states.map((s, i) => (
        <EquationEditor key={s.id} label={`d${s.id}/dt`} lhs={`\\frac{d${s.id}}{dt}`} expr={s.expr} knownVars={known}
          onChange={(e) => w.setSpec({ ...spec, states: spec.states.map((x, k) => (k === i ? { ...x, expr: e } : x)) })} />
      ))}
      {cur && cur.ok ? (
        <ChartFrame title={`${spec.yLabel} ${L('over time', 'a lo largo del tiempo')}`} caption={L('Numerical solution (RK4, fixed step) of the stated equations with the current parameters. Simulated output — not observed data.', 'Solución numérica (RK4, paso fijo) de las ecuaciones con los parámetros actuales. Resultado simulado — no son datos observados.')}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" type="number" domain={[0, spec.tEnd]} label={{ value: spec.tLabel, position: 'insideBottom', offset: -10, fontSize: 11 }} />
              <YAxis width={44} tickFormatter={(v) => fmt(v, 2)} />
              <Tooltip formatter={(v) => fmt(Number(v))} labelFormatter={(l) => `t = ${fmt(Number(l))}`} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12 }} />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
              {model.scenarios.map((s, j) => <Line key={s.id} name={s.name} dataKey={`s${j}`} stroke={SERIES[(j + 1) % SERIES.length]} strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} />)}
              {spec.states.map((s, i) => <Line key={s.id} name={`${s.label} (${L('current', 'actual')})`} dataKey={s.id} stroke={SERIES[i % SERIES.length]} strokeWidth={2.4} dot={false} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      ) : <div role="alert" className="rounded-xl border border-bad p-4 text-sm text-bad">{L('Cannot integrate', 'No se puede integrar')}: {cur && !cur.ok ? cur.error : L('unknown error', 'error desconocido')}</div>}
      <ParamControls model={model} params={w.params} base={w.base} onChange={w.setParam} onReset={w.reset} />
      <ScenarioPanel model={model} params={w.params} onApply={w.setParams} setName={() => {}} />
    </div>
  )
}
