// Deterministic *heuristic* analyzer. It is NOT a language model: it extracts structure with
// explicit rules (equation syntax, numeric tables, causal verbs, keywords) and says so.
// A real LLM provider plugs in behind services/ai.ts and returns the same `Analysis` shape.
import type { Formalization, Lang, MathModel, Variable } from './types'
import { compile, toLatex } from './engine/expr'
import { isStop, normName, now, strip, symbolFor, tr, uid } from './text'

export interface Dataset { x: number[]; y: number[]; xLabel: string; yLabel: string; note: string }
export interface AnalysisInput { text: string; lang: Lang; datasets?: Dataset[] }
export interface Analysis {
  title: string
  topic: string
  centralQuestion: string
  formalization: Formalization
  draft: MathModel
  concepts: string[]
  engine: string
}

export const ENGINE_ID = 'local-heuristics'

const normalizeMath = (s: string) => s.replace(/×|·/g, '*').replace(/−|–/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/√/g, 'sqrt').replace(/π/g, 'pi')

// ---- dataset parsing ---------------------------------------------------------
export function parseTable(text: string, fallbackNames = ['x', 'y']): Dataset | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const split = (l: string) => l.split(/[,\t;]+|\s{2,}|\s(?=-?\d)/).map((c) => c.trim()).filter((c) => c !== '')
  const rows = lines.map(split)
  const isNum = (c: string) => /^-?\d+([.,]\d+)?$/.test(c)
  let header: string[] | undefined
  const data: number[][] = []
  for (const r of rows) {
    if (r.length >= 2 && r.slice(0, 2).every(isNum)) data.push(r.map((c) => (isNum(c) ? Number(c.replace(',', '.')) : NaN)))
    else if (!data.length && r.length >= 2 && r.every((c) => !isNum(c))) header = r
  }
  if (data.length < 6) return null
  const cols = Math.min(...data.map((r) => r.length))
  if (cols < 2) return null
  return {
    x: data.map((r) => r[0]), y: data.map((r) => r[1]),
    xLabel: header?.[0] ?? fallbackNames[0], yLabel: header?.[1] ?? fallbackNames[1],
    note: cols > 2 ? `Table has ${cols} numeric columns; only the first two were used.` : '',
  }
}

