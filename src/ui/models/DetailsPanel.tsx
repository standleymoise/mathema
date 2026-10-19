import { RotateCcw, X } from 'lucide-react'
import type { MathModel } from '../../core/types'
import { Disclosure, Eq, IconBtn, ProvBadge, ValidationBadge } from '../common'
import { toLatex } from '../../core/engine/expr'
import { relationLabel } from '../../core/memory'
import { models, records, ui, useStore, useT } from '../../store/store'
import { CopyBtn } from '../viz/shared'
import { tr } from '../../core/text'

export default function DetailsPanel({ model, onClose }: { model: MathModel; onClose: () => void }) {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const db = useStore((s) => s.db)
  const rels = db.relations.filter((r) => r.status === 'accepted' && (r.from === model.id || r.to === model.id))
  const sources = db.sources.filter((s) => model.sourceIds.includes(s.id))
  return (
    <aside aria-label={t('details')} className="flex h-full w-full flex-col bg-surface">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
        <span className="text-sm font-medium">{t('details')}</span>
        <IconBtn label={t('closePanel')} onClick={onClose}><X size={18} /></IconBtn>
      </div>
      <div className="scroll min-h-0 flex-1 px-4 pb-8">
        <Disclosure title={t('summary')} defaultOpen>
          <p className="text-[13px] leading-relaxed text-mute">{model.description}</p>
          <p className="mt-2 text-[13px]"><b>{tr(lang, 'Method', 'Método')}:</b> <span className="text-mute">{model.method}</span></p>
          <p className="mt-1 text-[13px] text-mute">{model.methodRationale}</p>
          <p className="mt-2 text-[12px] text-mute"><b className="text-ink">{tr(lang, 'Original input', 'Entrada original')}:</b> “{model.originalInput.slice(0, 280)}{model.originalInput.length > 280 ? '…' : ''}”</p>
        </Disclosure>
        <Disclosure title={t('validation')} defaultOpen badge={<ValidationBadge s={model.validation.status} />}>
          <p className="text-[13px] text-mute">{model.validation.notes}</p>
        </Disclosure>
        <Disclosure title={`${t('variables')} (${model.variables.length})`}>
          <ul className="space-y-3">{model.variables.map((v) => (
            <li key={v.id} className="text-[13px]">
              <div className="flex flex-wrap items-baseline gap-x-2"><b>{v.name}</b><span className="font-mono text-[11px] text-mute">{v.symbol}</span><span className="text-[11px] text-mute">{v.role}</span></div>
              <div className="text-mute">{v.definition}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-mute">
                <span>{tr(lang, 'unit', 'unidad')}: {v.unit}</span>
                {v.value !== undefined && <span>{tr(lang, 'value', 'valor')}: <b className="font-mono text-ink">{v.value}</b></span>}
                {(v.min !== undefined || v.max !== undefined) && <span>{tr(lang, 'range', 'rango')}: [{v.min ?? '−∞'}, {v.max ?? '∞'}]</span>}
                <ProvBadge p={v.provenance} />
                {v.sourceId && <button className="text-accent hover:underline" onClick={() => ui.openSource(v.sourceId!)}>{tr(lang, 'source', 'fuente')} →</button>}
              </div>
            </li>))}</ul>
        </Disclosure>
        <Disclosure title={`${t('equations')} (${model.equations.length})`}>
          {model.equations.length === 0 && <p className="text-[13px] text-mute">—</p>}
          {model.equations.map((e) => { const tex = e.latex ?? (e.expr ? toLatex(e.expr) : null); return (
            <div key={e.id} className="mb-3">
              <div className="flex items-center justify-between"><span className="text-[13px] font-medium">{e.label}</span><div className="flex items-center gap-1"><ProvBadge p={e.provenance} />{e.expr && <CopyBtn text={e.expr} label={t('copy')} />}</div></div>
              {tex && <div className="overflow-x-auto"><Eq latex={tex} /></div>}
              {e.expr && <code className="block break-all rounded bg-sunk px-2 py-1 font-mono text-[11.5px]">{e.expr}</code>}
            </div>) })}
        </Disclosure>
        <Disclosure title={`${t('assumptions')} (${model.assumptions.length})`}>
          <ul className="space-y-2">{model.assumptions.map((a) => <li key={a.id} className="text-[13px] text-mute">{a.text} <ProvBadge p={a.provenance} /></li>)}</ul>
        </Disclosure>
        <Disclosure title={`${t('limitations')} (${model.limitations.length})`}>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-mute">{model.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
          {model.hypotheses.length > 0 && <><div className="mb-1 mt-3 text-[12px] font-semibold uppercase tracking-wide text-mute">{tr(lang, 'Open hypotheses', 'Hipótesis abiertas')}</div>
            <ul className="space-y-2 text-[13px] text-mute">{model.hypotheses.map((h) => <li key={h.id}>{h.text}<div className="text-[12px]">{tr(lang, 'Needs', 'Requiere')}: {h.needs}</div></li>)}</ul></>}
        </Disclosure>
        <Disclosure title={`${tr(lang, 'Sources', 'Fuentes')} (${sources.length})`}>
          {sources.length === 0 ? <p className="text-[13px] text-mute">{tr(lang, 'No sources attached. Claims in this model rest on the stated assumptions only.', 'Sin fuentes adjuntas. Las afirmaciones de este modelo se apoyan solo en los supuestos declarados.')}</p> :
            <ul className="space-y-2">{sources.map((s) => <li key={s.id}><button className="text-left text-[13px] text-accent hover:underline" onClick={() => ui.openSource(s.id)}>{s.title}</button><div className="text-[12px] text-mute">{s.kind}</div></li>)}</ul>}
        </Disclosure>
        <Disclosure title={`${t('related')} (${rels.length})`}>
          {rels.length === 0 ? <p className="text-[13px] text-mute">—</p> : <ul className="space-y-3">{rels.map((r) => { const other = r.from === model.id ? r.to : r.from; const om = db.models.find((m) => m.id === other); return (
            <li key={r.id} className="text-[13px]">
              <span className="text-mute">{r.from === model.id ? relationLabel(r.type, lang) : `← ${relationLabel(r.type, lang)}`}</span>{' '}
              {om ? <button className="font-medium text-accent hover:underline" onClick={() => ui.selectModel(om.id, { workspace: true })}>{om.title}</button> : other}
              <div className="text-[12px] text-mute">{r.justification}</div>
              <button className="mt-0.5 text-[12px] text-mute hover:text-bad hover:underline" onClick={() => records.removeRelation(r.id)}>{tr(lang, 'Remove link', 'Quitar vínculo')}</button>
            </li>) })}</ul>}
          <button className="mt-3 text-[13px] text-accent hover:underline" onClick={() => ui.openInUniverse(model.id)}>{tr(lang, 'Open in Knowledge Universe →', 'Abrir en Knowledge Universe →')}</button>
        </Disclosure>
        <Disclosure title={`${t('versions')} (${model.versions.length + 1})`}>
          <ul className="space-y-2.5 text-[13px]">
            <li><b>v{model.version}</b> <span className="text-mute">· {tr(lang, 'current', 'actual')} · {new Date(model.updatedAt).toLocaleString()}</span></li>
            {[...model.versions].reverse().map((v) => (
              <li key={v.version} className="flex items-start justify-between gap-2"><div><b>v{v.version}</b> <span className="text-mute">· {new Date(v.at).toLocaleString()}</span><div className="text-[12px] text-mute">{v.summary}</div></div>
                <IconBtn label={tr(lang, `Restore v${v.version}`, `Restaurar v${v.version}`)} className="h-8 w-8" onClick={() => models.restore(model.id, v.version)}><RotateCcw size={14} /></IconBtn></li>))}
          </ul>
        </Disclosure>
      </div>
    </aside>
  )
}
