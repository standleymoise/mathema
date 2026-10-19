// Demonstration corpus. EVERYTHING numeric here is illustrative demo data — labelled as such in the UI.
// Every human-readable string exists in English and Spanish so the demo follows the interface language.
import type { DB, Experiment, Lang, MathModel, Relation, Source, Variable } from './types'
import { gaussian, mulberry32 } from './engine/stats'
import { baseParams, metric } from './engine/runtime'

const T0 = '2026-10-01T09:00:00.000Z'
const v = (o: Partial<Variable> & Pick<Variable, 'id' | 'name' | 'symbol' | 'definition' | 'unit' | 'role'>): Variable => ({
  provenance: 'system-hypothesis', ...o,
})
const pick = (lang: Lang) => (en: string, es: string) => (lang === 'es' ? es : en)

export function demoSources(lang: Lang = 'en'): Source[] {
  const L = pick(lang)
  return [
    { id: 'src_demo_data', title: L('Demo dataset — synthetic seasonal yields', 'Datos demo — rendimientos estacionales sintéticos'), kind: 'demo', createdAt: T0,
      note: L('Generated in-app with a seeded random generator (seed 42). NOT field data. Exists only to demonstrate regression and uncertainty.', 'Generados en la app con un generador aleatorio con semilla (42). NO son datos de campo. Existen solo para demostrar la regresión y la incertidumbre.') },
    { id: 'src_idea_field', title: L('Idea note — "heat spells hurt yield more than dry spells"', 'Nota de idea — «las olas de calor dañan el rendimiento más que las sequías»'), kind: 'text', createdAt: T0,
      note: L('A demonstration user remark, used as an example of a hypothesis that is not yet backed by data.', 'Un comentario de usuario de demostración, usado como ejemplo de una hipótesis que todavía no tiene datos que la respalden.'),
      excerpt: L('I think a few very hot days during flowering hurt the crop more than a slightly drier season.', 'Creo que unos pocos días muy calurosos durante la floración dañan más el cultivo que una temporada algo más seca.') },
    { id: 'src_fao33', title: 'Doorenbos & Kassam (1979) — Yield response to water, FAO Irrigation and Drainage Paper 33', kind: 'reference',
      citation: 'Doorenbos, J. & Kassam, A.H. (1979). FAO Irrigation and Drainage Paper 33. Rome: FAO.', createdAt: T0,
      note: L('Background reference on crop-yield response to water. Listed for context only: NO demo parameter was taken from this document.', 'Referencia de contexto sobre la respuesta del rendimiento al agua. Se lista solo como contexto: NINGÚN parámetro demo salió de este documento.') },
    { id: 'src_fao56', title: 'Allen et al. (1998) — Crop evapotranspiration, FAO Irrigation and Drainage Paper 56', kind: 'reference',
      citation: 'Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). FAO Irrigation and Drainage Paper 56. Rome: FAO.', createdAt: T0,
      note: L('Background reference on evapotranspiration. Context only: NO demo parameter was taken from this document.', 'Referencia de contexto sobre evapotranspiración. Solo contexto: NINGÚN parámetro demo salió de este documento.') },
  ]
}

function rainfallData() {
  const rng = mulberry32(42)
  const x: number[] = [], y: number[] = []
  for (let i = 0; i < 26; i++) {
    const rain = Math.round(220 + rng() * 520) // mm per season
    const yld = 1.1 + 0.0125 * rain - 0.0000085 * rain * rain + gaussian(rng) * 0.42
    x.push(rain); y.push(+Math.max(0.4, yld).toFixed(2))
  }
  return { x, y }
}

