import { loadConfig } from './config.mjs'
import { createPool, migrate } from './db.mjs'
import { createApp } from './app.mjs'

const cfg = loadConfig()
const pool = createPool(cfg.db)
try {
  await migrate(pool, cfg)
} catch (e) {
  console.error('[mathema] Could not connect/migrate MySQL:', e.message)
  console.error('Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.')
  process.exit(1)
}
createApp(pool, cfg).listen(cfg.port, () => console.log(`[mathema] listening on :${cfg.port} (${cfg.prod ? 'production' : 'development'})`))
