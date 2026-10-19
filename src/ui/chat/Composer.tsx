import { useEffect, useRef, useState } from 'react'
import { ArrowUp, BookOpen, Brain, ClipboardPaste, FlaskConical, Link2, Mic, Paperclip, Plus, Sigma, Square, Table2, X, ChevronDown } from 'lucide-react'
import type { Mode } from '../../core/types'
import { Btn, IconBtn, cx } from '../common'
import { sendMessage, toast, ui, useStore, useT, type AttachedFile } from '../../store/store'
import { tr } from '../../core/text'
import type { Key } from '../../i18n'

export const MODES: { id: Mode; icon: typeof Brain; label: Key; desc: Key }[] = [
  { id: 'understand', icon: BookOpen, label: 'understand', desc: 'understandD' },
  { id: 'model', icon: Sigma, label: 'model', desc: 'modelD' },
  { id: 'experiment', icon: FlaskConical, label: 'experiment', desc: 'experimentD' },
  { id: 'research', icon: Brain, label: 'research', desc: 'researchD' },
  { id: 'connect', icon: Link2, label: 'connect', desc: 'connectD' },
]
const TEXT_EXT = /\.(txt|md|csv|tsv|json|tex|dat)$/i
const SAMPLE_TABLE = 'rainfall_mm,yield_t_ha\n310,3.2\n355,3.6\n402,4.1\n448,4.3\n490,4.6\n525,4.5\n560,4.9\n610,4.8\n655,4.9\n700,4.7'

interface SR { start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; lang: string; interimResults: boolean; continuous: boolean }