export function demoModels(lang: Lang = 'en'): MathModel[] {
  const L = pick(lang)
  const yieldU = L('Yield (t/ha)', 'Rendimiento (t/ha)')

  const modelA: MathModel = {
    id: 'mdl_demo_temp', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
    title: L('Crop yield response to temperature', 'Respuesta del rendimiento del cultivo a la temperatura'),
    description: L('Bell-shaped (Gaussian) response of seasonal yield to mean temperature, scaled by a saturating water factor. Illustrative demo model.', 'Respuesta en forma de campana (gaussiana) del rendimiento estacional a la temperatura media, escalada por un factor de agua que se satura. Modelo demo ilustrativo.'),
    originalInput: L('How does the yield of a crop change with the average temperature of the growing season, if water is also limited?', '¿Cómo cambia el rendimiento de un cultivo con la temperatura media de la temporada, si además el agua es limitada?'),
    kind: 'function', method: L('Parametric function of one variable', 'Función paramétrica de una variable'),
    methodRationale: L('One continuous input (temperature) and a single output (yield) with a known qualitative shape — a unimodal response — make a parametric curve the simplest adequate representation.', 'Una entrada continua (temperatura) y una sola salida (rendimiento) con una forma cualitativa conocida —una respuesta con un solo máximo— hacen de una curva paramétrica la representación adecuada más simple.'),
    concepts: [L('crop yield', 'rendimiento del cultivo'), L('temperature', 'temperatura'), L('water availability', 'disponibilidad de agua'), L('optimum', 'óptimo')],
    variables: [
      v({ id: 'a_x', name: L('Mean temperature', 'Temperatura media'), symbol: 'x', definition: L('Mean air temperature during the growing season', 'Temperatura media del aire durante la temporada de cultivo'), unit: '°C', role: 'input', min: 0, max: 45, provenance: 'user-assumption' }),
      v({ id: 'a_ymax', name: L('Potential yield', 'Rendimiento potencial'), symbol: 'ymax', definition: L('Yield at optimum temperature with unlimited water', 'Rendimiento a la temperatura óptima con agua ilimitada'), unit: 't/ha', value: 8, min: 1, max: 15, step: 0.1, role: 'parameter', provenance: 'system-hypothesis' }),
      v({ id: 'a_topt', name: L('Optimum temperature', 'Temperatura óptima'), symbol: 'topt', definition: L('Temperature at which the response peaks', 'Temperatura a la que la respuesta alcanza su máximo'), unit: '°C', value: 24, min: 10, max: 35, step: 0.5, role: 'parameter', provenance: 'system-hypothesis' }),
      v({ id: 'a_sigma', name: L('Thermal tolerance', 'Tolerancia térmica'), symbol: 'sigma', definition: L('Width of the bell: larger means a more tolerant crop', 'Ancho de la campana: más grande significa un cultivo más tolerante'), unit: '°C', value: 5, min: 1, max: 12, step: 0.1, role: 'parameter', provenance: 'system-hypothesis' }),
      v({ id: 'a_w', name: L('Water availability', 'Disponibilidad de agua'), symbol: 'w', definition: L('Seasonal water supply (rain + irrigation)', 'Suministro de agua de la temporada (lluvia + riego)'), unit: 'mm', value: 450, min: 50, max: 900, step: 10, role: 'parameter', provenance: 'user-assumption' }),
      v({ id: 'a_k', name: L('Half-saturation water', 'Agua de media saturación'), symbol: 'k', definition: L('Water supply at which the water factor equals 0.5', 'Suministro de agua con el que el factor de agua vale 0,5'), unit: 'mm', value: 150, min: 20, max: 500, step: 10, role: 'parameter', provenance: 'system-hypothesis' }),
      v({ id: 'a_y', name: L('Crop yield', 'Rendimiento del cultivo'), symbol: 'Y', definition: L('Seasonal grain yield', 'Rendimiento de grano de la temporada'), unit: 't/ha', role: 'output', provenance: 'simulated' }),
    ],
    equations: [{ id: 'e_a', label: L('Yield response', 'Respuesta del rendimiento'), expr: 'ymax*exp(-((x-topt)^2)/(2*sigma^2))*w/(w+k)', provenance: 'system-hypothesis', editable: true }],
    assumptions: [
      { id: 'as1', text: L('Temperature and water act multiplicatively and independently.', 'La temperatura y el agua actúan de forma multiplicativa e independiente.'), provenance: 'system-hypothesis' },
      { id: 'as2', text: L('The response is symmetric around the optimum (real crops are usually skewed).', 'La respuesta es simétrica alrededor del óptimo (los cultivos reales suelen ser asimétricos).'), provenance: 'system-hypothesis' },
      { id: 'as3', text: L('Pests, soil, nutrients and timing of stress are ignored.', 'Se ignoran plagas, suelo, nutrientes y el momento del estrés.'), provenance: 'user-assumption' },
    ],
    limitations: [L('All parameter values are illustrative demo values, not estimates for any real crop.', 'Todos los valores de los parámetros son valores demo ilustrativos, no estimaciones de ningún cultivo real.'), L('No data were used to fit this curve.', 'No se usaron datos para ajustar esta curva.'), L('Does not distinguish heat stress during flowering from season-mean temperature.', 'No distingue el estrés por calor durante la floración de la temperatura media de la temporada.')],
    hypotheses: [{ id: 'h1', text: L('A few very hot days at flowering reduce yield more than a modestly drier season.', 'Unos pocos días muy calurosos en la floración reducen el rendimiento más que una temporada algo más seca.'), status: 'open', needs: L('Daily temperature records and yields from the same fields, ideally with a flowering-date covariate.', 'Registros diarios de temperatura y rendimientos de los mismos campos, idealmente con la fecha de floración como covariable.') }],
    sourceIds: ['src_idea_field', 'src_fao33'],
    validation: { status: 'demo-data', notes: L('Demonstration model. Not fitted to or checked against any observation.', 'Modelo de demostración. No está ajustado ni comparado con ninguna observación.') },
    spec: { kind: 'function', expr: 'ymax*exp(-((x-topt)^2)/(2*sigma^2))*w/(w+k)', xName: 'x', xMin: 0, xMax: 45, xLabel: L('Mean temperature (°C)', 'Temperatura media (°C)'), yLabel: yieldU },
    scenarios: [
      { id: 'sc1', name: L('Baseline', 'Base'), params: { ymax: 8, topt: 24, sigma: 5, w: 450, k: 150 }, createdAt: T0 },
      { id: 'sc2', name: L('Dry season', 'Temporada seca'), params: { ymax: 8, topt: 24, sigma: 5, w: 200, k: 150 }, createdAt: T0 },
      { id: 'sc3', name: L('Heat-tolerant cultivar', 'Cultivar tolerante al calor'), params: { ymax: 8, topt: 27, sigma: 7, w: 450, k: 150 }, createdAt: T0 },
    ],
    versions: [],
  }

  const rd = rainfallData()
  const modelB: MathModel = {
    id: 'mdl_demo_rain', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
    title: L('Yield vs. seasonal rainfall (regression)', 'Rendimiento vs. lluvia estacional (regresión)'),
    description: L('Least-squares fit of yield on seasonal rainfall using 26 SYNTHETIC observations, with confidence and prediction intervals.', 'Ajuste por mínimos cuadrados del rendimiento según la lluvia estacional con 26 observaciones SINTÉTICAS, con intervalos de confianza y de predicción.'),
    originalInput: L('Is yield related to how much rain a field receives in a season, and how uncertain is that relationship?', '¿El rendimiento se relaciona con cuánta lluvia recibe un campo en una temporada, y qué tan incierta es esa relación?'),
    kind: 'regression', method: L('Ordinary least squares (polynomial, degree 1–2)', 'Mínimos cuadrados ordinarios (polinomio, grado 1–2)'),
    methodRationale: L('Paired numeric observations exist, so a statistical model with explicit uncertainty fits the question. Degree 2 lets the curve flatten at high rainfall.', 'Hay observaciones numéricas pareadas, así que un modelo estadístico con incertidumbre explícita encaja con la pregunta. El grado 2 permite que la curva se aplane con lluvia alta.'),
    concepts: [L('crop yield', 'rendimiento del cultivo'), L('rainfall', 'lluvia'), L('uncertainty', 'incertidumbre'), L('water availability', 'disponibilidad de agua')],
    variables: [
      v({ id: 'b_x', name: L('Seasonal rainfall', 'Lluvia estacional'), symbol: 'rain', definition: L('Total rainfall during the growing season', 'Lluvia total durante la temporada de cultivo'), unit: 'mm', role: 'input', provenance: 'source', sourceId: 'src_demo_data' }),
      v({ id: 'b_y', name: L('Crop yield', 'Rendimiento del cultivo'), symbol: 'Y', definition: L('Seasonal grain yield', 'Rendimiento de grano de la temporada'), unit: 't/ha', role: 'output', provenance: 'source', sourceId: 'src_demo_data' }),
    ],
    equations: [{ id: 'e_b', label: L('Polynomial regression', 'Regresión polinómica'), latex: 'Y_i = \\beta_0 + \\beta_1\\,\\mathrm{rain}_i + \\beta_2\\,\\mathrm{rain}_i^2 + \\varepsilon_i,\\quad \\varepsilon_i\\sim\\mathcal{N}(0,\\sigma^2)', provenance: 'derived', editable: false }],
    assumptions: [
      { id: 'bs1', text: L('Observations are independent and errors are Gaussian with constant variance.', 'Las observaciones son independientes y los errores son gaussianos con varianza constante.'), provenance: 'system-hypothesis' },
      { id: 'bs2', text: L('The functional form (polynomial) is a convenient description, not a mechanism.', 'La forma funcional (polinomio) es una descripción cómoda, no un mecanismo.'), provenance: 'system-hypothesis' },
    ],
    limitations: [L('Synthetic data: the fit demonstrates the method, it says nothing about real crops.', 'Datos sintéticos: el ajuste demuestra el método, no dice nada sobre cultivos reales.'), L('Association between rainfall and yield is not evidence of causation (temperature, soil and management are confounders).', 'La asociación entre lluvia y rendimiento no es evidencia de causalidad (temperatura, suelo y manejo son factores de confusión).'), L('Extrapolating outside the observed rainfall range is unreliable.', 'Extrapolar fuera del rango de lluvia observado no es confiable.')],
    hypotheses: [], sourceIds: ['src_demo_data'],
    validation: { status: 'demo-data', notes: L('Fitted to synthetic data. Fit quality is a property of the generator, not of nature.', 'Ajustado a datos sintéticos. La calidad del ajuste es una propiedad del generador, no de la naturaleza.') },
    spec: { kind: 'regression', x: rd.x, y: rd.y, xLabel: L('Seasonal rainfall (mm)', 'Lluvia estacional (mm)'), yLabel: yieldU, degree: 2 },
    scenarios: [], versions: [],
  }

  const modelC: MathModel = {
    id: 'mdl_demo_biomass', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
    title: L('Biomass growth under a thermal stress factor', 'Crecimiento de biomasa bajo un factor de estrés térmico'),
    description: L('Logistic growth of crop biomass whose rate is scaled by the same Gaussian temperature response used in the yield model. Demo.', 'Crecimiento logístico de la biomasa del cultivo cuya tasa se escala con la misma respuesta gaussiana a la temperatura del modelo de rendimiento. Demo.'),
    originalInput: L('How fast does biomass accumulate over the season if temperature slows growth away from the optimum?', '¿Qué tan rápido se acumula la biomasa durante la temporada si la temperatura frena el crecimiento lejos del óptimo?'),
    kind: 'dynamic', method: L('Ordinary differential equation (logistic, RK4 numerical solution)', 'Ecuación diferencial ordinaria (logística, solución numérica RK4)'),
    methodRationale: L('The question is about change over time with saturation, which is naturally an ODE. The temperature factor is reused from the existing yield model.', 'La pregunta trata de un cambio en el tiempo con saturación, que es naturalmente una EDO. El factor de temperatura se reutiliza del modelo de rendimiento existente.'),
    concepts: [L('crop biomass', 'biomasa del cultivo'), L('temperature', 'temperatura'), L('growth rate', 'tasa de crecimiento'), L('optimum', 'óptimo')],
    variables: [
      v({ id: 'c_r', name: L('Intrinsic growth rate', 'Tasa de crecimiento intrínseca'), symbol: 'r', definition: L('Maximum relative growth rate', 'Tasa máxima de crecimiento relativo'), unit: L('1/day', '1/día'), value: 0.08, min: 0.01, max: 0.2, step: 0.005, role: 'parameter' }),
      v({ id: 'c_K', name: L('Carrying capacity', 'Capacidad de carga'), symbol: 'K', definition: L('Maximum attainable biomass', 'Biomasa máxima alcanzable'), unit: 't/ha', value: 18, min: 5, max: 30, step: 0.5, role: 'parameter' }),
      v({ id: 'c_T', name: L('Mean temperature', 'Temperatura media'), symbol: 'x', definition: L('Constant mean air temperature', 'Temperatura media del aire, constante'), unit: '°C', value: 24, min: 5, max: 40, step: 0.5, role: 'input', provenance: 'user-assumption' }),
      v({ id: 'c_topt', name: L('Optimum temperature', 'Temperatura óptima'), symbol: 'topt', definition: L('Temperature at which growth peaks', 'Temperatura a la que el crecimiento es máximo'), unit: '°C', value: 24, min: 10, max: 35, step: 0.5, role: 'parameter' }),
      v({ id: 'c_sigma', name: L('Thermal tolerance', 'Tolerancia térmica'), symbol: 'sigma', definition: L('Width of the thermal response', 'Ancho de la respuesta térmica'), unit: '°C', value: 5, min: 1, max: 12, step: 0.1, role: 'parameter' }),
      v({ id: 'c_B0', name: L('Initial biomass', 'Biomasa inicial'), symbol: 'B0', definition: L('Biomass at emergence', 'Biomasa en la emergencia'), unit: 't/ha', value: 0.2, min: 0.05, max: 2, step: 0.05, role: 'parameter', provenance: 'user-assumption' }),
      v({ id: 'c_B', name: L('Biomass', 'Biomasa'), symbol: 'B', definition: L('Standing biomass over time', 'Biomasa en pie a lo largo del tiempo'), unit: 't/ha', role: 'state', provenance: 'simulated' }),
    ],
    equations: [{ id: 'e_c', label: L('Logistic growth with thermal factor', 'Crecimiento logístico con factor térmico'), expr: 'r*exp(-((x-topt)^2)/(2*sigma^2))*B*(1-B/K)', provenance: 'system-hypothesis', editable: true }],
    assumptions: [
      { id: 'cs1', text: L('Temperature is constant over the season.', 'La temperatura es constante durante la temporada.'), provenance: 'user-assumption' },
      { id: 'cs2', text: L('Growth is limited only through K; water and nutrients are not modelled.', 'El crecimiento se limita solo mediante K; el agua y los nutrientes no se modelan.'), provenance: 'system-hypothesis' },
    ],
    limitations: [L('Illustrative parameters. Not calibrated to any dataset.', 'Parámetros ilustrativos. No calibrados con ningún conjunto de datos.'), L('No stochasticity: the trajectory is a single deterministic path.', 'Sin estocasticidad: la trayectoria es un único camino determinista.')],
    hypotheses: [], sourceIds: ['src_fao33'],
    validation: { status: 'simulated-only', notes: L('Output is a simulation. No observation has been compared to it.', 'El resultado es una simulación. Ninguna observación se ha comparado con él.') },
    spec: { kind: 'dynamic', states: [{ id: 'B', label: L('Biomass (t/ha)', 'Biomasa (t/ha)'), expr: 'r*exp(-((x-topt)^2)/(2*sigma^2))*B*(1-B/K)', init: 'B0' }], tEnd: 120, tLabel: L('Days after emergence', 'Días tras la emergencia'), yLabel: L('Biomass (t/ha)', 'Biomasa (t/ha)') },
    scenarios: [
      { id: 'sc1', name: L('Optimal temperature', 'Temperatura óptima'), params: { r: 0.08, K: 18, x: 24, topt: 24, sigma: 5, B0: 0.2 }, createdAt: T0 },
      { id: 'sc2', name: L('Heat stress (+6 °C)', 'Estrés por calor (+6 °C)'), params: { r: 0.08, K: 18, x: 30, topt: 24, sigma: 5, B0: 0.2 }, createdAt: T0 },
    ],
    versions: [],
  }

  const modelD: MathModel = {
    id: 'mdl_demo_alloc', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
    title: L('Land and water allocation between two crops', 'Reparto de tierra y agua entre dos cultivos'),
    description: L('Linear program: choose hectares of wheat and maize to maximise margin subject to land and water limits. Demo numbers.', 'Programa lineal: elegí hectáreas de trigo y maíz para maximizar el margen con límites de tierra y agua. Números demo.'),
    originalInput: L('With limited land and water, how many hectares of each crop should I plant to maximise margin?', 'Con tierra y agua limitadas, ¿cuántas hectáreas de cada cultivo debo sembrar para maximizar el margen?'),
    kind: 'optimization', method: L('Linear programming (exact vertex enumeration)', 'Programación lineal (enumeración exacta de vértices)'),
    methodRationale: L('A decision with a linear objective and linear resource limits is a textbook LP; the optimum lies at a vertex of the feasible region.', 'Una decisión con objetivo lineal y límites de recursos lineales es un LP de libro de texto; el óptimo está en un vértice de la región factible.'),
    concepts: [L('land', 'tierra'), L('water availability', 'disponibilidad de agua'), L('margin', 'margen'), L('allocation', 'reparto')],
    variables: [
      v({ id: 'd_cx', name: L('Wheat margin', 'Margen del trigo'), symbol: 'cx', definition: L('Margin per hectare of wheat', 'Margen por hectárea de trigo'), unit: '$/ha', value: 420, min: 100, max: 900, step: 10, role: 'parameter', provenance: 'user-assumption' }),
      v({ id: 'd_cy', name: L('Maize margin', 'Margen del maíz'), symbol: 'cy', definition: L('Margin per hectare of maize', 'Margen por hectárea de maíz'), unit: '$/ha', value: 610, min: 100, max: 1200, step: 10, role: 'parameter', provenance: 'user-assumption' }),
      v({ id: 'd_land', name: L('Available land', 'Tierra disponible'), symbol: 'rhs_land', definition: L('Total cultivable land', 'Tierra cultivable total'), unit: 'ha', value: 100, min: 20, max: 200, step: 5, role: 'parameter', provenance: 'user-assumption' }),
      v({ id: 'd_water', name: L('Available water', 'Agua disponible'), symbol: 'rhs_water', definition: L('Seasonal irrigation volume', 'Volumen de riego de la temporada'), unit: 'ML', value: 480, min: 100, max: 1000, step: 10, role: 'parameter', provenance: 'user-assumption' }),
    ],
    equations: [{ id: 'e_d', label: L('Linear program', 'Programa lineal'), latex: '\\max_{x,y\\ge 0}\\; c_x x + c_y y \\quad\\text{s.t.}\\quad x+y\\le L,\\; 3x+7y\\le W', provenance: 'system-hypothesis', editable: false }],
    assumptions: [
      { id: 'ds1', text: L('Margins and water use per hectare are constant (no economies of scale, no price response).', 'Los márgenes y el uso de agua por hectárea son constantes (sin economías de escala ni respuesta de precios).'), provenance: 'user-assumption' },
      { id: 'ds2', text: L('Water use: wheat 3 ML/ha and maize 7 ML/ha (illustrative).', 'Uso de agua: trigo 3 ML/ha y maíz 7 ML/ha (ilustrativo).'), provenance: 'user-assumption' },
    ],
    limitations: [L('Deterministic: ignores price and yield risk.', 'Determinista: ignora el riesgo de precios y de rendimiento.'), L('All coefficients are demo values.', 'Todos los coeficientes son valores demo.')],
    hypotheses: [], sourceIds: [],
    validation: { status: 'unvalidated', notes: L('A normative model: it computes the best choice given the stated inputs, it does not describe observed behaviour.', 'Un modelo normativo: calcula la mejor opción con los datos indicados, no describe un comportamiento observado.') },
    spec: { kind: 'optimization', xName: L('Wheat (ha)', 'Trigo (ha)'), yName: L('Maize (ha)', 'Maíz (ha)'), cx: 420, cy: 610, objectiveLabel: L('margin ($)', 'margen ($)'),
      constraints: [{ id: 'land', label: L('Land', 'Tierra'), a: 1, b: 1, rhs: 100 }, { id: 'water', label: L('Water', 'Agua'), a: 3, b: 7, rhs: 480 }] },
    scenarios: [], versions: [],
  }

  const modelE: MathModel = {
    id: 'mdl_demo_causal', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
    title: L('Qualitative causal map of crop yield', 'Mapa causal cualitativo del rendimiento del cultivo'),
    description: L('Signed causal hypotheses linking climate, soil water and management to yield. A conceptual map, not an estimated causal model.', 'Hipótesis causales con signo que enlazan clima, agua del suelo y manejo con el rendimiento. Un mapa conceptual, no un modelo causal estimado.'),
    originalInput: L('What drives crop yield, and in which direction does each factor push?', '¿Qué determina el rendimiento del cultivo, y en qué dirección empuja cada factor?'),
    kind: 'causal', method: L('Signed directed graph (qualitative causal hypotheses)', 'Grafo dirigido con signos (hipótesis causales cualitativas)'),
    methodRationale: L('No quantities are available, but the claim has causal structure. A signed graph makes the assumed directions explicit and lets us trace which effects are ambiguous.', 'No hay cantidades disponibles, pero la afirmación tiene estructura causal. Un grafo con signos hace explícitas las direcciones supuestas y permite ver qué efectos son ambiguos.'),
    concepts: [L('crop yield', 'rendimiento del cultivo'), L('rainfall', 'lluvia'), L('temperature', 'temperatura'), L('soil moisture', 'humedad del suelo'), L('evapotranspiration', 'evapotranspiración'), L('fertilizer', 'fertilizante')],
    variables: [
      v({ id: 'e_rain', name: L('Rainfall', 'Lluvia'), symbol: 'rain', definition: L('Seasonal rainfall', 'Lluvia de la temporada'), unit: 'mm', role: 'concept' }),
      v({ id: 'e_temp', name: L('Temperature', 'Temperatura'), symbol: 'temp', definition: L('Mean air temperature', 'Temperatura media del aire'), unit: '°C', role: 'concept' }),
      v({ id: 'e_et', name: L('Evapotranspiration', 'Evapotranspiración'), symbol: 'et', definition: L('Water lost to air via soil and plants', 'Agua que se pierde al aire por el suelo y las plantas'), unit: 'mm', role: 'concept' }),
      v({ id: 'e_sm', name: L('Soil moisture', 'Humedad del suelo'), symbol: 'sm', definition: L('Plant-available water in the root zone', 'Agua disponible para la planta en la zona de raíces'), unit: 'mm', role: 'concept' }),
      v({ id: 'e_fert', name: L('Fertilizer', 'Fertilizante'), symbol: 'fert', definition: L('Applied nutrient', 'Nutriente aplicado'), unit: 'kg/ha', role: 'concept' }),
      v({ id: 'e_yield', name: L('Crop yield', 'Rendimiento del cultivo'), symbol: 'Y', definition: L('Seasonal grain yield', 'Rendimiento de grano de la temporada'), unit: 't/ha', role: 'concept' }),
    ],
    equations: [],
    assumptions: [{ id: 'es1', text: L('Edges encode hypothesised direction of effect; they were not identified from data.', 'Las flechas codifican la dirección de efecto supuesta; no se identificaron con datos.'), provenance: 'system-hypothesis' }],
    limitations: [L('Correlation in data would NOT establish these edges.', 'Una correlación en los datos NO establecería estas flechas.'), L('Temperature → yield is non-monotonic (see the temperature-response model), so its sign is marked ambiguous.', 'Temperatura → rendimiento no es monótona (ver el modelo de respuesta a la temperatura), por eso su signo se marca como ambiguo.'), L('No interaction or lag structure.', 'Sin estructura de interacciones ni de desfases.')],
    hypotheses: [{ id: 'h_e1', text: L('Fertilizer response is conditional on soil moisture.', 'La respuesta al fertilizante depende de la humedad del suelo.'), status: 'open', needs: L('Factorial field trial varying fertilizer and irrigation.', 'Ensayo factorial de campo que varíe fertilizante y riego.') }],
    sourceIds: ['src_fao56', 'src_idea_field'],
    validation: { status: 'unvalidated', notes: L('Hypothesised structure only.', 'Solo estructura hipotética.') },
    spec: { kind: 'causal', gaps: [L('Strength of every edge is unknown.', 'Se desconoce la intensidad de cada flecha.'), L('Lag between rainfall and soil moisture is not specified.', 'No se especifica el desfase entre lluvia y humedad del suelo.'), L('Management confounders (sowing date, cultivar) are absent.', 'Faltan factores de confusión de manejo (fecha de siembra, cultivar).')],
      nodes: [
        { id: 'rain', label: L('Rainfall', 'Lluvia'), x: 90, y: 70 }, { id: 'temp', label: L('Temperature', 'Temperatura'), x: 90, y: 250 },
        { id: 'et', label: L('Evapotranspiration', 'Evapotranspiración'), x: 310, y: 250 }, { id: 'sm', label: L('Soil moisture', 'Humedad del suelo'), x: 310, y: 100 },
        { id: 'fert', label: L('Fertilizer', 'Fertilizante'), x: 530, y: 20 }, { id: 'yield', label: L('Crop yield', 'Rendimiento'), x: 540, y: 170 },
      ],
      edges: [
        { id: 'g1', from: 'rain', to: 'sm', sign: 1, note: L('More rain, more stored soil water.', 'Más lluvia, más agua almacenada en el suelo.') },
        { id: 'g2', from: 'temp', to: 'et', sign: 1, note: L('Warmer air raises evaporative demand.', 'El aire más cálido aumenta la demanda de evaporación.') },
        { id: 'g3', from: 'et', to: 'sm', sign: -1, note: L('Water lost to the atmosphere depletes soil water.', 'El agua que se pierde a la atmósfera agota el agua del suelo.') },
        { id: 'g4', from: 'sm', to: 'yield', sign: 1, note: L('Water supply supports growth (saturating, see yield model).', 'El suministro de agua favorece el crecimiento (con saturación, ver el modelo de rendimiento).') },
        { id: 'g5', from: 'fert', to: 'yield', sign: 1, note: L('Nutrient supply raises yield up to a limit.', 'El aporte de nutrientes sube el rendimiento hasta un límite.') },
        { id: 'g6', from: 'temp', to: 'yield', sign: 0, note: L('Unimodal: sign depends on whether temperature is below or above the optimum.', 'Con un solo máximo: el signo depende de si la temperatura está por debajo o por encima del óptimo.') },
      ] },
    scenarios: [], versions: [],
  }
  return [modelA, modelB, modelC, modelD, modelE]
}

