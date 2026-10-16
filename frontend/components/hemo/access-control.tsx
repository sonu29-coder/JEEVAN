'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, KeyRound, Lock, ShieldAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { useGridPost } from '@/hooks/use-grid-post'
import { CREDENTIALS, PORTAL_ACCESS, type AuthRole } from '@/lib/hemo-auth'
import { useGrid } from './grid-store'

// Obsolete debug bar removed as per Requirement 1 & 4
export function SessionBar() {
  return null
}

// Obsolete technical debug banner removed as per Requirement 4
export function AuthBanner({ session }: { session: AuthRole }) {
  return null
}

const ROLE_USER_LABELS: Record<string, string> = {
  ICU_HOSPITAL: 'Hospital / ICU Medical Staff',
  REGISTERED_DONOR: 'Registered Voluntary Donor',
  DELIVERY_PARTNER: 'Medical Logistics Courier',
  ADMIN: 'System Administrator',
}

const PORTAL_REQUIRED_LABELS: Record<string, string> = {
  hospital: 'Hospital & ICU Clearance',
  donor: 'Registered Donor Profile',
  driver: 'Medical Courier Clearance',
}

export function AccessDenied() {
  const { role, session, setSession, setShowDashboardSelector, logout } = useGrid()
  const portal = PORTAL_ACCESS[role]
  const required = CREDENTIALS[portal.required]
  const current = CREDENTIALS[session]
  const { trigger, isLoading } = useGridPost<{ portal: string }, { granted: boolean }>(portal.probePath)

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-5 py-8 dark:bg-slate-950">
      <section
        aria-labelledby="denied-title"
        className="mx-auto max-w-sm rounded-[28px] border border-slate-200 bg-card p-6 shadow-sm dark:border-slate-800"
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <Lock className="size-7" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-bold tracking-widest text-red-600 uppercase dark:text-red-400">{portal.name}</p>
        <h2 id="denied-title" className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-50">
          Restricted Workspace
        </h2>
        <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-slate-300">{portal.denial}</p>

        <dl className="mt-5 flex flex-col gap-2 rounded-2xl bg-slate-100 p-4 text-sm dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">Required Clearance</dt>
            <dd className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {PORTAL_REQUIRED_LABELS[role] || 'Authorized Role'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">Current Role</dt>
            <dd className="text-xs font-bold text-red-600 dark:text-red-400">
              {ROLE_USER_LABELS[current.role] || current.role}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setShowDashboardSelector(true)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-coral-strong focus-visible:ring-2 focus-visible:ring-coral focus-visible:outline-none cursor-pointer"
          >
            <KeyRound className="size-4" aria-hidden="true" />
            <span>Switch Workspace</span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <span>Sign Out & Log In to Different Account</span>
            <ArrowRight className="size-3" />
          </button>
        </div>
      </section>
    </div>
  )
}

export function ForbiddenModal() {
  const { forbidden, dismissForbidden, setSession, setShowDashboardSelector } = useGrid()

  useEffect(() => {
    if (!forbidden) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissForbidden()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [forbidden, dismissForbidden])

  return (
    <AnimatePresence>
      {forbidden && (
        <motion.div
          className="absolute inset-0 z-[70] flex items-end bg-slate-900/40 p-3 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismissForbidden}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="forbidden-title"
            aria-describedby="forbidden-desc"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full rounded-[30px] bg-card p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={dismissForbidden}
              aria-label="Close"
              className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-5" aria-hidden="true" />
            </button>

            <span className="grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <ShieldAlert className="size-7" aria-hidden="true" />
            </span>
            <h2 id="forbidden-title" className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-slate-50">
              Access Restricted
            </h2>
            <p id="forbidden-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your account does not have permission to execute this clinical action. Please verify your workspace credentials.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  dismissForbidden()
                  setShowDashboardSelector(true)
                }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-sm font-bold text-white transition-colors hover:bg-coral-strong cursor-pointer"
              >
                <KeyRound className="size-4" aria-hidden="true" />
                <span>Switch Workspace</span>
              </button>
              <button
                type="button"
                onClick={dismissForbidden}
                className="rounded-2xl border py-3 text-sm font-semibold hover:bg-muted cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
