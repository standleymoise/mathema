// Example gallery. Two groups: explicit math (equations, data, programs) and vague everyday ideas
// shown as the model the system would propose. All numbers are illustrative placeholders (demo).
import type { GraphSpec, Lang, MathModel, Variable } from './types'
import { demoExperiments, demoModels, demoRelations, demoSources } from './demo'
import type { DB } from './types'
import { tr } from './text'

export interface Example {
  id: string
  group: 'math' | 'idea'
  icon: 'sigma' | 'trend' | 'rocket' | 'bars' | 'network' | 'wave' | 'idea'
  title: [string, string]
  sub: [string, string]
  /** Built on demand in the user's language when the example is not already in their library. */
  build?: (lang: Lang) => MathModel
}

const T0 = '2026-10-01T09:00:00.000Z'
const circle = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 310 + 230 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: 170 + 130 * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }))
const vr = (o: Partial<Variable> & Pick<Variable, 'id' | 'name' | 'symbol' | 'definition' | 'unit' | 'role'>): Variable => ({ provenance: 'system-hypothesis', ...o })

type Base = Pick<MathModel, 'id' | 'title' | 'description' | 'originalInput' | 'kind' | 'method' | 'methodRationale' | 'concepts' | 'variables' | 'equations' | 'assumptions' | 'limitations' | 'hypotheses' | 'spec' | 'validation'> & Partial<MathModel>
const model = (b: Base): MathModel => ({ version: 1, isDemo: true, createdAt: T0, updatedAt: T0, sourceIds: [], scenarios: [], versions: [], ...b })
const assumed = (lang: Lang) => ({ id: 'as_demo', text: tr(lang, 'All numbers are starting guesses, not measurements. Adjust them to your own situation.', 'Todos los números son valores iniciales supuestos, no mediciones. Ajustalos a tu situación.'), provenance: 'system-hypothesis' as const })

const predatorPrey = (lang: Lang): MathModel => {
  const L = (en: string, es: string) => tr(lang, en, es)
  const dx = 'a*x-b*x*y', dy = '-c*y+d*x*y'
  return model({
    id: 'mdl_demo_lv', title: L('Predators and prey (Lotka–Volterra)', 'Depredadores y presas (Lotka–Volterra)'),
    description: L('Two coupled equations: prey grow and are eaten, predators starve without prey. Demo values.', 'Dos ecuaciones acopladas: las presas crecen y son comidas; los depredadores mueren sin presas. Valores demo.'),
    originalInput: L('dx/dt = a x − b x y,  dy/dt = −c y + d x y', 'dx/dt = a x − b x y,  dy/dt = −c y + d x y'),
    kind: 'dynamic', method: L('Coupled ordinary differential equations (RK4)', 'Ecuaciones diferenciales acopladas (RK4)'),
    methodRationale: L('Two quantities that change each other over time form a 2-state ODE system.', 'Dos cantidades que se afectan entre sí en el tiempo forman un sistema de EDO de dos estados.'),
    concepts: ['predator', 'prey', 'oscillation'],
    variables: [
      vr({ id: 'l_a', name: L('Prey birth rate', 'Natalidad de presas'), symbol: 'a', definition: L('How fast prey multiply when no predators are around', 'Qué tan rápido se multiplican las presas sin depredadores'), unit: '1/t', value: 1, min: 0.2, max: 2, step: 0.05, role: 'parameter' }),
      vr({ id: 'l_b', name: L('Capture rate', 'Tasa de captura'), symbol: 'b', definition: L('How often a predator catches prey it meets', 'Qué tan seguido un depredador captura a la presa que encuentra'), unit: '—', value: 0.1, min: 0.02, max: 0.3, step: 0.005, role: 'parameter' }),
      vr({ id: 'l_c', name: L('Predator death rate', 'Mortalidad de depredadores'), symbol: 'c', definition: L('How fast predators die when there is nothing to eat', 'Qué tan rápido mueren los depredadores sin comida'), unit: '1/t', value: 1.5, min: 0.3, max: 3, step: 0.05, role: 'parameter' }),
      vr({ id: 'l_d', name: L('Food-to-offspring', 'Conversión de comida en crías'), symbol: 'd', definition: L('How much each catch helps predators reproduce', 'Cuánto ayuda cada captura a que se reproduzcan los depredadores'), unit: '—', value: 0.075, min: 0.01, max: 0.2, step: 0.005, role: 'parameter' }),
      vr({ id: 'l_x0', name: L('Starting prey', 'Presas iniciales'), symbol: 'x0', definition: L('Number of prey at the start', 'Cantidad de presas al inicio'), unit: '', value: 10, min: 1, max: 40, step: 1, role: 'parameter', provenance: 'user-assumption' }),
      vr({ id: 'l_y0', name: L('Starting predators', 'Depredadores iniciales'), symbol: 'y0', definition: L('Number of predators at the start', 'Cantidad de depredadores al inicio'), unit: '', value: 5, min: 1, max: 40, step: 1, role: 'parameter', provenance: 'user-assumption' }),
      vr({ id: 'l_x', name: L('Prey', 'Presas'), symbol: 'x', definition: '', unit: '', role: 'state', provenance: 'simulated' }),
      vr({ id: 'l_y', name: L('Predators', 'Depredadores'), symbol: 'y', definition: '', unit: '', role: 'state', provenance: 'simulated' }),
    ],
    equations: [{ id: 'e1', label: L('Prey', 'Presas'), expr: dx, provenance: 'system-hypothesis', editable: true }, { id: 'e2', label: L('Predators', 'Depredadores'), expr: dy, provenance: 'system-hypothesis', editable: true }],
    assumptions: [assumed(lang), { id: 'as2', text: L('Both populations mix evenly; no seasons, no limit to prey food.', 'Ambas poblaciones se mezclan por igual; sin estaciones ni límite de alimento para las presas.'), provenance: 'system-hypothesis' }],
    limitations: [L('Textbook model; real ecosystems rarely oscillate this regularly.', 'Modelo de libro de texto; los ecosistemas reales rara vez oscilan tan regularmente.')], hypotheses: [],
    spec: { kind: 'dynamic', states: [{ id: 'x', label: L('Prey', 'Presas'), expr: dx, init: 'x0' }, { id: 'y', label: L('Predators', 'Depredadores'), expr: dy, init: 'y0' }], tEnd: 30, tLabel: L('Time', 'Tiempo'), yLabel: L('Population', 'Población') },
    validation: { status: 'simulated-only', notes: L('Simulation only; no observations compared.', 'Solo simulación; sin observaciones comparadas.') },
  })
}

