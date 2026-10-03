'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ExternalLink, FlaskConical, KeyRound, Loader2, Lock, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { useGridPost } from '@/hooks/use-grid-post'
import { API_BASE } from '@/lib/hemo-api'
import { CREDENTIALS, CREDENTIAL_LIST, PORTAL_ACCESS, type AuthRole, type Portal } from '@/lib/hemo-auth'
import { useGrid } from './grid-store'

const LOGIN_URLS: Record<Portal, string> = {
  hospital: '/login/icu',
  donor: '/login/donor',
  driver: '/login/driver',
}

export function SessionBar() {
  const { session, setSession, role, notify } = useGrid()
  const targetLoginUrl = LOGIN_URLS[role] || '/login'

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-slate-100 px-3 py-1.5 dark:bg-slate-900">
      <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        <FlaskConical className="size-3.5" aria-hidden="true" />
        Session
      </span>

      <Link
        href={targetLoginUrl}
        className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-card px-2 py-0.5 text-[11px] font-bold text-coral hover:border-coral transition-colors dark:border-slate-700"
      >
        <KeyRound className="size-3" />
        <span>{role === 'hospital' ? 'ICU' : role === 'donor' ? 'Donor' : 'Driver'} Login</span>
      </Link>

      <label htmlFor="session-select" className="sr-only">
        Logged-in credentials
      </label>
      <select
        id="session-select"
        value={session}
        onChange={(e) => {
          const next = e.target.value as AuthRole
          setSession(next)
          notify(`Signed in as ${CREDENTIALS[next].label} (#${CREDENTIALS[next].token})`, 'info')
        }}
        className="ml-auto min-w-0 rounded-full border border-slate-300 bg-card px-2.5 py-1 text-xs font-semibold text-slate-900 focus-visible:ring-2 focus-visible:ring-coral focus-visible:outline-none dark:border-slate-700 dark:text-slate-100"
      >
        {CREDENTIAL_LIST.map((c) => (
          <option key={c.role} value={c.role}>
            {`${c.role} • #${c.token}`}
          </option>
        ))}
      </select>
    </div>
  )
}

export function AuthBanner({ session }: { session: AuthRole }) {
  const credential = CREDENTIALS[session]
  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-emerald-50 px-4 py-2 dark:bg-emerald-950/40">
      <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      <p className="min-w-0 text-xs leading-snug font-semibold text-emerald-900 dark:text-emerald-200">
        {credential.badge}{' '}
        <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">{`(Auth Token: #${credential.token})`}</span>
      </p>
    </div>
  )
}

export function AccessDenied() {
  const { role, session, setSession } = useGrid()
  const portal = PORTAL_ACCESS[role]
  const required = CREDENTIALS[portal.required]
  const current = CREDENTIALS[session]
  const { trigger, isLoading } = useGridPost<{ portal: string }, { granted: boolean }>(portal.probePath)
  const dedicatedLoginUrl = LOGIN_URLS[role]

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
          🔒 Restricted Access
        </h2>
        <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-slate-300">{portal.denial}</p>

        <dl className="mt-5 flex flex-col gap-2 rounded-2xl bg-slate-100 p-4 text-sm dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">Required</dt>
            <dd className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{portal.required}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">Current session</dt>
            <dd className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{`${current.role} • #${current.token}`}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-col gap-2.5">
          <Link
            href={dedicatedLoginUrl}
            className="flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-coral-strong focus-visible:ring-2 focus-visible:ring-coral focus-visible:outline-none"
          >
            <KeyRound className="size-4" aria-hidden="true" />
            {`Go to ${role === 'hospital' ? 'ICU' : role === 'donor' ? 'Donor' : 'Driver'} Login Page`}
          </Link>

          <button
            type="button"
            onClick={() => setSession(portal.required)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-coral focus-visible:outline-none dark:bg-slate-100 dark:text-slate-900"
          >
            <KeyRound className="size-4" aria-hidden="true" />
            {`Quick Switch to ${required.label}`}
          </button>

          <Link
            href="/login"
            className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
          >
            <span>View All 3 Role Login Portals</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </section>
    </div>
  )
}

export function ForbiddenModal() {
  const { forbidden, dismissForbidden, setSession } = useGrid()

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
              className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-muted"
            >
              <X className="size-5" aria-hidden="true" />
            </button>

            <span className="grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <ShieldAlert className="size-7" aria-hidden="true" />
            </span>
            <p className="mt-4 font-mono text-xs font-bold text-red-600 dark:text-red-400">HTTP 403</p>
            <h2 id="forbidden-title" className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-50">
              Forbidden
            </h2>
            <p id="forbidden-desc" className="mt-2 text-base leading-relaxed text-muted-foreground">
              {`Token #${CREDENTIALS[forbidden.session].token} (${forbidden.session}) is not authorized for this route.`}
            </p>

            <div className="mt-4 rounded-2xl bg-slate-100 p-4 font-mono text-xs leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <p className="break-all">{`POST ${API_BASE}${forbidden.path}`}</p>
              <p>{`Authorization: Bearer ${CREDENTIALS[forbidden.session].token}`}</p>
              {forbidden.required && <p className="text-red-600 dark:text-red-400">{`Required scope: ${forbidden.required}`}</p>}
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {forbidden.required && (
                <button
                  type="button"
                  onClick={() => {
                    setSession(forbidden.required!)
                    dismissForbidden()
                  }}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-base font-bold text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  <KeyRound className="size-5" aria-hidden="true" />
                  {`Switch to ${CREDENTIALS[forbidden.required].label}`}
                </button>
              )}
              <button
                type="button"
                onClick={dismissForbidden}
                className="rounded-2xl border py-4 text-base font-semibold hover:bg-muted"
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
