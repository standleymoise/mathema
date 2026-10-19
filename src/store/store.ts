// Application state + actions. Single external store (useSyncExternalStore), persisted through the
// Repository seam. UI components never touch storage or the engine directly.
import { useSyncExternalStore } from 'react'
import type { ChatMessage, Conversation, DB, Experiment, Lang, MathModel, Mode, Proposal, RelationType, Scenario, Source } from '../core/types'
import { repository } from '../services/repository'
import { AIUnavailable, analyzeWithServer, localProvider } from '../services/ai'
import { api, type ServerUser, type Usage } from '../services/api'
import { mergeDB } from '../core/merge'
import { parseTable, type Dataset } from '../core/analyzer'
import { findRelated } from '../core/memory'
import { explainModel, researchNotes } from '../core/assist'
import { baseParams, sensitivity } from '../core/engine/runtime'
import { now, tr, uid } from '../core/text'
import { translate, type Key } from '../i18n'

export type View = 'chat' | 'models' | 'experiments' | 'universe' | 'sources' | 'settings' | 'search' | 'admin' | 'pricing' | 'legal'
export type LegalDoc = 'terms' | 'privacy' | 'ai'
export interface PlanPub { id: string; name: string; priceCents: number; intervalUnit: 'month' | 'year'; aiMonthlyQuota: number | null; purchasable: boolean }
export type Tab = 'conversation' | 'workspace'

interface UI {
  lang: Lang
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  sidebarOpenMobile: boolean
  detailsOpen: boolean
  view: View
  mode: Mode
  activeConvId: string | null
  selectedModelId: string | null
  tab: Tab
  processing: string | null
  toast: { text: string; tone: 'ok' | 'warn' | 'bad' } | null
  searchQuery: string
  focusId: string | null
  authOpen: boolean
  feedbackOpen: boolean
  legalDoc: LegalDoc
}
interface ServerState {
  checked: boolean
  available: boolean
  signupMode: 'open' | 'invite' | 'closed'
  billingEnabled: boolean
  legal: { entity: string; email: string }
  plans: PlanPub[]
  aiAvailable: boolean
  user: ServerUser | null
  sync: 'idle' | 'saving' | 'saved' | 'error'
  usage: Usage | null
}
interface State { db: DB; ui: UI; server: ServerState }

const UI_KEY = 'mathema:ui'
function loadUI(): UI {
  let saved: Partial<UI> = {}
  try { saved = JSON.parse(localStorage.getItem(UI_KEY) ?? '{}') } catch { /* ignore */ }
  const theme = (document.documentElement.dataset.theme as 'light' | 'dark') ?? 'light'
  return {
    lang: saved.lang === 'es' ? 'es' : 'en', theme, sidebarCollapsed: !!saved.sidebarCollapsed, sidebarOpenMobile: false,
    detailsOpen: typeof innerWidth === 'number' ? innerWidth >= 1280 : true, view: 'chat', mode: 'model', activeConvId: null, selectedModelId: null, tab: 'conversation',
    processing: null, toast: null, searchQuery: '', focusId: null, authOpen: false, feedbackOpen: false, legalDoc: 'terms',
  }
}

let state: State = { db: repository.load(), ui: loadUI(), server: { checked: false, available: false, signupMode: 'closed', billingEnabled: false, legal: { entity: '', email: '' }, plans: [], aiAvailable: false, user: null, sync: 'idle', usage: null } }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useStore = <T,>(sel: (s: State) => T): T => useSyncExternalStore(subscribe, () => sel(state))
export const getState = () => state

let applyingRemote = false
function setDB(fn: (db: DB) => DB) { state = { ...state, db: fn(state.db) }; repository.save(state.db); emit(); if (!applyingRemote) scheduleSync() }
function setServer(patch: Partial<ServerState>) { state = { ...state, server: { ...state.server, ...patch } }; emit() }
function setUI(patch: Partial<UI>) {
  state = { ...state, ui: { ...state.ui, ...patch } }
  try { localStorage.setItem(UI_KEY, JSON.stringify({ lang: state.ui.lang, sidebarCollapsed: state.ui.sidebarCollapsed })) } catch { /* ignore */ }
  emit()
}
let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string, tone: 'ok' | 'warn' | 'bad' = 'ok') {
  setUI({ toast: { text, tone } })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => setUI({ toast: null }), 3800)
}
export const t = (k: Key) => translate(state.ui.lang, k)
export const useT = () => { const lang = useStore((s) => s.ui.lang); return (k: Key) => translate(lang, k) }