const business = (lang: Lang): MathModel => {
  const L = (en: string, es: string) => tr(lang, en, es)
  const expr = 'max(0, cmax*h/(h+h0) - burn*h^2)'
  return model({
    id: 'mdl_demo_business', title: L('Working more hours, but the business does not grow', 'Trabajo más horas pero mi negocio no crece'),
    description: L('More hours bring customers at first, then returns shrink and exhaustion eats the gains.', 'Más horas traen clientes al principio; luego los retornos bajan y el agotamiento se come las ganancias.'),
    originalInput: L('I work more and more hours but my business is not growing. Why?', 'Trabajo cada vez más horas pero mi negocio no crece. ¿Por qué?'),
    kind: 'function', method: L('Parametric curve with diminishing returns and a fatigue penalty', 'Curva paramétrica con rendimientos decrecientes y penalización por cansancio'),
    methodRationale: L('One input (hours) and one outcome (new customers) with a hump shape.', 'Una entrada (horas) y un resultado (clientes nuevos) con forma de campana.'),
    concepts: ['hours', 'customers', 'fatigue'],
    variables: [
      vr({ id: 'b_h', name: L('Hours per week', 'Horas por semana'), symbol: 'h', definition: L('Time you put into the business each week', 'Tiempo que dedicás al negocio cada semana'), unit: 'h', role: 'input', min: 0, max: 80, provenance: 'user-assumption' }),
      vr({ id: 'b_c', name: L('Best-case customers', 'Clientes en el mejor caso'), symbol: 'cmax', definition: L('Most new customers a month you could win if effort had no limits', 'Máximo de clientes nuevos al mes si el esfuerzo no tuviera límites'), unit: L('customers/month', 'clientes/mes'), value: 30, min: 5, max: 80, step: 1, role: 'parameter' }),
      vr({ id: 'b_h0', name: L('Hours for half the effect', 'Horas para lograr la mitad'), symbol: 'h0', definition: L('How many weekly hours it takes to get half of that best case', 'Cuántas horas por semana hacen falta para llegar a la mitad de ese máximo'), unit: 'h', value: 25, min: 5, max: 60, step: 1, role: 'parameter' }),
      vr({ id: 'b_burn', name: L('Burnout', 'Agotamiento'), symbol: 'burn', definition: L('How quickly tiredness eats into results as hours pile up', 'Qué tan rápido el cansancio le quita resultados a medida que suben las horas'), unit: '—', value: 0.004, min: 0, max: 0.01, step: 0.0005, role: 'parameter' }),
      vr({ id: 'b_y', name: L('New customers per month', 'Clientes nuevos por mes'), symbol: 'y', definition: '', unit: '', role: 'output', provenance: 'simulated' }),
    ],
    equations: [{ id: 'e1', label: L('Customers vs hours', 'Clientes vs horas'), expr, provenance: 'system-hypothesis', editable: true }],
    assumptions: [assumed(lang), { id: 'as2', text: L('Only hours matter; prices, product and market are ignored.', 'Solo importan las horas; precios, producto y mercado se ignoran.'), provenance: 'system-hypothesis' }],
    limitations: [L('A hunch turned into a curve: shows the shape of the argument, not your business.', 'Una intuición convertida en curva: muestra la forma del argumento, no tu negocio.')],
    hypotheses: [{ id: 'h1', text: L('Past some number of hours, extra work lowers results.', 'Pasado cierto número de horas, trabajar más empeora los resultados.'), status: 'open', needs: L('Weekly hours and customers won, tracked for a few months.', 'Horas semanales y clientes ganados, registrados durante unos meses.') }],
    spec: { kind: 'function', expr, xName: 'h', xMin: 0, xMax: 80, xLabel: L('Hours per week', 'Horas por semana'), yLabel: L('New customers per month', 'Clientes nuevos por mes') },
    scenarios: [{ id: 'sc1', name: L('As is', 'Como estoy'), params: { cmax: 30, h0: 25, burn: 0.004 }, createdAt: T0 }, { id: 'sc2', name: L('Less burnout', 'Menos agotamiento'), params: { cmax: 30, h0: 25, burn: 0.001 }, createdAt: T0 }],
    validation: { status: 'unvalidated', notes: L('Hypothesised shape only.', 'Solo una forma hipotética.') },
  })
}

