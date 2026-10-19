import { useMemo, useState } from 'react'
import type { MathModel, ModelSpec } from '../../core/types'
import { baseParams, type Params } from '../../core/engine/runtime'
import { models, toast } from '../../store/store'
import { tr } from '../../core/text'

/** Uncommitted experimentation state for one model version. Saving creates a new version. */
export function useWorking(model: MathModel, lang: 'en' | 'es') {
  const base = useMemo(() => baseParams(model), [model])
  const [params, setParams] = useState<Params>(base)
  const [spec, setSpec] = useState<ModelSpec>(model.spec)
  const dirty = JSON.stringify(params) !== JSON.stringify(base) || JSON.stringify(spec) !== JSON.stringify(model.spec)
  return {
    params, spec, dirty, base,
    setParam: (k: string, v: number) => setParams((p) => ({ ...p, [k]: v })),
    setParams, setSpec,
    reset: () => { setParams(base); setSpec(model.spec) },
    save() {
      const variables = model.variables.map((v) => (v.symbol in params && v.value !== undefined ? { ...v, value: params[v.symbol], provenance: params[v.symbol] !== v.value && v.provenance === 'system-hypothesis' ? ('user-assumption' as const) : v.provenance } : v))
      const equations = model.equations.map((e, i) => (spec.kind === 'function' && i === 0 ? { ...e, expr: spec.expr } : spec.kind === 'dynamic' && i === 0 && spec.states[0] ? { ...e, expr: spec.states[0].expr } : e))
      models.commit(model.id, { variables, spec, equations }, tr(lang, 'Saved from workspace (parameters / equation / data edited).', 'Guardado desde el espacio de trabajo (parámetros / ecuación / datos editados).'))
      toast(tr(lang, 'Saved as a new version.', 'Guardado como nueva versión.'))
    },
  }
}
export type Working = ReturnType<typeof useWorking>
