import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Moon, RotateCcw, Sun, Trash2 } from 'lucide-react'
import { Btn, Confirm, EmptyState, IconBtn, Label, cx } from '../common'
import { PageShell } from './Lists'
import { records, server, ui, useStore, useT } from '../../store/store'
import { repository } from '../../services/repository'
import { tr, termSet, normName } from '../../core/text'
import { kindLabel } from './Workspace'

export function SourcesView() {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const db = useStore((s) => s.db)
  const focusId = useStore((s) => s.ui.focusId)
  const [title, setTitle] = useState(''), [cite, setCite] = useState(''), [note, setNote] = useState('')
  const [del, setDel] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLElement>())
  useEffect(() => { if (focusId) { refs.current.get(focusId)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(ui.clearFocus, 2500) } }, [focusId])
  return (
    <PageShell title={t('sources')} sub={tr(lang, 'Where every claim comes from. Reference entries are context you add — MATHEMA does not verify them.', 'De dónde sale cada afirmación. Las referencias son contexto que agregás — MATHEMA no las verifica.')}>
      <section className="mb-6 rounded-xl border border-line bg-surface p-4">
        <Label>{tr(lang, 'Add a reference or note', 'Agregar una referencia o nota')}</Label>
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; records.addSource({ title: title.trim(), kind: 'reference', citation: cite.trim() || undefined, note: note.trim() || tr(lang, 'Added by you. Not verified by MATHEMA.', 'Agregada por vos. MATHEMA no la verificó.') }); setTitle(''); setCite(''); setNote('') }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr(lang, 'Title', 'Título')} aria-label="Title" className="h-10 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
          <input value={cite} onChange={(e) => setCite(e.target.value)} placeholder={tr(lang, 'Citation / URL (optional)', 'Cita / URL (opcional)')} aria-label="Citation" className="h-10 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr(lang, 'Why it matters (optional)', 'Por qué importa (opcional)')} aria-label="Note" className="h-10 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
          <div><Btn type="submit" variant="outline" disabled={!title.trim()}>{tr(lang, 'Add source', 'Agregar fuente')}</Btn></div>
        </form>
      </section>
      {db.sources.length === 0 ? <EmptyState title={t('empty')} /> : (
        <ul className="space-y-3">{db.sources.map((s) => { const used = db.models.filter((m) => m.sourceIds.includes(s.id)); return (
          <li key={s.id} ref={(el) => { if (el) refs.current.set(s.id, el) }} className={cx('rounded-xl border bg-surface p-4 transition-colors', focusId === s.id ? 'border-accent ring-2 ring-accent/30' : 'border-line')}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{s.kind}{s.fileName ? ` · ${s.fileName}` : ''}{s.fileSize ? ` · ${(s.fileSize / 1024).toFixed(1)} KB` : ''}</div><div className="serif text-lg leading-snug">{s.title}</div></div>
              <IconBtn label={t('delete')} className="-mr-2 -mt-1" onClick={() => setDel(s.id)}><Trash2 size={16} /></IconBtn></div>
            {s.citation && <p className="mt-1 text-[13px] italic text-mute">{s.citation}</p>}
            <p className="mt-1.5 text-[13px] text-mute">{s.note}</p>
            {s.excerpt && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-sunk p-2.5 font-mono text-[11.5px] text-mute">{s.excerpt}</pre>}
            {used.length > 0 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]"><span className="text-mute">{tr(lang, 'Used by', 'Usada por')}:</span>{used.map((m) => <button key={m.id} className="text-accent hover:underline" onClick={() => ui.selectModel(m.id, { workspace: true })}>{m.title}</button>)}</div>}
          </li>) })}</ul>)}
      <Confirm open={!!del} title={tr(lang, 'Delete this source?', '¿Eliminar esta fuente?')} body={tr(lang, 'Models that cite it will lose the reference.', 'Los modelos que la citan perderán la referencia.')} onNo={() => setDel(null)} onYes={() => { if (del) records.removeSource(del); setDel(null) }} />
    </PageShell>
  )
}

