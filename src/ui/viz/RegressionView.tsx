import { useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { MathModel } from '../../core/types'
import { fitPoly, pearson, t975 } from '../../core/engine/stats'
import { parseTable } from '../../core/analyzer'
import { Btn, Eq, Label, cx } from '../common'
import { ChartFrame, fmt } from './shared'
import type { Working } from './../models/working'
import { useStore } from '../../store/store'
import { tr } from '../../core/text'

export default function RegressionView({ model, w }: { model: MathModel; w: Working }) {
  const lang = useStore((st) => st.ui.lang)
  const L = (en: string, es: string) => tr(lang, en, es)
  const spec = w.spec.kind === 'regression' ? w.spec : (model.spec as Extract<MathModel['spec'], { kind: 'regression' }>)
  const fit = fitPoly(spec.x, spec.y, spec.degree)
  const [showBand, setShowBand] = useState(true)
  const [predX, setPredX] = useState<string>('')
  const [paste, setPaste] = useState('')
  const [pasteErr, setPasteErr] = useState('')
  const xs = spec.x, lo = Math.min(...xs), hi = Math.max(...xs)
  const pad = (hi - lo) * 0.04
  const grid = fit.ok ? Array.from({ length: 80 }, (_, i) => {
    const x = lo - pad + ((hi - lo + 2 * pad) * i) / 79
    const { ci, pi } = fit.intervals(x), m = fit.predict(x)
    return { x, fit: m, ci: [m - ci, m + ci] as [number, number], pi: [m - pi, m + pi] as [number, number] }
  }) : []
  const pts = spec.x.map((x, i) => ({ x, y: spec.y[i] }))
  const px = parseFloat(predX)
  const pred = fit.ok && Number.isFinite(px) ? { m: fit.predict(px), ...fit.intervals(px), out: px < lo || px > hi } : null
  const r = pearson(spec.x, spec.y)
  const tex = fit.ok ? `\\hat y = ${fit.coef.map((c, k) => `${k ? (c < 0 ? '-' : '+') : ''}${fmt(Math.abs(c) * (k === 0 && c < 0 ? -1 : 1), 3)}${k === 1 ? 'x' : k === 2 ? 'x^2' : ''}`).join(' ')}` : ''
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>{model.equations[0]?.label ?? L('Fit', 'Ajuste')}</Label>
          <div role="group" aria-label={L('Polynomial degree', 'Grado del polinomio')} className="-mt-1 flex rounded-lg border border-line p-0.5">
            {([1, 2] as const).map((d) => (
              <button key={d} aria-pressed={spec.degree === d} onClick={() => w.setSpec({ ...spec, degree: d })} className={cx('h-8 rounded-md px-3 text-[13px] font-medium', spec.degree === d ? 'bg-accent-soft text-accent' : 'text-mute hover:text-ink')}>{d === 1 ? L('Linear', 'Lineal') : L('Quadratic', 'Cuadrático')}</button>
            ))}
          </div>
        </div>
        {model.equations[0]?.latex && <div className="serif overflow-x-auto text-[17px]"><Eq latex={model.equations[0].latex} /></div>}
        {fit.ok && <div className="serif overflow-x-auto text-[17px] text-accent"><Eq latex={tex} /></div>}
      </section>
      {fit.ok ? (
        <>
          <ChartFrame title={`${spec.yLabel} vs ${spec.xLabel}`} caption={`${spec.x.length} ${L('observations. Darker band: 95% confidence interval of the mean. Lighter band: 95% prediction interval for a new observation.', 'observaciones. Banda oscura: intervalo de confianza del 95% de la media. Banda clara: intervalo de predicción del 95% para una observación nueva.')} ${model.isDemo ? L('DEMO DATA (synthetic).', 'DATOS DEMO (sintéticos).') : ''}`}>
            <ResponsiveContainer>
              <ComposedChart data={grid} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" />
                <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmt(v, 3)} label={{ value: spec.xLabel, position: 'insideBottom', offset: -10, fontSize: 11 }} />
                <YAxis width={44} domain={['auto', 'auto']} tickFormatter={(v) => fmt(v, 2)} />
                <Tooltip formatter={(v) => (Array.isArray(v) ? `${fmt(Number(v[0]))} – ${fmt(Number(v[1]))}` : fmt(Number(v)))} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12 }} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                {showBand && <Area name={L('95% prediction interval', 'Intervalo de predicción 95%')} dataKey="pi" stroke="none" fill="var(--s2)" fillOpacity={0.12} isAnimationActive={false} />}
                {showBand && <Area name={L('95% confidence interval', 'Intervalo de confianza 95%')} dataKey="ci" stroke="none" fill="var(--s2)" fillOpacity={0.26} isAnimationActive={false} />}
                <Line name={L('Fitted curve', 'Curva ajustada')} dataKey="fit" stroke="var(--s2)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                <Scatter name={L('Observations', 'Observaciones')} data={pts} dataKey="y" fill="var(--s1)" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={showBand} onChange={(e) => setShowBand(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" /> {L('Show uncertainty bands', 'Mostrar bandas de incertidumbre')}</label>
            <span className="text-mute">Pearson r = {fmt(r, 3)}</span>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-line bg-surface p-4">
              <Label>{L('Estimates', 'Estimaciones')}</Label>
              <table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-mute"><th className="font-medium">{L('Coef.', 'Coef.')}</th><th className="text-right font-medium">{L('Value', 'Valor')}</th><th className="text-right font-medium">{L('Std. err.', 'Err. est.')}</th><th className="text-right font-medium">{L('95% CI', 'IC 95%')}</th></tr></thead>
                <tbody>{fit.coef.map((c, k) => (
                  <tr key={k} className="border-t border-line"><td className="py-1.5 font-mono">β{k}</td><td className="text-right font-mono">{fmt(c, 4)}</td><td className="text-right font-mono">{fmt(fit.se[k], 3)}</td><td className="text-right font-mono text-[12px]">[{fmt(c - t975(fit.df) * fit.se[k], 3)}, {fmt(c + t975(fit.df) * fit.se[k], 3)}]</td></tr>
                ))}</tbody></table>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                <dt className="text-mute">R²</dt><dd className="text-right font-mono">{fmt(fit.r2, 3)}</dd>
                <dt className="text-mute">{L('Adjusted R²', 'R² ajustado')}</dt><dd className="text-right font-mono">{fmt(fit.adjR2, 3)}</dd>
                <dt className="text-mute">{L('Residual std. error', 'Error estándar residual')}</dt><dd className="text-right font-mono">{fmt(fit.sigma, 3)}</dd>
                <dt className="text-mute">{L('Degrees of freedom', 'Grados de libertad')}</dt><dd className="text-right font-mono">{fit.df}</dd>
              </dl>
              <p className="mt-3 text-xs text-mute">{L('Intervals assume independent, homoscedastic Gaussian errors. R² describes this sample only; it is neither validation nor evidence of causation.', 'Los intervalos suponen errores gaussianos, independientes y con varianza constante. R² describe solo esta muestra; no es validación ni evidencia de causalidad.')}</p>
            </section>
            <section className="rounded-xl border border-line bg-surface p-4">
              <Label>{L('Predict', 'Predecir')}</Label>
              <label className="mb-2 flex items-center gap-2 text-[13px]">{spec.xLabel}
                <input value={predX} onChange={(e) => setPredX(e.target.value)} inputMode="decimal" placeholder={fmt((lo + hi) / 2, 3)} aria-label={L('Value to predict at', 'Valor a predecir')} className="h-9 w-28 rounded-lg border border-line bg-bg px-2 font-mono text-sm outline-none focus:border-accent" />
              </label>
              {pred ? (
                <div className="text-[13px]" aria-live="polite">
                  <div className="serif text-2xl">{fmt(pred.m, 3)} <span className="text-sm text-mute">{spec.yLabel}</span></div>
                  <div className="mt-1 text-mute">{L('Mean 95% CI', 'IC 95% de la media')}: [{fmt(pred.m - pred.ci, 3)}, {fmt(pred.m + pred.ci, 3)}]</div>
                  <div className="text-mute">{L('New-observation 95% PI', 'IP 95% de una observación nueva')}: [{fmt(pred.m - pred.pi, 3)}, {fmt(pred.m + pred.pi, 3)}]</div>
                  {pred.out && <div className="mt-2 rounded-md bg-[rgb(var(--warn)/.12)] p-2 text-warn">{L('Outside the observed range', 'Fuera del rango observado')} ({fmt(lo)}–{fmt(hi)}): {L('extrapolation is unreliable.', 'extrapolar no es confiable.')}</div>}
                </div>
              ) : <p className="text-[13px] text-mute">{L('Enter a value to get a prediction with its uncertainty.', 'Ingresá un valor para obtener una predicción con su incertidumbre.')}</p>}
            </section>
          </div>
          <ChartFrame title={L('Residuals', 'Residuos')} caption={L('Look for structure. A visible curve or funnel means the model form or the constant-variance assumption is wrong.', 'Buscá patrones. Una curva o un embudo visible significa que la forma del modelo o el supuesto de varianza constante es incorrecto.')}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" />
                <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} name={spec.xLabel} tickFormatter={(v) => fmt(v, 3)} />
                <YAxis dataKey="r" width={44} name={L('residual', 'residuo')} tickFormatter={(v) => fmt(v, 2)} />
                <ReferenceLine y={0} stroke="rgb(var(--mute))" strokeDasharray="4 4" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v) => fmt(Number(v))} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12 }} />
                <Scatter data={spec.x.map((x, i) => ({ x, r: fit.residuals[i] }))} fill="var(--s4)" isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartFrame>
        </>
      ) : <div role="alert" className="rounded-xl border border-bad p-4 text-sm text-bad">{fit.error}</div>}
      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">{L('Edit data', 'Editar datos')} ({spec.x.length} {L('rows', 'filas')})</summary>
        <p className="mt-2 text-xs text-mute">{L('Paste two columns (x, y) separated by comma, tab or space. This replaces the dataset of the working copy; save to keep it.', 'Pegá dos columnas (x, y) separadas por coma, tabulación o espacio. Esto reemplaza los datos de la copia de trabajo; guardá para conservarlo.')}</p>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} aria-label={L('Paste data', 'Pegar datos')} placeholder={'rainfall,yield\n300,3.1\n410,4.0'} className="mt-2 w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent" />
        <div className="mt-2 flex items-center gap-2">
          <Btn size="sm" variant="outline" onClick={() => { const d = parseTable(paste); if (!d) { setPasteErr(L('Need at least 6 numeric rows with two columns.', 'Hacen falta al menos 6 filas numéricas con dos columnas.')); return } setPasteErr(''); w.setSpec({ ...spec, x: d.x, y: d.y, xLabel: d.xLabel, yLabel: d.yLabel }) }}>{L('Replace dataset', 'Reemplazar datos')}</Btn>
          {pasteErr && <span role="alert" className="text-xs text-bad">{pasteErr}</span>}
        </div>
      </details>
    </div>
  )
}