// ---- UI actions -----------------------------------------------------------------
export const ui = {
  setLang: (lang: Lang) => setUI({ lang }),
  setTheme: (theme: 'light' | 'dark') => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('mathema:theme', theme) } catch { /* ignore */ }
    setUI({ theme })
  },
  toggleSidebar: () => setUI({ sidebarCollapsed: !state.ui.sidebarCollapsed }),
  setSidebarMobile: (v: boolean) => setUI({ sidebarOpenMobile: v }),
  setDetails: (v: boolean) => setUI({ detailsOpen: v }),
  setView: (view: View) => setUI({ view, sidebarOpenMobile: false }),
  setMode: (mode: Mode) => setUI({ mode }),
  setTab: (tab: Tab) => setUI({ tab }),
  setSearch: (searchQuery: string) => setUI({ searchQuery }),
  setAuthOpen: (authOpen: boolean) => setUI({ authOpen }),
  setFeedbackOpen: (feedbackOpen: boolean) => setUI({ feedbackOpen }),
  openLegal: (legalDoc: LegalDoc) => setUI({ view: 'legal', legalDoc, authOpen: false, sidebarOpenMobile: false }),
  openSource: (id: string) => setUI({ view: 'sources', focusId: id, sidebarOpenMobile: false }),
  openInUniverse: (id: string) => setUI({ view: 'universe', focusId: id, sidebarOpenMobile: false }),
  clearFocus: () => setUI({ focusId: null }),
  newIdea: () => setUI({ view: 'chat', activeConvId: null, tab: 'conversation', sidebarOpenMobile: false }),
  openConversation: (id: string) => setUI({ view: 'chat', activeConvId: id, tab: 'conversation', sidebarOpenMobile: false }),
  selectModel: (id: string | null, opts: { workspace?: boolean } = {}) =>
    setUI({ selectedModelId: id, ...(opts.workspace ? { view: 'chat' as View, tab: 'workspace' as Tab, sidebarOpenMobile: false } : {}) }),
}

// ---- model actions --------------------------------------------------------------------
const snap = (m: MathModel) => ({ title: m.title, description: m.description, variables: structuredClone(m.variables), equations: structuredClone(m.equations), assumptions: structuredClone(m.assumptions), spec: structuredClone(m.spec) })
export const getModel = (id: string | null | undefined) => (id ? state.db.models.find((m) => m.id === id) : undefined)

export const models = {
  /** Writes a new version: previous state is kept in history with a summary of what changed. */
  commit(id: string, patch: Partial<MathModel>, summary: string) {
    setDB((db) => ({
      ...db,
      models: db.models.map((m) => m.id !== id ? m : {
        ...m, ...patch, version: m.version + 1, updatedAt: now(),
        versions: [...m.versions, { version: m.version, at: m.updatedAt, summary, snapshot: snap(m) }],
      }),
    }))
  },
  /** Metadata edits that are not scientific content (no new version). */
  rename(id: string, title: string) {
    const clean = title.trim()
    if (!clean) return
    setDB((db) => ({ ...db, models: db.models.map((m) => (m.id === id ? { ...m, title: clean, updatedAt: now() } : m)) }))
  },
  duplicate(id: string) {
    const m = getModel(id)
    if (!m) return
    const copy: MathModel = { ...structuredClone(m), id: uid('mdl'), title: `${m.title} (copy)`, version: 1, versions: [], isDemo: m.isDemo, createdAt: now(), updatedAt: now() }
    setDB((db) => ({
      ...db, models: [...db.models, copy],
      relations: [...db.relations, { id: uid('rel'), from: copy.id, to: m.id, type: 'derived-from', justification: tr(state.ui.lang, 'Duplicated from this model; edit the copy independently.', 'Duplicado de este modelo; la copia se edita de forma independiente.'), status: 'accepted', createdAt: now() }],
    }))
    ui.selectModel(copy.id)
    toast(tr(state.ui.lang, 'Duplicated. You are now viewing the copy.', 'Duplicado. Ahora estás viendo la copia.'))
  },
  remove(id: string) {
    setDB((db) => ({
      ...db,
      models: db.models.filter((m) => m.id !== id),
      relations: db.relations.filter((r) => r.from !== id && r.to !== id),
      experiments: db.experiments.filter((e) => e.modelId !== id),
      conversations: db.conversations.map((c) => ({ ...c, modelIds: c.modelIds.filter((x) => x !== id) })),
    }))
    if (state.ui.selectedModelId === id) setUI({ selectedModelId: null, tab: 'conversation' })
  },
  addScenario(id: string, name: string, params: Record<string, number>) {
    const sc: Scenario = { id: uid('sc'), name: name.trim() || 'Scenario', params, createdAt: now() }
    setDB((db) => ({ ...db, models: db.models.map((m) => (m.id === id ? { ...m, scenarios: [...m.scenarios, sc], updatedAt: now() } : m)) }))
  },
  removeScenario(id: string, scId: string) {
    setDB((db) => ({ ...db, models: db.models.map((m) => (m.id === id ? { ...m, scenarios: m.scenarios.filter((s) => s.id !== scId) } : m)) }))
  },
  restore(id: string, version: number) {
    const m = getModel(id)
    const v = m?.versions.find((x) => x.version === version)
    if (!m || !v) return
    models.commit(id, structuredClone(v.snapshot), tr(state.ui.lang, `Restored content of v${version}`, `Restaurado el contenido de v${version}`))
    toast(tr(state.ui.lang, `Restored v${version} as a new version.`, `v${version} restaurada como nueva versión.`))
  },
}

