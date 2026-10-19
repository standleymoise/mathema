import { ArrowUpRight, Network, Sigma, TrendingUp } from 'lucide-react'
import { ui, useStore, useT } from '../../store/store'
import { tr } from '../../core/text'

const prefill = (s: string) => window.dispatchEvent(new CustomEvent('mathema:prefill', { detail: s }))

export default function Welcome() {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const examples = [
    { icon: Sigma, tag: 'A', title: tr(lang, 'Quantitative model', 'Modelo cuantitativo'), sub: tr(lang, 'Yield vs temperature — editable equation & sliders', 'Rendimiento vs temperatura — ecuación editable y controles'), go: () => ui.selectModel('mdl_demo_temp', { workspace: true }) },
    { icon: TrendingUp, tag: 'B', title: tr(lang, 'Statistical model', 'Modelo estadístico'), sub: tr(lang, 'Regression with uncertainty bands (demo data)', 'Regresión con bandas de incertidumbre (datos demo)'), go: () => ui.selectModel('mdl_demo_rain', { workspace: true }) },
    { icon: Network, tag: 'C', title: tr(lang, 'Knowledge network', 'Red de conocimiento'), sub: tr(lang, 'Typed, justified connections between models', 'Conexiones tipadas y justificadas entre modelos'), go: () => ui.setView('universe') },
  ]
  const prompts = lang === 'es'
    ? ['Más lluvia aumenta el rendimiento del cultivo, pero el calor excesivo reduce el rendimiento.', 'y = a*exp(-b*x) + c', 'Quiero maximizar la ganancia con presupuesto limitado entre dos cultivos.', 'La población de abejas crece pero está limitada por la cantidad de flores.']
    : ['More rain increases crop yield, but excessive heat reduces yield.', 'y = a*exp(-b*x) + c', 'I want to maximize profit with a limited budget across two crops.', 'A bee population grows over time but is limited by the number of flowers.']
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pb-6 pt-10 sm:pt-16">
      <div className="fade-in mb-10 text-center">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-[rgb(var(--surface))]"><Sigma size={22} /></div>
        <h1 className="serif text-[40px] leading-[1.1] tracking-tight sm:text-6xl">{t('tagline1')}</h1>
        <p className="mx-auto mt-3 max-w-md text-base text-mute sm:text-lg">{t('tagline2')}</p>
      </div>
      <div className="fade-in [animation-delay:80ms]">
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{t('tryExamples')} · {t('demoData')}</div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {examples.map((e) => (
            <button key={e.tag} onClick={e.go} className="group flex flex-col items-start gap-1.5 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/50">
              <div className="flex w-full items-center justify-between text-mute"><e.icon size={18} /><ArrowUpRight size={15} className="opacity-0 transition-opacity group-hover:opacity-100" /></div>
              <div className="serif text-lg leading-tight">{e.title}</div>
              <div className="text-[12.5px] leading-snug text-mute">{e.sub}</div>
            </button>
          ))}
        </div>
        <div className="mb-2 mt-6 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{tr(lang, 'Or try an idea', 'O probá una idea')}</div>
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => <button key={p} onClick={() => prefill(p)} className="min-h-9 rounded-full border border-line px-3.5 py-1.5 text-left text-[13px] text-mute transition-colors hover:border-accent/50 hover:text-ink">{p}</button>)}
        </div>
        <p className="serif mt-10 text-center text-[15px] italic text-mute">{t('principle')}</p>
      </div>
    </div>
  )
}
