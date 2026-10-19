// Typed, UI-independent representation of every MATHEMA entity.
// Math lives in `spec` + `equations` as data, so models can be reused without any component.

export type Lang = 'en' | 'es'
export type Mode = 'understand' | 'model' | 'experiment' | 'research' | 'connect'

/** Scientific-integrity labels. Every variable, equation and result carries one. */
export type Provenance =
  | 'source' // extracted from a source
  | 'derived' // computed from known data
  | 'user-assumption' // introduced by the user
  | 'system-hypothesis' // proposed by the system, not evidence
  | 'estimated' // estimated parameter (e.g. fitted)
  | 'simulated' // simulation output
  | 'validated' // empirically validated

export type ModelKind = 'function' | 'regression' | 'dynamic' | 'optimization' | 'causal' | 'conceptual'

export type ValidationStatus =
  | 'unvalidated'
  | 'demo-data'
  | 'simulated-only'
  | 'fit-to-data'
  | 'empirically-validated'

export interface Variable {
  id: string
  name: string
  symbol: string
  definition: string
  unit: string
  value?: number
  min?: number
  max?: number
  step?: number
  role: 'parameter' | 'input' | 'output' | 'state' | 'concept'
  provenance: Provenance
  sourceId?: string
}

export interface Equation {
  id: string
  label: string
  /** Parseable expression (our own grammar, see engine/expr.ts). */
  expr?: string
  /** Fallback LaTeX when `expr` is absent. */
  latex?: string
  provenance: Provenance
  editable: boolean
}

export interface Assumption {
  id: string
  text: string
  provenance: Provenance
}

export interface Hypothesis {
  id: string
  text: string
  status: 'open' | 'supported' | 'refuted'
  needs: string
}

export interface Source {
  id: string
  title: string
  kind: 'paper' | 'text' | 'file' | 'dataset' | 'demo' | 'reference'
  note: string
  citation?: string
  excerpt?: string
  fileName?: string
  fileSize?: number
  createdAt: string
}

export type RelationType =
  | 'depends-on'
  | 'equivalent-to'
  | 'specialization-of'
  | 'contradicts'
  | 'derived-from'
  | 'same-data-as'
  | 'compatible-with'
  | 'validated-by'
  | 'requires-evidence-of'
  | 'shares-variables-with'
  | 'contains'

export interface Relation {
  id: string
  from: string
  to: string
  type: RelationType
  justification: string
  status: 'accepted' | 'proposed' | 'rejected'
  createdAt: string
}

// ---- kind-specific specs --------------------------------------------------
export interface FunctionSpec {
  kind: 'function'
  expr: string
  xName: string
  xMin: number
  xMax: number
  xLabel: string
  yLabel: string
}
export interface RegressionSpec {
  kind: 'regression'
  x: number[]
  y: number[]
  xLabel: string
  yLabel: string
  degree: 1 | 2
}
export interface DynamicSpec {
  kind: 'dynamic'
  states: { id: string; label: string; expr: string; init: string }[]
  tEnd: number
  tLabel: string
  yLabel: string
}
export interface OptimizationSpec {
  kind: 'optimization'
  xName: string
  yName: string
  /** objective = cx*x + cy*y, maximized */
  cx: number
  cy: number
  constraints: { id: string; label: string; a: number; b: number; rhs: number }[]
  objectiveLabel: string
}
export interface GraphSpec {
  kind: 'causal' | 'conceptual'
  nodes: { id: string; label: string; x: number; y: number }[]
  edges: { id: string; from: string; to: string; sign: 1 | -1 | 0; note: string }[]
  gaps: string[]
}
export type ModelSpec = FunctionSpec | RegressionSpec | DynamicSpec | OptimizationSpec | GraphSpec

export interface Scenario {
  id: string
  name: string
  params: Record<string, number>
  createdAt: string
}

export interface Experiment {
  id: string
  modelId: string
  name: string
  type: 'scenario-comparison' | 'sensitivity' | 'fit'
  rows: { label: string; value: string }[]
  provenance: Provenance
  note: string
  createdAt: string
}

export interface Validation {
  status: ValidationStatus
  notes: string
  confidence?: undefined // never invent a confidence level
}

export interface ModelVersion {
  version: number
  at: string
  summary: string
  snapshot: Pick<MathModel, 'title' | 'description' | 'variables' | 'equations' | 'assumptions' | 'spec'>
}

export interface MathModel {
  id: string
  version: number
  title: string
  description: string
  originalInput: string
  kind: ModelKind
  method: string
  methodRationale: string
  concepts: string[]
  variables: Variable[]
  equations: Equation[]
  assumptions: Assumption[]
  limitations: string[]
  hypotheses: Hypothesis[]
  sourceIds: string[]
  validation: Validation
  spec: ModelSpec
  scenarios: Scenario[]
  versions: ModelVersion[]
  isDemo: boolean
  /** The user's own written conclusion (free text), shown beside the computed one. */
  userConclusion?: string
  createdAt: string
  updatedAt: string
}

// ---- conversation ----------------------------------------------------------
export interface Formalization {
  claim: string
  formalizable: string[]
  notFormalizable: string[]
  variables: { name: string; kind: 'explicit' | 'potential'; note: string }[]
  method: string
  why: string
  equations: string[]
  dataAndAssumptions: string[]
  limitations: string[]
  experiments: string[]
  missing: string[]
}

export interface Proposal {
  id: string
  targetModelId: string
  similarity: number
  reasons: string[]
  warnings: string[]
  suggestion: 'new-version' | 'link'
  relationType: RelationType
  state: 'open' | 'accepted' | 'dismissed'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  mode: Mode
  attachments?: { name: string; size: number; used: string }[]
  formalization?: Formalization
  modelId?: string
  /** Draft awaiting the user's decision (shown when a near-duplicate exists). Not yet in memory. */
  pendingDraft?: MathModel
  proposals?: Proposal[]
  /** Honest provenance of the assistant message. */
  engine?: string
  list?: { title: string; items: string[] }[]
  actions?: { label: string; action: 'build-model'; payload?: string }[]
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  modelIds: string[]
  createdAt: string
  updatedAt: string
}

export interface DB {
  schema: 1
  models: MathModel[]
  conversations: Conversation[]
  sources: Source[]
  relations: Relation[]
  experiments: Experiment[]
  seeded: boolean
}
