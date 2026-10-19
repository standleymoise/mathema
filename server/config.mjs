// All configuration comes from environment variables (set in Hostinger's panel, never committed).
const env = process.env
const prod = env.NODE_ENV === 'production'

export function loadConfig(overrides = {}) {
  const cfg = {
    prod,
    port: Number(env.PORT || 3001),
    db: {
      host: env.DB_HOST || '127.0.0.1',
      port: Number(env.DB_PORT || 3306),
      user: env.DB_USER || 'mathema',
      password: env.DB_PASSWORD || '',
      database: env.DB_NAME || 'mathema',
    },
    appSecret: env.APP_SECRET || '',
    adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD || '',
    distDir: env.DIST_DIR || new URL('../dist', import.meta.url).pathname,
    trustProxy: env.TRUST_PROXY !== '0',
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
    paypalApiBase: env.PAYPAL_API_BASE || '',
    ...overrides,
  }
  if (!cfg.appSecret) {
    if (cfg.prod) throw new Error('APP_SECRET is required in production (32+ random characters). It encrypts the API keys stored in MySQL.')
    cfg.appSecret = 'dev-only-secret-do-not-use-in-production-0000'
    console.warn('[mathema] APP_SECRET not set: using an insecure development secret.')
  }
  if (cfg.appSecret.length < 32 && cfg.prod) throw new Error('APP_SECRET must be at least 32 characters.')
  return cfg
}
