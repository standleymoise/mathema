import express from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { authRoutes, csrfGuard, sessionMiddleware } from './auth.mjs'
import { analyzeRoutes } from './analyze.mjs'
import { dataRoutes } from './data.mjs'
import { adminRoutes } from './admin.mjs'
import { getSetting } from './db.mjs'
import { keyStatus } from './keys.mjs'

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
  api.use(sessionMiddleware(pool))
  api.use(csrfGuard)
  api.get('/health', async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }) })
  api.get('/config', async (req, res) => {
    const def = await getSetting(pool, 'ai_default')
    const ks = await keyStatus(pool, def.provider)
    res.json({ server: true, signupEnabled: await getSetting(pool, 'signup_enabled'), aiAvailable: ks.configured, user: req.user ? { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role, planId: req.user.plan_id } : null })
  })
  api.use('/auth', authRoutes(pool, cfg))
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
