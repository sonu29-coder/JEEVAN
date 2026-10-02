'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Building2, Hospital, KeyRound, Loader2, PackageCheck } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { BANKS, COMPONENT_LABELS, ICUS, distanceKm, formatRemaining, isLocked, otpForLock, siteById } from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
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

export function DriverDashboard() {
  const { stock } = useGrid()
  const now = useNow()
  const dispatches = stock.filter((s) => s.lockedByIcuId && isLocked(s, now))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = dispatches.find((d) => d.id === selectedId) ?? dispatches[0]
  const bank = selected ? siteById(BANKS, selected.bankId) : undefined
  const icu = selected ? siteById(ICUS, selected.lockedByIcuId) : undefined

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10">
      <ViewHeader
        eyebrow="Courier portal"
        title="Active dispatches"
        description="Pick up from the blood bank and show the PIN to ICU staff on arrival."
      />

      {dispatches.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border bg-card px-6 py-10 text-center shadow-sm">
          <span className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <PackageCheck className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-bold">All deliveries complete</h2>
          <p className="mt-1 text-base text-muted-foreground">New dispatches appear here when a hospital holds a unit.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Dispatches">
            {dispatches.map((item) => {
              const from = siteById(BANKS, item.bankId)
              const to = siteById(ICUS, item.lockedByIcuId)
              const active = item.id === selected?.id
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-3xl border-2 bg-card p-4 text-left shadow-sm transition-colors',
                      active ? 'border-coral' : 'border-transparent hover:border-border',
                    )}
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-coral-soft text-base font-extrabold text-coral-strong dark:text-coral">
                      {item.group}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-sm font-bold">
                        <Building2 className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
                        <span className="sr-only">Pickup:</span>
                        {from?.short}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                        <Hospital className="size-3.5 shrink-0 text-coral" aria-hidden="true" />
                        <span className="sr-only">Drop-off:</span>
                        {to?.short}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs text-muted-foreground">
                        {from && to ? `${distanceKm(from.position, to.position).toFixed(1)} km` : ''}
                      </span>
                      <span className="block text-sm font-extrabold text-amber-700 tabular-nums dark:text-amber-300">
                        {item.lockedUntil !== null ? formatRemaining(item.lockedUntil, now) : '--:--'}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {selected && (
            <section aria-labelledby="otp-card-title" className="rounded-3xl bg-ink p-6 text-center text-white shadow-lg">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-white/70">
                <KeyRound className="size-4" aria-hidden="true" />
                <span id="otp-card-title">Security handshake PIN</span>
              </p>
              <p className="mt-3 flex justify-center gap-2" aria-label={`PIN ${otpForLock(selected.lockId).split('').join(' ')}`}>
                {otpForLock(selected.lockId)
                  .split('')
                  .map((digit, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className="grid h-16 w-14 place-items-center rounded-2xl bg-white/10 text-4xl font-extrabold tabular-nums"
                    >
                      {digit}
                    </span>
                  ))}
              </p>
              <p className="mt-4 text-sm text-white/75">
                {`Show this code to ${icu?.short ?? 'ICU'} staff on arrival · ${selected.group} ${COMPONENT_LABELS[selected.component].toLowerCase()}`}
              </p>
            </section>
          )}

          {bank && icu && (
            <section aria-labelledby="driver-route-title" className="overflow-hidden rounded-3xl border bg-card shadow-sm">
              <h2 id="driver-route-title" className="p-5 pb-4 text-lg font-bold">
                Live route
              </h2>
              <div className="h-64 border-t">
                <RouteMap
                  from={{ position: bank.position, label: `Pickup · ${bank.short}`, kind: 'bank' }}
                  to={{ position: icu.position, label: `Drop · ${icu.short}`, kind: 'icu' }}
                  color="#e8524a"
                />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