const retirement = (lang: Lang): MathModel => {
  const L = (en: string, es: string) => tr(lang, en, es)
  const expr = 'r*S+a'
  return model({
    id: 'mdl_demo_retire', title: L('How much to save for retirement', 'Cuánto ahorrar para jubilarme'),
    description: L('Savings grow by their own returns plus what you add each year.', 'Los ahorros crecen por sus propios rendimientos más lo que agregás cada año.'),
    originalInput: L('How much should I save each year to retire comfortably?', '¿Cuánto debo ahorrar al año para jubilarme tranquilo?'),
    kind: 'dynamic', method: L('Differential equation: growth by interest plus contributions', 'Ecuación diferencial: crecimiento por interés más aportes'),
    methodRationale: L('Money that changes over time through a rate and a steady inflow.', 'Dinero que cambia en el tiempo por una tasa y un aporte constante.'),
    concepts: ['savings', 'interest', 'time'],
    variables: [
      vr({ id: 'r_r', name: L('Yearly return', 'Rendimiento anual'), symbol: 'r', definition: L('How much your savings grow per year on their own (0.04 = 4%)', 'Cuánto crecen tus ahorros por año por sí solos (0.04 = 4%)'), unit: '1/' + L('year', 'año'), value: 0.04, min: 0, max: 0.12, step: 0.005, role: 'parameter' }),
      vr({ id: 'r_a', name: L('Saved per year', 'Ahorro por año'), symbol: 'a', definition: L('Money you add every year', 'Dinero que sumás cada año'), unit: '$', value: 6000, min: 0, max: 30000, step: 500, role: 'parameter', provenance: 'user-assumption' }),
      vr({ id: 'r_s0', name: L('Savings today', 'Ahorros hoy'), symbol: 'S0', definition: L('What you already have', 'Lo que ya tenés'), unit: '$', value: 5000, min: 0, max: 100000, step: 1000, role: 'parameter', provenance: 'user-assumption' }),
      vr({ id: 'r_S', name: L('Savings', 'Ahorros'), symbol: 'S', definition: '', unit: '$', role: 'state', provenance: 'simulated' }),
    ],
    equations: [{ id: 'e1', label: L('Savings growth', 'Crecimiento de ahorros'), expr, provenance: 'system-hypothesis', editable: true }],
    assumptions: [assumed(lang), { id: 'as2', text: L('Constant return and constant yearly saving; inflation and taxes are ignored.', 'Rendimiento y ahorro anual constantes; inflación e impuestos ignorados.'), provenance: 'system-hypothesis' }],
    limitations: [L('Real returns vary year to year; this is a smooth average.', 'Los rendimientos reales varían año a año; esto es un promedio suave.')], hypotheses: [],
    spec: { kind: 'dynamic', states: [{ id: 'S', label: L('Savings ($)', 'Ahorros ($)'), expr, init: 'S0' }], tEnd: 40, tLabel: L('Years', 'Años'), yLabel: L('Savings ($)', 'Ahorros ($)') },
    scenarios: [{ id: 'sc1', name: L('Save 6,000/yr', 'Ahorrar 6.000/año'), params: { r: 0.04, a: 6000, S0: 5000 }, createdAt: T0 }, { id: 'sc2', name: L('Save 12,000/yr', 'Ahorrar 12.000/año'), params: { r: 0.04, a: 12000, S0: 5000 }, createdAt: T0 }],
    validation: { status: 'simulated-only', notes: L('Simulation of a simplified rule.', 'Simulación de una regla simplificada.') },
  })
}

