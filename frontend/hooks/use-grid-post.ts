'use client'

import { useCallback, useState } from 'react'
import { useGrid } from '@/components/hemo/grid-store'
import { postToGrid, type SimulatedResponse } from '@/lib/hemo-api'
import { CREDENTIALS, ROUTE_PERMISSIONS, canCallRoute } from '@/lib/hemo-auth'

export function useGridPost<TBody, TResponse>(path: string) {
  const { session, showForbidden, currentUser } = useGrid()
  const [isLoading, setIsLoading] = useState(false)

  const trigger = useCallback(
    async (body: TBody, simulate: () => SimulatedResponse<TResponse>) => {
      setIsLoading(true)
      try {
        const authToken =
          currentUser?.token ||
          currentUser?.access_token ||
          CREDENTIALS[session]?.token ||
          'HOSP-9042'
        const res = await postToGrid<TResponse>(path, body, simulate, {
          token: authToken,
          authorized: canCallRoute(session, path),
        })
        if (res.status === 403) {
          showForbidden({ path, required: ROUTE_PERMISSIONS[path] ?? null, session })
        }
        return res
      } finally {
        setIsLoading(false)
      }
    },
    [path, session, showForbidden, currentUser],
  )

  return { trigger, isLoading }
}
