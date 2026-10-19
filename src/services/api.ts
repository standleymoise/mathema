// Thin same-origin client for the optional MATHEMA server. If the server is absent (e.g. the static
// GitHub Pages build) every call resolves with status 0 and the app keeps running in demo mode.
export interface ApiResult<T> { ok: boolean; status: number; data: T }

const base = () => new URL('api/', document.baseURI).toString()

async function req<T = any>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const res = await fetch(base() + path.replace(/^\//, ''), {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const ct = res.headers.get('content-type') ?? ''
    const data = ct.includes('application/json') ? await res.json() : null
    return { ok: res.ok, status: res.status, data: data as T }
  } catch {
    return { ok: false, status: 0, data: null as T }
  }
}
export const api = {
  get: <T = any>(p: string) => req<T>('GET', p), // eslint-disable-line @typescript-eslint/no-explicit-any
  post: <T = any>(p: string, b: unknown = {}) => req<T>('POST', p, b), // eslint-disable-line @typescript-eslint/no-explicit-any
  put: <T = any>(p: string, b: unknown) => req<T>('PUT', p, b), // eslint-disable-line @typescript-eslint/no-explicit-any
  patch: <T = any>(p: string, b: unknown) => req<T>('PATCH', p, b), // eslint-disable-line @typescript-eslint/no-explicit-any
  del: <T = any>(p: string) => req<T>('DELETE', p), // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ServerUser { id: number; email: string; name: string; role: 'user' | 'admin'; planId: string }
export interface Usage { used: number; quota: number | null; plan: string; resetsAt: string }
