'use client'

import { CheckCircle2, MapPin, Plus, ShieldAlert } from 'lucide-react'
import {
  COMPONENT_LABELS,
  ICUS,
  URGENCY_LABELS,
  USER_LOCATION,
  distanceKm,
  siteById,
  type Urgency,
} from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'
import { ViewHeader } from './view-header'

const URGENCY_CHIP: Record<Urgency, string> = {
  CRITICAL: 'bg-coral-soft text-coral-strong dark:text-coral',
  HIGH: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  ROUTINE: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
}

export function AlertsView() {
  const { emergencies, responses, respond, notify, setTab, openNccAlert } = useGrid()

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10">
      <ViewHeader
        eyebrow="Donor alerts"
        title="People near you need blood"
        description="Say yes only if you are healthy and can reach the hospital soon."
      />

      {/* Single Verified Blood Club / NCC Coordinator Emergency Trigger */}
      <div className="mb-4 rounded-3xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-amber-500/10 to-transparent p-4 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-coral text-white shadow-sm">
            <ShieldAlert className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-coral">Direct Protocol</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                1 Verified Leader
              </span>
            </div>
            <p className="text-xs font-bold text-foreground truncate">Capt. Dr. Arun Balakrishnan</p>
            <p className="text-[10px] text-muted-foreground truncate">23 Kerala Bn NCC • 128 Cadets on standby</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openNccAlert(emergencies[0])}
          className="shrink-0 px-3 py-2 rounded-xl bg-coral hover:bg-coral-strong text-white text-xs font-bold shadow-sm transition-transform active:scale-95 flex items-center gap-1"
        >
          <span>Dispatch</span>
        </button>
      </div>

      <ul className="flex flex-col gap-3">
        {emergencies.map((e) => {
          const hospital = siteById(ICUS, e.icuId)
          const km = hospital ? distanceKm(USER_LOCATION, hospital.position) : 0
          const response = responses[e.id]
          return (
            <li key={e.id} className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-coral-soft text-xl font-extrabold text-coral-strong dark:text-coral">
                  {e.group}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold">{hospital?.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {`${e.units} ${e.units === 1 ? 'unit' : 'units'} of ${COMPONENT_LABELS[e.component].toLowerCase()}`}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden="true" />
                    {`${km.toFixed(1)} km away`}
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', URGENCY_CHIP[e.urgency])}>
                  {URGENCY_LABELS[e.urgency].title}
                </span>
              </div>

              {response ? (
                <p
                  className={cn(
                    'mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold',
                    response === 'help'
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {response === 'help' && <CheckCircle2 className="size-4" aria-hidden="true" />}
                  {response === 'help' ? 'You said you can help. Thank you!' : 'Marked as not available'}
                </p>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      respond(e.id, 'help')
                      notify(`Thank you! ${hospital?.short ?? 'The hospital'} knows you are coming.`, 'success')
                    }}
                    className="flex-1 rounded-2xl bg-coral-strong py-3.5 text-base font-bold text-white"
                  >
                    I can help
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(e.id, 'declined')}
                    className="rounded-2xl border px-5 py-3.5 text-base font-semibold hover:bg-muted"
                  >
                    Not now
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => setTab('request')}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-4 text-base font-semibold text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-5" aria-hidden="true" />
        Request blood for a patient
      </button>
    </div>
  )
}
