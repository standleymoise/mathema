// Demonstration corpus. EVERYTHING numeric here is illustrative demo data — labelled as such in the UI.
import type { DB, Experiment, MathModel, Relation, Source, Variable } from './types'
import { gaussian, mulberry32 } from './engine/stats'
import { baseParams, metric } from './engine/runtime'

const T0 = '2026-10-01T09:00:00.000Z'
const v = (o: Partial<Variable> & Pick<Variable, 'id' | 'name' | 'symbol' | 'definition' | 'unit' | 'role'>): Variable => ({
  provenance: 'system-hypothesis', ...o,
})

export const DEMO_SOURCES: Source[] = [
  { id: 'src_demo_data', title: 'Demo dataset — synthetic seasonal yields', kind: 'demo', createdAt: T0,
    note: 'Generated in-app with a seeded random generator (seed 42). NOT field data. Exists only to demonstrate regression and uncertainty.' },
  { id: 'src_idea_field', title: 'Idea note — "heat spells hurt yield more than dry spells"', kind: 'text', createdAt: T0,
    note: 'A demonstration user remark, used as an example of a hypothesis that is not yet backed by data.',
    excerpt: 'I think a few very hot days during flowering hurt the crop more than a slightly drier season.' },
  { id: 'src_fao33', title: 'Doorenbos & Kassam (1979) — Yield response to water, FAO Irrigation and Drainage Paper 33', kind: 'reference',
    citation: 'Doorenbos, J. & Kassam, A.H. (1979). FAO Irrigation and Drainage Paper 33. Rome: FAO.', createdAt: T0,
    note: 'Background reference on crop-yield response to water. Listed for context only: NO demo parameter was taken from this document.' },
  { id: 'src_fao56', title: 'Allen et al. (1998) — Crop evapotranspiration, FAO Irrigation and Drainage Paper 56', kind: 'reference',
    citation: 'Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). FAO Irrigation and Drainage Paper 56. Rome: FAO.', createdAt: T0,
    note: 'Background reference on evapotranspiration. Context only: NO demo parameter was taken from this document.' },
]

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

const modelA: MathModel = {
  id: 'mdl_demo_temp', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
  title: 'Crop yield response to temperature',
  description: 'Bell-shaped (Gaussian) response of seasonal yield to mean temperature, scaled by a saturating water factor. Illustrative demo model.',
  originalInput: 'How does the yield of a crop change with the average temperature of the growing season, if water is also limited?',
  kind: 'function', method: 'Parametric function of one variable',
  methodRationale: 'One continuous input (temperature) and a single output (yield) with a known qualitative shape — a unimodal response — make a parametric curve the simplest adequate representation.',
  concepts: ['crop yield', 'temperature', 'water availability', 'optimum'],
  variables: [
    v({ id: 'a_x', name: 'Mean temperature', symbol: 'x', definition: 'Mean air temperature during the growing season', unit: '°C', role: 'input', min: 0, max: 45, provenance: 'user-assumption' }),
    v({ id: 'a_ymax', name: 'Potential yield', symbol: 'ymax', definition: 'Yield at optimum temperature with unlimited water', unit: 't/ha', value: 8, min: 1, max: 15, step: 0.1, role: 'parameter', provenance: 'system-hypothesis' }),
    v({ id: 'a_topt', name: 'Optimum temperature', symbol: 'topt', definition: 'Temperature at which the response peaks', unit: '°C', value: 24, min: 10, max: 35, step: 0.5, role: 'parameter', provenance: 'system-hypothesis' }),
    v({ id: 'a_sigma', name: 'Thermal tolerance', symbol: 'sigma', definition: 'Width of the bell: larger means a more tolerant crop', unit: '°C', value: 5, min: 1, max: 12, step: 0.1, role: 'parameter', provenance: 'system-hypothesis' }),
    v({ id: 'a_w', name: 'Water availability', symbol: 'w', definition: 'Seasonal water supply (rain + irrigation)', unit: 'mm', value: 450, min: 50, max: 900, step: 10, role: 'parameter', provenance: 'user-assumption' }),
    v({ id: 'a_k', name: 'Half-saturation water', symbol: 'k', definition: 'Water supply at which the water factor equals 0.5', unit: 'mm', value: 150, min: 20, max: 500, step: 10, role: 'parameter', provenance: 'system-hypothesis' }),
    v({ id: 'a_y', name: 'Crop yield', symbol: 'Y', definition: 'Seasonal grain yield', unit: 't/ha', role: 'output', provenance: 'simulated' }),
  ],
  equations: [{ id: 'e_a', label: 'Yield response', expr: 'ymax*exp(-((x-topt)^2)/(2*sigma^2))*w/(w+k)', provenance: 'system-hypothesis', editable: true }],
  assumptions: [
    { id: 'as1', text: 'Temperature and water act multiplicatively and independently.', provenance: 'system-hypothesis' },
    { id: 'as2', text: 'The response is symmetric around the optimum (real crops are usually skewed).', provenance: 'system-hypothesis' },
    { id: 'as3', text: 'Pests, soil, nutrients and timing of stress are ignored.', provenance: 'user-assumption' },
  ],
  limitations: ['All parameter values are illustrative demo values, not estimates for any real crop.', 'No data were used to fit this curve.', 'Does not distinguish heat stress during flowering from season-mean temperature.'],
  hypotheses: [{ id: 'h1', text: 'A few very hot days at flowering reduce yield more than a modestly drier season.', status: 'open', needs: 'Daily temperature records and yields from the same fields, ideally with a flowering-date covariate.' }],
  sourceIds: ['src_idea_field', 'src_fao33'],
  validation: { status: 'demo-data', notes: 'Demonstration model. Not fitted to or checked against any observation.' },
  spec: { kind: 'function', expr: 'ymax*exp(-((x-topt)^2)/(2*sigma^2))*w/(w+k)', xName: 'x', xMin: 0, xMax: 45, xLabel: 'Mean temperature (°C)', yLabel: 'Yield (t/ha)' },
  scenarios: [
    { id: 'sc1', name: 'Baseline', params: { ymax: 8, topt: 24, sigma: 5, w: 450, k: 150 }, createdAt: T0 },
    { id: 'sc2', name: 'Dry season', params: { ymax: 8, topt: 24, sigma: 5, w: 200, k: 150 }, createdAt: T0 },
    { id: 'sc3', name: 'Heat-tolerant cultivar', params: { ymax: 8, topt: 27, sigma: 7, w: 450, k: 150 }, createdAt: T0 },
  ],
  versions: [],
}

