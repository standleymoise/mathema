// Memory: retrieval of related knowledge, merge/link proposals and the Knowledge Universe graph.
// Nothing is merged automatically; every proposal carries its justification and warnings.
import type { DB, Lang, MathModel, Proposal, Relation, RelationType } from './types'
import { cosine, normName, termSet, tr, uid } from './text'
import { fitPoly } from './engine/stats'

const signature = (m: MathModel) =>
  termSet([m.title, m.description, m.originalInput, m.concepts.join(' '), m.variables.map((v) => v.name).join(' ')].join(' '))

export function findRelated(draft: MathModel, models: MathModel[], lang: Lang, exclude: string[] = []): Proposal[] {
  const L = (en: string, es: string) => tr(lang, en, es)
  const sigD = signature(draft)
  const varsD = new Map(draft.variables.map((v) => [normName(v.name), v]))
  const out: Proposal[] = []
  for (const m of models) {
    if (m.id === draft.id || exclude.includes(m.id)) continue
    const cos = cosine(sigD, signature(m))
    const shared = m.variables.filter((v) => varsD.has(normName(v.name)) && normName(v.name))
    const sharedConcepts = m.concepts.filter((c) => draft.concepts.some((d) => normName(d) === normName(c)))
    const denom = Math.max(1, Math.min(varsD.size, m.variables.length))
    const score = 0.6 * cos + 0.4 * Math.min(1, (shared.length + sharedConcepts.length * 0.5) / denom)
    if (score < 0.12 && !shared.length) continue
    const reasons: string[] = []
    if (shared.length) reasons.push(L(`Shared variables: ${shared.map((v) => v.name).join(', ')}.`, `Variables compartidas: ${shared.map((v) => v.name).join(', ')}.`))
    if (sharedConcepts.length) reasons.push(L(`Shared concepts: ${sharedConcepts.join(', ')}.`, `Conceptos compartidos: ${sharedConcepts.join(', ')}.`))
    reasons.push(L(`Text similarity ${(cos * 100).toFixed(0)}% (bag-of-words cosine).`, `Similitud de texto ${(cos * 100).toFixed(0)}% (coseno de bolsa de palabras).`))
    const warnings: string[] = []
    for (const v of shared) {
      const d = varsD.get(normName(v.name))!
      if (d.unit !== v.unit && d.unit !== '—' && v.unit !== '—') warnings.push(L(`“${v.name}” has different units: ${d.unit} vs ${v.unit}.`, `“${v.name}” tiene unidades distintas: ${d.unit} vs ${v.unit}.`))
    }
    if (draft.kind !== m.kind) warnings.push(L(`Different model type (${draft.kind} vs ${m.kind}): definitions and assumptions may not carry over.`, `Tipo de modelo distinto (${draft.kind} vs ${m.kind}): definiciones y supuestos pueden no ser transferibles.`))
    const newVersion = score >= 0.6 && draft.kind === m.kind
    const relationType: RelationType = newVersion ? 'equivalent-to' : shared.length ? 'shares-variables-with' : 'compatible-with'
    out.push({ id: uid('prop'), targetModelId: m.id, similarity: score, reasons, warnings, suggestion: newVersion ? 'new-version' : 'link', relationType, state: 'open' })
  }
  return out.sort((a, b) => b.similarity - a.similarity).slice(0, 3)
}

// ---- Knowledge Universe ----------------------------------------------------------------
export type NodeType = 'idea' | 'concept' | 'variable' | 'model' | 'equation' | 'source' | 'document' | 'experiment' | 'hypothesis' | 'result'
export interface UNode { id: string; label: string; type: NodeType; detail: string; ref?: { model?: string; source?: string; experiment?: string } }
export interface UEdge { id: string; from: string; to: string; type: RelationType; justification: string; inferred: boolean; relationId?: string }