const trend = (lang: Lang): MathModel => {
  const L = (en: string, es: string) => tr(lang, en, es)
  const expr = '(p+q*A/N)*(N-A)'
  return model({
    id: 'mdl_demo_trend', title: L('How a trend spreads at school', 'Cómo se propaga una moda en el colegio'),
    description: L('People adopt on their own or by copying those who already did (Bass diffusion).', 'La gente la adopta por su cuenta o copiando a quienes ya lo hicieron (difusión de Bass).'),
    originalInput: L('Everyone suddenly wears the same sneakers. How does something like that spread?', 'De repente todos usan las mismas zapatillas. ¿Cómo se propaga algo así?'),
    kind: 'dynamic', method: L('Bass diffusion model (ODE)', 'Modelo de difusión de Bass (EDO)'),
    methodRationale: L('Adoption over time with two forces: independent choice and imitation.', 'Adopción en el tiempo con dos fuerzas: decisión propia e imitación.'),
    concepts: ['trend', 'imitation', 'adoption'],
    variables: [
      vr({ id: 't_N', name: L('People who could adopt', 'Gente que podría adoptarla'), symbol: 'N', definition: L('Everyone in the group who might eventually follow the trend', 'Todos en el grupo que podrían seguir la moda'), unit: '', value: 1000, min: 100, max: 5000, step: 50, role: 'parameter', provenance: 'user-assumption' }),
      vr({ id: 't_p', name: L('Own initiative', 'Iniciativa propia'), symbol: 'p', definition: L('Chance per day that someone adopts without seeing others do it', 'Probabilidad por día de que alguien la adopte sin ver a otros'), unit: '1/' + L('day', 'día'), value: 0.01, min: 0, max: 0.05, step: 0.001, role: 'parameter' }),
      vr({ id: 't_q', name: L('Imitation', 'Imitación'), symbol: 'q', definition: L('How strongly people copy those who already adopted', 'Qué tanto copian a quienes ya la adoptaron'), unit: '1/' + L('day', 'día'), value: 0.4, min: 0, max: 1, step: 0.02, role: 'parameter' }),
      vr({ id: 't_A0', name: L('Starting adopters', 'Primeros en adoptarla'), symbol: 'A0', definition: L('People who have it on day one', 'Gente que la tiene el primer día'), unit: '', value: 1, min: 1, max: 100, step: 1, role: 'parameter', provenance: 'user-assumption' }),
      vr({ id: 't_A', name: L('Adopters', 'Adoptantes'), symbol: 'A', definition: '', unit: '', role: 'state', provenance: 'simulated' }),
    ],
    equations: [{ id: 'e1', label: L('Adoption rate', 'Ritmo de adopción'), expr, provenance: 'system-hypothesis', editable: true }],
    assumptions: [assumed(lang), { id: 'as2', text: L('Everyone meets everyone equally; nobody drops the trend.', 'Todos se cruzan por igual; nadie abandona la moda.'), provenance: 'system-hypothesis' }],
    limitations: [L('Real trends fade and depend on who is influential.', 'Las modas reales se apagan y dependen de quién influye.')], hypotheses: [],
    spec: { kind: 'dynamic', states: [{ id: 'A', label: L('Adopters', 'Adoptantes'), expr, init: 'A0' }], tEnd: 40, tLabel: L('Days', 'Días'), yLabel: L('People with the trend', 'Gente con la moda') },
    scenarios: [], validation: { status: 'simulated-only', notes: L('Simulation only.', 'Solo simulación.') },
  })
}