const rd = rainfallData()
const modelB: MathModel = {
  id: 'mdl_demo_rain', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
  title: 'Yield vs. seasonal rainfall (regression)',
  description: 'Least-squares fit of yield on seasonal rainfall using 26 SYNTHETIC observations, with confidence and prediction intervals.',
  originalInput: 'Is yield related to how much rain a field receives in a season, and how uncertain is that relationship?',
  kind: 'regression', method: 'Ordinary least squares (polynomial, degree 1–2)',
  methodRationale: 'Paired numeric observations exist, so a statistical model with explicit uncertainty fits the question. Degree 2 lets the curve flatten at high rainfall.',
  concepts: ['crop yield', 'rainfall', 'uncertainty', 'water availability'],
  variables: [
    v({ id: 'b_x', name: 'Seasonal rainfall', symbol: 'rain', definition: 'Total rainfall during the growing season', unit: 'mm', role: 'input', provenance: 'source', sourceId: 'src_demo_data' }),
    v({ id: 'b_y', name: 'Crop yield', symbol: 'Y', definition: 'Seasonal grain yield', unit: 't/ha', role: 'output', provenance: 'source', sourceId: 'src_demo_data' }),
  ],
  equations: [{ id: 'e_b', label: 'Polynomial regression', latex: 'Y_i = \\beta_0 + \\beta_1\\,\\mathrm{rain}_i + \\beta_2\\,\\mathrm{rain}_i^2 + \\varepsilon_i,\\quad \\varepsilon_i\\sim\\mathcal{N}(0,\\sigma^2)', provenance: 'derived', editable: false }],
  assumptions: [
    { id: 'bs1', text: 'Observations are independent and errors are Gaussian with constant variance.', provenance: 'system-hypothesis' },
    { id: 'bs2', text: 'The functional form (polynomial) is a convenient description, not a mechanism.', provenance: 'system-hypothesis' },
  ],
  limitations: ['Synthetic data: the fit demonstrates the method, it says nothing about real crops.', 'Association between rainfall and yield is not evidence of causation (temperature, soil and management are confounders).', 'Extrapolating outside the observed rainfall range is unreliable.'],
  hypotheses: [], sourceIds: ['src_demo_data'],
  validation: { status: 'demo-data', notes: 'Fitted to synthetic data. Fit quality is a property of the generator, not of nature.' },
  spec: { kind: 'regression', x: rd.x, y: rd.y, xLabel: 'Seasonal rainfall (mm)', yLabel: 'Yield (t/ha)', degree: 2 },
  scenarios: [], versions: [],
}

