'use client'

import { Bell, Droplets, House, MapPin, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { isLocked, OUR_ICU_ID } from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid, type Tab } from './grid-store'

const ITEMS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'map', label: 'Map', icon: MapPin },
  { id: 'blood', label: 'Blood', icon: Droplets },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'verify', label: 'Verify', icon: ShieldCheck },
]

export function BottomDock() {
  const { tab, setTab, emergencies, responses, stock } = useGrid()
  const now = useNow()
  const unread = emergencies.filter((e) => !responses[e.id]).length
  const holding = stock.some((s) => s.lockedByIcuId === OUR_ICU_ID && isLocked(s, now))

  return (
    <nav aria-label="Primary" className="z-40 shrink-0 border-t bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const active = tab === id || (id === 'home' && tab === 'request')
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => setTab(id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex w-full flex-col items-center gap-1 pt-3 pb-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-coral focus-visible:outline-none focus-visible:ring-inset',
                  active ? 'text-coral-strong dark:text-coral' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && <span className="absolute top-0 h-1 w-8 rounded-b-full bg-coral" aria-hidden="true" />}
                <span className="relative">
                  <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" />
                  {id === 'verify' && holding && (
                    <span className="absolute -top-2.5 left-1/2 ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] leading-4 font-extrabold whitespace-nowrap text-amber-950 ring-2 ring-card">
                      15m HOLD
                    </span>
                  )}
                  {id === 'alerts' && unread > 0 && (
                    <span className="absolute -top-2 -right-3 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] leading-5 font-bold text-white ring-2 ring-card">
                      {unread}
                    </span>
                  )}
                </span>
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
