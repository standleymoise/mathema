# Choosing the model: the bake-off

`server/eval/ideas.json` holds 30 ideas (English/Spanish; causal, dynamic, optimisation, function, conceptual, and one deliberately unfounded claim). The eval runs the **real production path**: the same prompt, the same server validation, and the same client-side adapter that parses every expression and integrates every ODE.

```bash
RUN_EVAL=1 ANTHROPIC_API_KEY=sk-ant-... \
EVAL_MODELS="anthropic:claude-haiku-5-5,anthropic:claude-sonnet-5-5" \
npm run eval
# OpenAI: add OPENAI_API_KEY and e.g. EVAL_MODELS="...,openai:<exact-model-id>" EVAL_PRICES='{"openai:<id>":[IN_USD_PER_M, OUT_USD_PER_M]}'
# Cheap smoke test: EVAL_LIMIT=5
```
It spends real tokens (a full 30-idea run per model is a few cents to a couple of dollars depending on the model). Output: a table plus `server/eval/results-*.json` with per-idea rows.

| Metric | Meaning | Rule of thumb |
|---|---|---|
| `serverValidPct` | JSON parsed and passed the schema checks | aim ≥ 95% |
| `engineValidPct` | expressions parse, ODEs integrate, LP feasible | aim ≥ 90%; failures fall back to the local analyzer |
| `kindMatchPct` | chose the kind we expected | informational: some ideas are legitimately ambiguous |
| `suspectCitations` | outputs containing URLs/DOIs/"et al." | must be 0 — the prompt forbids invented sources |
| `avgCostUsd`, latency | cost and speed per analysis | decides the default tier |

Decision rule: pick the **cheapest model that reaches the validity thresholds and reads well on the five ideas you care most about**; keep a stronger model only for Research mode. Read a handful of raw rows by hand — metrics don't catch a plausible but wrong formalisation.
