import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import http from 'node:http'
import { createPool, migrate } from './db.mjs'
import { createApp } from './app.mjs'
import { decrypt, encrypt, hashPassword, verifyPassword } from './crypto.mjs'
import { computeFinance, monthRange } from './finance.mjs'
import { enforceGrace } from './billing.mjs'
import { parseFeatures, validateFeatures } from './features.mjs'
import { extractJson, validateProposal } from './ai/proposal.mjs'
import { computeCost } from './ai/cost.mjs'

describe('crypto', () => {
  it('round-trips API keys and rejects tampering / wrong secret', () => {
    const blob = encrypt('sk-ant-secret-value-1234567890', 'a'.repeat(40))
    expect(blob).not.toContain('secret')
    expect(decrypt(blob, 'a'.repeat(40))).toBe('sk-ant-secret-value-1234567890')
    expect(() => decrypt(blob, 'b'.repeat(40))).toThrow()
    const t = Buffer.from(blob, 'base64'); t[t.length - 1] ^= 1
    expect(() => decrypt(t.toString('base64'), 'a'.repeat(40))).toThrow()
  })
  it('hashes passwords with scrypt', async () => {
    const h = await hashPassword('correct horse battery')
    expect(await verifyPassword('correct horse battery', h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
  })
})

describe('proposal validation', () => {
  it('extracts JSON from fenced/prose output', () => {
    expect(extractJson('Sure!\n```json\n{"a":{"b":"}"}}\n```')).toEqual({ a: { b: '}' } })
    expect(() => extractJson('no json here')).toThrow()
  })
  it('rejects regression/unknown kinds and malformed specs, strips junk', () => {
    expect(() => validateProposal({ kind: 'regression' })).toThrow()
    expect(() => validateProposal({ kind: 'function', spec: { expr: 'x', xName: 'bad name', xMin: 0, xMax: 1 } })).toThrow()
    const p = validateProposal({ kind: 'causal', title: 'T', spec: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', sign: 5 }, { from: 'a', to: 'zzz', sign: 1 }] }, variables: [{ name: 'x', symbol: 'not valid!', role: 'concept' }] })
    expect(p.spec.edges).toHaveLength(1)
    expect(p.spec.edges[0].sign).toBe(0)
    expect(p.variables).toHaveLength(0)
    expect(p.limitations.length).toBeGreaterThan(0)
  })
})

describe('cost', () => {
  it('computes from admin prices and flags missing prices instead of inventing cost', () => {
    expect(computeCost('anthropic', { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }, { input_per_mtok: 2, output_per_mtok: 10 }).cost).toBeCloseTo(0.007, 6)
    expect(computeCost('openai', { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }, { input_per_mtok: null, output_per_mtok: null })).toEqual({ cost: 0, missing: true })
  })
})


describe('plan features', () => {
  it('normalises, clamps and validates', () => {
    expect(parseFeatures(undefined)).toEqual({ researchPremium: true, cloudSync: true, maxModels: null, aiMaxChars: 12000 }) // legacy plans keep everything
    expect(parseFeatures('{"aiMaxChars":999999,"maxModels":0}')).toMatchObject({ aiMaxChars: 12000, maxModels: null })
    expect(parseFeatures({ researchPremium: false, maxModels: 5, aiMaxChars: 50 })).toMatchObject({ researchPremium: false, maxModels: 5, aiMaxChars: 200 })
    expect(typeof validateFeatures({ maxModels: -1 })).toBe('string'); expect(typeof validateFeatures({ aiMaxChars: 13000 })).toBe('string')
    expect(validateFeatures({ maxModels: '', aiMaxChars: 4000, cloudSync: false })).toMatchObject({ maxModels: null, cloudSync: false })
  })
})

describe('finance maths', () => {
  const now = new Date('2026-10-19T12:00:00Z')
  const subs = [
    { status: 'active', amount_cents: 1200, interval_unit: 'month', started_at: new Date('2026-08-05'), canceled_at: null, plan_id: 'pro' },
    { status: 'active', amount_cents: 12000, interval_unit: 'year', started_at: new Date('2026-09-10'), canceled_at: null, plan_id: 'pro' },
    { status: 'canceled', amount_cents: 1200, interval_unit: 'month', started_at: new Date('2026-07-01'), canceled_at: new Date('2026-10-01'), plan_id: 'pro' },
    { status: 'trialing', amount_cents: 1200, interval_unit: 'month', started_at: new Date('2026-10-10'), canceled_at: null, plan_id: 'pro' },
    { status: 'past_due', amount_cents: 2400, interval_unit: 'month', started_at: new Date('2026-09-01'), canceled_at: null, plan_id: 'pro' },
  ]
  const f = computeFinance({
    now, months: 3, subs, plans: [{ id: 'pro', name: 'Pro' }],
    feeRate: { percent: 5, fixedCents: 30 },
    payments: [{ amount_cents: 1200, fee_cents: 65, source: 'paypal', paid_at: new Date('2026-10-02') }, { amount_cents: 12000, fee_cents: 0, source: 'paypal', paid_at: new Date('2026-09-10') }, { amount_cents: 1200, fee_cents: 0, source: 'paypal', paid_at: new Date('2026-10-03') }],
    expenses: [{ amount_cents: 1000, month: '2026-09', recurring: 1 }, { amount_cents: 500, month: '2026-10', recurring: 0 }],
    usage: [
      { month: '2026-10', app: 'mathema', provider: 'anthropic', model: 'claude-sonnet-5-5', user_id: 1, email: 'a@x.co', calls: 4, failed: 1, cost: 0.12, input: 8000, output: 4000, unpriced: 0 },
      { month: '2026-10', app: 'other', provider: 'openai', model: 'gpt-x', user_id: 2, email: 'b@x.co', calls: 2, failed: 0, cost: 0, input: 100, output: 100, unpriced: 2 },
    ],
  })
  it('computes MRR/ARR normalising yearly plans, excluding trials and past_due', () => {
    expect(f.kpis.mrr).toBe(22) // 12 + 120/12 = 22
    expect(f.kpis.arr).toBe(264)
    expect(f.kpis.atRiskMrr).toBe(24)
    expect(f.kpis.activeSubscribers).toBe(2)
    expect(f.kpis.arpu).toBe(11)
  })
  it('computes churn, history, costs by app and flags unpriced calls', () => {
    expect(f.kpis.churn30d).toBe(1)
    expect(f.kpis.churnRate30d).toBeCloseTo(1 / 3, 3)
    expect(f.mrrHistory.map((m) => m.month)).toEqual(monthRange(now, 3))
    expect(f.costByApp.find((a) => a.key === 'mathema').cost).toBe(0.12)
    expect(f.costByApp.find((a) => a.key === 'mathema').avgCost).toBe(0.04) // 3 successful calls
    expect(f.unpricedCalls).toBe(2)
    const oct = f.months.at(-1)
    expect(oct.expenses).toBe(15) // recurring 10 + one-off 5
    expect(oct.revenue).toBe(24) // two October payments
    expect(oct.fees).toBe(0.65)
    expect(oct.profit).toBeCloseTo(24 - 0.65 - 0.12 - 15, 2) // fees are a cost
    expect(f.kpis.feesThisMonth).toBe(0.65); expect(f.kpis.netRevenueThisMonth).toBe(23.35)
    expect(f.kpis.paymentsWithoutFee).toBe(1) // the Oct 3 PayPal payment has no fee recorded
    expect(f.kpis.estimatedRunRateFees).toBeCloseTo(22 * 0.05 + 2 * 0.3, 2) // from the admin's fee schedule
    expect(f.kpis.estimatedMonthlyMargin).toBeCloseTo(22 - 0.12 - 15 - 1.7, 2)
  })
})

// ---- integration against a real MySQL/MariaDB (skipped when unavailable) ----
const dbCfg = { host: process.env.TEST_DB_HOST || '127.0.0.1', port: 3306, user: process.env.TEST_DB_USER || 'mathema', password: process.env.TEST_DB_PASSWORD || 'testpass', database: process.env.TEST_DB_NAME || 'mathema_test' }
let pool, up = false
try { pool = createPool(dbCfg); await pool.query('SELECT 1'); up = true } catch { /* no db */ }

describe.skipIf(!up)('HTTP API on MySQL', () => {
  const cfg = { prod: false, appSecret: 'x'.repeat(40), adminEmail: 'boss@example.com', adminPassword: 'admin-password-123', distDir: '/nonexistent', trustProxy: false, publicUrl: 'https://mathema.example', paypalApiBase: '' }
  let app, admin, user
  const calls = []
  const fakeCall = async (args) => {
    calls.push(args)
    return { text: JSON.stringify({ kind: 'causal', title: 'Mock', spec: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', sign: 1 }] } }), usage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 } }
  }
  beforeAll(async () => {
    await pool.query('SET FOREIGN_KEY_CHECKS=0')
    const [t] = await pool.query('SHOW TABLES')
    for (const row of t) await pool.query(`DROP TABLE \`${Object.values(row)[0]}\``)
    await migrate(pool, cfg)
    app = createApp(pool, cfg, { call: { anthropic: fakeCall, openai: fakeCall } })
    admin = request.agent(app).set('X-Requested-With', 'mathema'); user = request.agent(app).set('X-Requested-With', 'mathema')
  })
  afterAll(async () => { await pool?.end() })

  it('bootstraps the admin from env and logs in', async () => {
    expect((await admin.post('/api/auth/login').send({ email: 'boss@example.com', password: 'nope' })).status).toBe(401)
    const r = await admin.post('/api/auth/login').send({ email: 'boss@example.com', password: 'admin-password-123' })
    expect(r.status).toBe(200); expect(r.body.user.role).toBe('admin')
  })
  it('registers users with validation, sets an HttpOnly cookie, and blocks cross-origin writes', async () => {
    expect((await user.post('/api/auth/register').send({ email: 'u@example.com', password: 'long-enough-pw' })).status).toBe(400) // terms not accepted
    expect((await user.post('/api/auth/register').send({ email: 'bad', password: 'long-enough-pw', acceptTerms: true })).status).toBe(400)
    expect((await user.post('/api/auth/register').send({ email: 'u@example.com', password: 'short', acceptTerms: true })).status).toBe(400)
    const r = await user.post('/api/auth/register').send({ email: 'u@example.com', password: 'long-enough-pw', name: 'U', acceptTerms: true })
    expect(r.status).toBe(201)
    expect(r.headers['set-cookie'][0]).toMatch(/HttpOnly/)
    expect((await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'u@example.com', password: 'long-enough-pw' })).status).toBe(403)
    expect((await request(app).post('/api/auth/login').set('Content-Type', 'text/plain').send('x')).status).toBe(415)
  })
  it('keeps admin endpoints away from normal users and anonymous callers', async () => {
    expect((await user.get('/api/admin/finance')).status).toBe(403)
    expect((await request(app).get('/api/admin/keys')).status).toBe(401)
  })
  it('stores API keys encrypted and never returns them', async () => {
    const key = 'sk-ant-test-key-0123456789abcdef'
    const put = await admin.put('/api/admin/keys/anthropic').send({ key, verify: false })
    expect(put.status).toBe(200); expect(put.body.last4).toBe('cdef')
    expect(JSON.stringify(put.body)).not.toContain(key)
    const [[row]] = await pool.query("SELECT ciphertext FROM api_keys WHERE provider='anthropic'")
    expect(row.ciphertext).not.toContain('sk-ant')
    expect(JSON.stringify((await admin.get('/api/admin/keys')).body)).not.toContain(key)
    expect((await admin.put('/api/admin/keys/anthropic').send({ key: 'short' })).status).toBe(400)
  })
  it('analyzes via the configured provider, records priced usage and enforces the monthly quota', async () => {
    expect((await request(app).post('/api/analyze').send({ text: 'x' })).status).toBe(401)
    await pool.query("UPDATE plans SET ai_monthly_quota=2 WHERE id='free'")
    const r = await user.post('/api/analyze').send({ text: 'Rain raises yield.', lang: 'en', mode: 'model' })
    expect(r.status).toBe(200); expect(r.body.proposal.kind).toBe('causal')
    expect(calls.at(-1).apiKey).toBe('sk-ant-test-key-0123456789abcdef') // decrypted server-side only
    expect(JSON.stringify(r.body)).not.toContain('sk-ant')
    const [[u]] = await pool.query('SELECT * FROM usage_log ORDER BY id DESC LIMIT 1')
    expect(u.model).toBe('claude-sonnet-5-5'); expect(Number(u.cost_usd)).toBeCloseTo(0.007, 6); expect(u.price_missing).toBe(0)
    expect((await user.post('/api/analyze').send({ text: 'again' })).status).toBe(200)
    const q = await user.post('/api/analyze').send({ text: 'third' })
    expect(q.status).toBe(402); expect(q.body.error).toBe('quota_exceeded')
    expect((await user.post('/api/analyze').send({ text: 'x'.repeat(13000) })).status).toBe(413)
  })
  it('routes research mode to the research model and flags models without a price', async () => {
    await admin.put('/api/admin/models').send({ provider: 'openai', model: 'my-openai-model', label: 'x', inputPerMtok: null, outputPerMtok: null })
    await admin.put('/api/admin/keys/openai').send({ key: 'sk-openai-test-key-0123456789', verify: false })
    expect((await admin.put('/api/admin/settings').send({ aiResearch: { provider: 'openai', model: 'my-openai-model' } })).status).toBe(200)
    expect((await admin.put('/api/admin/settings').send({ aiDefault: { provider: 'openai', model: 'not-listed' } })).status).toBe(400)
    const r = await admin.post('/api/analyze').send({ text: 'Explore this', mode: 'research' })
    expect(r.status).toBe(200)
    const [[u]] = await pool.query('SELECT * FROM usage_log ORDER BY id DESC LIMIT 1')
    expect(u.provider).toBe('openai'); expect(u.price_missing).toBe(1); expect(Number(u.cost_usd)).toBe(0)
  })
  it('syncs user data with optimistic concurrency', async () => {
    const doc = { schema: 1, models: [{ id: 'm1' }], conversations: [], sources: [], relations: [], experiments: [], seeded: true }
    expect((await user.get('/api/data')).body.version).toBe(0)
    expect((await user.put('/api/data').send({ data: doc, version: 0 })).body.version).toBe(1)
    const stale = await user.put('/api/data').send({ data: doc, version: 0 })
    expect(stale.status).toBe(409); expect(stale.body.version).toBe(1)
    expect((await user.put('/api/data').send({ data: { bad: true }, version: 1 })).status).toBe(400)
    expect((await admin.get('/api/data')).body.version).toBe(0) // isolation: admin has its own document
  })
  it('records subscriptions/payments/expenses and serves the finance dashboard', async () => {
    const [[u]] = await pool.query("SELECT id FROM users WHERE email='u@example.com'")
    expect((await admin.post('/api/admin/subscriptions').send({ userId: u.id, planId: 'pro' })).status).toBe(201)
    expect((await admin.post('/api/admin/payments').send({ userId: u.id, amountCents: 1200 })).status).toBe(201)
    expect((await admin.post('/api/admin/expenses').send({ name: 'Hostinger', amountCents: 800, month: new Date().toISOString().slice(0, 7), recurring: true })).status).toBe(201)
    const f = (await admin.get('/api/admin/finance')).body
    expect(f.kpis.mrr).toBe(12); expect(f.kpis.arr).toBe(144); expect(f.kpis.activeSubscribers).toBe(1)
    expect(f.costByApp[0].key).toBe('mathema'); expect(f.costByModel.length).toBeGreaterThan(0)
    expect(f.unpricedCalls).toBeGreaterThan(0)
    expect((await admin.patch(`/api/admin/users/${u.id}`).send({ role: 'user' })).status).toBe(200)
    const [[a]] = await pool.query("SELECT id FROM users WHERE email='boss@example.com'")
    expect((await admin.patch(`/api/admin/users/${a.id}`).send({ role: 'user' })).status).toBe(400) // last admin protected
  })

  // ---------- step 4-7: plans, PayPal billing, legal consent, closed beta ----------
  describe('billing, beta and account', () => {
    const pp = { status: 'ACTIVE', custom: '', calls: [], server: null }
    const E = (over) => ({ id: `WH-${Math.random().toString(36).slice(2)}`, event_type: 'X', resource: {}, ...over })
    beforeAll(async () => {
      pp.server = http.createServer((req, res) => {
        let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
          pp.calls.push(`${req.method} ${req.url}`); res.setHeader('content-type', 'application/json')
          if (req.url === '/v1/oauth2/token') return req.headers.authorization === `Basic ${Buffer.from('CID:SECRET123456').toString('base64')}` ? res.end('{"access_token":"tok","expires_in":300}') : (res.statusCode = 401, res.end('{}'))
          if (req.headers.authorization !== 'Bearer tok') return (res.statusCode = 401, res.end('{}'))
          if (req.method === 'POST' && req.url === '/v1/billing/subscriptions') { const j = JSON.parse(b); pp.custom = j.custom_id; return res.end(JSON.stringify({ id: 'I-TEST123', links: [{ rel: 'approve', href: 'https://paypal.test/approve/I-TEST123' }] })) }
          if (req.method === 'GET' && req.url === '/v1/billing/subscriptions/I-TEST123') return res.end(JSON.stringify({ id: 'I-TEST123', status: pp.status, custom_id: pp.custom }))
          if (req.url.endsWith('/cancel')) return (res.statusCode = 204, res.end())
          if (req.url === '/v1/notifications/verify-webhook-signature') return res.end(JSON.stringify({ verification_status: JSON.parse(b).transmission_sig === 'good' ? 'SUCCESS' : 'FAILURE' }))
          res.statusCode = 404; res.end('{}')
        })
      })
      await new Promise((r) => pp.server.listen(0, '127.0.0.1', r))
      cfg.paypalApiBase = `http://127.0.0.1:${pp.server.address().port}`
    })
    afterAll(() => pp.server?.close())
    const hook = (ev, sig = 'good') => request(app).post('/api/billing/paypal/webhook').set({ 'paypal-transmission-sig': sig, 'paypal-transmission-id': 't', 'paypal-transmission-time': 'x', 'paypal-auth-algo': 'a', 'paypal-cert-url': 'c' }).send(ev)

    it('lists public plans and blocks checkout until PayPal is configured', async () => {
      const plans = (await request(app).get('/api/plans')).body
      expect(plans.map((p) => p.id)).toEqual(expect.arrayContaining(['free', 'pro'])); expect(plans.find((p) => p.id === 'pro').purchasable).toBe(false)
      expect((await user.post('/api/billing/checkout').send({ planId: 'pro' })).status).toBe(503)
    })
    it('admin configures PayPal; secret is encrypted and never returned', async () => {
      expect((await admin.put('/api/admin/paypal').send({ mode: 'sandbox', clientId: 'CID', webhookId: 'WHID', secret: 'SECRET123456' })).status).toBe(200)
      const [[row]] = await pool.query("SELECT ciphertext FROM api_keys WHERE provider='paypal'")
      expect(row.ciphertext).not.toContain('SECRET'); expect(JSON.stringify((await admin.get('/api/admin/paypal')).body)).not.toContain('SECRET123456')
      expect((await admin.post('/api/admin/paypal/test').send({})).body.ok).toBe(true)
      expect((await admin.put('/api/admin/plans').send({ id: 'pro', name: 'Pro', priceCents: 1200, aiMonthlyQuota: 300, paypalPlanId: 'bad id' })).status).toBe(400)
      expect((await admin.put('/api/admin/plans').send({ id: 'pro', name: 'Pro', priceCents: 1200, aiMonthlyQuota: 300, paypalPlanId: 'P-TESTPLAN123456' })).status).toBe(200)
      expect((await request(app).get('/api/plans')).body.find((p) => p.id === 'pro').purchasable).toBe(true)
    })
    it('checkout creates a pending subscription that does not count as MRR; /return verifies with PayPal', async () => {
      await pool.query("UPDATE subscriptions SET status='canceled', canceled_at=NOW() WHERE source='manual'"); await pool.query("UPDATE users SET plan_id='free'")
      const [[u]] = await pool.query("SELECT id FROM users WHERE email='u@example.com'")
      const c = await user.post('/api/billing/checkout').send({ planId: 'pro' })
      expect(c.status).toBe(200); expect(c.body.approveUrl).toContain('paypal.test/approve')
      expect((await admin.get('/api/admin/finance')).body.kpis.mrr).toBe(0)
      expect((await user.post('/api/billing/checkout').send({ planId: 'free' })).status).toBe(400)
      pp.custom = 'u999999' // PayPal says it belongs to someone else: must be rejected
      expect((await request(app).get('/api/billing/return?subscription_id=I-TEST123')).headers.location).toBe('/?billing=mismatch')
      pp.custom = `u${u.id}`; pp.status = 'APPROVAL_PENDING'
      expect((await request(app).get('/api/billing/return?subscription_id=I-TEST123')).headers.location).toBe('/?billing=pending')
      expect((await request(app).get('/api/billing/return?subscription_id=NOPE')).headers.location).toBe('/?billing=unknown')
      pp.status = 'ACTIVE'
      expect((await request(app).get('/api/billing/return?subscription_id=I-TEST123')).headers.location).toBe('/?billing=success')
      expect((await user.get('/api/auth/me')).body.user.planId).toBe('pro')
      expect((await admin.get('/api/admin/finance')).body.kpis.mrr).toBe(12)
    })
    it('webhooks: rejects bad signatures, records payments once, handles cancel', async () => {
      const sale = E({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE1', billing_agreement_id: 'I-TEST123', amount: { total: '12.00', currency: 'USD' } } })
      expect((await hook(sale, 'forged')).status).toBe(400)
      const [[n0]] = await pool.query("SELECT COUNT(*) n FROM payments WHERE source='paypal'"); expect(Number(n0.n)).toBe(0)
      expect((await hook(sale)).body.result).toBe('applied')
      expect((await hook(sale)).body.result).toBe('duplicate') // PayPal retries: no double revenue
      const [[n1]] = await pool.query("SELECT COUNT(*) n, SUM(amount_cents) c FROM payments WHERE source='paypal'"); expect(Number(n1.n)).toBe(1); expect(Number(n1.c)).toBe(1200)
      expect((await hook(E({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'S2', billing_agreement_id: 'I-TEST123', amount: { total: '5.00', currency: 'EUR' } } }))).status).toBe(200)
      const [[n2]] = await pool.query("SELECT COUNT(*) n FROM payments WHERE source='paypal'"); expect(Number(n2.n)).toBe(1) // non-USD is not summed into USD revenue
      await hook(E({ event_type: 'BILLING.SUBSCRIPTION.SUSPENDED', resource: { id: 'I-TEST123' } }))
      const f1 = (await admin.get('/api/admin/finance')).body.kpis; expect(f1.mrr).toBe(0); expect(f1.atRiskMrr).toBe(12)
      await hook(E({ event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-TEST123' } }))
      expect((await user.get('/api/auth/me')).body.user.planId).toBe('free')
    })
    it('webhook is refused when no webhook id is configured', async () => {
      await admin.put('/api/admin/paypal').send({ webhookId: '' })
      expect((await hook(E({ event_type: 'X' }))).status).toBe(503)
      await admin.put('/api/admin/paypal').send({ webhookId: 'WHID' })
    })
    it('records PayPal fees: real fee from the event, else an estimate from the admin schedule, else flagged as missing', async () => {
      await pool.query("UPDATE subscriptions SET status='active' WHERE external_id='I-TEST123' AND status<>'active'")
      await pool.query("DELETE FROM billing_events")
      await pool.query("DELETE FROM payments WHERE source='paypal'")
      const sale = (id, extra = {}) => E({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id, billing_agreement_id: 'I-TEST123', amount: { total: '12.00', currency: 'USD' }, ...extra } })
      await hook(sale('F1'))
      let f = (await admin.get('/api/admin/finance')).body.kpis
      expect(f.paymentsWithoutFee).toBe(1); expect(f.feesThisMonth).toBe(0) // nothing invented
      expect((await admin.put('/api/admin/settings').send({ paypalFeePercent: 99 })).status).toBe(400)
      expect((await admin.put('/api/admin/settings').send({ paypalFeePercent: 5.4, paypalFeeFixedCents: 30 })).status).toBe(200)
      await hook(sale('F2')) // no fee in the event -> estimate: 5.4% of 12.00 = 65c + 30c
      await hook(sale('F3', { transaction_fee: { value: '0.50', currency: 'USD' } })) // real fee wins
      const [rows] = await pool.query("SELECT fee_cents, fee_estimated FROM payments WHERE note LIKE '%F2%' OR note LIKE '%F3%' ORDER BY id")
      expect(rows.map((r) => [r.fee_cents, r.fee_estimated])).toEqual([[95, 1], [50, 0]])
      f = (await admin.get('/api/admin/finance')).body
      expect(f.kpis.feesThisMonth).toBe(1.45); expect(f.kpis.netRevenueThisMonth).toBeCloseTo(f.kpis.revenueThisMonth - 1.45, 2)
      expect(f.months.at(-1).fees).toBe(1.45)
      expect((await admin.post('/api/admin/payments').send({ amountCents: 1000, feeCents: 59, note: 'manual' })).status).toBe(201)
      expect((await admin.post('/api/admin/payments').send({ amountCents: 1000, feeCents: -5 })).status).toBe(400)
      expect((await admin.put('/api/admin/settings').send({ paypalFeePercent: 0, paypalFeeFixedCents: 0 })).status).toBe(200)
      await pool.query("UPDATE subscriptions SET status='canceled' WHERE external_id='I-TEST123'") // leave state as the next test expects
    })
    it('automates refunds, reversals and lost disputes as negative payments (idempotent, matched to the sale)', async () => {
      await pool.query("UPDATE subscriptions SET status='active' WHERE external_id='I-TEST123'")
      await pool.query('DELETE FROM billing_events'); await pool.query("DELETE FROM payments WHERE source='paypal'")
      const [[u]] = await pool.query("SELECT id FROM users WHERE email='u@example.com'")
      const sale = (id) => E({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id, billing_agreement_id: 'I-TEST123', amount: { total: '12.00', currency: 'USD' }, transaction_fee: { value: '0.65', currency: 'USD' } } })
      await hook(sale('SR1')); await hook(sale('SR2')); await hook(sale('SR3'))
      const pays = async () => (await pool.query("SELECT amount_cents, user_id, external_id FROM payments WHERE source='paypal' ORDER BY id"))[0]
      // full refund of SR1
      const refund = E({ event_type: 'PAYMENT.SALE.REFUNDED', resource: { id: 'RF1', sale_id: 'SR1', amount: { total: '12.00', currency: 'USD' } } })
      expect((await hook(refund)).body.result).toBe('applied')
      expect((await hook(refund)).body.result).toBe('duplicate') // same event replayed
      expect((await hook(E({ event_type: 'PAYMENT.SALE.REFUNDED', resource: { id: 'RF1', sale_id: 'SR1', amount: { total: '12.00', currency: 'USD' } } }))).status).toBe(200) // new event id, same refund: unique index, no double booking
      let rows = await pays()
      expect(rows.filter((r) => r.amount_cents < 0)).toEqual([{ amount_cents: -1200, user_id: u.id, external_id: 'refund:RF1' }])
      // partial refund matched through the subscription when the sale id is unknown to us
      await hook(E({ event_type: 'PAYMENT.SALE.REFUNDED', resource: { id: 'RF2', sale_id: 'UNKNOWN', billing_agreement_id: 'I-TEST123', amount: { total: '4.00', currency: 'USD' } } }))
      // refund of a sale we never recorded and no subscription: not booked, but audited
      await hook(E({ event_type: 'PAYMENT.SALE.REFUNDED', resource: { id: 'RF3', sale_id: 'GHOST', amount: { total: '9.00', currency: 'USD' } } }))
      // chargeback
      await hook(E({ event_type: 'PAYMENT.SALE.REVERSED', resource: { id: 'RV1', sale_id: 'SR2', amount: { total: '12.00', currency: 'USD' } } }))
      // disputes: opened (audit only), lost (negative), won (nothing)
      await hook(E({ event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { dispute_id: 'PP-D-1', reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', dispute_amount: { value: '12.00', currency_code: 'USD' } } }))
      await hook(E({ event_type: 'CUSTOMER.DISPUTE.RESOLVED', resource: { dispute_id: 'PP-D-1', dispute_outcome: { outcome_code: 'RESOLVED_BUYER_FAVOUR' }, dispute_amount: { value: '12.00', currency_code: 'USD' }, disputed_transactions: [{ seller_transaction_id: 'SR3', buyer_transaction_id: 'BX' }] } }))
      await hook(E({ event_type: 'CUSTOMER.DISPUTE.RESOLVED', resource: { dispute_id: 'PP-D-2', dispute_outcome: { outcome_code: 'RESOLVED_SELLER_FAVOUR' }, dispute_amount: { value: '12.00', currency_code: 'USD' } } }))
      rows = await pays()
      expect(rows.filter((r) => r.amount_cents < 0).map((r) => [r.external_id, r.amount_cents, r.user_id === u.id]).sort()).toEqual([['dispute:PP-D-1', -1200, true], ['refund:RF1', -1200, true], ['refund:RF2', -400, true], ['reversal:RV1', -1200, true]])
      const [audit] = await pool.query("SELECT action FROM audit_log WHERE action LIKE 'paypal.%'")
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['paypal.refund_unmatched', 'paypal.dispute_opened', 'paypal.dispute_closed']))
      // finance: revenue is net of money returned, refunds are visible
      const k = (await admin.get('/api/admin/finance')).body.kpis
      expect(k.refundsThisMonth).toBeGreaterThanOrEqual(40)
      expect(k.revenueThisMonth).toBeLessThan(36 + 12 + 1) // 3 sales (36) minus 40 of refunds, plus earlier manual payments only
      // expenses list shows PayPal fees as an automatic monthly line (not stored, not double-counted)
      const ex = (await admin.get('/api/admin/expenses')).body.filter((e) => e.auto)
      const [[sum]] = await pool.query('SELECT SUM(fee_cents) f FROM payments WHERE fee_cents>0')
      expect(ex.reduce((a, e) => a + e.amountCents, 0)).toBe(Number(sum.f)); expect(ex[0].category).toBe('paypal_fees')
      expect((await pool.query("SELECT COUNT(*) n FROM expenses WHERE category='paypal_fees'"))[0][0].n).toBe(0)
      await pool.query("UPDATE subscriptions SET status='canceled' WHERE external_id='I-TEST123'")
    })
    it('lets a customer cancel their PayPal subscription', async () => {
      pp.status = 'ACTIVE'
      const [[u]] = await pool.query("SELECT id FROM users WHERE email='u@example.com'")
      await pool.query("INSERT INTO subscriptions (user_id,plan_id,status,amount_cents,interval_unit,started_at,source,external_id) VALUES (?,?,?,?,?,?,?,?)", [u.id, 'pro', 'active', 1200, 'month', new Date(), 'paypal', 'I-TEST456'])
      await pool.query("UPDATE users SET plan_id='pro' WHERE id=?", [u.id])
      expect((await user.post('/api/billing/cancel').send({})).status).toBe(200)
      expect((await user.get('/api/auth/me')).body.user.planId).toBe('free')
      expect((await user.post('/api/billing/cancel').send({})).status).toBe(404)
    })
    it('closed beta: invite-only sign-up with limited, revocable codes; closed mode blocks all', async () => {
      expect((await admin.put('/api/admin/settings').send({ signupMode: 'weird' })).status).toBe(400)
      await admin.put('/api/admin/settings').send({ signupMode: 'invite' })
      const reg = (email, code) => request(app).post('/api/auth/register').send({ email, password: 'long-enough-pw', acceptTerms: true, inviteCode: code })
      expect((await reg('b1@example.com')).body.error).toBe('invite_required')
      expect((await reg('b1@example.com', 'NOPE1234')).body.error).toBe('invite_invalid')
      const code = (await admin.post('/api/admin/invites').send({ maxUses: 1, planId: 'pro', note: 'beta tester', expiresDays: 7 })).body.code
      expect(code).toMatch(/^[A-Z0-9]{4,40}$/)
      const ok = await reg('b1@example.com', code.toLowerCase()); expect(ok.status).toBe(201); expect(ok.body.user.planId).toBe('pro')
      expect((await reg('b2@example.com', code)).body.error).toBe('invite_invalid') // single use
      const c2 = (await admin.post('/api/admin/invites').send({ maxUses: 5 })).body.code
      await admin.delete(`/api/admin/invites/${c2}`)
      expect((await reg('b3@example.com', c2)).body.error).toBe('invite_invalid') // revoked
      const c3 = (await admin.post('/api/admin/invites').send({ maxUses: 2 })).body.code
      await pool.query("UPDATE invites SET expires_at='2000-01-01' WHERE code=?", [c3])
      expect((await reg('b4@example.com', c3)).body.error).toBe('invite_invalid') // expired
      await admin.put('/api/admin/settings').send({ signupMode: 'closed' })
      expect((await reg('b5@example.com', 'ANY')).status).toBe(403)
      await admin.put('/api/admin/settings').send({ signupMode: 'open' })
      expect((await request(app).get('/api/config')).body.signupMode).toBe('open')
    })
    it('rejects body-less mutating calls that lack the custom header (CSRF) and duplicate external ids', async () => {
      const plain = request.agent(app)
      await plain.post('/api/auth/login').send({ email: 'boss@example.com', password: 'admin-password-123' })
      expect((await plain.delete('/api/admin/payments/1')).status).toBe(415)
      expect((await plain.delete('/api/admin/payments/1').set('X-Requested-With', 'mathema')).status).toBe(200)
      await expect(pool.query("INSERT INTO subscriptions (user_id,plan_id,status,amount_cents,interval_unit,started_at,source,external_id) VALUES (1,'pro','active',1,'month',NOW(),'paypal','I-TEST456')")).rejects.toThrow()
    })
    it('deletes an account on request: data removed, accounting rows detached, wrong password refused', async () => {
      const me = request.agent(app).set('X-Requested-With', 'mathema')
      await me.post('/api/auth/register').send({ email: 'gone@example.com', password: 'long-enough-pw', acceptTerms: true })
      await me.put('/api/data').send({ data: { schema: 1, models: [{ id: 'z' }], conversations: [], sources: [], relations: [], experiments: [] }, version: 0 })
      await me.post('/api/feedback').send({ message: 'bye bye' })
      const [[u]] = await pool.query("SELECT id FROM users WHERE email='gone@example.com'")
      await pool.query("INSERT INTO payments (user_id,amount_cents,paid_at,source) VALUES (?,500,NOW(),'manual')", [u.id])
      expect((await me.post('/api/account/delete').send({ password: 'nope' })).status).toBe(401)
      expect((await me.post('/api/account/delete').send({ password: 'long-enough-pw' })).status).toBe(200)
      const q = async (sql) => (await pool.query(sql, [u.id]))[0]
      expect(await q('SELECT 1 FROM users WHERE id=?')).toHaveLength(0)
      expect(await q('SELECT 1 FROM user_data WHERE user_id=?')).toHaveLength(0)
      expect(await q('SELECT 1 FROM feedback WHERE user_id=?')).toHaveLength(0)
      expect(await q('SELECT 1 FROM payments WHERE user_id=?')).toHaveLength(0)
      const [[pay]] = await pool.query('SELECT COUNT(*) n FROM payments WHERE user_id IS NULL AND amount_cents=500'); expect(Number(pay.n)).toBe(1)
      expect((await me.get('/api/auth/me')).body.user).toBeNull()
    })
    it('collects feedback and shows it to the admin only', async () => {
      expect((await request(app).post('/api/feedback').send({ message: 'hi there' })).status).toBe(401)
      expect((await user.post('/api/feedback').send({ message: 'x' })).status).toBe(400)
      expect((await user.post('/api/feedback').send({ kind: 'bug', message: 'The slider jumps', page: 'workspace' })).status).toBe(201)
      expect((await admin.get('/api/admin/feedback')).body[0].message).toBe('The slider jumps')
      expect((await user.get('/api/admin/feedback')).status).toBe(403)
    })
    it('changes password (old one stops working) and stores legal contact settings', async () => {
      expect((await user.post('/api/auth/password').send({ current: 'wrong', next: 'another-long-pass' })).status).toBe(401)
      expect((await user.post('/api/auth/password').send({ current: 'long-enough-pw', next: 'short' })).status).toBe(400)
      expect((await user.post('/api/auth/password').send({ current: 'long-enough-pw', next: 'another-long-pass' })).status).toBe(200)
      expect((await user.get('/api/auth/me')).body.user.email).toBe('u@example.com') // still signed in here
      expect((await request(app).post('/api/auth/login').send({ email: 'u@example.com', password: 'long-enough-pw' })).status).toBe(401)
      expect((await request(app).post('/api/auth/login').send({ email: 'u@example.com', password: 'another-long-pass' })).status).toBe(200)
      await admin.put('/api/admin/settings').send({ legalEntity: 'Acme S.A.', legalEmail: 'legal@acme.example' })
      expect((await request(app).get('/api/config')).body.legal).toEqual({ entity: 'Acme S.A.', email: 'legal@acme.example' })
    })

    it('ENFORCES plan features on the server: research model, idea length, cloud sync and model count', async () => {
      const setFeat = (plan, f) => admin.put('/api/admin/plans').send({ id: plan, name: plan, priceCents: plan === 'pro' ? 1200 : 0, aiMonthlyQuota: null, features: f })
      await pool.query("UPDATE users SET plan_id='free' WHERE email='u@example.com'"); await pool.query("UPDATE plans SET ai_monthly_quota=NULL WHERE id='free'")
      // the seeded Free plan is restrictive by default; Pro is open (and this is what the public plans endpoint shows)
      const pub = (await request(app).get('/api/plans')).body
      expect(pub.find((p) => p.id === 'free').features).toEqual({ researchPremium: false, cloudSync: true, maxModels: 50, aiMaxChars: 4000 })
      expect(pub.find((p) => p.id === 'pro').features).toMatchObject({ researchPremium: true, maxModels: null })
      expect((await setFeat('free', { maxModels: 0 })).status).toBe(400)
      expect((await setFeat('free', { aiMaxChars: 20000 })).status).toBe(400)
      // 1) research mode on a plan without the premium model uses the default model, and says so
      const r1 = await user.post('/api/analyze').send({ text: 'Explore the idea of rain and yield', mode: 'research' })
      expect(r1.status).toBe(200); expect(r1.body.meta.downgraded).toBe(true); expect(calls.at(-1).model).toBe('claude-sonnet-5-5')
      await setFeat('free', { researchPremium: true, cloudSync: true, maxModels: 50, aiMaxChars: 4000 })
      const r2 = await user.post('/api/analyze').send({ text: 'Explore the idea of rain and yield', mode: 'research' })
      expect(r2.body.meta.downgraded).toBe(false); expect(calls.at(-1).model).toBe('my-openai-model') // the configured research model
      // admins are never restricted
      expect((await admin.post('/api/analyze').send({ text: 'x'.repeat(9000) })).status).toBe(200)
      // 2) idea length limit comes from the plan
      await setFeat('free', { researchPremium: false, cloudSync: true, maxModels: 50, aiMaxChars: 300 })
      const long = await user.post('/api/analyze').send({ text: 'y'.repeat(301) })
      expect(long.status).toBe(413); expect(long.body.max).toBe(300)
      expect((await user.post('/api/analyze').send({ text: 'y'.repeat(300) })).status).toBe(200)
      expect((await user.get('/api/usage')).body.features.aiMaxChars).toBe(300)
      // 3) model count limit counts only the user's own models, never the demo ones
      await setFeat('free', { researchPremium: false, cloudSync: true, maxModels: 2, aiMaxChars: 300 })
      const doc = (own, demo) => ({ schema: 1, models: [...Array.from({ length: own }, (_, i) => ({ id: `m${i}` })), ...Array.from({ length: demo }, (_, i) => ({ id: `d${i}`, isDemo: true }))], conversations: [], sources: [], relations: [], experiments: [] })
      const v0 = (await user.get('/api/data')).body.version
      const over = await user.put('/api/data').send({ data: doc(3, 5), version: v0 })
      expect(over.status).toBe(403); expect(over.body).toMatchObject({ error: 'model_limit', limit: 2, count: 3 })
      expect((await user.put('/api/data').send({ data: doc(2, 5), version: v0 })).status).toBe(200)
      // 4) cloud sync switched off: writing is refused (feature_not_in_plan) but the user can still read their stored copy
      await setFeat('free', { researchPremium: false, cloudSync: false, maxModels: 2, aiMaxChars: 300 })
      const vOff = (await user.get('/api/data')).body.version
      const off = await user.put('/api/data').send({ data: doc(1, 0), version: vOff })
      expect(off.status).toBe(403); expect(off.body.feature).toBe('cloudSync')
      expect((await user.get('/api/data')).status).toBe(200)
      const vAdm = (await admin.get('/api/data')).body.version
      expect((await admin.put('/api/data').send({ data: doc(5, 0), version: vAdm })).status).toBe(200) // admin exempt
      await setFeat('free', { researchPremium: false, cloudSync: true, maxModels: 50, aiMaxChars: 4000 }) // restore
    })
    it('failed payment: keeps the paid plan during the grace period, then drops to Free; paying again restores it', async () => {
      await admin.put('/api/admin/paypal').send({ webhookId: 'WHID' })
      await pool.query('DELETE FROM billing_events')
      const [[u]] = await pool.query("SELECT id FROM users WHERE email='u@example.com'")
      await pool.query("INSERT INTO subscriptions (user_id,plan_id,status,amount_cents,interval_unit,started_at,source,external_id) VALUES (?,?,?,?,?,?,?,?)", [u.id, 'pro', 'active', 1200, 'month', new Date(), 'paypal', 'I-GRACE1'])
      await pool.query("UPDATE users SET plan_id='pro' WHERE id=?", [u.id])
      expect((await admin.put('/api/admin/settings').send({ pastDueGraceDays: 99 })).status).toBe(400)
      expect((await admin.put('/api/admin/settings').send({ pastDueGraceDays: 7 })).status).toBe(200)
      await hook(E({ event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', resource: { id: 'I-GRACE1' } }))
      const plan = async () => (await pool.query('SELECT plan_id FROM users WHERE id=?', [u.id]))[0][0].plan_id
      expect(await plan()).toBe('pro') // still Pro: grace period
      expect((await user.get('/api/billing/me')).body.subscription.status).toBe('past_due')
      const day = 864e5
      expect(await enforceGrace(pool, new Date(Date.now() + 3 * day))).toBe(0); expect(await plan()).toBe('pro')
      await hook(E({ event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', resource: { id: 'I-GRACE1' } })) // PayPal retries: must NOT reset the clock
      const [[s1]] = await pool.query("SELECT past_due_since FROM subscriptions WHERE external_id='I-GRACE1'")
      expect(Date.now() - new Date(s1.past_due_since).getTime()).toBeLessThan(60_000)
      expect(await enforceGrace(pool, new Date(Date.now() + 8 * day))).toBe(1); expect(await plan()).toBe('free')
      await hook(E({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'GR-PAID', billing_agreement_id: 'I-GRACE1', amount: { total: '12.00', currency: 'USD' } } }))
      expect(await plan()).toBe('pro') // paid again: plan restored
      const [[s2]] = await pool.query("SELECT status, past_due_since FROM subscriptions WHERE external_id='I-GRACE1'")
      expect(s2.status).toBe('active'); expect(s2.past_due_since).toBeNull()
      await pool.query("UPDATE subscriptions SET status='canceled' WHERE external_id='I-GRACE1'"); await pool.query("UPDATE users SET plan_id='free' WHERE id=?", [u.id])
    })
  })
})
