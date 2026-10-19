# MATHEMA — Universal Mathematical Knowledge Engine

> *Every idea deserves a model. Every model deserves to be questioned.*

MATHEMA turns ideas written in natural language (text, pasted equations, CSV tables) into **formal, interactive, versioned models** — and keeps them in a navigable memory so new ideas connect to what you already know. It is a thinking-and-experimentation environment, not a chatbot.

**Live demo:** published with GitHub Pages from `main` (see the repository's *About* link).

## What works today

| Area | Status |
|---|---|
| Idea → model | Local **heuristic** analyzer picks a formalisation: explicit equation → function, numeric table → regression, optimisation/dynamics keywords → LP / ODE templates, causal verbs → signed causal graph, otherwise a concept map |
| Interactive models | Function (editable, validated equation + sliders), regression (CI & prediction bands, residuals, predictor), ODE (RK4), 2-variable LP (exact, feasible-region plot), signed causal graph (drag nodes, qualitative effect propagation) |
| Experimentation | Live parameter updates, saved scenarios + comparison table, one-at-a-time sensitivity (tornado), experiments log |
| Memory | Versioned models with restore, related-model retrieval, **merge/link proposals that are never applied automatically**, unit-mismatch warnings; cloud sync across devices when signed in |
| Knowledge Universe | Pan/zoom/drag graph, search, type filters, typed & justified relations (inferred ones are marked), jump to model/source |
| Integrity | Every variable, equation and result carries a provenance label (source / derived / user assumption / system hypothesis / estimated / simulated / validated). No confidence levels are invented |
| UX | Light/dark, English/Spanish, responsive (drawers on mobile), keyboard focus, dictation via Web Speech API when the browser supports it |

Demo data (temperature–yield curve, synthetic rainfall regression, ODE, LP, causal map, reference list) is **clearly labelled as demo data**. The two FAO references are context only — no demo number was taken from them.

## Two ways to run it

| | Static demo (GitHub Pages) | Full app (Node + MySQL, e.g. Hostinger) |
|---|---|---|
| Accounts, cloud sync | no | yes (email + password, MySQL) |
| AI proposals | no (local heuristic analyzer) | yes: Claude and/or OpenAI, keys held by the admin, encrypted |
| Plans, quotas, cost tracking | no | yes |
| Admin + finance (MRR, ARR, cost per app/model/user, margin) | no | yes |

Guides: **[Hostinger deploy](docs/DEPLOY-HOSTINGER.md)** · **[model selection](docs/EVAL.md)** · **[PayPal billing](docs/BILLING-PAYPAL.md)** · **[closed beta](docs/BETA.md)** · **[legal checklist](docs/LEGAL-CHECKLIST.md)**.

## Honest limits

* **Equations and data tables are never sent to an AI**: they are solved deterministically (exact, free). AI is used only for ideas without equations or data, and its output is a *proposal* that MATHEMA re-validates (every expression parsed by our own engine, ODEs integrated, LP checked) and labels as a system hypothesis. If validation or the AI fails, the local analyzer is used and the message says so.
* **No language model runs in the static demo**; the analyzer there is deterministic rules and every message says so.
* **Prices are yours to maintain**: costs = tokens × the per-million-token prices entered in the Admin panel (Anthropic defaults are pre-filled; verify them). A model without a price is flagged, never silently invented.
* **MRR/ARR come from PayPal subscriptions** (verified webhooks) plus any subscriptions/payments you record by hand. Revenue is gross, USD only, with PayPal fees recorded per payment as a cost.
* PDFs and images can be attached as *references* but their content is not read (no OCR/vision). Text, Markdown, JSON and CSV are read.
* Models generated from free text use **placeholder parameters**, labelled as hypotheses. Fits are not validation; correlation is not causation.

## Architecture

```
src/
  core/            pure, UI-free, reusable
    types.ts       typed model (variables, equations, assumptions, sources, validation, versions…)
    engine/        deterministic maths: safe expression parser (no eval), RK4, OLS+intervals, exact LP, sign propagation
    analyzer.ts    heuristic idea → Analysis (swap for an LLM provider)
    memory.ts      related-model retrieval, proposals, Knowledge-Universe graph builder
    assist.ts      Understand / Research templates
    demo.ts        labelled demonstration corpus
  services/        ai.ts (server AI client), api.ts, repository.ts (local cache)
  store/           single external store + actions
  ui/              layout, chat, models, viz (one view per model kind), universe
  i18n/            en / es dictionary
server/            Express API: auth, AI gateway (Claude/OpenAI), sync, admin, finance; MySQL schema in server/schema.mjs
docs/              deployment and model-evaluation guides
```

The maths engine is separate from any generative AI and never executes model-generated code: equations are parsed by a small grammar into an AST and interpreted.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 (static demo; run `npm run dev:server` too for the full app)
npm test           # engine unit tests (parser, RK4, OLS, LP, sign propagation)
npm run build      # type-check + production build into dist/
```

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` builds and deploys on every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The build uses relative asset paths, so it works under any repository name.

## Resumen en español

MATHEMA transforma ideas en modelos matemáticos interactivos, los guarda con historial de versiones y los conecta con tu conocimiento previo (sin fusionar nada automáticamente). Funciona completo en modo demostración, sin claves ni servidores. El analizador por defecto es heurístico (no es un modelo de lenguaje) y así se indica en cada respuesta; para usar un LLM real, apuntá `VITE_AI_ENDPOINT` a un servidor propio que guarde la clave. La interfaz se cambia a español en **Configuración → Idioma**.

## License

MIT
