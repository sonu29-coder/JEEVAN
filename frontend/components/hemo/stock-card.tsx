'use client'

import { motion } from 'framer-motion'
import { Building2, CalendarClock, Loader2, Lock, ShieldCheck, Timer } from 'lucide-react'
import {
  BANKS,
  COMPONENT_LABELS,
  ICUS,
  OUR_ICU_ID,
  formatRemaining,
  isLocked,
  siteById,
  type StockItem,
} from '@/lib/hemo-data'
import { cn } from '@/lib/utils'

interface StockCardProps {
  item: StockItem
  now: number
  isPending: boolean
  onReserve: () => void
}

export function StockCard({ item, now, isPending, onReserve }: StockCardProps) {
  const locked = isLocked(item, now)
  const bank = siteById(BANKS, item.bankId)
  const holder = siteById(ICUS, item.lockedByIcuId)
  const ours = locked && item.lockedByIcuId === OUR_ICU_ID

  return (
    <article className="flex w-[80%] shrink-0 snap-center flex-col rounded-[28px] border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-4xl font-extrabold tracking-tight text-coral-strong dark:text-coral">{item.group}</p>
          <p className="mt-0.5 text-base font-semibold text-muted-foreground">{COMPONENT_LABELS[item.component]}</p>
        </div>
        {locked ? (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            <Lock className="size-3" aria-hidden="true" />
            {ours ? 'Held for you' : 'On hold'}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <span className="size-1.5 rounded-full bg-mint" aria-hidden="true" />
            Available
          </span>
        )}
      </div>

      <p className="mt-4 flex items-center gap-2 text-sm text-foreground">
        <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{bank?.name}</span>
      </p>
      <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
        {item.expiresInDays <= 3 ? `Use within ${item.expiresInDays} ${item.expiresInDays === 1 ? 'day' : 'days'}` : `Good for ${item.expiresInDays} days`}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-muted p-3">
          <p className="text-xs text-muted-foreground">Units</p>
          <p className="text-2xl font-extrabold">{item.units}</p>
        </div>
        <div className={cn('rounded-2xl p-3', locked ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-muted')}>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="size-3" aria-hidden="true" />
            {locked ? 'Hold ends in' : 'Hold time'}
          </p>
          <p
            className={cn('text-2xl font-extrabold tabular-nums', locked ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}
          >
            {locked && item.lockedUntil !== null ? formatRemaining(item.lockedUntil, now) : '15:00'}
          </p>
        </div>
      </div>

      <p className="mt-2 h-5 truncate text-sm text-muted-foreground">
        {locked ? (ours ? 'Show the courier code on the Verify tab' : `Held for ${holder?.short ?? 'a hospital'}`) : 'Ready to hold for 15 minutes'}
      </p>

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={onReserve}
        disabled={isPending || ours}
        className={cn(
          'mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold transition-colors disabled:cursor-not-allowed',
          ours
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
            : 'bg-coral-strong text-white hover:bg-coral-strong/90 disabled:opacity-70',
        )}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
        {ours ? 'Held for you' : isPending ? 'Holding…' : 'Hold this unit'}
      </motion.button>
    </article>
  )
}
