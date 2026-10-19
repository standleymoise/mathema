// Deterministic conclusion + exportable report for a model. No AI: every sentence is computed from the model's current
// state (including unsaved slider values) and always framed as a hypothesis under stated assumptions.
import type { Lang, MathModel, ModelSpec } from './types'
import { baseParams, optimizationWith, runDynamic, sampleFunction, sensitivity, type Params } from './engine/runtime'
import { solveLP } from './engine/lp'
import { fitPoly } from './engine/stats'
import { provLabel } from './analyzer'
import { tr } from './text'

export interface Conclusion { headline: string; points: string[]; caveats: string[]; next: string[] }
export interface ReportSection { h: string; paras?: string[]; list?: string[] }

const n = (x: number) => (Number.isFinite(x) ? (Math.abs(x) >= 1000 ? x.toFixed(0) : String(+x.toPrecision(4))) : '—')

const STATUS: Record<MathModel['validation']['status'], [string, string]> = {
  unvalidated: ['unvalidated', 'sin validar'], 'demo-data': ['based on demo data', 'basado en datos demo'], 'simulated-only': ['simulated only', 'solo simulado'],
  'fit-to-data': ['fitted to data but not validated', 'ajustado a datos pero no validado'], 'empirically-validated': ['empirically validated', 'validado empíricamente'],
}

