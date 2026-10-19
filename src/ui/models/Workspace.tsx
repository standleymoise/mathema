import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Copy, PanelRight, Pencil, Save, Trash2, FlaskConical } from 'lucide-react'
import type { MathModel } from '../../core/types'
import { EXP_TYPE } from './Lists'
import { provLabel } from '../../core/analyzer'
import { sensitivity } from '../../core/engine/runtime'
import { Btn, Confirm, Disclosure, Label, PromptModal, ValidationBadge, cx } from '../common'
import { fmt } from '../viz/shared'
import FunctionView from '../viz/FunctionView'
import RegressionView from '../viz/RegressionView'
import DynamicView from '../viz/DynamicView'
import OptimizationView from '../viz/OptimizationView'
import GraphView from '../viz/GraphView'
import { useWorking, type Working } from './working'
import { models, records, toast, ui, useStore, useT } from '../../store/store'
import { tr } from '../../core/text'

const KIND_LABEL: Record<MathModel['kind'], [string, string]> = {
  function: ['Function', 'Función'], regression: ['Regression', 'Regresión'], dynamic: ['Dynamical system', 'Sistema dinámico'],
  optimization: ['Optimization', 'Optimización'], causal: ['Causal model', 'Modelo causal'], conceptual: ['Concept map', 'Mapa conceptual'],
}
export const kindLabel = (k: MathModel['kind'], lang: 'en' | 'es') => KIND_LABEL[k][lang === 'es' ? 1 : 0]

function Body({ model, w }: { model: MathModel; w: Working }) {
  switch (model.kind) {
    case 'function': return <FunctionView model={model} w={w} />
    case 'regression': return <RegressionView model={model} w={w} />
    case 'dynamic': return <DynamicView model={model} w={w} />
    case 'optimization': return <OptimizationView model={model} w={w} />
    default: return <GraphView model={model} w={w} />
  }
}

function SensitivityPanel({ model, w }: { model: MathModel; w: Working }) {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const live = { ...model, spec: w.spec }
  const sens = sensitivity(live, w.params, 0.2, lang)
  if (!sens || !sens.rows.length) return null
  const data = sens.rows.map((r) => ({ name: r.name, lowD: r.low - r.base, highD: r.high - r.base, swing: r.swing }))
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div><Label>{t('sensitivity')}</Label><p className="-mt-1 mb-2 text-xs text-mute">{tr(lang, `±${sens.pct * 100}% one parameter at a time → change in “${sens.metric.label}” (baseline ${fmt(sens.metric.value)}).`, `±${sens.pct * 100}% un parámetro a la vez → cambio en «${sens.metric.label}» (base ${fmt(sens.metric.value)}).`)}</p></div>
        <Btn size="sm" variant="outline" onClick={() => {
          records.addExperiment({ modelId: model.id, name: tr(lang, `Sensitivity ±${sens.pct * 100}% — ${model.title}`, `Sensibilidad ±${sens.pct * 100}% — ${model.title}`), type: 'sensitivity', provenance: 'simulated',
            rows: sens.rows.map((r) => ({ label: r.name, value: `${fmt(r.low)} → ${fmt(r.high)} (Δ ${fmt(r.swing)})` })), note: tr(lang, `One-at-a-time ±20% on "${sens.metric.label}". Simulated; ignores interactions.`, `Variación de ±20% de un parámetro a la vez sobre «${sens.metric.label}». Simulado; ignora interacciones.`) })
          toast(tr(lang, 'Saved to Experiments.', 'Guardado en Experimentos.'))
        }}><FlaskConical size={14} />{tr(lang, 'Save', 'Guardar')}</Btn>
      </div>
      <div style={{ height: 40 + data.length * 34 }} className="w-full min-w-0">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" stackOffset="sign" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => fmt(v, 2)} />
            <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="lowD" name="−20%" stackId="a" isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill="var(--s2)" />)}</Bar>
            <Bar dataKey="highD" name="+20%" stackId="a" isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill="var(--s1)" />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-mute">{tr(lang, 'Blue: parameter −20%. Orange: +20%. Interactions between parameters are not captured.', 'Azul: parámetro −20%. Naranja: +20%. No se capturan las interacciones entre parámetros.')}</p>
    </section>
  )
}

