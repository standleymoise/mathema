// Plan features: every value here is ENFORCED by the server (not just displayed).
//   researchPremium  Research mode may use the premium model (otherwise it uses the default model)
//   cloudSync        the account document may be written to the server (reading it back stays allowed)
//   maxModels        max non-demo models stored in the account (null = unlimited)
//   aiMaxChars       max length of an idea sent to the AI (hard cap 12000)
export const HARD_MAX_CHARS = 12000
export const DEFAULT_FEATURES = { researchPremium: true, cloudSync: true, maxModels: null, aiMaxChars: HARD_MAX_CHARS }
// Applied once to the seeded plans of an existing database that has no features yet.
export const SEED_FEATURES = {
  free: { researchPremium: false, cloudSync: true, maxModels: 50, aiMaxChars: 4000 },
  pro: { researchPremium: true, cloudSync: true, maxModels: null, aiMaxChars: HARD_MAX_CHARS },
}

export function parseFeatures(raw) {
  let j = {}
  try { j = typeof raw === 'string' && raw ? JSON.parse(raw) : raw && typeof raw === 'object' ? raw : {} } catch { j = {} }
  const n = Number(j.aiMaxChars)
  const m = j.maxModels === null || j.maxModels === undefined ? null : Number(j.maxModels)
  return {
    researchPremium: j.researchPremium === undefined ? DEFAULT_FEATURES.researchPremium : !!j.researchPremium,
    cloudSync: j.cloudSync === undefined ? DEFAULT_FEATURES.cloudSync : !!j.cloudSync,
    maxModels: m !== null && Number.isInteger(m) && m >= 1 ? m : null,
    aiMaxChars: Number.isInteger(n) ? Math.min(HARD_MAX_CHARS, Math.max(200, n)) : HARD_MAX_CHARS,
  }
}
/** Returns an error string or the normalised features. */
export function validateFeatures(f) {
  if (!f || typeof f !== 'object') return 'features must be an object'
  if (f.maxModels !== null && f.maxModels !== undefined && f.maxModels !== '' && (!Number.isInteger(Number(f.maxModels)) || Number(f.maxModels) < 1 || Number(f.maxModels) > 100000)) return 'maxModels must be empty (unlimited) or 1-100000'
  if (f.aiMaxChars !== undefined && (!Number.isInteger(Number(f.aiMaxChars)) || Number(f.aiMaxChars) < 200 || Number(f.aiMaxChars) > HARD_MAX_CHARS)) return `aiMaxChars must be 200-${HARD_MAX_CHARS}`
  return parseFeatures({ ...f, maxModels: f.maxModels === '' ? null : f.maxModels })
}

/** Features of the plan a user is on. Admins are never restricted. */
export async function featuresFor(pool, user) {
  if (user.role === 'admin') return DEFAULT_FEATURES
  const [[p]] = await pool.query('SELECT features FROM plans WHERE id=?', [user.plan_id])
  return parseFeatures(p?.features)
}
