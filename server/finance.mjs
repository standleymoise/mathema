// Finance maths are pure functions of plain rows so they can be unit-tested without a database.
const r2 = (n) => Math.round(n * 100) / 100
const r4 = (n) => Math.round(n * 1e4) / 1e4
const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
const monthlyCents = (s) => (s.interval_unit === 'year' ? s.amount_cents / 12 : s.amount_cents)
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 1) - 1) }

export function monthRange(now, n) {
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))))
  return out
}

export function computeFinance({ now = new Date(), months = 12, subs, plans, payments, expenses, usage }) {
  const range = monthRange(now, months)
  const cur = range[range.length - 1]
  const asDate = (v) => (v instanceof Date ? v : new Date(v))

  const active = subs.filter((s) => s.status === 'active')
  const mrrCents = active.reduce((a, s) => a + monthlyCents(s), 0)
  const atRiskCents = subs.filter((s) => s.status === 'past_due').reduce((a, s) => a + monthlyCents(s), 0)
  const day30 = new Date(now.getTime() - 30 * 864e5)
  const churned30 = subs.filter((s) => s.status === 'canceled' && s.canceled_at && asDate(s.canceled_at) >= day30).length
  const startBase = active.length + churned30
  const mrrHistory = range.map((m) => {
    const end = monthEnd(m)
    const live = subs.filter((s) => s.status !== 'trialing' && asDate(s.started_at) <= end && (!s.canceled_at || asDate(s.canceled_at) > end))
    return { month: m, mrr: r2(live.reduce((a, s) => a + monthlyCents(s), 0) / 100) }
  })

  const byMonth = Object.fromEntries(range.map((m) => [m, { month: m, revenue: 0, aiCost: 0, expenses: 0, analyses: 0, failed: 0 }]))
  for (const p of payments) { const m = ym(asDate(p.paid_at)); if (byMonth[m]) byMonth[m].revenue += p.amount_cents / 100 }
  for (const e of expenses) for (const m of range) if (e.month === m || (e.recurring && e.month <= m)) byMonth[m].expenses += e.amount_cents / 100
  const agg = (key) => {
    const map = new Map()
    for (const u of usage) {
      if (u.month !== cur && key !== 'all') continue
      const k = key === 'all' ? 'all' : u[key]
      const e = map.get(k) ?? { key: k, calls: 0, failed: 0, cost: 0, inputTokens: 0, outputTokens: 0, unpriced: 0 }
      e.calls += u.calls; e.failed += u.failed; e.cost += u.cost; e.inputTokens += u.input; e.outputTokens += u.output; e.unpriced += u.unpriced
      map.set(k, e)
    }
    return [...map.values()].map((e) => ({ ...e, cost: r4(e.cost), avgCost: e.calls - e.failed > 0 ? r4(e.cost / (e.calls - e.failed)) : 0 })).sort((a, b) => b.cost - a.cost)
  }
  for (const u of usage) { const b = byMonth[u.month]; if (b) { b.aiCost += u.cost; b.analyses += u.calls - u.failed; b.failed += u.failed } }

  const topUsers = new Map()
  for (const u of usage) if (u.month === cur) { const e = topUsers.get(u.user_id) ?? { userId: u.user_id, email: u.email ?? '(deleted)', calls: 0, cost: 0 }; e.calls += u.calls; e.cost += u.cost; topUsers.set(u.user_id, e) }

  const monthsOut = range.map((m) => { const b = byMonth[m]; return { month: m, revenue: r2(b.revenue), aiCost: r4(b.aiCost), expenses: r2(b.expenses), profit: r2(b.revenue - b.aiCost - b.expenses), analyses: b.analyses, failed: b.failed } })
  const thisMonth = byMonth[cur]
  const mrr = r2(mrrCents / 100)
  const monthlyCosts = thisMonth.aiCost + thisMonth.expenses
  const byPlan = plans.map((p) => {
    const mine = active.filter((s) => s.plan_id === p.id)
    return { plan: p.name, id: p.id, subscribers: mine.length, mrr: r2(mine.reduce((a, s) => a + monthlyCents(s), 0) / 100) }
  })
  return {
    month: cur,
    kpis: {
      mrr, arr: r2(mrr * 12), atRiskMrr: r2(atRiskCents / 100), activeSubscribers: active.length,
      arpu: active.length ? r2(mrr / active.length) : 0,
      churn30d: churned30, churnRate30d: startBase ? r4(churned30 / startBase) : 0,
      aiCostThisMonth: r4(thisMonth.aiCost), expensesThisMonth: r2(thisMonth.expenses),
      revenueThisMonth: r2(thisMonth.revenue),
      // MRR is a run-rate; costs are this month so far: label it as an estimate in the UI.
      estimatedMonthlyMargin: r2(mrr - monthlyCosts),
      estimatedMarginPct: mrr > 0 ? r4((mrr - monthlyCosts) / mrr) : null,
      costPerActiveSubscriber: active.length ? r4(thisMonth.aiCost / active.length) : null,
      avgCostPerAnalysis: thisMonth.analyses ? r4(thisMonth.aiCost / thisMonth.analyses) : null,
    },
    months: monthsOut, mrrHistory, byPlan,
    costByApp: agg('app'), costByProvider: agg('provider'), costByModel: agg('model'),
    topUsers: [...topUsers.values()].map((u) => ({ ...u, cost: r4(u.cost) })).sort((a, b) => b.cost - a.cost).slice(0, 10),
    unpricedCalls: usage.filter((u) => u.month === cur).reduce((a, u) => a + u.unpriced, 0),
  }
}

export async function loadFinance(pool, months = 12) {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
  const [subs] = await pool.query('SELECT status,amount_cents,interval_unit,started_at,canceled_at,plan_id FROM subscriptions')
  const [plans] = await pool.query('SELECT id,name FROM plans')
  const [payments] = await pool.query('SELECT amount_cents,paid_at FROM payments WHERE paid_at>=?', [from])
  const [expenses] = await pool.query('SELECT amount_cents,month,recurring FROM expenses')
  const [usage] = await pool.query(
    `SELECT DATE_FORMAT(l.created_at,'%Y-%m') month, l.app, l.provider, l.model, l.user_id, u.email,
            COUNT(*) calls, SUM(1-l.ok) failed, SUM(l.cost_usd) cost, SUM(l.input_tokens+l.cache_read_tokens+l.cache_write_tokens) input,
            SUM(l.output_tokens) output, SUM(l.price_missing) unpriced
       FROM usage_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.created_at>=?
      GROUP BY month, l.app, l.provider, l.model, l.user_id, u.email`, [from])
  const num = (v) => Number(v ?? 0)
  return computeFinance({ now, months, subs, plans, payments, expenses,
    usage: usage.map((u) => ({ ...u, calls: num(u.calls), failed: num(u.failed), cost: num(u.cost), input: num(u.input), output: num(u.output), unpriced: num(u.unpriced) })) })
}
