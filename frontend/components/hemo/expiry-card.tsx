'use client'

import { CalendarClock, ChevronRight, TriangleAlert } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { BANKS, COMPONENT_LABELS, isLocked, siteById } from '@/lib/hemo-data'
import { useGrid } from './grid-store'

export function ExpiryCard() {
  const { stock, setTab, setQuery } = useGrid()
  const now = useNow()
  const expiring = stock
    .filter((s) => s.expiresInDays <= 3 && s.units > 0 && !isLocked(s, now))
    .sort((a, b) => a.expiresInDays - b.expiresInDays)
  const units = expiring.reduce((sum, s) => sum + s.units, 0)

  if (units === 0) return null

  return (
    <section
      aria-labelledby="expiry-title"
      className="rounded-[30px] border-2 border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/30"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300">
          <CalendarClock className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="expiry-title" className="text-xl font-extrabold text-amber-950 dark:text-amber-100">
            {`${units} units near expiry`}
          </h2>
          <p className="mt-0.5 text-base text-amber-800 dark:text-amber-300">Smart transfer opportunity</p>
        </div>
        <TriangleAlert className="size-6 shrink-0 text-gold" aria-hidden="true" />
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {expiring.slice(0, 3).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                setQuery(item.group)
                setTab('blood')
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-white/80 p-3 text-left dark:bg-white/5"
            >
              <span className="w-12 text-lg font-extrabold text-amber-900 dark:text-amber-200">{item.group}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {`${COMPONENT_LABELS[item.component]} · ${item.units} units`}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {siteById(BANKS, item.bankId)?.short}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                {item.expiresInDays === 1 ? '1 day left' : `${item.expiresInDays} days left`}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
