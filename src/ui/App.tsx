import { useEffect } from 'react'
import { Menu, PanelRight } from 'lucide-react'
import Sidebar from './layout/Sidebar'
import Composer from './chat/Composer'
import Thread from './chat/Thread'
import Welcome from './chat/Welcome'
import Workspace from './models/Workspace'
import DetailsPanel from './models/DetailsPanel'
import Universe from './universe/Universe'
import { ExperimentsView, ModelsView } from './models/Lists'
import { SearchView, SettingsView, SourcesView } from './models/Misc'
import { IconBtn, Toast, cx } from './common'
import Admin from './admin/Admin'
import AuthModal from './account/AuthModal'
import { server, ui, useStore, useT } from '../store/store'

export default function App() {
  const t = useT()
  const s = useStore((x) => x.ui)
  const db = useStore((x) => x.db)
  const model = db.models.find((m) => m.id === s.selectedModelId)
  const conv = db.conversations.find((c) => c.id === s.activeConvId)
  useEffect(() => { document.documentElement.lang = s.lang }, [s.lang])
  useEffect(() => { void server.init() }, [])
  // If the selected model disappears (deleted), fall back to conversation.
  useEffect(() => { if (s.selectedModelId && !model) ui.selectModel(null) }, [s.selectedModelId, model])

  const inChat = s.view === 'chat'
  const showWorkspace = inChat && model && s.tab === 'workspace'
  const showDetails = inChat && !!model && s.detailsOpen

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-ink">
      <a href="#main" className="sr-only z-[100] rounded bg-surface p-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Skip to content</a>
      <Sidebar />
      <main id="main" className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line/70 px-2 sm:px-3">
          <IconBtn label={t('expand')} className="lg:hidden" onClick={() => ui.setSidebarMobile(true)}><Menu size={20} /></IconBtn>
          {inChat && model ? (
            <div role="tablist" aria-label="View" className="flex rounded-lg border border-line p-0.5">
              {(['conversation', 'workspace'] as const).map((tab) => (
                <button key={tab} role="tab" aria-selected={s.tab === tab} onClick={() => ui.setTab(tab)} className={cx('h-8 rounded-md px-3 text-[13px] font-medium transition-colors', s.tab === tab ? 'bg-accent-soft text-accent' : 'text-mute hover:text-ink')}>{t(tab)}</button>
              ))}
            </div>
          ) : <span className="serif px-2 text-lg tracking-[0.12em] lg:hidden">MATHEMA</span>}
          <div className="ml-auto flex items-center">
            {inChat && model && !s.detailsOpen && <IconBtn label={t('openPanel')} onClick={() => ui.setDetails(true)}><PanelRight size={19} /></IconBtn>}
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          {s.view === 'universe' ? <Universe /> : s.view === 'models' ? <ModelsView /> : s.view === 'experiments' ? <ExperimentsView /> : s.view === 'sources' ? <SourcesView /> : s.view === 'settings' ? <SettingsView /> : s.view === 'search' ? <SearchView /> : s.view === 'admin' ? <Admin /> : (
            <>
              <div className="scroll flex min-h-0 flex-1 flex-col">
                {showWorkspace && model ? <Workspace key={`${model.id}:${model.version}`} model={model} /> : conv ? <Thread conv={conv} /> : <Welcome />}
              </div>
              <div className="shrink-0 bg-gradient-to-t from-bg via-bg to-transparent pt-2"><Composer /></div>
            </>
          )}
        </div>
      </main>
      {showDetails && model && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 xl:hidden" onClick={() => ui.setDetails(false)} aria-hidden />
          <div className="fade-in fixed inset-y-0 right-0 z-50 w-[min(400px,92vw)] border-l border-line shadow-2xl xl:static xl:z-auto xl:w-[380px] xl:shrink-0 xl:shadow-none">
            <DetailsPanel model={model} onClose={() => ui.setDetails(false)} />
          </div>
        </>
      )}
      <AuthModal />
      <Toast />
    </div>
  )
}
