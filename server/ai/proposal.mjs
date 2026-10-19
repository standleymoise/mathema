// Strict server-side validation of the model's JSON. Anything unexpected is dropped or rejected.
const KINDS = new Set(['function', 'dynamic', 'optimization', 'causal', 'conceptual'])
const ROLES = new Set(['parameter', 'input', 'output', 'state', 'concept'])
const ID = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/

const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const strs = (v, n = 12, max = 400) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : [])

export class ProposalError extends Error {}

/** Extract the first top-level JSON object from model text (tolerates code fences / stray prose). */
export function extractJson(text) {
  const t = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  const start = t.indexOf('{')
  if (start < 0) throw new ProposalError('no JSON object in model output')
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < t.length; i++) {
    const c = t[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(t.slice(start, i + 1)) } catch (e) { throw new ProposalError(`invalid JSON: ${e.message}`) }
    }
  }
  throw new ProposalError('unterminated JSON object')
}

export function validateProposal(raw) {
  if (!raw || typeof raw !== 'object') throw new ProposalError('proposal is not an object')
  const kind = str(raw.kind, 20)
  if (!KINDS.has(kind)) throw new ProposalError(`unsupported kind "${kind}"`)
  const variables = (Array.isArray(raw.variables) ? raw.variables : []).slice(0, 24).map((v) => {
    const role = ROLES.has(v?.role) ? v.role : 'concept'
    const out = { name: str(v?.name, 80), symbol: str(v?.symbol, 32), definition: str(v?.definition, 300), unit: str(v?.unit, 24) || '-', role }
    if (!out.name || !ID.test(out.symbol)) return null
    if (role === 'parameter' || role === 'input') {
      if (typeof v.value === 'number' && Number.isFinite(v.value)) {
        out.value = v.value
        out.min = num(v.min, Math.min(0, v.value * 2)); out.max = num(v.max, Math.max(1, v.value * 2))
        if (out.min >= out.max) { out.min = Math.min(0, v.value * 2); out.max = Math.max(1, v.value * 2) }
        if (typeof v.step === 'number' && v.step > 0) out.step = v.step
      }
    }
    return out
  }).filter(Boolean)
  const equations = (Array.isArray(raw.equations) ? raw.equations : []).slice(0, 6).map((e) => ({ label: str(e?.label, 100) || 'Equation', expr: str(e?.expr, 300) || undefined, latex: str(e?.latex, 400) || undefined })).filter((e) => e.expr || e.latex)

  const s = raw.spec ?? {}
  let spec
  if (kind === 'function') {
    spec = { kind, expr: str(s.expr, 300), xName: str(s.xName, 32), xMin: num(s.xMin, 0), xMax: num(s.xMax, 10), xLabel: str(s.xLabel, 80), yLabel: str(s.yLabel, 80) }
    if (!spec.expr || !ID.test(spec.xName) || spec.xMax <= spec.xMin) throw new ProposalError('function spec incomplete')
  } else if (kind === 'dynamic') {
    const states = (Array.isArray(s.states) ? s.states : []).slice(0, 4).map((x) => ({ id: str(x?.id, 32), label: str(x?.label, 80), expr: str(x?.expr, 300), init: str(x?.init, 100) || '1' })).filter((x) => ID.test(x.id) && x.expr)
    if (!states.length) throw new ProposalError('dynamic spec needs states')
    spec = { kind, states, tEnd: Math.min(Math.max(num(s.tEnd, 40), 1), 1e6), tLabel: str(s.tLabel, 60) || 't', yLabel: str(s.yLabel, 80) }
  } else if (kind === 'optimization') {
    const cons = (Array.isArray(s.constraints) ? s.constraints : []).slice(0, 2).map((c) => ({ id: str(c?.id, 32), label: str(c?.label, 60), a: num(c?.a, NaN), b: num(c?.b, NaN), rhs: num(c?.rhs, NaN) })).filter((c) => ID.test(c.id) && [c.a, c.b, c.rhs].every(Number.isFinite) && c.rhs > 0)
    if (cons.length !== 2) throw new ProposalError('optimization needs exactly 2 valid constraints')
    spec = { kind, xName: str(s.xName, 60), yName: str(s.yName, 60), cx: num(s.cx, 1), cy: num(s.cy, 1), objectiveLabel: str(s.objectiveLabel, 60) || 'value', constraints: cons }
    if (!spec.xName || !spec.yName) throw new ProposalError('optimization needs two named decision variables')
  } else {
    const nodes = (Array.isArray(s.nodes) ? s.nodes : []).slice(0, 10).map((n) => ({ id: str(n?.id, 32), label: str(n?.label, 60) })).filter((n) => ID.test(n.id) && n.label)
    if (nodes.length < 2) throw new ProposalError('graph needs at least 2 nodes')
    const ids = new Set(nodes.map((n) => n.id))
    const edges = (Array.isArray(s.edges) ? s.edges : []).slice(0, 24).map((e) => ({ from: str(e?.from, 32), to: str(e?.to, 32), sign: e?.sign === 1 || e?.sign === -1 ? e.sign : 0, note: str(e?.note, 200) })).filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
    spec = { kind, nodes, edges, gaps: strs(s.gaps, 8) }
  }
  const hypotheses = (Array.isArray(raw.hypotheses) ? raw.hypotheses : []).slice(0, 6).map((h) => ({ text: str(h?.text, 300), needs: str(h?.needs, 300) })).filter((h) => h.text)
  const limitations = strs(raw.limitations, 8)
  if (limitations.length < 1) limitations.push('Proposed by a language model from the text alone; not verified against any evidence.')
  return {
    kind, title: str(raw.title, 90) || 'Untitled idea', topic: str(raw.topic, 120), centralQuestion: str(raw.centralQuestion, 300), claim: str(raw.claim, 300),
    method: str(raw.method, 160), methodRationale: str(raw.methodRationale, 500), concepts: strs(raw.concepts, 8, 60),
    variables, equations, spec, assumptions: strs(raw.assumptions, 10), limitations, hypotheses,
    formalizable: strs(raw.formalizable), notFormalizable: strs(raw.notFormalizable), dataAndAssumptions: strs(raw.dataAndAssumptions),
    experiments: strs(raw.experiments), missing: strs(raw.missing),
  }
}
