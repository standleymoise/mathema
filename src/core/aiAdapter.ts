// Turns an LLM *proposal* into a MathModel. This is the trust boundary on the client:
// every expression is parsed by our own engine, every number is range-checked, and every value the
// model proposed is labelled as a system hypothesis. Anything that does not validate is rejected so the
// caller can fall back to the deterministic analyzer.
import type { Analysis } from './analyzer'
import { provLabel } from './analyzer'
import type { Equation, Formalization, GraphSpec, Lang, MathModel, ModelSpec, Variable } from './types'
import { compile, toLatex } from './engine/expr'
import { integrate } from './engine/ode'
import { solveLP } from './engine/lp'
import { now, tr, uid } from './text'

export class AdapterError extends Error {}

export interface Proposal {
  kind: 'function' | 'dynamic' | 'optimization' | 'causal' | 'conceptual'
  title: string; topic: string; centralQuestion: string; claim: string; method: string; methodRationale: string
  concepts: string[]
  variables: { name: string; symbol: string; definition: string; unit: string; role: Variable['role']; value?: number; min?: number; max?: number; step?: number }[]
  equations: { label: string; expr?: string; latex?: string }[]
  spec: Record<string, unknown>
  assumptions: string[]; limitations: string[]; hypotheses: { text: string; needs: string }[]
  formalizable: string[]; notFormalizable: string[]; dataAndAssumptions: string[]; experiments: string[]; missing: string[]
}
export interface ProposalMeta { provider: string; model: string }

const circle = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 310 + 230 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: 170 + 130 * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }))

