'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  ChevronRight,
  Compass,
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
  const { setTab, openExpiryRadar } = useGrid()

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

            <ul className="mt-6 flex flex-col gap-1.5 overflow-y-auto no-scrollbar">
              {LINKS.map(({ tab, label, hint, icon: Icon }) => (
                <li key={tab}>
                  <button
                    type="button"
                    onClick={() => {
                      setTab(tab)
                      onClose()
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-coral-soft text-coral-strong dark:text-coral shrink-0">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-muted-foreground truncate">{hint}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}

              <li>
                <button
                  type="button"
                  onClick={() => {
                    openExpiryRadar()
                    onClose()
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors bg-amber-500/10 hover:bg-amber-500/15 border border-amber-300/40 dark:border-amber-800/40"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0">
                    <Compass className="size-5 animate-spin" style={{ animationDuration: '16s' }} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-amber-950 dark:text-amber-100">
                      <span>Blood Expiry Radar</span>
                      <span className="size-2 rounded-full bg-coral animate-ping" />
                    </span>
                    <span className="block text-xs text-amber-800 dark:text-amber-300 truncate">
                      FEFO prioritization & transfers
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                </button>
              </li>

              <li className="pt-2 border-t border-border mt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 mb-1.5 block">
                  Dedicated Login Portals
                </span>
                <div className="grid grid-cols-1 gap-1">
                  <a
                    href="/login/icu"
                    className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors"
                  >
                    <span className="grid size-7 place-items-center rounded-lg bg-red-100 dark:bg-red-950/60 shrink-0">
                      🏥
                    </span>
                    <span className="flex-1 truncate">ICU Hospital Login</span>
                    <ChevronRight className="size-3.5 opacity-60" />
                  </a>

                  <a
                    href="/login/donor"
                    className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-colors"
                  >
                    <span className="grid size-7 place-items-center rounded-lg bg-rose-100 dark:bg-rose-950/60 shrink-0">
                      🩸
                    </span>
                    <span className="flex-1 truncate">Blood Donor Login</span>
                    <ChevronRight className="size-3.5 opacity-60" />
                  </a>

                  <a
                    href="/login/driver"
                    className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors"
                  >
                    <span className="grid size-7 place-items-center rounded-lg bg-emerald-100 dark:bg-emerald-950/60 shrink-0">
                      🛵
                    </span>
                    <span className="flex-1 truncate">Logistics Driver Login</span>
                    <ChevronRight className="size-3.5 opacity-60" />
                  </a>

                  <a
                    href="/login"
                    className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>View All Role Login Portals</span>
                    <ChevronRight className="size-3" />
                  </a>
                </div>
              </li>
            </ul>

            <a
              href="tel:108"
              className="mt-auto flex items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-sm font-bold text-white shadow-md"
            >
              <Phone className="size-4" aria-hidden="true" />
              Call ambulance • 108
            </a>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
