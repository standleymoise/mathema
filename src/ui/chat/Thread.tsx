import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Paperclip, X } from 'lucide-react'
import type { ChatMessage, Conversation, Formalization, MathModel, Proposal, RelationType } from '../../core/types'
import { Btn, Eq, Label, cx } from '../common'
import { buildFromMessage, resolveProposal, savePendingDraft, ui, useStore, useT } from '../../store/store'
import { RELATION_TYPES, relationLabel } from '../../core/memory'
import { toLatex } from '../../core/engine/expr'
import { tr } from '../../core/text'
import { kindLabel } from '../models/Workspace'

function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}</>
}

function FormalizationCard({ f, model }: { f: Formalization; model?: MathModel }) {
  const lang = useStore((s) => s.ui.lang)
  const L = (en: string, es: string) => tr(lang, en, es)
  const Sec = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <section className="grid grid-cols-[1.75rem_1fr] gap-x-2 py-3 first:pt-0 last:pb-0 border-t border-line first:border-t-0">
      <span className="serif pt-px text-lg leading-6 text-accent">{n}</span>
      <div className="min-w-0"><h4 className="mb-1 text-[13px] font-semibold">{title}</h4><div className="text-[13.5px] leading-relaxed text-mute">{children}</div></div>
    </section>
  )
  const ul = (items: string[]) => <ul className="list-disc space-y-1 pl-4">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-4">
      <Sec n={1} title={L('What the idea claims', 'Qué afirma la idea')}>“{f.claim}”</Sec>
      <Sec n={2} title={L('What can be formalised', 'Qué puede formalizarse')}>{ul(f.formalizable)}<div className="mt-2 font-medium text-ink/80">{L('What cannot (yet)', 'Qué no (todavía)')}</div>{ul(f.notFormalizable)}</Sec>
      <Sec n={3} title={L('Variables', 'Variables')}>
        <ul className="space-y-1">{f.variables.map((v, i) => <li key={i}><span className="font-medium text-ink">{v.name}</span> <span className={cx('rounded-full px-1.5 py-px text-[10.5px]', v.kind === 'explicit' ? 'bg-[rgb(var(--ok)/.12)] text-ok' : 'bg-[rgb(var(--warn)/.14)] text-warn')}>{v.kind === 'explicit' ? L('explicit', 'explícita') : L('potential', 'potencial')}</span> <span className="text-[12px]">{v.note}</span></li>)}</ul>
      </Sec>
      <Sec n={4} title={L('Method and why', 'Método y por qué')}><b className="text-ink">{f.method}.</b> {f.why}</Sec>
      <Sec n={5} title={L('Equations or rules', 'Ecuaciones o reglas')}>
        {model?.equations.length ? model.equations.map((e) => { const tex = e.latex ?? (e.expr ? toLatex(e.expr) : null); return tex ? <div key={e.id} className="overflow-x-auto text-ink"><Eq latex={tex} /></div> : <code key={e.id}>{e.expr}</code> }) : f.equations.length ? ul(f.equations) : L('None: the structure is qualitative.', 'Ninguna: la estructura es cualitativa.')}
      </Sec>
      <Sec n={6} title={L('Data and assumptions needed', 'Datos y supuestos necesarios')}>{ul(f.dataAndAssumptions)}{f.missing.length > 0 && <div className="mt-2 rounded-lg bg-[rgb(var(--warn)/.1)] p-2.5 text-warn"><b>{L('Missing:', 'Falta:')}</b> {f.missing.join(' ')}</div>}</Sec>
      <Sec n={7} title={L('Limitations', 'Limitaciones')}>{ul(f.limitations)}</Sec>
      <Sec n={8} title={L('Experiments you can run', 'Experimentos posibles')}>{ul(f.experiments)}</Sec>
    </div>
  )
}

function ProposalCard({ convId, msg, p }: { convId: string; msg: ChatMessage; p: Proposal }) {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const target = useStore((s) => s.db.models.find((m) => m.id === p.targetModelId))
  const [rel, setRel] = useState<RelationType>(p.relationType)
  if (!target) return null
  const done = p.state !== 'open'
  return (
    <div className={cx('rounded-xl border border-line bg-surface p-3.5 text-[13px]', done && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div><button className="serif text-left text-base text-accent hover:underline" onClick={() => ui.selectModel(target.id, { workspace: true })}>{target.title}</button>
          <div className="text-xs text-mute">{kindLabel(target.kind, lang)} · {tr(lang, 'relatedness', 'afinidad')} {(p.similarity * 100).toFixed(0)}%</div></div>
        {done && <span className="flex items-center gap-1 text-xs text-mute">{p.state === 'accepted' ? <><Check size={13} />{tr(lang, 'accepted', 'aceptado')}</> : <><X size={13} />{tr(lang, 'dismissed', 'descartado')}</>}</span>}
      </div>
      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-mute">{p.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      {p.warnings.length > 0 && <ul className="mt-2 space-y-0.5 rounded-lg bg-[rgb(var(--warn)/.1)] p-2 text-warn">{p.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>}
      {!done && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.suggestion === 'new-version' && msg.pendingDraft && <Btn size="sm" variant="primary" onClick={() => resolveProposal(convId, msg.id, p, 'new-version')}>{tr(lang, 'Update this model (new version)', 'Actualizar este modelo (nueva versión)')}</Btn>}
          <select aria-label={tr(lang, 'Relation type', 'Tipo de relación')} value={rel} onChange={(e) => setRel(e.target.value as RelationType)} className="h-8 max-w-full rounded-lg border border-line bg-bg px-2 text-[13px]">
            {RELATION_TYPES.filter((r) => r !== 'contains').map((r) => <option key={r} value={r}>{relationLabel(r, lang)}</option>)}
          </select>
          <Btn size="sm" variant="outline" onClick={() => resolveProposal(convId, msg.id, p, 'link', rel)}>{tr(lang, 'Link', 'Vincular')}</Btn>
          <Btn size="sm" variant="ghost" onClick={() => resolveProposal(convId, msg.id, p, 'dismiss')}>{tr(lang, 'Keep separate', 'Mantener separado')}</Btn>
        </div>
      )}
      <span className="sr-only">{t('related')}</span>
    </div>
  )
}