export const records = {
  addExperiment(e: Omit<Experiment, 'id' | 'createdAt'>) {
    setDB((db) => ({ ...db, experiments: [{ ...e, id: uid('exp'), createdAt: now() }, ...db.experiments] }))
  },
  removeExperiment(id: string) { setDB((db) => ({ ...db, experiments: db.experiments.filter((e) => e.id !== id) })) },
  removeSource(id: string) {
    setDB((db) => ({ ...db, sources: db.sources.filter((s) => s.id !== id), models: db.models.map((m) => ({ ...m, sourceIds: m.sourceIds.filter((x) => x !== id) })) }))
  },
  addSource(src: Omit<Source, 'id' | 'createdAt'>) {
    setDB((db) => ({ ...db, sources: [{ ...src, id: uid('src'), createdAt: now() }, ...db.sources] }))
  },
  addRelation(from: string, to: string, type: RelationType, justification: string) {
    setDB((db) => ({ ...db, relations: [...db.relations, { id: uid('rel'), from, to, type, justification, status: 'accepted', createdAt: now() }] }))
  },
  removeRelation(id: string) { setDB((db) => ({ ...db, relations: db.relations.filter((r) => r.id !== id) })) },
  resetDemo() {
    state = { ...state, db: repository.reset(), ui: { ...state.ui, activeConvId: null, selectedModelId: null, view: 'chat', tab: 'conversation' } }
    emit()
    toast(tr(state.ui.lang, 'Demo data restored.', 'Datos de demostración restaurados.'))
  },
  exportJson() {
    const blob = new Blob([JSON.stringify(state.db, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'mathema-export.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  },
}

// ---- conversation flow ------------------------------------------------------------------
export interface AttachedFile { name: string; size: number; text?: string }

function ensureConversation(first: string): string {
  if (state.ui.activeConvId && state.db.conversations.some((c) => c.id === state.ui.activeConvId)) return state.ui.activeConvId
  const c: Conversation = { id: uid('conv'), title: first.length > 52 ? first.slice(0, 51) + '…' : first, messages: [], modelIds: [], createdAt: now(), updatedAt: now() }
  setDB((db) => ({ ...db, conversations: [c, ...db.conversations] }))
  setUI({ activeConvId: c.id })
  return c.id
}
function pushMessage(convId: string, msg: ChatMessage) {
  setDB((db) => ({ ...db, conversations: db.conversations.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, msg], updatedAt: now(), modelIds: msg.modelId && !c.modelIds.includes(msg.modelId) ? [...c.modelIds, msg.modelId] : c.modelIds } : c)) }))
}
function patchMessage(convId: string, msgId: string, fn: (m: ChatMessage) => ChatMessage) {
  setDB((db) => ({ ...db, conversations: db.conversations.map((c) => (c.id === convId ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) } : c)) }))
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function sendMessage(text: string, files: AttachedFile[] = []) {
  const lang = state.ui.lang
  const L = (en: string, es: string) => tr(lang, en, es)
  const mode = state.ui.mode
  const typed = text.trim()
  if (!typed && !files.length) return
  const convId = ensureConversation(typed || files[0].name)

  // sources & datasets from attachments
  const newSources: Source[] = []
  const datasets: Dataset[] = []
  const attachments: NonNullable<ChatMessage['attachments']> = []
  let body = typed
  for (const f of files) {
    const id = uid('src')
    if (f.text !== undefined) {
      const table = parseTable(f.text, ['x', 'y'])
      if (table) datasets.push(table)
      newSources.push({ id, title: f.name, kind: table ? 'dataset' : 'file', fileName: f.name, fileSize: f.size, createdAt: now(), excerpt: f.text.slice(0, 400), note: table ? L(`Numeric table detected (${table.x.length} rows).`, `Tabla numérica detectada (${table.x.length} filas).`) : L('Text content read and used as part of the input.', 'Contenido de texto leído y usado como parte de la entrada.') })
      attachments.push({ name: f.name, size: f.size, used: table ? L('read as data table', 'leído como tabla de datos') : L('read as text', 'leído como texto') })
      if (!table) body += `\n${f.text.slice(0, 6000)}`
    } else {
      newSources.push({ id, title: f.name, kind: 'file', fileName: f.name, fileSize: f.size, createdAt: now(), note: L('Stored as a reference only. This demo cannot read PDFs or images (no OCR / vision); attach text or CSV to use the content.', 'Guardado solo como referencia. Esta demo no puede leer PDFs ni imágenes (sin OCR / visión); adjuntá texto o CSV para usar el contenido.') })
      attachments.push({ name: f.name, size: f.size, used: L('stored as reference — content not read', 'guardado como referencia — contenido no leído') })
    }
  }
  if (newSources.length) setDB((db) => ({ ...db, sources: [...db.sources, ...newSources] }))
  const userMsg: ChatMessage = { id: uid('msg'), role: 'user', text: typed || files.map((f) => f.name).join(', '), createdAt: now(), mode, attachments: attachments.length ? attachments : undefined }
  pushMessage(convId, userMsg)
  setUI({ tab: 'conversation', view: 'chat' })

  const base = { id: uid('msg'), role: 'assistant' as const, createdAt: now(), mode, engine: localProvider.id }
  const selected = getModel(state.ui.selectedModelId)
  try {
    setUI({ processing: L('Reading your input…', 'Leyendo tu entrada…') }); await wait(220)

    if (mode === 'experiment') {
      if (!selected) { pushMessage(convId, { ...base, text: L('Experiments run on a stored model. Pick one in “My models” (or ask me to build one in Model mode), then come back.', 'Los experimentos se ejecutan sobre un modelo guardado. Elegí uno en “Mis modelos” (o pedime construir uno en modo Modelar) y volvé.') }); return }
      setUI({ processing: L('Running deterministic sensitivity analysis…', 'Ejecutando análisis de sensibilidad determinista…') }); await wait(260)
      const sens = sensitivity(selected, baseParams(selected))
      if (!sens) { pushMessage(convId, { ...base, modelId: selected.id, text: L(`“${selected.title}” has no adjustable numeric parameters, so there is nothing to vary yet.`, `“${selected.title}” no tiene parámetros numéricos ajustables, así que aún no hay qué variar.`) }); return }
      const rows = sens.rows.map((r) => ({ label: r.name, value: `${r.low.toFixed(3)} → ${r.high.toFixed(3)} (Δ ${r.swing.toFixed(3)})` }))
      records.addExperiment({ modelId: selected.id, name: L(`Sensitivity ±${sens.pct * 100}% — ${selected.title}`, `Sensibilidad ±${sens.pct * 100}% — ${selected.title}`), type: 'sensitivity', rows, provenance: 'simulated', note: L(`One-at-a-time ±20% on “${sens.metric.label}”. Simulated; ignores interactions.`, `Uno a la vez ±20% sobre “${sens.metric.label}”. Simulado; ignora interacciones.`) })
      pushMessage(convId, { ...base, modelId: selected.id, text: L(`Ran a one-at-a-time ±20% sensitivity on “${sens.metric.label}”. Results are simulated and saved under Experiments. Open the workspace to vary parameters yourself.`, `Se ejecutó una sensibilidad de ±20% (uno a la vez) sobre “${sens.metric.label}”. Los resultados son simulados y se guardaron en Experimentos. Abrí el espacio de trabajo para variar los parámetros vos mismo.`),
        list: [{ title: L('Most influential parameters', 'Parámetros más influyentes'), items: sens.rows.slice(0, 5).map((r) => `${r.name}: ${r.low.toFixed(3)} → ${r.high.toFixed(3)} (Δ ${r.swing.toFixed(3)})`) }] })
      return
    }

    if ((mode === 'understand' || mode === 'research' || mode === 'connect') && selected && (typed.length <= 240 || mode !== 'understand')) {
      setUI({ processing: mode === 'connect' ? L('Searching your memory…', 'Buscando en tu memoria…') : L('Reading the stored model…', 'Leyendo el modelo guardado…') }); await wait(240)
      if (mode === 'understand') { const r = explainModel(selected, typed, lang); pushMessage(convId, { ...base, modelId: selected.id, text: r.text, list: r.list }); return }
      if (mode === 'research') { const r = researchNotes(selected, state.db.models, lang); pushMessage(convId, { ...base, modelId: selected.id, text: r.text, list: r.list }); return }
      const props = findRelated(selected, state.db.models, lang).map((p) => ({ ...p, suggestion: 'link' as const, relationType: p.relationType === 'equivalent-to' ? 'equivalent-to' as const : p.relationType }))
      pushMessage(convId, { ...base, modelId: selected.id, proposals: props, text: props.length ? L(`Found ${props.length} stored model(s) related to “${selected.title}”. Nothing is linked until you accept it.`, `Se encontraron ${props.length} modelo(s) relacionados con “${selected.title}”. Nada se vincula hasta que lo aceptes.`) : L('No stored model is related enough to propose a link.', 'Ningún modelo guardado está lo bastante relacionado como para proponer un vínculo.') })
      return
    }

    // new idea: analyse
    setUI({ processing: L('Extracting concepts, variables and relations…', 'Extrayendo conceptos, variables y relaciones…') })
    // Deterministic paths first (explicit equation, numeric table): exact, free, no model needed.
    const local = await localProvider.analyze({ text: body, lang, datasets })
    const deterministic = datasets.length > 0 || local.draft.kind === 'regression' || local.draft.kind === 'function'
    let analysis = local
    let aiNote = ''
    if (deterministic) {
      if (state.server.user && state.server.aiAvailable) aiNote = L('Deterministic path (explicit equation or data table): no AI call was needed.', 'Camino determinista (ecuación explícita o tabla de datos): no hizo falta llamar a la IA.')
    } else if (state.server.user && state.server.aiAvailable) {
      setUI({ processing: L('Asking the AI model to propose a structure (validated afterwards by the deterministic engine)…', 'Pidiendo al modelo de IA que proponga una estructura (luego la valida el motor determinista)…') })
      try {
        const r = await analyzeWithServer({ text: body, lang, datasets, mode })
        analysis = r.analysis
        if (r.quota) setServer({ usage: { ...(state.server.usage ?? { plan: '', resetsAt: '' }), used: r.quota.used, quota: r.quota.quota } })
      } catch (e) {
        const u = e instanceof AIUnavailable ? e : null
        const why = u?.code === 'quota_exceeded' ? L(`monthly AI quota reached (${u.extra.used}/${u.extra.quota}); see Plans in the sidebar to get more`, `cuota mensual de IA alcanzada (${u.extra.used}/${u.extra.quota}); mirá Planes en la barra lateral para tener más`)
          : u?.code === 'daily_cap_reached' ? L('daily AI limit reached', 'límite diario de IA alcanzado')
          : u?.code === 'rejected_by_engine' ? L(`the AI proposal failed validation (${u.message})`, `la propuesta de la IA no pasó la validación (${u.message})`)
          : L(`AI unavailable (${u?.message ?? 'error'})`, `IA no disponible (${u?.message ?? 'error'})`)
        aiNote = L(`Used the local heuristic analyzer instead: ${why}.`, `Se usó el analizador heurístico local: ${why}.`)
        analysis = local
      }
    } else if (state.server.available && !state.server.user) {
      aiNote = L('Tip: sign in to use the AI model for ideas without equations or data.', 'Tip: iniciá sesión para usar el modelo de IA con ideas sin ecuaciones ni datos.')
    }
    await wait(200)
    setUI({ processing: L('Choosing a formalisation and checking memory…', 'Eligiendo una formalización y revisando la memoria…') }); await wait(240)
    const draft = { ...analysis.draft, sourceIds: newSources.map((s) => s.id) }
    const related = findRelated(draft, state.db.models, lang)
    const pending = related.some((p) => p.suggestion === 'new-version')
    const intro = L(`I read this as a **${draft.kind}** problem about ${analysis.topic}. Central question: ${analysis.centralQuestion}`, `Lo leí como un problema de tipo **${draft.kind}** sobre ${analysis.topic}. Pregunta central: ${analysis.centralQuestion}`) + (aiNote ? `\n\n${aiNote}` : '')

    if (mode === 'model' && !pending) {
      setDB((db) => ({ ...db, models: [...db.models, draft] }))
      const msg: ChatMessage = { ...base, modelId: draft.id, text: intro, formalization: analysis.formalization, proposals: related, engine: analysis.engine }
      pushMessage(convId, msg)
      ui.selectModel(draft.id, { workspace: true })
      toast(L('Model created and saved.', 'Modelo creado y guardado.'))
      return
    }
    if (mode === 'model') {
      pushMessage(convId, { ...base, text: intro + '\n\n' + L('A very similar model already exists, so I did not save this draft. Decide below.', 'Ya existe un modelo muy similar, por lo que no guardé este borrador. Decidí abajo.'), formalization: analysis.formalization, pendingDraft: draft, proposals: related, engine: analysis.engine })
      return
    }
    // understand / research / connect without a stored model: show analysis; offer to build
    const extra = mode === 'research' ? researchNotes(draft, state.db.models, lang) : mode === 'connect' ? undefined : undefined
    pushMessage(convId, {
      ...base, text: intro, formalization: analysis.formalization, engine: analysis.engine, list: extra?.list,
      proposals: mode === 'connect' ? related.map((p) => ({ ...p, suggestion: 'link' as const })) : undefined, pendingDraft: draft,
      actions: [{ label: L('Build this model', 'Construir este modelo'), action: 'build-model' }],
    })
  } catch (e) {
    pushMessage(convId, { ...base, text: L(`Could not process that: ${e instanceof Error ? e.message : String(e)}`, `No pude procesar eso: ${e instanceof Error ? e.message : String(e)}`) })
    toast(L('Processing failed', 'Falló el procesamiento'), 'bad')
  } finally {
    setUI({ processing: null })
  }
}

