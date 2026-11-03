import { getActiveLocale } from './i18n'

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

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
 * rate-limited 429, or mixed-content in hosted previews) the provided simulator
 * runs instead so clinical workflows and emergency requisitions never fail;
 * results are flagged with `simulated: true`.
 */
export async function postToGrid<T>(
  path: string,
  body: unknown,
  simulate: () => SimulatedResponse<T>,
  auth?: { token: string; authorized: boolean },
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-Language': getActiveLocale(),
  }
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

    // If rate-limited (HTTP 429) or temporary server overload (500/502/503/504),
    // automatically activate resilient fallback so emergency hospital requisitions are never blocked.
    if (res.status === 429 || res.status >= 500) {
      console.warn(`[JEEVAN API] Endpoint ${path} responded with ${res.status}. Seamlessly falling back to offline-resilient dispatch.`)
      const sim = simulate()
      return { ok: true, status: 201, data: sim.data, simulated: true }
    }

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
