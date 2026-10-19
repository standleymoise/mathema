import { Router } from 'express'
import { requireUser } from './auth.mjs'
import { audit } from './db.mjs'
import { verifyPassword } from './crypto.mjs'
import { paypalConfig, pp } from './billing.mjs'

/** Self-service account deletion (privacy right). Accounting rows are kept but detached from the person. */
export function accountRoutes(pool, cfg) {
  const r = Router()
  r.post('/delete', requireUser, async (req, res) => {
    if (!(await verifyPassword(String(req.body?.password ?? ''), req.user.pass_hash))) return res.status(401).json({ error: 'invalid_credentials' })
    if (req.user.role === 'admin') {
      const [[c]] = await pool.query("SELECT COUNT(*) n FROM users WHERE role='admin' AND disabled=0")
      if (Number(c.n) <= 1) return res.status(400).json({ error: 'last_admin', detail: 'Promote another admin before deleting this account.' })
    }
    const [subs] = await pool.query("SELECT external_id FROM subscriptions WHERE user_id=? AND status IN ('active','past_due') AND source='paypal'", [req.user.id])
    let cancelFailed = false
    if (subs.length) {
      try { const c = await paypalConfig(pool, cfg); for (const s of subs) await pp(c, 'POST', `/v1/billing/subscriptions/${encodeURIComponent(s.external_id)}/cancel`, { reason: 'Account deleted by the customer' }) }
      catch { cancelFailed = true }
    }
    if (cancelFailed) return res.status(502).json({ error: 'cancel_failed', detail: 'Could not cancel your PayPal subscription; the account was NOT deleted. Cancel it from your PayPal account (Settings → Payments → Manage automatic payments) and try again.' })
    const id = req.user.id
    await pool.query("UPDATE subscriptions SET status='canceled', canceled_at=? WHERE user_id=? AND status<>'canceled'", [new Date(), id])
    await pool.query('UPDATE usage_log SET user_id=NULL WHERE user_id=?', [id])
    await pool.query('UPDATE payments SET user_id=NULL WHERE user_id=?', [id])
    for (const t of ['sessions', 'user_data', 'feedback']) await pool.query(`DELETE FROM ${t} WHERE user_id=?`, [id])
    await pool.query('DELETE FROM users WHERE id=?', [id])
    await audit(pool, null, 'account.deleted', `user ${id}`)
    res.setHeader('Set-Cookie', 'mathema_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
    res.json({ ok: true })
  })
  return r
}
