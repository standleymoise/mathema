import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MathModel } from '../../core/types'
import { sampleFunction } from '../../core/engine/runtime'
import { ChartFrame, EquationEditor, SERIES, ScenarioPanel, ParamControls, fmt } from './shared'
import type { Working } from '../models/working'
import { useT } from '../../store/store'

export default function FunctionView({ model, w }: { model: MathModel; w: Working }) {
  const t = useT()
  const spec = w.spec.kind === 'function' ? w.spec : (model.spec as Extract<MathModel['spec'], { kind: 'function' }>)
  const cur = sampleFunction({ ...model, spec }, w.params, 120)
  const scen = model.scenarios.map((s) => sampleFunction({ ...model, spec }, { ...w.params, ...s.params }, 120))
  const known = [spec.xName, ...Object.keys(w.params)]
  const out = model.variables.find((v) => v.role === 'output')
  const data = cur.ok ? cur.pts.map((p, i) => {
    const row: Record<string, number> = { x: +p.x.toFixed(4), current: p.y }
    scen.forEach((s, j) => { if (s.ok) row[`s${j}`] = s.pts[i].y })
    return row
  }) : []
  const peak = cur.ok ? cur.pts.reduce((a, b) => (b.y > a.y ? b : a)) : null
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <EquationEditor label={model.equations[0]?.label ?? t('equations')} expr={spec.expr} knownVars={known} lhs={out?.symbol ?? 'y'}
        onChange={(e) => w.setSpec({ ...spec, expr: e })} />
      {cur.ok ? (
        <ChartFrame title={`${spec.yLabel} vs ${spec.xLabel}`} caption={peak ? `Peak of current curve: ${fmt(peak.y)} at ${spec.xName} = ${fmt(peak.x)}. Simulated from model parameters — not observed data.` : undefined}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="x" type="number" domain={[spec.xMin, spec.xMax]} tickFormatter={(v) => fmt(v, 2)} label={{ value: spec.xLabel, position: 'insideBottom', offset: -10, fontSize: 11 }} />
              <YAxis width={44} tickFormatter={(v) => fmt(v, 2)} />
              <Tooltip formatter={(v) => fmt(Number(v))} labelFormatter={(l) => `${spec.xName} = ${fmt(Number(l))}`} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12 }} />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
              {model.scenarios.map((s, j) => <Line key={s.id} name={s.name} dataKey={`s${j}`} stroke={SERIES[(j + 1) % SERIES.length]} strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} />)}
              <Line name="Current" dataKey="current" stroke={SERIES[0]} strokeWidth={2.4} dot={false} isAnimationActive={false} />
              {peak && <ReferenceDot x={+peak.x.toFixed(4)} y={peak.y} r={4} fill={SERIES[0]} stroke="rgb(var(--surface))" />}
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      ) : <div role="alert" className="rounded-xl border border-bad p-4 text-sm text-bad">Cannot evaluate: {cur.error}</div>}
      <ParamControls model={model} params={w.params} base={w.base} onChange={w.setParam} onReset={w.reset} />
      <ScenarioPanel model={model} params={w.params} onApply={w.setParams} setName={() => {}} />
    </div>
  )
}
