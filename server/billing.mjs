// PayPal Subscriptions. The browser never talks to PayPal's API: the server creates the subscription,
// sends the customer to PayPal's approval page, and then trusts only (a) PayPal's own API (re-fetching the
// subscription) and (b) webhooks whose signature PayPal itself verifies. Query strings are never trusted.
import { Router } from 'express'
import { requireUser } from './auth.mjs'
import { audit, getSetting } from './db.mjs'
import { getApiKey } from './keys.mjs'

export class PayPalError extends Error {
  constructor(msg, status = 502) { super(msg); this.status = status }
}

export async function paypalConfig(pool, cfg) {
  const mode = (await getSetting(pool, 'paypal_mode')) === 'live' ? 'live' : 'sandbox'
  const clientId = String((await getSetting(pool, 'paypal_client_id')) ?? '')
  const secret = await getApiKey(pool, cfg, 'paypal')
  const base = cfg.paypalApiBase || (mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')
  return { mode, clientId, secret, base, webhookId: String((await getSetting(pool, 'paypal_webhook_id')) ?? ''), configured: !!(clientId && secret) }
}

const tokenCache = new Map()
export async function ppToken(c) {
  const key = `${c.base}|${c.clientId}`
  const hit = tokenCache.get(key)
  if (hit && hit.exp > Date.now() + 30_000) return hit.token
  let r
  try {
    r = await fetch(`${c.base}/v1/oauth2/token`, { method: 'POST', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })
  } catch { throw new PayPalError('Could not reach PayPal') }
  if (!r.ok) throw new PayPalError(r.status === 401 ? 'PayPal rejected the client id / secret (check mode sandbox vs live)' : `PayPal auth error ${r.status}`)
  const j = await r.json()
  tokenCache.set(key, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 300) * 1000 })
  return j.access_token
}
export async function pp(c, method, path, body) {
  const token = await ppToken(c)
  let r
  try {
    r = await fetch(`${c.base}${path}`, { method, signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  } catch { throw new PayPalError('Could not reach PayPal') }
  const text = await r.text()
  const data = text ? (() => { try { return JSON.parse(text) } catch { return null } })() : null
  if (!r.ok) throw new PayPalError(`PayPal error ${r.status}${data?.name ? ` (${data.name})` : ''}`, r.status === 404 ? 404 : 502)
  return data
}

const baseUrl = (cfg, req) => cfg.publicUrl || `${req.protocol}://${req.get('host')}`
const cents = (v) => Math.round(Number(v) * 100)

/** Make `externalId` the user's one active subscription and move them to the plan. Idempotent. */
export async function activateSubscription(pool, externalId) {
  const [[sub]] = await pool.query('SELECT * FROM subscriptions WHERE external_id=?', [externalId])
  if (!sub) return false
  if (sub.status === 'active') return true
  if (sub.status === 'canceled') return false
  await pool.query("UPDATE subscriptions SET status='canceled', canceled_at=? WHERE user_id=? AND status IN ('active','trialing','past_due') AND id<>?", [new Date(), sub.user_id, sub.id])
  await pool.query("UPDATE subscriptions SET status='active', started_at=? WHERE id=?", [new Date(), sub.id])
  await pool.query('UPDATE users SET plan_id=? WHERE id=?', [sub.plan_id, sub.user_id])
  return true
}
async function endSubscription(pool, externalId, status) {
  const [[sub]] = await pool.query('SELECT * FROM subscriptions WHERE external_id=?', [externalId])
  if (!sub) return
  await pool.query('UPDATE subscriptions SET status=?, canceled_at=? WHERE id=?', [status, status === 'canceled' ? new Date() : null, sub.id])
  if (status === 'canceled') await pool.query("UPDATE users SET plan_id='free' WHERE id=? AND plan_id=?", [sub.user_id, sub.plan_id])
}

/** Applies a (signature-verified) PayPal webhook event. Safe to replay: events are de-duplicated by id. */
export async function applyPaypalEvent(pool, ev) {
  const [dup] = await pool.query('SELECT 1 FROM billing_events WHERE event_id=?', [String(ev.id)])
  if (dup.length) return 'duplicate'
  const r = ev.resource ?? {}
  switch (ev.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED': await activateSubscription(pool, r.id); break
    case 'BILLING.SUBSCRIPTION.CANCELLED': case 'BILLING.SUBSCRIPTION.EXPIRED': await endSubscription(pool, r.id, 'canceled'); break
    case 'BILLING.SUBSCRIPTION.SUSPENDED': case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': await endSubscription(pool, r.id, 'past_due'); break
    case 'PAYMENT.SALE.COMPLETED': {
      const subId = r.billing_agreement_id
      const [[sub]] = subId ? await pool.query('SELECT * FROM subscriptions WHERE external_id=?', [subId]) : [[]]
      if (sub && r.amount?.currency === 'USD' && Number(r.amount.total) > 0) {
        const gross = cents(r.amount.total)
        // Real fee when PayPal reports it; otherwise an estimate from the admin's own fee schedule (flagged); otherwise 0 (flagged as missing in Finance).
        let fee = 0, estimated = 0
        if (r.transaction_fee && r.transaction_fee.currency === 'USD' && Number(r.transaction_fee.value) >= 0) fee = cents(r.transaction_fee.value)
        else {
          const pct = Number(await getSetting(pool, 'paypal_fee_percent')) || 0, fixed = Number(await getSetting(pool, 'paypal_fee_fixed_cents')) || 0
          if (pct > 0 || fixed > 0) { fee = Math.min(gross, Math.round((gross * pct) / 100) + fixed); estimated = 1 }
        }
        await pool.query('INSERT INTO payments (user_id,amount_cents,currency,paid_at,source,note,fee_cents,fee_estimated) VALUES (?,?,?,?,?,?,?,?)', [sub.user_id, gross, 'USD', r.create_time ? new Date(r.create_time) : new Date(), 'paypal', `PayPal sale ${r.id ?? ''} (gross)`.slice(0, 255), fee, estimated])
        if (sub.status === 'past_due') await activateSubscription(pool, subId)
      }
      break
    }
    default: break
  }
  await pool.query('INSERT INTO billing_events (event_id,type,created_at) VALUES (?,?,?)', [String(ev.id), String(ev.event_type).slice(0, 80), new Date()])
  return 'applied'
}

export function billingRoutes(pool, cfg) {
  const r = Router()

  r.get('/me', requireUser, async (req, res) => {
    const [[sub]] = await pool.query("SELECT s.id, s.plan_id planId, s.status, s.amount_cents amountCents, s.interval_unit intervalUnit, s.started_at startedAt, s.source FROM subscriptions s WHERE s.user_id=? AND s.status IN ('active','past_due','trialing') ORDER BY s.id DESC LIMIT 1", [req.user.id])
    res.json({ subscription: sub ?? null })
  })

  r.post('/checkout', requireUser, async (req, res) => {
    const c = await paypalConfig(pool, cfg)
    if (!c.configured) return res.status(503).json({ error: 'billing_not_configured' })
    const [[plan]] = await pool.query('SELECT * FROM plans WHERE id=? AND active=1', [String(req.body?.planId ?? '')])
    if (!plan || !plan.paypal_plan_id || plan.price_cents <= 0) return res.status(400).json({ error: 'plan_not_purchasable' })
    const [[existing]] = await pool.query("SELECT id FROM subscriptions WHERE user_id=? AND plan_id=? AND status='active'", [req.user.id, plan.id])
    if (existing) return res.status(409).json({ error: 'already_subscribed' })
    try {
      const origin = baseUrl(cfg, req)
      const sub = await pp(c, 'POST', '/v1/billing/subscriptions', {
        plan_id: plan.paypal_plan_id, custom_id: `u${req.user.id}`,
        subscriber: { email_address: req.user.email.includes('@') ? req.user.email : undefined },
        application_context: { brand_name: 'MATHEMA', user_action: 'SUBSCRIBE_NOW', shipping_preference: 'NO_SHIPPING', return_url: `${origin}/api/billing/return`, cancel_url: `${origin}/?billing=cancel` },
      })
      const approve = sub.links?.find((l) => l.rel === 'approve')?.href
      if (!sub.id || !approve) throw new PayPalError('PayPal returned no approval link')
      await pool.query("INSERT INTO subscriptions (user_id,plan_id,status,amount_cents,interval_unit,started_at,source,note,external_id) VALUES (?,?,?,?,?,?,?,?,?)", [req.user.id, plan.id, 'pending', plan.price_cents, plan.interval_unit, new Date(), 'paypal', 'awaiting approval', sub.id])
      res.json({ approveUrl: approve })
    } catch (e) {
      console.error('[mathema] checkout error:', e.message)
      res.status(e instanceof PayPalError ? e.status : 502).json({ error: 'checkout_failed', detail: e.message })
    }
  })

  // PayPal sends the customer back here after approval. Nothing in the query string is trusted.
  r.get('/return', async (req, res) => {
    const id = String(req.query.subscription_id ?? '')
    try {
      const [[row]] = await pool.query('SELECT * FROM subscriptions WHERE external_id=?', [id])
      if (!row) return res.redirect('/?billing=unknown')
      const c = await paypalConfig(pool, cfg)
      const remote = await pp(c, 'GET', `/v1/billing/subscriptions/${encodeURIComponent(id)}`)
      if (remote.custom_id !== `u${row.user_id}`) return res.redirect('/?billing=mismatch')
      if (remote.status === 'ACTIVE') { await activateSubscription(pool, id); return res.redirect('/?billing=success') }
      res.redirect('/?billing=pending') // the ACTIVATED webhook will finish the job
    } catch (e) {
      console.error('[mathema] billing return error:', e.message)
      res.redirect('/?billing=pending')
    }
  })

  r.post('/cancel', requireUser, async (req, res) => {
    const [[sub]] = await pool.query("SELECT * FROM subscriptions WHERE user_id=? AND status IN ('active','past_due') AND source='paypal' ORDER BY id DESC LIMIT 1", [req.user.id])
    if (!sub) return res.status(404).json({ error: 'no_subscription' })
    try {
      const c = await paypalConfig(pool, cfg)
      await pp(c, 'POST', `/v1/billing/subscriptions/${encodeURIComponent(sub.external_id)}/cancel`, { reason: 'Canceled by the customer in MATHEMA' })
      await endSubscription(pool, sub.external_id, 'canceled')
      await audit(pool, req.user.id, 'subscription.self_cancel', String(sub.id))
      res.json({ ok: true })
    } catch (e) { res.status(e instanceof PayPalError ? e.status : 502).json({ error: 'cancel_failed', detail: e.message }) }
  })

  r.post('/paypal/webhook', async (req, res) => {
    const c = await paypalConfig(pool, cfg)
    if (!c.configured || !c.webhookId) { console.error('[mathema] webhook received but PayPal webhook id is not configured'); return res.status(503).json({ error: 'not_configured' }) }
    const h = (k) => String(req.headers[k] ?? '')
    try {
      const v = await pp(c, 'POST', '/v1/notifications/verify-webhook-signature', {
        auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
        transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'), webhook_id: c.webhookId, webhook_event: req.body,
      })
      if (v?.verification_status !== 'SUCCESS') return res.status(400).json({ error: 'bad_signature' })
    } catch (e) { return res.status(502).json({ error: 'verify_failed', detail: e.message }) }
    if (!req.body?.id || !req.body?.event_type) return res.status(400).json({ error: 'bad_event' })
    try { res.json({ result: await applyPaypalEvent(pool, req.body) }) }
    catch (e) { console.error('[mathema] webhook apply error:', e.message); res.status(500).json({ error: 'apply_failed' }) } // PayPal retries on non-2xx
  })
  return r
}