export default function Composer({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const mode = useStore((s) => s.ui.mode)
  const processing = useStore((s) => s.ui.processing)
  const selected = useStore((s) => s.db.models.find((m) => m.id === s.ui.selectedModelId))
  const [text, setText] = useState('')
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [menu, setMenu] = useState<null | 'mode' | 'data'>(null)
  const [listening, setListening] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const fileIn = useRef<HTMLInputElement>(null)
  const rec = useRef<SR | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const current = MODES.find((m) => m.id === mode)!

  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }, [text])
  useEffect(() => {
    const onPrefill = (e: Event) => { setText((e as CustomEvent<string>).detail); ta.current?.focus() }
    window.addEventListener('mathema:prefill', onPrefill)
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(null) }
    document.addEventListener('mousedown', onDoc)
    return () => { window.removeEventListener('mathema:prefill', onPrefill); document.removeEventListener('mousedown', onDoc) }
  }, [])

  const submit = () => {
    if (processing || (!text.trim() && !files.length)) return
    const m = text, f = files
    setText(''); setFiles([])
    void sendMessage(m, f)
  }
  const addFiles = async (list: FileList | null) => {
    if (!list) return
    const out: AttachedFile[] = []
    for (const f of Array.from(list)) {
      if (f.size > 8 * 1024 * 1024) { toast(tr(lang, `${f.name} is larger than 8 MB.`, `${f.name} supera 8 MB.`), 'warn'); continue }
      const isText = f.type.startsWith('text/') || f.type === 'application/json' || TEXT_EXT.test(f.name)
      out.push({ name: f.name, size: f.size, text: isText ? (await f.text()).slice(0, 2_000_000) : undefined })
    }
    setFiles((p) => [...p, ...out])
    if (fileIn.current) fileIn.current.value = ''
  }
  const pasteClip = async () => {
    setMenu(null)
    try {
      const c = await navigator.clipboard.readText()
      if (!c) { toast(tr(lang, 'The clipboard is empty.', 'El portapapeles está vacío.'), 'warn'); return }
      setText((p) => (p ? p + '\n' : '') + c); ta.current?.focus()
    } catch {
      toast(tr(lang, 'Clipboard access was blocked by the browser. Paste with Ctrl/⌘+V into the box instead.', 'El navegador bloqueó el portapapeles. Pegá con Ctrl/⌘+V en el cuadro.'), 'warn')
      ta.current?.focus()
    }
  }
  const mic = () => {
    if (listening) { rec.current?.stop(); return }
    const Ctor = ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => SR) | undefined
    if (!Ctor) { toast(tr(lang, 'Voice dictation is not available in this browser (try Chrome or Safari). You can type or paste instead.', 'El dictado por voz no está disponible en este navegador (probá Chrome o Safari). Podés escribir o pegar.'), 'warn'); return }
    const r = new Ctor()
    r.lang = lang === 'es' ? 'es-ES' : 'en-US'; r.interimResults = false; r.continuous = false
    r.onresult = (e) => { const s = Array.from(e.results).map((x) => x[0].transcript).join(' '); setText((p) => (p ? p + ' ' : '') + s) }
    r.onerror = (e) => { setListening(false); toast(e.error === 'not-allowed' ? tr(lang, 'Microphone permission was denied. Allow it in the browser’s site settings, or type instead.', 'Se denegó el permiso del micrófono. Permitilo en la configuración del sitio, o escribí.') : tr(lang, `Voice input failed (${e.error}).`, `Falló la entrada de voz (${e.error}).`), 'warn') }
    r.onend = () => setListening(false)
    rec.current = r
    try { r.start(); setListening(true) } catch { setListening(false) }
  }

  const hint = mode === 'experiment' || mode === 'understand' || mode === 'research' || mode === 'connect' ? (selected ? `${current && t(current.label)} · ${selected.title}` : undefined) : undefined
  return (
    <div ref={wrap} className={cx('relative mx-auto w-full max-w-3xl px-3 sm:px-4', compact ? 'pb-3' : 'pb-4')}>
      {processing && (
        <div role="status" aria-live="polite" className="fade-in mb-2 flex items-center gap-2 px-2 text-[13px] text-mute">
          <span className="flex gap-1"><i className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" /><i className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent [animation-delay:.2s]" /><i className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent [animation-delay:.4s]" /></span>{processing}
        </div>
      )}
      <div className="rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)] transition-colors focus-within:border-accent/60">
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-3 pt-3">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-1.5 rounded-lg bg-sunk py-1 pl-2.5 pr-1 text-xs"><Table2 size={13} className="text-mute" /><span className="max-w-[160px] truncate">{f.name}</span><span className="text-mute">{f.text === undefined ? tr(lang, '(ref. only)', '(solo ref.)') : ''}</span>
                <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, k) => k !== i))} className="flex h-6 w-6 items-center justify-center rounded text-mute hover:bg-line"><X size={13} /></button></li>))}
          </ul>
        )}
        <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={1} aria-label={t('composerPlaceholder')} placeholder={hint ? `${hint} — ${t('composerPlaceholder')}` : t('composerPlaceholder')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
          onPaste={(e) => { const fl = e.clipboardData.files; if (fl.length) { e.preventDefault(); void addFiles(fl) } }}
          className="block max-h-[220px] min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-mute/70" />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          <input ref={fileIn} type="file" multiple hidden onChange={(e) => void addFiles(e.target.files)} accept=".txt,.md,.csv,.tsv,.json,.tex,.dat,.pdf,image/*" />
          <div className="relative">
            <IconBtn label={t('addData')} aria-haspopup="menu" aria-expanded={menu === 'data'} onClick={() => setMenu(menu === 'data' ? null : 'data')}><Plus size={19} /></IconBtn>
            {menu === 'data' && (
              <div role="menu" className="fade-in absolute bottom-12 left-0 z-30 w-60 rounded-xl border border-line bg-surface p-1 shadow-xl">
                {[
                  { i: Paperclip, l: t('attach'), f: () => { setMenu(null); fileIn.current?.click() } },
                  { i: ClipboardPaste, l: t('paste'), f: pasteClip },
                  { i: Table2, l: tr(lang, 'Insert a sample data table', 'Insertar una tabla de ejemplo'), f: () => { setMenu(null); setText((p) => (p ? p + '\n' : '') + SAMPLE_TABLE) } },
                ].map((o) => <button key={o.l} role="menuitem" onClick={o.f} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-sunk"><o.i size={16} className="text-mute" />{o.l}</button>)}
              </div>
            )}
          </div>
          <IconBtn label={t('attach')} onClick={() => fileIn.current?.click()} className="hidden sm:inline-flex"><Paperclip size={18} /></IconBtn>
          <div className="relative ml-1">
            <button aria-haspopup="menu" aria-expanded={menu === 'mode'} aria-label={`${t('mode')}: ${t(current.label)}`} onClick={() => setMenu(menu === 'mode' ? null : 'mode')}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 text-[13px] font-medium text-accent hover:opacity-90"><current.icon size={15} />{t(current.label)}<ChevronDown size={14} /></button>
            {menu === 'mode' && (
              <div role="menu" className="fade-in absolute bottom-12 left-0 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-1 shadow-xl">
                {MODES.map((m) => (
                  <button key={m.id} role="menuitemradio" aria-checked={mode === m.id} onClick={() => { ui.setMode(m.id); setMenu(null) }} className={cx('flex min-h-12 w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-sunk', mode === m.id && 'bg-accent-soft')}>
                    <m.icon size={17} className={cx('mt-0.5', mode === m.id ? 'text-accent' : 'text-mute')} /><span><span className="block text-sm font-medium">{t(m.label)}</span><span className="block text-xs text-mute">{t(m.desc)}</span></span>
                  </button>))}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <IconBtn label={listening ? tr(lang, 'Stop dictation', 'Detener dictado') : t('mic')} aria-pressed={listening} onClick={mic} className={cx(listening && 'bg-[rgb(var(--bad)/.12)] text-bad')}><Mic size={18} /></IconBtn>
            <Btn variant="primary" aria-label={t('send')} onClick={submit} disabled={!!processing || (!text.trim() && !files.length)} className="ml-1 h-10 w-10 rounded-xl px-0">{processing ? <Square size={14} fill="currentColor" /> : <ArrowUp size={19} />}</Btn>
          </div>
        </div>
      </div>
      <p className="mt-2 hidden px-2 text-center text-[11.5px] text-mute sm:block">{tr(lang, 'Local heuristic analysis — no language model is called. Results are labelled by provenance; hypotheses are not evidence.', 'Análisis heurístico local — no se llama a ningún modelo de lenguaje. Los resultados indican su procedencia; las hipótesis no son evidencia.')}</p>
    </div>
  )
}