/** Saves a pending draft into memory (user's decision), optionally linking it. */
export function savePendingDraft(convId: string, msgId: string) {
  const conv = state.db.conversations.find((c) => c.id === convId)
  const msg = conv?.messages.find((m) => m.id === msgId)
  if (!msg?.pendingDraft) return null
  const draft = msg.pendingDraft
  setDB((db) => ({ ...db, models: [...db.models, draft] }))
  patchMessage(convId, msgId, (m) => ({ ...m, pendingDraft: undefined, modelId: draft.id }))
  setDB((db) => ({ ...db, conversations: db.conversations.map((c) => (c.id === convId ? { ...c, modelIds: [...c.modelIds, draft.id] } : c)) }))
  ui.selectModel(draft.id, { workspace: true })
  toast(tr(state.ui.lang, 'Saved as a new model.', 'Guardado como modelo nuevo.'))
  return draft.id
}

export function resolveProposal(convId: string, msgId: string, p: Proposal, decision: 'link' | 'new-version' | 'dismiss', relType?: RelationType) {
  const lang = state.ui.lang
  const mark = (s: Proposal['state']) => patchMessage(convId, msgId, (m) => ({ ...m, proposals: m.proposals?.map((x) => (x.id === p.id ? { ...x, state: s } : x)) }))
  if (decision === 'dismiss') { mark('dismissed'); return }
  const conv = state.db.conversations.find((c) => c.id === convId)
  const msg = conv?.messages.find((m) => m.id === msgId)
  if (!msg) return
  if (decision === 'new-version' && msg.pendingDraft) {
    const d = msg.pendingDraft
    models.commit(p.targetModelId, { title: d.title, description: d.description, originalInput: d.originalInput, variables: d.variables, equations: d.equations, assumptions: d.assumptions, spec: d.spec, concepts: d.concepts, limitations: d.limitations, hypotheses: d.hypotheses, method: d.method, methodRationale: d.methodRationale, validation: d.validation, sourceIds: [...new Set([...(getModel(p.targetModelId)?.sourceIds ?? []), ...d.sourceIds])] },
      tr(lang, 'Updated from a new idea (previous content kept in history).', 'Actualizado desde una idea nueva (el contenido previo se conserva en el historial).'))
    patchMessage(convId, msgId, (m) => ({ ...m, pendingDraft: undefined, modelId: p.targetModelId, proposals: m.proposals?.map((x) => ({ ...x, state: x.id === p.id ? 'accepted' : 'dismissed' })) }))
    ui.selectModel(p.targetModelId, { workspace: true })
    toast(tr(lang, 'Existing model updated to a new version.', 'Modelo existente actualizado a una nueva versión.'))
    return
  }
  const from = msg.pendingDraft ? savePendingDraft(convId, msgId) : msg.modelId
  if (!from) return
  records.addRelation(from, p.targetModelId, relType ?? p.relationType, p.reasons.join(' '))
  mark('accepted')
  toast(tr(lang, 'Link added to your knowledge universe.', 'Vínculo añadido a tu universo de conocimiento.'))
}

