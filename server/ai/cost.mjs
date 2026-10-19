// Cost = tokens x admin-entered price. If a price is missing the cost is 0 and the row is flagged,
// so the finance panel never presents an invented number as real spend.
const CACHE_WRITE = 1.25 // Anthropic cache write multiplier
const CACHE_READ = 0.1 // Anthropic cache read multiplier

export function computeCost(provider, usage, price) {
  if (!price || price.input_per_mtok == null || price.output_per_mtok == null) return { cost: 0, missing: true }
  const inP = Number(price.input_per_mtok), outP = Number(price.output_per_mtok)
  const cw = provider === 'anthropic' ? CACHE_WRITE : 1
  const cr = provider === 'anthropic' ? CACHE_READ : 0.5
  const cost = (usage.input * inP + usage.cacheWrite * inP * cw + usage.cacheRead * inP * cr + usage.output * outP) / 1e6
  return { cost: Math.round(cost * 1e6) / 1e6, missing: false }
}