const sleep = (lang: Lang): MathModel => {
  const L = (en: string, es: string) => tr(lang, en, es)
  const nodes = [['sleep', L('Sleep', 'Sueño')], ['stress', L('Stress', 'Estrés')], ['caffeine', L('Coffee', 'Café')], ['focus', L('Focus', 'Concentración')], ['mood', L('Mood', 'Ánimo')], ['perf', L('Performance', 'Rendimiento')]]
  const pos = circle(nodes.length)
  const spec: GraphSpec = {
    kind: 'causal', nodes: nodes.map(([id, label], i) => ({ id, label, ...pos[i] })),
    edges: ([['sleep', 'focus', 1, 'More sleep, better focus.', 'Más sueño, mejor concentración.'], ['sleep', 'mood', 1, 'Rested people feel better.', 'Descansado, te sentís mejor.'], ['stress', 'sleep', -1, 'Stress makes it harder to sleep.', 'El estrés dificulta dormir.'], ['stress', 'mood', -1, 'Stress lowers mood.', 'El estrés baja el ánimo.'], ['caffeine', 'sleep', -1, 'Late coffee cuts sleep.', 'El café tarde recorta el sueño.'], ['caffeine', 'focus', 1, 'Short-term alertness boost.', 'Sube la alerta a corto plazo.'], ['focus', 'perf', 1, 'Focused hours get more done.', 'Horas concentradas rinden más.'], ['mood', 'perf', 1, 'Good mood helps work.', 'Buen ánimo ayuda a trabajar.']] as [string, string, 1 | -1, string, string][])
      .map(([from, to, sign, en, es], i) => ({ id: `g${i}`, from, to, sign, note: L(en, es) })),
    gaps: [L('How big each effect is is unknown.', 'Se desconoce qué tan grande es cada efecto.'), L('Lags (a bad night vs. a bad month) are not modelled.', 'Los desfases (una mala noche vs. un mal mes) no están modelados.')],
  }
  return model({
    id: 'mdl_demo_sleep', title: L('Does sleeping less hurt my performance?', '¿Dormir poco afecta mi rendimiento?'),
    description: L('A map of what pushes what: arrows show the assumed direction of each effect.', 'Un mapa de qué empuja a qué: las flechas muestran la dirección supuesta de cada efecto.'),
    originalInput: L('I sleep little and drink a lot of coffee. Does that really affect how I perform?', 'Duermo poco y tomo mucho café. ¿De verdad afecta mi rendimiento?'),
    kind: 'causal', method: L('Signed directed graph (qualitative)', 'Grafo dirigido con signos (cualitativo)'),
    methodRationale: L('No numbers yet, but there are cause-and-effect claims, so the first step is to make them explicit.', 'Aún no hay números, pero sí afirmaciones de causa y efecto: el primer paso es hacerlas explícitas.'),
    concepts: ['sleep', 'stress', 'coffee', 'performance'],
    variables: nodes.map(([id, name]) => vr({ id: `s_${id}`, name, symbol: id, definition: '', unit: '', role: 'concept' })),
    equations: [], assumptions: [{ id: 'as1', text: L('Arrows are hypotheses from common sense, not from data.', 'Las flechas son hipótesis de sentido común, no de datos.'), provenance: 'system-hypothesis' }],
    limitations: [L('Correlation in your own diary would not prove these arrows.', 'Una correlación en tu propio diario no probaría estas flechas.')],
    hypotheses: [{ id: 'h1', text: L('Less sleep lowers performance mainly through focus.', 'Dormir menos baja el rendimiento sobre todo por la concentración.'), status: 'open', needs: L('A few weeks of logging sleep, coffee and a daily self-rating.', 'Unas semanas anotando sueño, café y una autocalificación diaria.') }],
    spec, validation: { status: 'unvalidated', notes: L('Hypothesised structure only.', 'Solo estructura hipotética.') },
  })
}

