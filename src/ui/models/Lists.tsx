import { useMemo, useState } from 'react'
import { Copy, FlaskConical, Pencil, Trash2 } from 'lucide-react'
import type { MathModel } from '../../core/types'
import { Btn, Confirm, EmptyState, IconBtn, Label, PromptModal, ValidationBadge } from '../common'
import { kindLabel } from './Workspace'
import { models, records, toast, ui, useStore, useT } from '../../store/store'
import { sensitivity, baseParams } from '../../core/engine/runtime'
import { fmt } from '../viz/shared'
import { tr } from '../../core/text'

export function PageShell({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="scroll h-full"><div className="fade-in mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-6 flex items-end justify-between gap-4"><div><h1 className="serif text-3xl sm:text-4xl">{title}</h1>{sub && <p className="mt-1.5 max-w-xl text-[15px] text-mute">{sub}</p>}</div>{action}</div>
      {children}
    </div></div>
  )
}

export function ModelsView() {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const list = useStore((s) => s.db.models)
  const [filter, setFilter] = useState('')
  const [ren, setRen] = useState<MathModel | null>(null)
  const [del, setDel] = useState<MathModel | null>(null)
  const shown = useMemo(() => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter((m) => !filter || (m.title + m.description + m.concepts.join(' ')).toLowerCase().includes(filter.toLowerCase())), [list, filter])
  return (
    <PageShell title={t('myModels')} sub={tr(lang, 'Everything you have formalised, versioned and connected.', 'Todo lo que formalizaste, versionado y conectado.')} action={<Btn variant="primary" onClick={ui.newIdea}>{t('newIdea')}</Btn>}>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="mb-4 h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm outline-none focus:border-accent" />
      {shown.length === 0 ? <EmptyState title={list.length ? t('empty') : t('noModels')} action={<Btn variant="primary" onClick={ui.newIdea}>{t('newIdea')}</Btn>} /> : (
        <ul className="space-y-2.5">
          {shown.map((m) => (
            <li key={m.id} className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/40">
              <div className="flex items-start gap-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => ui.selectModel(m.id, { workspace: true })}>
                  <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute"><span className="rounded-full border border-line px-2 py-0.5 font-medium">{kindLabel(m.kind, lang)}</span>{m.isDemo && <span className="text-warn">{t('demoData')}</span>}<span>v{m.version}</span><ValidationBadge s={m.validation.status} /></div>
                  <div className="serif text-xl leading-snug">{m.title}</div>
                  <p className="mt-1 line-clamp-2 text-[13.5px] text-mute">{m.description}</p>
                </button>
                <div className="flex shrink-0 -mr-1.5 -mt-1.5">
                  <IconBtn label={t('rename')} onClick={() => setRen(m)}><Pencil size={16} /></IconBtn>
                  <IconBtn label={t('duplicate')} onClick={() => models.duplicate(m.id)}><Copy size={16} /></IconBtn>
                  <IconBtn label={t('delete')} onClick={() => setDel(m)}><Trash2 size={16} /></IconBtn>
                </div>
              </div>
            </li>))}
        </ul>)}
      <PromptModal open={!!ren} title={t('rename')} initial={ren?.title ?? ''} onSubmit={(v) => ren && models.rename(ren.id, v)} onClose={() => setRen(null)} />
      <Confirm open={!!del} title={t('deleteTitle')} body={t('deleteBody')} onNo={() => setDel(null)} onYes={() => { if (del) models.remove(del.id); setDel(null) }} />
    </PageShell>
  )
}

export function ExperimentsView() {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const db = useStore((s) => s.db)
  const [mid, setMid] = useState('')
  const run = () => {
    const m = db.models.find((x) => x.id === mid)
    if (!m) { toast(tr(lang, 'Choose a model first.', 'Elegí primero un modelo.'), 'warn'); return }
    const s = sensitivity(m, baseParams(m))
    if (!s || !s.rows.length) { toast(tr(lang, 'This model has no adjustable numeric parameters.', 'Este modelo no tiene parámetros numéricos ajustables.'), 'warn'); return }
    records.addExperiment({ modelId: m.id, name: `${tr(lang, 'Sensitivity', 'Sensibilidad')} ±20% — ${m.title}`, type: 'sensitivity', provenance: 'simulated', rows: s.rows.map((r) => ({ label: r.name, value: `${fmt(r.low)} → ${fmt(r.high)} (Δ ${fmt(r.swing)})` })), note: `One-at-a-time ±20% on "${s.metric.label}". Simulated; ignores interactions.` })
    toast(tr(lang, 'Experiment saved.', 'Experimento guardado.'))
  }
  return (
    <PageShell title={t('experiments')} sub={tr(lang, 'Scenario comparisons and sensitivity runs. All values are simulated model outputs, never observations.', 'Comparaciones de escenarios y análisis de sensibilidad. Todos los valores son salidas simuladas del modelo, nunca observaciones.')}>
      <section className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
        <select value={mid} onChange={(e) => setMid(e.target.value)} aria-label="Model" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm"><option value="">{tr(lang, 'Choose a model…', 'Elegí un modelo…')}</option>{db.models.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select>
        <Btn variant="primary" onClick={run}><FlaskConical size={15} />{tr(lang, 'Run sensitivity', 'Ejecutar sensibilidad')}</Btn>
      </section>
      {db.experiments.length === 0 ? <EmptyState title={t('empty')} hint={tr(lang, 'Run one above, or open a model workspace and save a scenario comparison.', 'Ejecutá uno arriba, o abrí el espacio de un modelo y guardá una comparación.')} /> : (
        <ul className="space-y-3">{db.experiments.map((e) => { const m = db.models.find((x) => x.id === e.modelId); return (
          <li key={e.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="serif text-lg">{e.name}</div><div className="text-xs text-mute">{e.type} · {e.provenance} · {new Date(e.createdAt).toLocaleDateString()}</div></div>
              <IconBtn label={t('delete')} className="-mr-2 -mt-1" onClick={() => records.removeExperiment(e.id)}><Trash2 size={16} /></IconBtn></div>
            <table className="mt-3 w-full text-[13px]"><tbody>{e.rows.map((r, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-3">{r.label}</td><td className="py-1.5 text-right font-mono text-[12.5px] text-mute">{r.value}</td></tr>)}</tbody></table>
            <p className="mt-2 text-xs text-mute">{e.note}</p>
            {m && <button className="mt-1 text-[13px] text-accent hover:underline" onClick={() => ui.selectModel(m.id, { workspace: true })}>{tr(lang, 'Open model', 'Abrir modelo')}: {m.title} →</button>}
          </li>) })}</ul>)}
    </PageShell>
  )
}

export { Label }