const modelC: MathModel = {
  id: 'mdl_demo_biomass', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
  title: 'Biomass growth under a thermal stress factor',
  description: 'Logistic growth of crop biomass whose rate is scaled by the same Gaussian temperature response used in the yield model. Demo.',
  originalInput: 'How fast does biomass accumulate over the season if temperature slows growth away from the optimum?',
  kind: 'dynamic', method: 'Ordinary differential equation (logistic, RK4 numerical solution)',
  methodRationale: 'The question is about change over time with saturation, which is naturally an ODE. The temperature factor is reused from the existing yield model.',
  concepts: ['crop biomass', 'temperature', 'growth rate', 'optimum'],
  variables: [
    v({ id: 'c_r', name: 'Intrinsic growth rate', symbol: 'r', definition: 'Maximum relative growth rate', unit: '1/day', value: 0.08, min: 0.01, max: 0.2, step: 0.005, role: 'parameter' }),
    v({ id: 'c_K', name: 'Carrying capacity', symbol: 'K', definition: 'Maximum attainable biomass', unit: 't/ha', value: 18, min: 5, max: 30, step: 0.5, role: 'parameter' }),
    v({ id: 'c_T', name: 'Mean temperature', symbol: 'x', definition: 'Constant mean air temperature', unit: '°C', value: 24, min: 5, max: 40, step: 0.5, role: 'input', provenance: 'user-assumption' }),
    v({ id: 'c_topt', name: 'Optimum temperature', symbol: 'topt', definition: 'Temperature at which growth peaks', unit: '°C', value: 24, min: 10, max: 35, step: 0.5, role: 'parameter' }),
    v({ id: 'c_sigma', name: 'Thermal tolerance', symbol: 'sigma', definition: 'Width of the thermal response', unit: '°C', value: 5, min: 1, max: 12, step: 0.1, role: 'parameter' }),
    v({ id: 'c_B0', name: 'Initial biomass', symbol: 'B0', definition: 'Biomass at emergence', unit: 't/ha', value: 0.2, min: 0.05, max: 2, step: 0.05, role: 'parameter', provenance: 'user-assumption' }),
    v({ id: 'c_B', name: 'Biomass', symbol: 'B', definition: 'Standing biomass over time', unit: 't/ha', role: 'state', provenance: 'simulated' }),
  ],
  equations: [{ id: 'e_c', label: 'Logistic growth with thermal factor', expr: 'r*exp(-((x-topt)^2)/(2*sigma^2))*B*(1-B/K)', provenance: 'system-hypothesis', editable: true }],
  assumptions: [
    { id: 'cs1', text: 'Temperature is constant over the season.', provenance: 'user-assumption' },
    { id: 'cs2', text: 'Growth is limited only through K; water and nutrients are not modelled.', provenance: 'system-hypothesis' },
  ],
  limitations: ['Illustrative parameters. Not calibrated to any dataset.', 'No stochasticity: the trajectory is a single deterministic path.'],
  hypotheses: [], sourceIds: ['src_fao33'],
  validation: { status: 'simulated-only', notes: 'Output is a simulation. No observation has been compared to it.' },
  spec: { kind: 'dynamic', states: [{ id: 'B', label: 'Biomass (t/ha)', expr: 'r*exp(-((x-topt)^2)/(2*sigma^2))*B*(1-B/K)', init: 'B0' }], tEnd: 120, tLabel: 'Days after emergence', yLabel: 'Biomass (t/ha)' },
  scenarios: [
    { id: 'sc1', name: 'Optimal temperature', params: { r: 0.08, K: 18, x: 24, topt: 24, sigma: 5, B0: 0.2 }, createdAt: T0 },
    { id: 'sc2', name: 'Heat stress (+6 °C)', params: { r: 0.08, K: 18, x: 30, topt: 24, sigma: 5, B0: 0.2 }, createdAt: T0 },
  ],
  versions: [],
}

