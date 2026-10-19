import { RefreshCw, WifiOff } from 'lucide-react'
import { applyUpdate, usePwa } from '../pwa'
import { Btn } from './common'
import { useStore } from '../store/store'
import { tr } from '../core/text'

/** Top-of-screen notices: a new version is waiting (user decides when to reload) and offline mode. */
export default function PwaBanner() {
  const p = usePwa()
  const lang = useStore((s) => s.ui.lang)
  if (!p.updateReady && p.online) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[85] flex flex-col items-center gap-2 px-3">
      {!p.online && (
        <div role="status" className="fade-in pointer-events-auto flex max-w-lg items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] shadow-lg">
          <WifiOff size={16} className="mt-0.5 shrink-0 text-warn" />
          <span>{tr(lang, 'You are offline. Your models are saved on this device; AI analysis and cloud sync resume when you reconnect.', 'Estás sin conexión. Tus modelos se guardan en este dispositivo; el análisis con IA y la sincronización se reanudan al reconectar.')}</span>
        </div>
      )}
      {p.updateReady && (
        <div role="status" className="fade-in pointer-events-auto flex items-center gap-3 rounded-xl border border-accent/50 bg-surface px-3.5 py-2 text-[13px] shadow-lg">
          <RefreshCw size={15} className="shrink-0 text-accent" />
          <span>{tr(lang, 'A new version of MATHEMA is ready.', 'Hay una nueva versión de MATHEMA lista.')}</span>
          <Btn size="sm" variant="primary" onClick={applyUpdate}>{tr(lang, 'Update', 'Actualizar')}</Btn>
        </div>
      )}
    </div>
  )
}
