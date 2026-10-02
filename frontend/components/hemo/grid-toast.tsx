'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'

const TONES = {
  success: { icon: CheckCircle2, className: 'text-mint' },
  error: { icon: TriangleAlert, className: 'text-coral' },
  info: { icon: Info, className: 'text-sky-300' },
}

export function GridToast() {
  const { toast } = useGrid()

  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-4 bottom-4 z-[80] flex justify-center">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="flex items-center gap-2.5 rounded-2xl bg-ink px-4 py-3.5 text-sm font-medium text-white shadow-xl"
          >
            {(() => {
              const Icon = TONES[toast.tone].icon
              return <Icon className={cn('size-5 shrink-0', TONES[toast.tone].className)} aria-hidden="true" />
            })()}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
