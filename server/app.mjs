import express from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { authRoutes, csrfGuard, sessionMiddleware } from './auth.mjs'
import { analyzeRoutes } from './analyze.mjs'
import { dataRoutes } from './data.mjs'
import { adminRoutes } from './admin.mjs'
import { getSetting } from './db.mjs'
import { keyStatus } from './keys.mjs'
import { billingRoutes, paypalConfig } from './billing.mjs'
import { accountRoutes } from './account.mjs'
import { requireUser } from './auth.mjs'
import rateLimit from 'express-rate-limit'

export function createApp(pool, cfg, deps = {}) {
  const app = express()
  if (cfg.trustProxy) app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    if (cfg.prod) res.setHeader('Strict-Transport-Security', 'max-age=15552000')
    next()
  })
  app.use(express.json({ limit: '6mb' }))

  const api = express.Router()
  api.get('/health', async (_req, res) => {
    const st = deps.status
    if (st && !st.ready) return res.status(503).json({ ok: false, problems: st.problems })
    await pool.query('SELECT 1'); res.json({ ok: true })
  })
  // until the database is reachable every other API call says so instead of failing obscurely
  api.use((_req, res, next) => (deps.status && !deps.status.ready ? res.status(503).json({ error: 'starting', problems: deps.status.problems }) : next()))
  api.use(sessionMiddleware(pool))
  api.use(csrfGuard)
  api.get('/config', async (req, res) => {
    const def = await getSetting(pool, 'ai_default')
    const ks = await keyStatus(pool, def.provider)
    const pc = await paypalConfig(pool, cfg)
    res.json({
      server: true, signupMode: await getSetting(pool, 'signup_mode'), aiAvailable: ks.configured, billingEnabled: pc.configured && !!pc.webhookId,
      legal: { entity: await getSetting(pool, 'legal_entity'), email: await getSetting(pool, 'legal_email') },
      user: req.user ? { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role, planId: req.user.plan_id } : null,
    })
  })
  api.get('/plans', async (_req, res) => {
    const [rows] = await pool.query('SELECT id,name,price_cents priceCents,interval_unit intervalUnit,ai_monthly_quota aiMonthlyQuota,(paypal_plan_id IS NOT NULL AND paypal_plan_id<>\'\') purchasable FROM plans WHERE active=1 ORDER BY price_cents')
    res.json(rows.map((p) => ({ ...p, purchasable: !!p.purchasable })))
  })
  const fbLimit = rateLimit({ windowMs: 60_000, limit: cfg.prod ? 5 : 1000, keyGenerator: (req) => `u${req.user?.id ?? req.ip}`, validate: { keyGeneratorIpFallback: false } })
  api.post('/feedback', requireUser, fbLimit, async (req, res) => {
    const message = String(req.body?.message ?? '').trim().slice(0, 2000)
    if (message.length < 3) return res.status(400).json({ error: 'empty_message' })
    const kind = ['bug', 'idea', 'other'].includes(req.body?.kind) ? req.body.kind : 'other'
    await pool.query('INSERT INTO feedback (user_id,kind,message,page,created_at) VALUES (?,?,?,?,?)', [req.user.id, kind, message, String(req.body?.page ?? '').slice(0, 120), new Date()])
    res.status(201).json({ ok: true })
  })
  api.use('/auth', authRoutes(pool, cfg))
  api.use('/billing', billingRoutes(pool, cfg))
  api.use('/account', accountRoutes(pool, cfg))
  api.use(analyzeRoutes(pool, cfg, deps))
  api.use(dataRoutes(pool))
  api.use('/admin', adminRoutes(pool, cfg))
  api.use((_req, res) => res.status(404).json({ error: 'not_found' }))
  app.use('/api', api)

  // Static frontend (built with `npm run build`) + SPA fallback.
  if (existsSync(join(cfg.distDir, 'index.html'))) {
    app.use(express.static(cfg.distDir, { index: 'index.html', maxAge: '1h' }))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(cfg.distDir, 'index.html')))
  }
  app.use((err, _req, res, _next) => {
    console.error('[mathema] error:', err?.message ?? err)
    if (res.headersSent) return
    res.status(500).json({ error: 'server_error' })
  })
  return app
}
