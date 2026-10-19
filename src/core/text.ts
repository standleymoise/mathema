const STOP = new Set((
  'the a an and or but if then of in on at to for from by with as is are was were be been being it its this that these those there here which who whom whose what when where why how ' +
  'not no yes can could should would may might will shall do does did done have has had having more most less least very much many some any each every all both such than too also only just over under into onto out up down ' +
  'i we you they he she them us our your their my me his her about between because so while per via ' +
  'el la los las un una unos unas y o pero si entonces de del en a al para por con sin como es son era eran ser ha han he hay lo le les se su sus mi mis tu tus nuestro nuestra que cual quien donde cuando porque muy mas menos tambien solo sobre entre esta este estos estas eso esa ese cada todo todos toda todas puede pueden'
).split(' '))

export const isStop = (w: string) => STOP.has(w)
export const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

export function words(s: string): string[] {
  return strip(s.toLowerCase()).split(/[^a-z0-9ñ_]+/).filter(Boolean)
}
export function contentWords(s: string): string[] {
  return words(s).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w))
}
/** Light stemmer so "yields"/"yield", "cultivos"/"cultivo" collide. */
export function stem(w: string): string {
  return w.replace(/(ing|ed|es|s|ción|ciones)$/, (m) => (w.length - m.length >= 4 ? '' : m))
}
export function normName(s: string): string {
  return contentWords(s).map(stem).sort().join(' ')
}
export function termSet(s: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const w of contentWords(s)) m.set(stem(w), (m.get(stem(w)) ?? 0) + 1)
  return m
}
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0
  for (const [, v] of a) na += v * v
  for (const [, v] of b) nb += v * v
  for (const [k, v] of a) dot += v * (b.get(k) ?? 0)
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}
export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
export const now = () => new Date().toISOString()
export const tr = (lang: 'en' | 'es', en: string, es: string) => (lang === 'es' ? es : en)
export function symbolFor(name: string, used: Set<string>): string {
  const base = (strip(name).replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).map((w, i) => (i === 0 ? w.slice(0, 3).toLowerCase() : w.slice(0, 1).toUpperCase())).join('') || 'v')
  let s = /^[A-Za-z]/.test(base) ? base : `v${base}`
  let i = 2
  while (used.has(s)) s = `${base}${i++}`
  used.add(s)
  return s
}