export function buildConclusion(model: MathModel, params: Params, spec: ModelSpec, lang: Lang): Conclusion {
  const L = (en: string, es: string) => tr(lang, en, es)
  const live = { ...model, spec }
  const points: string[] = []
  let headline = ''
  const lead = L('Under the stated assumptions, ', 'Bajo los supuestos indicados, ')

  if (spec.kind === 'function') {
    const s = sampleFunction(live, params, 200)
    const pts = s.ok ? s.pts.filter((p) => Number.isFinite(p.y)) : []
    if (pts.length) {
      const hi = pts.reduce((a, b) => (b.y > a.y ? b : a)), lo = pts.reduce((a, b) => (b.y < a.y ? b : a))
      const interior = hi.x > spec.xMin + (spec.xMax - spec.xMin) * 0.02 && hi.x < spec.xMax - (spec.xMax - spec.xMin) * 0.02
      headline = interior
        ? lead + L(`${spec.yLabel} is highest (about ${n(hi.y)}) when ${spec.xLabel} is near ${n(hi.x)}, and falls on either side.`, `${spec.yLabel} es máximo (cerca de ${n(hi.y)}) cuando ${spec.xLabel} está cerca de ${n(hi.x)}, y baja a ambos lados.`)
        : lead + L(`${spec.yLabel} is highest (about ${n(hi.y)}) at ${n(hi.x)} within the range ${n(spec.xMin)}–${n(spec.xMax)} of ${spec.xLabel}.`, `${spec.yLabel} es máximo (cerca de ${n(hi.y)}) en ${n(hi.x)} dentro del rango ${n(spec.xMin)}–${n(spec.xMax)} de ${spec.xLabel}.`)
      points.push(L(`Across the range, ${spec.yLabel} goes from ${n(lo.y)} (lowest) to ${n(hi.y)} (highest).`, `En todo el rango, ${spec.yLabel} va de ${n(lo.y)} (mínimo) a ${n(hi.y)} (máximo).`))
    } else headline = L('The current equation cannot be evaluated, so there is no conclusion yet.', 'La ecuación actual no se puede evaluar, así que todavía no hay conclusión.')
  } else if (spec.kind === 'dynamic') {
    const r = runDynamic(live, params)
    if (r && r.ok) {
      const first = spec.states[0]
      const ser = r.series[first.id], a = ser[0], b = ser[ser.length - 1]
      const max = Math.max(...ser), iMax = ser.indexOf(max)
      const tail = Math.abs(ser[ser.length - 1] - ser[Math.floor(ser.length * 0.9)]) / (Math.abs(b) || 1)
      const trend = b > a * 1.02 ? L('grows', 'crece') : b < a * 0.98 ? L('falls', 'baja') : L('stays roughly flat', 'se mantiene casi igual')
      headline = lead + L(`${first.label} ${trend}, from ${n(a)} to ${n(b)} over ${n(spec.tEnd)} (${spec.tLabel}).`, `${first.label} ${trend}, de ${n(a)} a ${n(b)} en ${n(spec.tEnd)} (${spec.tLabel}).`)
      if (tail < 0.01 && trend !== L('stays roughly flat', 'se mantiene casi igual')) points.push(L(`It levels off near ${n(b)}: it is close to a steady value by the end.`, `Se estabiliza cerca de ${n(b)}: al final está cerca de un valor estable.`))
      if (iMax > 0 && iMax < ser.length - 1) points.push(L(`It peaks at about ${n(max)} around ${n(r.t[iMax])} and then declines.`, `Alcanza un máximo de unos ${n(max)} alrededor de ${n(r.t[iMax])} y luego baja.`))
      for (const st of spec.states.slice(1)) { const s2 = r.series[st.id]; points.push(L(`${st.label} goes from ${n(s2[0])} to ${n(s2[s2.length - 1])} (min ${n(Math.min(...s2))}, max ${n(Math.max(...s2))}).`, `${st.label} va de ${n(s2[0])} a ${n(s2[s2.length - 1])} (mín ${n(Math.min(...s2))}, máx ${n(Math.max(...s2))}).`)) }
    } else headline = L('The system could not be integrated with the current values, so there is no conclusion yet.', 'El sistema no se pudo integrar con los valores actuales, así que todavía no hay conclusión.')
  } else if (spec.kind === 'optimization') {
    const o = optimizationWith(spec, params), sol = solveLP(o)
    if (sol.feasible) {
      headline = lead + L(`the best choice is ${n(sol.x)} of ${spec.xName} and ${n(sol.y)} of ${spec.yName}, giving ${n(sol.value)} ${spec.objectiveLabel}.`, `la mejor opción es ${n(sol.x)} de ${spec.xName} y ${n(sol.y)} de ${spec.yName}, con ${n(sol.value)} de ${spec.objectiveLabel}.`)
      points.push(sol.binding.length ? L(`The limit(s) that run out first: ${sol.binding.join(', ')}. Relaxing them is what would improve the result.`, `Los límites que se agotan primero: ${sol.binding.join(', ')}. Aflojarlos es lo que mejoraría el resultado.`) : L('No limit is fully used at the optimum.', 'Ningún límite se agota por completo en el óptimo.'))
    } else headline = L('With the current numbers there is no feasible choice, so there is no conclusion yet.', 'Con los números actuales no hay ninguna opción factible, así que todavía no hay conclusión.')
  } else if (spec.kind === 'regression') {
    const f = fitPoly(spec.x, spec.y, spec.degree)
    if (f.ok) {
      const meanX = spec.x.reduce((p, c) => p + c, 0) / spec.x.length
      const slope = f.coef[1] + (f.degree === 2 ? 2 * f.coef[2] * meanX : 0)
      headline = lead + L(`in these ${f.n} observations, ${spec.yLabel} tends to ${slope >= 0 ? 'rise' : 'fall'} as ${spec.xLabel} increases (about ${n(Math.abs(slope))} per unit near the average).`, `en estas ${f.n} observaciones, ${spec.yLabel} tiende a ${slope >= 0 ? 'subir' : 'bajar'} cuando ${spec.xLabel} aumenta (unas ${n(Math.abs(slope))} por unidad cerca del promedio).`)
      points.push(L(`The fitted curve accounts for ${n(f.r2 * 100)}% of the variation in this sample (R² = ${n(f.r2)}).`, `La curva ajustada explica el ${n(f.r2 * 100)}% de la variación de esta muestra (R² = ${n(f.r2)}).`))
      points.push(L('This is an association in the data, not proof that one causes the other.', 'Es una asociación en los datos, no una prueba de que una cosa cause la otra.'))
    } else headline = L('The data are not enough to fit this regression, so there is no conclusion yet.', 'Los datos no alcanzan para ajustar esta regresión, así que todavía no hay conclusión.')
  } else {
    const label = (id: string) => spec.nodes.find((x) => x.id === id)?.label ?? id
    const claims = spec.edges.map((e) => `${label(e.from)} → ${e.sign === 1 ? L('more', 'más') : e.sign === -1 ? L('less', 'menos') : L('affects', 'afecta a')} ${label(e.to)}`)
    headline = spec.edges.length
      ? lead + L(`the idea claims ${spec.edges.length} influence(s) among ${spec.nodes.length} factors; none has been measured.`, `la idea afirma ${spec.edges.length} influencia(s) entre ${spec.nodes.length} factores; ninguna fue medida.`)
      : L('The idea names concepts but no influences between them yet.', 'La idea nombra conceptos pero todavía no influencias entre ellos.')
    for (const c of claims.slice(0, 6)) points.push(c)
    if (spec.kind === 'causal') {
      const targets = [...new Set(spec.edges.map((e) => e.to))].filter((t) => !spec.edges.some((e) => e.from === t))
      for (const t of targets.slice(0, 2)) {
        const drivers = spec.edges.filter((e) => e.to === t)
        const ups = drivers.filter((e) => e.sign === 1).map((e) => label(e.from)), downs = drivers.filter((e) => e.sign === -1).map((e) => label(e.from))
        if (ups.length || downs.length) points.push(L(`For ${label(t)}: ${ups.length ? `${ups.join(', ')} push it up` : ''}${ups.length && downs.length ? '; ' : ''}${downs.length ? `${downs.join(', ')} push it down` : ''}.`, `Para ${label(t)}: ${ups.length ? `${ups.join(', ')} lo suben` : ''}${ups.length && downs.length ? '; ' : ''}${downs.length ? `${downs.join(', ')} lo bajan` : ''}.`))
      }
    }
  }

  const sens = spec.kind === 'function' || spec.kind === 'dynamic' || spec.kind === 'optimization' ? sensitivity(live, params, 0.2, lang) : null
  if (sens && sens.rows.length) points.push(L(`What matters most: “${sens.rows[0].name}” (a ±20% change moves “${sens.metric.label}” the most).`, `Lo que más pesa: «${sens.rows[0].name}» (un cambio de ±20% es lo que más mueve «${sens.metric.label}»).`))

  const [stEn, stEs] = STATUS[model.validation.status]
  const caveats = [
    L(`Status: ${stEn}. This is a hypothesis built from assumptions, not a finding.`, `Estado: ${stEs}. Es una hipótesis construida con supuestos, no un hallazgo.`),
    ...(Object.keys(baseParams(model)).some((k) => params[k] !== baseParams(model)[k]) ? [L('It uses slider values you changed and have not saved.', 'Usa valores de los deslizadores que cambiaste y no guardaste.')] : []),
    ...(model.variables.some((v) => v.provenance === 'system-hypothesis' && v.value !== undefined) ? [L('Starting numbers were proposed by the system, not measured.', 'Los números iniciales los propuso el sistema, no se midieron.')] : []),
    ...model.limitations.slice(0, 3),
  ]
  const next = [...model.hypotheses.map((h) => `${h.text} — ${L('needs', 'hace falta')}: ${h.needs}`).slice(0, 3)]
  if (!next.length) next.push(L('Compare the model with real observations of the outcome; that is the step that turns a hypothesis into evidence.', 'Comparar el modelo con observaciones reales del resultado; ese paso convierte una hipótesis en evidencia.'))
  return { headline, points, caveats, next }
}