// ---- phrases & relations ---------------------------------------------------------
function runs(sentence: string): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  for (const tok of strip(sentence.toLowerCase()).replace(/[,:()"]/g, ' | ').split(/\s+/)) {
    if (tok === '|' || tok === '' ) { if (cur.length) out.push(cur); cur = []; continue }
    if (isStop(tok) || tok.length < 3 || /^\d/.test(tok)) { if (cur.length) out.push(cur); cur = []; continue }
    cur.push(tok)
  }
  if (cur.length) out.push(cur)
  return out
}
const VERBS: [RegExp, 1 | -1 | 0, string][] = [
  [/^(increas|rais|boost|improv|enhanc|promot|drive|favor|elev|impuls|aument|increment|mejor|incrementa)/, 1, '+'],
  [/^(reduc|decreas|lower|limit|hurt|harm|inhibit|diminuy|perjudic|dañ|dan|disminu)/, -1, '-'],
  [/^(affect|influenc|caus|lead|depend|determin|afect|influy|provoc|genera|generate)/, 0, '?'],
]
export interface RelationHit { from: string; to: string; sign: 1 | -1 | 0 }
export function extractRelations(text: string): RelationHit[] {
  const hits: RelationHit[] = []
  for (const s of text.split(/[.!?\n;]+/)) {
    const toks = strip(s.toLowerCase()).split(/\s+/)
    for (let i = 1; i < toks.length - 1; i++) {
      const verb = VERBS.find(([re]) => re.test(toks[i]))
      if (!verb) continue
      const left = [] as string[], right = [] as string[]
      for (let j = i - 1; j >= 0 && left.length < 3; j--) { const w = toks[j].replace(/[^a-zñ0-9_]/g, ''); if (!w || isStop(w) || w.length < 3) { if (left.length) break; else continue } left.unshift(w) }
      for (let j = i + 1; j < toks.length && right.length < 3; j++) { const w = toks[j].replace(/[^a-zñ0-9_]/g, ''); if (!w || isStop(w) || w.length < 3) { if (right.length) break; else continue } right.push(w) }
      if (left.length && right.length) { hits.push({ from: left.join(' '), to: right.join(' '), sign: verb[1] }); break }
    }
  }
  return hits
}
export function extractConcepts(text: string, max = 8): string[] {
  const count = new Map<string, { n: number; label: string }>()
  for (const s of text.split(/[.!?\n;]+/)) {
    for (const run of runs(s)) {
      for (const len of [Math.min(run.length, 2), 1]) {
        for (let i = 0; i + len <= run.length; i++) {
          const label = run.slice(i, i + len).join(' ')
          const key = normName(label)
          if (!key) continue
          const e = count.get(key) ?? { n: 0, label }
          e.n += len === 2 ? 1.5 : 1
          count.set(key, e)
        }
      }
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n || b.label.length - a.label.length).slice(0, max).map((e) => e.label)
}

const hasAny = (t: string, list: string[]) => { const w = strip(t.toLowerCase()); return list.some((k) => w.includes(k)) }
const OPT_WORDS = ['maximi', 'minimi', 'optimi', 'constraint', 'restriccion', 'limited budget', 'presupuesto', 'subject to', 'sujeto a', 'best allocation', 'asign']
const DYN_WORDS = ['over time', 'growth', 'decay', 'evolv', 'per day', 'per year', 'epidemic', 'population', 'accumul', 'crecimiento', 'a lo largo del tiempo', 'evoluci', 'poblacion', 'epidemia', 'decaimiento', 'por dia', 'por ano', 'dynamics', 'dinamica']

function findEquation(text: string) {
  const t = normalizeMath(text)
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*[A-Za-z_][A-Za-z0-9_]*\s*\))?\s*=\s*([^\n;]+?)(?:\.\s|\.$|$|\n|;)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const rhs = m[2].trim().replace(/\.$/, '')
    if (!/[+\-*/^]|\(|[a-z]/i.test(rhs) || /^\d+(\.\d+)?$/.test(rhs)) continue
    const c = compile(rhs)
    if (c.ok && c.vars.length >= 1) return { lhs: m[1], rhs, vars: c.vars }
  }
  return null
}

// ---- builders ------------------------------------------------------------------------
type Kindish = { model: Omit<MathModel, 'id' | 'version' | 'originalInput' | 'createdAt' | 'updatedAt' | 'versions' | 'isDemo' | 'scenarios' | 'title' | 'description' | 'concepts' | 'sourceIds'>; form: Omit<Formalization, 'claim' | 'variables' | 'missing'> & { missing: string[] }; varsNote?: string }

function circleLayout(n: number) {
  return Array.from({ length: n }, (_, i) => ({ x: 310 + 230 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: 170 + 130 * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }))
}

