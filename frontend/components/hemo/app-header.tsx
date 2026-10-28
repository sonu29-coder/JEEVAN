'use client'

import { Bell, Briefcase, LogOut, Menu, Moon, Search, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useGrid, type Role } from './grid-store'
import { JeevanLogo } from './jeevan-logo'
import { LanguageSwitcher } from './language-switcher'
import { MenuSheet } from './menu-sheet'

export function AppHeader() {
  const t = useTranslations('Common')
  const { query, setQuery, setTab, tab, role, emergencies, responses, setShowDashboardSelector, logout } = useGrid()
  const [menuOpen, setMenuOpen] = useState(false)
  const unread = emergencies.filter((e) => !responses[e.id]).length

  const workspaceLabels: Record<Role, { emoji: string; label: string }> = {
    hospital: { emoji: '🏥', label: t('hospitalIcu') },
    donor: { emoji: '🩸', label: t('bloodDonor') },
    driver: { emoji: '🛵', label: t('logisticsCourier') },
    new_donor: { emoji: '✨', label: 'New Donor Portal' },
  }
  const currentWorkspace = workspaceLabels[role] || { emoji: '🏥', label: t('hospitalIcu') }

  return (
    <header className="z-30 shrink-0 border-b bg-background px-4 py-2.5">
      {/* Top Main Bar */}
      <div className="flex items-center gap-2">
        <IconButton label="Open menu" onClick={() => setMenuOpen(true)}>
          <Menu className="size-5" aria-hidden="true" />
        </IconButton>

        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            setTab('blood')
          }}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border bg-card px-3 shadow-xs focus-within:border-coral"
        >
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="global-search" className="sr-only">
            {t('searchPlaceholder')}
          </label>
          <input
            id="global-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (tab !== 'blood' || role !== 'hospital') setTab('blood')
            }}
            placeholder={t('searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </form>

        <LanguageSwitcher compact />

        <ThemeToggle />

        <IconButton label={unread > 0 ? `${t('alerts')}, ${unread}` : t('alerts')} onClick={() => setTab('alerts')}>
          <Bell className="size-5" aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute top-2 right-2 size-2 rounded-full bg-coral ring-2 ring-card" aria-hidden="true" />
          )}
        </IconButton>
      </div>

      {/* Sub Header: Active Workspace Status & Clean Actions */}
      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground shadow-2xs truncate">
            <span aria-hidden="true">{currentWorkspace.emoji}</span>
            <span className="truncate">{currentWorkspace.label}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowDashboardSelector(true)}
            className="inline-flex items-center gap-1 rounded-full border border-coral/30 bg-coral-soft hover:bg-coral/20 px-2.5 py-1 text-xs font-bold text-coral transition-colors cursor-pointer"
            title={t('switchWorkspace')}
          >
            <Briefcase className="size-3.5" aria-hidden="true" />
            <span>{t('switchWorkspace')}</span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors cursor-pointer"
            title={t('signOut')}
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t('signOut')}</span>
          </button>
        </div>
      </div>

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
      className="relative grid size-11 shrink-0 place-items-center rounded-2xl border bg-card text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-coral focus-visible:outline-none cursor-pointer"
    >
      {children}
    </button>
  )
}