export function buildFromMessage(convId: string, msgId: string) {
  const id = savePendingDraft(convId, msgId)
  if (id) patchMessage(convId, msgId, (m) => ({ ...m, actions: undefined }))
}
export type { Lang }

// ---- server: auth, usage, sync -----------------------------------------------------------
const SYNCED_KEY = 'mathema:syncedUser'
let serverVersion = 0
let syncTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSync() {
  if (!state.server.user) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { void pushNow() }, 1500)
}
async function pushNow(retry = true): Promise<void> {
  if (!state.server.user) return
  setServer({ sync: 'saving' })
  const r = await api.put<{ version: number; data?: DB; error?: string }>('data', { data: state.db, version: serverVersion })
  if (r.ok) { serverVersion = r.data.version; setServer({ sync: 'saved' }); return }
  if (r.status === 409 && retry && r.data.data) {
    // another device wrote first: merge its document with ours, then push once more
    serverVersion = r.data.version
    applyingRemote = true
    state = { ...state, db: mergeDB(state.db, r.data.data) }; repository.save(state.db); emit()
    applyingRemote = false
    return pushNow(false)
  }
  setServer({ sync: 'error' })
}
async function pullAndMerge(user: ServerUser) {
  const r = await api.get<{ version: number; data: DB | null }>('data')
  if (!r.ok) { setServer({ sync: 'error' }); return }
  serverVersion = r.data.version
  let first = true
  try { first = localStorage.getItem(SYNCED_KEY) !== String(user.id) } catch { /* ignore */ }
  applyingRemote = true
  if (r.data.data) {
    // first sign-in on this device: union so nothing created while signed out is lost; afterwards the server copy leads
    state = { ...state, db: first ? mergeDB(state.db, r.data.data) : r.data.data }
    repository.save(state.db); emit()
  }
  applyingRemote = false
  try { localStorage.setItem(SYNCED_KEY, String(user.id)) } catch { /* ignore */ }
  await pushNow()
}
async function loadUsage() {
  const r = await api.get<Usage>('usage')
  if (r.ok) setServer({ usage: r.data })
}

