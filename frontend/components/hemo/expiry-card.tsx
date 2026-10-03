'use client'

import { CalendarClock, ChevronRight, Compass, Flame, Radio, TriangleAlert, Zap } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { BANKS, COMPONENT_LABELS, isLocked, siteById } from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'

export function ExpiryCard() {
  const { stock, openExpiryRadar } = useGrid()
  const now = useNow()
  const expiring = stock
    .filter((s) => s.expiresInDays <= 5 && s.units > 0 && !isLocked(s, now))
    .sort((a, b) => a.expiresInDays - b.expiresInDays)
  const critical = expiring.filter((s) => s.expiresInDays <= 2)
  const units = expiring.reduce((sum, s) => sum + s.units, 0)

  if (units === 0) return null

  return (
    <section
      aria-labelledby="expiry-title"
      className="relative overflow-hidden rounded-[30px] border-2 border-amber-300/80 bg-gradient-to-br from-amber-50 via-amber-50/80 to-coral/5 p-5 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/20"
    >
      {/* Background soft radar ring */}
      <div className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full border border-amber-300/40 opacity-40 dark:border-amber-700/40" />
      <div className="pointer-events-none absolute -right-14 -top-14 size-48 rounded-full border border-amber-300/20 opacity-30 dark:border-amber-700/20" />

      <div className="flex items-start gap-4">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm dark:bg-amber-900/50 dark:text-amber-300">
          <Compass className="size-7 animate-spin" style={{ animationDuration: '18s' }} aria-hidden="true" />
          <span className="absolute -top-1 -right-1 flex size-3.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-coral opacity-75" />
            <span className="relative inline-flex size-3.5 rounded-full bg-coral" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-black tracking-wider text-amber-900 uppercase dark:bg-amber-900/60 dark:text-amber-200">
              RADAR ACTIVE
            </span>
            {critical.length > 0 && (
              <span className="rounded-full bg-coral/15 px-2 py-0.5 text-[10px] font-black tracking-wider text-coral uppercase">
                {critical.length} Critical
              </span>
            )}
          </div>
          <h2 id="expiry-title" className="mt-1 text-xl font-black text-amber-950 dark:text-amber-100">
            {`${units} units approaching expiry`}
          </h2>
          <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300">
            Clinical FEFO matching & inter-hospital transfer opportunities
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {expiring.slice(0, 3).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={openExpiryRadar}
              className="group flex w-full items-center gap-3 rounded-2xl bg-white/90 p-3 text-left shadow-xs transition hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
            >
              <span className="w-12 text-lg font-extrabold text-amber-900 dark:text-amber-200">{item.group}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {`${COMPONENT_LABELS[item.component]} · ${item.units} units`}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {siteById(BANKS, item.bankId)?.short}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                  item.expiresInDays <= 2
                    ? 'bg-coral/15 text-coral dark:bg-coral/30'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
                )}
              >
                {item.expiresInDays === 1 ? '1 day left' : `${item.expiresInDays} days left`}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>

      {/* Direct Radar Trigger Action Button */}
      <div className="mt-4 pt-1">
        <button
          type="button"
          onClick={openExpiryRadar}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-amber-600 active:scale-[0.98] dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          <Radio className="size-4 animate-pulse" />
          <span>Launch Blood Expiry Radar</span>
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  )
}