const timeSplit = (lang: Lang): MathModel => {
  const L = (en: string, es: string) => tr(lang, en, es)
  return model({
    id: 'mdl_demo_timesplit', title: L('Splitting my hours between tutoring and freelance', 'Repartir mis horas entre clases particulares y freelance'),
    description: L('Choose weekly hours for each job to earn the most within your time and energy.', 'Elegí las horas semanales de cada trabajo para ganar lo máximo con tu tiempo y energía.'),
    originalInput: L('I only have so many hours and energy: should I give more tutoring or take freelance jobs?', 'Tengo pocas horas y energía: ¿doy más clases o tomo trabajos freelance?'),
    kind: 'optimization', method: L('Linear program (best mix under limits)', 'Programa lineal (mejor combinación con límites)'),
    methodRationale: L('Two choices, a goal (income) and two limits (time, energy) that scale in proportion.', 'Dos decisiones, una meta (ingreso) y dos límites (tiempo, energía) proporcionales.'),
    concepts: ['time', 'income', 'energy'],
    variables: [
      vr({ id: 'o_cx', name: L('Tutoring pay', 'Pago por clases'), symbol: 'cx', definition: L('What you earn per tutoring hour', 'Lo que ganás por hora de clases'), unit: '$/h', value: 12, min: 5, max: 40, step: 1, role: 'parameter', provenance: 'user-assumption' }),
      vr({ id: 'o_cy', name: L('Freelance pay', 'Pago freelance'), symbol: 'cy', definition: L('What you earn per freelance hour', 'Lo que ganás por hora de freelance'), unit: '$/h', value: 20, min: 5, max: 60, step: 1, role: 'parameter', provenance: 'user-assumption' }),
      vr({ id: 'o_t', name: L('Free hours per week', 'Horas libres por semana'), symbol: 'rhs_time', definition: L('Hours you can work in a week', 'Horas que podés trabajar en una semana'), unit: 'h', value: 40, min: 10, max: 80, step: 1, role: 'parameter', provenance: 'user-assumption' }),
      vr({ id: 'o_e', name: L('Weekly energy', 'Energía semanal'), symbol: 'rhs_energy', definition: L('Energy you can spend (a tutoring hour costs 1 unit, a freelance hour 2)', 'Energía que podés gastar (una hora de clases cuesta 1 unidad, una de freelance 2)'), unit: L('units', 'unidades'), value: 60, min: 20, max: 120, step: 2, role: 'parameter', provenance: 'user-assumption' }),
    ],
    equations: [{ id: 'e1', label: L('Linear program', 'Programa lineal'), latex: '\\max\; c_x x + c_y y \\quad\\text{s.t.}\\quad x+y\\le T,\; x+2y\\le E', provenance: 'system-hypothesis', editable: false }],
    assumptions: [assumed(lang), { id: 'as2', text: L('Pay and effort per hour stay constant; there is always work available.', 'Pago y esfuerzo por hora son constantes; siempre hay trabajo disponible.'), provenance: 'system-hypothesis' }],
    limitations: [L('Computes the best choice for the numbers given; it does not describe what you actually prefer.', 'Calcula la mejor opción para los números dados; no describe lo que realmente preferís.')], hypotheses: [],
    spec: { kind: 'optimization', xName: L('Tutoring (h)', 'Clases (h)'), yName: L('Freelance (h)', 'Freelance (h)'), cx: 12, cy: 20, objectiveLabel: L('income ($)', 'ingreso ($)'),
      constraints: [{ id: 'time', label: L('Time', 'Tiempo'), a: 1, b: 1, rhs: 40 }, { id: 'energy', label: L('Energy', 'Energía'), a: 1, b: 2, rhs: 60 }] },
    validation: { status: 'unvalidated', notes: L('A normative model: best choice for the stated inputs.', 'Un modelo normativo: la mejor opción para los datos dados.') },
  })
}


