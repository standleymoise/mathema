// Model bake-off. Costs real money, so it only runs when RUN_EVAL=1 (see docs/EVAL.md).
//   RUN_EVAL=1 ANTHROPIC_API_KEY=... EVAL_MODELS="anthropic:claude-haiku-5-5,anthropic:claude-sonnet-5-5" npm run eval
import { describe, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
// @ts-expect-error plain .mjs modules without types
import { call } from '../ai/providers.mjs'
// @ts-expect-error plain .mjs modules without types
import { SYSTEM_PROMPT, userPrompt } from '../ai/prompt.mjs'
// @ts-expect-error plain .mjs modules without types
import { extractJson, validateProposal } from '../ai/proposal.mjs'
// @ts-expect-error plain .mjs modules without types
import { computeCost } from '../ai/cost.mjs'
import { proposalToAnalysis } from '../../src/core/aiAdapter'

const PRICES: Record<string, [number, number]> = { 'anthropic:claude-haiku-5-5': [0.1, 0.5], 'anthropic:claude-sonnet-5-5': [2, 10], 'anthropic:claude-opus-5-5': [4, 20], ...JSON.parse(process.env.EVAL_PRICES ?? '{}') }
const ideas: { text: string; expectKind: string }[] = JSON.parse(readFileSync(new URL('./ideas.json', import.meta.url), 'utf8'))
const CITATION = /https?:\/\/|doi\.org|\bet al\.|\(\d{4}\)/i

describe.skipIf(!process.env.RUN_EVAL)('model evaluation', () => {
  const models = (process.env.EVAL_MODELS ?? 'anthropic:claude-sonnet-5-5').split(',').map((s) => s.trim())
  const limit = Number(process.env.EVAL_LIMIT ?? ideas.length)
  for (const spec of models) {
    it(spec, async () => {
      const [provider, model] = [spec.slice(0, spec.indexOf(':')), spec.slice(spec.indexOf(':') + 1)]
      const apiKey = process.env[provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY']
      if (!apiKey) throw new Error(`missing API key env for ${provider}`)
      const price = PRICES[spec] ? { input_per_mtok: PRICES[spec][0], output_per_mtok: PRICES[spec][1] } : null
      const rows = []
      for (const idea of ideas.slice(0, limit)) {
        const lang = /[¿áéíóúñ]|\b(el|la|los|que|con|una)\b/i.test(idea.text) ? 'es' : 'en'
        const t0 = Date.now()
        const row: Record<string, unknown> = { idea: idea.text.slice(0, 60), expect: idea.expectKind, lang }
        try {
          const r = await call[provider]({ apiKey, model, system: SYSTEM_PROMPT, user: userPrompt({ text: idea.text, lang, mode: 'model' }), effort: process.env.EVAL_EFFORT || 'medium' })
          row.latencyMs = Date.now() - t0; row.input = r.usage.input; row.output = r.usage.output
          row.cost = computeCost(provider, r.usage, price).cost
          const prop = validateProposal(extractJson(r.text)); row.serverValid = true; row.kind = prop.kind; row.kindMatch = prop.kind === idea.expectKind
          row.suspectCitation = CITATION.test(JSON.stringify(prop))
          try { proposalToAnalysis(prop, { text: idea.text, lang }, { provider, model }); row.engineValid = true } catch (e) { row.engineValid = false; row.engineError = String((e as Error).message).slice(0, 120) }
        } catch (e) { row.error = String((e as Error).message).slice(0, 160); row.serverValid = false; row.engineValid = false }
        rows.push(row)
      }
      const n = rows.length, sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)
      const lat = rows.map((r) => Number(r.latencyMs ?? 0)).sort((a, b) => a - b)
      const summary = {
        model: spec, n, serverValidPct: +(100 * rows.filter((r) => r.serverValid).length / n).toFixed(1), engineValidPct: +(100 * rows.filter((r) => r.engineValid).length / n).toFixed(1),
        kindMatchPct: +(100 * rows.filter((r) => r.kindMatch).length / n).toFixed(1), suspectCitations: rows.filter((r) => r.suspectCitation).length,
        avgInputTokens: Math.round(sum('input') / n), avgOutputTokens: Math.round(sum('output') / n), avgCostUsd: price ? +(sum('cost') / n).toFixed(5) : 'set EVAL_PRICES', p50LatencyMs: lat[Math.floor(n / 2)], p95LatencyMs: lat[Math.floor(n * 0.95)],
      }
      console.table([summary])
      writeFileSync(new URL(`./results-${spec.replace(/[^\w.-]/g, '_')}-${Date.now()}.json`, import.meta.url), JSON.stringify({ summary, rows }, null, 1))
    }, 30 * 60_000)
  }
})
