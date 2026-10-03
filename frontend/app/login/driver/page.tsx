'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bike,
  CheckCircle2,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  ThermometerSnowflake,
} from 'lucide-react'
import { GoogleAuthButton } from '@/components/hemo/google-auth-button'
import { DEMO_USERS, loginUser } from '@/lib/hemo-auth'

export default function DriverLoginPage() {
  const router = useRouter()
  const demoDriver = DEMO_USERS.driver[0] // Arun Kumar

  const [identifier, setIdentifier] = useState(demoDriver.email)
  const [password, setPassword] = useState(demoDriver.defaultPassword)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setIsLoading(true)

    try {
      const res = await loginUser('driver', identifier, password)
      if (res.success) {
        setSuccessMsg(res.message)
        setTimeout(() => {
          router.push('/?role=driver')
        }, 500)
      } else {
        setErrorMsg(res.message)
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication failed. Please verify credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  const fillDemoCredentials = () => {
    setIdentifier(demoDriver.email)
    setPassword(demoDriver.defaultPassword)
    setErrorMsg('')
  }

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
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Bike className="size-3.5" />
                Logistics Hub
              </p>
              <p className="text-xs text-muted-foreground font-medium">Rapid Transit Couriers</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 px-2 py-0.5 rounded-full">
            <ThermometerSnowflake className="size-3" />
            3.8°C Cold Box
          </span>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar p-5 flex flex-col justify-between">
          <div>
            {/* Title Badge */}
            <div className="flex items-center gap-3 mb-4">
              <div className="grid size-12 place-items-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20 shrink-0">
                <Bike className="size-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-foreground tracking-tight leading-tight">
                  Courier Driver Sign-In
                </h1>
                <p className="text-xs text-muted-foreground">Cold-chain medical transit rider</p>
              </div>
            </div>

            {/* Real Google / Gmail Authentication Component */}
            <GoogleAuthButton
              portal="driver"
              className="mb-3"
              onSuccess={(msg) => {
                setSuccessMsg(msg)
                setTimeout(() => router.push('/?role=driver'), 500)
              }}
              onError={(err) => setErrorMsg(err)}
            />

            {/* Divider */}
            <div className="relative flex items-center justify-center my-3">
              <div className="w-full border-t border-border" />
              <span className="absolute bg-background px-2 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                or courier credentials
              </span>
            </div>

            {/* Instant Demo Fill Banner */}
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30 p-3 mb-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="size-3.5 shrink-0" />
                  <span>Verified Courier Fleet</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {demoDriver.name} • #{demoDriver.token}
                </p>
              </div>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
              >
                Auto-Fill
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label htmlFor="driver-email" className="block text-xs font-semibold text-foreground mb-1">
                  Courier Email / Rider Badge ID
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <Mail className="size-4" />
                  </div>
                  <input
                    id="driver-email"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. driver.arun@gmail.com"
                    className="w-full rounded-2xl border border-border bg-card pl-9 pr-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="driver-password" className="text-xs font-semibold text-foreground">
                    Password
                  </label>
                  <span className="text-[10px] text-muted-foreground font-mono">DriverPassword2026!</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <Lock className="size-4" />
                  </div>
                  <input
                    id="driver-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-2xl border border-border bg-card pl-9 pr-10 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              {/* Messages */}
              <AnimatePresence>
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-600 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400 flex items-center gap-2"
                  >
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </motion.div>
                )}
                {successMsg && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-2"
                  >
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>{successMsg}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
              >
                {isLoading ? (
                  <Activity className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                <span>{isLoading ? 'Verifying Rider Fleet...' : 'Sign In as Delivery Partner'}</span>
              </button>
            </form>
          </div>

          {/* Switch Role Links Footer */}
          <div className="pt-4 border-t border-border mt-4 text-center">
            <p className="text-[11px] text-muted-foreground mb-2">Switch to a different portal:</p>
            <div className="flex items-center justify-center gap-2">
              <Link
                href="/login/icu"
                className="text-xs font-bold text-coral hover:underline flex items-center gap-1"
              >
                <span>🏥 ICU Login</span>
              </Link>
              <span className="text-muted-foreground text-xs">•</span>
              <Link
                href="/login/donor"
                className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
              >
                <span>🩸 Donor Login</span>
              </Link>
              <span className="text-muted-foreground text-xs">•</span>
              <Link href="/login" className="text-xs font-bold text-foreground hover:underline">
                <span>All</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
