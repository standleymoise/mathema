// Template-based, deterministic assistance for Understand / Research modes.
// Reads only the model's own data; never claims knowledge it doesn't have.
import type { Lang, MathModel } from './types'
import { normName, strip, tr, words } from './text'
import { provLabel } from './analyzer'
import { fitPoly } from './engine/stats'

type Section = { title: string; items: string[] }

export function explainModel(m: MathModel, query: string, lang: Lang): { text: string; list: Section[] } {
  const L = (en: string, es: string) => tr(lang, en, es)
  const q = new Set(words(query))
  const hits = m.variables.filter((v) => normName(v.name).split(' ').some((t) => t && q.has(t)) || q.has(strip(v.symbol.toLowerCase())))
  const list: Section[] = []
  if (hits.length) list.push({ title: L('Variables you asked about', 'Variables por las que preguntaste'), items: hits.map((v) => `${v.name} (${v.symbol}) — ${v.definition} · ${v.unit} · ${provLabel(v.provenance, lang)}${v.value !== undefined ? ` · ${v.value}` : ''}`) })
  list.push({ title: L('Equations', 'Ecuaciones'), items: m.equations.length ? m.equations.map((e) => `${e.label}: ${e.expr ?? e.latex}`) : [L('None — this model is structural/qualitative.', 'Ninguna — este modelo es estructural/cualitativo.')] })
  list.push({ title: L('How to read it', 'Cómo leerlo'), items: [m.methodRationale] })
  if (m.spec.kind === 'regression') {
    const f = fitPoly(m.spec.x, m.spec.y, m.spec.degree)
    if (f.ok) list.push({ title: L('Fit (computed)', 'Ajuste (calculado)'), items: [`R² = ${f.r2.toFixed(3)}, n = ${f.n}, σ̂ = ${f.sigma.toFixed(3)}`, L('R² measures how much variation the curve captures in THIS sample; it does not show causation or out-of-sample accuracy.', 'R² mide cuánta variación captura la curva en ESTA muestra; no muestra causalidad ni precisión fuera de la muestra.')] })
  }
  list.push({ title: L('Limits', 'Límites'), items: m.limitations })
  return { text: L(`Here is what “${m.title}” contains, read directly from the stored model.`, `Esto es lo que contiene “${m.title}”, leído directamente del modelo almacenado.`), list }
}

export function researchNotes(m: MathModel, others: MathModel[], lang: Lang): { text: string; list: Section[] } {
  const L = (en: string, es: string) => tr(lang, en, es)
  const weak = m.variables.filter((v) => v.value !== undefined && (v.provenance === 'system-hypothesis' || v.provenance === 'user-assumption'))
  const hyps = [
    ...m.hypotheses.map((h) => `${h.text} — ${L('needs', 'requiere')}: ${h.needs}`),
    ...weak.slice(0, 3).map((v) => L(`The value of “${v.name}” (${v.value} ${v.unit}) is not evidence: estimate it from data.`, `El valor de “${v.name}” (${v.value} ${v.unit}) no es evidencia: estimarlo con datos.`)),
  ]
  const gaps = [
    L(`Validation status: ${m.validation.status}. ${m.validation.notes}`, `Estado de validación: ${m.validation.status}. ${m.validation.notes}`),
    ...(m.spec.kind === 'causal' || m.spec.kind === 'conceptual' ? m.spec.gaps : []),
    ...weak.map((v) => L(`No data behind “${v.name}” (${provLabel(v.provenance, lang)}).`, `Sin datos detrás de “${v.name}” (${provLabel(v.provenance, lang)}).`)),
  ]
  const designs: Record<MathModel['kind'], string[]> = {
    function: [L('Collect paired (input, output) observations across the input range and fit the parameters; compare against this curve on held-out points.', 'Reunir observaciones pareadas (entrada, salida) en todo el rango y ajustar los parámetros; comparar con esta curva en puntos reservados.')],
    regression: [L('Hold out 20–30% of the observations, or collect a new sample, and check prediction error; add candidate confounders as covariates.', 'Reservar 20–30% de las observaciones, o recolectar una muestra nueva, y comprobar el error de predicción; agregar posibles variables de confusión como covariables.')],
    dynamic: [L('Record the state at several times, fit rate parameters, and check whether the fitted trajectory predicts later observations.', 'Registrar el estado en varios tiempos, ajustar las tasas y comprobar si la trayectoria ajustada predice observaciones posteriores.')],
    optimization: [L('Measure the real coefficients and limits; test whether the recommended plan beats the current practice on a pilot.', 'Medir los coeficientes y límites reales; probar si el plan recomendado supera la práctica actual en un piloto.')],
    causal: [L('For one edge, design an intervention (or natural experiment) that changes the cause while holding other nodes fixed.', 'Para una arista, diseñar una intervención (o experimento natural) que cambie la causa manteniendo fijos los demás nodos.')],
    conceptual: [L('Pick the most central concept and define how it would be measured; then look for any existing data on it.', 'Elegir el concepto más central y definir cómo se mediría; luego buscar datos existentes.')],
  }
  const comp = others.filter((o) => o.id !== m.id && o.concepts.some((c) => m.concepts.some((d) => normName(c) === normName(d)))).map((o) => `${o.title} (${o.kind})`)
  return {
    text: L(`Research view of “${m.title}”. Hypotheses below are prompts, not findings.`, `Vista de investigación de “${m.title}”. Las hipótesis son sugerencias, no hallazgos.`),
    list: [
      { title: L('Hypotheses to test', 'Hipótesis a contrastar'), items: hyps.length ? hyps : [L('None recorded yet.', 'Ninguna registrada todavía.')] },
      { title: L('Evidence gaps', 'Vacíos de evidencia'), items: gaps },
      { title: L('Possible experiment design', 'Posible diseño experimental'), items: designs[m.kind] },
      { title: L('Models to compare against', 'Modelos con los que comparar'), items: comp.length ? comp : [L('No stored model shares concepts with this one.', 'Ningún modelo almacenado comparte conceptos con este.')] },
    ],
  }
}
