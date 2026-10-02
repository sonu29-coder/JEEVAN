'use client'

import { Bell, Menu, Moon, Search, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { hasPortalAccess } from '@/lib/hemo-auth'
import { useGrid } from './grid-store'
import { MenuSheet } from './menu-sheet'
import { RoleSwitcher } from './role-switcher'

export function AppHeader() {
  const { query, setQuery, setTab, tab, role, session, emergencies, responses } = useGrid()
  const [menuOpen, setMenuOpen] = useState(false)
  const unread = emergencies.filter((e) => !responses[e.id]).length

  return (
    <header className="z-30 shrink-0 border-b bg-background px-4 py-3">
      <div className="flex items-center gap-2.5">
        <IconButton label="Open menu" onClick={() => setMenuOpen(true)}>
          <Menu className="size-5" aria-hidden="true" />
        </IconButton>

        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            setTab('blood')
          }}
          className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border bg-card px-3.5 shadow-sm focus-within:border-coral"
        >
          <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="global-search" className="sr-only">
            Search blood groups or blood banks
          </label>
          <input
            id="global-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (tab !== 'blood' || role !== 'hospital') setTab('blood')
            }}
            placeholder="Search blood, blood banks"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </form>

        <ThemeToggle />

        <IconButton label={unread > 0 ? `Alerts, ${unread} new` : 'Alerts'} onClick={() => setTab('alerts')}>
          <Bell className="size-5" aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-coral ring-2 ring-card" aria-hidden="true" />
          )}
        </IconButton>
      </div>

      {(!hasPortalAccess(session, role) || !(role === 'hospital' && tab === 'home')) && (
        <RoleSwitcher className="mt-3" />
      )}

      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(false)

  return (
    <IconButton
      label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => {
        const next = !dark
        document.documentElement.classList.toggle('dark', next)
        setDark(next)
      }}
    >
      {dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
    </IconButton>
  )
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="relative grid size-12 shrink-0 place-items-center rounded-2xl border bg-card text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-coral focus-visible:outline-none"
    >
      {children}
    </button>
  )
}