/** Structured report; rendered to Markdown, HTML or plain text by the helpers below. */
export function buildReport(model: MathModel, params: Params, spec: ModelSpec, lang: Lang, userNote?: string): { title: string; sections: ReportSection[] } {
  const L = (en: string, es: string) => tr(lang, en, es)
  const c = buildConclusion(model, params, spec, lang)
  const vars = model.variables.filter((v) => v.role !== 'state' && v.role !== 'output')
  const sections: ReportSection[] = [
    { h: L('Question', 'Pregunta'), paras: [model.originalInput || model.description] },
    { h: L('Conclusion (hypothesis)', 'Conclusión (hipótesis)'), paras: [c.headline], list: c.points },
  ]
  if (userNote?.trim()) sections.push({ h: L('My own conclusion', 'Mi propia conclusión'), paras: [userNote.trim()] })
  sections.push(
    { h: L('How it was built', 'Cómo se construyó'), paras: [model.method, model.methodRationale] },
    { h: L('Factors and values used', 'Factores y valores usados'), list: vars.map((v) => `${v.name}${v.value !== undefined ? ` = ${n(params[v.symbol] ?? v.value)} ${v.unit}`.trimEnd() : ''} — ${provLabel(v.provenance, lang)}${v.definition ? `. ${v.definition}` : ''}`) },
    ...(model.equations.length ? [{ h: L('Equations', 'Ecuaciones'), list: model.equations.map((e) => `${e.label}: ${e.expr ?? e.latex ?? ''}`) }] : []),
    { h: L('Assumptions', 'Supuestos'), list: model.assumptions.map((a) => `${a.text} (${provLabel(a.provenance, lang)})`) },
    { h: L('Caveats', 'Advertencias'), list: c.caveats },
    { h: L('What would strengthen or refute it', 'Qué la reforzaría o la refutaría'), list: c.next },
  )
  return { title: model.title, sections: sections.filter((s) => (s.paras?.some(Boolean)) || (s.list?.length)) }
}

export const toMarkdown = (r: { title: string; sections: ReportSection[] }, footer: string) =>
  `# ${r.title}\n\n` + r.sections.map((s) => `## ${s.h}\n\n${(s.paras ?? []).filter(Boolean).join('\n\n')}${s.paras?.length && s.list?.length ? '\n\n' : ''}${(s.list ?? []).map((x) => `- ${x}`).join('\n')}`).join('\n\n') + `\n\n---\n${footer}\n`
export const toPlain = (r: { title: string; sections: ReportSection[] }) =>
  `${r.title}\n\n` + r.sections.map((s) => `${s.h.toUpperCase()}\n${(s.paras ?? []).filter(Boolean).join('\n')}${s.list?.length ? '\n' : ''}${(s.list ?? []).map((x) => `• ${x}`).join('\n')}`).join('\n\n') + '\n'
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)
export const toHtml = (r: { title: string; sections: ReportSection[] }, footer: string, lang: Lang) =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>body{font:14px/1.55 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 20px;color:#1c1b19}h1{font:600 26px Georgia,serif}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b665e;margin:22px 0 6px}li{margin:3px 0}footer{margin-top:28px;font-size:12px;color:#6b665e;border-top:1px solid #ddd;padding-top:10px}</style></head><body><h1>${esc(r.title)}</h1>` +
  r.sections.map((s) => `<h2>${esc(s.h)}</h2>${(s.paras ?? []).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('')}${s.list?.length ? `<ul>${s.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`).join('') + `<footer>${esc(footer)}</footer></body></html>`
