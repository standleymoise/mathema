import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minus, Plus, Search, X } from 'lucide-react'
import { buildUniverse, relationLabel, type NodeType, type UEdge, type UNode } from '../../core/memory'
import type { RelationType } from '../../core/types'
import { Btn, IconBtn, cx } from '../common'
import { records, ui, useStore, useT } from '../../store/store'
import { tr } from '../../core/text'

interface P { x: number; y: number; vx: number; vy: number; pin: boolean }
const TYPE_COLOR: Record<NodeType, string> = {
  model: 'var(--s1)', idea: 'rgb(var(--mute))', concept: 'var(--s3)', variable: 'var(--s5)', equation: 'var(--s4)',
  source: 'var(--s2)', document: 'var(--s2)', experiment: 'var(--s4)', hypothesis: 'rgb(var(--warn))', result: 'rgb(var(--ok))',
}
const TYPE_R: Record<NodeType, number> = { model: 15, idea: 7, concept: 9, variable: 8, equation: 7, source: 10, document: 10, experiment: 9, hypothesis: 8, result: 8 }
const EDGE_COLOR: Record<RelationType, string> = {
  'depends-on': 'rgb(var(--mute))', 'equivalent-to': 'var(--s3)', 'specialization-of': 'var(--s4)', contradicts: 'rgb(var(--bad))', 'derived-from': 'var(--s2)',
  'same-data-as': 'var(--s5)', 'compatible-with': 'var(--s3)', 'validated-by': 'rgb(var(--ok))', 'requires-evidence-of': 'rgb(var(--warn))', 'shares-variables-with': 'var(--s5)', contains: 'rgb(var(--line))',
}
const TYPES: NodeType[] = ['model', 'idea', 'concept', 'variable', 'equation', 'source', 'document', 'experiment', 'hypothesis', 'result']
const TYPE_LABEL: Record<NodeType, [string, string]> = {
  model: ['Models', 'Modelos'], idea: ['Ideas', 'Ideas'], concept: ['Concepts', 'Conceptos'], variable: ['Variables', 'Variables'], equation: ['Equations', 'Ecuaciones'],
  source: ['Sources', 'Fuentes'], document: ['Documents', 'Documentos'], experiment: ['Experiments', 'Experimentos'], hypothesis: ['Hypotheses', 'Hipótesis'], result: ['Results', 'Resultados'],
}

