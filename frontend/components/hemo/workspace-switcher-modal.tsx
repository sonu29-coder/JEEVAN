'use client'

import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  ArrowRight,
  Bike,
  Briefcase,
  CheckCircle2,
  Droplets,
  Hospital,
  LogOut,
  Siren,
  X,
} from 'lucide-react'
import { PORTAL_ACCESS, type AuthRole } from '@/lib/hemo-auth'
import { useGrid, type Role } from './grid-store'

interface WorkspaceSwitcherModalProps {
  open: boolean
  onClose: () => void
}

interface WorkspaceConfig {
  id: Role
  title: string
  subtitle: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  badgeBg: string
  activeBorder: string
}

export function WorkspaceSwitcherModal({ open, onClose }: WorkspaceSwitcherModalProps) {
  const t = useTranslations('Common')
  const tIce = useTranslations('ICE')
  const { role, setRole, session, currentUser, logout, notify } = useGrid()

  const allWorkspaces: WorkspaceConfig[] = [
    {
      id: 'hospital',
      title: t('hospitalIcu'),
      subtitle: 'Emergency Clinical Operations',
      description: 'Manage blood inventory, emergency requests, hospital requirements, and transfusion logistics.',
      icon: Hospital,
      badgeBg: 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400',
      activeBorder: 'border-red-500/60 bg-red-500/5',
    },
    {
      id: 'new_donor',
      title: 'New Donor Portal',
      subtitle: 'First-Time Life Saver Onboarding',
      description: 'Orientation checklist, clinical preparation guides, first donation appointment, and rare blood lookup.',
      icon: Droplets,
      badgeBg: 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
      activeBorder: 'border-rose-500/60 bg-rose-500/5',
    },
    {
      id: 'donor',
      title: t('bloodDonor'),
      subtitle: 'Volunteer Life Saver Network',
      description: 'View donation requests, manage appointments, and access donor-related services.',
      icon: Droplets,
      badgeBg: 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
      activeBorder: 'border-rose-500/60 bg-rose-500/5',
    },
    {
      id: 'driver',
      title: t('logisticsCourier'),
      subtitle: 'Cold-Chain Green Corridor',
      description: 'Manage blood deliveries, assigned routes, dispatch status, and delivery verification.',
      icon: Bike,
      badgeBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
      activeBorder: 'border-emerald-500/60 bg-emerald-500/5',
    },
  ]

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  // Filter to ONLY workspaces the authenticated user is authorized to access
  const isAuthorized = (workspaceRole: Role): boolean => {
    const requiredAuthRole = PORTAL_ACCESS[workspaceRole].required
    const userRole = (currentUser?.role || session) as AuthRole | undefined
    const allowedRoles = (currentUser?.allowed_roles || '').split(',')

    return (
      userRole === requiredAuthRole ||
      userRole === ('ADMIN' as any) ||
      session === ('ADMIN' as any) ||
      allowedRoles.includes(requiredAuthRole)
    )
  }

  const authorizedWorkspaces = allWorkspaces.filter((w) => isAuthorized(w.id))

  const handleSelectWorkspace = (targetRole: Role) => {
    if (targetRole !== role) {
      setRole(targetRole)
      notify(`Switched to ${allWorkspaces.find((w) => w.id === targetRole)?.title}`, 'success')
    }
    onClose()
  }

  const handleSignOut = () => {
    onClose()
    logout()
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-modal-title"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-coral/10 text-coral">
                <Briefcase className="size-5 text-coral" />
              </div>
              <div>
                <h2 id="workspace-modal-title" className="text-base font-bold text-foreground">
                  {t('switchWorkspace')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {currentUser?.name || 'Authorized workspaces'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Quick Citizen Emergency (ICE) Link Banner */}
          <div className="px-5 pt-3">
            <Link
              href="/ice"
              onClick={onClose}
              className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-50/70 dark:bg-red-950/20 p-3 hover:bg-red-100/70 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-red-600 text-white shadow-xs">
                  <Siren className="size-4.5 animate-pulse" />
                </span>
                <div>
                  <p className="text-xs font-bold text-red-700 dark:text-red-300">
                    {tIce('title')}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {tIce('subtitle')}
                  </p>
                </div>
              </div>
              <ArrowRight className="size-4 text-red-600 shrink-0" />
            </Link>
          </div>

          {/* Authorized Workspaces List */}
          <div className="p-5 space-y-3 max-h-[50vh] overflow-y-auto no-scrollbar">
            {authorizedWorkspaces.map((ws) => {
              const Icon = ws.icon
              const isActive = ws.id === role

              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSelectWorkspace(ws.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition-all flex flex-col gap-2 cursor-pointer ${
                    isActive
                      ? `${ws.activeBorder} shadow-sm ring-1 ring-coral/30`
                      : 'border-border bg-background hover:border-coral/40 hover:bg-muted/40 shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`grid size-11 place-items-center rounded-xl shrink-0 ${ws.badgeBg}`}>
                      <Icon className="size-5.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-foreground">{ws.title}</h3>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-coral bg-coral-soft px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="size-3" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-coral flex items-center gap-1">
                            <span>Open</span>
                            <ArrowRight className="size-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {ws.description}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer: Sign Out & Switch Account */}
          <div className="border-t border-border/80 p-4 bg-muted/30 flex items-center justify-between">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              <LogOut className="size-3.5" />
              <span>{t('signOut')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              {t('close')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