const modelD: MathModel = {
  id: 'mdl_demo_alloc', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
  title: 'Land and water allocation between two crops',
  description: 'Linear program: choose hectares of wheat and maize to maximise margin subject to land and water limits. Demo numbers.',
  originalInput: 'With limited land and water, how many hectares of each crop should I plant to maximise margin?',
  kind: 'optimization', method: 'Linear programming (exact vertex enumeration)',
  methodRationale: 'A decision with a linear objective and linear resource limits is a textbook LP; the optimum lies at a vertex of the feasible region.',
  concepts: ['land', 'water availability', 'margin', 'allocation'],
  variables: [
    v({ id: 'd_cx', name: 'Wheat margin', symbol: 'cx', definition: 'Margin per hectare of wheat', unit: '$/ha', value: 420, min: 100, max: 900, step: 10, role: 'parameter', provenance: 'user-assumption' }),
    v({ id: 'd_cy', name: 'Maize margin', symbol: 'cy', definition: 'Margin per hectare of maize', unit: '$/ha', value: 610, min: 100, max: 1200, step: 10, role: 'parameter', provenance: 'user-assumption' }),
    v({ id: 'd_land', name: 'Available land', symbol: 'rhs_land', definition: 'Total cultivable land', unit: 'ha', value: 100, min: 20, max: 200, step: 5, role: 'parameter', provenance: 'user-assumption' }),
    v({ id: 'd_water', name: 'Available water', symbol: 'rhs_water', definition: 'Seasonal irrigation volume', unit: 'ML', value: 480, min: 100, max: 1000, step: 10, role: 'parameter', provenance: 'user-assumption' }),
  ],
  equations: [{ id: 'e_d', label: 'Linear program', latex: '\\max_{x,y\\ge 0}\; c_x x + c_y y \\quad\\text{s.t.}\\quad x+y\\le L,\; 3x+7y\\le W', provenance: 'system-hypothesis', editable: false }],
  assumptions: [
    { id: 'ds1', text: 'Margins and water use per hectare are constant (no economies of scale, no price response).', provenance: 'user-assumption' },
    { id: 'ds2', text: 'Water use: wheat 3 ML/ha and maize 7 ML/ha (illustrative).', provenance: 'user-assumption' },
  ],
  limitations: ['Deterministic: ignores price and yield risk.', 'All coefficients are demo values.'],
  hypotheses: [], sourceIds: [],
  validation: { status: 'unvalidated', notes: 'A normative model: it computes the best choice given the stated inputs, it does not describe observed behaviour.' },
  spec: { kind: 'optimization', xName: 'Wheat (ha)', yName: 'Maize (ha)', cx: 420, cy: 610, objectiveLabel: 'margin ($)',
    constraints: [{ id: 'land', label: 'Land', a: 1, b: 1, rhs: 100 }, { id: 'water', label: 'Water', a: 3, b: 7, rhs: 480 }] },
  scenarios: [], versions: [],
}