export function buildUniverse(db: DB, lang: Lang): { nodes: UNode[]; edges: UEdge[] } {
  const L = (en: string, es: string) => tr(lang, en, es)
  const nodes = new Map<string, UNode>()
  const edges: UEdge[] = []
  const edge = (from: string, to: string, type: RelationType, justification: string, inferred = false, relationId?: string) => {
    if (!nodes.has(from) || !nodes.has(to)) return
    edges.push({ id: `${from}>${to}:${type}:${edges.length}`, from, to, type, justification, inferred, relationId })
  }
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

  for (const m of db.models) nodes.set(m.id, { id: m.id, label: m.title, type: 'model', detail: m.description, ref: { model: m.id } })
  for (const s of db.sources) nodes.set(s.id, { id: s.id, label: trunc(s.title, 46), type: s.kind === 'file' || s.kind === 'dataset' || s.kind === 'demo' ? 'document' : 'source', detail: s.note, ref: { source: s.id } })

  // shared variables / concepts (>=2 models) become nodes; singletons stay inside their model
  const varUse = new Map<string, { label: string; models: Set<string> }>()
  const conUse = new Map<string, { label: string; models: Set<string> }>()
  for (const m of db.models) {
    for (const v of m.variables) { const k = normName(v.name); if (!k) continue; const e = varUse.get(k) ?? { label: v.name, models: new Set() }; e.models.add(m.id); varUse.set(k, e) }
    for (const c of m.concepts) { const k = normName(c); if (!k) continue; const e = conUse.get(k) ?? { label: c, models: new Set() }; e.models.add(m.id); conUse.set(k, e) }
  }
  for (const [k, e] of varUse) if (e.models.size >= 2) {
    const id = `var:${k}`
    nodes.set(id, { id, label: e.label, type: 'variable', detail: L(`Variable used by ${e.models.size} models.`, `Variable usada por ${e.models.size} modelos.`) })
    for (const mid of e.models) edge(mid, id, 'depends-on', L(`The model uses the variable “${e.label}”.`, `El modelo usa la variable “${e.label}”.`))
  }
  for (const [k, e] of conUse) if (e.models.size >= 2) {
    const id = `con:${k}`
    nodes.set(id, { id, label: e.label, type: 'concept', detail: L(`Concept appearing in ${e.models.size} models.`, `Concepto presente en ${e.models.size} modelos.`) })
    for (const mid of e.models) edge(mid, id, 'depends-on', L(`The model is about “${e.label}”.`, `El modelo trata sobre “${e.label}”.`))
  }

  for (const m of db.models) {
    if (m.originalInput) {
      const id = `idea:${m.id}`
      nodes.set(id, { id, label: trunc(m.originalInput, 46), type: 'idea', detail: m.originalInput, ref: { model: m.id } })
      edge(m.id, id, 'derived-from', L('The model was formalised from this original input.', 'El modelo fue formalizado a partir de esta entrada original.'))
    }
    for (const eq of m.equations) {
      const id = `eq:${eq.id}`
      nodes.set(id, { id, label: trunc(eq.label, 40), type: 'equation', detail: eq.expr ?? eq.latex ?? '', ref: { model: m.id } })
      edge(m.id, id, 'contains', L('Equation belongs to the model.', 'La ecuación pertenece al modelo.'))
    }
    for (const sid of m.sourceIds) edge(m.id, sid, 'derived-from', L('Listed among the model’s sources.', 'Figura entre las fuentes del modelo.'))
    for (const h of m.hypotheses) {
      const id = `hyp:${h.id}`
      nodes.set(id, { id, label: trunc(h.text, 46), type: 'hypothesis', detail: `${h.text}\n${L('Needs', 'Requiere')}: ${h.needs}`, ref: { model: m.id } })
      edge(id, m.id, 'requires-evidence-of', L(`Evidence needed: ${h.needs}`, `Evidencia necesaria: ${h.needs}`))
    }
    if (m.spec.kind === 'regression') {
      const f = fitPoly(m.spec.x, m.spec.y, m.spec.degree)
      if (f.ok) {
        const id = `res:${m.id}`
        nodes.set(id, { id, label: `Fit R²=${f.r2.toFixed(2)} (n=${f.n})`, type: 'result', detail: L('Derived result of the regression on the stored data. Fit quality is not validation.', 'Resultado derivado de la regresión sobre los datos almacenados. Buen ajuste no es validación.'), ref: { model: m.id } })
        edge(id, m.id, 'derived-from', L('Computed deterministically from the model’s dataset.', 'Calculado de forma determinista a partir del dataset del modelo.'))
      }
    }
  }
  for (const x of db.experiments) {
    nodes.set(x.id, { id: x.id, label: trunc(x.name, 46), type: 'experiment', detail: `${x.note}\n${x.rows.map((r) => `${r.label}: ${r.value}`).join('\n')}`, ref: { model: x.modelId, experiment: x.id } })
    edge(x.id, x.modelId, 'derived-from', L(`Experiment run on the model (${x.provenance}).`, `Experimento ejecutado sobre el modelo (${x.provenance}).`))
  }
  const linked = new Set<string>()
  for (const r of db.relations) {
    if (r.status !== 'accepted') continue
    edge(r.from, r.to, r.type, r.justification, false, r.id)
    linked.add([r.from, r.to].sort().join('|'))
  }
  // inferred, clearly marked: models sharing variables with no explicit relation
  const ms = db.models
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    if (linked.has([ms[i].id, ms[j].id].sort().join('|'))) continue
    const a = new Set(ms[i].variables.map((v) => normName(v.name)).filter(Boolean))
    const shared = ms[j].variables.filter((v) => a.has(normName(v.name)))
    if (shared.length) edge(ms[i].id, ms[j].id, 'shares-variables-with', L(`Both define: ${shared.map((v) => v.name).join(', ')}. (Inferred automatically — not confirmed by you.)`, `Ambos definen: ${shared.map((v) => v.name).join(', ')}. (Inferido automáticamente — no confirmado por vos.)`), true)
  }
  return { nodes: [...nodes.values()], edges }
}

export const relationLabel = (t: RelationType, lang: Lang): string => {
  const m: Record<RelationType, [string, string]> = {
    'depends-on': ['depends on', 'depende de'], 'equivalent-to': ['is equivalent to', 'es equivalente a'], 'specialization-of': ['specialises', 'es una especialización de'],
    contradicts: ['contradicts', 'contradice'], 'derived-from': ['derived from', 'se deriva de'], 'same-data-as': ['uses the same data as', 'usa los mismos datos que'],
    'compatible-with': ['compatible with', 'es compatible con'], 'validated-by': ['validated by', 'fue validado por'], 'requires-evidence-of': ['requires evidence of', 'requiere evidencia de'],
    'shares-variables-with': ['shares variables with', 'comparte variables con'], contains: ['contains', 'contiene'],
  }
  return m[t][lang === 'es' ? 1 : 0]
}
export const RELATION_TYPES: RelationType[] = ['depends-on', 'equivalent-to', 'specialization-of', 'contradicts', 'derived-from', 'same-data-as', 'compatible-with', 'validated-by', 'requires-evidence-of', 'shares-variables-with', 'contains']
export type { Relation }
