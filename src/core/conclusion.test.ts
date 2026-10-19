import { describe, expect, it } from 'vitest'
import { EXAMPLES, exampleModel } from './examples'
import { baseParams } from './engine/runtime'
import { buildConclusion, buildReport, toHtml, toMarkdown, toPlain } from './conclusion'

describe('conclusion & report', () => {
  for (const lang of ['en', 'es'] as const) for (const e of EXAMPLES) {
    it(`${e.id} (${lang}) gives a hedged, NaN-free conclusion and exports`, () => {
      const m = exampleModel(e.id, lang)!
      const p = baseParams(m)
      const c = buildConclusion(m, p, m.spec, lang)
      expect(c.headline.length).toBeGreaterThan(20)
      const r = buildReport(m, p, m.spec, lang, 'my note')
      const md = toMarkdown(r, 'f'), tx = toPlain(r), html = toHtml(r, 'f', lang)
      for (const s of [c.headline, ...c.points, md, tx, html]) { expect(s).not.toMatch(/NaN|undefined|Infinity/) }
      expect(md).toContain('my note'); expect(html).toContain('<h1>'); expect(c.caveats.join(' ')).toMatch(lang === 'es' ? /hipótesis/ : /hypothesis/)
    })
  }
  it('reflects changed parameters', () => {
    const m = exampleModel('mdl_demo_business', 'en')!
    const a = buildConclusion(m, baseParams(m), m.spec, 'en').headline
    const b = buildConclusion(m, { ...baseParams(m), burn: 0 }, m.spec, 'en').headline
    expect(a).not.toBe(b)
  })
})
