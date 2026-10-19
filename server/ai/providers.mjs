// Provider calls. Keys come from the server (DB or env), never from the browser.
import Anthropic from '@anthropic-ai/sdk'

export class ProviderError extends Error {
  constructor(msg, status) { super(msg); this.status = status }
}

export async function callAnthropic({ apiKey, model, system, user, effort, maxTokens = 12000 }) {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 })
  let res
  try {
    res = await client.messages.create({
      model, max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      ...(effort ? { output_config: { effort } } : {}),
    })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ProviderError('Anthropic rejected the API key', 502)
    if (e instanceof Anthropic.RateLimitError) throw new ProviderError('Anthropic rate limit reached, try again shortly', 429)
    if (e instanceof Anthropic.BadRequestError) throw new ProviderError(`Anthropic rejected the request: ${String(e.message).slice(0, 160)}`, 502)
    if (e instanceof Anthropic.APIError) throw new ProviderError(`Anthropic error ${e.status}`, 502)
    throw new ProviderError('Could not reach Anthropic', 502)
  }
  if (res.stop_reason === 'refusal') throw new ProviderError('The model declined this request', 422)
  if (res.stop_reason === 'max_tokens') throw new ProviderError('The model ran out of output budget before finishing', 502)
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const u = res.usage ?? {}
  return { text, usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 } }
}

export async function callOpenAI({ apiKey, model, system, user }) {
  let r
  try {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(120_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' } }),
    })
  } catch { throw new ProviderError('Could not reach OpenAI', 502) }
  if (r.status === 401) throw new ProviderError('OpenAI rejected the API key', 502)
  if (r.status === 429) throw new ProviderError('OpenAI rate limit reached, try again shortly', 429)
  if (!r.ok) throw new ProviderError(`OpenAI error ${r.status}`, 502)
  const j = await r.json()
  const choice = j.choices?.[0]
  if (!choice?.message?.content) throw new ProviderError('OpenAI returned no content', 502)
  if (choice.finish_reason === 'length') throw new ProviderError('The model ran out of output budget before finishing', 502)
  const u = j.usage ?? {}
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0
  return { text: choice.message.content, usage: { input: Math.max(0, (u.prompt_tokens ?? 0) - cached), output: u.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0 } }
}

export async function verifyKey(provider, apiKey) {
  if (provider === 'anthropic') {
    try { await new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 }); return { ok: true } }
    catch (e) { return { ok: false, error: e instanceof Anthropic.AuthenticationError ? 'Key rejected (401)' : `Could not verify (${e.status ?? 'network'})` } }
  }
  if (provider === 'openai') {
    try {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) })
      return r.ok ? { ok: true } : { ok: false, error: r.status === 401 ? 'Key rejected (401)' : `Could not verify (${r.status})` }
    } catch { return { ok: false, error: 'Could not reach OpenAI' } }
  }
  return { ok: false, error: 'Unknown provider' }
}

export const PROVIDERS = ['anthropic', 'openai']
export const call = { anthropic: callAnthropic, openai: callOpenAI }
