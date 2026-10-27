'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  Bike,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Gauge,
  Hospital,
  KeyRound,
  Loader2,
  Navigation,
  PackageCheck,
  Play,
  RotateCcw,
  ShieldCheck,
  Siren,
  Sparkles,
  ThermometerSnowflake,
  Zap,
} from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import {
  BANKS,
  COMPONENT_LABELS,
  ICUS,
  distanceKm,
  formatRemaining,
  isLocked,
  otpForLock,
  siteById,
} from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useGrid } from './grid-store'
import { ViewHeader } from './view-header'

const RouteMap = dynamic(() => import('./route-map'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-muted">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading map" />
    </div>
  ),
})

const NavigationScreen = dynamic(
  () => import('./navigation-screen').then((mod) => mod.NavigationScreen),
  { ssr: false }
)

type TransitStage = 'assigned' | 'picked_up' | 'in_transit' | 'arrived' | 'delivered'

export function DriverDashboard() {
  const tDelivery = useTranslations('Delivery')
  const tCommon = useTranslations('Common')
  const { stock, completeDelivery, createFastDispatch, notify } = useGrid()
  const now = useNow()

  // Active dispatches held by ICUs
  const dispatches = stock.filter((s) => s.lockedByIcuId && isLocked(s, now))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = dispatches.find((d) => d.id === selectedId) ?? dispatches[0]

  const bank = selected ? siteById(BANKS, selected.bankId) : undefined
  const icu = selected ? siteById(ICUS, selected.lockedByIcuId) : undefined
  const distance = bank && icu ? distanceKm(bank.position, icu.position) : 3.2

  // Full-Screen Turn-by-Turn Navigation State
  const [isNavOpen, setIsNavOpen] = useState(false)

  // Live Transit States per dispatch
  const [stageMap, setStageMap] = useState<Record<string, TransitStage>>({})
  const [progressMap, setProgressMap] = useState<Record<string, number>>({})
  const [speedMap, setSpeedMap] = useState<Record<string, number>>({})
  const [isSimulating, setIsSimulating] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentStage: TransitStage = (selected && stageMap[selected.id]) || 'in_transit'
  const currentProgress = (selected && progressMap[selected.id]) ?? (currentStage === 'in_transit' ? 0.45 : currentStage === 'arrived' || currentStage === 'delivered' ? 1 : 0)
  const currentSpeed = (selected && speedMap[selected.id]) ?? (currentStage === 'in_transit' ? 68 : 0)

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current)
    }
  }, [])

  // Fast-Forward Transit Simulation (Runs whole route in ~8 seconds)
  const runFastSimulation = useCallback(() => {
    if (!selected) return
    if (simTimerRef.current) clearInterval(simTimerRef.current)
    setIsSimulating(true)

    // Stage 1: Accepted & Pickup
    setStageMap((prev) => ({ ...prev, [selected.id]: 'picked_up' }))
    setProgressMap((prev) => ({ ...prev, [selected.id]: 0.05 }))
    setSpeedMap((prev) => ({ ...prev, [selected.id]: 32 }))
    notify('📦 Unit picked up from Blood Bank! Launching Green Corridor.', 'info')

    // Background sync to courier status CUSUM detector
    fetch(`/api/dispatches/${selected.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'picked_up', cold_chain_temp: 3.8 }),
    }).catch(() => {})

    let step = 0
    simTimerRef.current = setInterval(() => {
      step += 1
      const progress = Math.min(1, step / 14)
      const simulatedSpeed = Math.floor(65 + Math.sin(step) * 12)
      const simulatedTemp = Number((3.8 + Math.sin(step) * 0.15).toFixed(1))

      setProgressMap((prev) => ({ ...prev, [selected.id]: progress }))
      setSpeedMap((prev) => ({ ...prev, [selected.id]: simulatedSpeed }))
      setStageMap((prev) => ({ ...prev, [selected.id]: progress >= 0.95 ? 'arrived' : 'in_transit' }))

      // Background telemetry feed to CUSUM anomaly detector
      fetch(`/api/dispatches/${selected.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: progress >= 0.95 ? 'arrived' : 'in_transit',
          cold_chain_temp: simulatedTemp,
        }),
      }).catch(() => {})

      if (progress >= 1) {
        if (simTimerRef.current) clearInterval(simTimerRef.current)
        setIsSimulating(false)
        setStageMap((prev) => ({ ...prev, [selected.id]: 'arrived' }))
        setSpeedMap((prev) => ({ ...prev, [selected.id]: 0 }))
        notify('🏥 Arrived at ICU Emergency Bay! Ready for Handshake PIN.', 'success')
      }
    }, 500)
  }, [selected, notify])

  // Instant Complete Delivery Handshake
  const handleCompleteHandshake = useCallback(() => {
    if (!selected) return
    setStageMap((prev) => ({ ...prev, [selected.id]: 'delivered' }))
    setProgressMap((prev) => ({ ...prev, [selected.id]: 1 }))
    notify(`✅ Handshake Verified! Unit ${selected.group} handed over to ${icu?.short ?? 'ICU'} staff.`, 'success')

    // Call backend OTP verify endpoint if reachable
    const pin = otpForLock(selected.lockId)
    fetch('/api/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stock_id: selected.id,
        lock_id: selected.lockId,
        otp: pin,
      }),
    }).catch(() => {})

    setTimeout(() => {
      completeDelivery(selected.id)
    }, 1200)
  }, [selected, icu, completeDelivery, notify])

  // Copy PIN to clipboard
  const handleCopyPin = (pin: string) => {
    navigator.clipboard?.writeText(pin)
    setCopiedPin(true)
    notify(`PIN ${pin} ${tCommon('copied')}`, 'info')
    setTimeout(() => setCopiedPin(false), 2000)
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-4 pb-12 sm:px-5">
      <ViewHeader
        eyebrow={tDelivery('partnerDashboardTitle')}
        title={tDelivery('activeDispatches')}
        description={tDelivery('subtitle')}
      />

      {/* Quick Launch & Active State Actions */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 dark:border-emerald-500/30 dark:bg-emerald-950/20">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
            {tDelivery('greenCorridorActive')}
          </span>
        </div>

        <button
          type="button"
          onClick={() => createFastDispatch('O-', 'bank-ima', 'icu-elite')}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-95"
          title="Instantly generate an emergency blood transit run"
        >
          <Zap className="size-3.5" />
          <span>⚡ {tDelivery('activeDispatches')}</span>
        </button>
      </div>

      {/* Direct Dispatcher / Hospital Contact Bar */}
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs font-bold">
        <a
          href="tel:+914428178200"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card p-2.5 hover:bg-muted text-foreground transition-colors"
        >
          <Hospital className="size-3.5 text-coral" />
          <span>{tDelivery('contactDispatcher')}</span>
        </a>
        <a
          href="tel:+914428290200"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card p-2.5 hover:bg-muted text-foreground transition-colors"
        >
          <Hospital className="size-3.5 text-emerald-500" />
          <span>{tDelivery('contactIcu')}</span>
        </a>
      </div>

      {dispatches.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border bg-card px-6 py-10 text-center shadow-sm">
          <div className="relative">
            <span className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <PackageCheck className="size-8" aria-hidden="true" />
            </span>
            <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-emerald-500 text-xs font-bold text-white">
              ✓
            </span>
          </div>

          <h2 className="mt-4 text-xl font-bold">{tDelivery('completedDeliveries')}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {tDelivery('tempOptimal')}
          </p>

          <button
            type="button"
            onClick={() => createFastDispatch('O-', 'bank-ima', 'icu-elite')}
            className="mt-6 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition-all hover:from-emerald-700 hover:to-teal-700 active:scale-95"
          >
            <Zap className="size-4" />
            {tDelivery('activeDispatches')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Dispatch Selector if multiple active */}
          {dispatches.length > 1 && (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5" role="radiogroup">
              {dispatches.map((item) => {
                const active = item.id === selected?.id
                const toSite = siteById(ICUS, item.lockedByIcuId)
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors',
                      active
                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                        : 'border-border bg-card text-muted-foreground hover:border-emerald-500/50',
                    )}
                  >
                    <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px]">{item.group}</span>
                    <span>{toSite?.short ?? 'ICU'}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Active Job Card */}
          {selected && (
            <div className="relative overflow-hidden rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-coral-soft text-lg font-black text-coral-strong dark:text-coral">
                    {selected.group}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        {COMPONENT_LABELS[selected.component]}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {selected.id.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-base font-bold text-foreground">
                      {bank?.short} → {icu?.short}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="block text-xs text-muted-foreground">{tDelivery('liveRouteEta')}</span>
                  <span className="text-sm font-extrabold text-foreground">{distance.toFixed(1)} km</span>
                </div>
              </div>

              {/* Transit Stages Stepper */}
              <div className="mt-4 grid grid-cols-4 gap-1.5 rounded-2xl bg-muted/60 p-1.5 text-center text-[11px] font-bold">
                <div
                  className={cn(
                    'rounded-xl py-1.5 transition-colors truncate px-1',
                    currentStage === 'assigned' || currentProgress > 0
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground',
                  )}
                >
                  1. {tDelivery('stageAssigned')}
                </div>
                <div
                  className={cn(
                    'rounded-xl py-1.5 transition-colors truncate px-1',
                    currentStage === 'picked_up' || currentProgress >= 0.1
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground',
                  )}
                >
                  2. {tDelivery('stagePickedUp')}
                </div>
                <div
                  className={cn(
                    'rounded-xl py-1.5 transition-colors truncate px-1',
                    currentStage === 'in_transit' || currentProgress >= 0.2
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-muted-foreground',
                  )}
                >
                  3. {tDelivery('stageInTransit')}
                </div>
                <div
                  className={cn(
                    'rounded-xl py-1.5 transition-colors truncate px-1',
                    currentStage === 'arrived' || currentStage === 'delivered' || currentProgress >= 0.95
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-muted-foreground',
                  )}
                >
                  4. {tDelivery('stageArrived')}
                </div>
              </div>

              {/* Speed & Progress Bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Navigation className="size-3.5 text-emerald-500" />
                    <span>{tDelivery('liveRouteEta')}</span>
                  </span>
                  <span className="font-mono font-bold text-foreground">{Math.round(currentProgress * 100)}%</span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                    style={{ width: `${Math.round(currentProgress * 100)}%` }}
                  />
                </div>
              </div>

              {/* Turn-by-Turn Full Navigation Launch Button */}
              <button
                type="button"
                onClick={() => setIsNavOpen(true)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-extrabold text-white shadow-lg shadow-emerald-600/25 transition-all hover:from-emerald-700 hover:to-teal-700 active:scale-98 cursor-pointer"
              >
                <Navigation className="size-4 fill-white" />
                <span>{tDelivery('liveRouteEta')} (GPS)</span>
              </button>

              {/* Fast Action Buttons */}
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSimulating || currentStage === 'delivered'}
                  onClick={runFastSimulation}
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-neutral-800 py-2.5 text-xs font-bold text-neutral-200 border border-white/10 shadow-xs transition-all hover:bg-neutral-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSimulating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{tDelivery('speedLabel')} ({currentSpeed} km/h)...</span>
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5 fill-white" />
                      <span>⚡ {tDelivery('transitSimulation')}</span>
                    </>
                  )}
                </button>

                {currentStage === 'arrived' || currentProgress >= 0.95 ? (
                  <button
                    type="button"
                    onClick={handleCompleteHandshake}
                    className="flex items-center justify-center gap-1.5 rounded-2xl bg-coral-strong py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-coral active:scale-95 cursor-pointer"
                  >
                    <CheckCircle2 className="size-3.5" />
                    <span>{tDelivery('confirmDeliveryButton')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setStageMap((prev) => ({ ...prev, [selected.id]: 'arrived' }))
                      setProgressMap((prev) => ({ ...prev, [selected.id]: 1 }))
                      setSpeedMap((prev) => ({ ...prev, [selected.id]: 0 }))
                      notify(tDelivery('stageArrived'), 'info')
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-2.5 text-xs font-bold text-foreground transition-all hover:bg-muted active:scale-95 cursor-pointer"
                  >
                    <ArrowRight className="size-3.5" />
                    <span>{tDelivery('stageArrived')}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Live Telemetry HUD */}
          <section className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center justify-center rounded-2xl border bg-card p-3 text-center shadow-xs">
              <ThermometerSnowflake className="size-4 text-cyan-600 dark:text-cyan-400" />
              <span className="mt-1 text-xs font-bold text-foreground">3.8°C</span>
              <span className="text-[10px] text-muted-foreground">{tDelivery('tempOptimal')}</span>
            </div>

            <div className="flex flex-col items-center justify-center rounded-2xl border bg-card p-3 text-center shadow-xs">
              <Gauge className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="mt-1 text-xs font-bold text-foreground">
                {currentSpeed > 0 ? `${currentSpeed} km/h` : 'Standby'}
              </span>
              <span className="text-[10px] text-muted-foreground">{tDelivery('speedLabel')}</span>
            </div>

            <div className="flex flex-col items-center justify-center rounded-2xl border bg-card p-3 text-center shadow-xs">
              <BatteryCharging className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="mt-1 text-xs font-bold text-foreground">94%</span>
              <span className="text-[10px] text-muted-foreground">{tDelivery('unitTemperatureMonitoring')}</span>
            </div>
          </section>

          {/* Security Handshake PIN Display */}
          {selected && (
            <section
              aria-labelledby="otp-card-title"
              className="relative overflow-hidden rounded-3xl bg-neutral-900 p-5 text-center text-white shadow-lg dark:bg-black"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-300">
                  <KeyRound className="size-3.5 text-emerald-400" />
                  <span>{tDelivery('deliveryOtp')}</span>
                </span>

                <button
                  type="button"
                  onClick={() => handleCopyPin(otpForLock(selected.lockId))}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold text-white transition-colors hover:bg-white/20 cursor-pointer"
                >
                  {copiedPin ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  <span>{copiedPin ? tCommon('copied') : tCommon('copyPin')}</span>
                </button>
              </div>

              {/* PIN Digits */}
              <div
                className="mt-3 flex justify-center gap-2.5"
                aria-label={`PIN ${otpForLock(selected.lockId).split('').join(' ')}`}
              >
                {otpForLock(selected.lockId)
                  .split('')
                  .map((digit, i) => (
                    <span
                      key={i}
                      className="grid h-14 w-12 place-items-center rounded-2xl bg-white/10 text-3xl font-extrabold tabular-nums tracking-wider text-emerald-300"
                    >
                      {digit}
                    </span>
                  ))}
              </div>

              <p className="mt-3 text-xs text-white/70">
                {tDelivery('enterOtpPlaceholder')} ({icu?.short ?? 'ICU'}).
              </p>

              <button
                type="button"
                onClick={handleCompleteHandshake}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-bold text-white shadow-md transition-all hover:from-emerald-600 hover:to-teal-600 active:scale-98 cursor-pointer"
              >
                <CheckCircle2 className="size-4" />
                <span>{tDelivery('confirmDeliveryButton')}</span>
              </button>
            </section>
          )}

          {/* Interactive Live Route Map with Moving Courier Rider */}
          {bank && icu && (
            <section
              aria-labelledby="driver-route-title"
              className="overflow-hidden rounded-3xl border bg-card shadow-sm"
            >
              <div className="flex items-center justify-between p-4">
                <div>
                  <h2 id="driver-route-title" className="text-base font-bold text-foreground">
                    {tDelivery('liveRouteEta')}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {bank.short} ({tDelivery('pickupLocation')}) → {icu.short} ({tDelivery('dropoffLocation')})
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNavOpen(true)}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-95 cursor-pointer"
                  >
                    <Navigation className="size-3 fill-white" />
                    <span>Open Nav</span>
                  </button>

                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <Siren className="size-3 animate-pulse" />
                    Green Corridor
                  </span>
                </div>
              </div>

              <div className="h-64 border-t">
                <RouteMap
                  from={{ position: bank.position, label: `${tDelivery('pickupLocation')} · ${bank.short}`, kind: 'bank' }}
                  to={{ position: icu.position, label: `${tDelivery('dropoffLocation')} · ${icu.short}`, kind: 'icu' }}
                  color="#10b981"
                  progress={currentProgress}
                  onStartNavigation={() => setIsNavOpen(true)}
                />
              </div>
            </section>
          )}
        </div>
      )}

      {/* Full-Screen Google Maps Turn-by-Turn Navigation Experience */}
      {isNavOpen && bank && icu && selected && (
        <NavigationScreen
          origin={{
            name: bank.name,
            short: bank.short,
            position: bank.position,
            type: 'bank',
          }}
          destination={{
            name: icu.name,
            short: icu.short,
            position: icu.position,
            type: 'hospital',
          }}
          deliveryDetails={{
            requestId: selected.id,
            bloodGroup: selected.group,
            component: COMPONENT_LABELS[selected.component],
            units: selected.units,
            lockId: selected.lockId,
            isGreenCorridor: true,
            courierName: 'Swift Rider #42',
          }}
          onClose={() => setIsNavOpen(false)}
          onCompleteDelivery={handleCompleteHandshake}
        />
      )}
    </div>
  )
}
