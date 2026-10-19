import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createPool, migrate } from './db.mjs'
import { createApp } from './app.mjs'
import { decrypt, encrypt, hashPassword, verifyPassword } from './crypto.mjs'
import { computeFinance, monthRange } from './finance.mjs'
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
    payments: [{ amount_cents: 1200, paid_at: new Date('2026-10-02') }, { amount_cents: 12000, paid_at: new Date('2026-09-10') }],
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
    expect(oct.revenue).toBe(12)
    expect(f.kpis.estimatedMonthlyMargin).toBeCloseTo(22 - 0.12 - 15, 2)
  })
})

// ---- integration against a real MySQL/MariaDB (skipped when unavailable) ----
const dbCfg = { host: process.env.TEST_DB_HOST || '127.0.0.1', port: 3306, user: process.env.TEST_DB_USER || 'mathema', password: process.env.TEST_DB_PASSWORD || 'testpass', database: process.env.TEST_DB_NAME || 'mathema_test' }
let pool, up = false
try { pool = createPool(dbCfg); await pool.query('SELECT 1'); up = true } catch { /* no db */ }

describe.skipIf(!up)('HTTP API on MySQL', () => {
  const cfg = { prod: false, appSecret: 'x'.repeat(40), adminEmail: 'boss@example.com', adminPassword: 'admin-password-123', distDir: '/nonexistent', trustProxy: false }
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
    admin = request.agent(app); user = request.agent(app)
  })
  afterAll(async () => { await pool?.end() })

  it('bootstraps the admin from env and logs in', async () => {
    expect((await admin.post('/api/auth/login').send({ email: 'boss@example.com', password: 'nope' })).status).toBe(401)
    const r = await admin.post('/api/auth/login').send({ email: 'boss@example.com', password: 'admin-password-123' })
    expect(r.status).toBe(200); expect(r.body.user.role).toBe('admin')
  })
  it('registers users with validation, sets an HttpOnly cookie, and blocks cross-origin writes', async () => {
    expect((await user.post('/api/auth/register').send({ email: 'bad', password: 'long-enough-pw' })).status).toBe(400)
    expect((await user.post('/api/auth/register').send({ email: 'u@example.com', password: 'short' })).status).toBe(400)
    const r = await user.post('/api/auth/register').send({ email: 'u@example.com', password: 'long-enough-pw', name: 'U' })
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
})