function Assistant({ convId, msg }: { convId: string; msg: ChatMessage }) {
  const lang = useStore((s) => s.ui.lang)
  const model = useStore((s) => s.db.models.find((m) => m.id === msg.modelId))
  const engineLabel = msg.engine === 'local-heuristics' ? tr(lang, 'Local heuristic analyzer · not a language model', 'Analizador heurístico local · no es un modelo de lenguaje') : msg.engine?.startsWith('ai:') ? tr(lang, `AI proposal (${msg.engine.slice(3)}) · validated by the deterministic engine · values are hypotheses`, `Propuesta de IA (${msg.engine.slice(3)}) · validada por el motor determinista · los valores son hipótesis`) : msg.engine
  return (
    <div className="fade-in">
      {msg.engine && <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-mute">MATHEMA · {engineLabel}</div>}
      <div className="prose-m text-[15px]"><p><Rich text={msg.text} /></p></div>
      {msg.formalization && <FormalizationCard f={msg.formalization} model={model ?? msg.pendingDraft} />}
      {msg.list?.map((s, i) => (
        <div key={i} className="mt-3 rounded-xl border border-line bg-surface p-4"><Label>{s.title}</Label><ul className="list-disc space-y-1.5 pl-4 text-[13.5px] text-mute">{s.items.map((x, k) => <li key={k}>{x}</li>)}</ul></div>
      ))}
      {model && (
        <button onClick={() => ui.selectModel(model.id, { workspace: true })} className="group mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/50">
          <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{kindLabel(model.kind, lang)} · v{model.version}</span><span className="serif block truncate text-lg">{model.title}</span></span>
          <span className="flex shrink-0 items-center gap-1 text-sm text-accent">{tr(lang, 'Open workspace', 'Abrir espacio')}<ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></span>
        </button>
      )}
      {msg.pendingDraft && !model && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-3 text-[13px] text-mute">
          <span className="min-w-0 flex-1">{tr(lang, 'Draft not saved yet:', 'Borrador aún sin guardar:')} <b className="text-ink">{msg.pendingDraft.title}</b></span>
          <Btn size="sm" variant="primary" onClick={() => (msg.actions?.length ? buildFromMessage(convId, msg.id) : savePendingDraft(convId, msg.id))}>{tr(lang, 'Save as new model', 'Guardar como modelo nuevo')}</Btn>
        </div>
      )}
      {msg.proposals && msg.proposals.length > 0 && (
        <div className="mt-3 space-y-2.5"><Label>{tr(lang, 'Connections found in your memory — nothing is merged unless you decide', 'Conexiones halladas en tu memoria — nada se fusiona sin tu decisión')}</Label>{msg.proposals.map((p) => <ProposalCard key={p.id} convId={convId} msg={msg} p={p} />)}</div>
      )}
    </div>
  )
}

export default function Thread({ conv }: { conv: Conversation }) {
  const end = useRef<HTMLDivElement>(null)
  const lang = useStore((s) => s.ui.lang)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [conv.messages.length])
  return (
    <div className="mx-auto w-full max-w-3xl space-y-7 px-4 pb-6 pt-6 sm:px-6">
      {conv.messages.map((m) => m.role === 'user' ? (
        <div key={m.id} className="fade-in flex justify-end">
          <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-sunk px-4 py-2.5 text-[15px] leading-relaxed">
            {m.text}
            {m.attachments?.map((a, i) => <div key={i} className="mt-1.5 flex items-center gap-1.5 text-xs text-mute"><Paperclip size={12} />{a.name} — {a.used}</div>)}
            <div className="mt-1 text-[10.5px] uppercase tracking-wide text-mute">{tr(lang, 'mode', 'modo')}: {m.mode}</div>
          </div>
        </div>
      ) : <Assistant key={m.id} convId={conv.id} msg={m} />)}
      <div ref={end} />
    </div>
  )
}