export const DEMO_MODELS: MathModel[] = demoModels('en')
export const DEMO_SOURCES: Source[] = demoSources('en')

const rel = (id: string, from: string, to: string, type: Relation['type'], justification: string): Relation => ({ id, from, to, type, justification, status: 'accepted', createdAt: T0 })
export function demoRelations(lang: Lang = 'en'): Relation[] {
  const L = pick(lang)
  return [
    rel('r1', 'mdl_demo_biomass', 'mdl_demo_temp', 'depends-on', L('The biomass model reuses the Gaussian temperature factor exp(−(x−topt)²/2σ²) defined in the yield-response model.', 'El modelo de biomasa reutiliza el factor gaussiano de temperatura exp(−(x−topt)²/2σ²) definido en el modelo de respuesta del rendimiento.')),
    rel('r2', 'mdl_demo_rain', 'mdl_demo_temp', 'compatible-with', L('Both describe yield; they use different drivers (rainfall vs temperature) and can be combined in a multi-factor model. Units match (t/ha).', 'Ambos describen el rendimiento; usan factores distintos (lluvia vs temperatura) y pueden combinarse en un modelo multifactor. Las unidades coinciden (t/ha).')),
    rel('r3', 'mdl_demo_causal', 'mdl_demo_temp', 'specialization-of', L('The causal map’s temperature → yield edge is made quantitative by the temperature-response curve.', 'La flecha temperatura → rendimiento del mapa causal se vuelve cuantitativa con la curva de respuesta a la temperatura.')),
    rel('r4', 'mdl_demo_causal', 'mdl_demo_rain', 'requires-evidence-of', L('The rain → soil moisture → yield pathway needs data beyond the rainfall–yield association to be causal.', 'El camino lluvia → humedad del suelo → rendimiento necesita datos más allá de la asociación lluvia–rendimiento para ser causal.')),
    rel('r5', 'mdl_demo_alloc', 'mdl_demo_rain', 'compatible-with', L('The allocation model’s water constraint could be informed by expected yield under a given water supply.', 'La restricción de agua del modelo de reparto podría informarse con el rendimiento esperado bajo cierto suministro de agua.')),
  ]
}
export const DEMO_RELATIONS: Relation[] = demoRelations('en')

export function demoExperiments(lang: Lang = 'en'): Experiment[] {
  const L = pick(lang)
  const a = demoModels(lang)[0]
  const rows = a.scenarios.map((s) => {
    const m = metric(a, { ...baseParams(a), ...s.params }, lang)
    return { label: s.name, value: m ? `${m.value.toFixed(2)} (${m.label})` : 'n/a' }
  })
  return [{
    id: 'exp_demo_1', modelId: a.id, name: L('Scenario comparison — baseline vs dry vs heat-tolerant', 'Comparación de escenarios — base vs seco vs tolerante al calor'), type: 'scenario-comparison', rows,
    provenance: 'simulated', note: L('Simulated with demo parameters. These are model outputs, not observations.', 'Simulado con parámetros demo. Son resultados del modelo, no observaciones.'), createdAt: T0,
  }]
}

export function seedDB(lang: Lang = 'en'): DB {
  return {
    schema: 1, seeded: true,
    models: demoModels(lang), sources: demoSources(lang),
    relations: demoRelations(lang), experiments: demoExperiments(lang),
    conversations: [],
  }
}
