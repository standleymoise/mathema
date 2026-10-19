import { useState } from 'react'
import { Check, Copy, RotateCcw, Trash2 } from 'lucide-react'
import type { MathModel, Scenario } from '../../core/types'
import { adjustable, metric, type Params } from '../../core/engine/runtime'
import { compile, toLatex } from '../../core/engine/expr'
import { Btn, Eq, IconBtn, Label, ProvBadge, cx } from '../common'
import { models, useStore, useT } from '../../store/store'
import { tr } from '../../core/text'

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)']
export const fmt = (n: number, d = 3) => (Number.isFinite(n) ? (Math.abs(n) >= 1000 ? n.toFixed(0) : +n.toPrecision(d + 1)).toString() : '—')

export function ChartFrame({ children, title, caption }: { children: React.ReactNode; title?: string; caption?: string }) {
  return (
    <figure className="m-0 rounded-xl border border-line bg-surface p-3 sm:p-4">
      {title && <figcaption className="mb-2 px-1 text-[13px] font-medium">{title}</figcaption>}
      <div className="h-[280px] w-full min-w-0 sm:h-[340px]">{children}</div>
      {caption && <p className="mt-2 px-1 text-xs text-mute">{caption}</p>}
    </figure>
  )
}

const ADV_KEY = 'mathema:advancedParams'
const readAdv = () => { try { return localStorage.getItem(ADV_KEY) === '1' } catch { return false } }

