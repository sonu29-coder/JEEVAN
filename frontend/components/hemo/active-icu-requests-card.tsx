'use client'

import React, { useState } from 'react'
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock, Droplets, Plus, RefreshCw } from 'lucide-react'
import { ICUS, siteById } from '@/lib/hemo-data'
import { useGrid } from './grid-store'

export function ActiveIcuRequestsCard() {
  const { emergencies, refreshEmergencies, setTab } = useGrid()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshEmergencies()
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  return (
    <section aria-labelledby="active-icu-requests-title" className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="active-icu-requests-title" className="text-xl font-extrabold tracking-tight">
              Active ICU Blood Requests
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2 py-0.5 text-[11px] font-bold text-coral">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-coral opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-coral" />
              </span>
              Live Grid
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Emergency requests saved to hospital grid & dispatch database
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh active requests"
            aria-label="Refresh active requests"
            className="grid size-8 place-items-center rounded-full border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin text-coral' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setTab('request')}
            className="flex items-center gap-1 rounded-full bg-coral px-3 py-1.5 text-xs font-bold text-white hover:bg-coral-strong transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="size-3.5" />
            <span>New Request</span>
          </button>
        </div>
      </div>

      {emergencies.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y divide-border/60">
          {emergencies.map((req) => {
            const facility = siteById(ICUS, req.icuId)?.short || req.icuId || 'Central ICU'
            const isCritical = req.urgency === 'CRITICAL'

            return (
              <li key={req.id} className="flex items-center gap-3 py-3.5 first:pt-2 last:pb-1">
                {/* Blood Group Badge */}
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-coral/10 text-sm font-extrabold text-coral border border-coral/20">
                  {req.group}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-foreground">
                      {req.units} {req.units === 1 ? 'Unit' : 'Units'} • {req.component || 'PRBC'}
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                        isCritical
                          ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {req.urgency}
                    </span>
                  </div>

                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <span>{facility}</span>
                    <span>•</span>
                    <span className="font-mono text-[11px] text-muted-foreground/80">{req.id}</span>
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    <span>Saved in Grid</span>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center">
          <Droplets className="mx-auto size-6 text-muted-foreground/50" />
          <p className="mt-2 text-xs font-semibold text-foreground">No Active Emergency Requests</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            All ICU blood units are currently satisfied. Click New Request above to broadcast.
          </p>
        </div>
      )}
    </section>
  )
}
