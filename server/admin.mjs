import { Router } from 'express'
import { requireAdmin } from './auth.mjs'
import { audit, getSetting, setSetting } from './db.mjs'
import { encrypt } from './crypto.mjs'
import { keyStatus, getApiKey } from './keys.mjs'
import { PROVIDERS, verifyKey } from './ai/providers.mjs'
import { loadFinance } from './finance.mjs'

const bad = (res, msg) => res.status(400).json({ error: 'invalid', detail: msg })
const money = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null }
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export function adminRoutes(pool, cfg) {
  const r = Router()
  r.use(requireAdmin)

  // ---- API keys (never returned, only last 4 chars) ----
  r.get('/keys', async (_req, res) => res.json(await Promise.all(PROVIDERS.map((p) => keyStatus(pool, p)))))
  r.put('/keys/:provider', async (req, res) => {
    const provider = req.params.provider
    const key = String(req.body?.key ?? '').trim()
    if (!PROVIDERS.includes(provider)) return bad(res, 'unknown provider')
    if (key.length < 20 || /\s/.test(key) || key.length > 400) return bad(res, 'that does not look like an API key')
    const v = req.body?.verify === false ? null : await verifyKey(provider, key)
    if (v && !v.ok) return res.status(422).json({ error: 'key_rejected', detail: v.error })
    await pool.query('INSERT INTO api_keys (provider,ciphertext,last4,updated_at,verified_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext), last4=VALUES(last4), updated_at=VALUES(updated_at), verified_at=VALUES(verified_at)',
      [provider, encrypt(key, cfg.appSecret), key.slice(-4), new Date(), v ? new Date() : null])
    await audit(pool, req.user.id, 'key.set', provider)
    res.json(await keyStatus(pool, provider))
  })
  r.delete('/keys/:provider', async (req, res) => {
    if (!PROVIDERS.includes(req.params.provider)) return bad(res, 'unknown provider')
    await pool.query('DELETE FROM api_keys WHERE provider=?', [req.params.provider])
    await audit(pool, req.user.id, 'key.delete', req.params.provider)
    res.json(await keyStatus(pool, req.params.provider))
  })
  r.post('/keys/:provider/verify', async (req, res) => {
    const p = req.params.provider
    if (!PROVIDERS.includes(p)) return bad(res, 'unknown provider')
    const key = await getApiKey(pool, cfg, p)
    if (!key) return res.status(404).json({ error: 'no_key' })
    const v = await verifyKey(p, key)
    if (v.ok) await pool.query('UPDATE api_keys SET verified_at=? WHERE provider=?', [new Date(), p])
    res.json(v)
  })

  // ---- models, prices, routing settings ----
  r.get('/models', async (_req, res) => { const [rows] = await pool.query('SELECT provider,model,label,input_per_mtok inputPerMtok,output_per_mtok outputPerMtok,enabled FROM model_prices ORDER BY provider,model'); res.json(rows.map((x) => ({ ...x, enabled: !!x.enabled }))) })
  r.put('/models', async (req, res) => {
    const { provider, model, label = '', enabled = true } = req.body ?? {}
    if (!PROVIDERS.includes(provider) || !/^[\w.:-]{2,100}$/.test(String(model))) return bad(res, 'provider/model invalid')
    const i = req.body.inputPerMtok === null || req.body.inputPerMtok === '' ? null : money(req.body.inputPerMtok)
    const o = req.body.outputPerMtok === null || req.body.outputPerMtok === '' ? null : money(req.body.outputPerMtok)
    if ((req.body.inputPerMtok != null && req.body.inputPerMtok !== '' && i === null) || (req.body.outputPerMtok != null && req.body.outputPerMtok !== '' && o === null)) return bad(res, 'prices must be non-negative numbers (USD per million tokens)')
    await pool.query('INSERT INTO model_prices (provider,model,label,input_per_mtok,output_per_mtok,enabled) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label), input_per_mtok=VALUES(input_per_mtok), output_per_mtok=VALUES(output_per_mtok), enabled=VALUES(enabled)', [provider, model, String(label).slice(0, 100), i, o, enabled ? 1 : 0])
    await audit(pool, req.user.id, 'model.upsert', `${provider}/${model}`)
    res.json({ ok: true })
  })
  r.delete('/models/:provider/:model', async (req, res) => { await pool.query('DELETE FROM model_prices WHERE provider=? AND model=?', [req.params.provider, req.params.model]); res.json({ ok: true }) })

  r.get('/settings', async (_req, res) => res.json({
    aiDefault: await getSetting(pool, 'ai_default'), aiResearch: await getSetting(pool, 'ai_research'), aiEffort: await getSetting(pool, 'ai_effort'),
    signupEnabled: await getSetting(pool, 'signup_enabled'), dailyCapPerUser: await getSetting(pool, 'daily_cap_per_user'),
  }))
  r.put('/settings', async (req, res) => {
    const b = req.body ?? {}
    for (const [key, k] of [['aiDefault', 'ai_default'], ['aiResearch', 'ai_research']]) {
      if (b[key] === undefined) continue
      if (!PROVIDERS.includes(b[key]?.provider) || typeof b[key]?.model !== 'string') return bad(res, `${key} invalid`)
      const [ok] = await pool.query('SELECT 1 FROM model_prices WHERE provider=? AND model=?', [b[key].provider, b[key].model])
      if (!ok.length) return bad(res, `${key}: add the model to the list first`)
      await setSetting(pool, k, { provider: b[key].provider, model: b[key].model })
    }
    if (b.aiEffort !== undefined) { if (!['low', 'medium', 'high'].includes(b.aiEffort)) return bad(res, 'effort must be low, medium or high'); await setSetting(pool, 'ai_effort', b.aiEffort) }
    if (b.signupEnabled !== undefined) await setSetting(pool, 'signup_enabled', !!b.signupEnabled)
    if (b.dailyCapPerUser !== undefined) { const n = Number(b.dailyCapPerUser); if (!Number.isInteger(n) || n < 0 || n > 10000) return bad(res, 'daily cap must be an integer 0-10000 (0 = no cap)'); await setSetting(pool, 'daily_cap_per_user', n) }
    await audit(pool, req.user.id, 'settings.update', Object.keys(b).join(','))
    res.json({ ok: true })
  })

  // ---- users, plans, subscriptions, payments, expenses ----
  r.get('/users', async (_req, res) => {
    const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0)
    const [rows] = await pool.query(
      `SELECT u.id,u.email,u.name,u.role,u.plan_id planId,u.disabled,u.created_at createdAt,u.last_login lastLogin,
              (SELECT COUNT(*) FROM usage_log l WHERE l.user_id=u.id AND l.ok=1 AND l.created_at>=?) analysesThisMonth,
              (SELECT COALESCE(SUM(cost_usd),0) FROM usage_log l WHERE l.user_id=u.id AND l.created_at>=?) costThisMonth
         FROM users u ORDER BY u.created_at DESC LIMIT 500`, [start, start])
    res.json(rows.map((u) => ({ ...u, disabled: !!u.disabled, costThisMonth: Number(u.costThisMonth) })))
  })
  r.patch('/users/:id', async (req, res) => {
    const id = Number(req.params.id)
    const [[u]] = await pool.query('SELECT * FROM users WHERE id=?', [id])
    if (!u) return res.status(404).json({ error: 'not_found' })
    const b = req.body ?? {}
    if (b.role !== undefined || b.disabled !== undefined) {
      const demote = (b.role === 'user' && u.role === 'admin') || (b.disabled === true && u.role === 'admin')
      if (demote) { const [[c]] = await pool.query("SELECT COUNT(*) n FROM users WHERE role='admin' AND disabled=0"); if (Number(c.n) <= 1) return bad(res, 'cannot remove the last active admin') }
    }
    if (b.role !== undefined) { if (!['user', 'admin'].includes(b.role)) return bad(res, 'role invalid'); await pool.query('UPDATE users SET role=? WHERE id=?', [b.role, id]) }
    if (b.disabled !== undefined) { await pool.query('UPDATE users SET disabled=? WHERE id=?', [b.disabled ? 1 : 0, id]); if (b.disabled) await pool.query('DELETE FROM sessions WHERE user_id=?', [id]) }
    if (b.planId !== undefined) { const [p] = await pool.query('SELECT 1 FROM plans WHERE id=?', [b.planId]); if (!p.length) return bad(res, 'plan not found'); await pool.query('UPDATE users SET plan_id=? WHERE id=?', [b.planId, id]) }
    await audit(pool, req.user.id, 'user.update', `${id}:${Object.keys(b).join(',')}`)
    res.json({ ok: true })
  })

  r.get('/plans', async (_req, res) => { const [rows] = await pool.query('SELECT id,name,price_cents priceCents,interval_unit intervalUnit,ai_monthly_quota aiMonthlyQuota,active FROM plans ORDER BY price_cents'); res.json(rows.map((p) => ({ ...p, active: !!p.active }))) })
  r.put('/plans', async (req, res) => {
    const b = req.body ?? {}
    if (!/^[a-z0-9_-]{2,32}$/.test(String(b.id))) return bad(res, 'plan id: 2-32 chars a-z 0-9 _ -')
    const price = Number(b.priceCents), quota = b.aiMonthlyQuota === null || b.aiMonthlyQuota === '' ? null : Number(b.aiMonthlyQuota)
    if (!Number.isInteger(price) || price < 0 || (quota !== null && (!Number.isInteger(quota) || quota < 0))) return bad(res, 'price (cents) and quota must be non-negative integers')
    await pool.query('INSERT INTO plans (id,name,price_cents,interval_unit,ai_monthly_quota,active) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), price_cents=VALUES(price_cents), interval_unit=VALUES(interval_unit), ai_monthly_quota=VALUES(ai_monthly_quota), active=VALUES(active)',
      [b.id, String(b.name || b.id).slice(0, 80), price, b.intervalUnit === 'year' ? 'year' : 'month', quota, b.active === false ? 0 : 1])
    await audit(pool, req.user.id, 'plan.upsert', b.id)
    res.json({ ok: true })
  })

  r.get('/subscriptions', async (_req, res) => {
    const [rows] = await pool.query(`SELECT s.id,s.user_id userId,u.email,s.plan_id planId,s.status,s.amount_cents amountCents,s.interval_unit intervalUnit,s.started_at startedAt,s.canceled_at canceledAt,s.source,s.note FROM subscriptions s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.started_at DESC LIMIT 500`)
    res.json(rows)
  })
  r.post('/subscriptions', async (req, res) => {
    const b = req.body ?? {}
    const [[u]] = await pool.query('SELECT id FROM users WHERE id=?', [Number(b.userId)])
    const [[p]] = await pool.query('SELECT * FROM plans WHERE id=?', [b.planId])
    if (!u || !p) return bad(res, 'user or plan not found')
    const amount = b.amountCents === undefined ? p.price_cents : Number(b.amountCents)
    if (!Number.isInteger(amount) || amount < 0) return bad(res, 'amountCents invalid')
    const status = ['active', 'trialing', 'past_due'].includes(b.status) ? b.status : 'active'
    await pool.query("UPDATE subscriptions SET status='canceled', canceled_at=? WHERE user_id=? AND status<>'canceled'", [new Date(), u.id])
    const [ins] = await pool.query('INSERT INTO subscriptions (user_id,plan_id,status,amount_cents,interval_unit,started_at,source,note) VALUES (?,?,?,?,?,?,?,?)', [u.id, p.id, status, amount, b.intervalUnit === 'year' ? 'year' : p.interval_unit, new Date(), 'manual', String(b.note ?? '').slice(0, 255)])
    await pool.query('UPDATE users SET plan_id=? WHERE id=?', [p.id, u.id])
    await audit(pool, req.user.id, 'subscription.create', `user ${u.id} -> ${p.id}`)
    res.status(201).json({ id: ins.insertId })
  })
  r.post('/subscriptions/:id/cancel', async (req, res) => {
    const [[s]] = await pool.query('SELECT * FROM subscriptions WHERE id=?', [Number(req.params.id)])
    if (!s) return res.status(404).json({ error: 'not_found' })
    await pool.query("UPDATE subscriptions SET status='canceled', canceled_at=? WHERE id=?", [new Date(), s.id])
    await pool.query("UPDATE users SET plan_id='free' WHERE id=? AND plan_id=?", [s.user_id, s.plan_id])
    await audit(pool, req.user.id, 'subscription.cancel', String(s.id))
    res.json({ ok: true })
  })

  r.get('/payments', async (_req, res) => { const [rows] = await pool.query('SELECT p.id,p.user_id userId,u.email,p.amount_cents amountCents,p.currency,p.paid_at paidAt,p.source,p.note FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.paid_at DESC LIMIT 300'); res.json(rows) })
  r.post('/payments', async (req, res) => {
    const b = req.body ?? {}
    const cents = Number(b.amountCents)
    const when = b.paidAt ? new Date(b.paidAt) : new Date()
    if (!Number.isInteger(cents) || cents === 0 || isNaN(when)) return bad(res, 'amountCents (non-zero integer) and a valid date are required')
    await pool.query('INSERT INTO payments (user_id,amount_cents,currency,paid_at,source,note) VALUES (?,?,?,?,?,?)', [b.userId ? Number(b.userId) : null, cents, 'USD', when, 'manual', String(b.note ?? '').slice(0, 255)])
    await audit(pool, req.user.id, 'payment.create', String(cents))
    res.status(201).json({ ok: true })
  })
  r.delete('/payments/:id', async (req, res) => { await pool.query('DELETE FROM payments WHERE id=?', [Number(req.params.id)]); res.json({ ok: true }) })

  r.get('/expenses', async (_req, res) => { const [rows] = await pool.query('SELECT id,name,category,amount_cents amountCents,month,recurring FROM expenses ORDER BY month DESC, id DESC LIMIT 300'); res.json(rows.map((e) => ({ ...e, recurring: !!e.recurring }))) })
  r.post('/expenses', async (req, res) => {
    const b = req.body ?? {}
    const cents = Number(b.amountCents)
    if (!String(b.name ?? '').trim() || !Number.isInteger(cents) || cents <= 0 || !MONTH.test(String(b.month))) return bad(res, 'name, amountCents (>0) and month (YYYY-MM) are required')
    await pool.query('INSERT INTO expenses (name,category,amount_cents,month,recurring) VALUES (?,?,?,?,?)', [String(b.name).slice(0, 120), String(b.category ?? 'other').slice(0, 40), cents, b.month, b.recurring ? 1 : 0])
    res.status(201).json({ ok: true })
  })
  r.delete('/expenses/:id', async (req, res) => { await pool.query('DELETE FROM expenses WHERE id=?', [Number(req.params.id)]); res.json({ ok: true }) })

  r.get('/finance', async (req, res) => res.json(await loadFinance(pool, Math.min(24, Math.max(1, Number(req.query.months) || 12)))))
  r.get('/audit', async (_req, res) => { const [rows] = await pool.query('SELECT a.id,a.action,a.detail,a.created_at createdAt,u.email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100'); res.json(rows) })
  return r
}
