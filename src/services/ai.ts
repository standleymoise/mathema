// Provider seam. The browser never holds a model API key: AI calls go to the MATHEMA server, which
// holds the keys (set by the admin), enforces plan quotas and records cost. Without a server (or
// without a logged-in user, or with no key configured) the deterministic local analyzer is used and
// every message says so.
import { analyze, ENGINE_ID, type Analysis, type AnalysisInput } from '../core/analyzer'
import { proposalToAnalysis, type Proposal, type ProposalMeta } from '../core/aiAdapter'
import type { Mode } from '../core/types'
import { api } from './api'

export const localProvider = {
  id: ENGINE_ID, label: 'Local heuristic analyzer (no language model)',
  analyze: async (input: AnalysisInput): Promise<Analysis> => analyze(input),
}

export class AIUnavailable extends Error {
  code: string
  extra: Record<string, unknown>
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) { super(message); this.code = code; this.extra = extra }
}

export async function analyzeWithServer(input: AnalysisInput & { mode: Mode }): Promise<{ analysis: Analysis; quota?: { used: number; quota: number | null } }> {
  const r = await api.post<{ proposal: Proposal; meta: ProposalMeta & { quota?: { used: number; quota: number | null } } } & { error?: string; detail?: string }>('analyze', { text: input.text, lang: input.lang, mode: input.mode })
  if (!r.ok) {
    const code = r.status === 0 ? 'offline' : r.data?.error ?? 'error'
    throw new AIUnavailable(code, r.data?.detail ?? code, (r.data ?? {}) as Record<string, unknown>)
  }
  try {
    return { analysis: proposalToAnalysis(r.data.proposal, { text: input.text, lang: input.lang }, r.data.meta), quota: r.data.meta.quota }
  } catch (e) {
    throw new AIUnavailable('rejected_by_engine', e instanceof Error ? e.message : String(e))
  }
}