const modelE: MathModel = {
  id: 'mdl_demo_causal', version: 1, isDemo: true, createdAt: T0, updatedAt: T0,
  title: 'Qualitative causal map of crop yield',
  description: 'Signed causal hypotheses linking climate, soil water and management to yield. A conceptual map, not an estimated causal model.',
  originalInput: 'What drives crop yield, and in which direction does each factor push?',
  kind: 'causal', method: 'Signed directed graph (qualitative causal hypotheses)',
  methodRationale: 'No quantities are available, but the claim has causal structure. A signed graph makes the assumed directions explicit and lets us trace which effects are ambiguous.',
  concepts: ['crop yield', 'rainfall', 'temperature', 'soil moisture', 'evapotranspiration', 'fertilizer'],
  variables: [
    v({ id: 'e_rain', name: 'Rainfall', symbol: 'rain', definition: 'Seasonal rainfall', unit: 'mm', role: 'concept' }),
    v({ id: 'e_temp', name: 'Temperature', symbol: 'temp', definition: 'Mean air temperature', unit: '°C', role: 'concept' }),
    v({ id: 'e_et', name: 'Evapotranspiration', symbol: 'et', definition: 'Water lost to air via soil and plants', unit: 'mm', role: 'concept' }),
    v({ id: 'e_sm', name: 'Soil moisture', symbol: 'sm', definition: 'Plant-available water in the root zone', unit: 'mm', role: 'concept' }),
    v({ id: 'e_fert', name: 'Fertilizer', symbol: 'fert', definition: 'Applied nutrient', unit: 'kg/ha', role: 'concept' }),
    v({ id: 'e_yield', name: 'Crop yield', symbol: 'Y', definition: 'Seasonal grain yield', unit: 't/ha', role: 'concept' }),
  ],
  equations: [],
  assumptions: [{ id: 'es1', text: 'Edges encode hypothesised direction of effect; they were not identified from data.', provenance: 'system-hypothesis' }],
  limitations: ['Correlation in data would NOT establish these edges.', 'Temperature → yield is non-monotonic (see the temperature-response model), so its sign is marked ambiguous.', 'No interaction or lag structure.'],
  hypotheses: [{ id: 'h_e1', text: 'Fertilizer response is conditional on soil moisture.', status: 'open', needs: 'Factorial field trial varying fertilizer and irrigation.' }],
  sourceIds: ['src_fao56', 'src_idea_field'],
  validation: { status: 'unvalidated', notes: 'Hypothesised structure only.' },
  spec: { kind: 'causal', gaps: ['Strength of every edge is unknown.', 'Lag between rainfall and soil moisture is not specified.', 'Management confounders (sowing date, cultivar) are absent.'],
    nodes: [
      { id: 'rain', label: 'Rainfall', x: 90, y: 70 }, { id: 'temp', label: 'Temperature', x: 90, y: 250 },
      { id: 'et', label: 'Evapotranspiration', x: 310, y: 250 }, { id: 'sm', label: 'Soil moisture', x: 310, y: 100 },
      { id: 'fert', label: 'Fertilizer', x: 530, y: 20 }, { id: 'yield', label: 'Crop yield', x: 540, y: 170 },
    ],
    edges: [
      { id: 'g1', from: 'rain', to: 'sm', sign: 1, note: 'More rain, more stored soil water.' },
      { id: 'g2', from: 'temp', to: 'et', sign: 1, note: 'Warmer air raises evaporative demand.' },
      { id: 'g3', from: 'et', to: 'sm', sign: -1, note: 'Water lost to the atmosphere depletes soil water.' },
      { id: 'g4', from: 'sm', to: 'yield', sign: 1, note: 'Water supply supports growth (saturating, see yield model).' },
      { id: 'g5', from: 'fert', to: 'yield', sign: 1, note: 'Nutrient supply raises yield up to a limit.' },
      { id: 'g6', from: 'temp', to: 'yield', sign: 0, note: 'Unimodal: sign depends on whether temperature is below or above the optimum.' },
    ] },
  scenarios: [], versions: [],
}

export const DEMO_MODELS: MathModel[] = [modelA, modelB, modelC, modelD, modelE]

const rel = (id: string, from: string, to: string, type: Relation['type'], justification: string): Relation => ({ id, from, to, type, justification, status: 'accepted', createdAt: T0 })
export const DEMO_RELATIONS: Relation[] = [
  rel('r1', 'mdl_demo_biomass', 'mdl_demo_temp', 'depends-on', 'The biomass model reuses the Gaussian temperature factor exp(−(x−topt)²/2σ²) defined in the yield-response model.'),
  rel('r2', 'mdl_demo_rain', 'mdl_demo_temp', 'compatible-with', 'Both describe yield; they use different drivers (rainfall vs temperature) and can be combined in a multi-factor model. Units match (t/ha).'),
  rel('r3', 'mdl_demo_causal', 'mdl_demo_temp', 'specialization-of', 'The causal map’s temperature → yield edge is made quantitative by the temperature-response curve.'),
  rel('r4', 'mdl_demo_causal', 'mdl_demo_rain', 'requires-evidence-of', 'The rain → soil moisture → yield pathway needs data beyond the rainfall–yield association to be causal.'),
  rel('r5', 'mdl_demo_alloc', 'mdl_demo_rain', 'compatible-with', 'The allocation model’s water constraint could be informed by expected yield under a given water supply.'),
]

export function demoExperiments(): Experiment[] {
  const a = DEMO_MODELS[0]
  const rows = a.scenarios.map((s) => {
    const m = metric(a, { ...baseParams(a), ...s.params })
    return { label: s.name, value: m ? `${m.value.toFixed(2)} (${m.label})` : 'n/a' }
  })
  return [{
    id: 'exp_demo_1', modelId: a.id, name: 'Scenario comparison — baseline vs dry vs heat-tolerant', type: 'scenario-comparison', rows,
    provenance: 'simulated', note: 'Simulated with demo parameters. These are model outputs, not observations.', createdAt: T0,
  }]
}

export function seedDB(): DB {
  return {
    schema: 1, seeded: true,
    models: structuredClone(DEMO_MODELS), sources: structuredClone(DEMO_SOURCES),
    relations: structuredClone(DEMO_RELATIONS), experiments: demoExperiments(),
    conversations: [],
  }
}
