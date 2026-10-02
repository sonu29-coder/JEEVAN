export const API_BASE = 'http://localhost:8000/api'

export interface ApiResult<T> {
  ok: boolean
  status: number
  data: T | null
  simulated: boolean
}

export interface SimulatedResponse<T> {
  status: number
  data: T
}

/**
 * POSTs to the JEEVAN backend. If the backend is unreachable (offline, CORS,
 * or mixed-content in hosted previews) the provided simulator runs instead so
 * the UI flow stays demoable; results are flagged with `simulated: true`.
 */
export async function postToGrid<T>(
  path: string,
  body: unknown,
  simulate: () => SimulatedResponse<T>,
  auth?: { token: string; authorized: boolean },
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) headers.Authorization = `Bearer ${auth.token}`

  // Mirror the backend's RBAC check so unauthorized roles get a 403 even when the API is offline.
  if (auth && !auth.authorized) {
    await new Promise((resolve) => setTimeout(resolve, 450))
    const data = { detail: `Forbidden: token #${auth.token} is not authorized for ${path}` } as unknown as T
    return { ok: false, status: 403, data, simulated: true }
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    const data = (await res.json().catch(() => null)) as T | null
    return { ok: res.ok, status: res.status, data, simulated: false }
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 850))
    const sim = simulate()
    return { ok: sim.status >= 200 && sim.status < 300, status: sim.status, data: sim.data, simulated: true }
  }
}

export function extractDetail(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string') {
    return data.detail
  }
  return fallback
}