export function ParamControls({ model, params, base, onChange, onReset }: { model: MathModel; params: Params; base: Params; onChange: (k: string, v: number) => void; onReset: () => void }) {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const [adv, setAdv] = useState(readAdv)
  const vars = adjustable(model)
  if (!vars.length) return null
  const toggle = () => { setAdv(!adv); try { localStorage.setItem(ADV_KEY, adv ? '0' : '1') } catch { /* storage blocked */ } }
  const guessed = vars.some((v) => v.provenance === 'system-hypothesis' || v.provenance === 'user-assumption')
  return (
    <section aria-label={t('parameters')} className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-1 flex items-center justify-between">
        <Label>{t('parameters')}</Label>
        <div className="flex items-center">
          <Btn size="sm" variant="ghost" onClick={toggle} aria-pressed={adv}>{adv ? tr(lang, 'Simple view', 'Vista simple') : tr(lang, 'Advanced view', 'Vista avanzada')}</Btn>
          <Btn size="sm" variant="ghost" onClick={onReset}><RotateCcw size={14} />{t('reset')}</Btn>
        </div>
      </div>
      {guessed && <p className="mb-1 text-xs text-mute">{tr(lang, 'Starting values are assumptions, not measurements. Drag the sliders and watch what changes; “Reset” brings back the starting values.', 'Los valores iniciales son supuestos, no mediciones. Mové los controles y mirá qué cambia; «Restablecer» vuelve a los valores iniciales.')}</p>}
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {vars.map((v) => {
          const val = params[v.symbol] ?? v.value!
          const min = v.min ?? Math.min(0, v.value! * 2), max = v.max ?? Math.max(1, v.value! * 2), step = v.step ?? (max - min) / 100
          return (
            <div key={v.id} className="py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`p_${v.id}`} className="text-[13px]"><span className="font-medium">{v.name}</span>{adv && <> <span className="font-mono text-[11px] text-mute">{v.symbol}</span></>}</label>
                {adv ? (
                  <div className="flex items-center gap-1">
                    <input aria-label={`${v.name} value`} type="number" inputMode="decimal" value={val} min={min} max={max} step={step}
                      onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(v.symbol, n) }}
                      className={cx('h-7 w-[72px] rounded-md border bg-bg px-1.5 text-right font-mono text-xs outline-none focus:border-accent', val !== base[v.symbol] ? 'border-accent' : 'border-line')} />
                    <span className="w-10 truncate text-[11px] text-mute">{v.unit}</span>
                  </div>
                ) : <span className={cx('font-mono text-xs', val !== base[v.symbol] && 'text-accent')}>{fmt(val)} <span className="text-[11px] text-mute">{v.unit}</span></span>}
              </div>
              {v.definition && <p className="mt-0.5 text-[11.5px] leading-snug text-mute">{v.definition}</p>}
              <input id={`p_${v.id}`} type="range" min={min} max={max} step={step} value={val} onChange={(e) => onChange(v.symbol, parseFloat(e.target.value))} aria-valuetext={`${val} ${v.unit}`} />
              <div className="-mt-1 flex items-center justify-between text-[10.5px] text-mute"><span>{min}</span>{adv && <ProvBadge p={v.provenance} />}<span>{max}</span></div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false)
  return (
    <IconBtn label={label} className="h-8 w-8" onClick={async () => { try { await navigator.clipboard.writeText(text) } catch { /* clipboard blocked */ } setOk(true); setTimeout(() => setOk(false), 1200) }}>
      {ok ? <Check size={15} /> : <Copy size={15} />}
    </IconBtn>
  )
}

/** Editable, copyable, validated equation. Only valid expressions are propagated. */
export function EquationEditor({ label, expr, onChange, knownVars, lhs }: { label: string; expr: string; onChange: (e: string) => void; knownVars: string[]; lhs?: string }) {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const [draft, setDraft] = useState(expr)
  const [editing, setEditing] = useState(false)
  const c = compile(draft)
  const unknown = c.ok ? c.vars.filter((v) => !knownVars.includes(v)) : []
  const error = !c.ok ? c.error : unknown.length ? tr(lang, `Unknown variable: ${unknown.join(', ')}`, `Variable desconocida: ${unknown.join(', ')}`) : null
  const tex = toLatex(expr)
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="-mt-1 flex items-center">
          <CopyBtn text={expr} label={t('copy')} />
          <Btn size="sm" variant="ghost" onClick={() => { setEditing(!editing); setDraft(expr) }}>{editing ? t('cancel') : tr(lang, 'Edit', 'Editar')}</Btn>
        </div>
      </div>
      {tex && <div className="serif overflow-x-auto text-lg"><Eq latex={`${lhs ? lhs + ' = ' : ''}${tex}`} /></div>}
      {editing && (
        <div className="mt-2">
          <input aria-label={tr(lang, 'Equation expression', 'Expresión de la ecuación')} spellCheck={false} value={draft} onChange={(e) => { setDraft(e.target.value); const cc = compile(e.target.value); if (cc.ok && cc.vars.every((v) => knownVars.includes(v))) onChange(e.target.value) }}
            className={cx('h-10 w-full rounded-lg border bg-bg px-3 font-mono text-[13px] outline-none', error ? 'border-bad' : 'border-line focus:border-accent')} />
          <p className={cx('mt-1.5 text-xs', error ? 'text-bad' : 'text-mute')} role={error ? 'alert' : undefined}>{error ?? tr(lang, `Variables: ${knownVars.join(', ')} · functions: exp ln sqrt sin cos min max abs pow`, `Variables: ${knownVars.join(', ')} · funciones: exp ln sqrt sin cos min max abs pow`)}</p>
        </div>
      )}
    </section>
  )
}

export function ScenarioPanel({ model, params, onApply, setName }: { model: MathModel; params: Params; onApply: (p: Params) => void; setName: (n: string) => void }) {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const [name, setNm] = useState('')
  const cur = metric(model, params, lang)
  const rows = model.scenarios.map((s, i) => ({ s, i, m: metric(model, { ...params, ...s.params }) }))
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <Label>{t('scenarios')}</Label>
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); models.addScenario(model.id, name || `${tr(lang, 'Scenario', 'Escenario')} ${model.scenarios.length + 1}`, { ...params }); setNm(''); setName('') }}>
        <input value={name} onChange={(e) => setNm(e.target.value)} placeholder={`${tr(lang, 'Scenario', 'Escenario')} ${model.scenarios.length + 1}`} aria-label={tr(lang, 'Scenario name', 'Nombre del escenario')} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
        <Btn type="submit" variant="outline" size="sm" className="h-9">{t('saveScenario')}</Btn>
      </form>
      {cur && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{tr(lang, 'Scenario comparison', 'Comparación de escenarios')}</caption>
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-mute"><th className="pb-1 font-medium">{tr(lang, 'Scenario', 'Escenario')}</th><th className="pb-1 text-right font-medium">{cur.label}</th><th /></tr></thead>
            <tbody>
              <tr className="border-t border-line"><td className="py-1.5"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: SERIES[0] }} />{tr(lang, 'Current (unsaved edits)', 'Actual (cambios sin guardar)')}</td><td className="py-1.5 text-right font-mono">{fmt(cur.value)}</td><td /></tr>
              {rows.map(({ s, i, m }: { s: Scenario; i: number; m: ReturnType<typeof metric> }) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-1.5"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: SERIES[(i + 1) % SERIES.length] }} />{s.name}</td>
                  <td className="py-1.5 text-right font-mono">{m ? fmt(m.value) : '—'}{m && cur ? <span className="ml-2 text-[11px] text-mute">{m.value >= cur.value ? '+' : ''}{fmt(((m.value - cur.value) / (cur.value || 1)) * 100, 1)}%</span> : null}</td>
                  <td className="whitespace-nowrap text-right">
                    <Btn size="sm" variant="ghost" onClick={() => onApply({ ...params, ...s.params })}>{tr(lang, 'Apply', 'Aplicar')}</Btn>
                    <IconBtn label={`${tr(lang, 'Delete', 'Eliminar')} ${s.name}`} className="h-8 w-8" onClick={() => models.removeScenario(model.id, s.id)}><Trash2 size={14} /></IconBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-mute">{tr(lang, 'Scenario values are model outputs (simulated), not observations.', 'Los valores de los escenarios son resultados del modelo (simulados), no observaciones.')}</p>
    </section>
  )
}
