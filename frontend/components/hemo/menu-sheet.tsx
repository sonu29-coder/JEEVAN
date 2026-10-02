'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  ChevronRight,
  Droplets,
  House,
  MapPin,
  Phone,
  ShieldCheck,
  Siren,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import { useGrid, type Tab } from './grid-store'

const LINKS: { tab: Tab; label: string; hint: string; icon: LucideIcon }[] = [
  { tab: 'home', label: 'Home', hint: 'Overview of your area', icon: House },
  { tab: 'request', label: 'Request blood', hint: 'For a patient in need', icon: Siren },
  { tab: 'blood', label: 'Find blood', hint: 'Blood banks near you', icon: Droplets },
  { tab: 'map', label: 'Live map', hint: 'Hospitals, banks and donors', icon: MapPin },
  { tab: 'alerts', label: 'Donor alerts', hint: 'People who need your help', icon: Bell },
  { tab: 'verify', label: 'Confirm delivery', hint: 'Enter the courier code', icon: ShieldCheck },
]

export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setTab } = useGrid()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-[70] bg-foreground/30 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.nav
            aria-label="Main menu"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[82%] flex-col bg-background p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
                <span className="grid size-9 place-items-center rounded-xl bg-coral text-white">
                  <Droplets className="size-5" aria-hidden="true" />
                </span>
                JEEVAN
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                autoFocus
                className="grid size-10 place-items-center rounded-xl border bg-card"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <ul className="mt-6 flex flex-col gap-1.5">
              {LINKS.map(({ tab, label, hint, icon: Icon }) => (
                <li key={tab}>
                  <button
                    type="button"
                    onClick={() => {
                      setTab(tab)
                      onClose()
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-muted"
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-coral-soft text-coral-strong dark:text-coral">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold">{label}</span>
                      <span className="block text-sm text-muted-foreground">{hint}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            <a
              href="tel:108"
              className="mt-auto flex items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-base font-bold text-white"
            >
              <Phone className="size-5" aria-hidden="true" />
              Call ambulance • 108
            </a>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
