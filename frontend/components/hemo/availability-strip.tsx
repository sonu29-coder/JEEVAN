'use client'

import { ChevronRight, Droplets } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { BLOOD_GROUPS, isLocked } from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'
import { SectionTitle } from './view-header'

export const GROUP_TONES = [
  { card: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300' },
  { card: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-300' },
  { card: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300' },
  { card: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300' },
]

export function AvailabilityStrip() {
  const { stock, setTab, setQuery } = useGrid()
  const now = useNow()

  return (
    <section aria-labelledby="availability-title">
      <SectionTitle
        eyebrow="Live network"
        title="Blood availability nearby"
        action={
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setTab('blood')
            }}
            className="flex items-center gap-1 pb-0.5 text-base font-semibold text-coral-strong dark:text-coral"
          >
            View all
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        }
      />
      <ul className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1" id="availability-title">
        {BLOOD_GROUPS.map((group, i) => {
          const units = stock
            .filter((s) => s.group === group && !isLocked(s, now))
            .reduce((sum, s) => sum + s.units, 0)
          const tone = GROUP_TONES[i % GROUP_TONES.length]
          return (
            <li key={group} className="snap-start">
              <button
                type="button"
                onClick={() => {
                  setQuery(group)
                  setTab('blood')
                }}
                aria-label={`${group}: ${units > 0 ? `${units} units available nearby` : 'not available right now'}`}
                className={cn('flex w-40 flex-col items-start rounded-3xl p-5 text-left transition-transform active:scale-[0.98]', tone.card)}
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-white shadow-sm dark:bg-white/10">
                  <Droplets className={cn('size-5', tone.text)} aria-hidden="true" />
                </span>
                <span className={cn('mt-5 text-3xl font-extrabold', tone.text)}>{group}</span>
                <span className="mt-1 text-lg font-semibold text-foreground">
                  {units > 0 ? `${units} units` : 'None now'}
                </span>
                <span className="mt-2 text-sm text-muted-foreground">
                  {units > 0 ? 'Available nearby' : 'Check back soon'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
