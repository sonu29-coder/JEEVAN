'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Clock, Siren, X } from 'lucide-react'
import { useEffect } from 'react'
import { BANKS, formatRemaining, siteById, type StockItem } from '@/lib/hemo-data'
import { useGrid } from './grid-store'

export interface ConflictInfo {
  item: StockItem
  detail: string
  lockedUntil: number | null
}

export function ConflictModal({
  conflict,
  now,
  onClose,
}: {
  conflict: ConflictInfo | null
  now: number
  onClose: () => void
}) {
  const { setTab } = useGrid()

  useEffect(() => {
    if (!conflict) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [conflict, onClose])

  return (
    <AnimatePresence>
      {conflict && (
        <motion.div
          className="absolute inset-0 z-[60] flex items-end bg-foreground/30 p-3 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="conflict-title"
            aria-describedby="conflict-desc"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full rounded-[30px] bg-card p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-muted"
            >
              <X className="size-5" aria-hidden="true" />
            </button>

            <span className="grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200">
              <Clock className="size-7" aria-hidden="true" />
            </span>
            <h2 id="conflict-title" className="mt-4 text-2xl font-extrabold">
              Someone else is holding this
            </h2>
            <p id="conflict-desc" className="mt-2 text-base leading-relaxed text-muted-foreground">
              {`${conflict.detail} ${conflict.item.group} at ${siteById(BANKS, conflict.item.bankId)?.short ?? 'this bank'} will be free again soon.`}
            </p>

            {conflict.lockedUntil !== null && (
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3.5 dark:bg-amber-950/40">
                <span className="text-sm font-medium text-amber-900 dark:text-amber-200">Free again in</span>
                <span className="text-2xl font-extrabold text-amber-700 tabular-nums dark:text-amber-300">
                  {formatRemaining(conflict.lockedUntil, now)}
                </span>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose()
                  setTab('request')
                }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-coral-strong py-4 text-base font-bold text-white"
              >
                <Siren className="size-5" aria-hidden="true" />
                Send an emergency request
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border py-4 text-base font-semibold hover:bg-muted"
              >
                Choose another unit
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
