import express from 'express'
import { loadConfig } from './config.mjs'
import { createPool, migrate } from './db.mjs'
import { createApp } from './app.mjs'
import { enforceGrace } from './billing.mjs'

// The process must ALWAYS start listening, even when configuration is wrong: a crash-on-start makes the
// host answer a bare "503" with no clue. Problems are logged and reported on /api/health instead.
const port = Number(process.env.PORT || 3001)
const status = { ready: false, problems: ['Connecting to the database… (if this persists for more than ~15 s, DB_HOST/DB_PORT are probably wrong or unreachable)'] }

let cfg = null
let cfgError = ''
try { cfg = loadConfig() } catch (e) { cfgError = String(e.message); status.problems.push(cfgError); console.error('[mathema] CONFIG ERROR:', e.message) }

let app
if (cfg) {
  const pool = createPool(cfg.db)
  app = createApp(pool, cfg, { status })
  const attempt = async () => {
    try {
      await migrate(pool, cfg)
      status.ready = true; status.problems = []
      console.log('[mathema] database ready')
      const grace = async () => { try { const n = await enforceGrace(pool); if (n) console.log(`[mathema] ${n} customer(s) moved to Free after the grace period`) } catch (e) { console.error('[mathema] grace job failed:', e.message) } }
      void grace(); setInterval(grace, 60 * 60 * 1000).unref()
    } catch (e) {
      status.ready = false
      // public message: error code only (the full text can contain the DB user name; it stays in the server log)
      status.problems = [`MySQL error ${e.code ?? 'unknown'} (see the app's runtime log)`, 'Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME']
      console.error('[mathema] DATABASE ERROR (retrying in 10 s):', e.code ?? '', e.message)
      setTimeout(attempt, 10_000)
    }
  }
  void attempt()
} else {
  app = express()
  // without a valid config we cannot know the mode: show details only when explicitly allowed or clearly not in production
  const showDetails = process.env.EXPOSE_HEALTH_DETAILS === '1' || process.env.NODE_ENV !== 'production'
  app.use((_req, res) => res.status(500).type('text/plain').send(showDetails ? `MATHEMA is misconfigured:\n- ${status.problems.join('\n- ')}\n` : 'MATHEMA is temporarily unavailable. The administrator has been notified through the server log.\n'))
}
app.listen(port, '0.0.0.0', () => console.log(`[mathema] listening on :${port} (${process.env.NODE_ENV || 'development'})`))
process.on('unhandledRejection', (e) => console.error('[mathema] unhandledRejection:', e))