export const EXAMPLES: Example[] = [
  { id: 'mdl_demo_temp', group: 'math', icon: 'sigma', title: ['Equation with sliders', 'Ecuación con controles'], sub: ['Crop yield vs temperature', 'Rendimiento vs temperatura'] },
  { id: 'mdl_demo_rain', group: 'math', icon: 'trend', title: ['Regression on data', 'Regresión con datos'], sub: ['Uncertainty bands (synthetic data)', 'Bandas de incertidumbre (datos sintéticos)'] },
  { id: 'mdl_demo_biomass', group: 'math', icon: 'wave', title: ['Growth over time', 'Crecimiento en el tiempo'], sub: ['Differential equation (ODE)', 'Ecuación diferencial (EDO)'] },
  { id: 'mdl_demo_lv', group: 'math', icon: 'wave', title: ['Two coupled equations', 'Dos ecuaciones acopladas'], sub: ['Predators and prey', 'Depredadores y presas'], build: predatorPrey },
  { id: 'mdl_demo_alloc', group: 'math', icon: 'bars', title: ['Optimisation', 'Optimización'], sub: ['Best mix under limits (LP)', 'Mejor combinación con límites (LP)'] },
  { id: 'mdl_demo_business', group: 'idea', icon: 'idea', title: ['“I work more but my business does not grow”', '«Trabajo más pero mi negocio no crece»'], sub: ['Hours vs customers: a curve', 'Horas vs clientes: una curva'], build: business },
  { id: 'mdl_demo_retire', group: 'idea', icon: 'idea', title: ['“How much should I save to retire?”', '«¿Cuánto debo ahorrar para jubilarme?»'], sub: ['Savings over 40 years', 'Ahorros a 40 años'], build: retirement },
  { id: 'mdl_demo_trend', group: 'idea', icon: 'idea', title: ['“Everyone suddenly wears the same sneakers”', '«De repente todos usan las mismas zapatillas»'], sub: ['How a trend spreads', 'Cómo se propaga una moda'], build: trend },
  { id: 'mdl_demo_sleep', group: 'idea', icon: 'network', title: ['“Does sleeping less hurt my performance?”', '«¿Dormir poco afecta mi rendimiento?»'], sub: ['A map of causes and effects', 'Un mapa de causas y efectos'], build: sleep },
  { id: 'mdl_demo_timesplit', group: 'idea', icon: 'bars', title: ['“Tutoring or freelance, with so few hours?”', '«¿Clases o freelance, con tan pocas horas?»'], sub: ['Best split of your time', 'La mejor forma de repartir tu tiempo'], build: timeSplit },
  { id: 'mdl_demo_causal', group: 'idea', icon: 'network', title: ['“What drives crop yield?”', '«¿Qué determina la cosecha?»'], sub: ['A qualitative causal map', 'Un mapa causal cualitativo'] },
]

/** The model to put in the user's library for an example (their language when we build it ourselves). */
export function exampleModel(id: string, lang: Lang): MathModel | null {
  const e = EXAMPLES.find((x) => x.id === id)
  if (!e) return null
  return e.build ? e.build(lang) : demoModels(lang).find((m) => m.id === id) ?? null
}

/**
 * Re-renders the built-in demo content (and gallery examples) in the interface language, but only the pieces the user
 * has not touched: version 1, no history, same number of scenarios. Their own models are never modified.
 */
export function localizeDemos(db: DB, lang: Lang): DB {
  const fresh = new Map<string, MathModel>()
  for (const m of demoModels(lang)) fresh.set(m.id, m)
  for (const e of EXAMPLES) if (e.build) fresh.set(e.id, e.build(lang))
  const untouched = (m: MathModel, f: MathModel) => m.isDemo && m.version === 1 && m.versions.length === 0 && m.scenarios.length === f.scenarios.length
  const srcFresh = new Map(demoSources(lang).map((x) => [x.id, x]))
  const relFresh = new Map(demoRelations(lang).map((x) => [x.id, x]))
  const expFresh = new Map(demoExperiments(lang).map((x) => [x.id, x]))
  return {
    ...db,
    models: db.models.map((m) => { const f = fresh.get(m.id); return f && untouched(m, f) ? f : m }),
    sources: db.sources.map((x) => srcFresh.get(x.id) ?? x),
    relations: db.relations.map((x) => { const f = relFresh.get(x.id); return f ? { ...x, justification: f.justification } : x }),
    experiments: db.experiments.map((x) => expFresh.get(x.id) ?? x),
  }
}
