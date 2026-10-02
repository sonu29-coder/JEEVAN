'use client'

import { Lock, LockOpen } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { BANKS, ICUS, OUR_ICU_ID, formatRemaining, isLocked, siteById } from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'

export function LockMatrixCard() {
  const { stock, setTab } = useGrid()
  const now = useNow()
  const locks = stock.filter((s) => isLocked(s, now))
  const freeUnits = stock.filter((s) => !isLocked(s, now)).reduce((sum, s) => sum + s.units, 0)

  return (
    <section aria-labelledby="lock-matrix-title" className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="lock-matrix-title" className="text-xl font-extrabold tracking-tight">
            Live inventory & lock matrix
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Units currently held for hospitals across the grid</p>
        </div>
        <button
          type="button"
          onClick={() => setTab('blood')}
          className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold hover:bg-muted"
        >
          View stock
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-muted px-4 py-3">
          <dt className="text-xs font-medium text-muted-foreground">Available units</dt>
          <dd className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">{freeUnits}</dd>
        </div>
        <div className="rounded-2xl bg-muted px-4 py-3">
          <dt className="text-xs font-medium text-muted-foreground">Active holds</dt>
          <dd className="text-2xl font-extrabold text-amber-700 dark:text-amber-300">{locks.length}</dd>
        </div>
      </dl>

      {locks.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y">
          {locks.map((item) => {
            const ours = item.lockedByIcuId === OUR_ICU_ID
            return (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-coral-soft text-sm font-extrabold text-coral-strong dark:text-coral">
                  {item.group}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{siteById(BANKS, item.bankId)?.short}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Lock className="size-3" aria-hidden="true" />
                    {ours ? 'Held for your ICU' : `Held by ${siteById(ICUS, item.lockedByIcuId)?.short}`}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums',
                    ours ? 'bg-ink text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
                  )}
                >
                  {item.lockedUntil !== null ? formatRemaining(item.lockedUntil, now) : '--:--'}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <LockOpen className="size-4" aria-hidden="true" />
          No units are on hold right now.
        </p>
      )}
    </section>
  )
}