export function analyze({ text, lang, datasets = [] }: AnalysisInput): Analysis {
  const L = (en: string, es: string) => tr(lang, en, es)
  const clean = text.trim()
  const concepts = extractConcepts(clean)
  const relations = extractRelations(clean)
  const eq = findEquation(clean)
  const tableFromText = datasets[0] ?? parseTable(clean)
  const nums = clean.match(/-?\d+(?:[.,]\d+)?\s?(?:%|°\s?C|mm|kg|ha|t\/ha|days|días|usd|\$|€)/gi) ?? []
  const used = new Set<string>()
  const firstSentence = clean.split(/[.!?\n]/)[0]?.trim() ?? ''
  const title = (firstSentence.length > 70 ? firstSentence.slice(0, 67) + '…' : firstSentence) || L('Untitled idea', 'Idea sin título')
  const topic = concepts.slice(0, 3).join(', ') || L('unspecified', 'sin especificar')
  const question = /\?/.test(clean) ? clean.split(/(?<=\?)/)[0].trim().split('\n').pop()!.trim() : L(`How are ${concepts[0] ?? 'the main quantity'} and ${concepts[1] ?? 'its drivers'} related, and what follows from it?`, `¿Cómo se relacionan ${concepts[0] ?? 'la cantidad principal'} y ${concepts[1] ?? 'sus factores'}, y qué se sigue de ello?`)

  const mkVar = (name: string, o: Partial<Variable> = {}): Variable => ({
    id: uid('var'), name, symbol: symbolFor(name, used), definition: L('Defined by the system from the text; confirm or edit.', 'Definida por el sistema a partir del texto; confirmar o editar.'),
    unit: '—', role: 'concept', provenance: 'system-hypothesis', ...o,
  })

  let kind: MathModel['kind']
  let k: Kindish

  if (eq) {
    kind = 'function'
    const indep = eq.vars.includes('x') ? 'x' : eq.vars.includes('t') ? 't' : eq.vars[0]
    const params = eq.vars.filter((v) => v !== indep)
    params.forEach((p) => used.add(p))
    used.add(indep)
    const latex = toLatex(eq.rhs)
    k = {
      model: {
        kind: 'function', method: L('Parametric function of one variable', 'Función paramétrica de una variable'),
        methodRationale: L(`The text contains an explicit equation, ${eq.lhs} = f(${indep}). It is parsed and evaluated exactly; nothing is inferred about its truth.`, `El texto contiene una ecuación explícita, ${eq.lhs} = f(${indep}). Se interpreta y evalúa exactamente; no se infiere nada sobre su validez.`),
        variables: [
          { id: uid('var'), name: indep, symbol: indep, definition: L('Independent variable (name taken from the equation).', 'Variable independiente (nombre tomado de la ecuación).'), unit: '—', role: 'input', min: 0, max: 10, provenance: 'source' },
          ...params.map((p): Variable => ({ id: uid('var'), name: p, symbol: p, definition: L('Parameter found in the equation. Its default value 1 is a placeholder — set a real value.', 'Parámetro encontrado en la ecuación. Su valor por defecto 1 es un marcador — asigná un valor real.'), unit: '—', value: 1, min: -10, max: 10, step: 0.1, role: 'parameter', provenance: 'system-hypothesis' })),
          { id: uid('var'), name: eq.lhs, symbol: eq.lhs, definition: L('Dependent variable (left-hand side).', 'Variable dependiente (lado izquierdo).'), unit: '—', role: 'output', provenance: 'source' },
        ],
        equations: [{ id: uid('eq'), label: `${eq.lhs} = f(${indep})`, expr: eq.rhs, latex: latex ?? undefined, provenance: 'source', editable: true }],
        assumptions: [{ id: uid('as'), text: L('Parameter values are placeholders (=1) until supplied by you or by data.', 'Los valores de parámetros son marcadores (=1) hasta que los aportes o provengan de datos.'), provenance: 'system-hypothesis' }],
        limitations: [L('The equation is taken as stated; the system did not verify it against evidence.', 'La ecuación se toma tal como fue enunciada; el sistema no la verificó con evidencia.')],
        hypotheses: [], validation: { status: 'unvalidated', notes: L('Equation from the user’s text. No data compared.', 'Ecuación del texto del usuario. Sin datos comparados.') },
        spec: { kind: 'function', expr: eq.rhs, xName: indep, xMin: 0, xMax: 10, xLabel: indep, yLabel: eq.lhs },
      },
      form: {
        formalizable: [L(`The explicit relation ${eq.lhs} = ${eq.rhs}.`, `La relación explícita ${eq.lhs} = ${eq.rhs}.`)],
        notFormalizable: [L('Meaning of the symbols and their units (not stated in the text).', 'Significado de los símbolos y sus unidades (no se indican en el texto).')],
        method: L('Parametric function', 'Función paramétrica'),
        why: L('An explicit equation in one independent variable is evaluated and plotted directly, with its parameters as sliders.', 'Una ecuación explícita en una variable independiente se evalúa y grafica directamente, con sus parámetros como controles deslizantes.'),
        equations: [`${eq.lhs} = ${eq.rhs}`],
        dataAndAssumptions: [L('Values for every parameter; units of each symbol.', 'Valores de cada parámetro; unidades de cada símbolo.')],
        limitations: [L('Plotting an equation does not test whether it describes anything real.', 'Graficar una ecuación no prueba que describa algo real.')],
        experiments: [L('Sweep each parameter and see which one changes the curve most (sensitivity).', 'Variar cada parámetro y ver cuál modifica más la curva (sensibilidad).')],
        missing: [L('Units and plausible ranges for the parameters.', 'Unidades y rangos plausibles de los parámetros.')],
      },
    }
  } else if (tableFromText) {
    kind = 'regression'
    const d = tableFromText
    k = {
      model: {
        kind: 'regression', method: L('Ordinary least squares (polynomial, degree 1–2)', 'Mínimos cuadrados ordinarios (polinomial, grado 1–2)'),
        methodRationale: L('Paired numeric observations were found, so a statistical model with explicit uncertainty is appropriate. It describes association only.', 'Se encontraron observaciones numéricas pareadas, por lo que un modelo estadístico con incertidumbre explícita es adecuado. Describe solo asociación.'),
        variables: [
          { id: uid('var'), name: d.xLabel, symbol: 'x', definition: L('Predictor column (first column).', 'Columna predictora (primera columna).'), unit: '—', role: 'input', provenance: 'source' },
          { id: uid('var'), name: d.yLabel, symbol: 'y', definition: L('Response column (second column).', 'Columna de respuesta (segunda columna).'), unit: '—', role: 'output', provenance: 'source' },
        ],
        equations: [{ id: uid('eq'), label: L('Polynomial regression', 'Regresión polinomial'), latex: 'y_i = \\beta_0 + \\beta_1 x_i + \\beta_2 x_i^2 + \\varepsilon_i,\; \\varepsilon_i\\sim\\mathcal{N}(0,\\sigma^2)', provenance: 'derived', editable: false }],
        assumptions: [{ id: uid('as'), text: L('Independent observations, Gaussian errors, constant variance.', 'Observaciones independientes, errores gaussianos, varianza constante.'), provenance: 'system-hypothesis' }],
        limitations: [L('Association is not causation.', 'Asociación no es causalidad.'), L('Extrapolating beyond the observed range is unreliable.', 'Extrapolar fuera del rango observado no es confiable.'), ...(d.note ? [d.note] : [])],
        hypotheses: [], validation: { status: 'fit-to-data', notes: L('Fitted to the provided table. Fit is not validation: no held-out data were used.', 'Ajustado a la tabla provista. Ajustar no es validar: no se usaron datos de prueba.') },
        spec: { kind: 'regression', x: d.x, y: d.y, xLabel: d.xLabel, yLabel: d.yLabel, degree: 1 },
      },
      form: {
        formalizable: [L(`${d.x.length} paired observations (${d.xLabel}, ${d.yLabel}).`, `${d.x.length} observaciones pareadas (${d.xLabel}, ${d.yLabel}).`)],
        notFormalizable: [L('Why the variables are related (mechanism).', 'Por qué se relacionan las variables (mecanismo).')],
        method: L('Least-squares regression with 95% intervals', 'Regresión por mínimos cuadrados con intervalos al 95%'),
        why: L('Data exist, so we estimate the trend and, crucially, its uncertainty.', 'Hay datos, así que estimamos la tendencia y, sobre todo, su incertidumbre.'),
        equations: ['y = β₀ + β₁x (+ β₂x²) + ε'],
        dataAndAssumptions: [L('Independent, homoscedastic Gaussian errors.', 'Errores independientes, homocedásticos y gaussianos.')],
        limitations: [L('Fit ≠ validation; confounders are not controlled.', 'Ajuste ≠ validación; no se controlan variables de confusión.')],
        experiments: [L('Compare degree 1 vs 2; inspect residuals for structure; hold out part of the data.', 'Comparar grado 1 vs 2; inspeccionar residuos; reservar parte de los datos.')],
        missing: [L('Units, measurement error, and information on confounders.', 'Unidades, error de medición e información sobre variables de confusión.')],
      },
    }
  } else if (hasAny(clean, OPT_WORDS)) {
    kind = 'optimization'
    const a = concepts[0] ?? L('Option A', 'Opción A'), b = concepts[1] ?? L('Option B', 'Opción B')
    k = {
      model: {
        kind: 'optimization', method: L('Linear programming (template)', 'Programación lineal (plantilla)'),
        methodRationale: L('The text speaks of maximising/minimising under limits. A two-option linear program is the simplest structure that captures that; its coefficients are placeholders.', 'El texto habla de maximizar/minimizar bajo límites. Un programa lineal de dos opciones es la estructura más simple que lo captura; sus coeficientes son marcadores.'),
        variables: [
          mkVar(L(`Value per unit of ${a}`, `Valor por unidad de ${a}`), { symbol: 'cx', value: 3, min: 0, max: 10, step: 0.5, role: 'parameter' }),
          mkVar(L(`Value per unit of ${b}`, `Valor por unidad de ${b}`), { symbol: 'cy', value: 2, min: 0, max: 10, step: 0.5, role: 'parameter' }),
          mkVar(L('Limit of resource 1', 'Límite del recurso 1'), { symbol: 'rhs_r1', value: 100, min: 10, max: 200, step: 5, role: 'parameter' }),
          mkVar(L('Limit of resource 2', 'Límite del recurso 2'), { symbol: 'rhs_r2', value: 120, min: 10, max: 300, step: 5, role: 'parameter' }),
        ],
        equations: [{ id: uid('eq'), label: L('Linear program', 'Programa lineal'), latex: '\\max\; c_x x + c_y y\;\\text{s.t.}\; x+y\\le b_1,\; x+2y\\le b_2,\; x,y\\ge0', provenance: 'system-hypothesis', editable: false }],
        assumptions: [{ id: uid('as'), text: L('ALL coefficients are illustrative placeholders; replace with your real values.', 'TODOS los coeficientes son marcadores ilustrativos; reemplazalos por tus valores reales.'), provenance: 'system-hypothesis' }],
        limitations: [L('The structure (two options, two resources) was chosen by the system and may not match your problem.', 'La estructura (dos opciones, dos recursos) la eligió el sistema y puede no ajustarse a tu problema.')],
        hypotheses: [], validation: { status: 'unvalidated', notes: L('Template with placeholder numbers.', 'Plantilla con números marcadores.') },
        spec: { kind: 'optimization', xName: a, yName: b, cx: 3, cy: 2, objectiveLabel: L('value', 'valor'), constraints: [{ id: 'r1', label: L('Resource 1', 'Recurso 1'), a: 1, b: 1, rhs: 100 }, { id: 'r2', label: L('Resource 2', 'Recurso 2'), a: 1, b: 2, rhs: 120 }] },
      },
      form: {
        formalizable: [L('A choice between options under limited resources.', 'Una elección entre opciones con recursos limitados.')],
        notFormalizable: [L('The actual coefficients and limits (not in the text).', 'Los coeficientes y límites reales (no están en el texto).')],
        method: L('Linear programming', 'Programación lineal'), why: L('Linear objective and linear limits give an exactly solvable problem.', 'Objetivo y límites lineales dan un problema resoluble de forma exacta.'),
        equations: ['max cₓx + c_y y  s.a.  x + y ≤ b₁,  x + 2y ≤ b₂'],
        dataAndAssumptions: [L('Real coefficients, resource use per unit and limits.', 'Coeficientes reales, uso de recursos por unidad y límites.')],
        limitations: [L('Placeholders only.', 'Solo marcadores.')],
        experiments: [L('Move each limit and watch the optimum jump between vertices; find the binding constraint.', 'Mover cada límite y ver cómo el óptimo salta entre vértices; hallar la restricción activa.')],
        missing: [L('Actual numbers for values and limits.', 'Números reales de valores y límites.')],
      },
    }
  } else if (hasAny(clean, DYN_WORDS) && concepts.length) {
    kind = 'dynamic'
    const stock = concepts[0]
    k = {
      model: {
        kind: 'dynamic', method: L('Logistic ODE (template, RK4)', 'EDO logística (plantilla, RK4)'),
        methodRationale: L('The text describes change over time. Saturating growth is the most common minimal dynamic; it is a template, not a finding.', 'El texto describe cambio en el tiempo. El crecimiento con saturación es la dinámica mínima más común; es una plantilla, no un hallazgo.'),
        variables: [
          mkVar(L('Growth rate', 'Tasa de crecimiento'), { symbol: 'r', value: 0.3, min: 0, max: 1, step: 0.01, role: 'parameter', unit: '1/t' }),
          mkVar(L('Capacity', 'Capacidad'), { symbol: 'K', value: 100, min: 10, max: 300, step: 5, role: 'parameter' }),
          mkVar(L('Initial value', 'Valor inicial'), { symbol: 'S0', value: 5, min: 0.5, max: 50, step: 0.5, role: 'parameter' }),
          mkVar(stock, { symbol: 'S', role: 'state', provenance: 'simulated' }),
        ],
        equations: [{ id: uid('eq'), label: L('Logistic growth', 'Crecimiento logístico'), expr: 'r*S*(1-S/K)', provenance: 'system-hypothesis', editable: true }],
        assumptions: [{ id: uid('as'), text: L('Placeholder parameters; saturation at K is assumed, not observed.', 'Parámetros marcadores; la saturación en K se asume, no se observa.'), provenance: 'system-hypothesis' }],
        limitations: [L('Real dynamics may oscillate, have delays, thresholds or noise.', 'La dinámica real puede oscilar, tener retardos, umbrales o ruido.')],
        hypotheses: [], validation: { status: 'simulated-only', notes: L('Simulation of a template.', 'Simulación de una plantilla.') },
        spec: { kind: 'dynamic', states: [{ id: 'S', label: stock, expr: 'r*S*(1-S/K)', init: 'S0' }], tEnd: 40, tLabel: L('Time', 'Tiempo'), yLabel: stock },
      },
      form: {
        formalizable: [L(`Change of “${stock}” over time.`, `Cambio de “${stock}” en el tiempo.`)],
        notFormalizable: [L('Rates, capacity and initial condition (no numbers given).', 'Tasas, capacidad y condición inicial (no hay números).')],
        method: L('Ordinary differential equation', 'Ecuación diferencial ordinaria'), why: L('Rates of change over time are the language of ODEs; solved numerically.', 'Las tasas de cambio en el tiempo son el lenguaje de las EDO; se resuelve numéricamente.'),
        equations: ['dS/dt = r S (1 − S/K)'],
        dataAndAssumptions: [L('A time series to calibrate r, K and S₀.', 'Una serie temporal para calibrar r, K y S₀.')],
        limitations: [L('Template dynamics.', 'Dinámica de plantilla.')],
        experiments: [L('Compare growth-rate scenarios; test sensitivity of the final value to K and r.', 'Comparar escenarios de tasa de crecimiento; probar la sensibilidad del valor final a K y r.')],
        missing: [L('Observations over time.', 'Observaciones a lo largo del tiempo.')],
      },
    }
  } else {
    // causal / conceptual graph
    const names: string[] = []
    const add = (n: string) => { const key = normName(n); if (!names.some((x) => normName(x) === key)) names.push(n); return names.findIndex((x) => normName(x) === key) }
    const edgesRaw = relations.map((r) => ({ f: add(r.from), t: add(r.to), sign: r.sign }))
    concepts.slice(0, 6).forEach(add)
    const n = names.slice(0, 9)
    const pos = circleLayout(n.length)
    const causal = edgesRaw.length >= 1
    kind = causal ? 'causal' : 'conceptual'
    const nodes = n.map((label, i) => ({ id: `n${i}`, label, x: pos[i].x, y: pos[i].y }))
    const edges = edgesRaw.filter((e) => e.f < n.length && e.t < n.length).map((e, i) => ({ id: `ed${i}`, from: `n${e.f}`, to: `n${e.t}`, sign: e.sign, note: L('Extracted from a causal verb in the text; direction is the author’s claim.', 'Extraída de un verbo causal en el texto; la dirección es la afirmación del autor.') }))
    k = {
      model: {
        kind, method: causal ? L('Signed directed graph (qualitative causal hypotheses)', 'Grafo dirigido con signos (hipótesis causales cualitativas)') : L('Concept map', 'Mapa conceptual'),
        methodRationale: causal
          ? L(`${edges.length} cause–effect claim(s) were found but no quantities, so the honest formalisation is a signed graph of the claims.`, `Se encontraron ${edges.length} afirmación(es) causa–efecto pero no cantidades; la formalización honesta es un grafo con signos de las afirmaciones.`)
          : L('No equations, tables or causal verbs were found. The recoverable structure is the set of concepts; relations must be added by you.', 'No se hallaron ecuaciones, tablas ni verbos causales. La estructura recuperable es el conjunto de conceptos; las relaciones debés agregarlas vos.'),
        variables: n.map((label) => mkVar(label)),
        equations: [],
        assumptions: [{ id: uid('as'), text: L('Edges mirror claims in the text; they are not identified from data.', 'Las aristas reflejan afirmaciones del texto; no están identificadas con datos.'), provenance: 'system-hypothesis' }],
        limitations: [L('Not quantified: no prediction is possible yet.', 'Sin cuantificar: todavía no es posible predecir.'), L('A graph of claims is not evidence for them.', 'Un grafo de afirmaciones no es evidencia de ellas.')],
        hypotheses: edges.slice(0, 3).map((e) => ({ id: uid('h'), text: `${n[+e.from.slice(1)]} → ${n[+e.to.slice(1)]}`, status: 'open' as const, needs: L('Measurements of both quantities over varying conditions, ideally an intervention.', 'Mediciones de ambas cantidades bajo condiciones variables, idealmente una intervención.') })),
        validation: { status: 'unvalidated', notes: L('Conceptual structure only.', 'Solo estructura conceptual.') },
        spec: { kind, nodes, edges, gaps: [L('Strength and functional form of each relation unknown.', 'Se desconocen la intensidad y la forma funcional de cada relación.'), L('Variables, units and measurement methods are undefined.', 'Variables, unidades y métodos de medición sin definir.')] },
      },
      form: {
        formalizable: [L(`${n.length} concept(s)${edges.length ? ` and ${edges.length} directed claim(s)` : ''}.`, `${n.length} concepto(s)${edges.length ? ` y ${edges.length} afirmación(es) dirigida(s)` : ''}.`)],
        notFormalizable: [L('Magnitudes, functional form, timescales.', 'Magnitudes, forma funcional, escalas de tiempo.')],
        method: causal ? L('Signed causal graph', 'Grafo causal con signos') : L('Concept map', 'Mapa conceptual'),
        why: L('Without quantities, a structure of relations is the most rigorous thing that can be stated.', 'Sin cantidades, una estructura de relaciones es lo más riguroso que se puede afirmar.'),
        equations: [], dataAndAssumptions: [L('Operational definitions and measurements for each concept.', 'Definiciones operativas y mediciones de cada concepto.')],
        limitations: [L('Cannot be simulated until quantified.', 'No puede simularse hasta cuantificarse.')],
        experiments: [L('Choose one edge and design a measurement or intervention that could contradict it.', 'Elegir una arista y diseñar una medición o intervención que pueda contradecirla.')],
        missing: [L('What could be measured for each concept; any data at all.', 'Qué podría medirse de cada concepto; cualquier dato.')],
      },
    }
  }

  const explicit = new Set(k.model.variables.filter((v) => v.provenance === 'source').map((v) => v.name))
  const formalization: Formalization = {
    claim: firstSentence || clean.slice(0, 140),
    ...k.form,
    variables: k.model.variables.filter((v) => v.role !== 'state').map((v) => ({
      name: v.name, kind: explicit.has(v.name) ? 'explicit' : 'potential',
      note: `${v.role}${v.unit && v.unit !== '—' ? ` · ${v.unit}` : ''} · ${provLabel(v.provenance, lang)}`,
    })),
    missing: [...k.form.missing, ...(nums.length ? [] : [L('The text contains no quantitative values.', 'El texto no contiene valores cuantitativos.')])],
  }

  const draft: MathModel = {
    id: uid('mdl'), version: 1, isDemo: false, createdAt: now(), updatedAt: now(), versions: [], scenarios: [],
    title, description: L(`Draft model built from your idea by the local heuristic analyzer (${kind}). Review every assumption.`, `Modelo borrador construido a partir de tu idea por el analizador heurístico local (${kind}). Revisá cada supuesto.`),
    originalInput: clean, concepts: concepts.slice(0, 8), sourceIds: [],
    ...k.model,
  }
  return { title, topic, centralQuestion: question, formalization, draft, concepts, engine: ENGINE_ID }
}

export function provLabel(p: Variable['provenance'], lang: Lang): string {
  const m: Record<Variable['provenance'], [string, string]> = {
    source: ['from source', 'de la fuente'], derived: ['derived', 'derivado'], 'user-assumption': ['user assumption', 'supuesto del usuario'],
    'system-hypothesis': ['system hypothesis', 'hipótesis del sistema'], estimated: ['estimated', 'estimado'], simulated: ['simulated', 'simulado'], validated: ['validated', 'validado'],
  }
  return m[p][lang === 'es' ? 1 : 0]
}
