import { ArrowUpRight, BarChart3, Lightbulb, Network, Sigma, TrendingUp, Waves } from 'lucide-react'
import { EXAMPLES } from '../../core/examples'
import { models, ui, useStore, useT } from '../../store/store'
import { tr } from '../../core/text'

const ICONS = { sigma: Sigma, trend: TrendingUp, wave: Waves, bars: BarChart3, network: Network, idea: Lightbulb, rocket: Sigma }
const prefill = (s: string) => window.dispatchEvent(new CustomEvent('mathema:prefill', { detail: s }))

export default function Welcome() {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
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
        {(['math', 'idea'] as const).map((g) => (
          <div key={g} className={g === 'idea' ? 'mt-6' : ''}>
            <div className="mb-2 px-1 text-xs text-mute">{g === 'math' ? tr(lang, 'When you already have equations, data or numbers — solved exactly, no AI', 'Cuando ya tenés ecuaciones, datos o números: se resuelve exacto, sin IA') : tr(lang, 'When all you have is a vague idea — this is the model the system proposes (a hypothesis you can adjust)', 'Cuando solo tenés una idea vaga: este es el modelo que propone el sistema (una hipótesis que podés ajustar)')}</div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {EXAMPLES.filter((e) => e.group === g).map((e) => {
                const Icon = ICONS[e.icon]
                return (
                  <button key={e.id} onClick={() => models.openExample(e.id)} className="group flex flex-col items-start gap-1.5 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/50">
                    <div className="flex w-full items-center justify-between text-mute"><Icon size={18} /><ArrowUpRight size={15} className="opacity-0 transition-opacity group-hover:opacity-100" /></div>
                    <div className={g === 'idea' ? 'serif text-[15px] italic leading-snug' : 'serif text-lg leading-tight'}>{tr(lang, e.title[0], e.title[1])}</div>
                    <div className="text-[12.5px] leading-snug text-mute">{tr(lang, e.sub[0], e.sub[1])}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <button onClick={() => ui.setView('universe')} className="mt-3 inline-flex items-center gap-1.5 px-1 text-[13px] text-mute hover:text-ink"><Network size={14} />{tr(lang, 'Knowledge network: typed, justified connections between models', 'Red de conocimiento: conexiones justificadas entre modelos')}</button>
        <div className="mb-2 mt-6 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{tr(lang, 'Or try an idea', 'O probá una idea')}</div>
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => <button key={p} onClick={() => prefill(p)} className="min-h-9 rounded-full border border-line px-3.5 py-1.5 text-left text-[13px] text-mute transition-colors hover:border-accent/50 hover:text-ink">{p}</button>)}
        </div>
        <p className="serif mt-10 text-center text-[15px] italic text-mute">{t('principle')}</p>
      </div>
    </div>
  )
}