function Integrity({ model, w }: { model: MathModel; w: Working }) {
  const lang = useStore((s) => s.ui.lang)
  const L = (en: string, es: string) => tr(lang, en, es)
  const need: Record<MathModel['validation']['status'], string> = {
    unvalidated: L('Any observational data on the output variable, so the model can be compared with something real.', 'Cualquier dato observacional de la variable de salida, para comparar el modelo con algo real.'),
    'demo-data': L('Real measurements to replace the demo data; then re-fit and test on held-out observations.', 'Mediciones reales que reemplacen los datos demo; luego reajustar y probar con observaciones reservadas.'),
    'simulated-only': L('Observations over time to compare the simulated trajectory against.', 'Observaciones en el tiempo con las que comparar la trayectoria simulada.'),
    'fit-to-data': L('Out-of-sample data (new site, season or experiment) and checks for confounders.', 'Datos fuera de muestra (otro sitio, temporada o experimento) y control de variables de confusión.'),
    'empirically-validated': L('Replication in independent conditions.', 'Replicación en condiciones independientes.'),
  }
  return (
    <Disclosure title={L('Integrity & reproducibility', 'Integridad y reproducibilidad')}>
      <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-mute">
        <li><b className="text-ink">{L('Status', 'Estado')}:</b> {model.validation.notes}</li>
        <li><b className="text-ink">{L('To reproduce', 'Para reproducir')}:</b> {L('all numbers come from deterministic code in the browser (expression parser + RK4 / least squares / exact LP) using these values', 'todos los números provienen de código determinista en el navegador (parser de expresiones + RK4 / mínimos cuadrados / PL exacta) con estos valores')}: <span className="font-mono text-[12px]">{Object.entries(w.params).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}</span>.</li>
        <li><b className="text-ink">{L('Evidence that would raise confidence', 'Evidencia que aumentaría la confianza')}:</b> {need[model.validation.status]}</li>
        <li>{L('No confidence level is asserted for this model: none has been measured.', 'No se afirma ningún nivel de confianza para este modelo: no se ha medido ninguno.')}</li>
      </ul>
    </Disclosure>
  )
}

export default function Workspace({ model }: { model: MathModel }) {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const detailsOpen = useStore((s) => s.ui.detailsOpen)
  const w = useWorking(model, lang)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const exps = useStore((s) => s.db.experiments).filter((e) => e.modelId === model.id)
  return (
    <div className="fade-in mx-auto w-full max-w-4xl px-4 pb-10 pt-5 sm:px-6">
      <header className="mb-5">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
          <span className="rounded-full border border-line px-2 py-0.5 font-medium">{kindLabel(model.kind, lang)}</span>
          {model.isDemo && <span className="rounded-full bg-[rgb(var(--warn)/.14)] px-2 py-0.5 font-medium text-warn">{t('demoData')}</span>}
          <span>v{model.version}</span><ValidationBadge s={model.validation.status} />
        </div>
        <h1 className="serif text-[28px] leading-tight sm:text-4xl">{model.title}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-mute">{model.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Btn variant={w.dirty ? 'primary' : 'outline'} onClick={w.save} disabled={!w.dirty}><Save size={15} />{t('save')}</Btn>
          <Btn variant="ghost" onClick={() => setRenaming(true)}><Pencil size={15} />{t('rename')}</Btn>
          <Btn variant="ghost" onClick={() => models.duplicate(model.id)}><Copy size={15} />{t('duplicate')}</Btn>
          <Btn variant="ghost" onClick={() => setDeleting(true)}><Trash2 size={15} />{t('delete')}</Btn>
          <Btn variant="ghost" className={cx('ml-auto', detailsOpen && 'bg-sunk')} onClick={() => ui.setDetails(!detailsOpen)} aria-pressed={detailsOpen}><PanelRight size={15} /><span className="hidden sm:inline">{detailsOpen ? t('closePanel') : t('openPanel')}</span></Btn>
        </div>
        {w.dirty && <p className="mt-2 text-xs text-warn" role="status">{tr(lang, 'Unsaved experimentation changes. Saving creates a new version; the previous one stays in history.', 'Cambios de experimentación sin guardar. Guardar crea una nueva versión; la anterior queda en el historial.')}</p>}
      </header>
      <Body model={model} w={w} />
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4">
        <SensitivityPanel model={model} w={w} />
        {exps.length > 0 && (
          <section className="rounded-xl border border-line bg-surface p-4"><Label>{t('experiments')}</Label>
            <ul className="space-y-1 text-[13px]">{exps.slice(0, 4).map((e) => <li key={e.id} className="flex justify-between gap-3"><span>{e.name}</span><span className="text-mute">{tr(lang, ...(EXP_TYPE[e.type] ?? [e.type, e.type]))} · {provLabel(e.provenance, lang)}</span></li>)}</ul>
            <button className="mt-2 text-[13px] text-accent hover:underline" onClick={() => ui.setView('experiments')}>{tr(lang, 'All experiments', 'Todos los experimentos')} →</button>
          </section>
        )}
        <section className="rounded-xl border border-line bg-surface px-4"><Integrity model={model} w={w} /></section>
      </div>
      <PromptModal open={renaming} title={t('rename')} initial={model.title} onSubmit={(v) => models.rename(model.id, v)} onClose={() => setRenaming(false)} />
      <Confirm open={deleting} title={t('deleteTitle')} body={t('deleteBody')} onNo={() => setDeleting(false)} onYes={() => { setDeleting(false); models.remove(model.id) }} />
    </div>
  )
}
