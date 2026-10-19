import { useState } from 'react'
import { Btn, Modal, cx } from '../common'
import { server, toast, ui, useStore } from '../../store/store'
import { tr } from '../../core/text'

export default function FeedbackModal() {
  const open = useStore((s) => s.ui.feedbackOpen)
  const lang = useStore((s) => s.ui.lang)
  const view = useStore((s) => s.ui.view)
  const [kind, setKind] = useState('idea'), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const L = (en: string, es: string) => tr(lang, en, es)
  const close = () => ui.setFeedbackOpen(false)
  return (
    <Modal open={open} onClose={close} title={L('Send feedback', 'Enviar feedback')}>
      <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const ok = await server.sendFeedback(kind, msg, view); setBusy(false); if (ok) { toast(L('Thank you! We read every message.', '¡Gracias! Leemos cada mensaje.')); setMsg(''); close() } else toast(L('Could not send. Are you signed in?', 'No se pudo enviar. ¿Iniciaste sesión?'), 'bad') }}>
        <div role="group" aria-label={L('Type', 'Tipo')} className="flex rounded-lg border border-line p-0.5">
          {([['idea', L('Idea', 'Idea')], ['bug', L('Problem', 'Problema')], ['other', L('Other', 'Otro')]] as const).map(([k, l]) => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)} className={cx('h-9 flex-1 rounded-md text-sm font-medium', kind === k ? 'bg-accent-soft text-accent' : 'text-mute')}>{l}</button>)}
        </div>
        <textarea required minLength={3} maxLength={2000} rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} aria-label={L('Your message', 'Tu mensaje')} placeholder={L('What happened, or what would make MATHEMA better for you?', '¿Qué pasó, o qué haría mejor a MATHEMA para vos?')} className="w-full rounded-lg border border-line bg-bg p-3 text-sm outline-none focus:border-accent" />
        <Btn type="submit" variant="primary" disabled={busy || msg.trim().length < 3}>{L('Send', 'Enviar')}</Btn>
      </form>
    </Modal>
  )
}
