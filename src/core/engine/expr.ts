// Deterministic, sandboxed math expression engine. No eval / Function: expressions are
// tokenised, parsed to an AST and interpreted. Safe for user- or model-provided strings.

export type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'un'; op: '-' | '+'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] }

export class ExprError extends Error {}

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, log: Math.log10,
  sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow,
  tanh: Math.tanh, floor: Math.floor, ceil: Math.ceil,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

function tokenize(src: string): string[] {
  const out: string[] = []
  const re = /\s*(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+|[A-Za-z_][A-Za-z_0-9]*|[-+*/^(),])/y
  let i = 0
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue }
    re.lastIndex = i
    const m = re.exec(src)
    if (!m) throw new ExprError(`Unexpected character "${src[i]}"`)
    out.push(m[1])
    i = re.lastIndex
  }
  return out
}

export function parse(src: string): Node {
  if (src.length > 500) throw new ExprError('Expression too long')
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const next = () => toks[p++]
  const expect = (s: string) => { if (next() !== s) throw new ExprError(`Expected "${s}"`) }

  function expr(): Node {
    let a = term()
    while (peek() === '+' || peek() === '-') {
      const op = next() as '+' | '-'
      a = { t: 'bin', op, a, b: term() }
    }
    return a
  }
  function term(): Node {
    let a = unary()
    while (peek() === '*' || peek() === '/') {
      const op = next() as '*' | '/'
      a = { t: 'bin', op, a, b: unary() }
    }
    return a
  }
  function unary(): Node {
    if (peek() === '-' || peek() === '+') {
      const op = next() as '-' | '+'
      return { t: 'un', op, a: unary() }
    }
    return power()
  }
  function power(): Node {
    const base = atom()
    if (peek() === '^') {
      next()
      return { t: 'bin', op: '^', a: base, b: unary() } // right-assoc
    }
    return base
  }
  function atom(): Node {
    const tk = next()
    if (tk === undefined) throw new ExprError('Unexpected end of expression')
    if (/^[\d.]/.test(tk)) {
      const v = Number(tk)
      if (!Number.isFinite(v)) throw new ExprError(`Bad number "${tk}"`)
      return { t: 'num', v }
    }
    if (tk === '(') { const e = expr(); expect(')'); return e }
    if (/^[A-Za-z_]/.test(tk)) {
      if (peek() === '(') {
        next()
        if (!Object.hasOwn(FUNCS, tk)) throw new ExprError(`Unknown function "${tk}"`)
        const args: Node[] = []
        if (peek() !== ')') {
          args.push(expr())
          while (peek() === ',') { next(); args.push(expr()) }
        }
        expect(')')
        return { t: 'call', fn: tk, args }
      }
      return { t: 'var', name: tk }
    }
    throw new ExprError(`Unexpected "${tk}"`)
  }
  const n = expr()
  if (p < toks.length) throw new ExprError(`Unexpected "${toks[p]}"`)
  return n
}

export function evalNode(n: Node, scope: Record<string, number>): number {
  switch (n.t) {
    case 'num': return n.v
    case 'var': {
      if (Object.hasOwn(scope, n.name)) return scope[n.name]
      if (Object.hasOwn(CONSTS, n.name)) return CONSTS[n.name]
      throw new ExprError(`Unknown variable "${n.name}"`)
    }
    case 'un': return n.op === '-' ? -evalNode(n.a, scope) : evalNode(n.a, scope)
    case 'bin': {
      const a = evalNode(n.a, scope), b = evalNode(n.b, scope)
      switch (n.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return a / b
        case '^': return Math.pow(a, b)
      }
      return NaN
    }
    case 'call': return FUNCS[n.fn](...n.args.map((x) => evalNode(x, scope)))
  }
}

export function variablesOf(n: Node, acc = new Set<string>()): Set<string> {
  if (n.t === 'var') { if (!Object.hasOwn(CONSTS, n.name)) acc.add(n.name) }
  else if (n.t === 'un') variablesOf(n.a, acc)
  else if (n.t === 'bin') { variablesOf(n.a, acc); variablesOf(n.b, acc) }
  else if (n.t === 'call') n.args.forEach((x) => variablesOf(x, acc))
  return acc
}

export function compile(src: string): { ok: true; fn: (scope: Record<string, number>) => number; vars: string[] } | { ok: false; error: string } {
  try {
    const ast = parse(src)
    return { ok: true, fn: (s) => evalNode(ast, s), vars: [...variablesOf(ast)] }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ---- LaTeX rendering -------------------------------------------------------
const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'sigma', 'rho', 'tau', 'phi', 'omega', 'eta', 'kappa'])
function ident(name: string): string {
  const m = /^([A-Za-z]+)_?([A-Za-z0-9]*)$/.exec(name)
  if (!m) return name
  const [, base, sub] = m
  const b = GREEK.has(base.toLowerCase()) ? `\\${base.toLowerCase()}` : base.length > 1 ? `\\mathrm{${base}}` : base
  return sub ? `${b}_{${sub}}` : b
}
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }
function tex(n: Node, parent = 0): string {
  switch (n.t) {
    case 'num': return String(n.v)
    case 'var': return n.name === 'pi' ? '\\pi' : ident(n.name)
    case 'un': return `${n.op}${tex(n.a, 3)}`
    case 'call': {
      const a = n.args.map((x) => tex(x))
      if (n.fn === 'sqrt') return `\\sqrt{${a[0]}}`
      if (n.fn === 'exp') return `e^{${a[0]}}`
      if (n.fn === 'abs') return `\\left|${a[0]}\\right|`
      const name = ['sin', 'cos', 'tan', 'tanh', 'ln', 'log'].includes(n.fn) ? `\\${n.fn}` : `\\mathrm{${n.fn}}`
      return `${name}\\left(${a.join(', ')}\\right)`
    }
    case 'bin': {
      if (n.op === '/') return `\\frac{${tex(n.a)}}{${tex(n.b)}}`
      if (n.op === '^') return `${tex(n.a, 5)}^{${tex(n.b)}}`
      const p = PREC[n.op]
      const l = tex(n.a, p), r = tex(n.b, p + (n.op === '-' || n.op === '+' ? 1 : 0))
      const s = n.op === '*' ? `${l}\\,${r}` : `${l} ${n.op} ${r}`
      return p < parent ? `\\left(${s}\\right)` : s
    }
  }
}
export function toLatex(src: string): string | null {
  try { return tex(parse(src)) } catch { return null }
}
