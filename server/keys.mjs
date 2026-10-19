import { decrypt } from './crypto.mjs'
const ENV = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', paypal: 'PAYPAL_CLIENT_SECRET' }

/** DB key (encrypted, set in the admin panel) wins; env var is a fallback. Returns null if none. */
export async function getApiKey(pool, cfg, provider) {
  const [rows] = await pool.query('SELECT ciphertext FROM api_keys WHERE provider=?', [provider])
  if (rows.length) { try { return decrypt(rows[0].ciphertext, cfg.appSecret) } catch { return null } }
  return process.env[ENV[provider]] || null
}
export async function keyStatus(pool, provider) {
  const [rows] = await pool.query('SELECT last4, updated_at, verified_at FROM api_keys WHERE provider=?', [provider])
  if (rows.length) return { provider, configured: true, source: 'admin', last4: rows[0].last4, updatedAt: rows[0].updated_at, verifiedAt: rows[0].verified_at }
  const env = process.env[ENV[provider]]
  if (env) return { provider, configured: true, source: 'env', last4: env.slice(-4), updatedAt: null, verifiedAt: null }
  return { provider, configured: false, source: null, last4: null, updatedAt: null, verifiedAt: null }
}
