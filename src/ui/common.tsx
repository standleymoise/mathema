import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import katex from 'katex'
import type { Provenance, ValidationStatus } from '../core/types'
import { provLabel } from '../core/analyzer'
import { useStore, useT } from '../store/store'

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ')

export function Btn({ variant = 'ghost', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger'; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none select-none whitespace-nowrap',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-3.5 text-sm min-w-10',
        variant === 'primary' && 'bg-accent text-[rgb(var(--surface))] hover:opacity-90',
        variant === 'ghost' && 'text-ink/80 hover:bg-sunk',
        variant === 'outline' && 'border border-line text-ink hover:bg-sunk',
        variant === 'danger' && 'bg-bad text-white hover:opacity-90',
        className,
      )}
    />
  )
}
export function IconBtn({ label, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...p} aria-label={label} title={label} className={cx('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-mute transition-colors hover:bg-sunk hover:text-ink disabled:opacity-40', className)}>
      {children}
    </button>
  )
}

export function Eq({ latex, display = true }: { latex: string; display?: boolean }) {
  let html = ''
  try { html = katex.renderToString(latex, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' }) } catch { html = latex }
  return <span className={display ? 'block' : 'inline'} dangerouslySetInnerHTML={{ __html: html }} />
}

const PROV_STYLE: Record<Provenance, string> = {
  source: 'bg-[rgb(var(--ok)/.12)] text-ok', derived: 'bg-[rgb(var(--ok)/.12)] text-ok', validated: 'bg-[rgb(var(--ok)/.18)] text-ok',
  estimated: 'bg-sunk text-ink', 'user-assumption': 'bg-sunk text-ink', 'system-hypothesis': 'bg-[rgb(var(--warn)/.14)] text-warn', simulated: 'bg-[rgb(var(--accent)/.12)] text-accent',
}
export function ProvBadge({ p }: { p: Provenance }) {
  const lang = useStore((s) => s.ui.lang)
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4', PROV_STYLE[p])}>{provLabel(p, lang)}</span>
}
export function ValidationBadge({ s }: { s: ValidationStatus }) {
  const lang = useStore((x) => x.ui.lang)
  const m: Record<ValidationStatus, [string, string, string]> = {
    unvalidated: ['Unvalidated', 'Sin validar', 'text-warn'], 'demo-data': ['Demo data', 'Datos demo', 'text-warn'], 'simulated-only': ['Simulated only', 'Solo simulado', 'text-warn'],
    'fit-to-data': ['Fit to data (not validated)', 'Ajustado a datos (no validado)', 'text-mute'], 'empirically-validated': ['Empirically validated', 'Validado empíricamente', 'text-ok'],
  }
  const [en, es, c] = m[s]
  return <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium', c)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{lang === 'es' ? es : en}</span>
}
export const Label = ({ children }: { children: ReactNode }) => <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{children}</div>

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => { window.removeEventListener('keydown', k); prev?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className="fade-in w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 shadow-xl outline-none sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id={id} className="serif text-xl">{title}</h2>
          <IconBtn label="Close" onClick={onClose} className="-mr-2 -mt-2"><X size={18} /></IconBtn>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Confirm({ open, title, body, onYes, onNo, danger = true }: { open: boolean; title: string; body: string; onYes: () => void; onNo: () => void; danger?: boolean }) {
  const t = useT()
  return (
    <Modal open={open} onClose={onNo} title={title}>
      <p className="mb-5 text-sm leading-relaxed text-mute">{body}</p>
      <div className="flex justify-end gap-2">
        <Btn variant="outline" onClick={onNo}>{t('cancel')}</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} onClick={onYes}>{t('confirm')}</Btn>
      </div>
    </Modal>
  )
}

export function PromptModal({ open, title, initial, onSubmit, onClose }: { open: boolean; title: string; initial: string; onSubmit: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(initial)
  const t = useT()
  useEffect(() => { if (open) setV(initial) }, [open, initial])
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onSubmit(v); onClose() } }}>
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label={title} className="mb-4 h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
        <div className="flex justify-end gap-2"><Btn type="button" variant="outline" onClick={onClose}>{t('cancel')}</Btn><Btn type="submit" variant="primary">{t('confirm')}</Btn></div>
      </form>
    </Modal>
  )
}

export function Toast() {
  const toast = useStore((s) => s.ui.toast)
  if (!toast) return null
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex justify-center px-4">
      <div className={cx('fade-in rounded-full border bg-surface px-4 py-2 text-sm shadow-lg', toast.tone === 'bad' ? 'border-bad text-bad' : toast.tone === 'warn' ? 'border-warn text-warn' : 'border-line text-ink')}>{toast.text}</div>
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 px-6 py-16 text-center">
      <div className="serif text-xl">{title}</div>
      {hint && <p className="text-sm text-mute">{hint}</p>}
      {action}
    </div>
  )
}

export function Disclosure({ title, children, defaultOpen = false, badge }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-line first:border-t-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 py-3 text-left text-sm font-medium">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-mute">{badge}<span className={cx('transition-transform', open && 'rotate-90')}>›</span></span>
      </button>
      {open && <div className="fade-in pb-4">{children}</div>}
    </div>
  )
}
