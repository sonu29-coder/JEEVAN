'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useGrid, type Role } from './grid-store'

const ROLES: { id: Role; emoji: string; label: string }[] = [
  { id: 'hospital', emoji: '🏥', label: 'ICU' },
  { id: 'donor', emoji: '🩸', label: 'Donor' },
  { id: 'driver', emoji: '🛵', label: 'Driver' },
]

export function RoleSwitcher({ className }: { className?: string }) {
  const { role, setRole } = useGrid()

  return (
    <div
      role="radiogroup"
      aria-label="Switch portal"
      className={cn('inline-flex gap-1 rounded-full border bg-muted p-1', className)}
    >
      {ROLES.map((r) => {
        const active = role === r.id
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setRole(r.id)}
            className={cn(
              'relative flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-coral focus-visible:outline-none',
              active ? 'text-white' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId="role-pill"
                className="absolute inset-0 rounded-full bg-ink shadow-sm"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                aria-hidden="true"
              />
            )}
            <span className="relative" aria-hidden="true">
              {r.emoji}
            </span>
            <span className="relative truncate">{r.label}</span>
          </button>
        )
      })}
    </div>
  )
}