export function proposalToAnalysis(p: Proposal, input: { text: string; lang: Lang }, meta: ProposalMeta): Analysis {
  const L = (en: string, es: string) => tr(input.lang, en, es)
  const dropped: string[] = []
  const variables: Variable[] = []
  const seen = new Set<string>()
  for (const v of p.variables) {
    if (seen.has(v.symbol)) continue
    seen.add(v.symbol)
    variables.push({ id: uid('var'), name: v.name, symbol: v.symbol, definition: v.definition || L('Proposed by the AI; confirm or edit.', 'Propuesta por la IA; confirmar o editar.'), unit: v.unit || '—', role: v.role, value: v.value, min: v.min, max: v.max, step: v.step, provenance: 'system-hypothesis' })
  }
  const params = () => Object.fromEntries(variables.filter((v) => (v.role === 'parameter' || v.role === 'input') && v.value !== undefined).map((v) => [v.symbol, v.value as number]))
  const check = (expr: string, allowed: string[], what: string) => {
    const c = compile(expr)
    if (!c.ok) throw new AdapterError(`${what}: ${c.error}`)
    const bad = c.vars.filter((x) => !allowed.includes(x))
    if (bad.length) throw new AdapterError(`${what}: unknown variable(s) ${bad.join(', ')}`)
  }
  const paramSyms = () => variables.filter((v) => v.role === 'parameter' || v.role === 'input').map((v) => v.symbol)

  let spec: ModelSpec
  const s = p.spec as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  if (p.kind === 'function') {
    check(s.expr, [s.xName, ...paramSyms()], 'function')
    spec = { kind: 'function', expr: s.expr, xName: s.xName, xMin: s.xMin, xMax: s.xMax, xLabel: s.xLabel || s.xName, yLabel: s.yLabel || 'y' }
    if (!variables.some((v) => v.symbol === s.xName)) variables.unshift({ id: uid('var'), name: s.xName, symbol: s.xName, definition: L('Independent variable.', 'Variable independiente.'), unit: '—', role: 'input', provenance: 'system-hypothesis' })
    if (!variables.some((v) => v.role === 'output')) variables.push({ id: uid('var'), name: s.yLabel || 'y', symbol: 'y', definition: L('Output of the proposed function.', 'Salida de la función propuesta.'), unit: '—', role: 'output', provenance: 'simulated' })
  } else if (p.kind === 'dynamic') {
    const ids = (s.states as { id: string }[]).map((x) => x.id)
    for (const st of s.states as { id: string; expr: string; init: string }[]) { check(st.expr, [...paramSyms(), ...ids, 't'], `d${st.id}/dt`); check(st.init, paramSyms(), `init ${st.id}`) }
    spec = { kind: 'dynamic', states: s.states, tEnd: s.tEnd, tLabel: s.tLabel, yLabel: s.yLabel || s.states[0].label }
    const run = integrate({ states: s.states, params: params(), tEnd: s.tEnd, steps: 60 })
    if (!run.ok) throw new AdapterError(`dynamic: ${run.error}`)
    for (const st of s.states as { id: string; label: string }[]) if (!variables.some((v) => v.symbol === st.id)) variables.push({ id: uid('var'), name: st.label || st.id, symbol: st.id, definition: L('State variable of the proposed system.', 'Variable de estado del sistema propuesto.'), unit: '—', role: 'state', provenance: 'simulated' })
  } else if (p.kind === 'optimization') {
    const need: [string, number, string][] = [['cx', s.cx, `${s.objectiveLabel} / ${s.xName}`], ['cy', s.cy, `${s.objectiveLabel} / ${s.yName}`], ...(s.constraints as { id: string; label: string; rhs: number }[]).map((c): [string, number, string] => [`rhs_${c.id}`, c.rhs, c.label])]
    for (const [sym, val, name] of need) if (!variables.some((v) => v.symbol === sym)) variables.push({ id: uid('var'), name, symbol: sym, definition: L('Placeholder coefficient proposed by the AI.', 'Coeficiente marcador propuesto por la IA.'), unit: '—', value: val, min: 0, max: Math.max(1, val * 3), step: Math.max(val / 100, 0.01), role: 'parameter', provenance: 'system-hypothesis' })
    spec = { kind: 'optimization', xName: s.xName, yName: s.yName, cx: s.cx, cy: s.cy, objectiveLabel: s.objectiveLabel, constraints: s.constraints }
    const sol = solveLP(spec)
    if (!sol.feasible || sol.error) throw new AdapterError(`optimization: ${sol.error ?? 'infeasible'}`)
  } else {
    const nodes = (s.nodes as { id: string; label: string }[]); const pos = circle(nodes.length)
    const g: GraphSpec = { kind: p.kind, nodes: nodes.map((n, i) => ({ ...n, x: pos[i].x, y: pos[i].y })), edges: (s.edges as { from: string; to: string; sign: 1 | -1 | 0; note: string }[]).map((e, i) => ({ id: `ed${i}`, from: e.from, to: e.to, sign: e.sign, note: e.note || L('Proposed by the AI; direction is a hypothesis.', 'Propuesta por la IA; la dirección es una hipótesis.') })), gaps: (s.gaps as string[]) ?? [] }
    spec = g
    if (!variables.length) for (const n of g.nodes) variables.push({ id: uid('var'), name: n.label, symbol: n.id, definition: L('Concept proposed by the AI.', 'Concepto propuesto por la IA.'), unit: '—', role: 'concept', provenance: 'system-hypothesis' })
  }

  const equations: Equation[] = []
  const known = [...variables.map((v) => v.symbol), 't']
  for (const e of p.equations) {
    if (e.expr) {
      const c = compile(e.expr)
      if (c.ok && c.vars.every((x) => known.includes(x))) { equations.push({ id: uid('eq'), label: e.label, expr: e.expr, latex: toLatex(e.expr) ?? undefined, provenance: 'system-hypothesis', editable: spec.kind === 'function' || spec.kind === 'dynamic' }); continue }
      dropped.push(e.label)
    }
    if (e.latex) equations.push({ id: uid('eq'), label: e.label, latex: e.latex, provenance: 'system-hypothesis', editable: false })
  }
  if (!equations.length && (spec.kind === 'function' || spec.kind === 'dynamic')) {
    const expr = spec.kind === 'function' ? spec.expr : spec.states[0].expr
    equations.push({ id: uid('eq'), label: p.method || 'Equation', expr, provenance: 'system-hypothesis', editable: true })
  } else if (spec.kind === 'function' && equations[0]?.expr) {
    // keep the plotted expression and the displayed/editable equation in sync
    equations[0] = { ...equations[0], expr: spec.expr, latex: toLatex(spec.expr) ?? equations[0].latex }
  } else if (spec.kind === 'dynamic' && equations[0]?.expr) equations[0] = { ...equations[0], expr: spec.states[0].expr, latex: toLatex(spec.states[0].expr) ?? equations[0].latex }

  const limitations = [...p.limitations, L(`Structure and values were proposed by ${meta.provider}/${meta.model} from your text alone. Nothing here is verified evidence.`, `La estructura y los valores fueron propuestos por ${meta.provider}/${meta.model} solo a partir de tu texto. Nada de esto es evidencia verificada.`)]
  if (dropped.length) limitations.push(L(`Equation(s) proposed but not parseable and therefore dropped: ${dropped.join(', ')}.`, `Ecuación(es) propuestas pero no interpretables, descartadas: ${dropped.join(', ')}.`))
  const draft: MathModel = {
    id: uid('mdl'), version: 1, isDemo: false, createdAt: now(), updatedAt: now(), versions: [], scenarios: [],
    title: p.title, description: L(`Draft proposed by an AI model (${p.kind}) and validated by MATHEMA's deterministic engine. Review every assumption.`, `Borrador propuesto por un modelo de IA (${p.kind}) y validado por el motor determinista de MATHEMA. Revisá cada supuesto.`),
    originalInput: input.text.trim(), concepts: p.concepts, sourceIds: [], kind: p.kind, method: p.method, methodRationale: p.methodRationale,
    variables, equations, assumptions: p.assumptions.map((t) => ({ id: uid('as'), text: t, provenance: 'system-hypothesis' as const })), limitations,
    hypotheses: p.hypotheses.map((h) => ({ id: uid('h'), text: h.text, status: 'open' as const, needs: h.needs })),
    validation: { status: 'unvalidated', notes: L(`Structure proposed by ${meta.provider}/${meta.model}; parsed and range-checked by MATHEMA. No data compared.`, `Estructura propuesta por ${meta.provider}/${meta.model}; interpretada y verificada por MATHEMA. Sin datos comparados.`) },
    spec,
  }
  const formalization: Formalization = {
    claim: p.claim, formalizable: p.formalizable, notFormalizable: p.notFormalizable,
    variables: variables.filter((v) => v.role !== 'state').map((v) => ({ name: v.name, kind: 'potential' as const, note: `${v.role}${v.unit && v.unit !== '—' ? ` · ${v.unit}` : ''} · ${provLabel(v.provenance, input.lang)}` })),
    method: p.method, why: p.methodRationale, equations: equations.map((e) => e.expr ?? e.latex ?? ''), dataAndAssumptions: p.dataAndAssumptions,
    limitations, experiments: p.experiments, missing: p.missing,
  }
  return { title: p.title, topic: p.topic, centralQuestion: p.centralQuestion, formalization, draft, concepts: p.concepts, engine: `ai:${meta.provider}/${meta.model}` }
}
