import { BookMarked, CreditCard, FlaskConical, Library, LogIn, MessageSquarePlus, MessageSquare, Network, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, ShieldCheck, Sigma, X } from 'lucide-react'
import { cx, IconBtn } from '../common'
import { ui, useStore, useT, type View } from '../../store/store'
import type { Key } from '../../i18n'

export default function Sidebar() {
  const t = useT()
  const s = useStore((x) => x.ui)
  const db = useStore((x) => x.db)
  const srv = useStore((x) => x.server)
  const collapsed = s.sidebarCollapsed
  const nav: { v: View; icon: typeof Sigma; label: Key; count?: number }[] = [
    { v: 'models', icon: Library, label: 'myModels', count: db.models.length },
    { v: 'experiments', icon: FlaskConical, label: 'experiments', count: db.experiments.length },
    { v: 'universe', icon: Network, label: 'universe' },
    { v: 'sources', icon: BookMarked, label: 'sources', count: db.sources.length },
  ]
  const Item = ({ active, icon: Icon, label, count, onClick }: { active: boolean; icon: typeof Sigma; label: string; count?: number; onClick: () => void }) => (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined}
      className={cx('flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors', active ? 'bg-sunk font-medium text-ink' : 'text-ink/75 hover:bg-sunk/70', collapsed && 'lg:justify-center lg:px-0')}>
      <Icon size={17} className="shrink-0" />
      <span className={cx('min-w-0 flex-1 truncate', collapsed && 'lg:hidden')}>{label}</span>
      {count !== undefined && <span className={cx('text-xs text-mute', collapsed && 'lg:hidden')}>{count}</span>}
    </button>
  )
  return (
    <>
      {s.sidebarOpenMobile && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => ui.setSidebarMobile(false)} aria-hidden />}
      <nav aria-label="Main" className={cx(
        'fixed inset-y-0 left-0 z-50 flex w-[290px] max-w-[86vw] flex-col border-r border-line bg-bg transition-transform duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:transition-[width]',
        s.sidebarOpenMobile ? 'translate-x-0' : '-translate-x-full', collapsed ? 'lg:w-[64px]' : 'lg:w-[280px]')}>
        <div className={cx('flex h-14 shrink-0 items-center justify-between px-3', collapsed && 'lg:flex-col lg:h-auto lg:gap-1 lg:py-3')}>
          <button onClick={ui.newIdea} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1" aria-label="MATHEMA — home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-[rgb(var(--surface))]"><Sigma size={17} /></span>
            <span className={cx('serif text-[19px] font-medium tracking-[0.12em]', collapsed && 'lg:hidden')}>MATHEMA</span>
          </button>
          <IconBtn label={collapsed ? t('expand') : t('collapse')} onClick={ui.toggleSidebar} className="hidden lg:inline-flex">{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</IconBtn>
          <IconBtn label="Close" onClick={() => ui.setSidebarMobile(false)} className="lg:hidden"><X size={18} /></IconBtn>
        </div>
        <div className="px-2 pb-2">
          <button onClick={ui.newIdea} className={cx('flex h-10 w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium transition-colors hover:border-accent/60', collapsed && 'lg:justify-center lg:px-0')} title={t('newIdea')}>
            <Plus size={17} className="text-accent" /><span className={cx(collapsed && 'lg:hidden')}>{t('newIdea')}</span>
          </button>
        </div>
        <div className={cx('px-2 pb-2', collapsed && 'lg:hidden')}>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input value={s.searchQuery} onChange={(e) => { ui.setSearch(e.target.value); if (e.target.value && s.view !== 'search') ui.setView('search') }} placeholder={t('search')} aria-label={t('search')}
              className="h-10 w-full rounded-lg bg-sunk/70 pl-9 pr-3 text-sm outline-none placeholder:text-mute focus:bg-surface focus:ring-1 focus:ring-accent/60" />
          </div>
        </div>
        {collapsed && <div className="hidden px-2 pb-1 lg:block"><Item active={s.view === 'search'} icon={Search} label={t('search')} onClick={() => ui.setView('search')} /></div>}
        <div className="scroll min-h-0 flex-1 px-2">
          <div className="space-y-0.5">{nav.map((n) => <Item key={n.v} active={s.view === n.v} icon={n.icon} label={t(n.label)} count={n.count} onClick={() => ui.setView(n.v)} />)}</div>
          <div className={cx('mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute', collapsed && 'lg:hidden')}>{t('recent')}</div>
          <ul className={cx('space-y-0.5 pb-3', collapsed && 'lg:hidden')}>
            {db.conversations.length === 0 && <li className="px-3 py-2 text-[13px] text-mute">{t('noConv')}</li>}
            {db.conversations.slice(0, 12).map((c) => (
              <li key={c.id}><button onClick={() => ui.openConversation(c.id)} aria-current={s.view === 'chat' && s.activeConvId === c.id ? 'true' : undefined}
                className={cx('flex min-h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px]', s.view === 'chat' && s.activeConvId === c.id ? 'bg-sunk font-medium' : 'text-ink/75 hover:bg-sunk/70')}>
                <MessageSquare size={14} className="shrink-0 text-mute" /><span className="truncate">{c.title}</span></button></li>))}
          </ul>
        </div>
        <div className="space-y-0.5 border-t border-line p-2">
          {srv.user?.role === 'admin' && <Item active={s.view === 'admin'} icon={ShieldCheck} label="Admin" onClick={() => ui.setView('admin')} />}
          {srv.available && !srv.user && <Item active={false} icon={LogIn} label={s.lang === 'es' ? 'Iniciar sesión' : 'Sign in'} onClick={() => { ui.setAuthOpen(true); ui.setSidebarMobile(false) }} />}
          {srv.user && <div className={cx('truncate px-3 py-1 text-[12px] text-mute', collapsed && 'lg:hidden')} title={srv.user.email}>{srv.user.email}{srv.sync === 'saving' ? ' · …' : srv.sync === 'error' ? ' · ⚠ sync' : ''}</div>}
          {srv.available && <Item active={s.view === 'pricing'} icon={CreditCard} label={s.lang === 'es' ? 'Planes' : 'Plans'} onClick={() => ui.setView('pricing')} />}
          {srv.user && <Item active={false} icon={MessageSquarePlus} label={s.lang === 'es' ? 'Enviar feedback' : 'Send feedback'} onClick={() => { ui.setFeedbackOpen(true); ui.setSidebarMobile(false) }} />}
          <Item active={s.view === 'settings'} icon={Settings} label={t('settings')} onClick={() => ui.setView('settings')} />
          <div className={cx('flex gap-3 px-3 pb-1 pt-1 text-[11px] text-mute', collapsed && 'lg:hidden')}><button className="hover:text-ink hover:underline" onClick={() => ui.openLegal('terms')}>{s.lang === 'es' ? 'Términos' : 'Terms'}</button><button className="hover:text-ink hover:underline" onClick={() => ui.openLegal('privacy')}>{s.lang === 'es' ? 'Privacidad' : 'Privacy'}</button><button className="hover:text-ink hover:underline" onClick={() => ui.openLegal('ai')}>{s.lang === 'es' ? 'Aviso IA' : 'AI notice'}</button></div>
        </div>
      </nav>
    </>
  )
}
