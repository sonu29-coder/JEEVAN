'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AuthRole } from '@/lib/hemo-auth'
import { SEED_EMERGENCIES, seedStock, type Emergency, type StockItem } from '@/lib/hemo-data'

export type Tab = 'home' | 'map' | 'blood' | 'alerts' | 'verify' | 'request'
export type ToastTone = 'success' | 'error' | 'info'
export type Response = 'help' | 'declined'
export type Role = 'hospital' | 'donor' | 'driver'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

export interface ForbiddenInfo {
  path: string
  required: AuthRole | null
  session: AuthRole
}

interface GridContextValue {
  role: Role
  setRole: (role: Role) => void
  session: AuthRole
  setSession: (session: AuthRole) => void
  forbidden: ForbiddenInfo | null
  showForbidden: (info: ForbiddenInfo) => void
  dismissForbidden: () => void
  tab: Tab
  setTab: (tab: Tab) => void
  query: string
  setQuery: (query: string) => void
  stock: StockItem[]
  lockStock: (id: string, icuId: string, lockId: string, durationMs: number) => void
  completeDelivery: (id: string) => void
  emergencies: Emergency[]
  addEmergency: (emergency: Emergency) => void
  responses: Record<string, Response>
  respond: (id: string, response: Response) => void
  toast: Toast | null
  notify: (message: string, tone?: ToastTone) => void
}

const GridContext = createContext<GridContextValue | null>(null)

export function GridProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('hospital')
  const [session, setSession] = useState<AuthRole>('ICU_HOSPITAL')
  const [forbidden, setForbidden] = useState<ForbiddenInfo | null>(null)
  const dismissForbidden = useCallback(() => setForbidden(null), [])
  const [tab, setTabState] = useState<Tab>('home')

  // Tabs belong to the hospital portal, so navigating to one switches back to that role.
  const setTab = useCallback((next: Tab) => {
    setRole('hospital')
    setTabState(next)
  }, [])
  const [query, setQuery] = useState('')
  const [stock, setStock] = useState<StockItem[]>(() => seedStock(Date.now()))
  const [emergencies, setEmergencies] = useState<Emergency[]>(SEED_EMERGENCIES)
  const [responses, setResponses] = useState<Record<string, Response>>({})
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), message, tone })
    toastTimer.current = setTimeout(() => setToast(null), 3400)
  }, [])

  const lockStock = useCallback((id: string, icuId: string, lockId: string, durationMs: number) => {
    setStock((items) =>
      items.map((item) =>
        item.id === id ? { ...item, lockedByIcuId: icuId, lockedUntil: Date.now() + durationMs, lockId } : item,
      ),
    )
  }, [])

  const completeDelivery = useCallback((id: string) => {
    setStock((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, units: Math.max(0, item.units - 1), lockedByIcuId: null, lockedUntil: null, lockId: null }
          : item,
      ),
    )
  }, [])

  const addEmergency = useCallback((emergency: Emergency) => {
    setEmergencies((list) => [emergency, ...list])
  }, [])

  const respond = useCallback((id: string, response: Response) => {
    setResponses((prev) => ({ ...prev, [id]: response }))
  }, [])

  const value = useMemo(
    () => ({
      role,
      setRole,
      session,
      setSession,
      forbidden,
      showForbidden: setForbidden,
      dismissForbidden,
      tab,
      setTab,
      query,
      setQuery,
      stock,
      lockStock,
      completeDelivery,
      emergencies,
      addEmergency,
      responses,
      respond,
      toast,
      notify,
    }),
    [role, session, forbidden, dismissForbidden, tab, setTab, query, stock, lockStock, completeDelivery, emergencies, addEmergency, responses, respond, toast, notify],
  )

  return <GridContext.Provider value={value}>{children}</GridContext.Provider>
}

export function useGrid() {
  const ctx = useContext(GridContext)
  if (!ctx) throw new Error('useGrid must be used within GridProvider')
  return ctx
}
