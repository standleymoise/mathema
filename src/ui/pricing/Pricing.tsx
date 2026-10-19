import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Btn, Confirm, cx } from '../common'
import { PageShell } from '../models/Lists'
import { server, ui, useStore } from '../../store/store'
import { api } from '../../services/api'
import { tr } from '../../core/text'

export default function Pricing() {
  const lang = useStore((s) => s.ui.lang)
  const srv = useStore((s) => s.server)
  const L = (en: string, es: string) => tr(lang, en, es)
  const [sub, setSub] = useState<{ planId: string; status: string; source: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  useEffect(() => { void server.loadPlans() }, [])
  useEffect(() => { if (srv.user) void api.get<{ subscription: typeof sub }>('billing/me').then((r) => r.ok && setSub(r.data.subscription)); else setSub(null) }, [srv.user, srv.usage])
  const price = (p: { priceCents: number; intervalUnit: string }) => (p.priceCents === 0 ? '$0' : `$${(p.priceCents / 100).toFixed(p.priceCents % 100 ? 2 : 0)}`)
  return (
    <PageShell wide title={L('Plans', 'Planes')} sub={L('Equations and data tables are always solved on your own device for free. Plans only change how many AI-assisted analyses you get.', 'Las ecuaciones y tablas de datos siempre se resuelven gratis en tu propio dispositivo. Los planes solo cambian cuántos análisis asistidos por IA recibís.')}>
      {!srv.available && <p className="mb-6 rounded-xl border border-line bg-surface p-4 text-sm text-mute">{L('This is the static demo: accounts and plans need the MATHEMA server.', 'Esta es la demo estática: las cuentas y planes necesitan el servidor de MATHEMA.')}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {srv.plans.map((p) => {
          const current = srv.user?.planId === p.id
          return (
            <section key={p.id} className={cx('flex flex-col rounded-2xl border bg-surface p-5', current ? 'border-accent' : 'border-line')} aria-label={p.name}>
              <div className="flex items-baseline justify-between"><h2 className="serif text-2xl">{p.name}</h2>{current && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">{L('Your plan', 'Tu plan')}</span>}</div>
              <div className="mt-2"><span className="serif text-4xl">{price(p)}</span>{p.priceCents > 0 && <span className="text-sm text-mute"> /{p.intervalUnit === 'year' ? L('year', 'año') : L('month', 'mes')}</span>}</div>
              <ul className="my-4 grid gap-2 text-[13.5px] text-mute">
                <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" />{p.aiMonthlyQuota === null ? L('Unlimited AI-assisted analyses', 'Análisis asistidos por IA ilimitados') : L(`${p.aiMonthlyQuota} AI-assisted analyses per month`, `${p.aiMonthlyQuota} análisis asistidos por IA al mes`)}</li>
                <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" />{L('Unlimited local models, experiments and equations', 'Modelos, experimentos y ecuaciones locales ilimitados')}</li>
                <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" />{L('Cloud sync across your devices', 'Sincronización entre tus dispositivos')}</li>
              </ul>
              <div className="mt-auto">
                {p.priceCents === 0 ? <Btn variant="outline" disabled className="w-full">{current ? L('Current plan', 'Plan actual') : L('Included', 'Incluido')}</Btn>
                  : current && sub?.source === 'paypal' ? <Btn variant="outline" className="w-full" onClick={() => setConfirmCancel(true)}>{L('Cancel subscription', 'Cancelar suscripción')}</Btn>
                  : current ? <Btn variant="outline" disabled className="w-full">{L('Current plan', 'Plan actual')}</Btn>
                  : !srv.user ? <Btn variant="primary" className="w-full" disabled={!srv.available} onClick={() => ui.setAuthOpen(true)}>{L('Sign in to subscribe', 'Iniciá sesión para suscribirte')}</Btn>
                  : <Btn variant="primary" className="w-full" disabled={!srv.billingEnabled || !p.purchasable || busy === p.id} onClick={async () => { setBusy(p.id); await server.checkout(p.id); setBusy(null) }}>{srv.billingEnabled && p.purchasable ? L('Subscribe with PayPal', 'Suscribirme con PayPal') : L('Payments coming soon', 'Pagos próximamente')}</Btn>}
              </div>
            </section>
          )
        })}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-mute">{L('Payments are processed by PayPal in USD; MATHEMA never sees your card. You can cancel any time. ', 'Los pagos los procesa PayPal en USD; MATHEMA nunca ve tu tarjeta. Podés cancelar cuando quieras. ')}
        <button className="text-accent hover:underline" onClick={() => ui.openLegal('terms')}>{L('Terms', 'Términos')}</button> · <button className="text-accent hover:underline" onClick={() => ui.openLegal('privacy')}>{L('Privacy', 'Privacidad')}</button></p>
      <Confirm open={confirmCancel} title={L('Cancel your subscription?', '¿Cancelar tu suscripción?')} body={L('Your plan returns to Free immediately and no further charges are made.', 'Tu plan vuelve a Gratis de inmediato y no se harán más cobros.')} onNo={() => setConfirmCancel(false)} onYes={async () => { setConfirmCancel(false); await server.cancelSubscription() }} />
    </PageShell>
  )
}