export function SettingsView() {
  const t = useT()
  const s = useStore((x) => x.ui)
  const srv = useStore((x) => x.server)
  const [confirm, setConfirm] = useState(false)
  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3.5 first:border-t-0"><span className="text-sm">{k}</span><div>{children}</div></div>
  const Seg = <T extends string>({ value, opts, onChange }: { value: T; opts: [T, string][]; onChange: (v: T) => void }) => (
    <div role="group" className="flex rounded-lg border border-line p-0.5">{opts.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)} className={cx('h-9 rounded-md px-3.5 text-sm font-medium', value === v ? 'bg-accent-soft text-accent' : 'text-mute hover:text-ink')}>{l}</button>)}</div>
  )
  return (
    <PageShell title={t('settings')}>
      <section className="rounded-xl border border-line bg-surface px-4">
        <Row k={t('language')}><Seg value={s.lang} opts={[['en', 'English'], ['es', 'Español']]} onChange={ui.setLang} /></Row>
        <Row k={t('theme')}><Seg value={s.theme} opts={[['light', t('light')], ['dark', t('dark')]]} onChange={ui.setTheme} /></Row>
      </section>
      <h2 className="serif mb-2 mt-8 text-xl">{tr(s.lang, 'Account', 'Cuenta')}</h2>
      <section className="rounded-xl border border-line bg-surface px-4 text-sm">
        {!srv.available ? <Row k={tr(s.lang, 'Mode', 'Modo')}><span className="text-right text-mute">{tr(s.lang, 'Static demo: no server detected, so accounts, cloud sync and AI are off. Everything works locally.', 'Demo estática: no se detectó servidor, así que cuentas, sincronización y IA están desactivadas. Todo funciona en local.')}</span></Row>
          : srv.user ? <>
            <Row k={srv.user.email}><span className="text-mute">{srv.user.role === 'admin' ? 'admin · ' : ''}{srv.usage?.plan ?? srv.user.planId}</span></Row>
            <Row k={tr(s.lang, 'AI analyses this month', 'Análisis de IA este mes')}><span className="font-mono text-mute">{srv.usage ? `${srv.usage.used} / ${srv.usage.quota ?? '∞'}` : '…'}</span></Row>
            <Row k={tr(s.lang, 'Cloud sync', 'Sincronización')}><span className="text-mute">{srv.sync === 'saving' ? '…' : srv.sync === 'error' ? tr(s.lang, 'error — will retry on the next change', 'error — se reintentará en el próximo cambio') : tr(s.lang, 'up to date', 'al día')}</span></Row>
            <Row k=""><Btn variant="outline" size="sm" onClick={() => void server.logout()}>{tr(s.lang, 'Sign out', 'Cerrar sesión')}</Btn></Row></>
          : <Row k={tr(s.lang, 'Not signed in', 'Sin sesión')}><Btn variant="primary" size="sm" onClick={() => ui.setAuthOpen(true)}>{tr(s.lang, 'Sign in / create account', 'Iniciar sesión / crear cuenta')}</Btn></Row>}
      </section>
      <h2 className="serif mb-2 mt-8 text-xl">{tr(s.lang, 'System status', 'Estado del sistema')}</h2>
      <section className="rounded-xl border border-line bg-surface px-4 text-sm">
        <Row k={t('aiStatus')}><span className="text-right text-mute">{!srv.available ? t('localAnalyzer') : srv.aiAvailable ? tr(s.lang, 'AI via the MATHEMA server (keys are held by the admin, never in the browser). Equations and data tables are still solved deterministically.', 'IA vía el servidor de MATHEMA (las claves las guarda el admin, nunca el navegador). Las ecuaciones y tablas de datos se siguen resolviendo de forma determinista.') : tr(s.lang, 'Server without an AI key configured — local heuristic analyzer in use.', 'Servidor sin clave de IA configurada — se usa el analizador heurístico local.')}</span></Row>
        <Row k={t('persistence')}><span className="text-right text-mute">{srv.user ? tr(s.lang, 'MySQL (your account) + local cache', 'MySQL (tu cuenta) + caché local') : repository.label}</span></Row>
        <Row k={tr(s.lang, 'Voice dictation', 'Dictado por voz')}><span className="text-right text-mute">{('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) ? tr(s.lang, 'Available (browser will ask for microphone permission)', 'Disponible (el navegador pedirá permiso de micrófono)') : tr(s.lang, 'Not supported by this browser', 'No soportado por este navegador')}</span></Row>
      </section>
      <p className="mt-3 text-xs leading-relaxed text-mute">{tr(s.lang, 'No API key is ever stored in the browser. Keys are managed by the admin on the server.', 'Nunca se guarda una clave de API en el navegador. Las claves las gestiona el admin en el servidor.')}</p>
      <h2 className="serif mb-2 mt-8 text-xl">{t('demoMode')}</h2>
      <div className="flex flex-wrap gap-2">
        <Btn variant="outline" onClick={records.exportJson}><Download size={15} />{t('exportJson')}</Btn>
        <Btn variant="outline" onClick={() => setConfirm(true)}><RotateCcw size={15} />{t('resetDemo')}</Btn>
        <Btn variant="ghost" onClick={() => ui.setTheme(s.theme === 'dark' ? 'light' : 'dark')}>{s.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}{s.theme === 'dark' ? t('light') : t('dark')}</Btn>
      </div>
      <Confirm open={confirm} title={t('resetDemo')} body={tr(s.lang, 'This replaces ALL local data (your models, conversations and sources) with the original demo set.', 'Esto reemplaza TODOS los datos locales (modelos, conversaciones y fuentes) por el conjunto demo original.')} onNo={() => setConfirm(false)} onYes={() => { setConfirm(false); records.resetDemo() }} />
    </PageShell>
  )
}

export function SearchView() {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const q = useStore((s) => s.ui.searchQuery)
  const db = useStore((s) => s.db)
  const res = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return null
    const qs = termSet(needle)
    const has = (txt: string) => txt.toLowerCase().includes(needle) || [...qs.keys()].some((k) => k.length > 3 && normName(txt).includes(k))
    return {
      models: db.models.filter((m) => has(`${m.title} ${m.description} ${m.concepts.join(' ')} ${m.variables.map((v) => v.name).join(' ')}`)),
      conv: db.conversations.filter((c) => has(c.title + ' ' + c.messages.map((m) => m.text).join(' '))),
      sources: db.sources.filter((s) => has(`${s.title} ${s.note} ${s.citation ?? ''}`)),
      exps: db.experiments.filter((e) => has(e.name)),
    }
  }, [q, db])
  const none = res && !res.models.length && !res.conv.length && !res.sources.length && !res.exps.length
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="mb-6"><Label>{title}</Label><ul className="space-y-1">{children}</ul></section>
  const Row = ({ onClick, title, sub }: { onClick: () => void; title: string; sub?: string }) => <li><button onClick={onClick} className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-sunk"><div className="text-sm font-medium">{title}</div>{sub && <div className="line-clamp-1 text-xs text-mute">{sub}</div>}</button></li>
  return (
    <PageShell title={t('search').replace('…', '')}>
      <input autoFocus value={q} onChange={(e) => ui.setSearch(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="mb-6 h-12 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent" />
      {!res && <EmptyState title={tr(lang, 'Search models, variables, conversations, sources and experiments.', 'Buscá modelos, variables, conversaciones, fuentes y experimentos.')} />}
      {none && <EmptyState title={t('empty')} />}
      {res && res.models.length > 0 && <Group title={t('myModels')}>{res.models.map((m) => <Row key={m.id} title={m.title} sub={`${kindLabel(m.kind, lang)} · ${m.description}`} onClick={() => ui.selectModel(m.id, { workspace: true })} />)}</Group>}
      {res && res.conv.length > 0 && <Group title={t('recent')}>{res.conv.map((c) => <Row key={c.id} title={c.title} onClick={() => ui.openConversation(c.id)} />)}</Group>}
      {res && res.sources.length > 0 && <Group title={t('sources')}>{res.sources.map((s) => <Row key={s.id} title={s.title} sub={s.note} onClick={() => ui.openSource(s.id)} />)}</Group>}
      {res && res.exps.length > 0 && <Group title={t('experiments')}>{res.exps.map((e) => <Row key={e.id} title={e.name} onClick={() => ui.setView('experiments')} />)}</Group>}
    </PageShell>
  )
}
