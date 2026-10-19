// Contrast audit (WCAG AA) over the built app: npx vite build && npx vite preview --port 4173 &  then  node scripts/contrast-audit.mjs dark|light
// Requires playwright to be resolvable (adjust the import path to your install).
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs'
const theme = process.argv[2] || 'dark'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 1000 } })
await p.addInitScript((t) => { localStorage.setItem('mathema:theme', t) }, theme)
const audit = () => p.evaluate(() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r,g,b,a=1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a } }
  const over = (f, bgc) => ({ r: f.r*f.a + bgc.r*(1-f.a), g: f.g*f.a + bgc.g*(1-f.a), b: f.b*f.a + bgc.b*(1-f.a), a: 1 })
  const lum = ({r,g,b}) => { const f = (v) => { v/=255; return v<=0.03928? v/12.92 : ((v+0.055)/1.055)**2.4 }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b) }
  const ratio = (a,b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05) }
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break } } let base = { r: 24, g: 23, b: 21, a: 1 }; const bodyBg = parse(getComputedStyle(document.body).backgroundColor); if (bodyBg && bodyBg.a>0) base = bodyBg; let cur = stack.length && stack[stack.length-1].a >= 1 ? stack.pop() : base; while (stack.length) cur = over(stack.pop(), cur); return cur }
  const out = []
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (w.nextNode()) {
    const t = w.currentNode.textContent.trim(); const el = w.currentNode.parentElement
    if (!t || !el || ['SCRIPT','STYLE'].includes(el.tagName)) continue
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue
    const isSvg = el instanceof SVGElement
    const fg = parse(isSvg ? cs.fill : cs.color); if (!fg) continue
    const bg = bgOf(isSvg ? (el.closest('svg')?.parentElement ?? el) : el)
    const f = fg.a < 1 ? over(fg, bg) : fg
    const ra = ratio(f, bg); const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700)
    if (ra < (large ? 3 : 4.5)) out.push({ t: t.slice(0, 40), ra: +ra.toFixed(2), fg: cs.color, tag: el.tagName, cls: String(el.className?.baseVal ?? el.className).slice(0, 50) })
  }
  return out
})
const seen = new Map()
const run = async (tag) => { for (const x of await audit()) { const k = x.t + '|' + x.cls; if (!seen.has(k)) seen.set(k, { ...x, tag }) } }
const go = async () => { await p.goto('http://localhost:4173/'); await p.waitForTimeout(500) }
await go(); await run('home')
for (let i = 0; i < 11; i++) {
  await go(); await p.locator('button.group').nth(i).click(); await p.waitForTimeout(800)
  await run('ex'+i)
  const nW = await p.locator('.recharts-wrapper').count(); for (let k = 0; k < nW; k++) { const w = p.locator('.recharts-wrapper').nth(k); await w.scrollIntoViewIfNeeded(); const bb = await w.boundingBox(); if (bb) { for (const fx of [0.3, 0.7]) { await p.mouse.move(bb.x + bb.width*fx, bb.y + bb.height*0.3); await p.waitForTimeout(250); await run('ex'+i+'-tip'+k) } } }
  const det = p.getByRole('button', { name: /details|detalles/i }); if (await det.count()) { await det.first().click().catch(()=>{}); await p.waitForTimeout(300); await run('ex'+i+'-det') }
}
for (const name of [/My models/, /Experiments/, /Universe/, /Documents/, /Settings/, /Plans/, /Terms/, /Privacy/, /notice/]) { await go(); const bt = p.getByRole('button', { name }).first(); if (await bt.count()) { await bt.click().catch(()=>{}); await p.waitForTimeout(600); await run(String(name)) } }
await go(); await p.locator('textarea').fill('Más lluvia aumenta el rendimiento, pero el calor reduce el rendimiento.'); await p.keyboard.press('Enter'); await p.waitForTimeout(2500); await run('idea')
console.log(theme, 'issues:', seen.size)
for (const [, v] of seen) console.log(String(v.ra).padEnd(5), v.tag.padEnd(10), v.tag, '|', v.t, '|', v.fg, '|', v.cls)
await b.close()
