// Provider seam. The UI only knows `AIProvider`. The default is the local deterministic analyzer —
// it is labelled as such in every message. A real LLM is reached ONLY through a server-side endpoint
// (VITE_AI_ENDPOINT) that holds the API key; the browser never sees a key.
import { analyze, ENGINE_ID, type Analysis, type AnalysisInput } from '../core/analyzer'

export interface AIProvider {
  id: string
  label: string
  remote: boolean
  analyze(input: AnalysisInput): Promise<Analysis>
}

export const localProvider: AIProvider = {
  id: ENGINE_ID, label: 'Local heuristic analyzer (no language model)', remote: false,
  analyze: async (input) => analyze(input),
}

const endpoint = (import.meta.env.VITE_AI_ENDPOINT as string | undefined)?.trim()

function isAnalysis(x: unknown): x is Analysis {
  const a = x as Analysis
  return !!a && typeof a === 'object' && !!a.draft && typeof a.draft.kind === 'string' && !!a.formalization && Array.isArray(a.draft.variables) && !!a.draft.spec
}

const remoteProvider = (url: string): AIProvider => ({
  id: 'remote-endpoint', label: `Remote model endpoint (${new URL(url, location.href).host})`, remote: true,
  async analyze(input) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    if (!res.ok) throw new Error(`Endpoint responded ${res.status}`)
    const json: unknown = await res.json()
    if (!isAnalysis(json)) throw new Error('Endpoint response does not match the Analysis schema')
    return { ...json, engine: 'remote-endpoint' }
  },
})

export const provider: AIProvider = endpoint ? remoteProvider(endpoint) : localProvider
export const aiStatus = { configured: !!endpoint, endpoint: endpoint ?? null, provider }
