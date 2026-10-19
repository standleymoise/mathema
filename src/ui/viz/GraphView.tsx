import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { GraphSpec, MathModel } from '../../core/types'
import { propagateSigns } from '../../core/engine/runtime'
import { Btn, Label, cx } from '../common'
import { uid } from '../../core/text'
import type { Working } from '../models/working'

const W = 640, H = 340
export default function GraphView({ model, w }: { model: MathModel; w: Working }) {
  const spec = (w.spec.kind === 'causal' || w.spec.kind === 'conceptual' ? w.spec : model.spec) as GraphSpec
  const [sel, setSel] = useState<string | null>(null)
  const [dir, setDir] = useState<1 | -1>(1)
  const [edgeSel, setEdgeSel] = useState<string | null>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [sign, setSign] = useState<'1' | '-1' | '0'>('1'), [note, setNote] = useState('')
  const [label, setLabel] = useState('')
  const eff = sel && spec.kind === 'causal' ? propagateSigns(spec.edges, sel, dir) : null
  const node = (id: string) => spec.nodes.find((n) => n.id === id)
  const setS = (s: GraphSpec) => w.setSpec(s)

  const pt = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  const effColor = (id: string) => { const v = eff?.[id]; return v === 1 ? 'rgb(var(--ok))' : v === -1 ? 'rgb(var(--bad))' : v === 'ambiguous' ? 'rgb(var(--warn))' : undefined }
  const sg = (s: number) => (s === 1 ? '+' : s === -1 ? '−' : '?')

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <section className="rounded-xl border border-line bg-surface p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Label>{spec.kind === 'causal' ? 'Causal hypotheses (signed)' : 'Concept map'}</Label>
          {spec.kind === 'causal' && sel && (
            <div className="-mt-1 flex items-center gap-1 text-[13px]">
              <span className="text-mute">If “{node(sel)?.label}” goes</span>
              <Btn size="sm" variant={dir === 1 ? 'primary' : 'outline'} onClick={() => setDir(1)} aria-pressed={dir === 1}><ArrowUp size={14} />up</Btn>
              <Btn size="sm" variant={dir === -1 ? 'primary' : 'outline'} onClick={() => setDir(-1)} aria-pressed={dir === -1}><ArrowDown size={14} />down</Btn>
            </div>
          )}
        </div>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" role="img" aria-label="Interactive graph. Drag nodes; select a node to propagate effects."
          onPointerMove={(e) => { if (!drag.current) return; const p = pt(e); setS({ ...spec, nodes: spec.nodes.map((n) => (n.id === drag.current!.id ? { ...n, x: Math.max(50, Math.min(W - 50, p.x - drag.current!.dx)), y: Math.max(20, Math.min(H - 20, p.y - drag.current!.dy)) } : n)) }) }}
          onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="rgb(var(--mute))" /></marker>
          </defs>
          {spec.edges.map((e) => {
            const a = node(e.from), b = node(e.to)
            if (!a || !b) return null
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
            const x1 = a.x + (dx / len) * 46, y1 = a.y + (dy / len) * 16, x2 = b.x - (dx / len) * 50, y2 = b.y - (dy / len) * 18
            const on = edgeSel === e.id
            return (
              <g key={e.id} onClick={() => setEdgeSel(on ? null : e.id)} className="cursor-pointer">
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? 'rgb(var(--accent))' : 'rgb(var(--mute))'} strokeWidth={on ? 2.2 : 1.4} markerEnd="url(#arr)" strokeDasharray={e.sign === 0 ? '5 4' : undefined} />
                {spec.kind === 'causal' && <g><circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={9} fill="rgb(var(--surface))" stroke="rgb(var(--line))" /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill={e.sign === 1 ? 'rgb(var(--ok))' : e.sign === -1 ? 'rgb(var(--bad))' : 'rgb(var(--warn))'}>{sg(e.sign)}</text></g>}
              </g>
            )
          })}
          {spec.nodes.map((n) => {
            const c = effColor(n.id)
            const label = n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label
            return (
              <g key={n.id} transform={`translate(${n.x} ${n.y})`} className="cursor-grab active:cursor-grabbing" tabIndex={0} role="button" aria-pressed={sel === n.id} aria-label={`${n.label}${eff && eff[n.id] !== undefined ? `, effect ${String(eff[n.id])}` : ''}`}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(sel === n.id ? null : n.id))}
                onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); const p = pt(e); drag.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y } }}
                onClick={() => setSel(sel === n.id ? null : n.id)}>
                <rect x={-48} y={-17} width={96} height={34} rx={17} fill="rgb(var(--surface))" stroke={sel === n.id ? 'rgb(var(--accent))' : c ?? 'rgb(var(--line))'} strokeWidth={sel === n.id || c ? 2 : 1.2} />
                <text textAnchor="middle" y={4} fontSize="11.5" fill="rgb(var(--ink))">{label}</text>
                {eff && eff[n.id] !== undefined && n.id !== sel && <text x={40} y={-18} fontSize="14" fontWeight="700" fill={c}>{eff[n.id] === 'ambiguous' ? '?' : eff[n.id] === 1 ? '↑' : eff[n.id] === -1 ? '↓' : '·'}</text>}
              </g>
            )
          })}
        </svg>
        {eff && <p className="mt-2 text-xs text-mute" aria-live="polite">Qualitative propagation along the signed edges. “?” = opposing paths or an edge with unknown sign: the model cannot say. This is bookkeeping of assumptions, not a prediction.</p>}
        {!eff && spec.kind === 'causal' && <p className="mt-2 text-xs text-mute">Tip: select a node to trace its assumed downstream effects. Dashed edge = sign unknown.</p>}
        {edgeSel && (() => { const e = spec.edges.find((x) => x.id === edgeSel); return e ? (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-sunk p-3 text-[13px]"><div><b>{node(e.from)?.label} → {node(e.to)?.label}</b> <span className="text-mute">({sg(e.sign)})</span><div className="mt-0.5 text-mute">{e.note}</div></div>
            <Btn size="sm" variant="ghost" onClick={() => { setS({ ...spec, edges: spec.edges.filter((x) => x.id !== e.id) }); setEdgeSel(null) }}><Trash2 size={14} />Remove</Btn></div>) : null })()}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <Label>Edit structure</Label>
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!label.trim()) return; setS({ ...spec, nodes: [...spec.nodes, { id: uid('n'), label: label.trim(), x: 320, y: 170 }] }); setLabel('') }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New concept…" aria-label="New concept name" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
          <Btn type="submit" variant="outline" size="sm" className="h-9"><Plus size={14} />Add node</Btn>
        </form>
        <form className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_90px_1.4fr_auto]" onSubmit={(e) => { e.preventDefault(); if (!from || !to || from === to) return; setS({ ...spec, edges: [...spec.edges, { id: uid('ed'), from, to, sign: Number(sign) as 1 | -1 | 0, note: note || 'Added by you.' }] }); setNote('') }}>
          {[['From', from, setFrom], ['To', to, setTo]].map(([lab, val, set]) => (
            <select key={lab as string} aria-label={lab as string} value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} className="h-9 rounded-lg border border-line bg-bg px-2 text-sm">
              <option value="">{lab as string}…</option>{spec.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          ))}
          <select aria-label="Sign" value={sign} onChange={(e) => setSign(e.target.value as '1')} className="h-9 rounded-lg border border-line bg-bg px-2 text-sm"><option value="1">+ raises</option><option value="-1">− lowers</option><option value="0">? unknown</option></select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Justification" aria-label="Justification" className="col-span-2 h-9 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent sm:col-span-1" />
          <Btn type="submit" variant="outline" size="sm" className={cx('col-span-2 h-9 sm:col-span-1')}>Add edge</Btn>
        </form>
      </section>
      {spec.gaps.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-4"><Label>What is missing to quantify this</Label><ul className="list-disc space-y-1 pl-5 text-[13px] text-mute">{spec.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></section>
      )}
    </div>
  )
}
