'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadSavedAuth, saveAuthSession, type AuthRole } from '@/lib/hemo-auth'
import { BANKS, SEED_EMERGENCIES, seedStock, siteById, type Emergency, type StockItem } from '@/lib/hemo-data'

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
  nccAlertOpen: boolean
  nccAlertData: any
  openNccAlert: (data?: any) => void
  dismissNccAlert: () => void
  expiryRadarOpen: boolean
  openExpiryRadar: () => void
  dismissExpiryRadar: () => void
  prioritizedUnits: Record<string, { reason: string; timestamp: number }>
  redistributedUnits: Record<string, { targetBankId: string; targetBankName: string; dispatchCode: string; timestamp: number }>
  prioritizeStockUnit: (id: string, reason?: string) => Promise<boolean>
  redistributeStockUnit: (id: string, targetBankId: string, notes?: string) => Promise<string>
  quarantineStockUnit: (id: string) => Promise<boolean>
}

const GridContext = createContext<GridContextValue | null>(null)

export function GridProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>('hospital')
  const [session, setSessionState] = useState<AuthRole>('ICU_HOSPITAL')
  const [forbidden, setForbidden] = useState<ForbiddenInfo | null>(null)
  const dismissForbidden = useCallback(() => setForbidden(null), [])
  const [tab, setTabState] = useState<Tab>('home')

  const setRole = useCallback((nextRole: Role) => {
    setRoleState(nextRole)
    const saved = loadSavedAuth()
    saveAuthSession(saved?.session || session, nextRole, saved?.user)
  }, [session])

  const setSession = useCallback((nextSession: AuthRole) => {
    setSessionState(nextSession)
    const saved = loadSavedAuth()
    saveAuthSession(nextSession, saved?.role || role, saved?.user)
  }, [role])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const roleParam = params.get('role') as Role | null
    if (roleParam && (roleParam === 'hospital' || roleParam === 'donor' || roleParam === 'driver')) {
      setRoleState(roleParam)
      const mappedSession: AuthRole =
        roleParam === 'hospital' ? 'ICU_HOSPITAL' : roleParam === 'donor' ? 'REGISTERED_DONOR' : 'DELIVERY_PARTNER'
      setSessionState(mappedSession)
      saveAuthSession(mappedSession, roleParam)
      return
    }

    const saved = loadSavedAuth()
    if (saved?.session && saved?.role) {
      setSessionState(saved.session)
      setRoleState(saved.role)
    }
  }, [])

  // Tabs belong to the hospital portal, so navigating to one switches back to that role.
  const setTab = useCallback((next: Tab) => {
    setRoleState('hospital')
    setTabState(next)
  }, [])
  const [query, setQuery] = useState('')
  const [stock, setStock] = useState<StockItem[]>(() => seedStock(Date.now()))
  const [emergencies, setEmergencies] = useState<Emergency[]>(SEED_EMERGENCIES)

  // Hydrate live stock and emergency requests from PostgreSQL backend
  useEffect(() => {
    fetch('http://localhost:8000/api/inventory', {
      headers: { Authorization: 'Bearer HOSP-9042' },
      signal: AbortSignal.timeout(3000),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          const liveStock: StockItem[] = items.map((it: any) => ({
            id: it.id,
            bankId: it.blood_bank_id,
            group: it.blood_group,
            component: it.component === 'PRBC' ? 'PRBC' : it.component === 'Platelets' ? 'Platelets' : 'Whole Blood',
            units: it.available_units ?? it.units,
            expiresInDays: Math.max(1, Math.round((new Date(it.expiry_date).getTime() - Date.now()) / 86400000)),
            lockedByIcuId: null,
            lockedUntil: null,
            lockId: null,
          }))
          setStock(liveStock)
        }
      })
      .catch(() => {})

    fetch('http://localhost:8000/api/requests/icu-view', {
      headers: { Authorization: 'Bearer HOSP-9042' },
      signal: AbortSignal.timeout(3000),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((reqs) => {
        if (Array.isArray(reqs) && reqs.length > 0) {
          const liveEmergencies: Emergency[] = reqs.map((r: any) => ({
            id: r.id,
            icuId: 'icu-elite',
            group: r.blood_type,
            component: 'PRBC',
            urgency: r.urgency_level === 'CRITICAL' ? 'CRITICAL' : r.urgency_level === 'ROUTINE' ? 'ROUTINE' : 'HIGH',
            units: r.units,
          }))
          setEmergencies(liveEmergencies)
        }
      })
      .catch(() => {})
  }, [])

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

  const [nccAlertOpen, setNccAlertOpen] = useState(false)
  const [nccAlertData, setNccAlertData] = useState<any>(null)

  const openNccAlert = useCallback((data?: any) => {
    setNccAlertData(data || null)
    setNccAlertOpen(true)
  }, [])

  const dismissNccAlert = useCallback(() => {
    setNccAlertOpen(false)
  }, [])

  // Blood Expiry Radar State & Actions
  const [expiryRadarOpen, setExpiryRadarOpen] = useState(false)
  const openExpiryRadar = useCallback(() => setExpiryRadarOpen(true), [])
  const dismissExpiryRadar = useCallback(() => setExpiryRadarOpen(false), [])

  const [prioritizedUnits, setPrioritizedUnits] = useState<Record<string, { reason: string; timestamp: number }>>({})
  const [redistributedUnits, setRedistributedUnits] = useState<
    Record<string, { targetBankId: string; targetBankName: string; dispatchCode: string; timestamp: number }>
  >({})

  const prioritizeStockUnit = useCallback(async (id: string, reason: string = 'FEFO Surgical Priority') => {
    setPrioritizedUnits((prev) => ({
      ...prev,
      [id]: { reason, timestamp: Date.now() },
    }))
    try {
      await fetch(`http://localhost:8000/api/inventory/${id}/prioritize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer HOSP-9042' },
        body: JSON.stringify({ reason, clinical_case: 'Emergency / Elective Surgery' }),
        signal: AbortSignal.timeout(2000),
      })
    } catch {}
    return true
  }, [])

  const redistributeStockUnit = useCallback(async (id: string, targetBankId: string, notes?: string) => {
    const target = siteById(BANKS, targetBankId)
    const code = `TRF-${Math.random().toString(16).slice(2, 8).toUpperCase()}`
    setRedistributedUnits((prev) => ({
      ...prev,
      [id]: {
        targetBankId,
        targetBankName: target?.name ?? 'Designated Hospital Blood Bank',
        dispatchCode: code,
        timestamp: Date.now(),
      },
    }))
    try {
      const res = await fetch(`http://localhost:8000/api/inventory/${id}/redistribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer HOSP-9042' },
        body: JSON.stringify({ target_bank_id: targetBankId, courier_notes: notes }),
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) {
        const data = await res.json()
        return data.dispatch_code || code
      }
    } catch {}
    return code
  }, [])

  const quarantineStockUnit = useCallback(async (id: string) => {
    setStock((list) => list.filter((s) => s.id !== id))
    try {
      await fetch(`http://localhost:8000/api/inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer HOSP-9042' },
        body: JSON.stringify({ status: 'quarantined' }),
        signal: AbortSignal.timeout(2000),
      })
    } catch {}
    return true
  }, [])

  const addEmergency = useCallback(
    (emergency: Emergency) => {
      setEmergencies((list) => [emergency, ...list])
      // Automatically trigger high-priority NCC Coordinator Pop-Up!
      openNccAlert({
        hospital_name: emergency.icuId === 'icu-elite' ? 'Elite Mission Hospital ICU' : 'Jubilee Mission Hospital ICU',
        blood_group: emergency.group,
        units: emergency.units,
        urgency: emergency.urgency,
      })
    },
    [openNccAlert],
  )

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
      nccAlertOpen,
      nccAlertData,
      openNccAlert,
      dismissNccAlert,
      expiryRadarOpen,
      openExpiryRadar,
      dismissExpiryRadar,
      prioritizedUnits,
      redistributedUnits,
      prioritizeStockUnit,
      redistributeStockUnit,
      quarantineStockUnit,
    }),
    [
      role,
      setRole,
      session,
      setSession,
      forbidden,
      dismissForbidden,
      tab,
      setTab,
      query,
      stock,
      lockStock,
      completeDelivery,
      emergencies,
      addEmergency,
      responses,
      respond,
      toast,
      notify,
      nccAlertOpen,
      nccAlertData,
      openNccAlert,
      dismissNccAlert,
      expiryRadarOpen,
      openExpiryRadar,
      dismissExpiryRadar,
      prioritizedUnits,
      redistributedUnits,
      prioritizeStockUnit,
      redistributeStockUnit,
      quarantineStockUnit,
    ],
  )

  return <GridContext.Provider value={value}>{children}</GridContext.Provider>
}

export function useGrid() {
  const ctx = useContext(GridContext)
  if (!ctx) throw new Error('useGrid must be used within GridProvider')
  return ctx
}
