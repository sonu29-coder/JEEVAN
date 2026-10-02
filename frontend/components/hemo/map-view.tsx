'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { COMPONENT_LABELS, ICUS, URGENCY_LABELS, isLocked, siteById } from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'

const GridMap = dynamic(() => import('./grid-map'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-muted">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading map…
      </p>
    </div>
  ),
})

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

  return (
    <div className="absolute inset-0">
      <GridMap />

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex flex-col gap-2">
        <dl className="pointer-events-auto grid grid-cols-3 gap-2 rounded-3xl border bg-card/95 p-2 shadow-lg backdrop-blur">
          <Stat label="Requests" value={emergencies.length} className="text-coral-strong dark:text-coral" />
          <Stat label="On hold" value={holds} className="text-amber-700 dark:text-amber-300" />
          <Stat label="Hospitals" value={ICUS.length} className="text-emerald-700 dark:text-emerald-300" />
        </dl>
        <ul className="no-scrollbar pointer-events-auto flex gap-1.5 overflow-x-auto">
          {LEGEND.map((item) => (
            <li
              key={item.label}
              className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card/95 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur"
            >
              <span className={cn('size-3', item.className)} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {latest && latestIcu && (
        <button
          type="button"
          onClick={() => setTab('alerts')}
          className="absolute inset-x-3 bottom-3 z-[500] flex items-center gap-3 rounded-3xl border bg-card p-4 text-left shadow-xl"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-coral-soft text-lg font-extrabold text-coral-strong dark:text-coral">
            {latest.group}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold">{latestIcu.name}</span>
            <span className="block truncate text-sm text-muted-foreground">
              {`${latest.units} ${latest.units === 1 ? 'unit' : 'units'} of ${COMPONENT_LABELS[latest.component].toLowerCase()} needed`}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-coral-strong px-3 py-1 text-xs font-bold text-white">
            {URGENCY_LABELS[latest.urgency].title}
          </span>
        </button>
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
