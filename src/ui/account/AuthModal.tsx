import { useState } from 'react'
import { Btn, Modal, cx } from '../common'
import { server, ui, useStore } from '../../store/store'
import { tr } from '../../core/text'

export default function AuthModal() {
  const open = useStore((s) => s.ui.authOpen)
  const lang = useStore((s) => s.ui.lang)
  const signupMode = useStore((s) => s.server.signupMode)
  const signup = signupMode !== 'closed'
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('')
  const [invite, setInvite] = useState(''), [terms, setTerms] = useState(false)
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const L = (en: string, es: string) => tr(lang, en, es)
  const close = () => { ui.setAuthOpen(false); setErr(null); setPassword('') }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    const msg = await server.authenticate(mode, email, password, name, mode === 'register' ? { inviteCode: invite, acceptTerms: terms } : {})
    setBusy(false)
    if (msg) setErr(msg); else close()
  }
  const field = 'h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent'
  return (
    <Modal open={open} onClose={close} title={mode === 'login' ? L('Sign in', 'Iniciar sesión') : L('Create account', 'Crear cuenta')}>
      <form onSubmit={submit} className="grid gap-3">
        {mode === 'register' && <input className={field} placeholder={L('Name (optional)', 'Nombre (opcional)')} aria-label={L('Name', 'Nombre')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
        <input className={field} type={mode === 'register' ? 'email' : 'text'} inputMode="email" autoCapitalize="none" spellCheck={false} required placeholder={mode === 'login' ? L('Email or admin username', 'Correo o usuario admin') : 'email@example.com'} aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        <input className={field} type="password" required minLength={mode === 'register' ? 10 : 1} placeholder={mode === 'register' ? L('Password (10+ characters)', 'Contraseña (10+ caracteres)') : L('Password', 'Contraseña')} aria-label={L('Password', 'Contraseña')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {mode === 'register' && signupMode === 'invite' && <input className={field} placeholder={L('Invitation code', 'Código de invitación')} aria-label={L('Invitation code', 'Código de invitación')} value={invite} onChange={(e) => setInvite(e.target.value)} autoCapitalize="characters" spellCheck={false} required />}
        {mode === 'register' && <label className="flex items-start gap-2 text-[13px] text-mute"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" required />
          <span>{L('I accept the', 'Acepto los')} <button type="button" className="text-accent hover:underline" onClick={() => ui.openLegal('terms')}>{L('Terms', 'Términos')}</button> {L('and the', 'y la')} <button type="button" className="text-accent hover:underline" onClick={() => ui.openLegal('privacy')}>{L('Privacy Policy', 'Política de privacidad')}</button>.</span></label>}
        {err && <p role="alert" className="text-sm text-bad">{err}</p>}
        <Btn type="submit" variant="primary" disabled={busy}>{busy ? L('Please wait…', 'Un momento…') : mode === 'login' ? L('Sign in', 'Entrar') : L('Create account', 'Crear cuenta')}</Btn>
        <p className="text-center text-[13px] text-mute">
          {mode === 'login'
            ? (signup ? <>{L('New here?', '¿Primera vez?')} <button type="button" className={cx('text-accent hover:underline')} onClick={() => { setMode('register'); setErr(null) }}>{L('Create an account', 'Crear una cuenta')}</button></> : L('Sign-ups are currently closed.', 'El registro está cerrado por ahora.'))
            : <>{L('Already registered?', '¿Ya tenés cuenta?')} <button type="button" className="text-accent hover:underline" onClick={() => { setMode('login'); setErr(null) }}>{L('Sign in', 'Iniciar sesión')}</button></>}
        </p>
        <p className="text-center text-[11.5px] leading-relaxed text-mute">{L('Your models are stored in your account and synced across devices. Signing out removes them from this device.', 'Tus modelos se guardan en tu cuenta y se sincronizan entre dispositivos. Al cerrar sesión se quitan de este dispositivo.')}</p>
      </form>
    </Modal>
  )
}
