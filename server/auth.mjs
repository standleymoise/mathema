import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { hashPassword, newToken, sha256, verifyPassword } from './crypto.mjs'
import { getSetting } from './db.mjs'

const COOKIE = 'mathema_sid'
const DAYS = 30
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

function parseCookies(h = '') {
  const out = {}
  for (const part of h.split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()) }
  return out
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, planId: u.plan_id })

export function sessionMiddleware(pool) {
  return async (req, _res, next) => {
    const tok = parseCookies(req.headers.cookie)[COOKIE]
    req.user = null
    if (tok) {
      const [rows] = await pool.query(
        'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0', [sha256(tok), new Date()])
      if (rows.length) req.user = rows[0]
    }
    next()
  }
}
export const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'auth_required' }))
export const requireAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(req.user ? 403 : 401).json({ error: req.user ? 'forbidden' : 'auth_required' }))

/** CSRF defence for cookie auth: mutating requests must be JSON and same-origin (or carry no Origin, e.g. curl). */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.headers.origin
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'bad_origin' }) } catch { return res.status(403).json({ error: 'bad_origin' }) }
  }
  if (!req.is('application/json')) return res.status(415).json({ error: 'json_required' })
  next()
}

async function startSession(pool, res, userId, secure) {
  const token = newToken()
  const exp = new Date(Date.now() + DAYS * 864e5)
  await pool.query('INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)', [sha256(token), userId, new Date(), exp])
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure ? '; Secure' : ''}`)
}

export function authRoutes(pool, cfg) {
  const r = Router()
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: cfg.prod ? 15 : 1000, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_attempts' } })

  r.post('/register', limiter, async (req, res) => {
    if (!(await getSetting(pool, 'signup_enabled'))) return res.status(403).json({ error: 'signup_disabled' })
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const name = String(req.body?.name ?? '').trim().slice(0, 120)
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'invalid_email' })
    if (password.length < 10 || password.length > 200) return res.status(400).json({ error: 'weak_password', detail: 'Use at least 10 characters.' })
    const [dup] = await pool.query('SELECT id FROM users WHERE email=?', [email])
    if (dup.length) return res.status(409).json({ error: 'email_taken' })
    const [ins] = await pool.query('INSERT INTO users (email,name,pass_hash,role,plan_id,created_at,last_login) VALUES (?,?,?,?,?,?,?)', [email, name, await hashPassword(password), 'user', 'free', new Date(), new Date()])
    await startSession(pool, res, ins.insertId, cfg.prod)
    const [u] = await pool.query('SELECT * FROM users WHERE id=?', [ins.insertId])
    res.status(201).json({ user: publicUser(u[0]) })
  })

  r.post('/login', limiter, async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const [rows] = await pool.query('SELECT * FROM users WHERE email=?', [email])
    const u = rows[0]
    // Same error and similar timing whether the email exists or not.
    const ok = u ? await verifyPassword(password, u.pass_hash) : (await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'), false)
    if (!ok || u.disabled) return res.status(401).json({ error: 'invalid_credentials' })
    await pool.query('UPDATE users SET last_login=? WHERE id=?', [new Date(), u.id])
    await startSession(pool, res, u.id, cfg.prod)
    res.json({ user: publicUser(u) })
  })

  r.post('/logout', async (req, res) => {
    const tok = parseCookies(req.headers.cookie)[COOKIE]
    if (tok) await pool.query('DELETE FROM sessions WHERE token_hash=?', [sha256(tok)])
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    res.json({ ok: true })
  })

  r.get('/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }))
  return r
}