export const server = {
  async init() {
    const r = await api.get<{ server: boolean; signupMode: ServerState['signupMode']; aiAvailable: boolean; billingEnabled: boolean; legal: ServerState['legal']; user: ServerUser | null }>('config')
    if (!r.ok || !r.data?.server) { setServer({ checked: true, available: false }); return }
    setServer({ checked: true, available: true, signupMode: r.data.signupMode, aiAvailable: r.data.aiAvailable, billingEnabled: r.data.billingEnabled, legal: r.data.legal, user: r.data.user })
    void server.loadPlans()
    if (r.data.user) { await pullAndMerge(r.data.user); void loadUsage() }
    // coming back from PayPal: /?billing=success|pending|cancel|mismatch|unknown
    try {
      const b = new URLSearchParams(location.search).get('billing')
      if (b) {
        history.replaceState(null, '', location.pathname)
        const L = (en: string, es: string) => tr(state.ui.lang, en, es)
        if (b === 'success') toast(L('Subscription active. Thank you!', 'Suscripción activa. ¡Gracias!'))
        else if (b === 'pending') toast(L('Payment received; activating your plan (this can take a minute).', 'Pago recibido; activando tu plan (puede tardar un minuto).'), 'warn')
        else if (b === 'cancel') toast(L('Checkout canceled. You have not been charged.', 'Pago cancelado. No se te cobró nada.'), 'warn')
        else toast(L('We could not verify that checkout. If you were charged, contact support.', 'No pudimos verificar ese pago. Si se te cobró, contactá a soporte.'), 'bad')
        ui.setView('pricing')
      }
    } catch { /* ignore */ }
  },
  async loadPlans() {
    const r = await api.get<PlanPub[]>('plans')
    if (r.ok) setServer({ plans: r.data })
  },
  async authenticate(mode: 'login' | 'register', email: string, password: string, name = '', extra: { inviteCode?: string; acceptTerms?: boolean } = {}): Promise<string | null> {
    const r = await api.post<{ user?: ServerUser; error?: string; detail?: string }>(`auth/${mode}`, { email, password, name, ...extra })
    if (!r.ok || !r.data?.user) {
      const code = r.data?.error ?? (r.status === 0 ? 'offline' : 'error')
      const msg: Record<string, [string, string]> = {
        invalid_credentials: ['Wrong email or password.', 'Correo o contraseña incorrectos.'], email_taken: ['That email is already registered.', 'Ese correo ya está registrado.'],
        weak_password: ['Use at least 10 characters.', 'Usá al menos 10 caracteres.'], invalid_email: ['That email does not look valid.', 'Ese correo no parece válido.'],
        signup_disabled: ['Sign-ups are closed.', 'El registro está cerrado.'], too_many_attempts: ['Too many attempts. Wait a few minutes.', 'Demasiados intentos. Esperá unos minutos.'],
        offline: ['Cannot reach the server.', 'No se pudo contactar al servidor.'],
        terms_required: ['Please accept the Terms and the Privacy Policy.', 'Aceptá los Términos y la Política de Privacidad.'], invite_required: ['An invitation code is required during the closed beta.', 'Hace falta un código de invitación durante la beta cerrada.'],
        invite_invalid: ['That invitation code is invalid, used up or expired.', 'Ese código de invitación no es válido, se agotó o venció.'],
      }
      const m = msg[code] ?? ['Something went wrong.', 'Algo salió mal.']
      return tr(state.ui.lang, m[0], m[1])
    }
    setServer({ user: r.data.user })
    const cfg = await api.get<{ aiAvailable: boolean }>('config')
    if (cfg.ok) setServer({ aiAvailable: cfg.data.aiAvailable })
    await pullAndMerge(r.data.user)
    void loadUsage()
    return null
  },
  async logout() {
    clearTimeout(syncTimer)
    await pushNow()
    const saved = state.server.sync !== 'error'
    await api.post('auth/logout', {})
    setServer({ user: null, usage: null, sync: 'idle' })
    if (saved) {
      // data is safe in the account: leave no private models behind on this device
      try { localStorage.removeItem(SYNCED_KEY) } catch { /* ignore */ }
      applyingRemote = true
      state = { ...state, db: repository.reset(), ui: { ...state.ui, activeConvId: null, selectedModelId: null, view: 'chat', tab: 'conversation' } }
      emit()
      applyingRemote = false
    } else toast(tr(state.ui.lang, 'Signed out, but the last changes could not be saved to your account; they remain on this device.', 'Sesión cerrada, pero los últimos cambios no se pudieron guardar en tu cuenta; quedan en este dispositivo.'), 'warn')
  },
  refreshUsage: loadUsage,
  async refreshUser() {
    const r = await api.get<{ user: ServerUser | null }>('auth/me')
    if (r.ok) setServer({ user: r.data.user })
    void loadUsage()
  },
  async checkout(planId: string) {
    const L = (en: string, es: string) => tr(state.ui.lang, en, es)
    const r = await api.post<{ approveUrl?: string; error?: string; detail?: string }>('billing/checkout', { planId })
    if (r.ok && r.data.approveUrl) { window.location.assign(r.data.approveUrl); return }
    toast(r.data?.error === 'already_subscribed' ? L('You already have this plan.', 'Ya tenés este plan.') : r.data?.error === 'billing_not_configured' ? L('Payments are not enabled yet.', 'Los pagos todavía no están habilitados.') : L(`Could not start checkout (${r.data?.detail ?? r.data?.error ?? 'error'}).`, `No se pudo iniciar el pago (${r.data?.detail ?? r.data?.error ?? 'error'}).`), 'bad')
  },
  async cancelSubscription() {
    const L = (en: string, es: string) => tr(state.ui.lang, en, es)
    const r = await api.post('billing/cancel', {})
    if (r.ok) { toast(L('Subscription canceled.', 'Suscripción cancelada.')); await server.refreshUser() } else toast(L('Could not cancel. Try again or contact support.', 'No se pudo cancelar. Reintentá o contactá a soporte.'), 'bad')
  },
  async changePassword(current: string, next: string): Promise<string | null> {
    const L = (en: string, es: string) => tr(state.ui.lang, en, es)
    const r = await api.post<{ error?: string }>('auth/password', { current, next })
    if (r.ok) return null
    return r.data?.error === 'invalid_credentials' ? L('Current password is wrong.', 'La contraseña actual es incorrecta.') : r.data?.error === 'weak_password' ? L('Use at least 10 characters.', 'Usá al menos 10 caracteres.') : L('Could not change the password.', 'No se pudo cambiar la contraseña.')
  },
  async deleteAccount(password: string): Promise<string | null> {
    const L = (en: string, es: string) => tr(state.ui.lang, en, es)
    const r = await api.post<{ error?: string; detail?: string }>('account/delete', { password })
    if (!r.ok) return r.data?.error === 'invalid_credentials' ? L('Wrong password.', 'Contraseña incorrecta.') : r.data?.detail ?? L('Could not delete the account.', 'No se pudo eliminar la cuenta.')
    clearTimeout(syncTimer)
    try { localStorage.removeItem(SYNCED_KEY) } catch { /* ignore */ }
    setServer({ user: null, usage: null, sync: 'idle' })
    applyingRemote = true
    state = { ...state, db: repository.reset(), ui: { ...state.ui, activeConvId: null, selectedModelId: null, view: 'chat', tab: 'conversation' } }
    emit(); applyingRemote = false
    toast(L('Account deleted.', 'Cuenta eliminada.'))
    return null
  },
  async sendFeedback(kind: string, message: string, page: string): Promise<boolean> {
    const r = await api.post('feedback', { kind, message, page })
    return r.ok
  },
}
