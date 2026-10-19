import type { Lang } from '../core/types'

const en = {
  tagline1: 'Everything can be explored.',
  tagline2: 'Transform ideas into models. Explore what follows.',
  principle: 'Every idea deserves a model. Every model deserves to be questioned.',
  newIdea: 'New idea', recent: 'Recent conversations', myModels: 'My models', experiments: 'Experiments', universe: 'Knowledge Universe',
  sources: 'Documents & sources', search: 'Search everything…', settings: 'Settings', collapse: 'Collapse sidebar', expand: 'Open sidebar',
  composerPlaceholder: 'Describe an idea, paste an equation or a table, or ask about a model…',
  send: 'Send', mic: 'Dictate', attach: 'Attach files', paste: 'Paste from clipboard', addData: 'Add data', mode: 'Mode',
  understand: 'Understand', model: 'Model', experiment: 'Experiment', research: 'Research', connect: 'Connect',
  understandD: 'Explain an idea or a stored model', modelD: 'Build a formal model from an idea', experimentD: 'Vary parameters, compare scenarios, test sensitivity',
  researchD: 'Hypotheses, evidence gaps, experiment design', connectD: 'Relate this to what you already know',
  tryExamples: 'Start from an example', demoData: 'Demo data', noConv: 'No conversations yet', noModels: 'No models yet. Describe an idea to create one.',
  conversation: 'Conversation', workspace: 'Workspace', details: 'Model details', closePanel: 'Close panel', openPanel: 'Show details',
  light: 'Light', dark: 'Dark', language: 'Language', theme: 'Theme', demoMode: 'Demo mode', resetDemo: 'Reset demo data', exportJson: 'Export data (JSON)',
  save: 'Save version', rename: 'Rename', duplicate: 'Duplicate', delete: 'Delete', cancel: 'Cancel', confirm: 'Confirm', open: 'Open',
  variables: 'Variables', parameters: 'Parameters', equations: 'Equations', assumptions: 'Assumptions', limitations: 'Limitations', related: 'Related models', versions: 'Version history', validation: 'Validation',
  summary: 'Summary', scenarios: 'Scenarios', saveScenario: 'Save scenario', sensitivity: 'Sensitivity', reset: 'Reset', copy: 'Copy', copied: 'Copied',
  processing: 'Working…', empty: 'Nothing here yet.', error: 'Something went wrong',
  deleteTitle: 'Delete this model?', deleteBody: 'It will be removed together with its experiments and links. This cannot be undone.',
  allTypes: 'All types', searchUniverse: 'Search the universe…', selectNode: 'Select a node to inspect it and its connections.', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit',
  recordsDemo: 'Demo', aiStatus: 'Language model', persistence: 'Persistence', notConfigured: 'Not configured', localAnalyzer: 'Local heuristic analyzer — not a language model',
} as const
export type Key = keyof typeof en

const es: Record<Key, string> = {
  tagline1: 'Todo puede explorarse.',
  tagline2: 'Convertí ideas en modelos. Explorá lo que se sigue de ellos.',
  principle: 'Toda idea merece un modelo. Todo modelo merece ser cuestionado.',
  newIdea: 'Nueva idea', recent: 'Conversaciones recientes', myModels: 'Mis modelos', experiments: 'Experimentos', universe: 'Knowledge Universe',
  sources: 'Documentos y fuentes', search: 'Buscar en todo…', settings: 'Configuración', collapse: 'Contraer barra lateral', expand: 'Abrir barra lateral',
  composerPlaceholder: 'Describí una idea, pegá una ecuación o una tabla, o preguntá sobre un modelo…',
  send: 'Enviar', mic: 'Dictar', attach: 'Adjuntar archivos', paste: 'Pegar del portapapeles', addData: 'Añadir datos', mode: 'Modo',
  understand: 'Entender', model: 'Modelar', experiment: 'Experimentar', research: 'Investigar', connect: 'Conectar',
  understandD: 'Explicar una idea o un modelo guardado', modelD: 'Construir un modelo formal a partir de una idea', experimentD: 'Variar parámetros, comparar escenarios, probar sensibilidad',
  researchD: 'Hipótesis, vacíos de evidencia, diseño de experimentos', connectD: 'Relacionar esto con lo que ya sabés',
  tryExamples: 'Empezar desde un ejemplo', demoData: 'Datos de demostración', noConv: 'Todavía no hay conversaciones', noModels: 'Todavía no hay modelos. Describí una idea para crear uno.',
  conversation: 'Conversación', workspace: 'Espacio de trabajo', details: 'Detalles del modelo', closePanel: 'Cerrar panel', openPanel: 'Mostrar detalles',
  light: 'Claro', dark: 'Oscuro', language: 'Idioma', theme: 'Tema', demoMode: 'Modo demostración', resetDemo: 'Restablecer datos de demostración', exportJson: 'Exportar datos (JSON)',
  save: 'Guardar versión', rename: 'Renombrar', duplicate: 'Duplicar', delete: 'Eliminar', cancel: 'Cancelar', confirm: 'Confirmar', open: 'Abrir',
  variables: 'Variables', parameters: 'Parámetros', equations: 'Ecuaciones', assumptions: 'Supuestos', limitations: 'Limitaciones', related: 'Modelos relacionados', versions: 'Historial de versiones', validation: 'Validación',
  summary: 'Resumen', scenarios: 'Escenarios', saveScenario: 'Guardar escenario', sensitivity: 'Sensibilidad', reset: 'Restablecer', copy: 'Copiar', copied: 'Copiado',
  processing: 'Procesando…', empty: 'Aún no hay nada aquí.', error: 'Algo salió mal',
  deleteTitle: '¿Eliminar este modelo?', deleteBody: 'Se eliminará junto con sus experimentos y vínculos. No se puede deshacer.',
  allTypes: 'Todos los tipos', searchUniverse: 'Buscar en el universo…', selectNode: 'Seleccioná un nodo para inspeccionarlo y ver sus conexiones.', zoomIn: 'Acercar', zoomOut: 'Alejar', fit: 'Ajustar',
  recordsDemo: 'Demo', aiStatus: 'Modelo de lenguaje', persistence: 'Persistencia', notConfigured: 'No configurado', localAnalyzer: 'Analizador heurístico local — no es un modelo de lenguaje',
}

export const dict: Record<Lang, Record<Key, string>> = { en, es }
export const translate = (lang: Lang, k: Key) => dict[lang][k]