export default function Universe() {
  const t = useT()
  const lang = useStore((s) => s.ui.lang)
  const db = useStore((s) => s.db)
  const focusId = useStore((s) => s.ui.focusId)
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set<NodeType>(['idea', 'equation']))
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [legend, setLegend] = useState(false)
  const [, bump] = useState(0)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 560 })
  const pos = useRef(new Map<string, P>())
  const raf = useRef(0)
  const alpha = useRef(0)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<null | { type: 'pan'; sx: number; sy: number; vx: number; vy: number } | { type: 'node'; id: string; moved: boolean; sx: number; sy: number } | { type: 'pinch'; d: number; k: number }>(null)

  const graph = useMemo(() => {
    const g = buildUniverse(db, lang)
    const nodes = g.nodes.filter((n) => !hidden.has(n.type))
    const ids = new Set(nodes.map((n) => n.id))
    return { nodes, edges: g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) }
  }, [db, lang, hidden])
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])

  const step = useCallback((a: number) => {
    const P = pos.current
    const arr = graph.nodes.map((n) => P.get(n.id)!).filter(Boolean)
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      let dx = arr[i].x - arr[j].x, dy = arr[i].y - arr[j].y
      let d2 = dx * dx + dy * dy
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1 }
      const f = Math.min((9000 * a) / d2, 14), d = Math.sqrt(d2)
      arr[i].vx += (dx / d) * f; arr[i].vy += (dy / d) * f; arr[j].vx -= (dx / d) * f; arr[j].vy -= (dy / d) * f
    }
    for (const e of graph.edges) {
      const A = P.get(e.from), B = P.get(e.to)
      if (!A || !B) continue
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1
      const len = e.type === 'contains' ? 60 : byId.get(e.from)?.type === 'model' && byId.get(e.to)?.type === 'model' ? 230 : 130
      const f = (d - len) * 0.03 * a
      A.vx += (dx / d) * f; A.vy += (dy / d) * f; B.vx -= (dx / d) * f; B.vy -= (dy / d) * f
    }
    for (const p of arr) { p.vx -= p.x * 0.004 * a; p.vy -= p.y * 0.004 * a }
    for (const p of arr) { if (p.pin) { p.vx = p.vy = 0; continue } p.x += p.vx; p.y += p.vy; p.vx *= 0.6; p.vy *= 0.6 }
  }, [graph, byId])

  const fit = useCallback(() => {
    const ps = graph.nodes.map((n) => pos.current.get(n.id)).filter(Boolean) as P[]
    if (!ps.length) return
    const minX = Math.min(...ps.map((p) => p.x)) - 130, maxX = Math.max(...ps.map((p) => p.x)) + 130
    const minY = Math.min(...ps.map((p) => p.y)) - 50, maxY = Math.max(...ps.map((p) => p.y)) + 60
    const k = Math.min(size.w / (maxX - minX), size.h / (maxY - minY), 1.4)
    setView({ k, x: size.w / 2 - ((minX + maxX) / 2) * k, y: size.h / 2 - ((minY + maxY) / 2) * k })
  }, [graph, size])

  // (re)layout when graph structure changes
  const sig = graph.nodes.map((n) => n.id).join('|') + graph.edges.length
  useEffect(() => {
    const P = pos.current
    const ids = new Set(graph.nodes.map((n) => n.id))
    for (const id of [...P.keys()]) if (!ids.has(id)) P.delete(id)
    graph.nodes.forEach((n, i) => { if (!P.has(n.id)) { const a = (i / graph.nodes.length) * Math.PI * 2; const r = 160 + (i % 6) * 55; P.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, pin: false }) } })
    for (let i = 0; i < 500; i++) { const a = Math.pow(1 - i / 500, 2) * 1.0 + 0.02; step(a) }
    bump((n) => n + 1)
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  useEffect(() => { fit() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [size.w, size.h])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  useEffect(() => {
    if (focusId && byId.has(focusId)) { setSel(focusId); centerOn(focusId); ui.clearFocus() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, byId])

  const run = () => {
    alpha.current = 0.35
    cancelAnimationFrame(raf.current)
    const loop = () => { step(alpha.current); alpha.current *= 0.965; bump((n) => n + 1); if (alpha.current > 0.01 || gesture.current?.type === 'node') raf.current = requestAnimationFrame(loop) }
    raf.current = requestAnimationFrame(loop)
  }
  const centerOn = (id: string) => { const p = pos.current.get(id); if (p) setView((v) => ({ ...v, x: size.w / 2 - p.x * v.k, y: size.h / 2 - p.y * v.k })) }
  const zoomAt = (cx: number, cy: number, f: number) => setView((v) => { const k = Math.max(0.25, Math.min(3, v.k * f)); return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k } })
  const local = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  const onDown = (e: React.PointerEvent) => {
    const lp = local(e); pointers.current.set(e.pointerId, lp)
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }
      return
    }
    const nodeEl = (e.target as Element).closest('[data-node]')
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-node')!
      const p = pos.current.get(id); if (p) p.pin = true
      gesture.current = { type: 'node', id, moved: false, sx: lp.x, sy: lp.y }
      run()
    } else gesture.current = { type: 'pan', sx: lp.x, sy: lp.y, vx: view.x, vy: view.y }
  }
  const onMove = (e: React.PointerEvent) => {
    const lp = local(e)
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, lp)
    const g = gesture.current
    if (!g) return
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const target = Math.max(0.25, Math.min(3, g.k * (d / g.d)))
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / view.k)
    } else if (g.type === 'pan') setView((v) => ({ ...v, x: g.vx + lp.x - g.sx, y: g.vy + lp.y - g.sy }))
    else if (g.type === 'node') {
      if (Math.hypot(lp.x - g.sx, lp.y - g.sy) > 4) g.moved = true
      const p = pos.current.get(g.id)
      if (p && g.moved) { p.x = (lp.x - view.x) / view.k; p.y = (lp.y - view.y) / view.k; alpha.current = Math.max(alpha.current, 0.2) }
    }
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g?.type === 'node') {
      const p = pos.current.get(g.id); if (p) p.pin = false
      if (!g.moved) setSel((s) => (s === g.id ? null : g.id))
    }
    if (g?.type === 'pan' && Math.hypot(local(e).x - g.sx, local(e).y - g.sy) < 4) setSel(null)
    if (pointers.current.size === 0) gesture.current = null
  }

  const needle = q.trim().toLowerCase()
  const matches = needle ? graph.nodes.filter((n) => (n.label + ' ' + n.detail).toLowerCase().includes(needle)) : []
  const matchSet = new Set(matches.map((m) => m.id))
  const selNode = sel ? byId.get(sel) : undefined
  const adj = useMemo(() => {
    const m = new Map<string, UEdge[]>()
    for (const e of graph.edges) { (m.get(e.from) ?? m.set(e.from, []).get(e.from)!).push(e); (m.get(e.to) ?? m.set(e.to, []).get(e.to)!).push(e) }
    return m
  }, [graph])
  const near = new Set<string>(sel ? [sel, ...(adj.get(sel) ?? []).flatMap((e) => [e.from, e.to])] : [])
  const dim = (id: string) => (sel ? !near.has(id) : needle ? !matchSet.has(id) : false)
  const trunc = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  const usedTypes = new Set(buildUniverse(db, lang).nodes.map((n) => n.type))

  const NodeDetail = ({ n }: { n: UNode }) => {
    const edges = adj.get(n.id) ?? []
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-2 p-4 pb-2">
          <div className="min-w-0"><div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute"><span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[n.type] }} />{TYPE_LABEL[n.type][lang === 'es' ? 1 : 0]}</div><h3 className="serif break-words text-xl leading-snug">{n.label}</h3></div>
          <IconBtn label={t('cancel')} onClick={() => setSel(null)} className="-mr-2 -mt-1"><X size={18} /></IconBtn>
        </div>
        <div className="scroll min-h-0 flex-1 px-4 pb-4">
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-mute">{n.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {n.ref?.model && byId.get(n.ref.model) && n.type === 'model' && <Btn size="sm" variant="primary" onClick={() => ui.selectModel(n.ref!.model!, { workspace: true })}>{t('open')}</Btn>}
            {n.ref?.source && <Btn size="sm" variant="outline" onClick={() => ui.openSource(n.ref!.source!)}>{tr(lang, 'View source', 'Ver fuente')}</Btn>}
            {n.ref?.model && n.type !== 'model' && <Btn size="sm" variant="outline" onClick={() => ui.selectModel(n.ref!.model!, { workspace: true })}>{tr(lang, 'Open its model', 'Abrir su modelo')}</Btn>}
          </div>
          <div className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{tr(lang, 'Connections', 'Conexiones')} ({edges.length})</div>
          <ul className="space-y-3">
            {edges.map((e) => {
              const out = e.from === n.id, other = byId.get(out ? e.to : e.from)!
              return (
                <li key={e.id} className="text-[13px]">
                  <div><span className="text-mute">{out ? '' : '← '}{relationLabel(e.type, lang)}{out ? ' →' : ''}</span>{' '}
                    <button className="font-medium text-accent hover:underline" onClick={() => { setSel(other.id); centerOn(other.id) }}>{trunc(other.label, 40)}</button>
                    {e.inferred && <span className="ml-1.5 rounded-full bg-[rgb(var(--warn)/.14)] px-1.5 py-px text-[10.5px] text-warn">{tr(lang, 'inferred', 'inferido')}</span>}</div>
                  <div className="text-[12px] leading-snug text-mute">{e.justification}</div>
                  {e.relationId && <button className="mt-0.5 text-[12px] text-mute hover:text-bad hover:underline" onClick={() => records.removeRelation(e.relationId!)}>{tr(lang, 'Remove link', 'Quitar vínculo')}</button>}
                </li>
              )
            })}
            {edges.length === 0 && <li className="text-[13px] text-mute">—</li>}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { setSel(matches[0].id); centerOn(matches[0].id) } }} placeholder={t('searchUniverse')} aria-label={t('searchUniverse')} className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent" />
        </div>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5" role="group" aria-label={t('allTypes')}>
          {TYPES.filter((ty) => usedTypes.has(ty)).map((ty) => (
            <button key={ty} aria-pressed={!hidden.has(ty)} onClick={() => setHidden((h) => { const n = new Set(h); n.has(ty) ? n.delete(ty) : n.add(ty); return n })}
              className={cx('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors', hidden.has(ty) ? 'border-line text-mute line-through opacity-60' : 'border-line text-ink hover:bg-sunk')}>
              <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[ty] }} />{TYPE_LABEL[ty][lang === 'es' ? 1 : 0]}
            </button>))}
        </div>
      </div>
      {needle && <div className="border-b border-line px-4 py-1.5 text-xs text-mute" aria-live="polite">{matches.length} {tr(lang, 'matches', 'coincidencias')}{matches.length > 0 && ` — ${tr(lang, 'Enter to jump to the first', 'Enter para ir a la primera')}`}</div>}
      <div className="relative flex min-h-0 flex-1">
        <div ref={box} className="relative min-w-0 flex-1 touch-none overflow-hidden bg-bg" onWheel={(e) => { const p = local(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12) }}>
          <svg width={size.w} height={size.h} className="block select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="img" aria-label={tr(lang, 'Interactive knowledge graph. Nodes are focusable with Tab; Enter selects.', 'Grafo de conocimiento interactivo. Los nodos se enfocan con Tab; Enter selecciona.')}>
            <defs><marker id="u-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="rgb(var(--mute))" /></marker></defs>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {graph.edges.map((e) => {
                const A = pos.current.get(e.from), B = pos.current.get(e.to)
                if (!A || !B) return null
                const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1
                const rb = TYPE_R[byId.get(e.to)!.type] + 3
                const active = sel && (e.from === sel || e.to === sel)
                const faded = sel ? !active : needle ? !(matchSet.has(e.from) || matchSet.has(e.to)) : false
                return (
                  <g key={e.id} opacity={faded ? 0.1 : 1}>
                    <line x1={A.x} y1={A.y} x2={B.x - (dx / d) * rb} y2={B.y - (dy / d) * rb} stroke={EDGE_COLOR[e.type]} strokeWidth={active ? 2 : e.type === 'contains' ? 1 : 1.3} strokeDasharray={e.inferred ? '4 4' : undefined} markerEnd={e.type === 'contains' ? undefined : 'url(#u-arr)'} />
                    {active && <text x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 4} textAnchor="middle" fontSize={10} fill="rgb(var(--ink))" stroke="rgb(var(--bg))" strokeWidth={3} paintOrder="stroke">{relationLabel(e.type, lang)}</text>}
                  </g>
                )
              })}
              {graph.nodes.map((n) => {
                const p = pos.current.get(n.id)
                if (!p) return null
                const r = TYPE_R[n.type], isSel = sel === n.id
                return (
                  <g key={n.id} data-node={n.id} transform={`translate(${p.x} ${p.y})`} opacity={dim(n.id) ? 0.18 : 1} className="cursor-pointer"
                    tabIndex={0} role="button" aria-label={`${n.label} (${n.type})`} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(isSel ? null : n.id))}>
                    <circle r={r + 8} fill="transparent" />
                    {isSel && <circle r={r + 5} fill="none" stroke="rgb(var(--accent))" strokeWidth={2} />}
                    <circle r={r} fill={n.type === 'document' ? 'rgb(var(--surface))' : TYPE_COLOR[n.type]} stroke={n.type === 'document' ? TYPE_COLOR[n.type] : 'rgb(var(--bg))'} strokeWidth={n.type === 'document' ? 2.5 : 1.5} />
                    {n.type === 'equation' && <text textAnchor="middle" y={3.5} fontSize={9} fill="rgb(var(--bg))" fontWeight={700}>f</text>}
                    {(n.type === 'model' || isSel || (sel ? near.has(n.id) : false) || matchSet.has(n.id) || view.k >= 1.15) && <text y={r + 13} textAnchor="middle" fontSize={n.type === 'model' ? 12 : 10.5} fontWeight={n.type === 'model' ? 600 : 400} fill="rgb(var(--ink))" stroke="rgb(var(--bg))" strokeWidth={3.5} paintOrder="stroke" pointerEvents="none">{trunc(n.label, n.type === 'model' ? 34 : 26)}</text>}
                  </g>
                )
              })}
            </g>
          </svg>
          <div className="absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <IconBtn label={t('zoomIn')} onClick={() => zoomAt(size.w / 2, size.h / 2, 1.3)}><Plus size={17} /></IconBtn>
            <IconBtn label={t('zoomOut')} onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.3)}><Minus size={17} /></IconBtn>
            <IconBtn label={t('fit')} onClick={fit}><Maximize2 size={16} /></IconBtn>
          </div>
          <div className="absolute right-3 top-3 max-w-[16rem]">
            <button onClick={() => setLegend(!legend)} aria-expanded={legend} className="ml-auto block rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium shadow-sm">{tr(lang, 'Legend', 'Leyenda')}</button>
            {legend && <div className="fade-in mt-1.5 rounded-xl border border-line bg-surface p-3 text-[12px] shadow-md">
              {([...new Set(graph.edges.map((e) => e.type))] as RelationType[]).map((rt) => <div key={rt} className="flex items-center gap-2 py-0.5"><span className="inline-block h-0.5 w-6" style={{ background: EDGE_COLOR[rt] }} />{relationLabel(rt, lang)}</div>)}
              <div className="mt-1.5 flex items-center gap-2 border-t border-line pt-1.5 text-mute"><span className="inline-block w-6 border-t-2 border-dashed border-mute" />{tr(lang, 'inferred (not confirmed)', 'inferido (no confirmado)')}</div>
            </div>}
          </div>
          {graph.nodes.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-mute">{t('empty')}</div>}
          {!sel && graph.nodes.length > 0 && <p className="pointer-events-none absolute inset-x-0 bottom-3 hidden text-center text-xs text-mute sm:block">{t('selectNode')}</p>}
        </div>
        {/* details: side panel on desktop, bottom sheet on mobile */}
        {selNode && <aside aria-label="Node details" className="fade-in absolute inset-x-0 bottom-0 z-20 max-h-[58%] rounded-t-2xl border-t border-line bg-surface shadow-2xl md:static md:max-h-none md:w-[340px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none"><NodeDetail n={selNode} /></aside>}
      </div>
    </div>
  )
}
