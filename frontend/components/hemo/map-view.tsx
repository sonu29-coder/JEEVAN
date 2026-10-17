'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Layers, Loader2, Navigation, Zap } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { BANKS, COMPONENT_LABELS, ICUS, URGENCY_LABELS, isLocked, siteById } from '@/lib/hemo-data'
import { calculateRoadRoute, type MapLayerType, type RouteOption } from '@/lib/navigation-service'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'

const GridMap = dynamic(() => import('./grid-map'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-muted">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Calculating road corridor…
      </p>
    </div>
  ),
})

const NavigationScreen = dynamic(
  () => import('./navigation-screen').then((mod) => mod.NavigationScreen),
  { ssr: false }
)

const LEGEND = [
  { label: 'Hospital', className: 'rounded-full border-[3px] border-coral bg-white' },
  { label: 'Blood bank', className: 'rounded-[4px] border-[3px] border-blue-600 bg-white' },
  { label: 'Donor', className: 'rounded-full bg-mint' },
  { label: 'On hold', className: 'rounded-[4px] border-[3px] border-gold bg-white' },
]

export function MapView() {
  const { emergencies, stock, setTab } = useGrid()
  const now = useNow()
  const holds = stock.filter((s) => isLocked(s, now)).length
  const latest = emergencies[0]
  const latestIcu = latest ? siteById(ICUS, latest.icuId) : undefined
  const defaultBank = BANKS[2] // Red Cross Chennai

  const [mapLayer, setMapLayer] = useState<MapLayerType>('streets')
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [activeCorridor, setActiveCorridor] = useState<RouteOption | null>(null)

  // Compute shortest road corridor and time-saving metrics between primary blood bank and emergency hospital
  useEffect(() => {
    let active = true
    if (latestIcu) {
      calculateRoadRoute(defaultBank.position, latestIcu.position, { isGreenCorridor: true }).then((res) => {
        if (active && res.activeRoute) {
          setActiveCorridor(res.activeRoute)
        }
      })
    }
    return () => {
      active = false
    }
  }, [latestIcu?.position, defaultBank.position])

  return (
    <div className="absolute inset-0">
      <GridMap layer={mapLayer} />

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex flex-col gap-2">
        <dl className="pointer-events-auto grid grid-cols-3 gap-2 rounded-3xl border bg-card/95 p-2 shadow-lg backdrop-blur">
          <Stat label="Requests" value={emergencies.length} className="text-coral-strong dark:text-coral" />
          <Stat label="On hold" value={holds} className="text-amber-700 dark:text-amber-300" />
          <Stat label="Hospitals" value={ICUS.length} className="text-emerald-700 dark:text-emerald-300" />
        </dl>

        {/* Real Leaflet Map Controls & Layer Switcher */}
        <div className="pointer-events-auto flex items-center justify-between gap-1.5">
          <div className="flex items-center rounded-full border bg-card/95 p-1 shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => setMapLayer('streets')}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-bold transition-all',
                mapLayer === 'streets'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Real Leaflet OpenStreetMap roadway network with street names"
            >
              🗺️ Roads
            </button>
            <button
              type="button"
              onClick={() => setMapLayer('satellite')}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-bold transition-all',
                mapLayer === 'satellite'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Real Aerial Satellite View"
            >
              🛰️ Satellite
            </button>
            <button
              type="button"
              onClick={() => setMapLayer('dark')}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-bold transition-all',
                mapLayer === 'dark'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Dark Mode without watermarks"
            >
              🌙 Dark
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsNavOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 active:scale-95"
            title="Launch Shortest Road & Green Corridor Navigation"
          >
            <Navigation className="size-3 fill-white" />
            <span>Live Nav</span>
          </button>
        </div>

        {/* Legend Badges */}
        <ul className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {LEGEND.map((item) => (
            <li
              key={item.label}
              className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-[11px] font-semibold shadow-xs backdrop-blur"
            >
              <span className={cn('size-2.5', item.className)} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {latest && latestIcu && (
        <div className="absolute inset-x-3 bottom-3 z-[500] flex items-center gap-2 rounded-3xl border bg-card/95 p-3.5 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => setTab('alerts')}
            className="flex flex-1 items-center gap-3 text-left min-w-0"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-coral-soft text-lg font-extrabold text-coral-strong dark:text-coral">
              {latest.group}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-bold">{latestIcu.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {`${latest.units} ${latest.units === 1 ? 'unit' : 'units'} of ${COMPONENT_LABELS[latest.component].toLowerCase()} needed`}
              </span>
              {/* Shortest Road Way Path & Time-Saving Display */}
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-500/10 px-1.5 py-0.5">
                  <Zap className="size-3 fill-emerald-500 text-emerald-500" />
                  {activeCorridor ? `${(activeCorridor.distanceMeters / 1000).toFixed(1)} km road` : 'Optimizing shortest…'}
                </span>
                <span>•</span>
                <span className="truncate">
                  {activeCorridor?.timeSavedSeconds && activeCorridor.timeSavedSeconds > 0
                    ? `Saves ${Math.max(1, Math.round(activeCorridor.timeSavedSeconds / 60))}m (A* Green Wave)`
                    : 'Fastest Path'}
                </span>
              </div>
            </span>
            <span className="shrink-0 rounded-full bg-coral-strong px-2.5 py-1 text-[11px] font-bold text-white self-start mt-1">
              {URGENCY_LABELS[latest.urgency].title}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsNavOpen(true)}
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md hover:bg-emerald-700 active:scale-95"
            title="Open Turn-by-Turn Navigation Corridor along Shortest Road"
          >
            <Navigation className="size-5 fill-white" />
          </button>
        </div>
      )}

      {/* Full-Screen Google Maps Navigation Modal */}
      {isNavOpen && latestIcu && (
        <NavigationScreen
          origin={{
            name: defaultBank.name,
            short: defaultBank.short,
            position: defaultBank.position,
            type: 'bank',
          }}
          destination={{
            name: latestIcu.name,
            short: latestIcu.short,
            position: latestIcu.position,
            type: 'hospital',
          }}
          deliveryDetails={{
            requestId: latest?.id || 'REQ-EMERGENCY',
            bloodGroup: latest?.group || 'O-',
            component: latest ? COMPONENT_LABELS[latest.component] : 'Whole Blood',
            units: latest?.units || 2,
            isGreenCorridor: latest?.urgency === 'CRITICAL',
            courierName: 'Medical Emergency Fleet #1',
          }}
          onClose={() => setIsNavOpen(false)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="flex flex-col-reverse items-center rounded-2xl bg-muted py-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('text-xl leading-tight font-extrabold', className)}>{value}</dd>
    </div>
  )
}
