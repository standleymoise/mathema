import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireUser } from './auth.mjs'
import { getSetting } from './db.mjs'
import { getApiKey } from './keys.mjs'
import { call, ProviderError } from './ai/providers.mjs'
import { SYSTEM_PROMPT, userPrompt } from './ai/prompt.mjs'
import { extractJson, validateProposal, ProposalError } from './ai/proposal.mjs'
import { computeCost } from './ai/cost.mjs'
import { featuresFor } from './features.mjs'
import { detailFor, GENERIC } from './errors.mjs'

const MODES = new Set(['understand', 'model', 'experiment', 'research', 'connect'])
const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

export async function usageFor(pool, user) {
  const [[plan]] = await pool.query('SELECT * FROM plans WHERE id=?', [user.plan_id])
  const [[row]] = await pool.query("SELECT COUNT(*) n FROM usage_log WHERE user_id=? AND app='mathema' AND ok=1 AND created_at>=?", [user.id, monthStart()])
  const quota = user.role === 'admin' ? null : plan?.ai_monthly_quota ?? null
  const next = monthStart(); next.setUTCMonth(next.getUTCMonth() + 1)
  return { used: Number(row.n), quota, plan: plan?.name ?? user.plan_id, resetsAt: next.toISOString(), features: await featuresFor(pool, user) }
}

export function analyzeRoutes(pool, cfg, deps = {}) {
  const r = Router()
  const callers = deps.call ?? call
  const limiter = rateLimit({ windowMs: 60_000, limit: cfg.prod ? 10 : 1000, keyGenerator: (req) => `u${req.user?.id ?? req.ip}`, validate: { keyGeneratorIpFallback: false }, message: { error: 'too_many_requests' } })

  r.get('/usage', requireUser, async (req, res) => res.json(await usageFor(pool, req.user)))

  r.post('/analyze', requireUser, limiter, async (req, res) => {
    const text = String(req.body?.text ?? '').trim()
    const lang = req.body?.lang === 'es' ? 'es' : 'en'
    const mode = MODES.has(req.body?.mode) ? req.body.mode : 'model'
    if (!text) return res.status(400).json({ error: 'empty_input' })
    const features = await featuresFor(pool, req.user)
    if (text.length > features.aiMaxChars) return res.status(413).json({ error: 'input_too_long', max: features.aiMaxChars, detail: `Ideas for AI analysis are limited to ${features.aiMaxChars} characters on your plan` })
    // Research mode only gets the premium model on plans that include it; others transparently use the default model
    const research = mode === 'research' && features.researchPremium
    const downgraded = mode === 'research' && !features.researchPremium
    const pick = await getSetting(pool, research ? 'ai_research' : 'ai_default')
    const [prices] = await pool.query('SELECT * FROM model_prices WHERE provider=? AND model=? AND enabled=1', [pick.provider, pick.model])
    if (!prices.length) { console.error(`[mathema] ${pick.provider}/${pick.model} is not enabled in Admin → AI & keys`); return res.status(503).json({ error: 'model_not_enabled', detail: detailFor(req, `${pick.provider}/${pick.model} is not enabled in the admin panel`, GENERIC.ai) }) }
    const apiKey = await getApiKey(pool, cfg, pick.provider)
    if (!apiKey) return res.status(503).json({ error: 'ai_not_configured' })

    const usage = await usageFor(pool, req.user)
    if (usage.quota !== null && usage.used >= usage.quota) return res.status(402).json({ error: 'quota_exceeded', ...usage })
    if (req.user.role !== 'admin') {
      const cap = Number(await getSetting(pool, 'daily_cap_per_user'))
      const day = new Date(); day.setUTCHours(0, 0, 0, 0)
      const [[d]] = await pool.query("SELECT COUNT(*) n FROM usage_log WHERE user_id=? AND created_at>=?", [req.user.id, day])
      if (cap > 0 && Number(d.n) >= cap) return res.status(429).json({ error: 'daily_cap_reached', cap })
    }

    const t0 = Date.now()
    const record = async (provider, model, u, extra = {}) => {
      const { cost, missing } = computeCost(provider, u, prices[0])
      const [ins] = await pool.query(
        'INSERT INTO usage_log (user_id,app,provider,model,mode,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd,price_missing,ok,error,latency_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [req.user.id, 'mathema', provider, model, mode, u.input, u.output, u.cacheRead, u.cacheWrite, cost, missing ? 1 : 0, extra.ok === false ? 0 : 1, extra.error ?? null, Date.now() - t0, new Date()])
      return { id: ins.insertId, cost }
    }
    let result
    try {
      result = await callers[pick.provider]({ apiKey, model: pick.model, system: SYSTEM_PROMPT, user: userPrompt({ text, lang, mode }), effort: await getSetting(pool, 'ai_effort') })
    } catch (e) {
      const status = e instanceof ProviderError ? e.status : 502
      await record(pick.provider, pick.model, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, { ok: false, error: String(e.message).slice(0, 250) })
      console.error(`[mathema] AI provider error (${pick.provider}/${pick.model}): ${String(e.message).slice(0, 250)}`)
      // Never sent to anyone in the browser, admins included: it is stored in usage_log and shown under Admin → AI & keys.
      return res.status(status === 429 ? 429 : 502).json({ error: 'provider_error', detail: status === 429 ? 'The AI service is busy. Please try again in a moment.' : GENERIC.ai })
    }
    // The call succeeded and was billed; record it before parsing so cost is never lost.
    const row = await record(pick.provider, pick.model, result.usage)
    try {
      const proposal = validateProposal(extractJson(result.text))
      const after = await usageFor(pool, req.user)
      res.json({ proposal, meta: { provider: pick.provider, model: pick.model, usage: result.usage, quota: { used: after.used, quota: after.quota }, downgraded } })
    } catch (e) {
      await pool.query('UPDATE usage_log SET ok=0, error=? WHERE id=?', [String(e.message).slice(0, 250), row.id])
      res.status(502).json({ error: 'invalid_model_output', detail: detailFor(req, e instanceof ProposalError ? e.message : 'unparseable output', GENERIC.aiOutput) })
    }
  })
  return r
}
