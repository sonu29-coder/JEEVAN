'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bike,
  Droplets,
  Hospital,
  Shield,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { GoogleAuthButton } from '@/components/hemo/google-auth-button'
import { DEMO_USERS, loginUser, type Portal } from '@/lib/hemo-auth'

export default function LoginPage() {
  const router = useRouter()
  const [quickLogging, setQuickLogging] = useState<Portal | null>(null)
  const [authMsg, setAuthMsg] = useState('')

  const handleQuickDemoLogin = async (portal: Portal) => {
    setQuickLogging(portal)
    const user = DEMO_USERS[portal][0]
    try {
      await loginUser(portal, user.email, user.defaultPassword)
      setTimeout(() => {
        router.push(`/?role=${portal}`)
      }, 400)
    } finally {
      setQuickLogging(null)
    }
  }

  const ROLES = [
    {
      id: 'hospital' as Portal,
      name: 'ICU Hospital Portal',
      subtitle: 'Physicians & Surgeons',
      icon: Hospital,
      badge: 'NABH Node',
      bgIcon: 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400',
      loginUrl: '/login/icu',
      user: 'Dr. Rajesh Nair, MD',
    },
    {
      id: 'donor' as Portal,
      name: 'Blood Donor Portal',
      subtitle: 'Voluntary Life Savers',
      icon: Droplets,
      badge: 'Life Saver',
      bgIcon: 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
      loginUrl: '/login/donor',
      user: 'Sneha Menon (O-)',
    },
    {
      id: 'driver' as Portal,
      name: 'Logistics Driver Portal',
      subtitle: 'Rapid Cold-Chain Riders',
      icon: Bike,
      badge: 'Cold Chain',
      bgIcon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
      loginUrl: '/login/driver',
      user: 'Swift Rider #42',
    },
  ]

  return (
    <div className="min-h-dvh w-full bg-muted sm:py-6 flex items-center justify-center">
      <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background sm:h-[min(920px,calc(100dvh-3rem))] sm:rounded-[36px] sm:border sm:shadow-xl">
        {/* Top Header */}
        <header className="z-30 shrink-0 border-b bg-background px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="grid size-9 place-items-center rounded-xl border bg-card text-foreground transition-colors hover:bg-muted"
              aria-label="Back to home"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-coral flex items-center gap-1.5">
                <Shield className="size-3.5" />
                Auth Gateway
              </p>
              <p className="text-xs text-muted-foreground font-medium">Select your portal</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-muted px-2.5 py-0.5 rounded-full border">
            <ShieldCheck className="size-3 text-emerald-500" />
            RBAC
          </span>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar p-5 flex flex-col justify-between">
          <div>
            <div className="text-center mb-4">
              <h1 className="text-xl font-black text-foreground tracking-tight">
                Sign in to JEEVAN
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dedicated login portals for emergency operations
              </p>
            </div>

            {/* Google / Gmail Sign In */}
            <GoogleAuthButton
              portal="hospital"
              className="mb-3"
              onSuccess={(msg) => {
                setAuthMsg(msg)
                setTimeout(() => router.push('/?role=hospital'), 400)
              }}
              onError={(err) => setAuthMsg(err)}
            />

            {/* Divider */}
            <div className="relative flex items-center justify-center my-3">
              <div className="w-full border-t border-border" />
              <span className="absolute bg-background px-2 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                or choose portal
              </span>
            </div>

            {/* 3 Portal Cards */}
            <div className="space-y-2.5">
              {ROLES.map((r) => {
                const Icon = r.icon
                const isQuickLog = quickLogging === r.id
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-border bg-card p-3.5 shadow-xs hover:border-coral/40 transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`grid size-11 place-items-center rounded-xl shrink-0 ${r.bgIcon}`}>
                        <Icon className="size-5.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h2 className="text-sm font-bold text-foreground">{r.name}</h2>
                          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {r.badge}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                      <Link
                        href={r.loginUrl}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-ink py-2 text-xs font-bold text-white hover:bg-ink/90 transition-colors"
                      >
                        <span>Open Login Page</span>
                        <ArrowRight className="size-3" />
                      </Link>
                      <button
                        type="button"
                        disabled={isQuickLog}
                        onClick={() => handleQuickDemoLogin(r.id)}
                        className="flex items-center justify-center gap-1 rounded-xl border border-border bg-muted/60 px-2.5 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        title={`1-Click Demo Login as ${r.user}`}
                      >
                        <Sparkles className="size-3 text-coral" />
                        <span>{isQuickLog ? '...' : 'Demo'}</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer Info */}
          <div className="pt-4 border-t border-border mt-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              Kerala State Emergency Blood Transmission Grid • Thrissur
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
