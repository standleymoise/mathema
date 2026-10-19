import { useCallback, useEffect, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, KeyRound, Trash2 } from 'lucide-react'
import { api } from '../../services/api'
import { Btn, IconBtn, Label, cx } from '../common'
import { PageShell } from '../models/Lists'
import { CopyBtn } from '../viz/shared'
import { toast, useStore } from '../../store/store'
import { tr } from '../../core/text'

// ---- helpers --------------------------------------------------------------------------------
const usd = (n: number, d = 2) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`)
const input = 'h-9 rounded-lg border border-line bg-bg px-2.5 text-sm outline-none focus:border-accent'
const card = 'rounded-xl border border-line bg-surface p-4'

function useAdmin<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await api.get<T>(`admin/${path}`)
    if (r.ok) { setData(r.data); setError(null) } else setError(r.status === 403 || r.status === 401 ? 'Admin access required' : 'Could not load')
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [load, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: load }
}
async function act(p: Promise<{ ok: boolean; data: any }>, okMsg: string, then?: () => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await p
  if (r.ok) { toast(okMsg); then?.() } else toast(r.data?.detail ?? r.data?.error ?? 'Request failed', 'bad')
  return r.ok
}
const Kpi = ({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) => (
  <div className={card}><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{label}</div><div className={cx('serif mt-1 text-3xl', warn && 'text-warn')}>{value}</div>{sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}</div>
)
const tip = { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12 }

// ---- Finance --------------------------------------------------------------------------------
interface Fin {
  month: string
  kpis: { mrr: number; arr: number; atRiskMrr: number; activeSubscribers: number; arpu: number; churn30d: number; churnRate30d: number; aiCostThisMonth: number; expensesThisMonth: number; revenueThisMonth: number; estimatedMonthlyMargin: number; estimatedMarginPct: number | null; costPerActiveSubscriber: number | null; avgCostPerAnalysis: number | null }
  months: { month: string; revenue: number; aiCost: number; expenses: number; profit: number; analyses: number; failed: number }[]
  mrrHistory: { month: string; mrr: number }[]
  byPlan: { plan: string; id: string; subscribers: number; mrr: number }[]
  costByApp: Row[]; costByProvider: Row[]; costByModel: Row[]
  topUsers: { userId: number; email: string; calls: number; cost: number }[]
  unpricedCalls: number
}
interface Row { key: string; calls: number; failed: number; cost: number; inputTokens: number; outputTokens: number; unpriced: number; avgCost: number }

function CostTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className={card}><Label>{title}</Label>
      {rows.length === 0 ? <p className="text-sm text-mute">—</p> : (
        <div className="overflow-x-auto"><table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-mute"><th className="pb-1 font-medium">Name</th><th className="pb-1 text-right font-medium">Calls</th><th className="pb-1 text-right font-medium">Cost</th><th className="pb-1 text-right font-medium">Avg / call</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-line"><td className="py-1.5">{r.key}{r.unpriced > 0 && <span className="ml-1.5 text-warn" title="Some calls have no price set">⚠</span>}</td><td className="text-right font-mono">{r.calls}{r.failed ? <span className="text-bad"> ({r.failed} failed)</span> : null}</td><td className="text-right font-mono">{usd(r.cost, 4)}</td><td className="text-right font-mono">{usd(r.avgCost, 4)}</td></tr>)}</tbody>
        </table></div>)}
    </div>
  )
}

function FinanceTab({ lang }: { lang: 'en' | 'es' }) {
  const L = (en: string, es: string) => tr(lang, en, es)
  const { data: f, error } = useAdmin<Fin>('finance?months=12')
  if (error) return <p role="alert" className="text-sm text-bad">{error}</p>
  if (!f) return <p className="text-sm text-mute">…</p>
  const k = f.kpis
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      {f.unpricedCalls > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-warn bg-[rgb(var(--warn)/.1)] p-3 text-sm text-warn"><AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {L(`${f.unpricedCalls} call(s) this month used a model with no price set, so their cost is counted as $0. Set the price in AI & keys → Models.`, `${f.unpricedCalls} llamada(s) este mes usaron un modelo sin precio configurado, por lo que su costo cuenta como $0. Definí el precio en IA y claves → Modelos.`)}</div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="MRR" value={usd(k.mrr)} sub={L('active subscriptions, yearly ÷ 12', 'suscripciones activas, anual ÷ 12')} />
        <Kpi label="ARR" value={usd(k.arr)} sub="MRR × 12" />
        <Kpi label={L('Active subscribers', 'Suscriptores activos')} value={String(k.activeSubscribers)} sub={`ARPU ${usd(k.arpu)}`} />
        <Kpi label={L('Churn (30 d)', 'Cancelaciones (30 d)')} value={`${k.churn30d}`} sub={pct(k.churnRate30d)} />
        <Kpi label={L('AI cost (this month)', 'Costo de IA (este mes)')} value={usd(k.aiCostThisMonth, 4)} sub={k.avgCostPerAnalysis !== null ? `${usd(k.avgCostPerAnalysis, 4)} / ${L('analysis', 'análisis')}` : undefined} />
        <Kpi label={L('Expenses (this month)', 'Gastos (este mes)')} value={usd(k.expensesThisMonth)} />
        <Kpi label={L('Revenue collected (month)', 'Ingresos cobrados (mes)')} value={usd(k.revenueThisMonth)} sub={L('from recorded payments', 'de pagos registrados')} />
        <Kpi label={L('Est. monthly margin', 'Margen mensual est.')} value={usd(k.estimatedMonthlyMargin)} sub={`${pct(k.estimatedMarginPct)} · MRR − AI − ${L('expenses', 'gastos')}`} warn={k.estimatedMonthlyMargin < 0} />
      </div>
      {k.atRiskMrr > 0 && <p className="text-xs text-mute">{L(`At-risk MRR (past due): ${usd(k.atRiskMrr)} — not included in MRR.`, `MRR en riesgo (vencido): ${usd(k.atRiskMrr)} — no incluido en MRR.`)}</p>}

      <div className={card}><Label>{L('Revenue vs costs (12 months)', 'Ingresos vs costos (12 meses)')}</Label>
        <div className="h-[300px] w-full min-w-0"><ResponsiveContainer>
          <ComposedChart data={f.months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} /><XAxis dataKey="month" /><YAxis width={52} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v) => usd(Number(v), 2)} contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue" name={L('Revenue', 'Ingresos')} fill="var(--s3)" isAnimationActive={false} />
            <Bar dataKey="aiCost" name={L('AI cost', 'Costo IA')} stackId="c" fill="var(--s1)" isAnimationActive={false} />
            <Bar dataKey="expenses" name={L('Expenses', 'Gastos')} stackId="c" fill="var(--s5)" isAnimationActive={false} />
            <Line dataKey="profit" name={L('Profit', 'Resultado')} stroke="var(--s2)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart></ResponsiveContainer></div>
      </div>
      <div className={card}><Label>MRR</Label>
        <div className="h-[200px] w-full min-w-0"><ResponsiveContainer>
          <LineChart data={f.mrrHistory} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} /><XAxis dataKey="month" /><YAxis width={52} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v) => usd(Number(v))} contentStyle={tip} /><Line dataKey="mrr" name="MRR" stroke="var(--s1)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
          </LineChart></ResponsiveContainer></div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <CostTable title={L('Cost by app (this month)', 'Costo por app (este mes)')} rows={f.costByApp} />
        <CostTable title={L('Cost by provider', 'Costo por proveedor')} rows={f.costByProvider} />
        <CostTable title={L('Cost by model', 'Costo por modelo')} rows={f.costByModel} />
        <div className={card}><Label>{L('Top users by AI cost', 'Usuarios con más costo de IA')}</Label>
          {f.topUsers.length === 0 ? <p className="text-sm text-mute">—</p> : <table className="w-full text-[13px]"><tbody>{f.topUsers.map((u) => <tr key={u.userId} className="border-t border-line first:border-t-0"><td className="py-1.5">{u.email}</td><td className="text-right font-mono">{u.calls}</td><td className="text-right font-mono">{usd(u.cost, 4)}</td></tr>)}</tbody></table>}
        </div>
      </div>
      <div className={card}><Label>{L('Subscribers by plan', 'Suscriptores por plan')}</Label>
        <table className="w-full text-[13px]"><tbody>{f.byPlan.map((p) => <tr key={p.id} className="border-t border-line first:border-t-0"><td className="py-1.5">{p.plan}</td><td className="text-right font-mono">{p.subscribers}</td><td className="text-right font-mono">{usd(p.mrr)}</td></tr>)}</tbody></table>
      </div>
      <p className="text-xs leading-relaxed text-mute">{L('Costs = tokens × the prices you set under AI & keys → Models (verify them against each provider’s pricing page). MRR comes from subscriptions you record here until a payment provider is connected. Revenue and expenses are global; AI cost is split by app.', 'Costos = tokens × los precios que definís en IA y claves → Modelos (verificalos en la página de precios de cada proveedor). El MRR sale de las suscripciones que registrás acá hasta conectar un procesador de pagos. Ingresos y gastos son globales; el costo de IA se divide por app.')}</p>
    </div>
  )
}

// ---- AI & keys ------------------------------------------------------------------------------
interface KeyS { provider: string; configured: boolean; source: 'admin' | 'env' | null; last4: string | null; verifiedAt: string | null }
interface ModelRow { provider: string; model: string; label: string; inputPerMtok: number | null; outputPerMtok: number | null; enabled: boolean }
interface Settings { aiDefault: { provider: string; model: string }; aiResearch: { provider: string; model: string }; aiEffort: string; signupMode: 'open' | 'invite' | 'closed'; dailyCapPerUser: number; legalEntity: string; legalEmail: string }

function KeyCard({ k, lang, reload }: { k: KeyS; lang: 'en' | 'es'; reload: () => void }) {
  const L = (en: string, es: string) => tr(lang, en, es)
  const [val, setVal] = useState(''), [verify, setVerify] = useState(true), [busy, setBusy] = useState(false)
  const name = k.provider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI'
  return (
    <div className={card}>
      <div className="mb-2 flex items-center gap-2"><KeyRound size={16} className="text-mute" /><b className="text-sm">{name}</b>
        <span className={cx('ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium', k.configured ? 'bg-[rgb(var(--ok)/.14)] text-ok' : 'bg-sunk text-mute')}>{k.configured ? `${L('set', 'configurada')} · …${k.last4}${k.source === 'env' ? ' · env' : ''}` : L('not set', 'sin configurar')}</span></div>
      <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await act(api.put(`admin/keys/${k.provider}`, { key: val, verify }), L('Key saved (encrypted).', 'Clave guardada (cifrada).'), () => { setVal(''); reload() }); setBusy(false) }}>
        <input type="password" autoComplete="off" value={val} onChange={(e) => setVal(e.target.value)} placeholder={L('Paste a new API key', 'Pegá una clave de API nueva')} aria-label={`${name} API key`} className={cx(input, 'min-w-0 flex-1 font-mono')} />
        <Btn type="submit" variant="primary" size="sm" className="h-9" disabled={busy || val.length < 20}>{L('Save', 'Guardar')}</Btn>
      </form>
      <label className="mt-2 flex items-center gap-2 text-xs text-mute"><input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />{L('Verify with the provider before saving', 'Verificar con el proveedor antes de guardar')}</label>
      {k.configured && <div className="mt-2 flex gap-1">
        <Btn size="sm" variant="outline" onClick={async () => { const r = await api.post(`admin/keys/${k.provider}/verify`, {}); toast(r.data?.ok ? L('Key works.', 'La clave funciona.') : r.data?.error ?? 'Failed', r.data?.ok ? 'ok' : 'bad'); reload() }}>{L('Test key', 'Probar clave')}</Btn>
        {k.source === 'admin' && <Btn size="sm" variant="ghost" onClick={() => { if (confirm(L('Remove this key?', '¿Quitar esta clave?'))) void act(api.del(`admin/keys/${k.provider}`), L('Key removed.', 'Clave quitada.'), reload) }}><Trash2 size={14} />{L('Remove', 'Quitar')}</Btn>}
        {k.verifiedAt && <span className="self-center text-xs text-mute">{L('verified', 'verificada')} {new Date(k.verifiedAt).toLocaleDateString()}</span>}
      </div>}
    </div>
  )
}

function ModelEditor({ m, lang, reload }: { m: ModelRow; lang: 'en' | 'es'; reload: () => void }) {
  const [i, setI] = useState(m.inputPerMtok === null ? '' : String(m.inputPerMtok)), [o, setO] = useState(m.outputPerMtok === null ? '' : String(m.outputPerMtok)), [en, setEn] = useState(m.enabled)
  const dirty = i !== (m.inputPerMtok === null ? '' : String(m.inputPerMtok)) || o !== (m.outputPerMtok === null ? '' : String(m.outputPerMtok)) || en !== m.enabled
  return (
    <tr className="border-t border-line align-middle">
      <td className="py-1.5 pr-2"><div className="text-[13px]">{m.model}</div><div className="text-[11px] text-mute">{m.provider}</div></td>
      <td className="px-1"><input aria-label="Input $/Mtok" inputMode="decimal" className={cx(input, 'w-20 font-mono')} value={i} onChange={(e) => setI(e.target.value)} placeholder="—" /></td>
      <td className="px-1"><input aria-label="Output $/Mtok" inputMode="decimal" className={cx(input, 'w-20 font-mono')} value={o} onChange={(e) => setO(e.target.value)} placeholder="—" /></td>
      <td className="px-1 text-center"><input type="checkbox" aria-label="Enabled" checked={en} onChange={(e) => setEn(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" /></td>
      <td className="whitespace-nowrap text-right">
        <Btn size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty} onClick={() => act(api.put('admin/models', { provider: m.provider, model: m.model, label: m.label, inputPerMtok: i === '' ? null : i, outputPerMtok: o === '' ? null : o, enabled: en }), tr(lang, 'Saved.', 'Guardado.'), reload)}>{tr(lang, 'Save', 'Guardar')}</Btn>
        <IconBtn label="Delete" className="h-8 w-8" onClick={() => { if (confirm(tr(lang, 'Delete this model entry?', '¿Eliminar este modelo?'))) void act(api.del(`admin/models/${m.provider}/${encodeURIComponent(m.model)}`), tr(lang, 'Deleted.', 'Eliminado.'), reload) }}><Trash2 size={14} /></IconBtn>
      </td>
    </tr>
  )
}

function AiTab({ lang }: { lang: 'en' | 'es' }) {
  const L = (en: string, es: string) => tr(lang, en, es)
  const keys = useAdmin<KeyS[]>('keys'), models = useAdmin<ModelRow[]>('models'), settings = useAdmin<Settings>('settings')
  const [nm, setNm] = useState({ provider: 'openai', model: '', inputPerMtok: '', outputPerMtok: '' })
  const [st, setSt] = useState<Settings | null>(null)
  useEffect(() => { if (settings.data) setSt(settings.data) }, [settings.data])
  const opts = (models.data ?? []).filter((m) => m.enabled)
  const val = (x: { provider: string; model: string }) => `${x.provider}/${x.model}`
  const parse = (s: string) => { const i = s.indexOf('/'); return { provider: s.slice(0, i), model: s.slice(i + 1) } }
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <p className="text-[13px] text-mute">{L('Keys are encrypted with AES-256-GCM before they reach MySQL and are never sent back to any browser. An environment variable (ANTHROPIC_API_KEY / OPENAI_API_KEY) is used only if no key is saved here.', 'Las claves se cifran con AES-256-GCM antes de llegar a MySQL y nunca vuelven a ningún navegador. Una variable de entorno (ANTHROPIC_API_KEY / OPENAI_API_KEY) se usa solo si aquí no hay clave guardada.')}</p>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">{(keys.data ?? []).map((k) => <KeyCard key={k.provider} k={k} lang={lang} reload={keys.reload} />)}</div>

      <div className={card}><Label>{L('Models and prices (USD per million tokens)', 'Modelos y precios (USD por millón de tokens)')}</Label>
        <p className="mb-2 text-xs text-mute">{L('Only enabled models can be used. Prices are YOUR entries — verify them with the provider. A model with no price records cost as $0 and is flagged in Finance.', 'Solo se pueden usar modelos habilitados. Los precios son TUS datos — verificalos con el proveedor. Un modelo sin precio registra costo $0 y se marca en Finanzas.')}</p>
        <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-mute"><th className="pb-1 font-medium">Model</th><th className="pb-1 font-medium">In</th><th className="pb-1 font-medium">Out</th><th className="pb-1 text-center font-medium">On</th><th /></tr></thead>
          <tbody>{(models.data ?? []).map((m) => <ModelEditor key={`${m.provider}/${m.model}/${m.inputPerMtok}/${m.outputPerMtok}/${m.enabled}`} m={m} lang={lang} reload={models.reload} />)}</tbody></table></div>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); await act(api.put('admin/models', { ...nm, label: nm.model, enabled: true, inputPerMtok: nm.inputPerMtok || null, outputPerMtok: nm.outputPerMtok || null }), L('Model added.', 'Modelo agregado.'), () => { setNm({ ...nm, model: '', inputPerMtok: '', outputPerMtok: '' }); models.reload() }) }}>
          <select aria-label="Provider" className={input} value={nm.provider} onChange={(e) => setNm({ ...nm, provider: e.target.value })}><option value="anthropic">anthropic</option><option value="openai">openai</option></select>
          <input aria-label="Model id" className={cx(input, 'min-w-0 flex-1')} placeholder={L('model id (exact API name)', 'id del modelo (nombre exacto de la API)')} value={nm.model} onChange={(e) => setNm({ ...nm, model: e.target.value })} />
          <input aria-label="Input price" inputMode="decimal" className={cx(input, 'w-24')} placeholder="in $/M" value={nm.inputPerMtok} onChange={(e) => setNm({ ...nm, inputPerMtok: e.target.value })} />
          <input aria-label="Output price" inputMode="decimal" className={cx(input, 'w-24')} placeholder="out $/M" value={nm.outputPerMtok} onChange={(e) => setNm({ ...nm, outputPerMtok: e.target.value })} />
          <Btn type="submit" variant="outline" size="sm" className="h-9" disabled={!nm.model.trim()}>{L('Add', 'Agregar')}</Btn>
        </form>
      </div>

      {st && <div className={card}><Label>{L('Routing and limits', 'Ruteo y límites')}</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[13px]">{L('Default model (Model / Understand / Connect)', 'Modelo por defecto (Modelar / Entender / Conectar)')}
            <select className={input} value={val(st.aiDefault)} onChange={(e) => setSt({ ...st, aiDefault: parse(e.target.value) })}>{opts.map((m) => <option key={val(m)} value={val(m)}>{m.provider} / {m.model}</option>)}</select></label>
          <label className="grid gap-1 text-[13px]">{L('Research mode model', 'Modelo del modo Investigar')}
            <select className={input} value={val(st.aiResearch)} onChange={(e) => setSt({ ...st, aiResearch: parse(e.target.value) })}>{opts.map((m) => <option key={val(m)} value={val(m)}>{m.provider} / {m.model}</option>)}</select></label>
          <label className="grid gap-1 text-[13px]">{L('Reasoning effort (Claude)', 'Esfuerzo de razonamiento (Claude)')}
            <select className={input} value={st.aiEffort} onChange={(e) => setSt({ ...st, aiEffort: e.target.value })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <label className="grid gap-1 text-[13px]">{L('Daily AI calls per user (0 = no cap)', 'Llamadas de IA diarias por usuario (0 = sin tope)')}
            <input className={input} inputMode="numeric" value={st.dailyCapPerUser} onChange={(e) => setSt({ ...st, dailyCapPerUser: Number(e.target.value.replace(/\D/g, '')) })} /></label>
        </div>
        <div className="mt-3"><Btn variant="primary" size="sm" onClick={() => act(api.put('admin/settings', st), L('Settings saved.', 'Configuración guardada.'), settings.reload)}>{L('Save settings', 'Guardar configuración')}</Btn></div>
      </div>}
    </div>
  )
}

// ---- Users & plans --------------------------------------------------------------------------
interface UserRow { id: number; email: string; name: string; role: 'user' | 'admin'; planId: string; disabled: boolean; analysesThisMonth: number; costThisMonth: number; lastLogin: string | null }
interface PlanRow { id: string; name: string; priceCents: number; intervalUnit: 'month' | 'year'; aiMonthlyQuota: number | null; paypalPlanId: string | null; active: boolean }
interface SubRow { id: number; email: string | null; planId: string; status: string; amountCents: number; intervalUnit: string; startedAt: string }

function PlanEditor({ p, lang, reload }: { p: PlanRow; lang: 'en' | 'es'; reload: () => void }) {
  const [d, setD] = useState({ name: p.name, price: (p.priceCents / 100).toString(), quota: p.aiMonthlyQuota === null ? '' : String(p.aiMonthlyQuota), unit: p.intervalUnit, active: p.active, pp: p.paypalPlanId ?? '' })
  return (
    <tr className="border-t border-line">
      <td className="py-1.5 pr-2 font-mono text-xs">{p.id}</td>
      <td className="px-1"><input aria-label="Plan name" className={cx(input, 'w-28')} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></td>
      <td className="px-1"><input aria-label="Price USD" inputMode="decimal" className={cx(input, 'w-20 font-mono')} value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} /></td>
      <td className="px-1"><select aria-label="Interval" className={input} value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as 'month' | 'year' })}><option value="month">/mo</option><option value="year">/yr</option></select></td>
      <td className="px-1"><input aria-label="AI analyses per month" inputMode="numeric" placeholder="∞" className={cx(input, 'w-20 font-mono')} value={d.quota} onChange={(e) => setD({ ...d, quota: e.target.value.replace(/\D/g, '') })} /></td>
      <td className="px-1"><input aria-label="PayPal plan id" placeholder="P-…" className={cx(input, 'w-36 font-mono text-xs')} value={d.pp} onChange={(e) => setD({ ...d, pp: e.target.value })} /></td>
      <td className="px-1 text-center"><input type="checkbox" aria-label="Active" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" /></td>
      <td className="text-right"><Btn size="sm" variant="outline" onClick={() => act(api.put('admin/plans', { id: p.id, name: d.name, priceCents: Math.round(Number(d.price) * 100), intervalUnit: d.unit, aiMonthlyQuota: d.quota === '' ? null : Number(d.quota), paypalPlanId: d.pp.trim() || null, active: d.active }), tr(lang, 'Plan saved.', 'Plan guardado.'), reload)}>{tr(lang, 'Save', 'Guardar')}</Btn></td>
    </tr>
  )
}

function PeopleTab({ lang }: { lang: 'en' | 'es' }) {
  const L = (en: string, es: string) => tr(lang, en, es)
  const users = useAdmin<UserRow[]>('users'), plans = useAdmin<PlanRow[]>('plans'), subs = useAdmin<SubRow[]>('subscriptions')
  const [g, setG] = useState({ userId: '', planId: 'pro' })
  const [np, setNp] = useState({ id: '', name: '', price: '' })
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className={card}><Label>{L('Plans', 'Planes')}</Label>
        <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-mute"><th className="pb-1 font-medium">ID</th><th className="font-medium">Name</th><th className="font-medium">USD</th><th /><th className="font-medium">AI / mo</th><th className="font-medium">PayPal plan</th><th className="text-center font-medium">On</th><th /></tr></thead>
          <tbody>{(plans.data ?? []).map((p) => <PlanEditor key={`${p.id}${p.priceCents}${p.aiMonthlyQuota}${p.active}${p.name}${p.paypalPlanId}`} p={p} lang={lang} reload={plans.reload} />)}</tbody></table></div>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); await act(api.put('admin/plans', { id: np.id, name: np.name || np.id, priceCents: Math.round(Number(np.price || 0) * 100), aiMonthlyQuota: null }), L('Plan created.', 'Plan creado.'), () => { setNp({ id: '', name: '', price: '' }); plans.reload() }) }}>
          <input aria-label="New plan id" className={cx(input, 'w-32')} placeholder="id (e.g. team)" value={np.id} onChange={(e) => setNp({ ...np, id: e.target.value.toLowerCase() })} />
          <input aria-label="New plan name" className={cx(input, 'w-32')} placeholder={L('Name', 'Nombre')} value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
          <input aria-label="New plan price" inputMode="decimal" className={cx(input, 'w-24')} placeholder="USD" value={np.price} onChange={(e) => setNp({ ...np, price: e.target.value })} />
          <Btn type="submit" variant="outline" size="sm" className="h-9" disabled={np.id.length < 2}>{L('Add plan', 'Agregar plan')}</Btn>
        </form>
      </div>

      <div className={card}><Label>{L('Users', 'Usuarios')} ({users.data?.length ?? 0})</Label>
        <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-mute"><th className="pb-1 font-medium">Email</th><th className="font-medium">Role</th><th className="font-medium">Plan</th><th className="text-right font-medium">{L('Analyses', 'Análisis')}</th><th className="text-right font-medium">{L('AI cost', 'Costo IA')}</th><th className="text-center font-medium">{L('Off', 'Baja')}</th></tr></thead>
          <tbody>{(users.data ?? []).map((u) => (
            <tr key={u.id} className="border-t border-line">
              <td className="py-1.5 pr-2">{u.email}{u.name && <div className="text-[11px] text-mute">{u.name}</div>}</td>
              <td><select aria-label={`Role of ${u.email}`} className={input} value={u.role} onChange={(e) => act(api.patch(`admin/users/${u.id}`, { role: e.target.value }), L('Updated.', 'Actualizado.'), users.reload)}><option value="user">user</option><option value="admin">admin</option></select></td>
              <td><select aria-label={`Plan of ${u.email}`} className={input} value={u.planId} onChange={(e) => act(api.patch(`admin/users/${u.id}`, { planId: e.target.value }), L('Updated.', 'Actualizado.'), users.reload)}>{(plans.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
              <td className="text-right font-mono">{u.analysesThisMonth}</td><td className="text-right font-mono">{usd(u.costThisMonth, 4)}</td>
              <td className="text-center"><input type="checkbox" aria-label={`Disable ${u.email}`} checked={u.disabled} onChange={(e) => act(api.patch(`admin/users/${u.id}`, { disabled: e.target.checked }), L('Updated.', 'Actualizado.'), users.reload)} className="h-4 w-4 accent-[rgb(var(--accent))]" /></td>
            </tr>))}</tbody></table></div>
      </div>

      <div className={card}><Label>{L('Subscriptions (manual until a payment provider is connected)', 'Suscripciones (manuales hasta conectar un procesador de pagos)')}</Label>
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); await act(api.post('admin/subscriptions', { userId: Number(g.userId), planId: g.planId }), L('Subscription created.', 'Suscripción creada.'), () => { subs.reload(); users.reload() }) }}>
          <select aria-label="User" className={cx(input, 'min-w-0 flex-1')} value={g.userId} onChange={(e) => setG({ ...g, userId: e.target.value })}><option value="">{L('Choose a user…', 'Elegí un usuario…')}</option>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}</select>
          <select aria-label="Plan" className={input} value={g.planId} onChange={(e) => setG({ ...g, planId: e.target.value })}>{(plans.data ?? []).filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <Btn type="submit" variant="outline" size="sm" className="h-9" disabled={!g.userId}>{L('Start subscription', 'Iniciar suscripción')}</Btn>
        </form>
        <table className="w-full text-[13px]"><tbody>{(subs.data ?? []).slice(0, 40).map((s) => (
          <tr key={s.id} className="border-t border-line"><td className="py-1.5">{s.email ?? '—'}</td><td>{s.planId}</td><td className={cx('text-xs', s.status === 'active' ? 'text-ok' : 'text-mute')}>{s.status}</td><td className="text-right font-mono">{usd(s.amountCents / 100)}/{s.intervalUnit === 'year' ? 'yr' : 'mo'}</td>
            <td className="text-right">{s.status !== 'canceled' && <Btn size="sm" variant="ghost" onClick={() => { if (confirm(L('Cancel this subscription?', '¿Cancelar esta suscripción?'))) void act(api.post(`admin/subscriptions/${s.id}/cancel`, {}), L('Canceled.', 'Cancelada.'), () => { subs.reload(); users.reload() }) }}>{L('Cancel', 'Cancelar')}</Btn>}</td></tr>))}</tbody></table>
      </div>
    </div>
  )
}

// ---- Money in/out ---------------------------------------------------------------------------
interface Pay { id: number; email: string | null; amountCents: number; paidAt: string; note: string }
interface Exp { id: number; name: string; category: string; amountCents: number; month: string; recurring: boolean }
function MoneyTab({ lang }: { lang: 'en' | 'es' }) {
  const L = (en: string, es: string) => tr(lang, en, es)
  const pays = useAdmin<Pay[]>('payments'), exps = useAdmin<Exp[]>('expenses'), audit = useAdmin<{ id: number; action: string; detail: string; createdAt: string; email: string | null }[]>('audit')
  const [p, setP] = useState({ amount: '', note: '' })
  const [x, setX] = useState({ name: '', amount: '', month: new Date().toISOString().slice(0, 7), recurring: true })
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className={card}><Label>{L('Payments received (revenue)', 'Pagos recibidos (ingresos)')}</Label>
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); await act(api.post('admin/payments', { amountCents: Math.round(Number(p.amount) * 100), note: p.note }), L('Payment recorded.', 'Pago registrado.'), () => { setP({ amount: '', note: '' }); pays.reload() }) }}>
          <input aria-label="Amount USD" inputMode="decimal" className={cx(input, 'w-28')} placeholder="USD" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} />
          <input aria-label="Note" className={cx(input, 'min-w-0 flex-1')} placeholder={L('Note (customer, invoice…)', 'Nota (cliente, factura…)')} value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} />
          <Btn type="submit" variant="outline" size="sm" className="h-9" disabled={!Number(p.amount)}>{L('Record', 'Registrar')}</Btn>
        </form>
        <table className="w-full text-[13px]"><tbody>{(pays.data ?? []).slice(0, 30).map((r) => <tr key={r.id} className="border-t border-line"><td className="py-1.5">{new Date(r.paidAt).toLocaleDateString()}</td><td className="text-mute">{r.note || r.email || ''}</td><td className="text-right font-mono">{usd(r.amountCents / 100)}</td><td className="text-right"><IconBtn label="Delete payment" className="h-8 w-8" onClick={() => { if (confirm(L('Delete this payment?', '¿Eliminar este pago?'))) void act(api.del(`admin/payments/${r.id}`), L('Deleted.', 'Eliminado.'), pays.reload) }}><Trash2 size={14} /></IconBtn></td></tr>)}</tbody></table>
      </div>
      <div className={card}><Label>{L('Expenses (hosting, domains, tools…)', 'Gastos (hosting, dominios, herramientas…)')}</Label>
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); await act(api.post('admin/expenses', { name: x.name, amountCents: Math.round(Number(x.amount) * 100), month: x.month, recurring: x.recurring }), L('Expense saved.', 'Gasto guardado.'), () => { setX({ ...x, name: '', amount: '' }); exps.reload() }) }}>
          <input aria-label="Expense name" className={cx(input, 'min-w-0 flex-1')} placeholder="Hostinger" value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} />
          <input aria-label="Expense USD" inputMode="decimal" className={cx(input, 'w-24')} placeholder="USD" value={x.amount} onChange={(e) => setX({ ...x, amount: e.target.value })} />
          <input aria-label="Starting month" type="month" className={input} value={x.month} onChange={(e) => setX({ ...x, month: e.target.value })} />
          <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={x.recurring} onChange={(e) => setX({ ...x, recurring: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />{L('monthly', 'mensual')}</label>
          <Btn type="submit" variant="outline" size="sm" className="h-9" disabled={!x.name.trim() || !Number(x.amount)}>{L('Add', 'Agregar')}</Btn>
        </form>
        <table className="w-full text-[13px]"><tbody>{(exps.data ?? []).map((r) => <tr key={r.id} className="border-t border-line"><td className="py-1.5">{r.name}</td><td className="text-mute">{r.month}{r.recurring ? ` → ${L('monthly', 'mensual')}` : ''}</td><td className="text-right font-mono">{usd(r.amountCents / 100)}</td><td className="text-right"><IconBtn label="Delete expense" className="h-8 w-8" onClick={() => { if (confirm(L('Delete this expense?', '¿Eliminar este gasto?'))) void act(api.del(`admin/expenses/${r.id}`), L('Deleted.', 'Eliminado.'), exps.reload) }}><Trash2 size={14} /></IconBtn></td></tr>)}</tbody></table>
      </div>
      <div className={card}><Label>{L('Audit log (admin actions)', 'Registro de auditoría (acciones de admin)')}</Label>
        <table className="w-full text-[12.5px]"><tbody>{(audit.data ?? []).slice(0, 25).map((a) => <tr key={a.id} className="border-t border-line"><td className="py-1 text-mute">{new Date(a.createdAt).toLocaleString()}</td><td>{a.email ?? '—'}</td><td className="font-mono">{a.action}</td><td className="text-mute">{a.detail}</td></tr>)}</tbody></table>
      </div>
    </div>
  )
}

// ---- Billing (PayPal) -------------------------------------------------------------------------
interface PayPalCfg { mode: 'sandbox' | 'live'; clientId: string; secretSet: boolean; webhookId: string; webhookUrl: string; returnUrl: string; publicUrlSet: boolean }
function BillingTab({ lang }: { lang: 'en' | 'es' }) {
  const L = (en: string, es: string) => tr(lang, en, es)
  const { data, reload } = useAdmin<PayPalCfg>('paypal')
  const [f, setF] = useState({ mode: 'sandbox', clientId: '', secret: '', webhookId: '' })
  useEffect(() => { if (data) setF({ mode: data.mode, clientId: data.clientId, secret: '', webhookId: data.webhookId }) }, [data])
  if (!data) return <p className="text-sm text-mute">…</p>
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className={card}><Label>PayPal Subscriptions</Label>
        <p className="mb-3 text-[13px] text-mute">{L('Start in sandbox with PayPal test accounts, then switch to live. Credentials and the webhook id come from the PayPal Developer dashboard (see docs/BILLING-PAYPAL.md). The secret is encrypted and never shown again.', 'Empezá en sandbox con cuentas de prueba de PayPal y después pasá a live. Las credenciales y el id del webhook salen del panel PayPal Developer (ver docs/BILLING-PAYPAL.md). El secreto se cifra y no se vuelve a mostrar.')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[13px]">{L('Mode', 'Modo')}<select className={input} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="sandbox">sandbox (test)</option><option value="live">live (real money)</option></select></label>
          <label className="grid gap-1 text-[13px]">Client ID<input className={cx(input, 'font-mono text-xs')} value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} autoComplete="off" /></label>
          <label className="grid gap-1 text-[13px]">Secret {data.secretSet && <span className="text-ok">({L('saved', 'guardado')})</span>}<input type="password" className={cx(input, 'font-mono text-xs')} value={f.secret} placeholder={data.secretSet ? L('leave empty to keep', 'dejar vacío para conservar') : ''} onChange={(e) => setF({ ...f, secret: e.target.value })} autoComplete="off" /></label>
          <label className="grid gap-1 text-[13px]">Webhook ID<input className={cx(input, 'font-mono text-xs')} value={f.webhookId} onChange={(e) => setF({ ...f, webhookId: e.target.value })} autoComplete="off" /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variant="primary" size="sm" onClick={() => act(api.put('admin/paypal', { mode: f.mode, clientId: f.clientId, webhookId: f.webhookId, ...(f.secret ? { secret: f.secret } : {}) }), L('PayPal settings saved.', 'Configuración de PayPal guardada.'), reload)}>{L('Save', 'Guardar')}</Btn>
          <Btn variant="outline" size="sm" onClick={async () => { const r = await api.post('admin/paypal/test', {}); toast(r.data?.ok ? L(`Connected to PayPal (${r.data.mode}).`, `Conectado a PayPal (${r.data.mode}).`) : r.data?.error ?? 'Failed', r.data?.ok ? 'ok' : 'bad') }}>{L('Test connection', 'Probar conexión')}</Btn>
        </div>
      </div>
      <div className={card}><Label>{L('URLs to give PayPal', 'URLs para PayPal')}</Label>
        {!data.publicUrlSet && <p className="mb-2 rounded-lg bg-[rgb(var(--warn)/.1)] p-2 text-[13px] text-warn">{L('Tip: set the PUBLIC_URL environment variable (https://your-domain) so these links are exact behind the host’s proxy.', 'Tip: definí la variable PUBLIC_URL (https://tu-dominio) para que estos enlaces sean exactos detrás del proxy del hosting.')}</p>}
        {[['Webhook URL', data.webhookUrl], ['Return URL', data.returnUrl]].map(([k, v]) => <div key={k} className="mb-2 flex items-center gap-2"><span className="w-28 shrink-0 text-[13px] text-mute">{k}</span><code className="min-w-0 flex-1 break-all rounded bg-sunk px-2 py-1 text-[12px]">{v}</code><CopyBtn text={v} label="Copy" /></div>)}
        <p className="mt-2 text-xs text-mute">{L('Webhook events to subscribe: BILLING.SUBSCRIPTION.ACTIVATED, CANCELLED, EXPIRED, SUSPENDED, PAYMENT.FAILED and PAYMENT.SALE.COMPLETED. Paste each PayPal plan id (P-…) in Users & plans → Plans.', 'Eventos del webhook: BILLING.SUBSCRIPTION.ACTIVATED, CANCELLED, EXPIRED, SUSPENDED, PAYMENT.FAILED y PAYMENT.SALE.COMPLETED. Pegá cada id de plan de PayPal (P-…) en Usuarios y planes → Planes.')}</p>
      </div>
      <p className="text-xs leading-relaxed text-mute">{L('Revenue is recorded gross (before PayPal fees) in USD only. Without a verified webhook nothing is activated automatically.', 'Los ingresos se registran brutos (antes de comisiones de PayPal) y solo en USD. Sin un webhook verificado no se activa nada automáticamente.')}</p>
    </div>
  )
}

// ---- Beta & legal -----------------------------------------------------------------------------
interface Invite { code: string; note: string; maxUses: number; uses: number; planId: string | null; expiresAt: string | null; active: boolean }
function BetaTab({ lang }: { lang: 'en' | 'es' }) {
  const L = (en: string, es: string) => tr(lang, en, es)
  const settings = useAdmin<Settings>('settings'), invites = useAdmin<Invite[]>('invites'), plans = useAdmin<PlanRow[]>('plans')
  const fb = useAdmin<{ id: number; kind: string; message: string; page: string; createdAt: string; email: string | null }[]>('feedback')
  const [st, setSt] = useState<Settings | null>(null)
  const [inv, setInv] = useState({ note: '', maxUses: '1', days: '30', planId: '' })
  useEffect(() => { if (settings.data) setSt(settings.data) }, [settings.data])
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      {st && <div className={card}><Label>{L('Sign-up mode', 'Modo de registro')}</Label>
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Sign-up mode" className={input} value={st.signupMode} onChange={(e) => setSt({ ...st, signupMode: e.target.value as Settings['signupMode'] })}>
            <option value="open">{L('Open — anyone can register', 'Abierto — cualquiera puede registrarse')}</option><option value="invite">{L('Invite only (closed beta)', 'Solo con invitación (beta cerrada)')}</option><option value="closed">{L('Closed — no new sign-ups', 'Cerrado — sin nuevos registros')}</option></select>
          <Btn variant="primary" size="sm" onClick={() => act(api.put('admin/settings', { signupMode: st.signupMode }), L('Saved.', 'Guardado.'), settings.reload)}>{L('Save', 'Guardar')}</Btn>
        </div></div>}
      <div className={card}><Label>{L('Invitation codes', 'Códigos de invitación')}</Label>
        <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); await act(api.post('admin/invites', { note: inv.note, maxUses: Number(inv.maxUses), expiresDays: inv.days ? Number(inv.days) : null, planId: inv.planId || null }), L('Code created.', 'Código creado.'), () => { setInv({ ...inv, note: '' }); invites.reload() }) }}>
          <label className="grid gap-1 text-[12px] text-mute">{L('Note (who is it for?)', 'Nota (¿para quién?)')}<input className={cx(input, 'w-44')} value={inv.note} onChange={(e) => setInv({ ...inv, note: e.target.value })} /></label>
          <label className="grid gap-1 text-[12px] text-mute">{L('Uses', 'Usos')}<input className={cx(input, 'w-16')} inputMode="numeric" value={inv.maxUses} onChange={(e) => setInv({ ...inv, maxUses: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="grid gap-1 text-[12px] text-mute">{L('Expires (days)', 'Vence (días)')}<input className={cx(input, 'w-20')} inputMode="numeric" value={inv.days} onChange={(e) => setInv({ ...inv, days: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="grid gap-1 text-[12px] text-mute">{L('Starts on plan', 'Empieza en el plan')}<select className={input} value={inv.planId} onChange={(e) => setInv({ ...inv, planId: e.target.value })}><option value="">{L('(default)', '(por defecto)')}</option>{(plans.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <Btn type="submit" variant="outline" size="sm" className="h-9">{L('Create code', 'Crear código')}</Btn>
        </form>
        <div className="overflow-x-auto"><table className="w-full text-[13px]"><tbody>{(invites.data ?? []).map((i) => (
          <tr key={i.code} className={cx('border-t border-line', !i.active && 'opacity-50')}><td className="py-1.5 pr-2 font-mono">{i.code}</td><td className="text-mute">{i.note}</td><td className="text-right font-mono">{i.uses}/{i.maxUses}</td><td className="px-2 text-xs text-mute">{i.planId ?? ''}{i.expiresAt ? ` · ${new Date(i.expiresAt).toLocaleDateString()}` : ''}</td>
            <td className="whitespace-nowrap text-right"><CopyBtn text={i.code} label="Copy" />{i.active && <IconBtn label="Revoke" className="h-8 w-8" onClick={() => act(api.del(`admin/invites/${i.code}`), L('Revoked.', 'Revocado.'), invites.reload)}><Trash2 size={14} /></IconBtn>}</td></tr>))}</tbody></table></div>
      </div>
      <div className={card}><Label>{L('Feedback from users', 'Feedback de usuarios')} ({fb.data?.length ?? 0})</Label>
        {(fb.data ?? []).length === 0 ? <p className="text-sm text-mute">—</p> : <ul className="space-y-3">{fb.data!.map((x) => (
          <li key={x.id} className="border-t border-line pt-2 first:border-t-0 first:pt-0 text-[13px]"><div className="flex items-center justify-between gap-2 text-xs text-mute"><span><b className="text-ink">{x.kind}</b> · {x.email ?? '—'} · {x.page} · {new Date(x.createdAt).toLocaleString()}</span><IconBtn label="Delete feedback" className="h-8 w-8" onClick={() => act(api.del(`admin/feedback/${x.id}`), L('Deleted.', 'Eliminado.'), fb.reload)}><Trash2 size={14} /></IconBtn></div><p className="mt-1 whitespace-pre-wrap">{x.message}</p></li>))}</ul>}
      </div>
      {st && <div className={card}><Label>{L('Legal contact (shown in Terms and Privacy)', 'Contacto legal (se muestra en Términos y Privacidad)')}</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[13px]">{L('Legal name of the operator', 'Nombre legal del operador')}<input className={input} value={st.legalEntity} onChange={(e) => setSt({ ...st, legalEntity: e.target.value })} /></label>
          <label className="grid gap-1 text-[13px]">{L('Contact email for legal/privacy', 'Correo de contacto legal/privacidad')}<input className={input} type="email" value={st.legalEmail} onChange={(e) => setSt({ ...st, legalEmail: e.target.value })} /></label>
        </div>
        <div className="mt-3"><Btn variant="primary" size="sm" onClick={() => act(api.put('admin/settings', { legalEntity: st.legalEntity, legalEmail: st.legalEmail }), L('Saved.', 'Guardado.'), settings.reload)}>{L('Save', 'Guardar')}</Btn></div>
      </div>}
    </div>
  )
}

// ---- shell ----------------------------------------------------------------------------------
export default function Admin() {
  const lang = useStore((s) => s.ui.lang)
  const user = useStore((s) => s.server.user)
  const [tab, setTab] = useState<'finance' | 'ai' | 'people' | 'billing' | 'beta' | 'money'>('finance')
  const L = (en: string, es: string) => tr(lang, en, es)
  if (user?.role !== 'admin') return <PageShell title="Admin"><p className="text-sm text-mute">{L('Admin access required.', 'Se requiere acceso de administrador.')}</p></PageShell>
  const tabs = [['finance', L('Finance', 'Finanzas')], ['ai', L('AI & keys', 'IA y claves')], ['people', L('Users & plans', 'Usuarios y planes')], ['billing', L('Billing (PayPal)', 'Cobros (PayPal)')], ['beta', L('Beta & legal', 'Beta y legal')], ['money', L('Payments & expenses', 'Pagos y gastos')]] as const
  return (
    <PageShell wide title={L('Admin', 'Administración')} sub={L('Keys, costs, revenue and customers.', 'Claves, costos, ingresos y clientes.')}>
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-line p-0.5">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx('h-9 shrink-0 rounded-md px-3.5 text-sm font-medium', tab === id ? 'bg-accent-soft text-accent' : 'text-mute hover:text-ink')}>{label}</button>)}
      </div>
      {tab === 'finance' && <FinanceTab lang={lang} />}
      {tab === 'ai' && <AiTab lang={lang} />}
      {tab === 'people' && <PeopleTab lang={lang} />}
      {tab === 'billing' && <BillingTab lang={lang} />}
      {tab === 'beta' && <BetaTab lang={lang} />}
      {tab === 'money' && <MoneyTab lang={lang} />}
    </PageShell>
  )
}
